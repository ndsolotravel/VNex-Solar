package com.vnexsolar.app

import com.vnexsolar.app.feature.engineering.InverterSpecInput
import com.vnexsolar.app.feature.engineering.ModuleSpecInput
import com.vnexsolar.app.feature.engineering.SolarCalcInput
import com.vnexsolar.app.feature.engineering.SolarCalculatorEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SolarCalculatorEngineTest {

    private fun baseInput(series: Int = 10, minTempC: Double = 0.0): SolarCalcInput =
        SolarCalcInput(
            dailyEnergyKwh = 40.0,
            criticalBackupDailyKwh = 12.0,
            usableRoofAreaM2 = 150.0,
            shadingLossPct = 0.0,
            ambientMinTempC = minTempC,
            ambientMaxTempC = 45.0,
            peakSunHoursPerDay = 5.0,
            tiltDegrees = 27.5,
            azimuthDegrees = 180.0,
            module = ModuleSpecInput(
                modelName = "Test 500W",
                pmaxW = 500.0,
                vocV = 50.0,
                vmpV = 42.0,
                iscA = 13.0,
                impA = 12.0,
                tempCoeffVocPctPerC = -0.28,
                tempCoeffPmaxPctPerC = -0.35,
            ),
            inverter = InverterSpecInput(
                modelName = "Test 10K",
                inverterType = "hybrid",
                ratedAcPowerW = 10000.0,
                maxDcVoltageV = 800.0,
                mpptMinV = 200.0,
                mpptMaxV = 650.0,
                mpptCount = 2,
                maxInputCurrentPerMpptA = 26.0,
            ),
            modulesInSeries = series,
            parallelStringsPerMppt = 1,
            activeMpptCount = 2,
            dcCableOneWayLengthM = 25.0,
            dcCableCrossSectionMm2 = 6.0,
            acCableOneWayLengthM = 20.0,
            acCableCrossSectionMm2 = 10.0,
            systemCapexAmount = 2_000_000.0,
            gridTariffPerKwh = 60.0,
            exportTariffPerKwh = 20.0,
            annualOmCost = 20_000.0,
        )

    @Test
    fun cold_voc_and_safe_series_bounds_match_reference() {
        val output = SolarCalculatorEngine.calculate(baseInput(series = 10, minTempC = 0.0))
        // Voc_cold = 50 * (1 + (-0.0028)*(-25)) * 10 = 50 * 1.07 * 10 = 535.0V
        assertEquals(535.0, output.stringColdVocV, 0.05)
        assertTrue(output.safetyChecksPassed)
        assertFalse(output.vocOvervoltageFault)
    }

    @Test
    fun excessive_series_modules_triggers_cold_voc_overvoltage_blocker() {
        // 16 * 53.5V = 856V > 800V max inverter input
        val unsafe = SolarCalculatorEngine.calculate(baseInput(series = 16, minTempC = 0.0))
        assertTrue(unsafe.vocOvervoltageFault)
        assertFalse(unsafe.safetyChecksPassed)
    }
}
