package com.vnexsolar.app.feature.sync

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.MediaUploadQueueEntity
import com.vnexsolar.app.core.database.entity.SyncCheckpointEntity
import com.vnexsolar.app.core.database.entity.SyncConflictEntity
import com.vnexsolar.app.core.database.entity.SyncOutboxEntity
import com.vnexsolar.app.core.network.SyncApiService
import com.vnexsolar.app.core.network.SyncDeadLetterDto
import com.vnexsolar.app.core.network.SyncHealthMetricsDto
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncCycleResult
import com.vnexsolar.app.core.sync.SyncEngine
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SyncTab(val label: String) {
    OUTBOX("Outbox & Status"),
    CONFLICTS("Conflicts"),
    MEDIA_METRICS("Media & Health"),
}

enum class OutboxStatusFilter(val label: String, val statuses: Set<String>?) {
    ALL("All", null),
    PENDING("Pending / Retry", setOf("PENDING", "IN_FLIGHT", "FAILED_RETRYABLE")),
    CONFLICT("Conflicts", setOf("CONFLICT")),
    REJECTED("Rejected", setOf("REJECTED")),
    APPLIED("Applied", setOf("APPLIED")),
}

data class SyncQueueUiState(
    val activeTab: SyncTab = SyncTab.OUTBOX,
    val statusFilter: OutboxStatusFilter = OutboxStatusFilter.ALL,
    val isSyncing: Boolean = false,
    val lastRunReport: SyncCycleResult? = null,
    val serverMetrics: SyncHealthMetricsDto? = null,
    val deadLetters: List<SyncDeadLetterDto> = emptyList(),
    val statusMessage: String? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class SyncQueueViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    private val syncEngine: SyncEngine,
    private val syncApiService: SyncApiService,
    private val appPreferences: AppPreferences,
    private val sessionVault: SessionVault,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(SyncQueueUiState())
    val uiState: StateFlow<SyncQueueUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val outboxItems: StateFlow<List<SyncOutboxEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeAllOutbox(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val pendingConflicts: StateFlow<List<SyncConflictEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observePendingConflicts(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val mediaQueue: StateFlow<List<MediaUploadQueueEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeMediaQueue(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val checkpoint: StateFlow<SyncCheckpointEntity?> =
        (if (orgId.isBlank()) flowOf(null) else offlineRepository.observeSyncCheckpoint(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        refreshServerDiagnostics()
    }

    fun selectTab(tab: SyncTab) {
        _uiState.update { it.copy(activeTab = tab, statusMessage = null, errorMessage = null) }
    }

    fun selectFilter(filter: OutboxStatusFilter) {
        _uiState.update { it.copy(statusFilter = filter) }
    }

    fun syncNow() {
        val currentOrg = orgId
        if (currentOrg.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true, statusMessage = null, errorMessage = null) }
            val deviceId = appPreferences.getOrCreateDeviceId()
            val report = syncEngine.runSyncCycle(organizationId = currentOrg, deviceId = deviceId)
            if (report.succeeded) {
                refreshServerDiagnostics()
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        lastRunReport = report,
                        statusMessage = "Synced · ${report.appliedCount} applied, ${report.mediaVerifiedCount} media verified, ${report.deltaChangesApplied} delta(s) · seq #${report.latestServerSeq}",
                    )
                }
            } else {
                SyncWorker.enqueueOneTime(appContext, currentOrg, deviceId)
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        lastRunReport = report,
                        errorMessage = "Sync deferred to WorkManager exponential backoff · ${report.errorMessage ?: "Offline"}",
                    )
                }
            }
        }
    }

    fun retryOperationNow(syncOperationId: String) {
        viewModelScope.launch {
            offlineRepository.retryOutboxOperationNow(syncOperationId)
            syncNow()
        }
    }

    fun clearAppliedHistory() {
        if (orgId.isBlank()) return
        viewModelScope.launch {
            val removed = offlineRepository.clearAppliedOutbox(orgId)
            _uiState.update { it.copy(statusMessage = "Cleared $removed applied outbox record(s).") }
        }
    }

    fun resolveConflict(conflict: SyncConflictEntity, acceptClientMerge: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true, errorMessage = null) }
            try {
                val decision = if (acceptClientMerge) "merge_client" else "accept_server"
                syncEngine.resolveConflict(conflict, decision)
                refreshServerDiagnostics()
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        statusMessage = "Conflict resolved (${if (acceptClientMerge) "Client Merged" else "Server Kept"}).",
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isSyncing = false,
                        errorMessage = ex.message ?: "Unable to resolve conflict offline.",
                    )
                }
            }
        }
    }

    fun acknowledgeDeadLetter(deadLetterId: String) {
        viewModelScope.launch {
            try {
                syncApiService.acknowledgeDeadLetter(deadLetterId)
                refreshServerDiagnostics()
                _uiState.update { it.copy(statusMessage = "Acknowledged dead-letter record.") }
            } catch (ex: Exception) {
                _uiState.update { it.copy(errorMessage = ex.message ?: "Unable to acknowledge dead-letter.") }
            }
        }
    }

    fun refreshServerDiagnostics() {
        viewModelScope.launch {
            val metrics = runCatching { syncApiService.getMetrics() }.getOrNull()
            val deadLetters = runCatching { syncApiService.listDeadLetters(includeAcknowledged = false).deadLetters }.getOrDefault(emptyList())
            _uiState.update {
                it.copy(
                    serverMetrics = metrics ?: it.serverMetrics,
                    deadLetters = deadLetters,
                )
            }
        }
    }

    companion object {
        private val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.US)

        fun formatEpochTimestamp(epochMs: Long?): String {
            if (epochMs == null || epochMs <= 0L) return "Never synced"
            return formatter.format(Instant.ofEpochMilli(epochMs).atZone(ZoneId.systemDefault()))
        }
    }
}
