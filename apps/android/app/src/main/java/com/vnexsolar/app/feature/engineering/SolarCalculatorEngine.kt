package com.vnexsolar.app.feature.engineering

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sqrt

const val SOLAR_ENGINEERING_FORMULA_VERSION = "vnex-eng-v1.0.0"
const val PV_COPPER_RESISTIVITY_OHM_MM2_PER_M = 0.0178
const val SOLAR_ENGINEERING_DESIGN_DISCLAIMER =
    "Preliminary engineering estimate per IEC 62548 / IEC 60364 / PEC guidelines. Final string protection, earthing resistance, and roof structural wind-load anchorage require licensed electrical/structural engineer sign-off before energization."

data class ApplianceLoadItem(
    val id: String,
    val applianceName: String,
    val quantity: Int,
    val ratedPowerW: Double,
    val dailyHours: Double,
    val isCriticalBackupLoad: Boolean = false,
    val surgeFactor: Double = 1.0,
)

data class LoadSummaryOutput(
    val dailyEnergyKwh: Double,
    val connectedPowerKw: Double,
    val peakSurgePowerKw: Double,
    val criticalBackupDailyKwh: Double,
)

data class ModuleSpecInput(
    val id: String = "mod-default",
    val modelName: String,
    val manufacturer: String = "VNex Catalog",
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

data class InverterSpecInput(
    val id: String = "inv-default",
    val modelName: String,
    val manufacturer: String = "VNex Catalog",
    val inverterType: String,
    val ratedAcPowerW: Double,
    val maxDcInputW: Double = ratedAcPowerW * 1.5,
    val maxDcVoltageV: Double,
    val mpptMinV: Double,
    val mpptMaxV: Double,
    val mpptCount: Int,
    val maxInputCurrentPerMpptA: Double,
    val efficiencyPct: Double = 97.6,
    val phases: String = "three",
)

data class BatterySpecInput(
    val id: String = "bat-default",
    val modelName: String,
    val manufacturer: String = "VNex Catalog",
    val chemistry: String = "LFP",
    val nominalVoltageV: Double = 48.0,
    val capacityAh: Double = 100.0,
    val energyWh: Double = 4800.0,
    val maxDodPct: Double = 90.0,
    val roundTripEfficiencyPct: Double = 95.0,
)

data class CitySolarPreset(
    val city: String,
    val latitudeDeg: Double,
    val peakSunHoursPerDay: Double,
    val ambientMinTempC: Double,
    val ambientMaxTempC: Double,
    val windSpeedMs: Double,
)

data class SolarCalcInput(
    val currency: String = "PKR",
    val loadProfiles: List<ApplianceLoadItem> = emptyList(),
    val overrideDailyEnergyKwh: Double? = null,
    val overridePeakPowerKw: Double? = null,
    val overrideCriticalBackupKwh: Double? = null,
    val dailyEnergyKwh: Double = 40.0,
    val criticalBackupDailyKwh: Double = 12.0,
    val usableRoofAreaM2: Double,
    val shadingLossPct: Double,
    val ambientMinTempC: Double,
    val ambientMaxTempC: Double,
    val cellTempRiseAboveAmbientC: Double = 25.0,
    val peakSunHoursPerDay: Double,
    val tiltDegrees: Double,
    val azimuthDegrees: Double,
    val siteLatitudeDeg: Double = 31.5,
    val windSpeedMs: Double = 32.0,
    val module: ModuleSpecInput,
    val inverter: InverterSpecInput,
    val battery: BatterySpecInput? = null,
    val modulesInSeries: Int,
    val parallelStringsPerMppt: Int,
    val activeMpptCount: Int,
    val inverterCount: Int = 1,
    val batteryUnitsCount: Int? = null,
    val batteryUnitEnergyWh: Double = 4800.0,
    val batteryMaxDodPct: Double = 90.0,
    val batteryRoundTripEffPct: Double = 95.0,
    val autonomyDays: Double = 0.5,
    val dcCableOneWayLengthM: Double,
    val dcCableCrossSectionMm2: Double,
    val acCableOneWayLengthM: Double,
    val acCableCrossSectionMm2: Double,
    val acPowerFactor: Double = 0.98,
    val performanceRatio: Double = 0.80,
    val degradationPctPerYear: Double = 0.45,
    val gridEmissionFactorKgPerKwh: Double = 0.58,
    val systemCapexAmount: Double,
    val gridTariffPerKwh: Double,
    val exportTariffPerKwh: Double,
    val tariffEscalationPctPerYear: Double = 6.0,
    val annualOmCost: Double,
    val discountRatePct: Double = 10.0,
)

data class SolarCalcOutput(
    val formulaVersion: String,
    // 1. Load & energy
    val dailyEnergyKwh: Double,
    val connectedPowerKw: Double,
    val peakSurgePowerKw: Double,
    val criticalBackupDailyKwh: Double,
    // 2. Required PV capacity
    val requiredPvKwp: Double,
    // 3. Array & inverter count
    val totalPanelCount: Int,
    val actualDcKwp: Double,
    val totalRatedAcKw: Double,
    // 4. DC-to-AC ratio
    val dcAcRatio: Double,
    // 5. Cold-temperature Voc
    val moduleColdVocV: Double,
    val stringColdVocV: Double,
    val vocLimitV: Double,
    val vocOvervoltageFault: Boolean,
    // 6. Hot-cell Vmp & MPPT window
    val moduleHotVmpV: Double,
    val stringHotVmpV: Double,
    val mpptWindowValid: Boolean,
    // 7. Safe min/max modules per series string
    val minModulesInSeries: Int,
    val maxModulesInSeries: Int,
    // 8. MPPT current check
    val mpptOperatingCurrentA: Double,
    val mpptShortCircuitCurrentA: Double,
    val mpptCurrentExceeded: Boolean,
    // 9. Battery capacity & backup runtime
    val requiredUsableBatteryKwh: Double,
    val requiredNominalBatteryKwh: Double,
    val recommendedBatteryUnits: Int,
    val installedNominalBatteryKwh: Double,
    val installedUsableBatteryKwh: Double,
    val backupAutonomyHours: Double,
    // 10. Tilt, orientation & solar generation
    val optimalTiltDeg: Double,
    val orientationFactor: Double,
    val orientationAdvisory: String,
    val expectedDailyYieldKwh: Double,
    val expectedAnnualYieldKwh: Double,
    val specificYieldKwhPerKwp: Double,
    // 11. Net metering & energy offset
    val annualDemandKwh: Double,
    val annualSolarOffsetPct: Double,
    val estimatedSelfConsumedKwh: Double,
    val estimatedGridExportKwh: Double,
    // 12. DC cable sizing & voltage drop
    val dcVoltageDropV: Double,
    val dcVoltageDropPct: Double,
    val dcCablePass: Boolean,
    // 13. AC cable sizing & voltage drop
    val acCurrentPerInverterA: Double,
    val acVoltageDropV: Double,
    val acVoltageDropPct: Double,
    val acCablePass: Boolean,
    // 14. Protection switchgear ratings
    val recommendedStringFuseA: Int,
    val recommendedAcBreakerA: Int,
    val recommendedDcSpdVoltageV: Int,
    // 15. Earthing conductor sizing
    val recommendedEarthingMm2: Int,
    val targetEarthResistanceOhms: Double,
    // 16. Roof area estimation & fit
    val totalModuleFootprintM2: Double,
    val requiredRoofAreaM2: Double,
    val roofAreaUtilizationPct: Double,
    val maxRoofPanelCapacity: Int,
    val roofFitPass: Boolean,
    // 17. Structural mass & wind uplift
    val totalArrayMassKg: Double,
    val distributedRoofLoadKgM2: Double,
    val estimatedWindUpliftKn: Double,
    // 18. 25-year degraded yield
    val lifetime25YrYieldKwh: Double,
    // 19. Carbon avoidance
    val annualCo2AvoidedKg: Double,
    val lifetimeCo2AvoidedTonnes: Double,
    // 20. Financial ROI / Payback / NPV / LCOE
    val currency: String,
    val firstYearGrossSavings: Double,
    val firstYearNetCashflow: Double,
    val simplePaybackYears: Double?,
    val netPresentValue: Double,
    val roi25YrPct: Double,
    val lcoePerKwh: Double,
    // Gates & advisory
    val safetyChecksPassed: Boolean,
    val hardSafetyErrors: List<String>,
    val engineeringWarnings: List<String>,
    val designDisclaimer: String,
)

object EngineeringPresets {
    val MODULES: List<ModuleSpecInput> = listOf(
        ModuleSpecInput(
            id = "mod-longi-580",
            modelName = "Hi-MO 6 Explorer 580W",
            manufacturer = "LONGi Solar",
            pmaxW = 580.0,
            vocV = 52.21,
            vmpV = 44.06,
            iscA = 14.20,
            impA = 13.17,
            tempCoeffVocPctPerC = -0.26,
            tempCoeffPmaxPctPerC = -0.29,
            maxSystemVoltageV = 1500.0,
            areaM2 = 2.58,
            weightKg = 27.5,
        ),
        ModuleSpecInput(
            id = "mod-jinko-585",
            modelName = "Tiger Neo N-Type 585W",
            manufacturer = "JinkoSolar",
            pmaxW = 585.0,
            vocV = 52.70,
            vmpV = 43.91,
            iscA = 14.07,
            impA = 13.32,
            tempCoeffVocPctPerC = -0.25,
            tempCoeffPmaxPctPerC = -0.29,
            maxSystemVoltageV = 1500.0,
            areaM2 = 2.58,
            weightKg = 28.0,
        ),
        ModuleSpecInput(
            id = "mod-canadian-550",
            modelName = "HiKu6 Mono PERC 550W",
            manufacturer = "Canadian Solar",
            pmaxW = 550.0,
            vocV = 49.60,
            vmpV = 41.70,
            iscA = 14.00,
            impA = 13.20,
            tempCoeffVocPctPerC = -0.26,
            tempCoeffPmaxPctPerC = -0.34,
            maxSystemVoltageV = 1500.0,
            areaM2 = 2.56,
            weightKg = 28.6,
        ),
    )

    val INVERTERS: List<InverterSpecInput> = listOf(
        InverterSpecInput(
            id = "inv-nitrox-12kw",
            modelName = "Nitrox Hybrid 12K-3P IP65",
            manufacturer = "Inverex / Deye",
            inverterType = "hybrid",
            ratedAcPowerW = 12000.0,
            maxDcInputW = 15600.0,
            maxDcVoltageV = 800.0,
            mpptMinV = 200.0,
            mpptMaxV = 650.0,
            mpptCount = 2,
            maxInputCurrentPerMpptA = 26.0,
            efficiencyPct = 97.6,
            phases = "three",
        ),
        InverterSpecInput(
            id = "inv-huawei-20ktl",
            modelName = "SUN2000-20KTL-M5 3-Phase",
            manufacturer = "Huawei FusionSolar",
            inverterType = "on_grid",
            ratedAcPowerW = 20000.0,
            maxDcInputW = 30000.0,
            maxDcVoltageV = 1100.0,
            mpptMinV = 200.0,
            mpptMaxV = 1000.0,
            mpptCount = 2,
            maxInputCurrentPerMpptA = 30.0,
            efficiencyPct = 98.4,
            phases = "three",
        ),
        InverterSpecInput(
            id = "inv-goodwe-6kw",
            modelName = "GW6000-EH 1-Phase Hybrid",
            manufacturer = "GoodWe",
            inverterType = "hybrid",
            ratedAcPowerW = 6000.0,
            maxDcInputW = 9600.0,
            maxDcVoltageV = 580.0,
            mpptMinV = 120.0,
            mpptMaxV = 550.0,
            mpptCount = 2,
            maxInputCurrentPerMpptA = 16.0,
            efficiencyPct = 97.6,
            phases = "single",
        ),
    )

    val BATTERIES: List<BatterySpecInput> = listOf(
        BatterySpecInput(
            id = "bat-pylon-us5000",
            modelName = "US5000 48V 100Ah LFP",
            manufacturer = "Pylontech",
            chemistry = "LFP",
            nominalVoltageV = 48.0,
            capacityAh = 100.0,
            energyWh = 4800.0,
            maxDodPct = 90.0,
            roundTripEfficiencyPct = 95.0,
        ),
        BatterySpecInput(
            id = "bat-narada-512",
            modelName = "NESR 51.2V 100Ah Rack LFP",
            manufacturer = "Narada",
            chemistry = "LFP",
            nominalVoltageV = 51.2,
            capacityAh = 100.0,
            energyWh = 5120.0,
            maxDodPct = 85.0,
            roundTripEfficiencyPct = 94.0,
        ),
    )

    val CITIES: List<CitySolarPreset> = listOf(
        CitySolarPreset("Lahore", 31.5, 5.2, 4.0, 46.0, 32.0),
        CitySolarPreset("Karachi", 24.9, 5.5, 11.0, 43.0, 36.0),
        CitySolarPreset("Islamabad", 33.7, 5.0, 1.0, 44.0, 32.0),
        CitySolarPreset("Multan", 30.2, 5.6, 5.0, 49.0, 33.0),
        CitySolarPreset("Quetta", 30.2, 5.9, -6.0, 40.0, 35.0),
        CitySolarPreset("Peshawar", 34.0, 5.1, 2.0, 46.0, 32.0),
        CitySolarPreset("Murree", 33.9, 4.7, -5.0, 32.0, 40.0),
    )

    val DEFAULT_APPLIANCES: List<ApplianceLoadItem> = listOf(
        ApplianceLoadItem("app-ac", "1.5 Ton Inverter AC", 2, 1600.0, 7.0, isCriticalBackupLoad = false, surgeFactor = 1.4),
        ApplianceLoadItem("app-fridge", "Inverter Refrigerator", 1, 220.0, 14.0, isCriticalBackupLoad = true, surgeFactor = 2.0),
        ApplianceLoadItem("app-fans", "BLDC Ceiling Fans", 6, 45.0, 12.0, isCriticalBackupLoad = true, surgeFactor = 1.1),
        ApplianceLoadItem("app-lights", "LED Lights & Wi-Fi", 12, 18.0, 8.0, isCriticalBackupLoad = true, surgeFactor = 1.0),
        ApplianceLoadItem("app-pump", "Water Pump (1 HP)", 1, 750.0, 1.5, isCriticalBackupLoad = false, surgeFactor = 2.5),
    )
}

object SolarCalculatorEngine {
    private val STANDARD_BREAKER_RATINGS_A =
        listOf(10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 630)
    private val STANDARD_EARTH_SIZES_MM2 = listOf(6, 10, 16, 25, 35, 50, 70)

    private fun roundTo(value: Double, decimals: Int = 2): Double {
        val factor = 10.0.pow(decimals)
        return round((value + 1e-12) * factor) / factor
    }

    private fun nextStandardRating(requiredAmps: Double, steps: List<Int>): Int =
        steps.firstOrNull { it >= requiredAmps } ?: steps.last()

    fun computeLoadSummary(loadProfiles: List<ApplianceLoadItem>): LoadSummaryOutput {
        var connectedW = 0.0
        var peakSurgeW = 0.0
        var dailyWh = 0.0
        var criticalWh = 0.0

        for (item in loadProfiles) {
            val qty = max(0, item.quantity)
            val watts = max(0.0, item.ratedPowerW)
            val hours = max(0.0, min(24.0, item.dailyHours))
            val surge = max(1.0, item.surgeFactor)
            val itemW = qty * watts
            connectedW += itemW
            peakSurgeW += itemW * surge
            dailyWh += itemW * hours
            if (item.isCriticalBackupLoad) {
                criticalWh += itemW * hours
            }
        }

        val dailyEnergyKwh = max(0.1, dailyWh / 1000.0)
        val criticalKwh = if (criticalWh > 0.0) criticalWh / 1000.0 else dailyEnergyKwh * 0.4
        return LoadSummaryOutput(
            dailyEnergyKwh = roundTo(dailyEnergyKwh, 3),
            connectedPowerKw = roundTo(connectedW / 1000.0, 3),
            peakSurgePowerKw = roundTo(peakSurgeW / 1000.0, 3),
            criticalBackupDailyKwh = roundTo(criticalKwh, 3),
        )
    }

    fun calculate(input: SolarCalcInput): SolarCalcOutput {
        val perfRatio = input.performanceRatio
        val degRate = input.degradationPctPerYear / 100.0
        val cellTempRise = input.cellTempRiseAboveAmbientC
        val siteLatitude = input.siteLatitudeDeg
        val windSpeedMs = input.windSpeedMs
        val gridEmissionFactor = input.gridEmissionFactorKgPerKwh
        val acPowerFactor = input.acPowerFactor
        val escRate = input.tariffEscalationPctPerYear / 100.0
        val discRate = input.discountRatePct / 100.0
        val autonomyDays = max(0.0, input.autonomyDays)

        // 1. Daily energy consumption & peak load power
        var connectedW = 0.0
        var peakSurgeW = 0.0
        var dailyWh = 0.0
        var criticalWh = 0.0

        if (input.loadProfiles.isNotEmpty()) {
            for (item in input.loadProfiles) {
                val qty = max(0, item.quantity)
                val watts = max(0.0, item.ratedPowerW)
                val hours = max(0.0, min(24.0, item.dailyHours))
                val surge = max(1.0, item.surgeFactor)
                val itemW = qty * watts
                connectedW += itemW
                peakSurgeW += itemW * surge
                dailyWh += itemW * hours
                if (item.isCriticalBackupLoad) {
                    criticalWh += itemW * hours
                }
            }
        }

        val dailyEnergyKwh = when {
            input.overrideDailyEnergyKwh != null -> max(0.1, input.overrideDailyEnergyKwh)
            input.loadProfiles.isNotEmpty() -> max(0.1, dailyWh / 1000.0)
            else -> max(0.1, input.dailyEnergyKwh)
        }
        val connectedPowerKw = when {
            input.overridePeakPowerKw != null -> max(0.1, input.overridePeakPowerKw)
            input.loadProfiles.isNotEmpty() -> connectedW / 1000.0
            else -> max(0.0, input.dailyEnergyKwh / 5.0)
        }
        val peakSurgePowerKw = when {
            input.overridePeakPowerKw != null && input.loadProfiles.isEmpty() ->
                input.overridePeakPowerKw * 1.25
            input.loadProfiles.isNotEmpty() -> peakSurgeW / 1000.0
            else -> connectedPowerKw * 1.25
        }
        val criticalBackupDailyKwh = when {
            input.overrideCriticalBackupKwh != null -> max(0.0, input.overrideCriticalBackupKwh)
            input.loadProfiles.isNotEmpty() ->
                if (criticalWh > 0.0) criticalWh / 1000.0 else dailyEnergyKwh * 0.4
            else -> max(0.0, input.criticalBackupDailyKwh)
        }

        // 2. Required PV capacity
        val safePsh = max(1.0, input.peakSunHoursPerDay)
        val requiredPvKwp = dailyEnergyKwh / (safePsh * perfRatio)

        // 3. Actual panel count & DC / AC capacity
        val stringsTotal = max(1, input.activeMpptCount) * max(1, input.parallelStringsPerMppt)
        val totalPanelCount = max(1, input.modulesInSeries) * stringsTotal
        val actualDcKwp = (totalPanelCount * input.module.pmaxW) / 1000.0
        val totalRatedAcKw = (max(1, input.inverterCount) * input.inverter.ratedAcPowerW) / 1000.0

        // 4. DC-to-AC ratio
        val dcAcRatio = actualDcKwp / max(0.1, totalRatedAcKw)

        // 5. Cold-temperature Open-Circuit Voltage (Voc)
        val dTCold = input.ambientMinTempC - 25.0
        val moduleColdVocV =
            input.module.vocV * (1.0 + (input.module.tempCoeffVocPctPerC / 100.0) * dTCold)
        val stringColdVocV = moduleColdVocV * input.modulesInSeries
        val vocLimitV = min(input.inverter.maxDcVoltageV, input.module.maxSystemVoltageV)
        val vocOvervoltageFault = stringColdVocV > vocLimitV

        // 6. Hot-cell Vmp & MPPT window check
        val cellMaxTempC = input.ambientMaxTempC + cellTempRise
        val dTHot = cellMaxTempC - 25.0
        val moduleHotVmpV =
            input.module.vmpV * (1.0 + (input.module.tempCoeffPmaxPctPerC / 100.0) * dTHot)
        val stringHotVmpV = moduleHotVmpV * input.modulesInSeries
        val mpptWindowValid =
            stringHotVmpV >= input.inverter.mpptMinV && stringHotVmpV <= input.inverter.mpptMaxV

        // 7. Safe min/max modules per series string
        val minModulesInSeries = ceil(input.inverter.mpptMinV / max(1.0, moduleHotVmpV)).toInt()
        val maxModulesInSeries = floor(vocLimitV / max(1.0, moduleColdVocV)).toInt()

        // 8. MPPT current check
        val mpptOperatingCurrentA = input.module.impA * input.parallelStringsPerMppt
        val mpptShortCircuitCurrentA = input.module.iscA * input.parallelStringsPerMppt
        val mpptCurrentExceeded = mpptOperatingCurrentA > input.inverter.maxInputCurrentPerMpptA

        // 9. Battery bank sizing & backup autonomy runtime
        val batteryUnitWh = input.battery?.energyWh ?: input.batteryUnitEnergyWh
        val batteryDodPct = input.battery?.maxDodPct ?: input.batteryMaxDodPct
        val batteryRtePct = input.battery?.roundTripEfficiencyPct ?: input.batteryRoundTripEffPct
        val isBatteryRelevant = input.inverter.inverterType != "on_grid"

        val requiredUsableBatteryKwh =
            if (!isBatteryRelevant) 0.0 else criticalBackupDailyKwh * autonomyDays
        val requiredNominalBatteryKwh = if (isBatteryRelevant) {
            requiredUsableBatteryKwh /
                ((batteryDodPct / 100.0) * (batteryRtePct / 100.0) * (input.inverter.efficiencyPct / 100.0))
        } else {
            0.0
        }
        val recommendedBatteryUnits = if (isBatteryRelevant) {
            ceil((requiredNominalBatteryKwh * 1000.0) / max(1.0, batteryUnitWh)).toInt()
        } else {
            0
        }
        val installedUnits = input.batteryUnitsCount?.let { max(0, it) } ?: recommendedBatteryUnits
        val installedNominalBatteryKwh =
            if (isBatteryRelevant && installedUnits > 0) (installedUnits * batteryUnitWh) / 1000.0 else 0.0
        val installedUsableBatteryKwh =
            if (installedNominalBatteryKwh > 0.0) installedNominalBatteryKwh * (batteryDodPct / 100.0) else 0.0
        val avgCriticalLoadKw = max(0.1, criticalBackupDailyKwh / 24.0)
        val backupAutonomyHours =
            if (installedUsableBatteryKwh > 0.0) installedUsableBatteryKwh / avgCriticalLoadKw else 0.0

        // 10. Tilt, orientation factor & solar generation
        val optimalTilt = max(5.0, min(45.0, abs(siteLatitude) - 4.0))
        val tiltDeltaDeg = abs(input.tiltDegrees - optimalTilt)
        val azimuthDeltaDeg = abs(((input.azimuthDegrees - 180.0 + 540.0) % 360.0) - 180.0)
        val orientationFactor = max(
            0.65,
            1.0 - tiltDeltaDeg * 0.0025 - (azimuthDeltaDeg / 90.0) * 0.12,
        )
        val orientationAdvisory = buildString {
            append("Optimal annual tilt for ${roundTo(siteLatitude, 1)}°N is ~${roundTo(optimalTilt, 1)}° due South (180°). ")
            if (tiltDeltaDeg <= 3.0 && azimuthDeltaDeg <= 15.0) {
                append("Current array orientation is near-optimal.")
            } else {
                append("Current tilt/azimuth causes ${roundTo((1.0 - orientationFactor) * 100.0, 1)}% orientation loss.")
            }
        }
        val shadingFactor = max(0.1, 1.0 - max(0.0, min(90.0, input.shadingLossPct)) / 100.0)
        val expectedDailyYieldKwh =
            actualDcKwp * safePsh * perfRatio * shadingFactor * orientationFactor
        val expectedAnnualYieldKwh = expectedDailyYieldKwh * 365.0
        val specificYieldKwhPerKwp = expectedAnnualYieldKwh / max(0.1, actualDcKwp)

        // 11. Energy offset & net metering self-consumption balance
        val annualDemandKwh = dailyEnergyKwh * 365.0
        val annualSolarOffsetPct = (expectedAnnualYieldKwh / max(1.0, annualDemandKwh)) * 100.0
        val selfConsumptionRatio = if (installedUsableBatteryKwh > 0.0) 0.72 else 0.48
        val estimatedSelfConsumedKwh = min(
            annualDemandKwh,
            expectedAnnualYieldKwh * selfConsumptionRatio,
        )
        val estimatedGridExportKwh = max(0.0, expectedAnnualYieldKwh - estimatedSelfConsumedKwh)

        // 12. DC string cable voltage drop (%)
        val stringVmpNominalV = input.module.vmpV * input.modulesInSeries
        val dcVoltageDropV = (2.0 * input.dcCableOneWayLengthM * mpptOperatingCurrentA *
            PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) / max(0.5, input.dcCableCrossSectionMm2)
        val dcVoltageDropPct = (dcVoltageDropV / max(1.0, stringVmpNominalV)) * 100.0
        val dcCablePass = dcVoltageDropPct <= 2.0

        // 13. AC cable voltage drop (%)
        val acLineVoltageV = if (input.inverter.phases == "three") 400.0 else 230.0
        val acCurrentPerInverterA = if (input.inverter.phases == "three") {
            input.inverter.ratedAcPowerW / (sqrt(3.0) * 400.0 * acPowerFactor)
        } else {
            input.inverter.ratedAcPowerW / (230.0 * acPowerFactor)
        }
        val acMultiplier = if (input.inverter.phases == "three") sqrt(3.0) else 2.0
        val acVoltageDropV = (acMultiplier * input.acCableOneWayLengthM * acCurrentPerInverterA *
            PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) / max(1.0, input.acCableCrossSectionMm2)
        val acVoltageDropPct = (acVoltageDropV / acLineVoltageV) * 100.0
        val acCablePass = acVoltageDropPct <= 2.5

        // 14. Protection switchgear ratings (DC Fuse, AC Breaker, DC SPD)
        val recommendedStringFuseA =
            nextStandardRating(mpptShortCircuitCurrentA * 1.56, STANDARD_BREAKER_RATINGS_A)
        val recommendedAcBreakerA =
            nextStandardRating(acCurrentPerInverterA * 1.25, STANDARD_BREAKER_RATINGS_A)
        val requiredSpdV = stringColdVocV * 1.1
        val recommendedDcSpdVoltageV =
            if (requiredSpdV <= 600.0) 600 else if (requiredSpdV <= 1000.0) 1000 else 1500

        // 15. Earthing conductor sizing
        val minEarthMm2 = if (input.acCableCrossSectionMm2 <= 16.0) {
            max(6.0, input.acCableCrossSectionMm2)
        } else {
            max(16.0, input.acCableCrossSectionMm2 / 2.0)
        }
        val recommendedEarthingMm2 = nextStandardRating(minEarthMm2, STANDARD_EARTH_SIZES_MM2)
        val targetEarthResistanceOhms = 2.0

        // 16. Roof area estimation, row spacing & max capacity
        val totalModuleFootprintM2 = totalPanelCount * input.module.areaM2
        val spacingFactor = 1.25 + (max(0.0, input.tiltDegrees) / 90.0) * 0.45
        val requiredRoofAreaM2 = totalModuleFootprintM2 * spacingFactor
        val roofAreaUtilizationPct =
            (requiredRoofAreaM2 / max(1.0, input.usableRoofAreaM2)) * 100.0
        val maxRoofPanelCapacity = floor(
            input.usableRoofAreaM2 / max(0.5, input.module.areaM2 * spacingFactor),
        ).toInt()
        val roofFitPass = requiredRoofAreaM2 <= input.usableRoofAreaM2

        // 17. Structural dead weight & wind uplift
        val totalArrayMassKg = totalPanelCount * (input.module.weightKg + 4.5)
        val distributedRoofLoadKgM2 = totalArrayMassKg / max(1.0, totalModuleFootprintM2)
        val estimatedWindUpliftKn =
            (0.5 * 1.225 * windSpeedMs * windSpeedMs * 1.15 * totalModuleFootprintM2) / 1000.0

        // 18. 25-year degraded lifetime yield
        var lifetime25YrYieldKwh = 0.0
        for (yr in 0 until 25) {
            lifetime25YrYieldKwh += expectedAnnualYieldKwh * (1.0 - degRate).pow(yr)
        }

        // 19. Environmental carbon impact
        val annualCo2AvoidedKg = expectedAnnualYieldKwh * gridEmissionFactor
        val lifetimeCo2AvoidedTonnes = (lifetime25YrYieldKwh * gridEmissionFactor) / 1000.0

        // 20. Financial engineering metrics (25-year NPV, LCOE, ROI, Payback)
        val firstYearGrossSavings =
            estimatedSelfConsumedKwh * input.gridTariffPerKwh +
                estimatedGridExportKwh * input.exportTariffPerKwh
        val firstYearNetCashflow = firstYearGrossSavings - input.annualOmCost
        val simplePaybackYears =
            if (firstYearNetCashflow > 0.0) roundTo(input.systemCapexAmount / firstYearNetCashflow, 2) else null

        var npv = -input.systemCapexAmount
        var totalDiscountedCosts = input.systemCapexAmount
        var totalDiscountedYieldKwh = 0.0
        var totalNominalNetCashflow = -input.systemCapexAmount

        for (yr in 1..25) {
            val degFactor = (1.0 - degRate).pow(yr - 1)
            val tariffFactor = (1.0 + escRate).pow(yr - 1)
            val yrSelfConsumed = estimatedSelfConsumedKwh * degFactor
            val yrExported = estimatedGridExportKwh * degFactor
            val yrSavings =
                yrSelfConsumed * input.gridTariffPerKwh * tariffFactor +
                    yrExported * input.exportTariffPerKwh * tariffFactor
            val yrOm = input.annualOmCost * 1.03.pow(yr - 1)
            val discountDivisor = (1.0 + discRate).pow(yr)

            npv += (yrSavings - yrOm) / discountDivisor
            totalDiscountedCosts += yrOm / discountDivisor
            totalDiscountedYieldKwh += (expectedAnnualYieldKwh * degFactor) / discountDivisor
            totalNominalNetCashflow += (yrSavings - yrOm)
        }

        val roi25YrPct = if (input.systemCapexAmount > 0.0) {
            (totalNominalNetCashflow / input.systemCapexAmount) * 100.0
        } else {
            0.0
        }
        val lcoePerKwh =
            if (totalDiscountedYieldKwh > 0.0) totalDiscountedCosts / totalDiscountedYieldKwh else 0.0

        // Hard safety blockers & Engineering advisories
        val hardSafetyErrors = mutableListOf<String>()
        val engineeringWarnings = mutableListOf<String>()

        if (vocOvervoltageFault) {
            hardSafetyErrors.add(
                "Cold-temperature Voc (${roundTo(stringColdVocV, 1)}V at ${input.ambientMinTempC}°C) exceeds inverter/module limit (${vocLimitV}V). Reduce series modules to <= $maxModulesInSeries.",
            )
        }
        if (input.activeMpptCount > input.inverter.mpptCount * input.inverterCount) {
            hardSafetyErrors.add(
                "Active MPPT channels (${input.activeMpptCount}) exceed total available inverter MPPT inputs (${input.inverter.mpptCount * input.inverterCount}).",
            )
        }
        if (!mpptWindowValid) {
            engineeringWarnings.add(
                "Hot-cell Vmp (${roundTo(stringHotVmpV, 1)}V) falls outside inverter MPPT window (${input.inverter.mpptMinV.toInt()}–${input.inverter.mpptMaxV.toInt()}V).",
            )
        }
        if (mpptCurrentExceeded) {
            engineeringWarnings.add(
                "Parallel string Imp (${roundTo(mpptOperatingCurrentA, 2)}A) exceeds per-MPPT limit (${input.inverter.maxInputCurrentPerMpptA}A).",
            )
        }
        if (!dcCablePass) {
            engineeringWarnings.add(
                "DC cable voltage drop (${roundTo(dcVoltageDropPct, 2)}%) exceeds 2.0% threshold.",
            )
        }
        if (!acCablePass) {
            engineeringWarnings.add(
                "AC cable voltage drop (${roundTo(acVoltageDropPct, 2)}%) exceeds 2.5% threshold.",
            )
        }
        if (!roofFitPass) {
            engineeringWarnings.add(
                "Required roof area (${roundTo(requiredRoofAreaM2, 1)} m²) exceeds usable site roof area (${input.usableRoofAreaM2} m²). Max fit: $maxRoofPanelCapacity panels.",
            )
        }
        if (dcAcRatio > 1.35) {
            engineeringWarnings.add(
                "DC/AC ratio (${roundTo(dcAcRatio, 2)}) exceeds 1.35; inverter clipping losses expected.",
            )
        }

        return SolarCalcOutput(
            formulaVersion = SOLAR_ENGINEERING_FORMULA_VERSION,
            dailyEnergyKwh = roundTo(dailyEnergyKwh, 3),
            connectedPowerKw = roundTo(connectedPowerKw, 3),
            peakSurgePowerKw = roundTo(peakSurgePowerKw, 3),
            criticalBackupDailyKwh = roundTo(criticalBackupDailyKwh, 3),
            requiredPvKwp = roundTo(requiredPvKwp, 3),
            totalPanelCount = totalPanelCount,
            actualDcKwp = roundTo(actualDcKwp, 3),
            totalRatedAcKw = roundTo(totalRatedAcKw, 3),
            dcAcRatio = roundTo(dcAcRatio, 3),
            moduleColdVocV = roundTo(moduleColdVocV, 3),
            stringColdVocV = roundTo(stringColdVocV, 3),
            vocLimitV = roundTo(vocLimitV, 2),
            vocOvervoltageFault = vocOvervoltageFault,
            moduleHotVmpV = roundTo(moduleHotVmpV, 3),
            stringHotVmpV = roundTo(stringHotVmpV, 3),
            mpptWindowValid = mpptWindowValid,
            minModulesInSeries = minModulesInSeries,
            maxModulesInSeries = maxModulesInSeries,
            mpptOperatingCurrentA = roundTo(mpptOperatingCurrentA, 3),
            mpptShortCircuitCurrentA = roundTo(mpptShortCircuitCurrentA, 3),
            mpptCurrentExceeded = mpptCurrentExceeded,
            requiredUsableBatteryKwh = roundTo(requiredUsableBatteryKwh, 3),
            requiredNominalBatteryKwh = roundTo(requiredNominalBatteryKwh, 3),
            recommendedBatteryUnits = recommendedBatteryUnits,
            installedNominalBatteryKwh = roundTo(installedNominalBatteryKwh, 3),
            installedUsableBatteryKwh = roundTo(installedUsableBatteryKwh, 3),
            backupAutonomyHours = roundTo(backupAutonomyHours, 1),
            optimalTiltDeg = roundTo(optimalTilt, 1),
            orientationFactor = roundTo(orientationFactor, 4),
            orientationAdvisory = orientationAdvisory,
            expectedDailyYieldKwh = roundTo(expectedDailyYieldKwh, 2),
            expectedAnnualYieldKwh = roundTo(expectedAnnualYieldKwh, 1),
            specificYieldKwhPerKwp = roundTo(specificYieldKwhPerKwp, 1),
            annualDemandKwh = roundTo(annualDemandKwh, 1),
            annualSolarOffsetPct = roundTo(annualSolarOffsetPct, 1),
            estimatedSelfConsumedKwh = roundTo(estimatedSelfConsumedKwh, 1),
            estimatedGridExportKwh = roundTo(estimatedGridExportKwh, 1),
            dcVoltageDropV = roundTo(dcVoltageDropV, 2),
            dcVoltageDropPct = roundTo(dcVoltageDropPct, 3),
            dcCablePass = dcCablePass,
            acCurrentPerInverterA = roundTo(acCurrentPerInverterA, 2),
            acVoltageDropV = roundTo(acVoltageDropV, 2),
            acVoltageDropPct = roundTo(acVoltageDropPct, 3),
            acCablePass = acCablePass,
            recommendedStringFuseA = recommendedStringFuseA,
            recommendedAcBreakerA = recommendedAcBreakerA,
            recommendedDcSpdVoltageV = recommendedDcSpdVoltageV,
            recommendedEarthingMm2 = recommendedEarthingMm2,
            targetEarthResistanceOhms = targetEarthResistanceOhms,
            totalModuleFootprintM2 = roundTo(totalModuleFootprintM2, 2),
            requiredRoofAreaM2 = roundTo(requiredRoofAreaM2, 2),
            roofAreaUtilizationPct = roundTo(roofAreaUtilizationPct, 1),
            maxRoofPanelCapacity = maxRoofPanelCapacity,
            roofFitPass = roofFitPass,
            totalArrayMassKg = roundTo(totalArrayMassKg, 1),
            distributedRoofLoadKgM2 = roundTo(distributedRoofLoadKgM2, 2),
            estimatedWindUpliftKn = roundTo(estimatedWindUpliftKn, 2),
            lifetime25YrYieldKwh = roundTo(lifetime25YrYieldKwh, 1),
            annualCo2AvoidedKg = roundTo(annualCo2AvoidedKg, 1),
            lifetimeCo2AvoidedTonnes = roundTo(lifetimeCo2AvoidedTonnes, 2),
            currency = input.currency,
            firstYearGrossSavings = roundTo(firstYearGrossSavings, 2),
            firstYearNetCashflow = roundTo(firstYearNetCashflow, 2),
            simplePaybackYears = simplePaybackYears,
            netPresentValue = roundTo(npv, 2),
            roi25YrPct = roundTo(roi25YrPct, 1),
            lcoePerKwh = roundTo(lcoePerKwh, 4),
            safetyChecksPassed = hardSafetyErrors.isEmpty(),
            hardSafetyErrors = hardSafetyErrors,
            engineeringWarnings = engineeringWarnings,
            designDisclaimer = SOLAR_ENGINEERING_DESIGN_DISCLAIMER,
        )
    }
}
