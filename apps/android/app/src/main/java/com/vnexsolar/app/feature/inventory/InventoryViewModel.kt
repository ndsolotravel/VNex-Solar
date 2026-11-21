package com.vnexsolar.app.feature.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.CachedEquipmentEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.network.CreateCatalogItemRequestDto
import com.vnexsolar.app.core.network.CreatePoLineRequestDto
import com.vnexsolar.app.core.network.CreatePurchaseOrderRequestDto
import com.vnexsolar.app.core.network.CreateSupplierRequestDto
import com.vnexsolar.app.core.network.EquipmentCatalogItemDto
import com.vnexsolar.app.core.network.EquipmentSerialDto
import com.vnexsolar.app.core.network.ProjectStockActionRequestDto
import com.vnexsolar.app.core.network.PurchaseOrderDto
import com.vnexsolar.app.core.network.ReceivePoGoodsRequestDto
import com.vnexsolar.app.core.network.ReserveStockRequestDto
import com.vnexsolar.app.core.network.StockBalanceDto
import com.vnexsolar.app.core.network.StockMovementDto
import com.vnexsolar.app.core.network.SupplierDto
import com.vnexsolar.app.core.network.WarehouseDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.network.WriteOffStockRequestDto
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
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

enum class InventoryTab(val label: String) {
    STOCK("Stock & Alerts"),
    TRANSACT("Issue & Return"),
    SERIALS("Serials"),
    MOVEMENTS("Movements"),
}

enum class InventoryCategoryOption(val apiValue: String?, val label: String) {
    ALL(null, "All"),
    PV_MODULE("pv_module", "Solar Panels"),
    INVERTER("inverter", "Inverters"),
    BATTERY("battery", "Batteries"),
    MOUNTING("mounting", "Mounting"),
    CABLE("cable", "Cables"),
    BREAKER("breaker", "Protection"),
    EARTHING("earthing", "Earthing"),
    ACCESSORY("accessory", "Accessories"),
}

data class InventoryUiState(
    val activeTab: InventoryTab = InventoryTab.STOCK,
    val selectedCategory: InventoryCategoryOption = InventoryCategoryOption.ALL,
    val lowStockOnly: Boolean = false,
    val searchQuery: String = "",
    val warehouses: List<WarehouseDto> = emptyList(),
    val suppliers: List<SupplierDto> = emptyList(),
    val catalog: List<EquipmentCatalogItemDto> = emptyList(),
    val balances: List<StockBalanceDto> = emptyList(),
    val lowStockAlerts: List<StockBalanceDto> = emptyList(),
    val purchaseOrders: List<PurchaseOrderDto> = emptyList(),
    val movements: List<StockMovementDto> = emptyList(),
    val serials: List<EquipmentSerialDto> = emptyList(),
    val isRefreshing: Boolean = false,
    val isSubmitting: Boolean = false,
    val offlineMode: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
) {
    val totalValuationMinor: Long
        get() = balances.sumOf { Math.round(it.onHandQty * it.unitCostMinor.toDouble()) }
}

@HiltViewModel
class InventoryViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : ViewModel() {

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(InventoryUiState())
    val uiState: StateFlow<InventoryUiState> = _uiState.asStateFlow()

    val preferredCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    val projects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val cachedCatalog: StateFlow<List<CachedEquipmentEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeEquipmentCatalog(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        refresh()
    }

    fun selectTab(tab: InventoryTab) {
        _uiState.update { it.copy(activeTab = tab, errorMessage = null, statusMessage = null) }
    }

    fun selectCategory(category: InventoryCategoryOption) {
        _uiState.update { it.copy(selectedCategory = category) }
    }

    fun toggleLowStockOnly() {
        _uiState.update { it.copy(lowStockOnly = !it.lowStockOnly) }
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun createCatalogItem(
        sku: String,
        category: String,
        manufacturerName: String,
        modelName: String,
        unitOfMeasure: String,
        unitCostMajor: Double,
        unitSellPriceMajor: Double,
        reorderLevel: Double,
        isSerialized: Boolean,
    ) {
        if (sku.trim().length < 2 || modelName.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "SKU and Model Name (>=2 chars) are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val created = workspaceApiService.createInventoryCatalogItem(
                    CreateCatalogItemRequestDto(
                        sku = sku.trim(),
                        category = category,
                        manufacturerName = manufacturerName.trim().ifBlank { "VNex Partner" },
                        modelName = modelName.trim(),
                        unitOfMeasure = unitOfMeasure.trim().ifBlank { "pcs" },
                        unitCostMinor = Math.round(unitCostMajor.coerceAtLeast(0.0) * 100.0),
                        unitSellPriceMinor = Math.round(unitSellPriceMajor.coerceAtLeast(0.0) * 100.0),
                        currency = preferredCurrency.value,
                        reorderLevel = reorderLevel.coerceAtLeast(0.0),
                        isSerialized = isSerialized,
                    ),
                )
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Added SKU ${created.sku} (${created.modelName}).")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to create catalog item.")
                }
            }
        }
    }

    fun createSupplier(
        name: String,
        contactName: String?,
        phone: String?,
        email: String?,
        paymentTerms: String?,
    ) {
        if (name.trim().length < 2) {
            _uiState.update { it.copy(errorMessage = "Supplier name must be at least 2 characters.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val created = workspaceApiService.createSupplier(
                    CreateSupplierRequestDto(
                        name = name.trim(),
                        contactName = contactName?.trim()?.ifBlank { null },
                        phone = phone?.trim()?.ifBlank { null },
                        email = email?.trim()?.ifBlank { null },
                        paymentTerms = paymentTerms?.trim()?.ifBlank { null },
                    ),
                )
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Added supplier ${created.name} (${created.supplierCode}).")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to create supplier.")
                }
            }
        }
    }

    fun createPurchaseOrder(
        supplierId: String,
        warehouseId: String,
        equipmentCatalogId: String,
        quantityOrdered: Double,
        unitCostMajor: Double,
    ) {
        if (supplierId.isBlank() || warehouseId.isBlank() || equipmentCatalogId.isBlank() || quantityOrdered <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Supplier, Warehouse, Equipment SKU, and positive quantity are required.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val po = workspaceApiService.createPurchaseOrder(
                    CreatePurchaseOrderRequestDto(
                        supplierId = supplierId,
                        warehouseId = warehouseId,
                        currency = preferredCurrency.value,
                        items = listOf(
                            CreatePoLineRequestDto(
                                equipmentCatalogId = equipmentCatalogId,
                                quantityOrdered = quantityOrdered,
                                unitCostMinor = Math.round(unitCostMajor.coerceAtLeast(0.0) * 100.0),
                            ),
                        ),
                    ),
                )
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Created draft PO ${po.poNumber}.")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to create Purchase Order.")
                }
            }
        }
    }

    fun issuePurchaseOrder(poId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                val po = workspaceApiService.issuePurchaseOrder(poId)
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Issued ${po.poNumber} to supplier.")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Failed to issue PO.")
                }
            }
        }
    }

    fun receivePoGoods(
        poId: String,
        equipmentCatalogId: String,
        quantityReceived: Double,
        serialNumbersCsv: String,
        notes: String?,
    ) {
        if (quantityReceived <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Received quantity must be greater than zero.") }
            return
        }
        val serials = serialNumbersCsv.split(",", "\n")
            .map { it.trim() }
            .filter { it.length >= 2 }
            .ifEmpty { null }
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                workspaceApiService.receivePurchaseOrderGoods(
                    purchaseOrderId = poId,
                    request = ReceivePoGoodsRequestDto(
                        idempotencyKey = "grn-${UUID.randomUUID()}",
                        equipmentCatalogId = equipmentCatalogId,
                        quantityReceived = quantityReceived,
                        serialNumbers = serials,
                        notes = notes?.trim()?.ifBlank { null },
                    ),
                )
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Goods received (+${quantityReceived}) & stock balance updated.")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Goods receipt failed.")
                }
            }
        }
    }

    fun performStockTransaction(
        action: String, // reserve | issue | return | writeoff
        projectId: String,
        warehouseId: String,
        equipmentCatalogId: String,
        quantity: Double,
        serialNumbersCsv: String,
        notesOrReason: String,
    ) {
        if (warehouseId.isBlank() || equipmentCatalogId.isBlank() || quantity <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Warehouse, Equipment SKU, and positive quantity are required.") }
            return
        }
        if (action != "writeoff" && projectId.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Select a project for $action.") }
            return
        }
        if (action == "writeoff" && notesOrReason.trim().length < 3) {
            _uiState.update { it.copy(errorMessage = "Write-off reason (>=3 chars) is required.") }
            return
        }

        val serials = serialNumbersCsv.split(",", "\n")
            .map { it.trim() }
            .filter { it.length >= 2 }
            .ifEmpty { null }
        val idempotencyKey = "inv-$action-${UUID.randomUUID()}"

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, errorMessage = null) }
            try {
                when (action) {
                    "reserve" -> workspaceApiService.reserveStock(
                        ReserveStockRequestDto(
                            idempotencyKey = idempotencyKey,
                            projectId = projectId,
                            warehouseId = warehouseId,
                            equipmentCatalogId = equipmentCatalogId,
                            quantity = quantity,
                        ),
                    )
                    "issue" -> workspaceApiService.issueStockToProject(
                        ProjectStockActionRequestDto(
                            idempotencyKey = idempotencyKey,
                            projectId = projectId,
                            warehouseId = warehouseId,
                            equipmentCatalogId = equipmentCatalogId,
                            quantity = quantity,
                            serialNumbers = serials,
                            notes = notesOrReason.trim().ifBlank { null },
                        ),
                    )
                    "return" -> workspaceApiService.returnStockFromProject(
                        ProjectStockActionRequestDto(
                            idempotencyKey = idempotencyKey,
                            projectId = projectId,
                            warehouseId = warehouseId,
                            equipmentCatalogId = equipmentCatalogId,
                            quantity = quantity,
                            serialNumbers = serials,
                            notes = notesOrReason.trim().ifBlank { null },
                        ),
                    )
                    else -> workspaceApiService.writeOffStock(
                        WriteOffStockRequestDto(
                            idempotencyKey = idempotencyKey,
                            warehouseId = warehouseId,
                            equipmentCatalogId = equipmentCatalogId,
                            quantity = quantity,
                            serialNumbers = serials,
                            reason = notesOrReason.trim(),
                        ),
                    )
                }
                _uiState.update {
                    it.copy(isSubmitting = false, statusMessage = "Transactional stock $action recorded ($idempotencyKey).")
                }
                refresh()
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(isSubmitting = false, errorMessage = ex.message ?: "Stock transaction failed.")
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }
            try {
                val warehouses = workspaceApiService.listWarehouses().warehouses
                val suppliers = workspaceApiService.listSuppliers().suppliers
                val catalog = workspaceApiService.listInventoryCatalog().items
                val balancesResp = workspaceApiService.listInventoryBalances()
                val pos = workspaceApiService.listPurchaseOrders().purchaseOrders
                val movements = workspaceApiService.listInventoryMovements().movements
                val serials = workspaceApiService.listInventorySerials().serials

                if (orgId.isNotBlank() && catalog.isNotEmpty()) {
                    offlineRepository.cacheEquipmentCatalog(
                        catalog.map { item ->
                            CachedEquipmentEntity(
                                id = item.id,
                                organizationId = orgId,
                                sku = item.sku,
                                category = item.category,
                                modelName = "${item.manufacturerName} ${item.modelName}",
                                specsJson = "{}",
                                unitSellPriceDecimal = String.format(java.util.Locale.US, "%.2f", item.unitSellPriceMinor / 100.0),
                                currency = item.currency,
                                updatedAtEpochMs = System.currentTimeMillis(),
                            )
                        },
                    )
                }

                _uiState.update {
                    it.copy(
                        warehouses = warehouses,
                        suppliers = suppliers,
                        catalog = catalog,
                        balances = balancesResp.balances,
                        lowStockAlerts = balancesResp.lowStockAlerts,
                        purchaseOrders = pos,
                        movements = movements,
                        serials = serials,
                        isRefreshing = false,
                        offlineMode = false,
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        offlineMode = true,
                        errorMessage = "Showing cached Room inventory catalog · ${ex.message ?: "Offline"}",
                    )
                }
            }
        }
    }
}
