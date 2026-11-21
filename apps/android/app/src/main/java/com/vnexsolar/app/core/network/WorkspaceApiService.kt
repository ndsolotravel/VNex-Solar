package com.vnexsolar.app.core.network

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class DashboardKpisDto(
    val totalProjects: Int = 0,
    val activeInstallations: Int = 0,
    val completedInstallations: Int = 0,
    val pendingQuotations: Int = 0,
    val totalSalesMinor: Long = 0L,
    val outstandingPaymentsMinor: Long = 0L,
    val inventoryValueMinor: Long = 0L,
    val monthlyRevenueMinor: Long = 0L,
    val monthlyExpensesMinor: Long = 0L,
    val netProfitMinor: Long = 0L,
    val upcomingSiteVisits: Int = 0,
    val pendingMaintenance: Int = 0,
)

@Serializable
data class DashboardMonthPointDto(
    val monthKey: String,
    val monthLabel: String,
    val revenueMinor: Long = 0L,
    val expensesMinor: Long = 0L,
)

@Serializable
data class DashboardSummaryResponseDto(
    val range: String = "30d",
    val currency: String = "PKR",
    val financialAccess: Boolean = false,
    val inventoryAccess: Boolean = false,
    val kpis: DashboardKpisDto = DashboardKpisDto(),
    val monthlySeries: List<DashboardMonthPointDto> = emptyList(),
    val generatedAt: String = "",
)

@Serializable
data class CustomerDto(
    val id: String,
    val organizationId: String,
    val customerCode: String,
    val customerType: String,
    val fullName: String,
    val companyName: String? = null,
    val primaryPhone: String? = null,
    val email: String? = null,
    val billingAddress: String? = null,
    val rowVersion: Int = 1,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class CustomersListResponseDto(
    val customers: List<CustomerDto> = emptyList(),
)

@Serializable
data class CreateCustomerRequestDto(
    val customerType: String = "residential",
    val fullName: String,
    val companyName: String? = null,
    val primaryPhone: String? = null,
    val email: String? = null,
    val billingAddress: String? = null,
)

@Serializable
data class SiteDto(
    val id: String,
    val organizationId: String,
    val customerId: String,
    val siteName: String,
    val addressLine: String,
    val city: String,
    val countryCode: String = "PK",
    val utilityProvider: String? = null,
    val meterReference: String? = null,
    val connectionPhase: String = "three",
    val rowVersion: Int = 1,
    val createdAt: String = "",
)

@Serializable
data class SitesListResponseDto(
    val sites: List<SiteDto> = emptyList(),
)

@Serializable
data class CreateSiteRequestDto(
    val siteName: String,
    val addressLine: String,
    val city: String,
    val countryCode: String = "PK",
    val utilityProvider: String? = null,
    val meterReference: String? = null,
    val connectionPhase: String = "three",
)

@Serializable
data class ProjectDto(
    val id: String,
    val organizationId: String,
    val customerId: String,
    val siteId: String,
    val projectCode: String,
    val title: String,
    val systemType: String = "hybrid",
    val targetCapacityKwp: Double? = null,
    val currentStage: String = "survey_scheduled",
    val status: String = "active",
    val currency: String = "PKR",
    val assignedUserIds: List<String> = emptyList(),
    val rowVersion: Int = 1,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class ProjectsListResponseDto(
    val projects: List<ProjectDto> = emptyList(),
)

@Serializable
data class CreateProjectRequestDto(
    val customerId: String,
    val siteId: String,
    val title: String,
    val systemType: String = "hybrid",
    val targetCapacityKwp: Double? = null,
    val currency: String = "PKR",
)

@Serializable
data class ProjectSurveyRefDto(
    val id: String,
    val surveyStatus: String = "draft",
    val surveyedAt: String = "",
    val earthingAvailable: Boolean = false,
    val notes: String = "",
)

@Serializable
data class SurveysListResponseDto(
    val surveys: List<ProjectSurveyRefDto> = emptyList(),
)

@Serializable
data class QuotationLineItemDto(
    val id: String? = null,
    val equipmentCatalogId: String? = null,
    val lineType: String = "equipment",
    val description: String,
    val quantity: Double,
    val unitCostMinor: Long = 0L,
    val unitPriceMinor: Long = 0L,
    val taxRateBps: Int = 0,
    val lineCostMinor: Long = 0L,
    val lineSubtotalMinor: Long = 0L,
    val lineTaxMinor: Long = 0L,
    val lineTotalMinor: Long = 0L,
)

@Serializable
data class QuotationRevisionDto(
    val id: String = "",
    val quotationId: String = "",
    val designRevisionId: String? = null,
    val revisionNumber: Int = 1,
    val status: String = "draft",
    val currency: String = "PKR",
    val validityDays: Int = 15,
    val termsAndConditions: String = "",
    val notes: String = "",
    val items: List<QuotationLineItemDto> = emptyList(),
    val equipmentSubtotalMinor: Long = 0L,
    val laborCostMinor: Long = 0L,
    val transportCostMinor: Long = 0L,
    val discountMinor: Long = 0L,
    val subtotalMinor: Long = 0L,
    val taxAmountMinor: Long = 0L,
    val totalAmountMinor: Long = 0L,
    val totalCostMinor: Long = 0L,
    val grossProfitMinor: Long = 0L,
    val grossMarginBps: Int = 0,
    val approvedAt: String? = null,
    val createdAt: String = "",
)

@Serializable
data class QuotationHeaderRefDto(
    val id: String,
    val quotationNumber: String,
    val title: String,
    val status: String,
    val currentRevisionNumber: Int,
    val currency: String = "PKR",
    val projectId: String = "",
    val customerId: String = "",
    val rowVersion: Int = 1,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class QuotationSummaryWrapperDto(
    val quotation: QuotationHeaderRefDto,
    val latestRevision: QuotationRevisionDto? = null,
)

@Serializable
data class QuotationsListResponseDto(
    val quotations: List<QuotationSummaryWrapperDto> = emptyList(),
)

@Serializable
data class InstallationJobRefDto(
    val id: String,
    val jobCode: String,
    val status: String,
    val scheduledStartDate: String,
    val safetyCleared: Boolean = false,
)

@Serializable
data class InstallationsListResponseDto(
    val jobs: List<InstallationJobRefDto> = emptyList(),
)

@Serializable
data class LoadProfileItemDto(
    val id: String,
    val applianceName: String,
    val quantity: Int,
    val ratedPowerW: Double,
    val dailyHours: Double,
    val isCriticalBackupLoad: Boolean = false,
    val surgeFactor: Double = 1.0,
)

@Serializable
data class SolarModuleSpecDto(
    val id: String,
    val modelName: String,
    val manufacturer: String,
    val pmaxW: Double,
    val vocV: Double,
    val vmpV: Double,
    val iscA: Double,
    val impA: Double,
    val tempCoeffVocPctPerC: Double,
    val tempCoeffPmaxPctPerC: Double,
    val maxSystemVoltageV: Double = 1500.0,
    val areaM2: Double = 2.58,
    val weightKg: Double = 27.5,
)

@Serializable
data class InverterSpecDto(
    val id: String,
    val modelName: String,
    val manufacturer: String,
    val inverterType: String,
    val ratedAcPowerW: Double,
    val maxDcInputW: Double,
    val maxDcVoltageV: Double,
    val mpptMinV: Double,
    val mpptMaxV: Double,
    val mpptCount: Int,
    val maxInputCurrentPerMpptA: Double,
    val efficiencyPct: Double = 97.6,
    val phases: String = "three",
)

@Serializable
data class BatterySpecDto(
    val id: String,
    val modelName: String,
    val manufacturer: String,
    val chemistry: String = "LFP",
    val nominalVoltageV: Double = 48.0,
    val capacityAh: Double = 100.0,
    val energyWh: Double = 4800.0,
    val maxDodPct: Double = 90.0,
    val roundTripEfficiencyPct: Double = 95.0,
)

@Serializable
data class EngineeringCatalogResponseDto(
    val modules: List<SolarModuleSpecDto> = emptyList(),
    val inverters: List<InverterSpecDto> = emptyList(),
    val batteries: List<BatterySpecDto> = emptyList(),
)

@Serializable
data class SolarDesignCalculationInputDto(
    val currency: String = "PKR",
    val loadProfiles: List<LoadProfileItemDto>? = null,
    val overrideDailyEnergyKwh: Double? = null,
    val overridePeakPowerKw: Double? = null,
    val overrideCriticalBackupKwh: Double? = null,
    val usableRoofAreaM2: Double,
    val shadingLossPct: Double = 3.0,
    val ambientMinTempC: Double,
    val ambientMaxTempC: Double,
    val cellTempRiseAboveAmbientC: Double? = 25.0,
    val peakSunHoursPerDay: Double,
    val tiltDegrees: Double,
    val azimuthDegrees: Double,
    val siteLatitudeDeg: Double? = 31.5,
    val windSpeedMs: Double? = 32.0,
    val module: SolarModuleSpecDto,
    val inverter: InverterSpecDto,
    val battery: BatterySpecDto? = null,
    val modulesInSeries: Int,
    val parallelStringsPerMppt: Int,
    val activeMpptCount: Int,
    val inverterCount: Int = 1,
    val batteryUnitsCount: Int? = null,
    val autonomyDays: Double? = 0.5,
    val dcCableOneWayLengthM: Double,
    val dcCableCrossSectionMm2: Double,
    val acCableOneWayLengthM: Double,
    val acCableCrossSectionMm2: Double,
    val acPowerFactor: Double? = 0.98,
    val performanceRatio: Double? = 0.80,
    val panelDegradationPctPerYear: Double? = 0.45,
    val gridEmissionFactorKgPerKwh: Double? = 0.58,
    val systemCapexAmount: Double,
    val gridTariffPerKwh: Double,
    val exportTariffPerKwh: Double,
    val tariffEscalationPctPerYear: Double? = 6.0,
    val annualOmCost: Double,
    val discountRatePct: Double? = 10.0,
)

@Serializable
data class SolarDesignCalculationOutputDto(
    val formulaVersion: String = "vnex-eng-v1.0.0",
    val dailyEnergyKwh: Double = 0.0,
    val requiredPvKwp: Double = 0.0,
    val totalPanelCount: Int = 0,
    val actualDcKwp: Double = 0.0,
    val dcAcRatio: Double = 1.0,
    val stringColdVocV: Double = 0.0,
    val vocLimitV: Double = 0.0,
    val vocOvervoltageFault: Boolean = false,
    val stringHotVmpV: Double = 0.0,
    val mpptWindowValid: Boolean = true,
    val expectedAnnualYieldKwh: Double = 0.0,
    val annualSolarOffsetPct: Double = 0.0,
    val recommendedBatteryUnits: Int = 0,
    val simplePaybackYears: Double? = null,
    val roi25YrPct: Double = 0.0,
    val safetyChecksPassed: Boolean = true,
    val hardSafetyErrors: List<String> = emptyList(),
    val engineeringWarnings: List<String> = emptyList(),
)

@Serializable
data class SolarDesignRecordDto(
    val id: String,
    val organizationId: String,
    val projectId: String,
    val siteSurveyId: String? = null,
    val designCode: String,
    val title: String,
    val currentRevisionNumber: Int = 1,
    val status: String = "draft",
    val rowVersion: Int = 1,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class DesignRevisionRecordDto(
    val id: String,
    val solarDesignId: String,
    val revisionNumber: Int,
    val status: String = "draft",
    val formulaVersion: String = "vnex-eng-v1.0.0",
    val calculations: SolarDesignCalculationOutputDto = SolarDesignCalculationOutputDto(),
    val notes: String = "",
    val approvedAt: String? = null,
    val createdAt: String = "",
)

@Serializable
data class SolarDesignListItemDto(
    val design: SolarDesignRecordDto,
    val latestRevision: DesignRevisionRecordDto,
)

@Serializable
data class SolarDesignsListResponseDto(
    val designs: List<SolarDesignListItemDto> = emptyList(),
)

@Serializable
data class CreateSolarDesignRequestDto(
    val projectId: String,
    val siteSurveyId: String? = null,
    val title: String,
    val notes: String? = null,
    val calculationInput: SolarDesignCalculationInputDto,
)

@Serializable
data class SolarDesignCreateResponseDto(
    val design: SolarDesignRecordDto,
    val revisions: List<DesignRevisionRecordDto> = emptyList(),
)

@Serializable
data class ReviewDesignRequestDto(
    val reviewNotes: String = "Verified on Android engineering workstation",
    val revisionNumber: Int? = null,
)

@Serializable
data class SolarDesignActionResponseDto(
    val design: SolarDesignRecordDto,
    val revision: DesignRevisionRecordDto,
)

// ==================== PHASE 5: QUOTATIONS ====================

@Serializable
data class CreateQuotationRequestDto(
    val projectId: String,
    val designRevisionId: String? = null,
    val title: String,
    val currency: String? = null,
    val validityDays: Int = 15,
    val termsAndConditions: String? = null,
    val notes: String? = null,
    val discountMinor: Long = 0L,
    val items: List<QuotationLineItemDto>,
)

@Serializable
data class QuotationCreateResponseDto(
    val quotation: QuotationHeaderRefDto,
    val revisions: List<QuotationRevisionDto> = emptyList(),
)

@Serializable
data class QuotationActionResponseDto(
    val quotation: QuotationHeaderRefDto,
    val revision: QuotationRevisionDto? = null,
)

@Serializable
data class BomDraftFromDesignResponseDto(
    val designId: String,
    val designRevisionId: String,
    val projectId: String,
    val customerId: String,
    val currency: String = "PKR",
    val title: String,
    val items: List<QuotationLineItemDto> = emptyList(),
)

@Serializable
data class ReviewQuotationRequestDto(
    val notes: String = "Approved by customer & commercial review",
    val customerSignoffName: String? = null,
    val revisionNumber: Int? = null,
)

// ==================== PHASE 5: FINANCE & ACCOUNTING ====================

@Serializable
data class FinanceSummaryDto(
    val issuedInvoiceCount: Int = 0,
    val totalInvoicedMinor: Long = 0L,
    val totalCollectedMinor: Long = 0L,
    val totalCreditedMinor: Long = 0L,
    val accountsReceivableMinor: Long = 0L,
    val postedJournalCount: Int = 0,
)

@Serializable
data class TaxRuleDto(
    val id: String,
    val code: String,
    val name: String,
    val rateBps: Int,
    val countryCode: String = "PK",
    val isActive: Boolean = true,
)

@Serializable
data class TaxRulesListResponseDto(
    val taxRules: List<TaxRuleDto> = emptyList(),
)

@Serializable
data class InvoiceItemDto(
    val id: String = "",
    val taxRuleId: String? = null,
    val description: String,
    val quantity: Double = 1.0,
    val unitPriceMinor: Long = 0L,
    val taxRateBps: Int = 0,
    val lineSubtotalMinor: Long = 0L,
    val taxAmountMinor: Long = 0L,
    val lineTotalMinor: Long = 0L,
)

@Serializable
data class InvoiceRecordDto(
    val id: String,
    val organizationId: String = "",
    val projectId: String,
    val customerId: String,
    val quotationRevisionId: String? = null,
    val invoiceNumber: String,
    val invoiceType: String = "advance",
    val status: String = "draft",
    val currency: String = "PKR",
    val subtotalMinor: Long = 0L,
    val taxAmountMinor: Long = 0L,
    val totalAmountMinor: Long = 0L,
    val amountPaidMinor: Long = 0L,
    val creditedAmountMinor: Long = 0L,
    val balanceDueMinor: Long = 0L,
    val dueDate: String = "",
    val issuedAt: String? = null,
    val items: List<InvoiceItemDto> = emptyList(),
    val rowVersion: Int = 1,
    val createdAt: String = "",
)

@Serializable
data class InvoicesListResponseDto(
    val invoices: List<InvoiceRecordDto> = emptyList(),
)

@Serializable
data class CreateInvoiceItemRequestDto(
    val description: String,
    val quantity: Double,
    val unitPriceMinor: Long,
    val taxRuleId: String? = null,
    val taxRateBps: Int = 0,
)

@Serializable
data class CreateInvoiceRequestDto(
    val projectId: String,
    val quotationRevisionId: String? = null,
    val invoiceType: String = "advance",
    val dueDate: String,
    val currency: String? = null,
    val items: List<CreateInvoiceItemRequestDto>,
)

@Serializable
data class InvoiceIssueResponseDto(
    val invoice: InvoiceRecordDto,
)

@Serializable
data class PaymentAllocationInputDto(
    val invoiceId: String,
    val allocatedMinor: Long,
)

@Serializable
data class PaymentAllocationDto(
    val id: String = "",
    val paymentId: String = "",
    val invoiceId: String,
    val allocatedMinor: Long,
)

@Serializable
data class PaymentRecordDto(
    val id: String,
    val customerId: String,
    val receiptNumber: String,
    val paymentMethod: String,
    val currency: String = "PKR",
    val amountMinor: Long,
    val referenceNo: String? = null,
    val idempotencyKey: String = "",
    val receivedAt: String = "",
    val allocations: List<PaymentAllocationDto> = emptyList(),
)

@Serializable
data class PaymentsListResponseDto(
    val payments: List<PaymentRecordDto> = emptyList(),
)

@Serializable
data class RecordPaymentRequestDto(
    val idempotencyKey: String,
    val customerId: String,
    val paymentMethod: String,
    val currency: String = "PKR",
    val amountMinor: Long,
    val referenceNo: String? = null,
    val allocations: List<PaymentAllocationInputDto> = emptyList(),
)

@Serializable
data class RecordPaymentResponseDto(
    val deduplicated: Boolean = false,
    val payment: PaymentRecordDto,
)

@Serializable
data class CreditNoteRecordDto(
    val id: String,
    val invoiceId: String,
    val creditNoteNumber: String,
    val reason: String,
    val currency: String = "PKR",
    val amountMinor: Long,
    val issuedAt: String = "",
)

@Serializable
data class CreditNotesListResponseDto(
    val creditNotes: List<CreditNoteRecordDto> = emptyList(),
)

@Serializable
data class IssueCreditNoteRequestDto(
    val invoiceId: String,
    val amountMinor: Long,
    val reason: String,
)

@Serializable
data class CreditNoteResponseDto(
    val creditNote: CreditNoteRecordDto,
    val invoice: InvoiceRecordDto,
)

@Serializable
data class JournalLineDto(
    val id: String = "",
    val accountCode: String,
    val accountName: String,
    val debitMinor: Long = 0L,
    val creditMinor: Long = 0L,
)

@Serializable
data class JournalEntryDto(
    val id: String,
    val entryNumber: String,
    val referenceType: String = "manual_adjustment",
    val referenceId: String = "",
    val status: String = "posted",
    val currency: String = "PKR",
    val description: String,
    val lines: List<JournalLineDto> = emptyList(),
    val totalDebitMinor: Long = 0L,
    val totalCreditMinor: Long = 0L,
    val postedAt: String = "",
)

@Serializable
data class JournalsListResponseDto(
    val journals: List<JournalEntryDto> = emptyList(),
)

@Serializable
data class ManualJournalRequestDto(
    val currency: String = "PKR",
    val description: String,
    val referenceId: String? = null,
    val lines: List<JournalLineDto>,
)

// ==================== PHASE 5: INVENTORY & SUPPLIERS ====================

@Serializable
data class WarehouseDto(
    val id: String,
    val code: String,
    val name: String,
    val address: String? = null,
    val isDefault: Boolean = false,
)

@Serializable
data class WarehousesListResponseDto(
    val warehouses: List<WarehouseDto> = emptyList(),
)

@Serializable
data class SupplierDto(
    val id: String,
    val supplierCode: String,
    val name: String,
    val contactName: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val paymentTerms: String? = null,
)

@Serializable
data class SuppliersListResponseDto(
    val suppliers: List<SupplierDto> = emptyList(),
)

@Serializable
data class CreateSupplierRequestDto(
    val name: String,
    val contactName: String? = null,
    val phone: String? = null,
    val email: String? = null,
    val paymentTerms: String? = null,
)

@Serializable
data class EquipmentCatalogItemDto(
    val id: String,
    val sku: String,
    val category: String,
    val manufacturerName: String,
    val modelName: String,
    val unitOfMeasure: String = "pcs",
    val unitCostMinor: Long = 0L,
    val unitSellPriceMinor: Long = 0L,
    val currency: String = "PKR",
    val warrantyMonths: Int = 12,
    val reorderLevel: Double = 5.0,
    val isSerialized: Boolean = true,
)

@Serializable
data class CatalogListResponseDto(
    val items: List<EquipmentCatalogItemDto> = emptyList(),
)

@Serializable
data class CreateCatalogItemRequestDto(
    val sku: String,
    val category: String,
    val manufacturerName: String,
    val modelName: String,
    val unitOfMeasure: String = "pcs",
    val unitCostMinor: Long,
    val unitSellPriceMinor: Long,
    val currency: String = "PKR",
    val warrantyMonths: Int = 12,
    val reorderLevel: Double = 5.0,
    val isSerialized: Boolean = true,
)

@Serializable
data class StockBalanceDto(
    val equipmentCatalogId: String,
    val sku: String,
    val modelName: String,
    val category: String,
    val warehouseId: String,
    val warehouseCode: String,
    val onHandQty: Double = 0.0,
    val reservedQty: Double = 0.0,
    val availableQty: Double = 0.0,
    val reorderLevel: Double = 0.0,
    val isLowStock: Boolean = false,
    val unitCostMinor: Long = 0L,
    val currency: String = "PKR",
)

@Serializable
data class InventoryBalancesResponseDto(
    val balances: List<StockBalanceDto> = emptyList(),
    val lowStockAlerts: List<StockBalanceDto> = emptyList(),
)

@Serializable
data class PurchaseOrderItemDto(
    val id: String = "",
    val equipmentCatalogId: String,
    val sku: String = "",
    val modelName: String = "",
    val quantityOrdered: Double,
    val quantityReceived: Double = 0.0,
    val unitCostMinor: Long,
)

@Serializable
data class PurchaseOrderDto(
    val id: String,
    val supplierId: String,
    val warehouseId: String,
    val poNumber: String,
    val status: String,
    val currency: String = "PKR",
    val totalAmountMinor: Long = 0L,
    val orderedAt: String? = null,
    val createdAt: String = "",
    val items: List<PurchaseOrderItemDto> = emptyList(),
)

@Serializable
data class PurchaseOrdersListResponseDto(
    val purchaseOrders: List<PurchaseOrderDto> = emptyList(),
)

@Serializable
data class CreatePoLineRequestDto(
    val equipmentCatalogId: String,
    val quantityOrdered: Double,
    val unitCostMinor: Long,
)

@Serializable
data class CreatePurchaseOrderRequestDto(
    val supplierId: String,
    val warehouseId: String,
    val currency: String = "PKR",
    val items: List<CreatePoLineRequestDto>,
)

@Serializable
data class ReceivePoGoodsRequestDto(
    val idempotencyKey: String,
    val equipmentCatalogId: String,
    val quantityReceived: Double,
    val serialNumbers: List<String>? = null,
    val notes: String? = null,
)

@Serializable
data class StockMovementDto(
    val id: String,
    val warehouseId: String,
    val equipmentCatalogId: String,
    val projectId: String? = null,
    val movementType: String,
    val quantityDelta: Double,
    val unitCostMinor: Long = 0L,
    val idempotencyKey: String = "",
    val notes: String? = null,
    val createdAt: String = "",
)

@Serializable
data class MovementsListResponseDto(
    val movements: List<StockMovementDto> = emptyList(),
)

@Serializable
data class EquipmentSerialDto(
    val id: String,
    val equipmentCatalogId: String,
    val warehouseId: String,
    val projectId: String? = null,
    val serialNumber: String,
    val status: String,
    val createdAt: String = "",
)

@Serializable
data class SerialsListResponseDto(
    val serials: List<EquipmentSerialDto> = emptyList(),
)

@Serializable
data class ReserveStockRequestDto(
    val idempotencyKey: String,
    val projectId: String,
    val warehouseId: String,
    val equipmentCatalogId: String,
    val quantity: Double,
)

@Serializable
data class ProjectStockActionRequestDto(
    val idempotencyKey: String,
    val projectId: String,
    val warehouseId: String,
    val equipmentCatalogId: String,
    val quantity: Double,
    val serialNumbers: List<String>? = null,
    val notes: String? = null,
)

@Serializable
data class WriteOffStockRequestDto(
    val idempotencyKey: String,
    val warehouseId: String,
    val equipmentCatalogId: String,
    val quantity: Double,
    val serialNumbers: List<String>? = null,
    val reason: String,
)

@Serializable
data class StockActionResponseDto(
    val deduplicated: Boolean = false,
    val movement: StockMovementDto? = null,
)

interface WorkspaceApiService {
    @GET("api/v1/dashboard/summary")
    suspend fun getDashboardSummary(@Query("range") range: String = "30d"): DashboardSummaryResponseDto

    @GET("api/v1/customers")
    suspend fun listCustomers(@Query("q") q: String? = null): CustomersListResponseDto

    @POST("api/v1/customers")
    suspend fun createCustomer(@Body request: CreateCustomerRequestDto): CustomerDto

    @GET("api/v1/customers/{id}/sites")
    suspend fun listCustomerSites(@Path("id") customerId: String): SitesListResponseDto

    @POST("api/v1/customers/{id}/sites")
    suspend fun createSite(
        @Path("id") customerId: String,
        @Body request: CreateSiteRequestDto,
    ): SiteDto

    @GET("api/v1/projects")
    suspend fun listProjects(): ProjectsListResponseDto

    @POST("api/v1/projects")
    suspend fun createProject(@Body request: CreateProjectRequestDto): ProjectDto

    @GET("api/v1/surveys")
    suspend fun listSurveys(@Query("projectId") projectId: String? = null): SurveysListResponseDto

    @GET("api/v1/quotations")
    suspend fun listQuotations(@Query("projectId") projectId: String? = null): QuotationsListResponseDto

    @POST("api/v1/quotations/from-design/{designId}")
    suspend fun buildQuotationBomFromDesign(@Path("designId") designId: String): BomDraftFromDesignResponseDto

    @POST("api/v1/quotations")
    suspend fun createQuotation(@Body request: CreateQuotationRequestDto): QuotationCreateResponseDto

    @POST("api/v1/quotations/{id}/send")
    suspend fun sendQuotation(@Path("id") quotationId: String): QuotationActionResponseDto

    @POST("api/v1/quotations/{id}/approve")
    suspend fun approveQuotation(
        @Path("id") quotationId: String,
        @Body request: ReviewQuotationRequestDto = ReviewQuotationRequestDto(),
    ): QuotationActionResponseDto

    @POST("api/v1/quotations/{id}/reject")
    suspend fun rejectQuotation(
        @Path("id") quotationId: String,
        @Body request: ReviewQuotationRequestDto,
    ): QuotationActionResponseDto

    @GET("api/v1/finance/summary")
    suspend fun getFinanceSummary(): FinanceSummaryDto

    @GET("api/v1/finance/tax-rules")
    suspend fun listTaxRules(): TaxRulesListResponseDto

    @GET("api/v1/finance/invoices")
    suspend fun listInvoices(@Query("projectId") projectId: String? = null): InvoicesListResponseDto

    @POST("api/v1/finance/invoices")
    suspend fun createInvoice(@Body request: CreateInvoiceRequestDto): InvoiceRecordDto

    @POST("api/v1/finance/invoices/{id}/issue")
    suspend fun issueInvoice(@Path("id") invoiceId: String): InvoiceIssueResponseDto

    @GET("api/v1/finance/payments")
    suspend fun listPayments(): PaymentsListResponseDto

    @POST("api/v1/finance/payments")
    suspend fun recordPayment(@Body request: RecordPaymentRequestDto): RecordPaymentResponseDto

    @GET("api/v1/finance/credit-notes")
    suspend fun listCreditNotes(): CreditNotesListResponseDto

    @POST("api/v1/finance/credit-notes")
    suspend fun issueCreditNote(@Body request: IssueCreditNoteRequestDto): CreditNoteResponseDto

    @GET("api/v1/finance/journals")
    suspend fun listJournals(): JournalsListResponseDto

    @POST("api/v1/finance/journals")
    suspend fun postManualJournal(@Body request: ManualJournalRequestDto): JournalEntryDto

    @GET("api/v1/inventory/warehouses")
    suspend fun listWarehouses(): WarehousesListResponseDto

    @GET("api/v1/inventory/suppliers")
    suspend fun listSuppliers(): SuppliersListResponseDto

    @POST("api/v1/inventory/suppliers")
    suspend fun createSupplier(@Body request: CreateSupplierRequestDto): SupplierDto

    @GET("api/v1/inventory/catalog")
    suspend fun listInventoryCatalog(@Query("category") category: String? = null): CatalogListResponseDto

    @POST("api/v1/inventory/catalog")
    suspend fun createInventoryCatalogItem(@Body request: CreateCatalogItemRequestDto): EquipmentCatalogItemDto

    @GET("api/v1/inventory/balances")
    suspend fun listInventoryBalances(): InventoryBalancesResponseDto

    @GET("api/v1/inventory/purchase-orders")
    suspend fun listPurchaseOrders(): PurchaseOrdersListResponseDto

    @POST("api/v1/inventory/purchase-orders")
    suspend fun createPurchaseOrder(@Body request: CreatePurchaseOrderRequestDto): PurchaseOrderDto

    @POST("api/v1/inventory/purchase-orders/{id}/issue")
    suspend fun issuePurchaseOrder(@Path("id") purchaseOrderId: String): PurchaseOrderDto

    @POST("api/v1/inventory/purchase-orders/{id}/receive")
    suspend fun receivePurchaseOrderGoods(
        @Path("id") purchaseOrderId: String,
        @Body request: ReceivePoGoodsRequestDto,
    ): StockActionResponseDto

    @POST("api/v1/inventory/reservations")
    suspend fun reserveStock(@Body request: ReserveStockRequestDto): StockActionResponseDto

    @POST("api/v1/inventory/issues")
    suspend fun issueStockToProject(@Body request: ProjectStockActionRequestDto): StockActionResponseDto

    @POST("api/v1/inventory/returns")
    suspend fun returnStockFromProject(@Body request: ProjectStockActionRequestDto): StockActionResponseDto

    @POST("api/v1/inventory/write-offs")
    suspend fun writeOffStock(@Body request: WriteOffStockRequestDto): StockActionResponseDto

    @GET("api/v1/inventory/movements")
    suspend fun listInventoryMovements(@Query("equipmentCatalogId") catalogId: String? = null): MovementsListResponseDto

    @GET("api/v1/inventory/serials")
    suspend fun listInventorySerials(
        @Query("q") query: String? = null,
        @Query("projectId") projectId: String? = null,
        @Query("status") status: String? = null,
    ): SerialsListResponseDto

    @GET("api/v1/installations")
    suspend fun listInstallations(@Query("projectId") projectId: String? = null): InstallationsListResponseDto

    @GET("api/v1/engineering/catalog")
    suspend fun getEngineeringCatalog(): EngineeringCatalogResponseDto

    @GET("api/v1/engineering/designs")
    suspend fun listSolarDesigns(@Query("projectId") projectId: String? = null): SolarDesignsListResponseDto

    @POST("api/v1/engineering/designs")
    suspend fun createSolarDesign(@Body request: CreateSolarDesignRequestDto): SolarDesignCreateResponseDto

    @POST("api/v1/engineering/designs/{id}/revisions/{revNumber}/submit")
    suspend fun submitSolarDesignRevision(
        @Path("id") designId: String,
        @Path("revNumber") revisionNumber: Int,
    ): SolarDesignActionResponseDto

    @POST("api/v1/engineering/designs/{id}/approve")
    suspend fun approveSolarDesign(
        @Path("id") designId: String,
        @Body request: ReviewDesignRequestDto = ReviewDesignRequestDto(),
    ): SolarDesignActionResponseDto

    @POST("api/v1/engineering/designs/{id}/reject")
    suspend fun rejectSolarDesign(
        @Path("id") designId: String,
        @Body request: ReviewDesignRequestDto,
    ): SolarDesignActionResponseDto

    // ==================== PHASE 7: COMMISSIONING, ASSETS & MAINTENANCE QR ====================

    @GET("api/v1/commissioning")
    suspend fun listCommissioning(@Query("projectId") projectId: String? = null): CommissioningListResponseDto

    @POST("api/v1/commissioning")
    suspend fun createCommissioning(@Body request: CreateCommissioningRequestDto): CommissioningRecordDetailDto

    @POST("api/v1/commissioning/{id}/tests")
    suspend fun addCommissioningTest(
        @Path("id") commissioningId: String,
        @Body request: AddCommissioningTestRequestDto,
    ): CommissioningAddTestResponseDto

    @POST("api/v1/commissioning/{id}/approve")
    suspend fun approveCommissioning(
        @Path("id") commissioningId: String,
        @Body request: ApproveRejectCommissioningRequestDto = ApproveRejectCommissioningRequestDto(),
    ): CommissioningRecordDetailDto

    @POST("api/v1/commissioning/{id}/reject")
    suspend fun rejectCommissioning(
        @Path("id") commissioningId: String,
        @Body request: ApproveRejectCommissioningRequestDto,
    ): CommissioningRecordDetailDto

    @POST("api/v1/commissioning/{id}/handovers/{handoverId}/acknowledge")
    suspend fun acknowledgeHandover(
        @Path("id") commissioningId: String,
        @Path("handoverId") handoverId: String,
        @Body request: AcknowledgeHandoverRequestDto,
    ): CommissioningRecordDetailDto

    @GET("api/v1/assets")
    suspend fun listAssets(@Query("projectId") projectId: String? = null): AssetsListResponseDto

    @GET("api/v1/assets/qr/{qrToken}")
    suspend fun lookupQrAsset(@Path("qrToken") qrToken: String): QrAssetWorkspaceResponseDto

    @GET("api/v1/maintenance/schedules")
    suspend fun listMaintenanceSchedules(@Query("projectId") projectId: String? = null): MaintenanceSchedulesResponseDto

    @GET("api/v1/maintenance/tickets")
    suspend fun listMaintenanceTickets(@Query("projectId") projectId: String? = null): ServiceTicketsResponseDto
}

@Serializable
data class CommissioningTestRecordDto(
    val id: String,
    val commissioningRecordId: String = "",
    val testName: String,
    val measuredValue: String,
    val passed: Boolean,
    val testedByUserId: String = "",
    val testedAt: String = "",
)

@Serializable
data class CommissioningApprovalRecordDto(
    val id: String,
    val commissioningRecordId: String = "",
    val approverUserId: String = "",
    val approverRole: String = "",
    val decision: String,
    val notes: String = "",
    val decidedAt: String = "",
)

@Serializable
data class HandoverDocumentRecordDto(
    val id: String,
    val commissioningRecordId: String = "",
    val documentTitle: String,
    val certificateNumber: String,
    val fileAttachmentId: String = "",
    val sha256Digest: String = "",
    val customerAcknowledgedAt: String? = null,
    val customerSignoffName: String? = null,
    val createdAt: String = "",
)

@Serializable
data class AssetRegisterRecordDto(
    val id: String,
    val projectId: String = "",
    val siteId: String = "",
    val equipmentCatalogId: String = "",
    val sku: String,
    val modelName: String,
    val serialNumber: String,
    val qrCodeToken: String,
    val installedOn: String = "",
    val warrantyExpiresOn: String? = null,
    val telemetryProvider: String? = null,
    val externalDeviceId: String? = null,
)

@Serializable
data class CommissioningRecordDetailDto(
    val id: String,
    val organizationId: String = "",
    val projectId: String,
    val installationJobId: String,
    val certificateCode: String,
    val status: String = "pending_safety",
    val safetyClearedSnapshot: Boolean = false,
    val commissionedAt: String? = null,
    val tests: List<CommissioningTestRecordDto> = emptyList(),
    val approvals: List<CommissioningApprovalRecordDto> = emptyList(),
    val handoverDocuments: List<HandoverDocumentRecordDto> = emptyList(),
    val generatedAssets: List<AssetRegisterRecordDto> = emptyList(),
    val rowVersion: Int = 1,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class CommissioningListResponseDto(
    val records: List<CommissioningRecordDetailDto> = emptyList(),
)

@Serializable
data class CommissioningAddTestResponseDto(
    val record: CommissioningRecordDetailDto,
    val test: CommissioningTestRecordDto,
)

@Serializable
data class AssetsListResponseDto(
    val assets: List<AssetRegisterRecordDto> = emptyList(),
)

@Serializable
data class CreateCommissioningRequestDto(
    val projectId: String,
    val installationJobId: String,
)

@Serializable
data class AddCommissioningTestRequestDto(
    val testName: String,
    val measuredValue: String,
    val passed: Boolean,
)

@Serializable
data class ApproveRejectCommissioningRequestDto(
    val notes: String = "Verified commissioning suite & safety clearance",
    val telemetryProvider: String? = "Solarman / Modbus TCP",
)

@Serializable
data class AcknowledgeHandoverRequestDto(
    val signoffName: String,
)

@Serializable
data class MaintenanceScheduleRecordDto(
    val id: String,
    val projectId: String,
    val scheduleType: String,
    val intervalDays: Int,
    val nextDueDate: String,
    val isActive: Boolean = true,
)

@Serializable
data class MaintenanceSchedulesResponseDto(
    val schedules: List<MaintenanceScheduleRecordDto> = emptyList(),
)

@Serializable
data class ServiceVisitRecordDto(
    val id: String,
    val visitedAt: String = "",
    val findings: String = "",
    val actionsTaken: String = "",
)

@Serializable
data class OfflineMaintenanceNoteDto(
    val id: String,
    val note: String = "",
    val syncedAt: String = "",
)

@Serializable
data class ServiceTicketRecordDto(
    val id: String,
    val projectId: String = "",
    val assetId: String? = null,
    val ticketNumber: String = "",
    val ticketType: String = "corrective",
    val priority: String = "medium",
    val status: String = "open",
    val summary: String = "",
    val description: String = "",
    val visits: List<ServiceVisitRecordDto> = emptyList(),
    val offlineNotes: List<OfflineMaintenanceNoteDto> = emptyList(),
)

@Serializable
data class ServiceTicketsResponseDto(
    val tickets: List<ServiceTicketRecordDto> = emptyList(),
)

@Serializable
data class WarrantyClaimRecordDto(
    val id: String,
    val assetId: String = "",
    val claimNumber: String = "",
    val status: String = "draft",
    val faultDescription: String = "",
    val replacementSerialNumber: String? = null,
)

@Serializable
data class QrAssetWorkspaceResponseDto(
    val asset: AssetRegisterRecordDto,
    val warrantyActive: Boolean = false,
    val tickets: List<ServiceTicketRecordDto> = emptyList(),
    val warrantyClaims: List<WarrantyClaimRecordDto> = emptyList(),
    val schedules: List<MaintenanceScheduleRecordDto> = emptyList(),
)

