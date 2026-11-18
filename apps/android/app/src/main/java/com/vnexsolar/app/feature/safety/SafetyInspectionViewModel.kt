package com.vnexsolar.app.feature.safety

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
data class InspectionChecklistDraftItem(
    val checkCode: String,
    val description: String,
    val result: String,
    val notes: String? = null,
)

@Serializable
data class InspectionTestReadingDraft(
    val parameterName: String,
    val measuredValue: Double,
    val unit: String,
    val withinTolerance: Boolean,
)

@Serializable
data class InspectionDraftSyncPayload(
    val installationJobId: String,
    val workingAtHeightVerified: Boolean,
    val electricalIsolationVerified: Boolean,
    val ppeVerified: Boolean,
    val items: List<InspectionChecklistDraftItem>,
    val testReadings: List<InspectionTestReadingDraft>,
)

data class SafetyInspectionUiState(
    val inspectionId: String = UUID.randomUUID().toString(),
    val installationJobId: String = UUID.randomUUID().toString(),
    val workingAtHeightVerified: Boolean = true,
    val electricalIsolationVerified: Boolean = false,
    val ppeVerified: Boolean = false,
    val earthResistanceOhms: String = "1.8",
    val insulationResistanceMOhm: String = "450.0",
    val rcdTripTimeMs: String = "24.0",
    val checkItems: List<InspectionChecklistDraftItem> = listOf(
        InspectionChecklistDraftItem("IEC-01", "PV array DC polarity & Voc match nameplate limits", "pass"),
        InspectionChecklistDraftItem("IEC-02", "Class II DC/AC SPD grounded cleanly (< 5 Ohm)", "pass"),
        InspectionChecklistDraftItem("IEC-03", "LOTO lockouts, PPE harness & DC isolator labels installed", "pass"),
    ),
    val queuedPhotoCount: Int = 0,
    val statusMessage: String? = null,
)

@HiltViewModel
class SafetyInspectionViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SafetyInspectionUiState())
    val uiState: StateFlow<SafetyInspectionUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun togglePpeVerified(checked: Boolean) {
        _uiState.update { it.copy(ppeVerified = checked) }
    }

    fun toggleElectricalIsolation(checked: Boolean) {
        _uiState.update { it.copy(electricalIsolationVerified = checked) }
    }

    fun toggleWorkingAtHeight(checked: Boolean) {
        _uiState.update { it.copy(workingAtHeightVerified = checked) }
    }

    fun updateEarthResistance(value: String) {
        _uiState.update { it.copy(earthResistanceOhms = value) }
    }

    fun updateInsulationResistance(value: String) {
        _uiState.update { it.copy(insulationResistanceMOhm = value) }
    }

    fun toggleCheckItemResult(checkCode: String) {
        _uiState.update { state ->
            state.copy(
                checkItems = state.checkItems.map { item ->
                    if (item.checkCode == checkCode) {
                        val next = if (item.result == "pass") "fail" else "pass"
                        item.copy(result = next)
                    } else {
                        item
                    }
                },
            )
        }
    }

    fun queueSafetyEvidencePhoto(
        organizationId: String,
        localFilePath: String,
        jpegBytes: ByteArray,
    ) {
        val inspectionId = _uiState.value.inspectionId
        viewModelScope.launch {
            offlineRepository.enqueueMediaAttachment(
                organizationId = organizationId,
                entityType = "inspection_draft",
                entityId = inspectionId,
                localFilePath = localFilePath,
                mimeType = "image/jpeg",
                fileBytes = jpegBytes,
            )
            _uiState.update {
                it.copy(
                    queuedPhotoCount = it.queuedPhotoCount + 1,
                    statusMessage = "Safety evidence photo hashed (SHA-256) and queued for upload",
                )
            }
        }
    }

    fun queueInspectionDraftOffline(organizationId: String, deviceId: String) {
        val state = _uiState.value
        val earthVal = state.earthResistanceOhms.toDoubleOrNull() ?: 99.0
        val insVal = state.insulationResistanceMOhm.toDoubleOrNull() ?: 0.0
        val rcdVal = state.rcdTripTimeMs.toDoubleOrNull() ?: 40.0

        val payload = InspectionDraftSyncPayload(
            installationJobId = state.installationJobId,
            workingAtHeightVerified = state.workingAtHeightVerified,
            electricalIsolationVerified = state.electricalIsolationVerified,
            ppeVerified = state.ppeVerified,
            items = state.checkItems,
            testReadings = listOf(
                InspectionTestReadingDraft(
                    parameterName = "Earth Resistance",
                    measuredValue = earthVal,
                    unit = "ohm",
                    withinTolerance = earthVal <= 5.0,
                ),
                InspectionTestReadingDraft(
                    parameterName = "DC Insulation Resistance",
                    measuredValue = insVal,
                    unit = "MOhm",
                    withinTolerance = insVal >= 1.0,
                ),
                InspectionTestReadingDraft(
                    parameterName = "RCD Trip Time",
                    measuredValue = rcdVal,
                    unit = "ms",
                    withinTolerance = rcdVal <= 40.0,
                ),
            ),
        )

        viewModelScope.launch {
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "inspection_draft",
                entityId = state.inspectionId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(
                    statusMessage =
                        "Inspection draft & test readings queued in outbox (awaiting Safety Officer approval)",
                )
            }
        }
    }
}
