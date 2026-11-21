package com.vnexsolar.app.feature.maintenance

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.network.MaintenanceScheduleRecordDto
import com.vnexsolar.app.core.network.QrAssetWorkspaceResponseDto
import com.vnexsolar.app.core.network.ServiceTicketRecordDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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
data class MaintenanceNoteSyncPayload(
    val serviceTicketId: String,
    val qrCodeToken: String,
    val note: String,
    val actionsTaken: String,
)

data class MaintenanceWarrantyUiState(
    val serviceTicketId: String = UUID.randomUUID().toString(),
    val qrCodeToken: String = "VNEX-QR-CERT-0001-HW100K",
    val fieldFindings: String = "MC4 terminal cleaned and inverter fan intake cleared",
    val actionsTaken: String = "Verified DC string Voc balance and logged preventive visit",
    val isLookingUpQr: Boolean = false,
    val lookedUpAsset: QrAssetWorkspaceResponseDto? = null,
    val recentTickets: List<ServiceTicketRecordDto> = emptyList(),
    val recentSchedules: List<MaintenanceScheduleRecordDto> = emptyList(),
    val queuedNotesCount: Int = 0,
    val statusMessage: String? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class MaintenanceWarrantyViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MaintenanceWarrantyUiState())
    val uiState: StateFlow<MaintenanceWarrantyUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    init {
        refreshWorkspace()
    }

    fun updateQrCodeToken(value: String) {
        _uiState.update { it.copy(qrCodeToken = value, errorMessage = null) }
    }

    fun updateFieldFindings(value: String) {
        _uiState.update { it.copy(fieldFindings = value) }
    }

    fun updateActionsTaken(value: String) {
        _uiState.update { it.copy(actionsTaken = value) }
    }

    fun refreshWorkspace() {
        viewModelScope.launch {
            val tickets = runCatching { workspaceApiService.listMaintenanceTickets().tickets }.getOrDefault(emptyList())
            val schedules = runCatching { workspaceApiService.listMaintenanceSchedules().schedules }.getOrDefault(emptyList())
            _uiState.update { prev ->
                prev.copy(
                    recentTickets = tickets,
                    recentSchedules = schedules,
                    serviceTicketId = tickets.firstOrNull()?.id ?: prev.serviceTicketId,
                )
            }
        }
    }

    fun onQrBarcodeScanned(rawValue: String) {
        val normalized = rawValue.trim()
        _uiState.update { it.copy(qrCodeToken = normalized, errorMessage = null) }
        lookupQrAsset(normalized)
    }

    fun lookupQrAsset(tokenOverride: String? = null) {
        val token = (tokenOverride ?: _uiState.value.qrCodeToken).trim()
        if (token.isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Enter or scan an asset QR token first.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLookingUpQr = true, errorMessage = null, statusMessage = null) }
            runCatching {
                workspaceApiService.lookupQrAsset(token)
            }.onSuccess { result ->
                _uiState.update { prev ->
                    prev.copy(
                        isLookingUpQr = false,
                        lookedUpAsset = result,
                        serviceTicketId = result.tickets.firstOrNull()?.id ?: prev.serviceTicketId,
                        statusMessage = "QR matched: ${result.asset.sku} (${result.asset.serialNumber})",
                    )
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(
                        isLookingUpQr = false,
                        errorMessage = ex.message ?: "QR asset not found or device offline.",
                    )
                }
            }
        }
    }

    fun queueMaintenanceNoteOffline(
        organizationId: String = "default-org",
        deviceId: String = "android-field-01",
    ) {
        val current = _uiState.value
        val noteId = UUID.randomUUID().toString()
        val payload = MaintenanceNoteSyncPayload(
            serviceTicketId = current.serviceTicketId,
            qrCodeToken = current.qrCodeToken.trim(),
            note = current.fieldFindings.trim(),
            actionsTaken = current.actionsTaken.trim(),
        )
        viewModelScope.launch {
            val resolvedOrg = sessionVault.currentSession?.organizationId?.takeIf { it.isNotBlank() } ?: organizationId
            val resolvedDevice = runCatching { appPreferences.getOrCreateDeviceId() }.getOrElse { deviceId }
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = resolvedOrg,
                entityType = "maintenance_note",
                entityId = noteId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, resolvedOrg, resolvedDevice)
            _uiState.update {
                it.copy(
                    queuedNotesCount = it.queuedNotesCount + 1,
                    statusMessage = "Queued maintenance_note ($noteId) for offline WorkManager sync.",
                )
            }
        }
    }
}
