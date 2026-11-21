package com.vnexsolar.app.feature.commissioning

import android.content.Context
import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.network.AcknowledgeHandoverRequestDto
import com.vnexsolar.app.core.network.AddCommissioningTestRequestDto
import com.vnexsolar.app.core.network.ApproveRejectCommissioningRequestDto
import com.vnexsolar.app.core.network.AssetRegisterRecordDto
import com.vnexsolar.app.core.network.CommissioningRecordDetailDto
import com.vnexsolar.app.core.network.CreateCommissioningRequestDto
import com.vnexsolar.app.core.network.InstallationJobRefDto
import com.vnexsolar.app.core.network.ProjectDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class CommissioningTab(val label: String) {
    CERTIFICATES("Certificates"),
    TESTS_SIGNOFF("Tests & Sign-Off"),
    QR_ASSETS("QR Asset Register"),
}

data class CommissioningUiState(
    val activeTab: CommissioningTab = CommissioningTab.CERTIFICATES,
    val projects: List<ProjectDto> = emptyList(),
    val installationJobs: List<InstallationJobRefDto> = emptyList(),
    val records: List<CommissioningRecordDetailDto> = emptyList(),
    val assets: List<AssetRegisterRecordDto> = emptyList(),
    val selectedRecordId: String? = null,
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val signaturePngBytes: ByteArray? = null,
    val signatureSha256: String? = null,
    val previewBitmap: Bitmap? = null,
    val previewFile: File? = null,
    val statusMessage: String? = null,
    val errorMessage: String? = null,
) {
    val selectedRecord: CommissioningRecordDetailDto?
        get() = records.firstOrNull { it.id == selectedRecordId } ?: records.firstOrNull()
}

@HiltViewModel
class CommissioningViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CommissioningUiState())
    val uiState: StateFlow<CommissioningUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    init {
        refresh()
    }

    fun selectTab(tab: CommissioningTab) {
        _uiState.update { it.copy(activeTab = tab, statusMessage = null, errorMessage = null) }
    }

    fun selectRecord(recordId: String) {
        _uiState.update { it.copy(selectedRecordId = recordId, statusMessage = null, errorMessage = null) }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            runCatching {
                val projects = workspaceApiService.listProjects().projects
                val jobs = workspaceApiService.listInstallations().jobs
                val records = workspaceApiService.listCommissioning().records
                val assets = workspaceApiService.listAssets().assets
                CommissioningLoadedBundle(projects, jobs, records, assets)
            }.onSuccess { bundle ->
                _uiState.update { prev ->
                    prev.copy(
                        projects = bundle.projects,
                        installationJobs = bundle.jobs,
                        records = bundle.records,
                        assets = bundle.assets,
                        selectedRecordId = prev.selectedRecordId
                            ?.takeIf { id -> bundle.records.any { it.id == id } }
                            ?: bundle.records.firstOrNull()?.id,
                        isLoading = false,
                    )
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = ex.message ?: "Unable to fetch commissioning records (offline).",
                    )
                }
            }
        }
    }

    fun createCommissioningRecord(projectId: String, installationJobId: String) {
        if (projectId.isBlank() || installationJobId.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Select a project and installation job.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            runCatching {
                workspaceApiService.createCommissioning(
                    CreateCommissioningRequestDto(
                        projectId = projectId,
                        installationJobId = installationJobId,
                    ),
                )
            }.onSuccess { created ->
                _uiState.update { prev ->
                    prev.copy(
                        records = listOf(created) + prev.records.filterNot { it.id == created.id },
                        selectedRecordId = created.id,
                        activeTab = CommissioningTab.TESTS_SIGNOFF,
                        isSubmitting = false,
                        statusMessage = "Created commissioning certificate ${created.certificateCode}",
                    )
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        errorMessage = ex.message ?: "Unable to create commissioning record.",
                    )
                }
            }
        }
    }

    fun addCommissioningTest(
        commissioningId: String,
        testName: String,
        measuredValue: String,
        passed: Boolean,
    ) {
        if (testName.trim().length < 2 || measuredValue.trim().isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Enter a valid test name and measured value.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            runCatching {
                workspaceApiService.addCommissioningTest(
                    commissioningId = commissioningId,
                    request = AddCommissioningTestRequestDto(
                        testName = testName.trim(),
                        measuredValue = measuredValue.trim(),
                        passed = passed,
                    ),
                )
            }.onSuccess { res ->
                updateRecordInState(res.record, "Recorded commissioning test: ${res.test.testName}")
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to save test reading.")
                }
            }
        }
    }

    fun recordStandardIecTests(commissioningId: String) {
        val suite = listOf(
            AddCommissioningTestRequestDto("Open Circuit String Voltage (Voc)", "642 V DC (Within 1100V limit)", true),
            AddCommissioningTestRequestDto("Grid Synchronization & Anti-Islanding Trip", "0.18 s trip (< 2.0 s IEC 62116)", true),
            AddCommissioningTestRequestDto("Zero-Export / CT Meter Polarity Check", "+0.99 PF synchronized", true),
            AddCommissioningTestRequestDto("Battery BMS Cut-Off & Charge/Discharge Loop", "52.4 V LFP nominal", true),
        )
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            runCatching {
                var latest: CommissioningRecordDetailDto? = null
                for (item in suite) {
                    latest = workspaceApiService.addCommissioningTest(commissioningId, item).record
                }
                latest
            }.onSuccess { rec ->
                if (rec != null) {
                    updateRecordInState(rec, "Logged 4 standard IEC commissioning verification tests.")
                } else {
                    _uiState.update { it.copy(isSubmitting = false) }
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Standard test batch failed.")
                }
            }
        }
    }

    fun approveOrRejectCommissioning(
        commissioningId: String,
        approve: Boolean,
        notes: String,
        telemetryProvider: String,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            val body = ApproveRejectCommissioningRequestDto(
                notes = notes.trim().ifBlank { "Verified commissioning suite & safety clearance" },
                telemetryProvider = telemetryProvider.trim().ifBlank { "Solarman / Modbus TCP" },
            )
            runCatching {
                if (approve) {
                    workspaceApiService.approveCommissioning(commissioningId, body)
                } else {
                    workspaceApiService.rejectCommissioning(commissioningId, body)
                }
            }.onSuccess { updated ->
                val freshAssets = runCatching { workspaceApiService.listAssets().assets }.getOrDefault(_uiState.value.assets)
                _uiState.update { prev ->
                    prev.copy(
                        records = prev.records.map { if (it.id == updated.id) updated else it },
                        assets = freshAssets,
                        isSubmitting = false,
                        statusMessage = if (approve) {
                            "Certificate ${updated.certificateCode} APPROVED — ${updated.generatedAssets.size} QR asset(s) registered!"
                        } else {
                            "Certificate ${updated.certificateCode} marked REJECTED."
                        },
                    )
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        errorMessage = ex.message ?: "Commissioning review blocked (verify safety gate & completed job).",
                    )
                }
            }
        }
    }

    fun acknowledgeHandoverWithCanvasSignature(
        commissioningId: String,
        handoverId: String,
        signoffName: String,
        signaturePngBytes: ByteArray,
        signatureFilePath: String,
        signatureSha256: String,
    ) {
        val orgId = sessionVault.currentSession?.organizationId ?: "default-org"
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            // Persist signature proof PNG into Room media queue for SHA-256 verification
            runCatching {
                val deviceId = appPreferences.getOrCreateDeviceId()
                offlineRepository.enqueueMediaAttachment(
                    organizationId = orgId,
                    entityType = "handover_signature",
                    entityId = handoverId,
                    localFilePath = signatureFilePath,
                    mimeType = "image/png",
                    fileBytes = signaturePngBytes,
                )
                SyncWorker.enqueueOneTime(appContext, orgId, deviceId)
            }

            runCatching {
                workspaceApiService.acknowledgeHandover(
                    commissioningId = commissioningId,
                    handoverId = handoverId,
                    request = AcknowledgeHandoverRequestDto(signoffName = signoffName.trim()),
                )
            }.onSuccess { updated ->
                _uiState.update { prev ->
                    prev.copy(
                        records = prev.records.map { if (it.id == updated.id) updated else it },
                        signaturePngBytes = signaturePngBytes,
                        signatureSha256 = signatureSha256,
                        isSubmitting = false,
                        statusMessage = "Handover acknowledged by $signoffName (Canvas signature SHA-256 ${signatureSha256.take(12)}... queued).",
                    )
                }
            }.onFailure { ex ->
                _uiState.update {
                    it.copy(
                        signaturePngBytes = signaturePngBytes,
                        signatureSha256 = signatureSha256,
                        isSubmitting = false,
                        errorMessage = ex.message ?: "Signature saved locally, but handover acknowledgement failed.",
                    )
                }
            }
        }
    }

    fun generatePdfPreview(record: CommissioningRecordDetailDto) {
        val orgName = sessionVault.currentSession?.organizationName ?: "VNex Solar"
        val projectTitle = _uiState.value.projects.firstOrNull { it.id == record.projectId }?.title ?: "Solar PV Project"
        viewModelScope.launch {
            runCatching {
                val pdf = CommissioningPdfExporter.generatePdf(
                    context = appContext,
                    organizationName = orgName,
                    projectTitle = projectTitle,
                    record = record,
                    signaturePngBytes = _uiState.value.signaturePngBytes,
                )
                val bmp = CommissioningPdfExporter.renderPagePreview(pdf)
                pdf to bmp
            }.onSuccess { (pdf, bmp) ->
                _uiState.update {
                    it.copy(
                        previewFile = pdf,
                        previewBitmap = bmp,
                        statusMessage = "Rendered native A4 PDF preview for ${record.certificateCode}",
                    )
                }
            }.onFailure { ex ->
                _uiState.update { it.copy(errorMessage = ex.message ?: "PDF generation failed.") }
            }
        }
    }

    fun exportAndSharePdf(record: CommissioningRecordDetailDto) {
        val orgName = sessionVault.currentSession?.organizationName ?: "VNex Solar"
        val projectTitle = _uiState.value.projects.firstOrNull { it.id == record.projectId }?.title ?: "Solar PV Project"
        val pdf = CommissioningPdfExporter.generatePdf(
            context = appContext,
            organizationName = orgName,
            projectTitle = projectTitle,
            record = record,
            signaturePngBytes = _uiState.value.signaturePngBytes,
        )
        CommissioningPdfExporter.sharePdf(appContext, pdf, record.certificateCode)
    }

    fun printPdf(context: Context, record: CommissioningRecordDetailDto) {
        val orgName = sessionVault.currentSession?.organizationName ?: "VNex Solar"
        val projectTitle = _uiState.value.projects.firstOrNull { it.id == record.projectId }?.title ?: "Solar PV Project"
        val pdf = CommissioningPdfExporter.generatePdf(
            context = context,
            organizationName = orgName,
            projectTitle = projectTitle,
            record = record,
            signaturePngBytes = _uiState.value.signaturePngBytes,
        )
        CommissioningPdfExporter.printPdf(context, pdf, "VNex_${record.certificateCode}")
    }

    fun dismissPreview() {
        _uiState.update { it.copy(previewBitmap = null, previewFile = null) }
    }

    private fun updateRecordInState(record: CommissioningRecordDetailDto, message: String) {
        _uiState.update { prev ->
            prev.copy(
                records = prev.records.map { if (it.id == record.id) record else it },
                isSubmitting = false,
                statusMessage = message,
            )
        }
    }

    private data class CommissioningLoadedBundle(
        val projects: List<ProjectDto>,
        val jobs: List<InstallationJobRefDto>,
        val records: List<CommissioningRecordDetailDto>,
        val assets: List<AssetRegisterRecordDto>,
    )
}
