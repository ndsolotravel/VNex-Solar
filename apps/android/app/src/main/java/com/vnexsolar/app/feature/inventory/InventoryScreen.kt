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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.media.QrBarcodeScannerDialog
import com.vnexsolar.app.core.model.DomainConstants
import java.util.Locale

@Composable
fun InventoryScreen(
    canTransactInventory: Boolean,
    viewModel: InventoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val currency by viewModel.preferredCurrency.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val cachedCatalog by viewModel.cachedCatalog.collectAsState()

    var showAddSkuDialog by remember { mutableStateOf(false) }

    // Transaction tab state
    var txAction by remember { mutableStateOf("issue") }
    var txProjectId by remember { mutableStateOf("") }
    var txWarehouseId by remember { mutableStateOf("") }
    var txCatalogId by remember { mutableStateOf("") }
    var txQty by remember { mutableStateOf("2") }
    var txSerials by remember { mutableStateOf("") }
    var txNotes by remember { mutableStateOf("") }
    var scannerTarget by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Inventory & Stock", style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = "Solar panels, inverters, batteries, serials & low-stock alerts",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isRefreshing) {
                    Text(if (state.isRefreshing) "Syncing" else "Refresh")
                }
                if (canTransactInventory) {
                    Button(onClick = { showAddSkuDialog = true }) { Text("Add SKU") }
                }
            }
        }

        ScrollableTabRow(selectedTabIndex = state.activeTab.ordinal, edgePadding = 12.dp) {
            InventoryTab.entries.forEach { tab ->
                Tab(
                    selected = state.activeTab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = { Text(tab.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
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

        when (state.activeTab) {
            InventoryTab.STOCK -> {
                val query = state.searchQuery.trim().lowercase(Locale.US)
                val categoryApi = state.selectedCategory.apiValue
                val filteredBalances = state.balances.filter { b ->
                    val catOk = categoryApi == null || b.category == categoryApi
                    val lowOk = !state.lowStockOnly || b.isLowStock
                    val qOk = query.isEmpty() || b.sku.lowercase(Locale.US).contains(query) || b.modelName.lowercase(Locale.US).contains(query)
                    catOk && lowOk && qOk
                }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        VNexSurfaceCard {
                            Column(modifier = Modifier.padding(14.dp)) {
                                VNexMetricRow("Stock Valuation", DomainConstants.formatMinorCurrency(state.totalValuationMinor, currency))
                                VNexMetricRow("Active Low-Stock Alerts", "${state.lowStockAlerts.size} SKU(s)")
                                VNexMetricRow("Catalog SKUs", "${maxOf(state.catalog.size, cachedCatalog.size)}", showDivider = false)
                            }
                        }
                    }

                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedTextField(
                                value = state.searchQuery,
                                onValueChange = { viewModel.updateSearchQuery(it) },
                                label = { Text("Search SKU, model, or serial") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedButton(onClick = { scannerTarget = "search" }) {
                                Text("Scan")
                            }
                        }
                    }

                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            FilterChip(
                                selected = state.lowStockOnly,
                                onClick = { viewModel.toggleLowStockOnly() },
                                label = { Text("Low Stock (${state.lowStockAlerts.size})") },
                            )
                            InventoryCategoryOption.entries.forEach { cat ->
                                FilterChip(
                                    selected = state.selectedCategory == cat,
                                    onClick = { viewModel.selectCategory(cat) },
                                    label = { Text(cat.label) },
                                )
                            }
                        }
                    }

                    if (state.offlineMode && state.balances.isEmpty() && cachedCatalog.isNotEmpty()) {
                        items(cachedCatalog, key = { it.id }) { cached ->
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text("${cached.sku} · ${cached.category}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                    Text(cached.modelName, style = MaterialTheme.typography.titleMedium)
                                    Text("Cached Sell Price: ${cached.currency} ${cached.unitSellPriceDecimal}", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    } else {
                        items(filteredBalances, key = { "${it.warehouseId}:${it.equipmentCatalogId}" }) { bal ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("${bal.sku} · ${bal.warehouseCode}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                        Text(
                                            text = if (bal.isLowStock) "LOW STOCK" else "NOMINAL",
                                            style = MaterialTheme.typography.labelMedium,
                                            color = if (bal.isLowStock) VNexColors.CriticalRed else VNexColors.NominalGreen,
                                        )
                                    }
                                    Text(bal.modelName, style = MaterialTheme.typography.titleMedium)
                                    VNexMetricRow("On Hand / Reserved / Available", "${bal.onHandQty} / ${bal.reservedQty} / ${bal.availableQty}")
                                    VNexMetricRow("Reorder Level · Unit Cost", "${bal.reorderLevel} · ${DomainConstants.formatMinorCurrency(bal.unitCostMinor, bal.currency)}", showDivider = false)
                                }
                            }
                        }
                    }
                }
            }

            InventoryTab.TRANSACT -> {
                val activeWh = txWarehouseId.ifBlank { state.warehouses.firstOrNull()?.id.orEmpty() }
                val activeProj = txProjectId.ifBlank { projects.firstOrNull()?.id.orEmpty() }
                val activeCat = txCatalogId.ifBlank { state.catalog.firstOrNull()?.id.orEmpty() }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (!canTransactInventory) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "Read-only inventory role: inventory:transact permission required to issue, return, or write off stock.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        item {
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text("Idempotent Stock Transaction", style = MaterialTheme.typography.titleMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        listOf("reserve" to "Reserve", "issue" to "Issue to Project", "return" to "Return", "writeoff" to "Write-off").forEach { (key, label) ->
                                            FilterChip(
                                                selected = txAction == key,
                                                onClick = { txAction = key },
                                                label = { Text(label) },
                                            )
                                        }
                                    }

                                    Text("Warehouse", style = MaterialTheme.typography.labelMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        state.warehouses.forEach { wh ->
                                            FilterChip(
                                                selected = activeWh == wh.id,
                                                onClick = { txWarehouseId = wh.id },
                                                label = { Text("${wh.code}: ${wh.name}") },
                                            )
                                        }
                                    }

                                    if (txAction != "writeoff") {
                                        Text("Project", style = MaterialTheme.typography.labelMedium)
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .horizontalScroll(rememberScrollState()),
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            projects.forEach { proj ->
                                                FilterChip(
                                                    selected = activeProj == proj.id,
                                                    onClick = { txProjectId = proj.id },
                                                    label = { Text("${proj.projectCode}: ${proj.title.take(18)}") },
                                                )
                                            }
                                        }
                                    }

                                    Text("Equipment SKU", style = MaterialTheme.typography.labelMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        state.catalog.forEach { item ->
                                            FilterChip(
                                                selected = activeCat == item.id,
                                                onClick = { txCatalogId = item.id },
                                                label = { Text("${item.sku} (${item.modelName.take(18)})") },
                                            )
                                        }
                                    }

                                    OutlinedTextField(
                                        value = txQty,
                                        onValueChange = { txQty = it },
                                        label = { Text("Quantity") },
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                        singleLine = true,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        OutlinedTextField(
                                            value = txSerials,
                                            onValueChange = { txSerials = it },
                                            label = { Text("Serial Numbers (comma-separated, optional)") },
                                            modifier = Modifier.weight(1f),
                                        )
                                        OutlinedButton(onClick = { scannerTarget = "txSerial" }) {
                                            Text("Scan")
                                        }
                                    }
                                    OutlinedTextField(
                                        value = txNotes,
                                        onValueChange = { txNotes = it },
                                        label = { Text(if (txAction == "writeoff") "Write-off Reason (required)" else "Notes (optional)") },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    Button(
                                        onClick = {
                                            viewModel.performStockTransaction(
                                                action = txAction,
                                                projectId = activeProj,
                                                warehouseId = activeWh,
                                                equipmentCatalogId = activeCat,
                                                quantity = txQty.toDoubleOrNull() ?: 0.0,
                                                serialNumbersCsv = txSerials,
                                                notesOrReason = txNotes,
                                            )
                                        },
                                        enabled = !state.isSubmitting,
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text(if (state.isSubmitting) "Submitting..." else "Execute Transactional Stock Update")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            InventoryTab.SERIALS -> {
                val q = state.searchQuery.trim().lowercase(Locale.US)
                val visibleSerials = state.serials.filter { s ->
                    q.isEmpty() || s.serialNumber.lowercase(Locale.US).contains(q) || s.status.lowercase(Locale.US).contains(q)
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedTextField(
                                value = state.searchQuery,
                                onValueChange = { viewModel.updateSearchQuery(it) },
                                label = { Text("Filter Serial Number or Status") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedButton(onClick = { scannerTarget = "search" }) {
                                Text("Scan")
                            }
                        }
                    }
                    items(visibleSerials, key = { it.id }) { serial ->
                        val item = state.catalog.firstOrNull { it.id == serial.equipmentCatalogId }
                        VNexSurfaceCard {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(serial.serialNumber, style = MaterialTheme.typography.titleMedium)
                                    Text(item?.let { "${it.sku} · ${it.modelName}" } ?: serial.equipmentCatalogId.take(8), style = MaterialTheme.typography.bodyMedium)
                                }
                                Text(serial.status.uppercase(Locale.US), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }

            InventoryTab.MOVEMENTS -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.movements, key = { it.id }) { mov ->
                        val item = state.catalog.firstOrNull { it.id == mov.equipmentCatalogId }
                        VNexSurfaceCard {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(mov.movementType.uppercase(Locale.US), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                    Text(
                                        text = if (mov.quantityDelta >= 0) "+${mov.quantityDelta}" else "${mov.quantityDelta}",
                                        style = MaterialTheme.typography.titleMedium,
                                        color = if (mov.quantityDelta >= 0) VNexColors.NominalGreen else VNexColors.WarningAmber,
                                    )
                                }
                                Text(item?.let { "${it.sku} · ${it.modelName}" } ?: mov.equipmentCatalogId, style = MaterialTheme.typography.bodyMedium)
                                mov.notes?.let { n ->
                                    Text(n, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddSkuDialog) {
        var sku by remember { mutableStateOf("") }
        var category by remember { mutableStateOf("pv_module") }
        var manufacturer by remember { mutableStateOf("Longi Solar") }
        var modelName by remember { mutableStateOf("") }
        var costMajor by remember { mutableStateOf("31500") }
        var sellMajor by remember { mutableStateOf("36000") }
        var reorderLevel by remember { mutableStateOf("10") }
        var isSerialized by remember { mutableStateOf(true) }

        AlertDialog(
            onDismissRequest = { showAddSkuDialog = false },
            title = { Text("Add Solar Catalog SKU") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        InventoryCategoryOption.entries.filter { it.apiValue != null }.forEach { opt ->
                            FilterChip(
                                selected = category == opt.apiValue,
                                onClick = { category = opt.apiValue!! },
                                label = { Text(opt.label) },
                            )
                        }
                    }
                    OutlinedTextField(value = sku, onValueChange = { sku = it }, label = { Text("SKU Code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = manufacturer, onValueChange = { manufacturer = it }, label = { Text("Manufacturer") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = modelName, onValueChange = { modelName = it }, label = { Text("Model Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(value = costMajor, onValueChange = { costMajor = it }, label = { Text("Cost ($currency)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(value = sellMajor, onValueChange = { sellMajor = it }, label = { Text("Sell ($currency)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.weight(1f))
                    }
                    OutlinedTextField(value = reorderLevel, onValueChange = { reorderLevel = it }, label = { Text("Reorder Alert Threshold") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = isSerialized, onCheckedChange = { isSerialized = it })
                        Text("Track Serial Numbers")
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.createCatalogItem(
                            sku = sku,
                            category = category,
                            manufacturerName = manufacturer,
                            modelName = modelName,
                            unitOfMeasure = "pcs",
                            unitCostMajor = costMajor.toDoubleOrNull() ?: 0.0,
                            unitSellPriceMajor = sellMajor.toDoubleOrNull() ?: 0.0,
                            reorderLevel = reorderLevel.toDoubleOrNull() ?: 5.0,
                            isSerialized = isSerialized,
                        )
                        showAddSkuDialog = false
                    },
                ) { Text("Save SKU") }
            },
            dismissButton = {
                TextButton(onClick = { showAddSkuDialog = false }) { Text("Cancel") }
            },
        )
    }

    if (scannerTarget != null) {
        QrBarcodeScannerDialog(
            title = "Scan Equipment Serial / SKU Barcode",
            hint = "Align inverter, PV module, or battery serial barcode within camera frame.",
            onScanned = { rawCode ->
                val target = scannerTarget
                scannerTarget = null
                if (target == "txSerial") {
                    txSerials = if (txSerials.isBlank()) rawCode else "$txSerials, $rawCode"
                } else {
                    viewModel.updateSearchQuery(rawCode)
                }
            },
            onDismiss = { scannerTarget = null },
        )
    }
}
