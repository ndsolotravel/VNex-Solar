package com.vnexsolar.app.feature.quotations

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.QuotationSummaryWrapperDto
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuotationsScreen(
    canWriteQuotations: Boolean,
    canApproveQuotations: Boolean,
    canPostFinance: Boolean,
    viewModel: QuotationsViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val customers by viewModel.customers.collectAsState()

    var pdfPreviewBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var pdfPreviewTitle by remember { mutableStateOf("") }
    var approveDialogTarget by remember { mutableStateOf<QuotationSummaryWrapperDto?>(null) }
    var signoffNameInput by remember { mutableStateOf("") }
    var decisionNotesInput by remember { mutableStateOf("Commercial proposal reviewed & accepted") }

    val visibleQuotes = remember(state.quotations, state.filterStatus) {
        val filterApi = state.filterStatus.apiValue
        if (filterApi == null) state.quotations else state.quotations.filter { it.quotation.status == filterApi }
    }

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
                    Text("Quotations & Proposals", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        text = "BOM pricing, proportional GST, native PDF & Sharesheet export",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isRefreshing) {
                        Text(if (state.isRefreshing) "Syncing" else "Refresh")
                    }
                    if (canWriteQuotations) {
                        Button(onClick = { viewModel.openBuilder() }) {
                            Text("New")
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QuotationFilterStatus.entries.forEach { filter ->
                    FilterChip(
                        selected = state.filterStatus == filter,
                        onClick = { viewModel.selectFilter(filter) },
                        label = { Text(filter.label) },
                    )
                }
            }
        }

        state.statusMessage?.let { msg ->
            item {
                VNexSurfaceCard {
                    Text(
                        text = msg,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = VNexColors.NominalGreen,
                    )
                }
            }
        }

        state.errorMessage?.let { err ->
            item {
                VNexSurfaceCard {
                    Text(
                        text = err,
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = VNexColors.WarningAmber,
                    )
                }
            }
        }

        if (canWriteQuotations && state.solarDesigns.isNotEmpty()) {
            item {
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Import BOM from Solar Design", style = MaterialTheme.typography.titleMedium)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            state.solarDesigns.take(6).forEach { designItem ->
                                OutlinedButton(
                                    onClick = { viewModel.importBomFromDesign(designItem.design.id) },
                                    enabled = !state.isSubmitting,
                                ) {
                                    Text("${designItem.design.designCode} (${String.format(Locale.US, "%.1f", designItem.latestRevision.calculations.actualDcKwp)} kWp)")
                                }
                            }
                        }
                    }
                }
            }
        }

        if (visibleQuotes.isEmpty()) {
            item {
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text("No quotations found", style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = "Create a quotation directly or import a Bill of Materials from an engineering design.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            items(visibleQuotes, key = { it.quotation.id }) { wrapper ->
                val q = wrapper.quotation
                val rev = wrapper.latestRevision
                val projectTitle = projects.firstOrNull { it.id == q.projectId }?.title ?: q.projectId.take(8)
                val customerName = customers.firstOrNull { it.id == q.customerId }?.fullName ?: "Customer"

                VNexSurfaceCard(
                    modifier = Modifier.clickable { viewModel.selectQuotation(wrapper) },
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${q.quotationNumber} · Rev ${q.currentRevisionNumber}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(
                                text = q.status.uppercase(Locale.US),
                                style = MaterialTheme.typography.labelMedium,
                                color = when (q.status) {
                                    "approved" -> VNexColors.NominalGreen
                                    "rejected" -> VNexColors.CriticalRed
                                    "sent" -> MaterialTheme.colorScheme.primary
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        Text(
                            text = q.title,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "$customerName · $projectTitle",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (rev != null) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = "${rev.items.size} line items · Margin ${String.format(Locale.US, "%.1f%%", rev.grossMarginBps / 100.0)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Text(
                                    text = DomainConstants.formatMinorCurrency(rev.totalAmountMinor, q.currency),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Quotation Detail + PDF Preview/Print/Share + Convert to Invoice Dialog
    state.selectedQuotation?.let { selected ->
        val q = selected.quotation
        val rev = selected.latestRevision
        val projectTitle = projects.firstOrNull { it.id == q.projectId }?.title ?: "Solar EPC Project"
        val customerName = customers.firstOrNull { it.id == q.customerId }?.fullName ?: "Customer"

        AlertDialog(
            onDismissRequest = { viewModel.selectQuotation(null) },
            title = { Text("${q.quotationNumber} · ${q.status.uppercase(Locale.US)}") },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(q.title, style = MaterialTheme.typography.titleMedium)
                    Text("$customerName · $projectTitle", style = MaterialTheme.typography.bodyMedium)
                    if (rev != null) {
                        HorizontalDivider()
                        VNexMetricRow("Equipment & Material", DomainConstants.formatMinorCurrency(rev.equipmentSubtotalMinor, q.currency))
                        VNexMetricRow("Labor & Services", DomainConstants.formatMinorCurrency(rev.laborCostMinor, q.currency))
                        VNexMetricRow("Transport", DomainConstants.formatMinorCurrency(rev.transportCostMinor, q.currency))
                        VNexMetricRow("Discount", "- ${DomainConstants.formatMinorCurrency(rev.discountMinor, q.currency)}")
                        VNexMetricRow("Sales Tax", DomainConstants.formatMinorCurrency(rev.taxAmountMinor, q.currency))
                        VNexMetricRow("Grand Total", DomainConstants.formatMinorCurrency(rev.totalAmountMinor, q.currency), showDivider = false)

                        Text("Line Items (${rev.items.size})", style = MaterialTheme.typography.labelMedium)
                        rev.items.forEach { line ->
                            Text(
                                text = "• [${line.lineType}] ${line.description} (${line.quantity}x) = ${DomainConstants.formatMinorCurrency(line.lineTotalMinor, q.currency)}",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    HorizontalDivider()
                    Text("Native PDF & Sharing", style = MaterialTheme.typography.labelMedium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                val file = QuotationPdfExporter.exportPdfToCache(
                                    context,
                                    selected,
                                    viewModel.organizationName,
                                    customerName,
                                    projectTitle,
                                )
                                pdfPreviewTitle = "${q.quotationNumber} PDF Preview"
                                pdfPreviewBitmap = QuotationPdfExporter.renderFirstPageBitmap(file)
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Preview PDF")
                        }
                        OutlinedButton(
                            onClick = {
                                QuotationPdfExporter.printQuotationPdf(
                                    context,
                                    selected,
                                    viewModel.organizationName,
                                    customerName,
                                    projectTitle,
                                )
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Print")
                        }
                    }
                    Button(
                        onClick = {
                            QuotationPdfExporter.shareQuotationPdf(
                                context,
                                selected,
                                viewModel.organizationName,
                                customerName,
                                projectTitle,
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Share PDF via Sharesheet")
                    }

                    if (canWriteQuotations && q.status == "draft") {
                        OutlinedButton(
                            onClick = { viewModel.sendSelectedQuotation(q.id) },
                            enabled = !state.isSubmitting,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Send to Customer")
                        }
                    }
                    if (canApproveQuotations && (q.status == "draft" || q.status == "sent")) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Button(
                                onClick = { approveDialogTarget = selected },
                                enabled = !state.isSubmitting,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Approve")
                            }
                            OutlinedButton(
                                onClick = {
                                    viewModel.approveOrRejectSelected(
                                        quotationId = q.id,
                                        approve = false,
                                        customerSignoffName = null,
                                        notes = "Declined during commercial review",
                                    )
                                },
                                enabled = !state.isSubmitting,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Reject")
                            }
                        }
                    }
                    if (canPostFinance && q.status == "approved") {
                        Button(
                            onClick = { viewModel.convertSelectedToInvoice(selected, "advance") },
                            enabled = !state.isSubmitting,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Convert to Advance Invoice")
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.selectQuotation(null) }) { Text("Close") }
            },
        )
    }

    // Customer Signoff & Approval Dialog
    approveDialogTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { approveDialogTarget = null },
            title = { Text("Approve ${target.quotation.quotationNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = signoffNameInput,
                        onValueChange = { signoffNameInput = it },
                        label = { Text("Customer Signoff Name (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = decisionNotesInput,
                        onValueChange = { decisionNotesInput = it },
                        label = { Text("Approval Notes") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.approveOrRejectSelected(
                            quotationId = target.quotation.id,
                            approve = true,
                            customerSignoffName = signoffNameInput,
                            notes = decisionNotesInput,
                        )
                        approveDialogTarget = null
                    },
                ) { Text("Confirm Approval") }
            },
            dismissButton = {
                TextButton(onClick = { approveDialogTarget = null }) { Text("Cancel") }
            },
        )
    }

    // Native PdfRenderer Preview Dialog (Pure Compose Bitmap)
    pdfPreviewBitmap?.let { bitmap ->
        AlertDialog(
            onDismissRequest = { pdfPreviewBitmap = null },
            title = { Text(pdfPreviewTitle) },
            text = {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "Quotation PDF Preview",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(420.dp)
                        .background(Color.White),
                    contentScale = ContentScale.Fit,
                )
            },
            confirmButton = {
                TextButton(onClick = { pdfPreviewBitmap = null }) { Text("Close") }
            },
        )
    }

    // Quotation Builder Dialog
    if (state.builderOpen) {
        var newLineType by remember { mutableStateOf("equipment") }
        var newLineDesc by remember { mutableStateOf("") }
        var newLineQty by remember { mutableStateOf("1") }
        var newLineCost by remember { mutableStateOf("50000") }
        var newLinePrice by remember { mutableStateOf("65000") }
        var newLineTaxPct by remember { mutableStateOf("0") }
        val totals = state.computedTotals

        AlertDialog(
            onDismissRequest = { viewModel.closeBuilder() },
            title = { Text("Build Solar Quotation") },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Select Project", style = MaterialTheme.typography.labelMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        projects.forEach { proj ->
                            FilterChip(
                                selected = state.builderProjectId == proj.id,
                                onClick = { viewModel.updateBuilderMeta(projectId = proj.id, currency = proj.currency) },
                                label = { Text("${proj.projectCode}: ${proj.title.take(18)}") },
                            )
                        }
                    }

                    OutlinedTextField(
                        value = state.builderTitle,
                        onValueChange = { viewModel.updateBuilderMeta(title = it) },
                        label = { Text("Quotation Title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = state.builderDiscountMajor,
                            onValueChange = { viewModel.updateBuilderMeta(discountMajor = it) },
                            label = { Text("Discount (${state.builderCurrency})") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.builderValidityDays,
                            onValueChange = { viewModel.updateBuilderMeta(validityDays = it) },
                            label = { Text("Valid Days") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            modifier = Modifier.weight(0.7f),
                        )
                    }

                    HorizontalDivider()
                    Text("Current Lines (${state.builderItems.size})", style = MaterialTheme.typography.labelMedium)
                    state.builderItems.forEachIndexed { idx, line ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "${line.lineType.uppercase(Locale.US)}: ${line.description}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = "${line.quantity} × ${DomainConstants.formatMinorCurrency(line.unitPriceMinor, state.builderCurrency)} · Tax ${line.taxRateBps / 100}%",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (state.builderItems.size > 1) {
                                TextButton(onClick = { viewModel.removeLineItem(idx) }) { Text("Remove") }
                            }
                        }
                    }

                    HorizontalDivider()
                    Text("Add Line Item", style = MaterialTheme.typography.labelMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf("equipment", "material", "labor", "transport", "service").forEach { t ->
                            FilterChip(
                                selected = newLineType == t,
                                onClick = {
                                    newLineType = t
                                    if (t == "labor" || t == "service") newLineTaxPct = "16" else if (t == "equipment") newLineTaxPct = "0"
                                },
                                label = { Text(t) },
                            )
                        }
                    }
                    OutlinedTextField(
                        value = newLineDesc,
                        onValueChange = { newLineDesc = it },
                        label = { Text("Item / Service Description") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = newLineQty,
                            onValueChange = { newLineQty = it },
                            label = { Text("Qty") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(0.6f),
                        )
                        OutlinedTextField(
                            value = newLineCost,
                            onValueChange = { newLineCost = it },
                            label = { Text("Cost") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = newLinePrice,
                            onValueChange = { newLinePrice = it },
                            label = { Text("Price") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = newLineTaxPct,
                            onValueChange = { newLineTaxPct = it },
                            label = { Text("Tax%") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(0.6f),
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            viewModel.addLineItem(
                                lineType = newLineType,
                                description = newLineDesc,
                                quantity = newLineQty.toDoubleOrNull() ?: 1.0,
                                unitCostMajor = newLineCost.toDoubleOrNull() ?: 0.0,
                                unitPriceMajor = newLinePrice.toDoubleOrNull() ?: 0.0,
                                taxRateBps = ((newLineTaxPct.toDoubleOrNull() ?: 0.0) * 100.0).toInt(),
                            )
                            newLineDesc = ""
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("+ Add Line to Quotation")
                    }

                    HorizontalDivider()
                    VNexMetricRow("Subtotal", DomainConstants.formatMinorCurrency(totals.subtotalMinor, state.builderCurrency))
                    VNexMetricRow("Tax", DomainConstants.formatMinorCurrency(totals.taxAmountMinor, state.builderCurrency))
                    VNexMetricRow("Grand Total", DomainConstants.formatMinorCurrency(totals.totalAmountMinor, state.builderCurrency))
                    VNexMetricRow(
                        "Gross Profit",
                        "${DomainConstants.formatMinorCurrency(totals.grossProfitMinor, state.builderCurrency)} (${String.format(Locale.US, "%.1f%%", totals.grossMarginBps / 100.0)})",
                        showDivider = false,
                    )

                    OutlinedTextField(
                        value = state.builderTerms,
                        onValueChange = { viewModel.updateBuilderMeta(terms = it) },
                        label = { Text("Payment Terms & Conditions") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.saveQuotation(queueOfflineIfFailed = true) },
                    enabled = !state.isSubmitting,
                ) {
                    Text(if (state.isSubmitting) "Saving..." else "Save Quotation")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.closeBuilder() }) { Text("Cancel") }
            },
        )
    }
}
