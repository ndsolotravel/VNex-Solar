package com.vnexsolar.app.feature.quotations

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.CachedQuotationEntity
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.network.CreateInvoiceItemRequestDto
import com.vnexsolar.app.core.network.CreateInvoiceRequestDto
import com.vnexsolar.app.core.network.CreateQuotationRequestDto
import com.vnexsolar.app.core.network.EquipmentCatalogItemDto
import com.vnexsolar.app.core.network.QuotationHeaderRefDto
import com.vnexsolar.app.core.network.QuotationLineItemDto
import com.vnexsolar.app.core.network.QuotationRevisionDto
import com.vnexsolar.app.core.network.QuotationSummaryWrapperDto
import com.vnexsolar.app.core.network.ReviewQuotationRequestDto
import com.vnexsolar.app.core.network.SolarDesignListItemDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class OfflineQuotationDraftPayload(
    val projectId: String,
    val title: String,
    val notes: String? = null,
    val discountMinor: Long = 0L,
    val items: List<QuotationLineItemDto>,
)

enum class QuotationFilterStatus(val label: String, val apiValue: String?) {
    ALL("All", null),
    DRAFT("Draft", "draft"),
    SENT("Sent", "sent"),
    APPROVED("Approved", "approved"),
    REJECTED("Rejected", "rejected"),
}

data class QuotationsUiState(
    val quotations: List<QuotationSummaryWrapperDto> = emptyList(),
    val solarDesigns: List<SolarDesignListItemDto> = emptyList(),
    val catalogItems: List<EquipmentCatalogItemDto> = emptyList(),
    val filterStatus: QuotationFilterStatus = QuotationFilterStatus.ALL,
    val selectedQuotation: QuotationSummaryWrapperDto? = null,
    val builderOpen: Boolean = false,
    val builderProjectId: String = "",
    val builderDesignRevisionId: String? = null,
    val builderTitle: String = "",
    val builderCurrency: String = "PKR",
    val builderValidityDays: String = "15",
    val builderDiscountMajor: String = "0",
    val builderTerms: String = "60% Advance on confirmation, 30% on delivery, 10% on commissioning.",
    val builderNotes: String = "",
    val builderItems: List<QuotationLineItemDto> = listOf(
        QuotationLineItemDto(
            lineType = "equipment",
            description = "Solar PV Array & Inverter Supply",
            quantity = 1.0,
            unitCostMinor = 850_000_00L,
            unitPriceMinor = 1_050_000_00L,
            taxRateBps = 0,
        ),
        QuotationLineItemDto(
            lineType = "labor",
            description = "EPC Installation, Commissioning & Net Metering",
            quantity = 1.0,
            unitCostMinor = 95_000_00L,
            unitPriceMinor = 145_000_00L,
            taxRateBps = 1600,
        ),
    ),
    val isRefreshing: Boolean = false,
    val isSubmitting: Boolean = false,
    val offlineMode: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
) {
    val computedTotals: QuotationComputedTotals
        get() {
            val discountMajor = builderDiscountMajor.toDoubleOrNull()?.coerceAtLeast(0.0) ?: 0.0
            return QuotationCalculator.calculateTotals(
                rawItems = builderItems,
                discountMinorInput = Math.round(discountMajor * 100.0),
            )
        }
}

@HiltViewModel
class QuotationsViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    val organizationName: String
        get() = sessionVault.currentSession?.organizationName ?: "VNex Solar"

    private val _uiState = MutableStateFlow(QuotationsUiState())
    val uiState: StateFlow<QuotationsUiState> = _uiState.asStateFlow()

    val preferredCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    val projects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val customers: StateFlow<List<CustomerEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeCustomers(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val cachedQuotations: StateFlow<List<CachedQuotationEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeCachedQuotations(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch {
            preferredCurrency.collect { cur ->
                _uiState.update { state ->
                    if (!state.builderOpen) state.copy(builderCurrency = cur) else state
                }
            }
        }
        refresh()
    }

    fun selectFilter(filter: QuotationFilterStatus) {
        _uiState.update { it.copy(filterStatus = filter) }
    }

    fun selectQuotation(summary: QuotationSummaryWrapperDto?) {
        _uiState.update { it.copy(selectedQuotation = summary, statusMessage = null, errorMessage = null) }
    }

    fun openBuilder(defaultProjectId: String? = null) {
        val projectId = defaultProjectId
            ?: _uiState.value.builderProjectId.ifBlank { projects.value.firstOrNull()?.id.orEmpty() }
        _uiState.update {
            it.copy(
                builderOpen = true,
                builderProjectId = projectId,
                builderCurrency = preferredCurrency.value,
                errorMessage = null,
                statusMessage = null,
            )
        }
    }

    fun closeBuilder() {
        _uiState.update { it.copy(builderOpen = false) }
    }

    fun updateBuilderMeta(
        projectId: String? = null,
        title: String? = null,
        currency: String? = null,
        validityDays: String? = null,
        discountMajor: String? = null,
        terms: String? = null,
        notes: String? = null,
    ) {
        _uiState.update {
            it.copy(
                builderProjectId = projectId ?: it.builderProjectId,
                builderTitle = title ?: it.builderTitle,
                builderCurrency = currency ?: it.builderCurrency,
                builderValidityDays = validityDays ?: it.builderValidityDays,
                builderDiscountMajor = discountMajor ?: it.builderDiscountMajor,
                builderTerms = terms ?: it.builderTerms,
                builderNotes = notes ?: it.builderNotes,
            )
        }
    }

    fun addLineItem(
        lineType: String,
        description: String,
        quantity: Double,
        unitCostMajor: Double,
        unitPriceMajor: Double,
        taxRateBps: Int,
        equipmentCatalogId: String? = null,
    ) {
        if (description.trim().length < 2 || quantity <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Line description (>=2 chars) and quantity (>0) are required.") }
            return
        }
        val item = QuotationLineItemDto(
            equipmentCatalogId = equipmentCatalogId,
            lineType = lineType,
            description = description.trim(),
            quantity = quantity,
            unitCostMinor = Math.round(unitCostMajor.coerceAtLeast(0.0) * 100.0),
            unitPriceMinor = Math.round(unitPriceMajor.coerceAtLeast(0.0) * 100.0),
            taxRateBps = taxRateBps.coerceIn(0, 10_000),
        )
        _uiState.update {
            it.copy(
                builderItems = it.builderItems + item,
                errorMessage = null,
            )
        }
    }

    fun removeLineItem(index: Int) {
        _uiState.update { state ->
            if (index !in state.builderItems.indices || state.builderItems.size <= 1) {
                state
            } else {
                state.copy(builderItems = state.builderItems.filterIndexed { i, _ -> i != index })
            }
        }
    }

    fun importBomFromDesign(designId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val draft = workspaceApiService.buildQuotationBomFromDesign(designId)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        builderOpen = true,
                        builderProjectId = draft.projectId,
                        builderDesignRevisionId = draft.designRevisionId,
                        builderTitle = draft.title,
                        builderCurrency = draft.currency,
                        builderItems = draft.items.ifEmpty { it.builderItems },
                        statusMessage = "Imported ${draft.items.size} BOM items from solar design.",
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        errorMessage = ex.message ?: "Unable to import BOM from solar design.",
                    )
                }
            }
        }
    }

    fun saveQuotation(queueOfflineIfFailed: Boolean = true) {
        val state = _uiState.value
        val projectId = state.builderProjectId.ifBlank { projects.value.firstOrNull()?.id.orEmpty() }
        if (projectId.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Select a project before creating a quotation.") }
            return
        }
        if (state.builderTitle.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "Quotation title must be at least 2 characters.") }
            return
        }
        if (state.builderItems.isEmpty()) {
            _uiState.update { it.copy(errorMessage = "At least one line item is required.") }
            return
        }

        val totals = state.computedTotals
        val validity = state.builderValidityDays.toIntOrNull()?.coerceIn(1, 365) ?: 15

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null, statusMessage = null) }
            try {
                val created = workspaceApiService.createQuotation(
                    CreateQuotationRequestDto(
                        projectId = projectId,
                        designRevisionId = state.builderDesignRevisionId,
                        title = state.builderTitle.trim(),
                        currency = state.builderCurrency,
                        validityDays = validity,
                        termsAndConditions = state.builderTerms.trim().ifBlank { null },
                        notes = state.builderNotes.trim().ifBlank { null },
                        discountMinor = totals.discountMinor,
                        items = state.builderItems,
                    ),
                )
                val summary = QuotationSummaryWrapperDto(
                    quotation = created.quotation,
                    latestRevision = created.revisions.lastOrNull(),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        builderOpen = false,
                        selectedQuotation = summary,
                        statusMessage = "Saved quotation ${created.quotation.quotationNumber}.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                if (queueOfflineIfFailed && orgId.isNotBlank()) {
                    val localId = UUID.randomUUID().toString()
                    val payload = OfflineQuotationDraftPayload(
                        projectId = projectId,
                        title = state.builderTitle.trim(),
                        notes = state.builderNotes.trim().ifBlank { null },
                        discountMinor = totals.discountMinor,
                        items = state.builderItems,
                    )
                    val payloadJson = json.encodeToString(payload)
                    offlineRepository.enqueueEntityOutboxMutation(
                        organizationId = orgId,
                        entityType = "quotation_draft",
                        entityId = localId,
                        operationType = "create",
                        baseRowVersion = 0,
                        payloadJson = payloadJson,
                    )
                    val customerId = projects.value.firstOrNull { it.id == projectId }?.customerId.orEmpty()
                    val offlineSummary = QuotationSummaryWrapperDto(
                        quotation = QuotationHeaderRefDto(
                            id = localId,
                            quotationNumber = "QT-OFFLINE-${localId.take(6).uppercase()}",
                            title = state.builderTitle.trim(),
                            status = "draft",
                            currentRevisionNumber = 1,
                            currency = state.builderCurrency,
                            projectId = projectId,
                            customerId = customerId,
                        ),
                        latestRevision = QuotationRevisionDto(
                            id = localId,
                            quotationId = localId,
                            revisionNumber = 1,
                            status = "draft",
                            currency = state.builderCurrency,
                            validityDays = validity,
                            termsAndConditions = state.builderTerms,
                            notes = state.builderNotes,
                            items = totals.items,
                            equipmentSubtotalMinor = totals.equipmentSubtotalMinor,
                            laborCostMinor = totals.laborCostMinor,
                            transportCostMinor = totals.transportCostMinor,
                            discountMinor = totals.discountMinor,
                            subtotalMinor = totals.subtotalMinor,
                            taxAmountMinor = totals.taxAmountMinor,
                            totalAmountMinor = totals.totalAmountMinor,
                            totalCostMinor = totals.totalCostMinor,
                            grossProfitMinor = totals.grossProfitMinor,
                            grossMarginBps = totals.grossMarginBps,
                        ),
                    )
                    offlineRepository.cacheQuotations(
                        listOf(
                            CachedQuotationEntity(
                                id = localId,
                                organizationId = orgId,
                                projectId = projectId,
                                customerId = customerId,
                                quotationNumber = offlineSummary.quotation.quotationNumber,
                                title = offlineSummary.quotation.title,
                                status = "draft",
                                currentRevisionNumber = 1,
                                currency = state.builderCurrency,
                                totalAmountMinor = totals.totalAmountMinor,
                                payloadJson = json.encodeToString(offlineSummary),
                                updatedAtEpochMs = System.currentTimeMillis(),
                            ),
                        ),
                    )
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            builderOpen = false,
                            selectedQuotation = offlineSummary,
                            statusMessage = "Offline draft queued in Room outbox (${offlineSummary.quotation.quotationNumber}).",
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            errorMessage = ex.message ?: "Failed to create quotation.",
                        )
                    }
                }
            }
        }
    }

    fun sendSelectedQuotation(quotationId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val res = workspaceApiService.sendQuotation(quotationId)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        selectedQuotation = QuotationSummaryWrapperDto(res.quotation, res.revision),
                        statusMessage = "Quotation ${res.quotation.quotationNumber} marked SENT.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to send quotation.")
                }
            }
        }
    }

    fun approveOrRejectSelected(
        quotationId: String,
        approve: Boolean,
        customerSignoffName: String?,
        notes: String,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val req = ReviewQuotationRequestDto(
                    notes = notes.trim().ifBlank { if (approve) "Commercial proposal accepted" else "Proposal declined" },
                    customerSignoffName = customerSignoffName?.trim()?.ifBlank { null },
                )
                val res = if (approve) {
                    workspaceApiService.approveQuotation(quotationId, req)
                } else {
                    workspaceApiService.rejectQuotation(quotationId, req)
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        selectedQuotation = QuotationSummaryWrapperDto(res.quotation, res.revision),
                        statusMessage = "Quotation ${res.quotation.quotationNumber} ${res.quotation.status.uppercase()}.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Decision failed.")
                }
            }
        }
    }

    fun convertSelectedToInvoice(
        summary: QuotationSummaryWrapperDto,
        invoiceType: String = "advance",
    ) {
        val rev = summary.latestRevision ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val invoiceItems = rev.items.map { item ->
                    CreateInvoiceItemRequestDto(
                        description = item.description,
                        quantity = item.quantity,
                        unitPriceMinor = item.unitPriceMinor,
                        taxRateBps = item.taxRateBps,
                    )
                }
                val invoice = workspaceApiService.createInvoice(
                    CreateInvoiceRequestDto(
                        projectId = summary.quotation.projectId,
                        quotationRevisionId = rev.id.ifBlank { null },
                        invoiceType = invoiceType,
                        dueDate = LocalDate.now().plusDays(7).toString(),
                        currency = summary.quotation.currency,
                        items = invoiceItems,
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Created draft invoice ${invoice.invoiceNumber} from ${summary.quotation.quotationNumber}. Open Finance -> Invoices to issue.",
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Unable to convert quotation to invoice.")
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val quotesResp = workspaceApiService.listQuotations()
                val designsResp = runCatching { workspaceApiService.listSolarDesigns().designs }.getOrDefault(emptyList())
                val catalogResp = runCatching { workspaceApiService.listInventoryCatalog().items }.getOrDefault(emptyList())
                if (orgId.isNotBlank()) {
                    val cachedEntities = quotesResp.quotations.map { item ->
                        CachedQuotationEntity(
                            id = item.quotation.id,
                            organizationId = orgId,
                            projectId = item.quotation.projectId,
                            customerId = item.quotation.customerId,
                            quotationNumber = item.quotation.quotationNumber,
                            title = item.quotation.title,
                            status = item.quotation.status,
                            currentRevisionNumber = item.quotation.currentRevisionNumber,
                            currency = item.quotation.currency,
                            totalAmountMinor = item.latestRevision?.totalAmountMinor ?: 0L,
                            payloadJson = json.encodeToString(item),
                            updatedAtEpochMs = runCatching {
                                Instant.parse(item.quotation.updatedAt).toEpochMilli()
                            }.getOrElse { System.currentTimeMillis() },
                        )
                    }
                    offlineRepository.cacheQuotations(cachedEntities)
                }
                _uiState.update { state ->
                    val refreshedSelected = state.selectedQuotation?.let { current ->
                        quotesResp.quotations.firstOrNull { it.quotation.id == current.quotation.id } ?: current
                    }
                    state.copy(
                        quotations = quotesResp.quotations,
                        solarDesigns = designsResp,
                        catalogItems = catalogResp,
                        selectedQuotation = refreshedSelected,
                        isRefreshing = false,
                        offlineMode = false,
                    )
                }
            } catch (ex: Exception) {
                val cachedList = cachedQuotations.value.mapNotNull { entity ->
                    runCatching { json.decodeFromString<QuotationSummaryWrapperDto>(entity.payloadJson) }.getOrNull()
                }
                _uiState.update {
                    it.copy(
                        quotations = if (it.quotations.isEmpty()) cachedList else it.quotations,
                        isRefreshing = false,
                        offlineMode = true,
                        errorMessage = "Offline cache active · ${ex.message ?: "Check network"}",
                    )
                }
            }
        }
    }
}
