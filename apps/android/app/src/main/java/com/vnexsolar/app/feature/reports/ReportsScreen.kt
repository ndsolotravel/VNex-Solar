package com.vnexsolar.app.feature.reports

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants

@Composable
fun ReportsScreen(
    viewModel: ReportsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val currency by viewModel.preferredCurrency.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Reports & P&L Analytics", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        text = "Profit & Loss, Receivables/Payables & Inventory Valuation",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isRefreshing) {
                    Text(if (state.isRefreshing) "Syncing" else "Refresh")
                }
            }
        }

        state.errorMessage?.let { err ->
            item {
                VNexSurfaceCard {
                    Text(err, modifier = Modifier.padding(12.dp), color = VNexColors.WarningAmber, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        item {
            VNexSurfaceCard {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Profit & Loss Statement", style = MaterialTheme.typography.titleMedium)
                    VNexMetricRow("Gross Invoiced Revenue", DomainConstants.formatMinorCurrency(state.financeSummary.totalInvoicedMinor, currency))
                    VNexMetricRow("Less Credit Notes", "- ${DomainConstants.formatMinorCurrency(state.financeSummary.totalCreditedMinor, currency)}")
                    VNexMetricRow("Net Recognized Revenue", DomainConstants.formatMinorCurrency(state.netRecognizedRevenueMinor, currency))
                    VNexMetricRow("Posted Operating Expenses", DomainConstants.formatMinorCurrency(state.postedExpensesMinor, currency))
                    VNexMetricRow("Net Operating Profit", DomainConstants.formatMinorCurrency(state.netOperatingProfitMinor, currency), showDivider = false)
                }
            }
        }

        item {
            VNexSurfaceCard {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Working Capital: AR vs AP", style = MaterialTheme.typography.titleMedium)
                    VNexMetricRow("Accounts Receivable (Customers)", DomainConstants.formatMinorCurrency(state.financeSummary.accountsReceivableMinor, currency))
                    VNexMetricRow("Customer Collections", DomainConstants.formatMinorCurrency(state.financeSummary.totalCollectedMinor, currency))
                    VNexMetricRow("Accounts Payable (Suppliers)", DomainConstants.formatMinorCurrency(state.openPayablesMinor, currency))
                    VNexMetricRow("Stock Valuation (On Hand)", DomainConstants.formatMinorCurrency(state.dashboard.kpis.inventoryValueMinor, currency), showDivider = false)
                }
            }
        }

        if (state.monthlySeries.isNotEmpty()) {
            item {
                val peak = state.monthlySeries.maxOfOrNull { maxOf(it.revenueMinor, it.expensesMinor) }?.coerceAtLeast(1L) ?: 1L
                VNexSurfaceCard {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Monthly Revenue vs Expense Cashflow", style = MaterialTheme.typography.titleMedium)
                        state.monthlySeries.takeLast(6).forEach { point ->
                            val revFrac = (point.revenueMinor.toFloat() / peak.toFloat()).coerceIn(0.02f, 1f)
                            val expFrac = (point.expensesMinor.toFloat() / peak.toFloat()).coerceIn(0.02f, 1f)
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(point.monthLabel, style = MaterialTheme.typography.labelMedium)
                                    Text(
                                        text = "${DomainConstants.formatMinorCurrency(point.revenueMinor, currency)} / ${DomainConstants.formatMinorCurrency(point.expensesMinor, currency)}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(revFrac)
                                        .height(6.dp)
                                        .background(VNexColors.NominalGreen, RoundedCornerShape(3.dp)),
                                )
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(expFrac)
                                        .height(6.dp)
                                        .background(VNexColors.WarningAmber, RoundedCornerShape(3.dp)),
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            VNexSurfaceCard {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Collections by Payment Method", style = MaterialTheme.typography.titleMedium)
                    state.collectionsByChannel.forEachIndexed { idx, (method, total) ->
                        VNexMetricRow(
                            label = method.label,
                            value = DomainConstants.formatMinorCurrency(total, currency),
                            showDivider = idx < state.collectionsByChannel.lastIndex,
                        )
                    }
                }
            }
        }

        item {
            VNexSurfaceCard {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Inventory Valuation by Solar Category", style = MaterialTheme.typography.titleMedium)
                    val rows = state.inventoryValuationByCategory
                    if (rows.isEmpty()) {
                        Text("No stock valuation rows available.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        rows.forEachIndexed { idx, row ->
                            VNexMetricRow(
                                label = "${row.category} (${row.totalQty} units)",
                                value = DomainConstants.formatMinorCurrency(row.valuationMinor, currency),
                                showDivider = idx < rows.lastIndex,
                            )
                        }
                    }
                }
            }
        }
    }
}
