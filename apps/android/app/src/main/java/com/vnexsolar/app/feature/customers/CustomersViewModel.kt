package com.vnexsolar.app.feature.customers

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
import com.vnexsolar.app.core.network.CreateCustomerRequestDto
import com.vnexsolar.app.core.network.CreateSiteRequestDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import java.util.UUID
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
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class CustomersUiState(
    val searchQuery: String = "",
    val selectedCustomerId: String? = null,
    val isRefreshing: Boolean = false,
    val isSaving: Boolean = false,
    val statusMessage: String? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class CustomersViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    private val json: Json,
) : ViewModel() {

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(CustomersUiState())
    val uiState: StateFlow<CustomersUiState> = _uiState.asStateFlow()

    val customers: StateFlow<List<CustomerEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeCustomers(orgId))
            .combine(_uiState) { list, state ->
                val q = state.searchQuery.trim().lowercase()
                if (q.isEmpty()) list
                else list.filter {
                    it.fullName.lowercase().contains(q) ||
                        it.customerCode.lowercase().contains(q) ||
                        (it.companyName ?: "").lowercase().contains(q) ||
                        (it.primaryPhone ?: "").lowercase().contains(q)
                }
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val allSites: StateFlow<List<SiteEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeAllSites(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val allProjects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        refresh()
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun selectCustomer(customerId: String?) {
        _uiState.update { it.copy(selectedCustomerId = customerId, statusMessage = null, errorMessage = null) }
        if (customerId != null) {
            refreshCustomerSites(customerId)
        }
    }

    fun refresh() {
        val currentOrg = orgId
        if (currentOrg.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val resp = workspaceApiService.listCustomers()
                val entities = resp.customers.map { dto ->
                    CustomerEntity(
                        id = dto.id,
                        organizationId = dto.organizationId,
                        customerCode = dto.customerCode,
                        customerType = dto.customerType,
                        fullName = dto.fullName,
                        companyName = dto.companyName,
                        primaryPhone = dto.primaryPhone,
                        email = dto.email,
                        billingAddress = dto.billingAddress,
                        rowVersion = dto.rowVersion,
                        syncState = "SYNCED",
                        updatedAtEpochMs = parseEpochOrNow(dto.updatedAt),
                    )
                }
                offlineRepository.cacheCustomers(entities)
                _uiState.update { it.copy(isRefreshing = false) }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        errorMessage = "Cached offline data shown · ${ex.message ?: "Offline"}",
                    )
                }
            }
        }
    }

    private fun refreshCustomerSites(customerId: String) {
        viewModelScope.launch {
            try {
                val res = workspaceApiService.listCustomerSites(customerId)
                val entities = res.sites.map { dto ->
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
                }
                offlineRepository.cacheSites(entities)
            } catch (_ex: Exception) {
                // Keep cached Room sites when offline
            }
        }
    }

    fun createCustomer(
        customerType: String,
        fullName: String,
        companyName: String?,
        phone: String?,
        email: String?,
        billingAddress: String?,
        onDone: () -> Unit,
    ) {
        val currentOrg = orgId
        if (currentOrg.isBlank() || fullName.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "Customer name must be at least 2 characters") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null, statusMessage = null) }
            val cleanName = fullName.trim()
            val cleanCompany = companyName?.trim()?.ifBlank { null }
            val cleanPhone = phone?.trim()?.ifBlank { null }
            val cleanEmail = email?.trim()?.ifBlank { null }
            val cleanAddress = billingAddress?.trim()?.ifBlank { null }

            try {
                val created = workspaceApiService.createCustomer(
                    CreateCustomerRequestDto(
                        customerType = customerType,
                        fullName = cleanName,
                        companyName = cleanCompany,
                        primaryPhone = cleanPhone,
                        email = cleanEmail,
                        billingAddress = cleanAddress,
                    ),
                )
                offlineRepository.cacheCustomers(
                    listOf(
                        CustomerEntity(
                            id = created.id,
                            organizationId = created.organizationId,
                            customerCode = created.customerCode,
                            customerType = created.customerType,
                            fullName = created.fullName,
                            companyName = created.companyName,
                            primaryPhone = created.primaryPhone,
                            email = created.email,
                            billingAddress = created.billingAddress,
                            rowVersion = created.rowVersion,
                            syncState = "SYNCED",
                            updatedAtEpochMs = parseEpochOrNow(created.updatedAt),
                        ),
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        selectedCustomerId = created.id,
                        statusMessage = "Customer ${created.customerCode} saved",
                    )
                }
                onDone()
            } catch (_ex: Exception) {
                val id = UUID.randomUUID().toString()
                val now = System.currentTimeMillis()
                val localEntity = CustomerEntity(
                    id = id,
                    organizationId = currentOrg,
                    customerCode = "LOCAL-${id.take(4).uppercase()}",
                    customerType = customerType,
                    fullName = cleanName,
                    companyName = cleanCompany,
                    primaryPhone = cleanPhone,
                    email = cleanEmail,
                    billingAddress = cleanAddress,
                    rowVersion = 1,
                    syncState = "PENDING",
                    updatedAtEpochMs = now,
                )
                val payload = json.encodeToString(
                    CreateCustomerRequestDto(
                        customerType = customerType,
                        fullName = cleanName,
                        companyName = cleanCompany,
                        primaryPhone = cleanPhone,
                        email = cleanEmail,
                        billingAddress = cleanAddress,
                    ),
                )
                offlineRepository.saveCustomerOffline(
                    organizationId = currentOrg,
                    customer = localEntity,
                    operationType = "create",
                    payloadJson = payload,
                )
                val deviceId = appPreferences.getOrCreateDeviceId()
                SyncWorker.enqueueOneTime(appContext, currentOrg, deviceId)
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        selectedCustomerId = id,
                        statusMessage = "Saved offline to Room outbox (queued for sync)",
                    )
                }
                onDone()
            }
        }
    }

    fun createSite(
        customerId: String,
        siteName: String,
        addressLine: String,
        city: String,
        utilityProvider: String?,
        meterReference: String?,
        connectionPhase: String,
        onDone: () -> Unit,
    ) {
        val currentOrg = orgId
        if (currentOrg.isBlank() || siteName.trim().length < 2 || addressLine.trim().length < 3) {
            _uiState.update { it.copy(errorMessage = "Enter a valid site name, address, and city") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            try {
                val created = workspaceApiService.createSite(
                    customerId = customerId,
                    request = CreateSiteRequestDto(
                        siteName = siteName.trim(),
                        addressLine = addressLine.trim(),
                        city = city.trim(),
                        utilityProvider = utilityProvider?.trim()?.ifBlank { null },
                        meterReference = meterReference?.trim()?.ifBlank { null },
                        connectionPhase = connectionPhase,
                    ),
                )
                offlineRepository.upsertSite(
                    SiteEntity(
                        id = created.id,
                        organizationId = created.organizationId,
                        customerId = created.customerId,
                        siteName = created.siteName,
                        addressLine = created.addressLine,
                        city = created.city,
                        countryCode = created.countryCode,
                        utilityProvider = created.utilityProvider,
                        meterReference = created.meterReference,
                        connectionPhase = created.connectionPhase,
                        rowVersion = created.rowVersion,
                        syncState = "SYNCED",
                        createdAtEpochMs = parseEpochOrNow(created.createdAt),
                    ),
                )
                _uiState.update {
                    it.copy(isSaving = false, statusMessage = "Site ${created.siteName} added")
                }
                onDone()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errorMessage = ex.message ?: "Creating a site requires server connectivity",
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
