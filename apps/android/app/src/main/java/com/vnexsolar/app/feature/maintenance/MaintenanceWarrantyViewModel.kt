package com.vnexsolar.app.feature.maintenance

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
    val queuedNotesCount: Int = 0,
    val statusMessage: String? = null,
)

@HiltViewModel
class MaintenanceWarrantyViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MaintenanceWarrantyUiState())
    val uiState: StateFlow<MaintenanceWarrantyUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun updateQrCodeToken(value: String) {
        _uiState.update { it.copy(qrCodeToken = value) }
    }

    fun updateFieldFindings(value: String) {
        _uiState.update { it.copy(fieldFindings = value) }
    }

    fun updateActionsTaken(value: String) {
        _uiState.update { it.copy(actionsTaken = value) }
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
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "maintenance_note",
                entityId = noteId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(
                    queuedNotesCount = it.queuedNotesCount + 1,
                    statusMessage = "Queued maintenance_note ($noteId) for offline WorkManager sync.",
                )
            }
        }
    }
}
