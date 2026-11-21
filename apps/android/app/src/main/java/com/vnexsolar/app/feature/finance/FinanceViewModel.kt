package com.vnexsolar.app.feature.finance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.DraftExpenseEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.model.PaymentMethodOption
import com.vnexsolar.app.core.network.CreateInvoiceItemRequestDto
import com.vnexsolar.app.core.network.CreateInvoiceRequestDto
import com.vnexsolar.app.core.network.CreditNoteRecordDto
import com.vnexsolar.app.core.network.FinanceSummaryDto
import com.vnexsolar.app.core.network.InvoiceRecordDto
import com.vnexsolar.app.core.network.IssueCreditNoteRequestDto
import com.vnexsolar.app.core.network.JournalEntryDto
import com.vnexsolar.app.core.network.JournalLineDto
import com.vnexsolar.app.core.network.ManualJournalRequestDto
import com.vnexsolar.app.core.network.PaymentAllocationInputDto
import com.vnexsolar.app.core.network.PaymentRecordDto
import com.vnexsolar.app.core.network.PurchaseOrderDto
import com.vnexsolar.app.core.network.RecordPaymentRequestDto
import com.vnexsolar.app.core.network.SupplierDto
import com.vnexsolar.app.core.network.TaxRuleDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
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

enum class FinanceTab(val label: String) {
    OVERVIEW("Overview"),
    INVOICES("Invoices"),
    PAYMENTS_EXPENSES("Payments & Expenses"),
    LEDGERS("Ledgers"),
    JOURNALS("Journals"),
}

data class CustomerLedgerSummary(
    val customerId: String,
    val customerName: String,
    val totalInvoicedMinor: Long,
    val totalPaidMinor: Long,
    val totalCreditedMinor: Long,
    val openBalanceMinor: Long,
    val invoiceCount: Int,
    val paymentCount: Int,
)

data class FinanceUiState(
    val activeTab: FinanceTab = FinanceTab.OVERVIEW,
    val summary: FinanceSummaryDto = FinanceSummaryDto(),
    val taxRules: List<TaxRuleDto> = emptyList(),
    val invoices: List<InvoiceRecordDto> = emptyList(),
    val payments: List<PaymentRecordDto> = emptyList(),
    val creditNotes: List<CreditNoteRecordDto> = emptyList(),
    val journals: List<JournalEntryDto> = emptyList(),
    val purchaseOrders: List<PurchaseOrderDto> = emptyList(),
    val suppliers: List<SupplierDto> = emptyList(),
    val invoiceStatusFilter: String? = null,
    val isRefreshing: Boolean = false,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
) {
    val totalOperatingExpensesMinor: Long
        get() = journals.flatMap { it.lines }
            .filter { it.accountCode.startsWith("5") }
            .sumOf { it.debitMinor - it.creditMinor }

    val totalPoCommitmentsMinor: Long
        get() = purchaseOrders
            .filter { it.status in setOf("issued", "partially_received", "received") }
            .sumOf { it.totalAmountMinor }

    val settledPayablesMinor: Long
        get() = journals.flatMap { it.lines }
            .filter { it.accountCode == "2000" }
            .sumOf { it.debitMinor - it.creditMinor }

    val accountsPayableMinor: Long
        get() = (totalPoCommitmentsMinor - settledPayablesMinor).coerceAtLeast(0L)

    val netProfitMinor: Long
        get() = (summary.totalInvoicedMinor - summary.totalCreditedMinor) - totalOperatingExpensesMinor

    val paymentTotalsByMethod: Map<PaymentMethodOption, Long>
        get() = PaymentMethodOption.entries.associateWith { option ->
            payments.filter { it.paymentMethod == option.apiValue }.sumOf { it.amountMinor }
        }
}

@HiltViewModel
class FinanceViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : ViewModel() {

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(FinanceUiState())
    val uiState: StateFlow<FinanceUiState> = _uiState.asStateFlow()

    val preferredCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    val customers: StateFlow<List<CustomerEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeCustomers(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val projects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val draftExpenses: StateFlow<List<DraftExpenseEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeDraftExpenses(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        refresh()
    }

    fun selectTab(tab: FinanceTab) {
        _uiState.update { it.copy(activeTab = tab, errorMessage = null, statusMessage = null) }
    }

    fun selectInvoiceFilter(status: String?) {
        _uiState.update { it.copy(invoiceStatusFilter = status) }
    }

    fun buildCustomerLedgers(): List<CustomerLedgerSummary> {
        val state = _uiState.value
        val customerIds = (customers.value.map { it.id } +
            state.invoices.map { it.customerId } +
            state.payments.map { it.customerId }).distinct()

        return customerIds.mapNotNull { cid ->
            val custInvoices = state.invoices.filter { it.customerId == cid && it.status != "draft" && it.status != "void" }
            val custPayments = state.payments.filter { it.customerId == cid }
            if (custInvoices.isEmpty() && custPayments.isEmpty()) return@mapNotNull null

            val custName = customers.value.firstOrNull { it.id == cid }?.fullName ?: "Customer ${cid.take(6)}"
            val invoiced = custInvoices.sumOf { it.totalAmountMinor }
            val credited = custInvoices.sumOf { it.creditedAmountMinor }
            val paid = custPayments.sumOf { it.amountMinor }
            val openBalance = custInvoices.sumOf { it.balanceDueMinor }
            CustomerLedgerSummary(
                customerId = cid,
                customerName = custName,
                totalInvoicedMinor = invoiced,
                totalPaidMinor = paid,
                totalCreditedMinor = credited,
                openBalanceMinor = openBalance,
                invoiceCount = custInvoices.size,
                paymentCount = custPayments.size,
            )
        }.sortedByDescending { it.openBalanceMinor }
    }

    fun createDraftInvoice(
        projectId: String,
        invoiceType: String,
        description: String,
        quantity: Double,
        unitPriceMajor: Double,
        taxRuleId: String?,
        taxRateBps: Int,
        dueInDays: Long = 15,
    ) {
        if (projectId.isBlank() || description.trim().length < 2 || quantity <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Project, item description, and quantity (>0) are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val created = workspaceApiService.createInvoice(
                    CreateInvoiceRequestDto(
                        projectId = projectId,
                        invoiceType = invoiceType,
                        dueDate = LocalDate.now().plusDays(dueInDays).toString(),
                        currency = preferredCurrency.value,
                        items = listOf(
                            CreateInvoiceItemRequestDto(
                                description = description.trim(),
                                quantity = quantity,
                                unitPriceMinor = Math.round(unitPriceMajor.coerceAtLeast(0.0) * 100.0),
                                taxRuleId = taxRuleId,
                                taxRateBps = taxRateBps,
                            ),
                        ),
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Created draft invoice ${created.invoiceNumber}.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to create invoice.")
                }
            }
        }
    }

    fun issueInvoice(invoiceId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val resp = workspaceApiService.issueInvoice(invoiceId)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Issued ${resp.invoice.invoiceNumber} & posted AR/Revenue/Tax double-entry journal.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to issue invoice.")
                }
            }
        }
    }

    fun issueCreditNote(invoiceId: String, amountMajor: Double, reason: String) {
        val amountMinor = Math.round(amountMajor * 100.0)
        if (amountMinor <= 0L || reason.trim().length < 3) {
            _uiState.update { it.copy(errorMessage = "Positive credit amount and reason (>=3 chars) are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val resp = workspaceApiService.issueCreditNote(
                    IssueCreditNoteRequestDto(
                        invoiceId = invoiceId,
                        amountMinor = amountMinor,
                        reason = reason.trim(),
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Issued ${resp.creditNote.creditNoteNumber} against ${resp.invoice.invoiceNumber}.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Credit note failed.")
                }
            }
        }
    }

    fun recordCustomerPayment(
        customerId: String,
        invoiceId: String?,
        paymentMethod: PaymentMethodOption,
        amountMajor: Double,
        referenceNo: String?,
    ) {
        val amountMinor = Math.round(amountMajor * 100.0)
        if (customerId.isBlank() || amountMinor <= 0L) {
            _uiState.update { it.copy(errorMessage = "Customer and positive payment amount are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val allocations = if (!invoiceId.isNullOrBlank()) {
                    val inv = _uiState.value.invoices.firstOrNull { it.id == invoiceId }
                    val allocMinor = if (inv != null && inv.balanceDueMinor > 0L) {
                        minOf(amountMinor, inv.balanceDueMinor)
                    } else {
                        amountMinor
                    }
                    listOf(PaymentAllocationInputDto(invoiceId = invoiceId, allocatedMinor = allocMinor))
                } else {
                    emptyList()
                }

                val resp = workspaceApiService.recordPayment(
                    RecordPaymentRequestDto(
                        idempotencyKey = "pay-${UUID.randomUUID()}",
                        customerId = customerId,
                        paymentMethod = paymentMethod.apiValue,
                        currency = preferredCurrency.value,
                        amountMinor = amountMinor,
                        referenceNo = referenceNo?.trim()?.ifBlank { null },
                        allocations = allocations,
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Recorded ${paymentMethod.label} receipt ${resp.payment.receiptNumber}.",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to record payment.")
                }
            }
        }
    }

    fun saveDraftExpenseOffline(
        category: String,
        description: String,
        amountMajor: Double,
        paymentMethod: PaymentMethodOption,
        referenceNo: String?,
    ) {
        val amountMinor = Math.round(amountMajor * 100.0)
        if (orgId.isBlank() || description.trim().length < 3 || amountMinor <= 0L) {
            _uiState.update { it.copy(errorMessage = "Expense description (>=3 chars) and positive amount are required.") }
            return
        }
        viewModelScope.launch {
            val entity = DraftExpenseEntity(
                id = UUID.randomUUID().toString(),
                organizationId = orgId,
                category = category,
                description = description.trim(),
                amountMinor = amountMinor,
                currency = preferredCurrency.value,
                paymentMethod = paymentMethod.apiValue,
                referenceNo = referenceNo?.trim()?.ifBlank { null },
                status = "DRAFT",
                createdAtEpochMs = System.currentTimeMillis(),
            )
            offlineRepository.upsertDraftExpense(entity)
            _uiState.update {
                it.copy(statusMessage = "Saved offline draft expense in Room (${paymentMethod.label}).")
            }
        }
    }

    fun postExpenseOrSupplierPaymentNow(
        category: String,
        description: String,
        amountMajor: Double,
        paymentMethod: PaymentMethodOption,
        referenceNo: String?,
        draftIdToMarkPosted: String? = null,
    ) {
        val amountMinor = Math.round(amountMajor * 100.0)
        if (description.trim().length < 3 || amountMinor <= 0L) {
            _uiState.update { it.copy(errorMessage = "Description (>=3 chars) and positive amount are required.") }
            return
        }
        val isSupplierPayment = category == "supplier_payment"
        val debitAccountCode = if (isSupplierPayment) "2000" else "5100"
        val debitAccountName = if (isSupplierPayment) "Accounts Payable" else "Site & Operating Expenses"
        val refLabel = referenceNo?.trim()?.takeIf { it.isNotEmpty() }?.let { " · Ref: $it" }.orEmpty()
        val entryDesc = "[${paymentMethod.label}$refLabel] ${description.trim()}".take(295)

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val journal = workspaceApiService.postManualJournal(
                    ManualJournalRequestDto(
                        currency = preferredCurrency.value,
                        description = entryDesc,
                        lines = listOf(
                            JournalLineDto(
                                accountCode = debitAccountCode,
                                accountName = debitAccountName,
                                debitMinor = amountMinor,
                                creditMinor = 0L,
                            ),
                            JournalLineDto(
                                accountCode = "1010",
                                accountName = "Cash & Bank Clearing",
                                debitMinor = 0L,
                                creditMinor = amountMinor,
                            ),
                        ),
                    ),
                )
                if (!draftIdToMarkPosted.isNullOrBlank() && orgId.isNotBlank()) {
                    offlineRepository.markDraftExpensePosted(orgId, draftIdToMarkPosted)
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        statusMessage = "Posted ${journal.entryNumber} (${debitAccountCode} -> 1010 Cash & Bank).",
                    )
                }
                refresh()
            } catch (ex: Exception) {
                if (draftIdToMarkPosted == null && orgId.isNotBlank()) {
                    offlineRepository.upsertDraftExpense(
                        DraftExpenseEntity(
                            id = UUID.randomUUID().toString(),
                            organizationId = orgId,
                            category = category,
                            description = description.trim(),
                            amountMinor = amountMinor,
                            currency = preferredCurrency.value,
                            paymentMethod = paymentMethod.apiValue,
                            referenceNo = referenceNo?.trim()?.ifBlank { null },
                            status = "DRAFT",
                            createdAtEpochMs = System.currentTimeMillis(),
                        ),
                    )
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            statusMessage = "Network unavailable — saved expense draft in Room for posting when online.",
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to post journal.")
                    }
                }
            }
        }
    }

    fun deleteDraftExpense(id: String) {
        if (orgId.isBlank()) return
        viewModelScope.launch {
            offlineRepository.deleteDraftExpense(orgId, id)
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val summary = workspaceApiService.getFinanceSummary()
                val taxRules = runCatching { workspaceApiService.listTaxRules().taxRules }.getOrDefault(emptyList())
                val invoices = runCatching { workspaceApiService.listInvoices().invoices }.getOrDefault(emptyList())
                val payments = runCatching { workspaceApiService.listPayments().payments }.getOrDefault(emptyList())
                val creditNotes = runCatching { workspaceApiService.listCreditNotes().creditNotes }.getOrDefault(emptyList())
                val journals = runCatching { workspaceApiService.listJournals().journals }.getOrDefault(emptyList())
                val pos = runCatching { workspaceApiService.listPurchaseOrders().purchaseOrders }.getOrDefault(emptyList())
                val suppliers = runCatching { workspaceApiService.listSuppliers().suppliers }.getOrDefault(emptyList())

                _uiState.update {
                    it.copy(
                        summary = summary,
                        taxRules = taxRules,
                        invoices = invoices,
                        payments = payments,
                        creditNotes = creditNotes,
                        journals = journals,
                        purchaseOrders = pos,
                        suppliers = suppliers,
                        isRefreshing = false,
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        errorMessage = "Finance refresh failed · ${ex.message ?: "Offline"}",
                    )
                }
            }
        }
    }
}
