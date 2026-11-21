package com.vnexsolar.app

import com.vnexsolar.app.feature.engineering.ApplianceLoadItem
import com.vnexsolar.app.feature.engineering.BatterySpecInput
import com.vnexsolar.app.feature.engineering.InverterSpecInput
import com.vnexsolar.app.feature.engineering.ModuleSpecInput
import com.vnexsolar.app.feature.engineering.SOLAR_ENGINEERING_FORMULA_VERSION
import com.vnexsolar.app.feature.engineering.SolarCalcInput
import com.vnexsolar.app.feature.engineering.SolarCalculatorEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SolarCalculatorEngineTest {

    private fun referenceInput(
        series: Int = 10,
        minTempC: Double = 0.0,
        inverterType: String = "hybrid",
    ): SolarCalcInput =
        SolarCalcInput(
            currency = "PKR",
            overrideDailyEnergyKwh = 40.0,
            overridePeakPowerKw = 8.0,
            overrideCriticalBackupKwh = 12.0,
            usableRoofAreaM2 = 150.0,
            shadingLossPct = 0.0,
            ambientMinTempC = minTempC,
            ambientMaxTempC = 45.0,
            cellTempRiseAboveAmbientC = 25.0,
            peakSunHoursPerDay = 5.0,
            tiltDegrees = 27.5,
            azimuthDegrees = 180.0,
            siteLatitudeDeg = 31.5,
            windSpeedMs = 30.0,
            module = ModuleSpecInput(
                id = "mod-ref-500",
                modelName = "Reference 500W Mono",
                manufacturer = "Reference PV",
                pmaxW = 500.0,
                vocV = 50.0,
                vmpV = 42.0,
                iscA = 13.0,
                impA = 12.0,
                tempCoeffVocPctPerC = -0.28,
                tempCoeffPmaxPctPerC = -0.35,
                maxSystemVoltageV = 1500.0,
                areaM2 = 2.5,
                weightKg = 25.0,
            ),
            inverter = InverterSpecInput(
                id = "inv-ref-10k",
                modelName = "Reference 10K Hybrid",
                manufacturer = "Reference Inv",
                inverterType = inverterType,
                ratedAcPowerW = 10000.0,
                maxDcInputW = 15000.0,
                maxDcVoltageV = 800.0,
                mpptMinV = 200.0,
                mpptMaxV = 650.0,
                mpptCount = 2,
                maxInputCurrentPerMpptA = 26.0,
                efficiencyPct = 97.5,
                phases = "three",
            ),
            battery = BatterySpecInput(
                id = "bat-ref-5k",
                modelName = "Reference 5kWh LFP",
                manufacturer = "Reference Bat",
                chemistry = "LFP",
                nominalVoltageV = 48.0,
                capacityAh = 100.0,
                energyWh = 5000.0,
                maxDodPct = 90.0,
                roundTripEfficiencyPct = 95.0,
            ),
            modulesInSeries = series,
            parallelStringsPerMppt = 1,
            activeMpptCount = 2,
            inverterCount = 1,
            dcCableOneWayLengthM = 25.0,
            dcCableCrossSectionMm2 = 6.0,
            acCableOneWayLengthM = 20.0,
            acCableCrossSectionMm2 = 10.0,
            acPowerFactor = 1.0,
            performanceRatio = 0.80,
            degradationPctPerYear = 0.5,
            gridEmissionFactorKgPerKwh = 0.6,
            systemCapexAmount = 2_000_000.0,
            gridTariffPerKwh = 60.0,
            exportTariffPerKwh = 20.0,
            tariffEscalationPctPerYear = 0.0,
            annualOmCost = 20_000.0,
            discountRatePct = 10.0,
        )

    @Test
    fun all_20_calculators_match_typescript_domain_reference_outputs() {
        val out = SolarCalculatorEngine.calculate(referenceInput())

        assertEquals(SOLAR_ENGINEERING_FORMULA_VERSION, out.formulaVersion)
        assertEquals(40.0, out.dailyEnergyKwh, 0.001)
        assertEquals(10.0, out.requiredPvKwp, 0.001)
        assertEquals(20, out.totalPanelCount)
        assertEquals(10.0, out.actualDcKwp, 0.001)
        assertEquals(1.0, out.dcAcRatio, 0.001)

        // Cold Voc = 50 * (1 + (-0.0028)*(-25)) = 53.5V -> 535.0V
        assertEquals(53.5, out.moduleColdVocV, 0.01)
        assertEquals(535.0, out.stringColdVocV, 0.01)
        assertFalse(out.vocOvervoltageFault)

        // Hot Vmp = 42 * (1 - 0.0035 * 45) = 35.385V -> 353.85V
        assertEquals(35.385, out.moduleHotVmpV, 0.005)
        assertEquals(353.85, out.stringHotVmpV, 0.02)
        assertTrue(out.mpptWindowValid)
        assertEquals(6, out.minModulesInSeries)
        assertEquals(14, out.maxModulesInSeries)
        assertEquals(12.0, out.mpptOperatingCurrentA, 0.01)
        assertFalse(out.mpptCurrentExceeded)

        // Battery sizing
        assertEquals(6.0, out.requiredUsableBatteryKwh, 0.01)
        assertEquals(2, out.recommendedBatteryUnits)
        assertEquals(10.0, out.installedNominalBatteryKwh, 0.01)
        assertEquals(9.0, out.installedUsableBatteryKwh, 0.01)
        assertEquals(18.0, out.backupAutonomyHours, 0.2)

        // Orientation, Yield & Net Metering
        assertEquals(1.0, out.orientationFactor, 0.001)
        assertEquals(14600.0, out.expectedAnnualYieldKwh, 1.0)
        assertEquals(100.0, out.annualSolarOffsetPct, 0.1)

        // Cables & Protection
        assertEquals(1.78, out.dcVoltageDropV, 0.01)
        assertEquals(0.424, out.dcVoltageDropPct, 0.005)
        assertTrue(out.dcCablePass)
        assertEquals(14.43, out.acCurrentPerInverterA, 0.05)
        assertTrue(out.acCablePass)
        assertEquals(25, out.recommendedStringFuseA)
        assertEquals(20, out.recommendedAcBreakerA)
        assertEquals(600, out.recommendedDcSpdVoltageV)
        assertEquals(10, out.recommendedEarthingMm2)
        assertEquals(2.0, out.targetEarthResistanceOhms, 0.01)

        // Structural & Carbon & Financial
        assertTrue(out.roofFitPass)
        assertEquals(590.0, out.totalArrayMassKg, 0.1)
        assertEquals(8760.0, out.annualCo2AvoidedKg, 0.5)
        assertNotNull(out.simplePaybackYears)
        assertTrue(out.simplePaybackYears!! in 0.5..4.0)
        assertTrue(out.netPresentValue > 0.0)
        assertTrue(out.roi25YrPct > 0.0)
        assertTrue(out.lcoePerKwh in 0.1..25.0)
        assertTrue(out.safetyChecksPassed)
        assertTrue(out.engineeringWarnings.isEmpty())
    }

    @Test
    fun appliance_load_profile_computes_daily_surge_and_critical_kwh() {
        val summary = SolarCalculatorEngine.computeLoadSummary(
            listOf(
                ApplianceLoadItem("1", "Inverter AC", 2, 1500.0, 5.0, isCriticalBackupLoad = false, surgeFactor = 1.5),
                ApplianceLoadItem("2", "Fridge", 1, 200.0, 10.0, isCriticalBackupLoad = true, surgeFactor = 2.0),
            ),
        )
        // Daily: 2*1500*5 + 1*200*10 = 15000 + 2000 = 17000 Wh = 17 kWh
        // Connected: 3000 + 200 = 3.2 kW; Surge: 3000*1.5 + 200*2.0 = 4.9 kW; Critical: 2.0 kWh
        assertEquals(17.0, summary.dailyEnergyKwh, 0.001)
        assertEquals(3.2, summary.connectedPowerKw, 0.001)
        assertEquals(4.9, summary.peakSurgePowerKw, 0.001)
        assertEquals(2.0, summary.criticalBackupDailyKwh, 0.001)
    }

    @Test
    fun excessive_series_modules_triggers_cold_voc_overvoltage_blocker() {
        // 16 * 53.5V = 856V > 800V max inverter input -> hard blocker & SPD escalates to 1000V
        val unsafe = SolarCalculatorEngine.calculate(referenceInput(series = 16, minTempC = 0.0))
        assertTrue(unsafe.vocOvervoltageFault)
        assertFalse(unsafe.safetyChecksPassed)
        assertEquals(1000, unsafe.recommendedDcSpdVoltageV)
    }

    @Test
    fun on_grid_inverter_disables_battery_units() {
        val onGrid = SolarCalculatorEngine.calculate(referenceInput(inverterType = "on_grid"))
        assertEquals(0, onGrid.recommendedBatteryUnits)
        assertEquals(0.0, onGrid.installedNominalBatteryKwh, 0.001)
        assertEquals(0.0, onGrid.backupAutonomyHours, 0.001)
    }
}
