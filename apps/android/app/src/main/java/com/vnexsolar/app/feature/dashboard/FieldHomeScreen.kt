package com.vnexsolar.app.feature.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.navigation.VNexRoutes
import com.vnexsolar.app.core.network.DashboardMonthPointDto
import kotlin.math.max

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FieldHomeScreen(
    pendingOutboxCount: Int = 0,
    isOnline: Boolean = true,
    onNavigate: (String) -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val preferredCurrency by viewModel.displayCurrency.collectAsState()
    val summary = state.summary
    val currency = summary?.currency ?: preferredCurrency

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Operations Dashboard",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Text(
                    text = if (state.isFromCache) "Cached offline snapshot" else "Live organization metrics",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.isRefreshing) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = viewModel::refresh) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh dashboard")
                }
            }
        }

        VNexOfflineStatusBanner(
            isOnline = isOnline,
            pendingOutboxCount = pendingOutboxCount,
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DashboardRange.entries.forEach { range ->
                FilterChip(
                    selected = state.selectedRange == range,
                    onClick = { viewModel.selectRange(range) },
                    label = { Text(range.label) },
                )
            }
        }

        if (!state.errorMessage.isNullOrBlank()) {
            Text(
                text = state.errorMessage!!,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        val kpis = summary?.kpis
        val kpiCards = buildList {
            add(DashboardKpiItem("Total Projects", (kpis?.totalProjects ?: 0).toString()))
            add(DashboardKpiItem("Active Installations", (kpis?.activeInstallations ?: 0).toString()))
            add(DashboardKpiItem("Completed Installations", (kpis?.completedInstallations ?: 0).toString()))
            add(DashboardKpiItem("Pending Quotations", (kpis?.pendingQuotations ?: 0).toString()))
            add(DashboardKpiItem("Upcoming Site Visits", (kpis?.upcomingSiteVisits ?: 0).toString()))
            add(DashboardKpiItem("Pending Maintenance", (kpis?.pendingMaintenance ?: 0).toString()))
            if (summary?.financialAccess != false) {
                add(
                    DashboardKpiItem(
                        "Total Sales",
                        DomainConstants.formatMinorCurrency(kpis?.totalSalesMinor ?: 0L, currency),
                    ),
                )
                add(
                    DashboardKpiItem(
                        "Outstanding Payments",
                        DomainConstants.formatMinorCurrency(kpis?.outstandingPaymentsMinor ?: 0L, currency),
                    ),
                )
                add(
                    DashboardKpiItem(
                        "Monthly Revenue",
                        DomainConstants.formatMinorCurrency(kpis?.monthlyRevenueMinor ?: 0L, currency),
                    ),
                )
                add(
                    DashboardKpiItem(
                        "Monthly Expenses",
                        DomainConstants.formatMinorCurrency(kpis?.monthlyExpensesMinor ?: 0L, currency),
                    ),
                )
                add(
                    DashboardKpiItem(
                        "Net Profit",
                        DomainConstants.formatMinorCurrency(kpis?.netProfitMinor ?: 0L, currency),
                    ),
                )
            }
            if (summary?.inventoryAccess != false) {
                add(
                    DashboardKpiItem(
                        "Inventory Value",
                        DomainConstants.formatMinorCurrency(kpis?.inventoryValueMinor ?: 0L, currency),
                    ),
                )
            }
        }

        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val columns = if (maxWidth >= 720.dp) 4 else 2
            val itemWidth = (maxWidth - (10.dp * (columns - 1))) / columns
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                kpiCards.forEach { card ->
                    VNexSurfaceCard(modifier = Modifier.width(itemWidth)) {
                        Column(
                            modifier = Modifier
                                .padding(12.dp)
                                .fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = card.label,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = card.value,
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }

        val series = summary?.monthlySeries.orEmpty()
        if (series.isNotEmpty() && summary?.financialAccess != false) {
            RevenueExpenseChartCard(
                series = series,
                currency = currency,
                selectedMonthIndex = state.selectedMonthIndex,
                onSelectMonth = viewModel::selectMonth,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Button(
                onClick = { onNavigate(VNexRoutes.SURVEYS) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Site Surveys", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                onClick = { onNavigate(VNexRoutes.ENGINEERING) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Solar Calc", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                onClick = { onNavigate(VNexRoutes.SYNC_QUEUE) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Sync", maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private data class DashboardKpiItem(
    val label: String,
    val value: String,
)

@Composable
private fun RevenueExpenseChartCard(
    series: List<DashboardMonthPointDto>,
    currency: String,
    selectedMonthIndex: Int?,
    onSelectMonth: (Int) -> Unit,
) {
    val revenueColor = VNexColors.NominalGreen
    val expenseColor = VNexColors.WarningAmber
    val maxVal = max(
        1L,
        series.maxOf { max(it.revenueMinor, it.expensesMinor) },
    ).toFloat()

    VNexSurfaceCard {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "6-Month Revenue vs Expenses",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = "Tap bar",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp),
            ) {
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(series) {
                            detectTapGestures { offset ->
                                if (series.isNotEmpty()) {
                                    val groupWidth = size.width.toFloat() / series.size.toFloat()
                                    val idx = (offset.x / groupWidth).toInt().coerceIn(0, series.lastIndex)
                                    onSelectMonth(idx)
                                }
                            }
                        },
                ) {
                    val groupWidth = size.width / series.size.toFloat()
                    val barWidth = (groupWidth * 0.28f).coerceAtLeast(8f)
                    val gap = barWidth * 0.25f
                    val chartHeight = size.height - 12f

                    series.forEachIndexed { idx, point ->
                        val centerX = groupWidth * idx + groupWidth / 2f
                        val revRatio = (point.revenueMinor.toFloat() / maxVal).coerceIn(0f, 1f)
                        val expRatio = (point.expensesMinor.toFloat() / maxVal).coerceIn(0f, 1f)
                        val revHeight = max(6f, chartHeight * revRatio)
                        val expHeight = max(6f, chartHeight * expRatio)

                        drawRoundRect(
                            color = revenueColor,
                            topLeft = Offset(centerX - barWidth - gap / 2f, size.height - revHeight),
                            size = Size(barWidth, revHeight),
                            cornerRadius = CornerRadius(6f, 6f),
                        )
                        drawRoundRect(
                            color = expenseColor,
                            topLeft = Offset(centerX + gap / 2f, size.height - expHeight),
                            size = Size(barWidth, expHeight),
                            cornerRadius = CornerRadius(6f, 6f),
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                series.forEachIndexed { idx, point ->
                    Text(
                        text = point.monthLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (selectedMonthIndex == idx) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }

            val inspected = selectedMonthIndex?.let { series.getOrNull(it) }
            if (inspected != null) {
                Text(
                    text = "${inspected.monthLabel}: Revenue ${DomainConstants.formatMinorCurrency(inspected.revenueMinor, currency)} · Expenses ${DomainConstants.formatMinorCurrency(inspected.expensesMinor, currency)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        text = "Revenue",
                        style = MaterialTheme.typography.labelMedium,
                        color = revenueColor,
                    )
                    Spacer(modifier = Modifier.size(4.dp))
                    Text(
                        text = "Expenses",
                        style = MaterialTheme.typography.labelMedium,
                        color = expenseColor,
                    )
                }
            }
        }
    }
}
