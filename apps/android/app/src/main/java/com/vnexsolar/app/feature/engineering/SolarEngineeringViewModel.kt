package com.vnexsolar.app.feature.engineering

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.network.BatterySpecDto
import com.vnexsolar.app.core.network.CreateSolarDesignRequestDto
import com.vnexsolar.app.core.network.InverterSpecDto
import com.vnexsolar.app.core.network.LoadProfileItemDto
import com.vnexsolar.app.core.network.ReviewDesignRequestDto
import com.vnexsolar.app.core.network.SolarDesignCalculationInputDto
import com.vnexsolar.app.core.network.SolarDesignListItemDto
import com.vnexsolar.app.core.network.SolarModuleSpecDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class SolarEngineeringUiState(
    val designId: String = UUID.randomUUID().toString(),
    val selectedProjectId: String = "",
    val title: String = "12 kWp Hybrid Residential Array",
    val notes: String = "",
    val currency: String = "PKR",
    val selectedTabIndex: Int = 0,
    // Load calculator state
    val loadProfiles: List<ApplianceLoadItem> = EngineeringPresets.DEFAULT_APPLIANCES,
    val useManualLoadOverride: Boolean = false,
    val overrideDailyKwhText: String = "40",
    val overridePeakKwText: String = "8",
    val overrideCriticalKwhText: String = "12",
    // Catalog & presets
    val availableModules: List<ModuleSpecInput> = EngineeringPresets.MODULES,
    val availableInverters: List<InverterSpecInput> = EngineeringPresets.INVERTERS,
    val availableBatteries: List<BatterySpecInput> = EngineeringPresets.BATTERIES,
    val selectedModuleIndex: Int = 0,
    val selectedInverterIndex: Int = 0,
    val selectedBatteryIndex: Int = 0,
    val selectedCity: String = "Lahore",
    // Topology
    val modulesInSeriesText: String = "10",
    val parallelStringsText: String = "1",
    val activeMpptText: String = "2",
    val inverterCountText: String = "1",
    // Climate & Roof
    val ambientMinTempCText: String = "4",
    val ambientMaxTempCText: String = "46",
    val peakSunHoursText: String = "5.2",
    val siteLatitudeText: String = "31.5",
    val windSpeedMsText: String = "32",
    val usableRoofAreaM2Text: String = "120",
    val tiltDegreesText: String = "26",
    val azimuthDegreesText: String = "180",
    val shadingLossPctText: String = "3",
    val performanceRatioText: String = "0.80",
    // Battery & Cables
    val autonomyDaysText: String = "0.5",
    val batteryUnitsOverrideText: String = "",
    val dcCableLengthText: String = "28",
    val dcCableMm2Text: String = "6",
    val acCableLengthText: String = "18",
    val acCableMm2Text: String = "10",
    // Financial ROI
    val systemCapexText: String = "2450000",
    val gridTariffText: String = "62",
    val exportTariffText: String = "22",
    val annualOmCostText: String = "35000",
    val escalationPctText: String = "6",
    val discountRatePctText: String = "10",
    // Outputs & server sync state
    val loadSummary: LoadSummaryOutput = SolarCalculatorEngine.computeLoadSummary(EngineeringPresets.DEFAULT_APPLIANCES),
    val result: SolarCalcOutput = SolarCalculatorEngine.calculate(
        SolarCalcInput(
            currency = "PKR",
            loadProfiles = EngineeringPresets.DEFAULT_APPLIANCES,
            usableRoofAreaM2 = 120.0,
            shadingLossPct = 3.0,
            ambientMinTempC = 4.0,
            ambientMaxTempC = 46.0,
            peakSunHoursPerDay = 5.2,
            tiltDegrees = 26.0,
            azimuthDegrees = 180.0,
            siteLatitudeDeg = 31.5,
            windSpeedMs = 32.0,
            module = EngineeringPresets.MODULES.first(),
            inverter = EngineeringPresets.INVERTERS.first(),
            battery = EngineeringPresets.BATTERIES.first(),
            modulesInSeries = 10,
            parallelStringsPerMppt = 1,
            activeMpptCount = 2,
            inverterCount = 1,
            autonomyDays = 0.5,
            dcCableOneWayLengthM = 28.0,
            dcCableCrossSectionMm2 = 6.0,
            acCableOneWayLengthM = 18.0,
            acCableCrossSectionMm2 = 10.0,
            systemCapexAmount = 2_450_000.0,
            gridTariffPerKwh = 62.0,
            exportTariffPerKwh = 22.0,
            annualOmCost = 35_000.0,
        ),
    ),
    val savedDesigns: List<SolarDesignListItemDto> = emptyList(),
    val isLoadingDesigns: Boolean = false,
    val isSaving: Boolean = false,
    val savedMessage: String? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class SolarEngineeringViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    private val workspaceApiService: WorkspaceApiService,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val jsonCodec = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
    }

    private val orgId: String
        get() = sessionVault.currentSession?.organizationId ?: ""

    private val _uiState = MutableStateFlow(SolarEngineeringUiState())
    val uiState: StateFlow<SolarEngineeringUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val projects: StateFlow<List<ProjectEntity>> =
        (if (orgId.isBlank()) flowOf(emptyList()) else offlineRepository.observeProjects(orgId))
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        viewModelScope.launch {
            appPreferences.selectedCurrencyFlow.collect { currency ->
                updateStateAndRecalc { it.copy(currency = currency) }
            }
        }
        viewModelScope.launch {
            projects.collect { list ->
                if (_uiState.value.selectedProjectId.isBlank() && list.isNotEmpty()) {
                    _uiState.update { it.copy(selectedProjectId = list.first().id) }
                }
            }
        }
        refreshRemoteCatalogAndDesigns()
    }

    fun selectTab(index: Int) {
        _uiState.update { it.copy(selectedTabIndex = index.coerceIn(0, 4)) }
    }

    fun selectProject(projectId: String) {
        _uiState.update { it.copy(selectedProjectId = projectId, errorMessage = null) }
        refreshSavedDesigns(projectId)
    }

    fun updateTitleAndNotes(title: String = _uiState.value.title, notes: String = _uiState.value.notes) {
        _uiState.update { it.copy(title = title, notes = notes, savedMessage = null, errorMessage = null) }
    }

    fun selectModulePreset(index: Int) {
        updateStateAndRecalc {
            it.copy(selectedModuleIndex = index.coerceIn(0, maxOf(0, it.availableModules.lastIndex)))
        }
    }

    fun selectInverterPreset(index: Int) {
        updateStateAndRecalc {
            it.copy(selectedInverterIndex = index.coerceIn(0, maxOf(0, it.availableInverters.lastIndex)))
        }
    }

    fun selectBatteryPreset(index: Int) {
        updateStateAndRecalc {
            it.copy(selectedBatteryIndex = index.coerceIn(0, maxOf(0, it.availableBatteries.lastIndex)))
        }
    }

    fun applyCityPreset(preset: CitySolarPreset) {
        updateStateAndRecalc {
            it.copy(
                selectedCity = preset.city,
                siteLatitudeText = preset.latitudeDeg.toString(),
                peakSunHoursText = preset.peakSunHoursPerDay.toString(),
                ambientMinTempCText = preset.ambientMinTempC.toString(),
                ambientMaxTempCText = preset.ambientMaxTempC.toString(),
                windSpeedMsText = preset.windSpeedMs.toString(),
                tiltDegreesText = kotlin.math.max(5.0, preset.latitudeDeg - 4.0).toInt().toString(),
            )
        }
    }

    fun setManualLoadOverride(enabled: Boolean) {
        updateStateAndRecalc { it.copy(useManualLoadOverride = enabled) }
    }

    fun updateManualLoadFields(
        dailyKwh: String = _uiState.value.overrideDailyKwhText,
        peakKw: String = _uiState.value.overridePeakKwText,
        criticalKwh: String = _uiState.value.overrideCriticalKwhText,
    ) {
        updateStateAndRecalc {
            it.copy(
                overrideDailyKwhText = dailyKwh,
                overridePeakKwText = peakKw,
                overrideCriticalKwhText = criticalKwh,
            )
        }
    }

    fun addAppliance(
        name: String,
        quantity: Int,
        watts: Double,
        dailyHours: Double,
        isCritical: Boolean,
        surgeFactor: Double,
    ) {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return
        val newItem = ApplianceLoadItem(
            id = "app-${UUID.randomUUID().toString().take(8)}",
            applianceName = cleanName,
            quantity = quantity.coerceAtLeast(1),
            ratedPowerW = watts.coerceAtLeast(1.0),
            dailyHours = dailyHours.coerceIn(0.1, 24.0),
            isCriticalBackupLoad = isCritical,
            surgeFactor = surgeFactor.coerceIn(1.0, 6.0),
        )
        updateStateAndRecalc { cur ->
            cur.copy(loadProfiles = cur.loadProfiles + newItem)
        }
    }

    fun removeAppliance(id: String) {
        updateStateAndRecalc { cur ->
            cur.copy(loadProfiles = cur.loadProfiles.filterNot { it.id == id })
        }
    }

    fun toggleApplianceCritical(id: String) {
        updateStateAndRecalc { cur ->
            cur.copy(
                loadProfiles = cur.loadProfiles.map { item ->
                    if (item.id == id) item.copy(isCriticalBackupLoad = !item.isCriticalBackupLoad) else item
                },
            )
        }
    }

    fun incrementApplianceQty(id: String, delta: Int) {
        updateStateAndRecalc { cur ->
            cur.copy(
                loadProfiles = cur.loadProfiles.map { item ->
                    if (item.id == id) item.copy(quantity = (item.quantity + delta).coerceAtLeast(1)) else item
                },
            )
        }
    }

    fun updateTopology(
        series: String = _uiState.value.modulesInSeriesText,
        parallel: String = _uiState.value.parallelStringsText,
        mppt: String = _uiState.value.activeMpptText,
        inverterCount: String = _uiState.value.inverterCountText,
        minTemp: String = _uiState.value.ambientMinTempCText,
        maxTemp: String = _uiState.value.ambientMaxTempCText,
    ) {
        updateStateAndRecalc {
            it.copy(
                modulesInSeriesText = series,
                parallelStringsText = parallel,
                activeMpptText = mppt,
                inverterCountText = inverterCount,
                ambientMinTempCText = minTemp,
                ambientMaxTempCText = maxTemp,
            )
        }
    }

    fun updateStorageAndCables(
        autonomyDays: String = _uiState.value.autonomyDaysText,
        batteryUnitsOverride: String = _uiState.value.batteryUnitsOverrideText,
        dcLen: String = _uiState.value.dcCableLengthText,
        dcMm2: String = _uiState.value.dcCableMm2Text,
        acLen: String = _uiState.value.acCableLengthText,
        acMm2: String = _uiState.value.acCableMm2Text,
    ) {
        updateStateAndRecalc {
            it.copy(
                autonomyDaysText = autonomyDays,
                batteryUnitsOverrideText = batteryUnitsOverride,
                dcCableLengthText = dcLen,
                dcCableMm2Text = dcMm2,
                acCableLengthText = acLen,
                acCableMm2Text = acMm2,
            )
        }
    }

    fun updateRoofAndYield(
        roofAreaM2: String = _uiState.value.usableRoofAreaM2Text,
        tiltDeg: String = _uiState.value.tiltDegreesText,
        azimuthDeg: String = _uiState.value.azimuthDegreesText,
        shadingPct: String = _uiState.value.shadingLossPctText,
        peakSunHours: String = _uiState.value.peakSunHoursText,
        latitudeDeg: String = _uiState.value.siteLatitudeText,
        windSpeedMs: String = _uiState.value.windSpeedMsText,
        performanceRatio: String = _uiState.value.performanceRatioText,
    ) {
        updateStateAndRecalc {
            it.copy(
                usableRoofAreaM2Text = roofAreaM2,
                tiltDegreesText = tiltDeg,
                azimuthDegreesText = azimuthDeg,
                shadingLossPctText = shadingPct,
                peakSunHoursText = peakSunHours,
                siteLatitudeText = latitudeDeg,
                windSpeedMsText = windSpeedMs,
                performanceRatioText = performanceRatio,
            )
        }
    }

    fun updateFinancials(
        capex: String = _uiState.value.systemCapexText,
        gridTariff: String = _uiState.value.gridTariffText,
        exportTariff: String = _uiState.value.exportTariffText,
        annualOm: String = _uiState.value.annualOmCostText,
        escalationPct: String = _uiState.value.escalationPctText,
        discountPct: String = _uiState.value.discountRatePctText,
    ) {
        updateStateAndRecalc {
            it.copy(
                systemCapexText = capex,
                gridTariffText = gridTariff,
                exportTariffText = exportTariff,
                annualOmCostText = annualOm,
                escalationPctText = escalationPct,
                discountRatePctText = discountPct,
            )
        }
    }

    private fun updateStateAndRecalc(transform: (SolarEngineeringUiState) -> SolarEngineeringUiState) {
        _uiState.update { current ->
            val next = transform(current)
            val calcInput = buildCalcInput(next)
            val loadSummary = SolarCalculatorEngine.computeLoadSummary(next.loadProfiles)
            val output = SolarCalculatorEngine.calculate(calcInput)
            next.copy(
                loadSummary = loadSummary,
                result = output,
                savedMessage = null,
            )
        }
    }

    private fun buildCalcInput(s: SolarEngineeringUiState): SolarCalcInput {
        val mod = s.availableModules.getOrElse(s.selectedModuleIndex) { EngineeringPresets.MODULES.first() }
        val inv = s.availableInverters.getOrElse(s.selectedInverterIndex) { EngineeringPresets.INVERTERS.first() }
        val bat = if (inv.inverterType == "on_grid") {
            null
        } else {
            s.availableBatteries.getOrElse(s.selectedBatteryIndex) { EngineeringPresets.BATTERIES.first() }
        }
        val manualKwh = if (s.useManualLoadOverride) s.overrideDailyKwhText.toDoubleOrNull()?.coerceAtLeast(0.5) else null
        val manualPeakKw = if (s.useManualLoadOverride) s.overridePeakKwText.toDoubleOrNull()?.coerceAtLeast(0.2) else null
        val manualCritKwh = if (s.useManualLoadOverride) s.overrideCriticalKwhText.toDoubleOrNull()?.coerceAtLeast(0.0) else null
        val batUnitsOverride = s.batteryUnitsOverrideText.trim().toIntOrNull()?.coerceAtLeast(0)

        return SolarCalcInput(
            currency = s.currency,
            loadProfiles = if (s.useManualLoadOverride) emptyList() else s.loadProfiles,
            overrideDailyEnergyKwh = manualKwh,
            overridePeakPowerKw = manualPeakKw,
            overrideCriticalBackupKwh = manualCritKwh,
            usableRoofAreaM2 = (s.usableRoofAreaM2Text.toDoubleOrNull() ?: 120.0).coerceAtLeast(5.0),
            shadingLossPct = (s.shadingLossPctText.toDoubleOrNull() ?: 3.0).coerceIn(0.0, 90.0),
            ambientMinTempC = (s.ambientMinTempCText.toDoubleOrNull() ?: 4.0).coerceIn(-40.0, 55.0),
            ambientMaxTempC = (s.ambientMaxTempCText.toDoubleOrNull() ?: 46.0).coerceIn(-10.0, 65.0),
            peakSunHoursPerDay = (s.peakSunHoursText.toDoubleOrNull() ?: 5.2).coerceIn(1.0, 12.0),
            tiltDegrees = (s.tiltDegreesText.toDoubleOrNull() ?: 26.0).coerceIn(0.0, 90.0),
            azimuthDegrees = (s.azimuthDegreesText.toDoubleOrNull() ?: 180.0).coerceIn(0.0, 360.0),
            siteLatitudeDeg = (s.siteLatitudeText.toDoubleOrNull() ?: 31.5).coerceIn(-90.0, 90.0),
            windSpeedMs = (s.windSpeedMsText.toDoubleOrNull() ?: 32.0).coerceIn(5.0, 80.0),
            module = mod,
            inverter = inv,
            battery = bat,
            modulesInSeries = (s.modulesInSeriesText.toIntOrNull() ?: 10).coerceAtLeast(1),
            parallelStringsPerMppt = (s.parallelStringsText.toIntOrNull() ?: 1).coerceAtLeast(1),
            activeMpptCount = (s.activeMpptText.toIntOrNull() ?: 2).coerceAtLeast(1),
            inverterCount = (s.inverterCountText.toIntOrNull() ?: 1).coerceAtLeast(1),
            batteryUnitsCount = batUnitsOverride,
            autonomyDays = (s.autonomyDaysText.toDoubleOrNull() ?: 0.5).coerceIn(0.0, 14.0),
            dcCableOneWayLengthM = (s.dcCableLengthText.toDoubleOrNull() ?: 28.0).coerceAtLeast(1.0),
            dcCableCrossSectionMm2 = (s.dcCableMm2Text.toDoubleOrNull() ?: 6.0).coerceAtLeast(1.5),
            acCableOneWayLengthM = (s.acCableLengthText.toDoubleOrNull() ?: 18.0).coerceAtLeast(1.0),
            acCableCrossSectionMm2 = (s.acCableMm2Text.toDoubleOrNull() ?: 10.0).coerceAtLeast(1.5),
            performanceRatio = (s.performanceRatioText.toDoubleOrNull() ?: 0.80).coerceIn(0.50, 0.95),
            systemCapexAmount = (s.systemCapexText.toDoubleOrNull() ?: 2_450_000.0).coerceAtLeast(0.0),
            gridTariffPerKwh = (s.gridTariffText.toDoubleOrNull() ?: 62.0).coerceAtLeast(0.0),
            exportTariffPerKwh = (s.exportTariffText.toDoubleOrNull() ?: 22.0).coerceAtLeast(0.0),
            tariffEscalationPctPerYear = (s.escalationPctText.toDoubleOrNull() ?: 6.0).coerceIn(0.0, 25.0),
            annualOmCost = (s.annualOmCostText.toDoubleOrNull() ?: 35_000.0).coerceAtLeast(0.0),
            discountRatePct = (s.discountRatePctText.toDoubleOrNull() ?: 10.0).coerceIn(0.0, 30.0),
        )
    }

    private fun toApiDto(s: SolarEngineeringUiState): SolarDesignCalculationInputDto {
        val calcInput = buildCalcInput(s)
        val mod = calcInput.module
        val inv = calcInput.inverter
        val bat = calcInput.battery
        return SolarDesignCalculationInputDto(
            currency = calcInput.currency,
            loadProfiles = calcInput.loadProfiles.map {
                LoadProfileItemDto(
                    id = it.id,
                    applianceName = it.applianceName,
                    quantity = it.quantity,
                    ratedPowerW = it.ratedPowerW,
                    dailyHours = it.dailyHours,
                    isCriticalBackupLoad = it.isCriticalBackupLoad,
                    surgeFactor = it.surgeFactor,
                )
            }.ifEmpty { null },
            overrideDailyEnergyKwh = calcInput.overrideDailyEnergyKwh,
            overridePeakPowerKw = calcInput.overridePeakPowerKw,
            overrideCriticalBackupKwh = calcInput.overrideCriticalBackupKwh,
            usableRoofAreaM2 = calcInput.usableRoofAreaM2,
            shadingLossPct = calcInput.shadingLossPct,
            ambientMinTempC = calcInput.ambientMinTempC,
            ambientMaxTempC = calcInput.ambientMaxTempC,
            cellTempRiseAboveAmbientC = calcInput.cellTempRiseAboveAmbientC,
            peakSunHoursPerDay = calcInput.peakSunHoursPerDay,
            tiltDegrees = calcInput.tiltDegrees,
            azimuthDegrees = calcInput.azimuthDegrees,
            siteLatitudeDeg = calcInput.siteLatitudeDeg,
            windSpeedMs = calcInput.windSpeedMs,
            module = SolarModuleSpecDto(
                id = mod.id,
                modelName = mod.modelName,
                manufacturer = mod.manufacturer,
                pmaxW = mod.pmaxW,
                vocV = mod.vocV,
                vmpV = mod.vmpV,
                iscA = mod.iscA,
                impA = mod.impA,
                tempCoeffVocPctPerC = mod.tempCoeffVocPctPerC,
                tempCoeffPmaxPctPerC = mod.tempCoeffPmaxPctPerC,
                maxSystemVoltageV = mod.maxSystemVoltageV,
                areaM2 = mod.areaM2,
                weightKg = mod.weightKg,
            ),
            inverter = InverterSpecDto(
                id = inv.id,
                modelName = inv.modelName,
                manufacturer = inv.manufacturer,
                inverterType = inv.inverterType,
                ratedAcPowerW = inv.ratedAcPowerW,
                maxDcInputW = inv.maxDcInputW,
                maxDcVoltageV = inv.maxDcVoltageV,
                mpptMinV = inv.mpptMinV,
                mpptMaxV = inv.mpptMaxV,
                mpptCount = inv.mpptCount,
                maxInputCurrentPerMpptA = inv.maxInputCurrentPerMpptA,
                efficiencyPct = inv.efficiencyPct,
                phases = inv.phases,
            ),
            battery = bat?.let {
                BatterySpecDto(
                    id = it.id,
                    modelName = it.modelName,
                    manufacturer = it.manufacturer,
                    chemistry = it.chemistry,
                    nominalVoltageV = it.nominalVoltageV,
                    capacityAh = it.capacityAh,
                    energyWh = it.energyWh,
                    maxDodPct = it.maxDodPct,
                    roundTripEfficiencyPct = it.roundTripEfficiencyPct,
                )
            },
            modulesInSeries = calcInput.modulesInSeries,
            parallelStringsPerMppt = calcInput.parallelStringsPerMppt,
            activeMpptCount = calcInput.activeMpptCount,
            inverterCount = calcInput.inverterCount,
            batteryUnitsCount = calcInput.batteryUnitsCount,
            autonomyDays = calcInput.autonomyDays,
            dcCableOneWayLengthM = calcInput.dcCableOneWayLengthM,
            dcCableCrossSectionMm2 = calcInput.dcCableCrossSectionMm2,
            acCableOneWayLengthM = calcInput.acCableOneWayLengthM,
            acCableCrossSectionMm2 = calcInput.acCableCrossSectionMm2,
            acPowerFactor = calcInput.acPowerFactor,
            performanceRatio = calcInput.performanceRatio,
            panelDegradationPctPerYear = calcInput.degradationPctPerYear,
            gridEmissionFactorKgPerKwh = calcInput.gridEmissionFactorKgPerKwh,
            systemCapexAmount = calcInput.systemCapexAmount,
            gridTariffPerKwh = calcInput.gridTariffPerKwh,
            exportTariffPerKwh = calcInput.exportTariffPerKwh,
            tariffEscalationPctPerYear = calcInput.tariffEscalationPctPerYear,
            annualOmCost = calcInput.annualOmCost,
            discountRatePct = calcInput.discountRatePct,
        )
    }

    fun refreshRemoteCatalogAndDesigns() {
        viewModelScope.launch {
            runCatching { workspaceApiService.getEngineeringCatalog() }.onSuccess { cat ->
                val modules = cat.modules.map {
                    ModuleSpecInput(
                        id = it.id,
                        modelName = it.modelName,
                        manufacturer = it.manufacturer,
                        pmaxW = it.pmaxW,
                        vocV = it.vocV,
                        vmpV = it.vmpV,
                        iscA = it.iscA,
                        impA = it.impA,
                        tempCoeffVocPctPerC = it.tempCoeffVocPctPerC,
                        tempCoeffPmaxPctPerC = it.tempCoeffPmaxPctPerC,
                        maxSystemVoltageV = it.maxSystemVoltageV,
                        areaM2 = it.areaM2,
                        weightKg = it.weightKg,
                    )
                }
                val inverters = cat.inverters.map {
                    InverterSpecInput(
                        id = it.id,
                        modelName = it.modelName,
                        manufacturer = it.manufacturer,
                        inverterType = it.inverterType,
                        ratedAcPowerW = it.ratedAcPowerW,
                        maxDcInputW = it.maxDcInputW,
                        maxDcVoltageV = it.maxDcVoltageV,
                        mpptMinV = it.mpptMinV,
                        mpptMaxV = it.mpptMaxV,
                        mpptCount = it.mpptCount,
                        maxInputCurrentPerMpptA = it.maxInputCurrentPerMpptA,
                        efficiencyPct = it.efficiencyPct,
                        phases = it.phases,
                    )
                }
                val batteries = cat.batteries.map {
                    BatterySpecInput(
                        id = it.id,
                        modelName = it.modelName,
                        manufacturer = it.manufacturer,
                        chemistry = it.chemistry,
                        nominalVoltageV = it.nominalVoltageV,
                        capacityAh = it.capacityAh,
                        energyWh = it.energyWh,
                        maxDodPct = it.maxDodPct,
                        roundTripEfficiencyPct = it.roundTripEfficiencyPct,
                    )
                }
                if (modules.isNotEmpty() && inverters.isNotEmpty()) {
                    updateStateAndRecalc { cur ->
                        cur.copy(
                            availableModules = modules,
                            availableInverters = inverters,
                            availableBatteries = batteries.ifEmpty { cur.availableBatteries },
                            selectedModuleIndex = 0,
                            selectedInverterIndex = 0,
                            selectedBatteryIndex = 0,
                        )
                    }
                }
            }
            refreshSavedDesigns(_uiState.value.selectedProjectId.ifBlank { null })
        }
    }

    fun refreshSavedDesigns(projectId: String? = _uiState.value.selectedProjectId.ifBlank { null }) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingDesigns = true) }
            runCatching { workspaceApiService.listSolarDesigns(projectId) }
                .onSuccess { res ->
                    _uiState.update { it.copy(savedDesigns = res.designs, isLoadingDesigns = false) }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingDesigns = false) }
                }
        }
    }

    fun saveDesignOnlineOrOffline() {
        val s = _uiState.value
        val projectId = s.selectedProjectId
        if (projectId.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Select or sync a project first to attach this solar design.") }
            return
        }
        val cleanTitle = s.title.trim()
        if (cleanTitle.length < 2) {
            _uiState.update { it.copy(errorMessage = "Design title must be at least 2 characters.") }
            return
        }

        val reqDto = CreateSolarDesignRequestDto(
            projectId = projectId,
            title = cleanTitle,
            notes = s.notes.trim().ifEmpty { null },
            calculationInput = toApiDto(s),
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null, savedMessage = null) }
            if (isOnline.value) {
                runCatching { workspaceApiService.createSolarDesign(reqDto) }
                    .onSuccess { created ->
                        _uiState.update {
                            it.copy(
                                isSaving = false,
                                designId = UUID.randomUUID().toString(),
                                savedMessage = "Saved ${created.design.designCode} (${s.result.actualDcKwp} kWp) to server.",
                            )
                        }
                        refreshSavedDesigns(projectId)
                        return@launch
                    }
            }

            // Offline fallback -> queue exact server-compatible solar_design_draft outbox mutation
            val activeOrg = orgId.ifBlank { "local-org" }
            val deviceId = appPreferences.getOrCreateDeviceId()
            val payloadJson = jsonCodec.encodeToString(reqDto)
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = activeOrg,
                entityType = "solar_design_draft",
                entityId = s.designId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = payloadJson,
            )
            SyncWorker.enqueueOneTime(appContext, activeOrg, deviceId)
            _uiState.update {
                it.copy(
                    isSaving = false,
                    designId = UUID.randomUUID().toString(),
                    savedMessage = "Draft solar design queued in Room outbox (${s.result.actualDcKwp} kWp) for sync.",
                )
            }
        }
    }

    fun queueOfflineDesignDraft(organizationId: String, deviceId: String) {
        val s = _uiState.value
        val reqDto = CreateSolarDesignRequestDto(
            projectId = s.selectedProjectId.ifBlank { UUID.randomUUID().toString() },
            title = s.title.trim().ifEmpty { "Offline Solar Design Draft" },
            notes = s.notes.trim().ifEmpty { null },
            calculationInput = toApiDto(s),
        )
        viewModelScope.launch {
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "solar_design_draft",
                entityId = s.designId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = jsonCodec.encodeToString(reqDto),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(savedMessage = "Draft solar design queued in Room outbox (${s.result.actualDcKwp} kWp).")
            }
        }
    }

    fun submitDesignRevision(designId: String, revisionNumber: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null, savedMessage = null) }
            runCatching { workspaceApiService.submitSolarDesignRevision(designId, revisionNumber) }
                .onSuccess { res ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            savedMessage = "${res.design.designCode} Rev ${res.revision.revisionNumber} submitted for approval.",
                        )
                    }
                    refreshSavedDesigns()
                }
                .onFailure { ex ->
                    _uiState.update {
                        it.copy(isSaving = false, errorMessage = ex.message ?: "Unable to submit revision")
                    }
                }
        }
    }

    fun approveDesign(designId: String, reviewNotes: String = "Verified IEC 62548 / PEC compliance") {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null, savedMessage = null) }
            runCatching {
                workspaceApiService.approveSolarDesign(
                    designId,
                    ReviewDesignRequestDto(reviewNotes = reviewNotes),
                )
            }
                .onSuccess { res ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            savedMessage = "${res.design.designCode} Rev ${res.revision.revisionNumber} approved & locked.",
                        )
                    }
                    refreshSavedDesigns()
                }
                .onFailure { ex ->
                    _uiState.update {
                        it.copy(isSaving = false, errorMessage = ex.message ?: "Unable to approve design")
                    }
                }
        }
    }
}
