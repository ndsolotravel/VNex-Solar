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

data class ModuleSpecInput(
    val modelName: String,
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
    val modelName: String,
    val inverterType: String,
    val ratedAcPowerW: Double,
    val maxDcVoltageV: Double,
    val mpptMinV: Double,
    val mpptMaxV: Double,
    val mpptCount: Int,
    val maxInputCurrentPerMpptA: Double,
    val efficiencyPct: Double = 97.6,
    val phases: String = "three",
)

data class SolarCalcInput(
    val dailyEnergyKwh: Double,
    val criticalBackupDailyKwh: Double,
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
    val modulesInSeries: Int,
    val parallelStringsPerMppt: Int,
    val activeMpptCount: Int,
    val inverterCount: Int = 1,
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
    val requiredPvKwp: Double,
    val totalPanelCount: Int,
    val actualDcKwp: Double,
    val dcAcRatio: Double,
    val stringColdVocV: Double,
    val vocLimitV: Double,
    val vocOvervoltageFault: Boolean,
    val stringHotVmpV: Double,
    val mpptWindowValid: Boolean,
    val minModulesInSeries: Int,
    val maxModulesInSeries: Int,
    val mpptOperatingCurrentA: Double,
    val mpptCurrentExceeded: Boolean,
    val recommendedBatteryUnits: Int,
    val expectedAnnualYieldKwh: Double,
    val annualSolarOffsetPct: Double,
    val dcVoltageDropPct: Double,
    val dcCablePass: Boolean,
    val acVoltageDropPct: Double,
    val acCablePass: Boolean,
    val recommendedStringFuseA: Int,
    val recommendedAcBreakerA: Int,
    val recommendedEarthingMm2: Int,
    val requiredRoofAreaM2: Double,
    val roofFitPass: Boolean,
    val totalArrayMassKg: Double,
    val lifetime25YrYieldKwh: Double,
    val annualCo2AvoidedKg: Double,
    val simplePaybackYears: Double?,
    val netPresentValue: Double,
    val lcoePerKwh: Double,
    val safetyChecksPassed: Boolean,
    val hardSafetyErrors: List<String>,
)

object SolarCalculatorEngine {
    private val BREAKER_STEPS = listOf(10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250)
    private val EARTH_STEPS = listOf(6, 10, 16, 25, 35, 50, 70)

    private fun roundTo(value: Double, decimals: Int = 2): Double {
        val factor = 10.0.pow(decimals)
        return round(value * factor) / factor
    }

    private fun nextStandard(required: Double, steps: List<Int>): Int =
        steps.firstOrNull { it >= required } ?: steps.last()

    fun calculate(input: SolarCalcInput): SolarCalcOutput {
        val safePsh = max(1.0, input.peakSunHoursPerDay)
        val requiredPvKwp = input.dailyEnergyKwh / (safePsh * input.performanceRatio)

        val totalPanelCount = max(1, input.modulesInSeries) *
            max(1, input.parallelStringsPerMppt) *
            max(1, input.activeMpptCount)
        val actualDcKwp = (totalPanelCount * input.module.pmaxW) / 1000.0
        val totalAcKw = (max(1, input.inverterCount) * input.inverter.ratedAcPowerW) / 1000.0
        val dcAcRatio = actualDcKwp / max(0.1, totalAcKw)

        val dTCold = input.ambientMinTempC - 25.0
        val moduleColdVocV = input.module.vocV * (1.0 + (input.module.tempCoeffVocPctPerC / 100.0) * dTCold)
        val stringColdVocV = moduleColdVocV * input.modulesInSeries
        val vocLimitV = min(input.inverter.maxDcVoltageV, input.module.maxSystemVoltageV)
        val vocOvervoltageFault = stringColdVocV > vocLimitV

        val cellMaxTempC = input.ambientMaxTempC + input.cellTempRiseAboveAmbientC
        val dTHot = cellMaxTempC - 25.0
        val moduleHotVmpV = input.module.vmpV * (1.0 + (input.module.tempCoeffPmaxPctPerC / 100.0) * dTHot)
        val stringHotVmpV = moduleHotVmpV * input.modulesInSeries
        val mpptWindowValid = stringHotVmpV in input.inverter.mpptMinV..input.inverter.mpptMaxV

        val minModulesInSeries = ceil(input.inverter.mpptMinV / max(1.0, moduleHotVmpV)).toInt()
        val maxModulesInSeries = floor(vocLimitV / max(1.0, moduleColdVocV)).toInt()

        val mpptOperatingCurrentA = input.module.impA * input.parallelStringsPerMppt
        val mpptShortCircuitCurrentA = input.module.iscA * input.parallelStringsPerMppt
        val mpptCurrentExceeded = mpptOperatingCurrentA > input.inverter.maxInputCurrentPerMpptA

        val reqUsableKwh = if (input.inverter.inverterType == "on_grid") 0.0 else input.criticalBackupDailyKwh * input.autonomyDays
        val reqNominalKwh = if (input.inverter.inverterType == "on_grid") {
            0.0
        } else {
            reqUsableKwh / ((input.batteryMaxDodPct / 100.0) * (input.batteryRoundTripEffPct / 100.0) * (input.inverter.efficiencyPct / 100.0))
        }
        val recommendedBatteryUnits = if (input.inverter.inverterType == "on_grid") 0 else ceil((reqNominalKwh * 1000.0) / max(1.0, input.batteryUnitEnergyWh)).toInt()

        val optimalTilt = max(5.0, min(45.0, abs(input.siteLatitudeDeg) - 4.0))
        val tiltDelta = abs(input.tiltDegrees - optimalTilt)
        val azDelta = abs(((input.azimuthDegrees - 180.0 + 540.0) % 360.0) - 180.0)
        val orientationFactor = max(0.65, 1.0 - tiltDelta * 0.0025 - (azDelta / 90.0) * 0.12)
        val shadingFactor = max(0.1, 1.0 - max(0.0, min(90.0, input.shadingLossPct)) / 100.0)
        val expectedAnnualYieldKwh = actualDcKwp * safePsh * input.performanceRatio * shadingFactor * orientationFactor * 365.0

        val annualDemandKwh = input.dailyEnergyKwh * 365.0
        val annualSolarOffsetPct = (expectedAnnualYieldKwh / max(1.0, annualDemandKwh)) * 100.0

        val stringNominalVmp = input.module.vmpV * input.modulesInSeries
        val dcDropV = (2.0 * input.dcCableOneWayLengthM * mpptOperatingCurrentA * PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) / max(0.5, input.dcCableCrossSectionMm2)
        val dcVoltageDropPct = (dcDropV / max(1.0, stringNominalVmp)) * 100.0
        val dcCablePass = dcVoltageDropPct <= 2.0

        val acLineV = if (input.inverter.phases == "three") 400.0 else 230.0
        val acCurrentA = if (input.inverter.phases == "three") {
            input.inverter.ratedAcPowerW / (sqrt(3.0) * 400.0 * input.acPowerFactor)
        } else {
            input.inverter.ratedAcPowerW / (230.0 * input.acPowerFactor)
        }
        val acMult = if (input.inverter.phases == "three") sqrt(3.0) else 2.0
        val acDropV = (acMult * input.acCableOneWayLengthM * acCurrentA * PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) / max(1.0, input.acCableCrossSectionMm2)
        val acVoltageDropPct = (acDropV / acLineV) * 100.0
        val acCablePass = acVoltageDropPct <= 2.5

        val recommendedStringFuseA = nextStandard(mpptShortCircuitCurrentA * 1.56, BREAKER_STEPS)
        val recommendedAcBreakerA = nextStandard(acCurrentA * 1.25, BREAKER_STEPS)
        val minEarthMm2 = if (input.acCableCrossSectionMm2 <= 16.0) max(6.0, input.acCableCrossSectionMm2) else max(16.0, input.acCableCrossSectionMm2 / 2.0)
        val recommendedEarthingMm2 = nextStandard(minEarthMm2, EARTH_STEPS)

        val moduleFootprint = totalPanelCount * input.module.areaM2
        val requiredRoofAreaM2 = moduleFootprint * (1.25 + (max(0.0, input.tiltDegrees) / 90.0) * 0.45)
        val roofFitPass = requiredRoofAreaM2 <= input.usableRoofAreaM2
        val totalArrayMassKg = totalPanelCount * (input.module.weightKg + 4.5)

        val degRate = input.degradationPctPerYear / 100.0
        var lifetime25YrYieldKwh = 0.0
        for (yr in 0 until 25) {
            lifetime25YrYieldKwh += expectedAnnualYieldKwh * (1.0 - degRate).pow(yr)
        }
        val annualCo2AvoidedKg = expectedAnnualYieldKwh * input.gridEmissionFactorKgPerKwh

        val selfConsumedRatio = if (input.inverter.inverterType != "on_grid") 0.72 else 0.48
        val estSelfConsumed = min(annualDemandKwh, expectedAnnualYieldKwh * selfConsumedRatio)
        val estExported = max(0.0, expectedAnnualYieldKwh - estSelfConsumed)
        val yr1Net = estSelfConsumed * input.gridTariffPerKwh + estExported * input.exportTariffPerKwh - input.annualOmCost
        val payback = if (yr1Net > 0.0) roundTo(input.systemCapexAmount / yr1Net, 2) else null

        var npv = -input.systemCapexAmount
        var totalDiscCosts = input.systemCapexAmount
        var totalDiscYield = 0.0
        val escRate = input.tariffEscalationPctPerYear / 100.0
        val discRate = input.discountRatePct / 100.0

        for (yr in 1..25) {
            val degF = (1.0 - degRate).pow(yr - 1)
            val escF = (1.0 + escRate).pow(yr - 1)
            val yrSav = estSelfConsumed * degF * input.gridTariffPerKwh * escF +
                estExported * degF * input.exportTariffPerKwh * escF
            val yrOm = input.annualOmCost * 1.03.pow(yr - 1)
            val discDiv = (1.0 + discRate).pow(yr)
            npv += (yrSav - yrOm) / discDiv
            totalDiscCosts += yrOm / discDiv
            totalDiscYield += (expectedAnnualYieldKwh * degF) / discDiv
        }
        val lcoe = if (totalDiscYield > 0.0) totalDiscCosts / totalDiscYield else 0.0

        val errors = mutableListOf<String>()
        if (vocOvervoltageFault) {
            errors.add("Cold Voc ${roundTo(stringColdVocV, 1)}V exceeds limit ${vocLimitV}V")
        }
        if (input.activeMpptCount > input.inverter.mpptCount * input.inverterCount) {
            errors.add("Active MPPT count exceeds inverter capacity")
        }

        return SolarCalcOutput(
            formulaVersion = SOLAR_ENGINEERING_FORMULA_VERSION,
            requiredPvKwp = roundTo(requiredPvKwp, 3),
            totalPanelCount = totalPanelCount,
            actualDcKwp = roundTo(actualDcKwp, 3),
            dcAcRatio = roundTo(dcAcRatio, 3),
            stringColdVocV = roundTo(stringColdVocV, 3),
            vocLimitV = roundTo(vocLimitV, 2),
            vocOvervoltageFault = vocOvervoltageFault,
            stringHotVmpV = roundTo(stringHotVmpV, 3),
            mpptWindowValid = mpptWindowValid,
            minModulesInSeries = minModulesInSeries,
            maxModulesInSeries = maxModulesInSeries,
            mpptOperatingCurrentA = roundTo(mpptOperatingCurrentA, 3),
            mpptCurrentExceeded = mpptCurrentExceeded,
            recommendedBatteryUnits = recommendedBatteryUnits,
            expectedAnnualYieldKwh = roundTo(expectedAnnualYieldKwh, 1),
            annualSolarOffsetPct = roundTo(annualSolarOffsetPct, 1),
            dcVoltageDropPct = roundTo(dcVoltageDropPct, 3),
            dcCablePass = dcCablePass,
            acVoltageDropPct = roundTo(acVoltageDropPct, 3),
            acCablePass = acCablePass,
            recommendedStringFuseA = recommendedStringFuseA,
            recommendedAcBreakerA = recommendedAcBreakerA,
            recommendedEarthingMm2 = recommendedEarthingMm2,
            requiredRoofAreaM2 = roundTo(requiredRoofAreaM2, 2),
            roofFitPass = roofFitPass,
            totalArrayMassKg = roundTo(totalArrayMassKg, 1),
            lifetime25YrYieldKwh = roundTo(lifetime25YrYieldKwh, 1),
            annualCo2AvoidedKg = roundTo(annualCo2AvoidedKg, 1),
            simplePaybackYears = payback,
            netPresentValue = roundTo(npv, 2),
            lcoePerKwh = roundTo(lcoe, 4),
            safetyChecksPassed = errors.isEmpty(),
            hardSafetyErrors = errors,
        )
    }
}
