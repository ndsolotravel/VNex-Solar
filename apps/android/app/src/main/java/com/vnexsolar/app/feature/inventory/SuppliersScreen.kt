package com.vnexsolar.app.feature.inventory

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.PurchaseOrderDto
import java.util.Locale

@Composable
fun SuppliersScreen(
    canTransactInventory: Boolean,
    viewModel: InventoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val currency by viewModel.preferredCurrency.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    var showCreateSupplierDialog by remember { mutableStateOf(false) }
    var showCreatePoDialog by remember { mutableStateOf(false) }
    var receiveTargetPo by remember { mutableStateOf<PurchaseOrderDto?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Suppliers & Purchase Orders", style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = "Solar equipment procurement, PO issuance & goods receipts (GRN)",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isRefreshing) {
                Text(if (state.isRefreshing) "Syncing" else "Refresh")
            }
        }

        TabRow(selectedTabIndex = selectedTab) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("Purchase Orders (${state.purchaseOrders.size})") })
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, text = { Text("Suppliers (${state.suppliers.size})") })
        }

        state.statusMessage?.let { msg ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(msg, modifier = Modifier.padding(12.dp), color = VNexColors.NominalGreen, style = MaterialTheme.typography.bodyMedium)
            }
        }
        state.errorMessage?.let { err ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(err, modifier = Modifier.padding(12.dp), color = VNexColors.WarningAmber, style = MaterialTheme.typography.bodyMedium)
            }
        }

        if (selectedTab == 0) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (canTransactInventory) {
                    item {
                        Button(
                            onClick = { showCreatePoDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("+ Create Purchase Order") }
                    }
                }
                items(state.purchaseOrders, key = { it.id }) { po ->
                    val supplierName = state.suppliers.firstOrNull { it.id == po.supplierId }?.name ?: po.supplierId.take(8)
                    val whName = state.warehouses.firstOrNull { it.id == po.warehouseId }?.name ?: po.warehouseId.take(8)
                    VNexSurfaceCard {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(po.poNumber, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                Text(po.status.uppercase(Locale.US), style = MaterialTheme.typography.labelMedium)
                            }
                            Text(supplierName, style = MaterialTheme.typography.titleMedium)
                            VNexMetricRow("Warehouse", whName)
                            VNexMetricRow("Order Value", DomainConstants.formatMinorCurrency(po.totalAmountMinor, po.currency), showDivider = false)

                            po.items.forEach { item ->
                                Text(
                                    text = "• ${item.sku.ifBlank { item.equipmentCatalogId.take(6) }} ${item.modelName} — Received ${item.quantityReceived} / ${item.quantityOrdered}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            if (canTransactInventory) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (po.status == "draft") {
                                        Button(
                                            onClick = { viewModel.issuePurchaseOrder(po.id) },
                                            enabled = !state.isSubmitting,
                                        ) { Text("Issue PO") }
                                    }
                                    if (po.status == "issued" || po.status == "partially_received") {
                                        Button(
                                            onClick = { receiveTargetPo = po },
                                            enabled = !state.isSubmitting,
                                        ) { Text("Receive Goods (GRN)") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (canTransactInventory) {
                    item {
                        Button(
                            onClick = { showCreateSupplierDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("+ Add Solar Equipment Supplier") }
                    }
                }
                items(state.suppliers, key = { it.id }) { sup ->
                    VNexSurfaceCard {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(sup.supplierCode, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(sup.name, style = MaterialTheme.typography.titleMedium)
                            sup.contactName?.let { Text("Contact: $it", style = MaterialTheme.typography.bodyMedium) }
                            sup.phone?.let { Text("Phone: $it", style = MaterialTheme.typography.bodyMedium) }
                            sup.paymentTerms?.let { Text("Terms: $it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                }
            }
        }
    }

    if (showCreateSupplierDialog) {
        var name by remember { mutableStateOf("") }
        var contact by remember { mutableStateOf("") }
        var phone by remember { mutableStateOf("") }
        var email by remember { mutableStateOf("") }
        var terms by remember { mutableStateOf("Net 15 / Bank Transfer") }

        AlertDialog(
            onDismissRequest = { showCreateSupplierDialog = false },
            title = { Text("Add Supplier") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Supplier Company Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = contact, onValueChange = { contact = it }, label = { Text("Contact Person") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = terms, onValueChange = { terms = it }, label = { Text("Payment Terms") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createSupplier(name, contact, phone, email, terms)
                        showCreateSupplierDialog = false
                    },
                ) { Text("Save Supplier") }
            },
            dismissButton = {
                TextButton(onClick = { showCreateSupplierDialog = false }) { Text("Cancel") }
            },
        )
    }

    if (showCreatePoDialog) {
        var supId by remember { mutableStateOf(state.suppliers.firstOrNull()?.id.orEmpty()) }
        var whId by remember { mutableStateOf(state.warehouses.firstOrNull()?.id.orEmpty()) }
        var catId by remember { mutableStateOf(state.catalog.firstOrNull()?.id.orEmpty()) }
        var qty by remember { mutableStateOf("20") }
        var cost by remember { mutableStateOf("31000") }

        AlertDialog(
            onDismissRequest = { showCreatePoDialog = false },
            title = { Text("Create Purchase Order") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Supplier", style = MaterialTheme.typography.labelMedium)
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.suppliers.forEach { s ->
                            FilterChip(selected = supId == s.id, onClick = { supId = s.id }, label = { Text(s.name) })
                        }
                    }
                    Text("Warehouse", style = MaterialTheme.typography.labelMedium)
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.warehouses.forEach { w ->
                            FilterChip(selected = whId == w.id, onClick = { whId = w.id }, label = { Text(w.name) })
                        }
                    }
                    Text("Equipment SKU", style = MaterialTheme.typography.labelMedium)
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.catalog.forEach { c ->
                            FilterChip(
                                selected = catId == c.id,
                                onClick = {
                                    catId = c.id
                                    cost = (c.unitCostMinor / 100.0).toString()
                                },
                                label = { Text("${c.sku} (${c.modelName.take(15)})") },
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = qty, onValueChange = { qty = it }, label = { Text("Qty") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = cost, onValueChange = { cost = it }, label = { Text("Unit Cost ($currency)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createPurchaseOrder(
                            supplierId = supId,
                            warehouseId = whId,
                            equipmentCatalogId = catId,
                            quantityOrdered = qty.toDoubleOrNull() ?: 0.0,
                            unitCostMajor = cost.toDoubleOrNull() ?: 0.0,
                        )
                        showCreatePoDialog = false
                    },
                ) { Text("Create Draft PO") }
            },
            dismissButton = {
                TextButton(onClick = { showCreatePoDialog = false }) { Text("Cancel") }
            },
        )
    }

    receiveTargetPo?.let { po ->
        val firstLine = po.items.firstOrNull()
        var selectedItemId by remember { mutableStateOf(firstLine?.equipmentCatalogId.orEmpty()) }
        var qtyRec by remember {
            mutableStateOf(
                firstLine?.let { (it.quantityOrdered - it.quantityReceived).coerceAtLeast(1.0).toString() } ?: "1",
            )
        }
        var serialsCsv by remember { mutableStateOf("") }
        var notes by remember { mutableStateOf("Inspected at warehouse dock") }

        AlertDialog(
            onDismissRequest = { receiveTargetPo = null },
            title = { Text("Receive Goods · ${po.poNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        po.items.forEach { line ->
                            FilterChip(
                                selected = selectedItemId == line.equipmentCatalogId,
                                onClick = {
                                    selectedItemId = line.equipmentCatalogId
                                    qtyRec = (line.quantityOrdered - line.quantityReceived).coerceAtLeast(1.0).toString()
                                },
                                label = { Text(line.sku.ifBlank { line.modelName }) },
                            )
                        }
                    }
                    OutlinedTextField(value = qtyRec, onValueChange = { qtyRec = it }, label = { Text("Quantity Received") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = serialsCsv, onValueChange = { serialsCsv = it }, label = { Text("Serial Numbers (comma-separated, optional)") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("GRN Notes") }, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.receivePoGoods(
                            poId = po.id,
                            equipmentCatalogId = selectedItemId,
                            quantityReceived = qtyRec.toDoubleOrNull() ?: 0.0,
                            serialNumbersCsv = serialsCsv,
                            notes = notes,
                        )
                        receiveTargetPo = null
                    },
                ) { Text("Post GRN") }
            },
            dismissButton = {
                TextButton(onClick = { receiveTargetPo = null }) { Text("Cancel") }
            },
        )
    }
}
