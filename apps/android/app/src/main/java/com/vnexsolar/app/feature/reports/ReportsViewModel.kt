package com.vnexsolar.app.feature.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.model.PaymentMethodOption
import com.vnexsolar.app.core.network.DashboardMonthPointDto
import com.vnexsolar.app.core.network.DashboardSummaryResponseDto
import com.vnexsolar.app.core.network.FinanceSummaryDto
import com.vnexsolar.app.core.network.InvoiceRecordDto
import com.vnexsolar.app.core.network.JournalEntryDto
import com.vnexsolar.app.core.network.PaymentRecordDto
import com.vnexsolar.app.core.network.PurchaseOrderDto
import com.vnexsolar.app.core.network.StockBalanceDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CategoryValuationRow(
    val category: String,
    val totalQty: Double,
    val valuationMinor: Long,
)

data class ReportsUiState(
    val dashboard: DashboardSummaryResponseDto = DashboardSummaryResponseDto(),
    val financeSummary: FinanceSummaryDto = FinanceSummaryDto(),
    val invoices: List<InvoiceRecordDto> = emptyList(),
    val payments: List<PaymentRecordDto> = emptyList(),
    val journals: List<JournalEntryDto> = emptyList(),
    val purchaseOrders: List<PurchaseOrderDto> = emptyList(),
    val balances: List<StockBalanceDto> = emptyList(),
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    val monthlySeries: List<DashboardMonthPointDto>
        get() = dashboard.monthlySeries

    val netRecognizedRevenueMinor: Long
        get() = financeSummary.totalInvoicedMinor - financeSummary.totalCreditedMinor

    val postedExpensesMinor: Long
        get() = journals.flatMap { it.lines }
            .filter { it.accountCode.startsWith("5") }
            .sumOf { it.debitMinor - it.creditMinor }

    val netOperatingProfitMinor: Long
        get() = netRecognizedRevenueMinor - postedExpensesMinor

    val openPayablesMinor: Long
        get() {
            val commitments = purchaseOrders
                .filter { it.status in setOf("issued", "partially_received", "received") }
                .sumOf { it.totalAmountMinor }
            val settled = journals.flatMap { it.lines }
                .filter { it.accountCode == "2000" }
                .sumOf { it.debitMinor - it.creditMinor }
            return (commitments - settled).coerceAtLeast(0L)
        }

    val inventoryValuationByCategory: List<CategoryValuationRow>
        get() = balances.groupBy { it.category }
            .map { (category, rows) ->
                CategoryValuationRow(
                    category = category,
                    totalQty = rows.sumOf { it.onHandQty },
                    valuationMinor = rows.sumOf { Math.round(it.onHandQty * it.unitCostMinor.toDouble()) },
                )
            }
            .sortedByDescending { it.valuationMinor }

    val collectionsByChannel: List<Pair<PaymentMethodOption, Long>>
        get() = PaymentMethodOption.entries.map { opt ->
            opt to payments.filter { it.paymentMethod == opt.apiValue }.sumOf { it.amountMinor }
        }
}

@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    appPreferences: AppPreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportsUiState())
    val uiState: StateFlow<ReportsUiState> = _uiState.asStateFlow()

    val preferredCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val dashboard = workspaceApiService.getDashboardSummary("1y")
                val financeSummary = runCatching { workspaceApiService.getFinanceSummary() }.getOrDefault(FinanceSummaryDto())
                val invoices = runCatching { workspaceApiService.listInvoices().invoices }.getOrDefault(emptyList())
                val payments = runCatching { workspaceApiService.listPayments().payments }.getOrDefault(emptyList())
                val journals = runCatching { workspaceApiService.listJournals().journals }.getOrDefault(emptyList())
                val pos = runCatching { workspaceApiService.listPurchaseOrders().purchaseOrders }.getOrDefault(emptyList())
                val balances = runCatching { workspaceApiService.listInventoryBalances().balances }.getOrDefault(emptyList())

                _uiState.update {
                    it.copy(
                        dashboard = dashboard,
                        financeSummary = financeSummary,
                        invoices = invoices,
                        payments = payments,
                        journals = journals,
                        purchaseOrders = pos,
                        balances = balances,
                        isRefreshing = false,
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        errorMessage = "Unable to refresh reports · ${ex.message ?: "Offline"}",
                    )
                }
            }
        }
    }
}
