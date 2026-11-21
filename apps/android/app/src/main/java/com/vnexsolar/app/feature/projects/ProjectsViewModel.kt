package com.vnexsolar.app.feature.projects

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
import com.vnexsolar.app.core.network.CreateProjectRequestDto
import com.vnexsolar.app.core.network.InstallationJobRefDto
import com.vnexsolar.app.core.network.ProjectSurveyRefDto
import com.vnexsolar.app.core.network.QuotationHeaderRefDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ProjectStageFilter(val label: String, val prefixes: Set<String>) {
    ALL("All", emptySet()),
    SURVEY("Survey", setOf("lead", "survey_scheduled", "survey_completed")),
    DESIGN("Design", setOf("design_draft", "design_approved")),
    QUOTE("Quotation", setOf("quote_sent", "quote_approved")),
    INSTALL("Installation", setOf("installation_scheduled", "installation_in_progress", "installation_completed")),
    COMMISSIONED("Handover", setOf("commissioned", "handed_over")),
}

data class ProjectsUiState(
    val searchQuery: String = "",
    val stageFilter: ProjectStageFilter = ProjectStageFilter.ALL,
    val selectedProjectId: String? = null,
    val projectSurveys: List<ProjectSurveyRefDto> = emptyList(),
    val projectQuotations: List<QuotationHeaderRefDto> = emptyList(),
    val projectJobs: List<InstallationJobRefDto> = emptyList(),
    val isRefreshing: Boolean = false,
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
)

@HiltViewModel
class ProjectsViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : ViewModel() {

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(ProjectsUiState())
    val uiState: StateFlow<ProjectsUiState> = _uiState.asStateFlow()

    val preferredCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    val projects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .combine(_uiState) { list, state ->
                val q = state.searchQuery.trim().lowercase()
                list.filter { p ->
                    val stageOk = state.stageFilter == ProjectStageFilter.ALL ||
                        state.stageFilter.prefixes.contains(p.currentStage)
                    val queryOk = q.isEmpty() ||
                        p.title.lowercase().contains(q) ||
                        p.projectCode.lowercase().contains(q) ||
                        p.systemType.lowercase().contains(q)
                    stageOk && queryOk
                }
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val customers: StateFlow<List<CustomerEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeCustomers(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val sites: StateFlow<List<SiteEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeAllSites(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        refresh()
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun selectStageFilter(filter: ProjectStageFilter) {
        _uiState.update { it.copy(stageFilter = filter) }
    }

    fun selectProject(projectId: String?) {
        _uiState.update {
            it.copy(
                selectedProjectId = projectId,
                projectSurveys = emptyList(),
                projectQuotations = emptyList(),
                projectJobs = emptyList(),
                statusMessage = null,
            )
        }
        if (projectId != null) {
            loadProjectDetails(projectId)
        }
    }

    fun loadSitesForCustomer(customerId: String) {
        viewModelScope.launch {
            try {
                val res = workspaceApiService.listCustomerSites(customerId)
                offlineRepository.cacheSites(
                    res.sites.map { dto ->
                        SiteEntity(
                            id = dto.id,
                            organizationId = dto.organizationId,
                            customerId = dto.customerId,
                            siteName = dto.siteName,
                            addressLine = dto.addressLine,
                            city = dto.city,
                            countryCode = dto.countryCode,
                            utilityProvider = dto.utilityProvider,
                            meterReference = dto.meterReference,
                            connectionPhase = dto.connectionPhase,
                            rowVersion = dto.rowVersion,
                            syncState = "SYNCED",
                            createdAtEpochMs = parseEpochOrNow(dto.createdAt),
                        )
                    },
                )
            } catch (_ex: Exception) {
                // Keep cached Room sites when offline
            }
        }
    }

    fun refresh() {
        if (orgId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val resp = workspaceApiService.listProjects()
                offlineRepository.cacheProjects(
                    resp.projects.map { dto ->
                        ProjectEntity(
                            id = dto.id,
                            organizationId = dto.organizationId,
                            customerId = dto.customerId,
                            siteId = dto.siteId,
                            projectCode = dto.projectCode,
                            title = dto.title,
                            systemType = dto.systemType,
                            targetCapacityKwp = dto.targetCapacityKwp,
                            currentStage = dto.currentStage,
                            status = dto.status,
                            currency = dto.currency,
                            rowVersion = dto.rowVersion,
                            syncState = "SYNCED",
                            updatedAtEpochMs = parseEpochOrNow(dto.updatedAt),
                        )
                    },
                )
                // Also sync customers cache if empty
                val custResp = workspaceApiService.listCustomers()
                offlineRepository.cacheCustomers(
                    custResp.customers.map { c ->
                        CustomerEntity(
                            id = c.id,
                            organizationId = c.organizationId,
                            customerCode = c.customerCode,
                            customerType = c.customerType,
                            fullName = c.fullName,
                            companyName = c.companyName,
                            primaryPhone = c.primaryPhone,
                            email = c.email,
                            billingAddress = c.billingAddress,
                            rowVersion = c.rowVersion,
                            syncState = "SYNCED",
                            updatedAtEpochMs = parseEpochOrNow(c.updatedAt),
                        )
                    },
                )
                _uiState.update { it.copy(isRefreshing = false) }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        errorMessage = "Showing cached projects · ${ex.message ?: "Offline"}",
                    )
                }
            }
        }
    }

    private fun loadProjectDetails(projectId: String) {
        viewModelScope.launch {
            val surveys = runCatching { workspaceApiService.listSurveys(projectId).surveys }.getOrDefault(emptyList())
            val quotes = runCatching { workspaceApiService.listQuotations(projectId).quotations.map { it.quotation } }.getOrDefault(emptyList())
            val jobs = runCatching { workspaceApiService.listInstallations(projectId).jobs }.getOrDefault(emptyList())
            _uiState.update {
                it.copy(
                    projectSurveys = surveys,
                    projectQuotations = quotes,
                    projectJobs = jobs,
                )
            }
        }
    }

    fun createProject(
        customerId: String,
        siteId: String,
        title: String,
        systemType: String,
        targetCapacityKwp: Double?,
        currency: String,
        onDone: () -> Unit,
    ) {
        if (title.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "Project title must be at least 2 characters") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            try {
                val created = workspaceApiService.createProject(
                    CreateProjectRequestDto(
                        customerId = customerId,
                        siteId = siteId,
                        title = title.trim(),
                        systemType = systemType,
                        targetCapacityKwp = targetCapacityKwp,
                        currency = currency,
                    ),
                )
                offlineRepository.upsertProject(
                    ProjectEntity(
                        id = created.id,
                        organizationId = created.organizationId,
                        customerId = created.customerId,
                        siteId = created.siteId,
                        projectCode = created.projectCode,
                        title = created.title,
                        systemType = created.systemType,
                        targetCapacityKwp = created.targetCapacityKwp,
                        currentStage = created.currentStage,
                        status = created.status,
                        currency = created.currency,
                        rowVersion = created.rowVersion,
                        syncState = "SYNCED",
                        updatedAtEpochMs = parseEpochOrNow(created.updatedAt),
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        selectedProjectId = created.id,
                        statusMessage = "Created project ${created.projectCode}",
                    )
                }
                onDone()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errorMessage = ex.message ?: "Unable to create project offline without customer/site sync",
                    )
                }
            }
        }
    }

    private fun parseEpochOrNow(iso: String): Long =
        try {
            if (iso.isBlank()) System.currentTimeMillis() else Instant.parse(iso).toEpochMilli()
        } catch (_ex: Exception) {
            System.currentTimeMillis()
        }
}
