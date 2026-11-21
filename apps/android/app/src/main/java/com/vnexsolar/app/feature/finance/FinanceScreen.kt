package com.vnexsolar.app.feature.finance

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.model.PaymentMethodOption
import com.vnexsolar.app.core.network.InvoiceRecordDto
import java.util.Locale

@Composable
fun FinanceScreen(
    canPostFinance: Boolean,
    viewModel: FinanceViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val currency by viewModel.preferredCurrency.collectAsState()
    val customers by viewModel.customers.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val draftExpenses by viewModel.draftExpenses.collectAsState()

    var showCreateInvoiceDialog by remember { mutableStateOf(false) }
    var creditNoteTarget by remember { mutableStateOf<InvoiceRecordDto?>(null) }
    var creditAmountInput by remember { mutableStateOf("5000") }
    var creditReasonInput by remember { mutableStateOf("Site scope adjustment") }

    // Payment / Expense form state
    var selectedCustomerId by remember { mutableStateOf("") }
    var selectedInvoiceId by remember { mutableStateOf("") }
    var paymentMethod by remember { mutableStateOf(PaymentMethodOption.JAZZCASH) }
    var paymentAmountMajor by remember { mutableStateOf("50000") }
    var paymentRefNo by remember { mutableStateOf("") }

    var expenseCategory by remember { mutableStateOf("site_expense") }
    var expenseDesc by remember { mutableStateOf("") }
    var expenseAmountMajor by remember { mutableStateOf("12000") }
    var expenseMethod by remember { mutableStateOf(PaymentMethodOption.CASH) }
    var expenseRefNo by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Finance & Accounting", style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = "Receivables, Payables, P&L, Draft Expenses & Pakistan Payment Channels",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isRefreshing) {
                Text(if (state.isRefreshing) "Syncing" else "Refresh")
            }
        }

        ScrollableTabRow(
            selectedTabIndex = state.activeTab.ordinal,
            edgePadding = 12.dp,
        ) {
            FinanceTab.entries.forEach { tab ->
                Tab(
                    selected = state.activeTab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = { Text(tab.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
        }

        state.statusMessage?.let { msg ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(
                    text = msg,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = VNexColors.NominalGreen,
                )
            }
        }
        state.errorMessage?.let { err ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(
                    text = err,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = VNexColors.WarningAmber,
                )
            }
        }

        when (state.activeTab) {
            FinanceTab.OVERVIEW -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text("Profit & Loss and Cash Summary", style = MaterialTheme.typography.titleMedium)
                                VNexMetricRow("Issued Invoices (${state.summary.issuedInvoiceCount})", DomainConstants.formatMinorCurrency(state.summary.totalInvoicedMinor, currency))
                                VNexMetricRow("Customer Collections", DomainConstants.formatMinorCurrency(state.summary.totalCollectedMinor, currency))
                                VNexMetricRow("Credit Notes Issued", DomainConstants.formatMinorCurrency(state.summary.totalCreditedMinor, currency))
                                VNexMetricRow("Accounts Receivable (Open AR)", DomainConstants.formatMinorCurrency(state.summary.accountsReceivableMinor, currency))
                                VNexMetricRow("Supplier Payables (Open AP)", DomainConstants.formatMinorCurrency(state.accountsPayableMinor, currency))
                                VNexMetricRow("Posted Operating Expenses (5100)", DomainConstants.formatMinorCurrency(state.totalOperatingExpensesMinor, currency))
                                VNexMetricRow("Net Operating Profit (Excl. COGS)", DomainConstants.formatMinorCurrency(state.netProfitMinor, currency), showDivider = false)
                            }
                        }
                    }

                    item {
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text("Collections by Payment Method", style = MaterialTheme.typography.titleMedium)
                                Text(
                                    text = "Cash, Bank Transfer, JazzCash, and Easypaisa are recorded payment methods for reconciliation (no live gateway integration claimed).",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                val breakdown = state.paymentTotalsByMethod
                                PaymentMethodOption.entries.forEachIndexed { idx, method ->
                                    VNexMetricRow(
                                        label = method.label,
                                        value = DomainConstants.formatMinorCurrency(breakdown[method] ?: 0L, currency),
                                        showDivider = idx < PaymentMethodOption.entries.lastIndex,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            FinanceTab.INVOICES -> {
                val filteredInvoices = if (state.invoiceStatusFilter == null) {
                    state.invoices
                } else {
                    state.invoices.filter { it.status == state.invoiceStatusFilter }
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                listOf(null to "All", "draft" to "Draft", "issued" to "Issued", "partially_paid" to "Partial", "paid" to "Paid").forEach { (status, label) ->
                                    FilterChip(
                                        selected = state.invoiceStatusFilter == status,
                                        onClick = { viewModel.selectInvoiceFilter(status) },
                                        label = { Text(label) },
                                    )
                                }
                            }
                            if (canPostFinance) {
                                Button(onClick = { showCreateInvoiceDialog = true }) {
                                    Text("New")
                                }
                            }
                        }
                    }

                    items(filteredInvoices, key = { it.id }) { inv ->
                        val custName = customers.firstOrNull { it.id == inv.customerId }?.fullName ?: inv.customerId.take(8)
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("${inv.invoiceNumber} (${inv.invoiceType})", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                    Text(inv.status.uppercase(Locale.US), style = MaterialTheme.typography.labelMedium)
                                }
                                Text(custName, style = MaterialTheme.typography.titleMedium)
                                VNexMetricRow("Total", DomainConstants.formatMinorCurrency(inv.totalAmountMinor, inv.currency))
                                VNexMetricRow("Paid / Credited", "${DomainConstants.formatMinorCurrency(inv.amountPaidMinor, inv.currency)} / ${DomainConstants.formatMinorCurrency(inv.creditedAmountMinor, inv.currency)}")
                                VNexMetricRow("Balance Due (Due ${inv.dueDate})", DomainConstants.formatMinorCurrency(inv.balanceDueMinor, inv.currency), showDivider = false)

                                if (canPostFinance) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        if (inv.status == "draft") {
                                            Button(
                                                onClick = { viewModel.issueInvoice(inv.id) },
                                                enabled = !state.isSubmitting,
                                            ) { Text("Issue Invoice") }
                                        }
                                        if (inv.balanceDueMinor > 0L && inv.status in setOf("issued", "partially_paid")) {
                                            OutlinedButton(
                                                onClick = {
                                                    creditNoteTarget = inv
                                                    creditAmountInput = (inv.balanceDueMinor / 100L).coerceAtLeast(1L).toString()
                                                },
                                            ) { Text("Credit Note") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            FinanceTab.PAYMENTS_EXPENSES -> {
                val activeCustomerId = selectedCustomerId.ifBlank { customers.firstOrNull()?.id.orEmpty() }
                val openInvoices = state.invoices.filter { it.customerId == activeCustomerId && it.balanceDueMinor > 0L }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (canPostFinance) {
                        item {
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text("Record Customer Payment", style = MaterialTheme.typography.titleMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        customers.forEach { cust ->
                                            FilterChip(
                                                selected = activeCustomerId == cust.id,
                                                onClick = {
                                                    selectedCustomerId = cust.id
                                                    selectedInvoiceId = ""
                                                },
                                                label = { Text(cust.fullName) },
                                            )
                                        }
                                    }
                                    if (openInvoices.isNotEmpty()) {
                                        Text("Allocate to Invoice (Optional)", style = MaterialTheme.typography.labelMedium)
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            openInvoices.forEach { inv ->
                                                FilterChip(
                                                    selected = selectedInvoiceId == inv.id,
                                                    onClick = {
                                                        selectedInvoiceId = if (selectedInvoiceId == inv.id) "" else inv.id
                                                        paymentAmountMajor = (inv.balanceDueMinor / 100.0).toString()
                                                    },
                                                    label = { Text("${inv.invoiceNumber} (${DomainConstants.formatMinorCurrency(inv.balanceDueMinor, inv.currency)})") },
                                                )
                                            }
                                        }
                                    }
                                    Text("Recordable Payment Method", style = MaterialTheme.typography.labelMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        PaymentMethodOption.entries.forEach { opt ->
                                            FilterChip(
                                                selected = paymentMethod == opt,
                                                onClick = { paymentMethod = opt },
                                                label = { Text(opt.label) },
                                            )
                                        }
                                    }
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedTextField(
                                            value = paymentAmountMajor,
                                            onValueChange = { paymentAmountMajor = it },
                                            label = { Text("Amount ($currency)") },
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            singleLine = true,
                                            modifier = Modifier.weight(1f),
                                        )
                                        OutlinedTextField(
                                            value = paymentRefNo,
                                            onValueChange = { paymentRefNo = it },
                                            label = { Text("TID / Ref #") },
                                            singleLine = true,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                    Button(
                                        onClick = {
                                            viewModel.recordCustomerPayment(
                                                customerId = activeCustomerId,
                                                invoiceId = selectedInvoiceId.ifBlank { null },
                                                paymentMethod = paymentMethod,
                                                amountMajor = paymentAmountMajor.toDoubleOrNull() ?: 0.0,
                                                referenceNo = paymentRefNo,
                                            )
                                        },
                                        enabled = !state.isSubmitting && activeCustomerId.isNotBlank(),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text("Post ${paymentMethod.label} Receipt")
                                    }
                                }
                            }
                        }
                    }

                    item {
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text("Expense & Supplier Payment Entry (Offline-Draft Capable)", style = MaterialTheme.typography.titleMedium)
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    listOf(
                                        "site_expense" to "Site Expense",
                                        "supplier_payment" to "Supplier Payment",
                                        "transport" to "Transport",
                                        "labor" to "Site Labor",
                                    ).forEach { (cat, label) ->
                                        FilterChip(
                                            selected = expenseCategory == cat,
                                            onClick = { expenseCategory = cat },
                                            label = { Text(label) },
                                        )
                                    }
                                }
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    listOf(
                                        PaymentMethodOption.CASH,
                                        PaymentMethodOption.BANK_TRANSFER,
                                        PaymentMethodOption.JAZZCASH,
                                        PaymentMethodOption.EASYPAISA,
                                        PaymentMethodOption.CHEQUE,
                                    ).forEach { opt ->
                                        FilterChip(
                                            selected = expenseMethod == opt,
                                            onClick = { expenseMethod = opt },
                                            label = { Text(opt.label) },
                                        )
                                    }
                                }
                                OutlinedTextField(
                                    value = expenseDesc,
                                    onValueChange = { expenseDesc = it },
                                    label = { Text("Expense / Supplier Payment Description") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = expenseAmountMajor,
                                        onValueChange = { expenseAmountMajor = it },
                                        label = { Text("Amount ($currency)") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                    )
                                    OutlinedTextField(
                                        value = expenseRefNo,
                                        onValueChange = { expenseRefNo = it },
                                        label = { Text("Voucher / Ref") },
                                        singleLine = true,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    OutlinedButton(
                                        onClick = {
                                            viewModel.saveDraftExpenseOffline(
                                                category = expenseCategory,
                                                description = expenseDesc,
                                                amountMajor = expenseAmountMajor.toDoubleOrNull() ?: 0.0,
                                                paymentMethod = expenseMethod,
                                                referenceNo = expenseRefNo,
                                            )
                                            expenseDesc = ""
                                        },
                                        modifier = Modifier.weight(1f),
                                    ) { Text("Save Draft (Room)") }

                                    if (canPostFinance) {
                                        Button(
                                            onClick = {
                                                viewModel.postExpenseOrSupplierPaymentNow(
                                                    category = expenseCategory,
                                                    description = expenseDesc,
                                                    amountMajor = expenseAmountMajor.toDoubleOrNull() ?: 0.0,
                                                    paymentMethod = expenseMethod,
                                                    referenceNo = expenseRefNo,
                                                )
                                                expenseDesc = ""
                                            },
                                            enabled = !state.isSubmitting,
                                            modifier = Modifier.weight(1f),
                                        ) { Text("Post Journal") }
                                    }
                                }
                            }
                        }
                    }

                    if (draftExpenses.isNotEmpty()) {
                        item {
                            Text("Local Room Draft Expenses (${draftExpenses.size})", style = MaterialTheme.typography.titleMedium)
                        }
                        items(draftExpenses, key = { it.id }) { draft ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("${draft.category} · ${PaymentMethodOption.fromApi(draft.paymentMethod).label}", style = MaterialTheme.typography.labelMedium)
                                        Text(draft.status, style = MaterialTheme.typography.labelMedium, color = if (draft.status == "POSTED") VNexColors.NominalGreen else VNexColors.WarningAmber)
                                    }
                                    Text(draft.description, style = MaterialTheme.typography.bodyMedium)
                                    Text(DomainConstants.formatMinorCurrency(draft.amountMinor, draft.currency), style = MaterialTheme.typography.titleMedium)
                                    if (draft.status == "DRAFT") {
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            if (canPostFinance) {
                                                Button(
                                                    onClick = {
                                                        viewModel.postExpenseOrSupplierPaymentNow(
                                                            category = draft.category,
                                                            description = draft.description,
                                                            amountMajor = draft.amountMinor / 100.0,
                                                            paymentMethod = PaymentMethodOption.fromApi(draft.paymentMethod),
                                                            referenceNo = draft.referenceNo,
                                                            draftIdToMarkPosted = draft.id,
                                                        )
                                                    },
                                                ) { Text("Post Now") }
                                            }
                                            OutlinedButton(onClick = { viewModel.deleteDraftExpense(draft.id) }) {
                                                Text("Discard")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    item {
                        Text("Recorded Customer Receipts (${state.payments.size})", style = MaterialTheme.typography.titleMedium)
                    }
                    items(state.payments, key = { it.id }) { pay ->
                        val custName = customers.firstOrNull { it.id == pay.customerId }?.fullName ?: pay.customerId.take(8)
                        VNexSurfaceCard {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${pay.receiptNumber} · ${PaymentMethodOption.fromApi(pay.paymentMethod).label}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                    Text(custName, style = MaterialTheme.typography.titleMedium)
                                    pay.referenceNo?.let { ref ->
                                        Text("Ref: $ref", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Text(DomainConstants.formatMinorCurrency(pay.amountMinor, pay.currency), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }

            FinanceTab.LEDGERS -> {
                val customerLedgers = remember(state.invoices, state.payments, customers) {
                    viewModel.buildCustomerLedgers()
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        Text("Customer Accounts Receivable Ledgers", style = MaterialTheme.typography.titleMedium)
                    }
                    if (customerLedgers.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "No issued customer invoices or receipts yet.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        items(customerLedgers, key = { it.customerId }) { ledger ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(ledger.customerName, style = MaterialTheme.typography.titleMedium)
                                    VNexMetricRow("Invoiced (${ledger.invoiceCount})", DomainConstants.formatMinorCurrency(ledger.totalInvoicedMinor, currency))
                                    VNexMetricRow("Payments Received (${ledger.paymentCount})", DomainConstants.formatMinorCurrency(ledger.totalPaidMinor, currency))
                                    VNexMetricRow("Credit Notes", DomainConstants.formatMinorCurrency(ledger.totalCreditedMinor, currency))
                                    VNexMetricRow("Open Receivable", DomainConstants.formatMinorCurrency(ledger.openBalanceMinor, currency), showDivider = false)
                                }
                            }
                        }
                    }

                    item {
                        Text("Supplier Payables Summary", style = MaterialTheme.typography.titleMedium)
                    }
                    item {
                        VNexSurfaceCard {
                            Column(modifier = Modifier.padding(14.dp)) {
                                VNexMetricRow("Active PO Commitments", DomainConstants.formatMinorCurrency(state.totalPoCommitmentsMinor, currency))
                                VNexMetricRow("Settled AP Journals (2000)", DomainConstants.formatMinorCurrency(state.settledPayablesMinor, currency))
                                VNexMetricRow("Net Accounts Payable", DomainConstants.formatMinorCurrency(state.accountsPayableMinor, currency), showDivider = false)
                            }
                        }
                    }
                }
            }

            FinanceTab.JOURNALS -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.journals, key = { it.id }) { je ->
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("${je.entryNumber} · ${je.referenceType}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                    Text(DomainConstants.formatMinorCurrency(je.totalDebitMinor, je.currency), style = MaterialTheme.typography.labelMedium)
                                }
                                Text(je.description, style = MaterialTheme.typography.bodyMedium)
                                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                je.lines.forEach { line ->
                                    val dc = if (line.debitMinor > 0L) {
                                        "DR ${DomainConstants.formatMinorCurrency(line.debitMinor, je.currency)}"
                                    } else {
                                        "CR ${DomainConstants.formatMinorCurrency(line.creditMinor, je.currency)}"
                                    }
                                    VNexMetricRow("${line.accountCode} ${line.accountName}", dc, showDivider = false)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreateInvoiceDialog) {
        var invProjectId by remember { mutableStateOf(projects.firstOrNull()?.id.orEmpty()) }
        var invType by remember { mutableStateOf("advance") }
        var invDesc by remember { mutableStateOf("Solar System Milestone Billing") }
        var invAmount by remember { mutableStateOf("250000") }
        var selectedTaxRateBps by remember { mutableStateOf(state.taxRules.firstOrNull()?.rateBps ?: 0) }
        var selectedTaxId by remember { mutableStateOf(state.taxRules.firstOrNull()?.id) }

        AlertDialog(
            onDismissRequest = { showCreateInvoiceDialog = false },
            title = { Text("Create Draft Invoice") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Project", style = MaterialTheme.typography.labelMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        projects.forEach { proj ->
                            FilterChip(
                                selected = invProjectId == proj.id,
                                onClick = { invProjectId = proj.id },
                                label = { Text("${proj.projectCode}: ${proj.title.take(16)}") },
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("advance", "progress", "final").forEach { t ->
                            FilterChip(
                                selected = invType == t,
                                onClick = { invType = t },
                                label = { Text(t) },
                            )
                        }
                    }
                    OutlinedTextField(
                        value = invDesc,
                        onValueChange = { invDesc = it },
                        label = { Text("Line Description") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = invAmount,
                        onValueChange = { invAmount = it },
                        label = { Text("Amount ($currency)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (state.taxRules.isNotEmpty()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            state.taxRules.forEach { rule ->
                                FilterChip(
                                    selected = selectedTaxId == rule.id,
                                    onClick = {
                                        selectedTaxId = rule.id
                                        selectedTaxRateBps = rule.rateBps
                                    },
                                    label = { Text("${rule.code} (${rule.rateBps / 100}%)") },
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createDraftInvoice(
                            projectId = invProjectId,
                            invoiceType = invType,
                            description = invDesc,
                            quantity = 1.0,
                            unitPriceMajor = invAmount.toDoubleOrNull() ?: 0.0,
                            taxRuleId = selectedTaxId,
                            taxRateBps = selectedTaxRateBps,
                        )
                        showCreateInvoiceDialog = false
                    },
                ) { Text("Create Draft") }
            },
            dismissButton = {
                TextButton(onClick = { showCreateInvoiceDialog = false }) { Text("Cancel") }
            },
        )
    }

    creditNoteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { creditNoteTarget = null },
            title = { Text("Issue Credit Note · ${target.invoiceNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = creditAmountInput,
                        onValueChange = { creditAmountInput = it },
                        label = { Text("Credit Amount (${target.currency})") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = creditReasonInput,
                        onValueChange = { creditReasonInput = it },
                        label = { Text("Reason") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.issueCreditNote(
                            invoiceId = target.id,
                            amountMajor = creditAmountInput.toDoubleOrNull() ?: 0.0,
                            reason = creditReasonInput,
                        )
                        creditNoteTarget = null
                    },
                ) { Text("Issue Credit") }
            },
            dismissButton = {
                TextButton(onClick = { creditNoteTarget = null }) { Text("Cancel") }
            },
        )
    }
}
