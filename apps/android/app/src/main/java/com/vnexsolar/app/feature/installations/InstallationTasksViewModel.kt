package com.vnexsolar.app.feature.installations

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class InstallationChecklistTaskUi(
    val id: String,
    val installationJobId: String,
    val title: String,
    val status: String,
    val rowVersion: Int,
)

@Serializable
data class InstallationTaskSyncPayload(
    val installationJobId: String,
    val status: String,
    val baseRowVersion: Int,
)

@Serializable
data class DailySiteLogSyncPayload(
    val installationJobId: String,
    val logDate: String,
    val weatherConditions: String?,
    val workSummary: String,
)

data class InstallationTasksUiState(
    val jobId: String = UUID.randomUUID().toString(),
    val jobCode: String = "JOB-0001",
    val safetyCleared: Boolean = false,
    val tasks: List<InstallationChecklistTaskUi> = listOf(
        InstallationChecklistTaskUi(
            id = UUID.randomUUID().toString(),
            installationJobId = "",
            title = "Verify roof layout, structural anchors & waterproofing seals",
            status = "pending",
            rowVersion = 1,
        ),
        InstallationChecklistTaskUi(
            id = UUID.randomUUID().toString(),
            installationJobId = "",
            title = "Assemble mounting rails, torque clamps & equipotential earthing",
            status = "pending",
            rowVersion = 1,
        ),
        InstallationChecklistTaskUi(
            id = UUID.randomUUID().toString(),
            installationJobId = "",
            title = "Mount inverter enclosure, DC/AC surge arrestors & isolation breakers",
            status = "pending",
            rowVersion = 1,
        ),
        InstallationChecklistTaskUi(
            id = UUID.randomUUID().toString(),
            installationJobId = "",
            title = "Pull solar DC XLPO strings, crimp MC4 connectors & label conduits",
            status = "pending",
            rowVersion = 1,
        ),
    ),
    val weatherConditions: String = "Clear sky, 32 C",
    val workSummary: String = "",
    val queuedPhotoCount: Int = 0,
    val statusMessage: String? = null,
)

@HiltViewModel
class InstallationTasksViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InstallationTasksUiState())
    val uiState: StateFlow<InstallationTasksUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun updateWeatherConditions(value: String) {
        _uiState.update { it.copy(weatherConditions = value) }
    }

    fun updateWorkSummary(value: String) {
        _uiState.update { it.copy(workSummary = value) }
    }

    fun advanceTaskStatusOffline(
        organizationId: String,
        deviceId: String,
        taskId: String,
        nextStatus: String,
    ) {
        val currentState = _uiState.value
        val target = currentState.tasks.firstOrNull { it.id == taskId } ?: return
        val payload = InstallationTaskSyncPayload(
            installationJobId = currentState.jobId,
            status = nextStatus,
            baseRowVersion = target.rowVersion,
        )

        viewModelScope.launch {
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "installation_task",
                entityId = target.id,
                operationType = "update",
                baseRowVersion = target.rowVersion,
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update { state ->
                state.copy(
                    tasks = state.tasks.map { item ->
                        if (item.id == taskId) {
                            item.copy(status = nextStatus, rowVersion = item.rowVersion + 1)
                        } else {
                            item
                        }
                    },
                    statusMessage = "Task updated to $nextStatus & queued in offline sync outbox",
                )
            }
        }
    }

    fun submitDailySiteLogOffline(organizationId: String, deviceId: String) {
        val currentState = _uiState.value
        val summary = currentState.workSummary.trim()
        if (summary.length < 3) {
            _uiState.update { it.copy(statusMessage = "Enter at least 3 characters for the site diary summary.") }
            return
        }
        val logId = UUID.randomUUID().toString()
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val payload = DailySiteLogSyncPayload(
            installationJobId = currentState.jobId,
            logDate = today,
            weatherConditions = currentState.weatherConditions.trim().ifEmpty { null },
            workSummary = summary,
        )

        viewModelScope.launch {
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "installation_task",
                entityId = logId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(
                    workSummary = "",
                    statusMessage = "Daily site log queued for sync ($today)",
                )
            }
        }
    }

    fun queueInstallationPhoto(
        organizationId: String,
        localFilePath: String,
        jpegBytes: ByteArray,
    ) {
        val jobId = _uiState.value.jobId
        viewModelScope.launch {
            offlineRepository.enqueueMediaAttachment(
                organizationId = organizationId,
                entityType = "installation_job",
                entityId = jobId,
                localFilePath = localFilePath,
                mimeType = "image/jpeg",
                fileBytes = jpegBytes,
            )
            _uiState.update {
                it.copy(
                    queuedPhotoCount = it.queuedPhotoCount + 1,
                    statusMessage = "Installation photo hashed (SHA-256) and queued for upload",
                )
            }
        }
    }
}
