package com.vnexsolar.app.feature.surveys

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.SiteSurveyEntity
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
data class RoofSectionDraft(
    val id: String = UUID.randomUUID().toString(),
    val sectionName: String,
    val roofType: String,
    val usableAreaM2: Double,
    val tiltDegrees: Double,
    val azimuthDegrees: Double,
    val shadingFactorPct: Double,
)

@Serializable
data class LoadItemDraft(
    val id: String = UUID.randomUUID().toString(),
    val applianceName: String,
    val quantity: Int,
    val ratedPowerW: Double,
    val dailyHours: Double,
    val isCriticalBackupLoad: Boolean,
)

@Serializable
data class SurveyPayloadJson(
    val projectId: String,
    val ambientMinTempC: Double,
    val ambientMaxTempC: Double,
    val earthingAvailable: Boolean,
    val notes: String,
    val roofSections: List<RoofSectionDraft>,
    val loadProfiles: List<LoadItemDraft>,
)

data class SurveyUiState(
    val surveyId: String = UUID.randomUUID().toString(),
    val projectId: String = "",
    val siteId: String = "",
    val ambientMinTempC: String = "4",
    val ambientMaxTempC: String = "47",
    val earthingAvailable: Boolean = true,
    val notes: String = "",
    val roofSections: List<RoofSectionDraft> = emptyList(),
    val loadItems: List<LoadItemDraft> = emptyList(),
    val queuedPhotoCount: Int = 0,
    val lastSavedMessage: String? = null,
)

@HiltViewModel
class SiteSurveyViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SurveyUiState())
    val uiState: StateFlow<SurveyUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun addRoofSection(section: RoofSectionDraft) {
        _uiState.update { it.copy(roofSections = it.roofSections + section) }
    }

    fun addLoadItem(item: LoadItemDraft) {
        _uiState.update { it.copy(loadItems = it.loadItems + item) }
    }

    fun updateNotes(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun toggleEarthing(available: Boolean) {
        _uiState.update { it.copy(earthingAvailable = available) }
    }

    fun queueCapturedPhoto(
        organizationId: String,
        localFilePath: String,
        jpegBytes: ByteArray,
    ) {
        val currentSurveyId = _uiState.value.surveyId
        viewModelScope.launch {
            offlineRepository.enqueueMediaAttachment(
                organizationId = organizationId,
                entityType = "site_survey",
                entityId = currentSurveyId,
                localFilePath = localFilePath,
                mimeType = "image/jpeg",
                fileBytes = jpegBytes,
            )
            _uiState.update {
                it.copy(
                    queuedPhotoCount = it.queuedPhotoCount + 1,
                    lastSavedMessage = "Photo hashed (SHA-256) and queued for upload",
                )
            }
        }
    }

    fun saveSurveyOffline(organizationId: String, surveyorUserId: String, deviceId: String) {
        val state = _uiState.value
        val now = System.currentTimeMillis()
        val payload = SurveyPayloadJson(
            projectId = state.projectId,
            ambientMinTempC = state.ambientMinTempC.toDoubleOrNull() ?: 5.0,
            ambientMaxTempC = state.ambientMaxTempC.toDoubleOrNull() ?: 46.0,
            earthingAvailable = state.earthingAvailable,
            notes = state.notes,
            roofSections = state.roofSections,
            loadProfiles = state.loadItems,
        )

        val entity = SiteSurveyEntity(
            id = state.surveyId,
            organizationId = organizationId,
            projectId = state.projectId,
            siteId = state.siteId,
            surveyorUserId = surveyorUserId,
            surveyStatus = "draft",
            ambientMinTempC = payload.ambientMinTempC,
            ambientMaxTempC = payload.ambientMaxTempC,
            earthingAvailable = payload.earthingAvailable,
            notes = payload.notes,
            rowVersion = 1,
            syncState = "PENDING",
            updatedAtEpochMs = now,
        )

        viewModelScope.launch {
            offlineRepository.saveSiteSurveyOffline(
                organizationId = organizationId,
                survey = entity,
                operationType = "create",
                payloadJson = Json.encodeToString(payload),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(lastSavedMessage = "Saved to Room SQLite & queued in sync outbox")
            }
        }
    }
}
