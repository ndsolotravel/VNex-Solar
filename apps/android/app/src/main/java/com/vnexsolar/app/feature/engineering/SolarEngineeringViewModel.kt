package com.vnexsolar.app.feature.engineering

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class SolarDesignDraftOutboxJson(
    val projectId: String,
    val title: String,
    val formulaVersion: String,
    val modulesInSeries: Int,
    val parallelStringsPerMppt: Int,
    val activeMpptCount: Int,
    val actualDcKwp: Double,
    val stringColdVocV: Double,
    val dcVoltageDropPct: Double,
    val acVoltageDropPct: Double,
)

data class SolarEngineeringUiState(
    val designId: String = UUID.randomUUID().toString(),
    val projectId: String = "",
    val title: String = "12 kWp Hybrid Residential Array",
    val modulesInSeriesText: String = "10",
    val parallelStringsText: String = "1",
    val activeMpptText: String = "2",
    val ambientMinTempCText: String = "4",
    val ambientMaxTempCText: String = "46",
    val dcCableLengthText: String = "28",
    val dcCableMm2Text: String = "6",
    val acCableLengthText: String = "18",
    val acCableMm2Text: String = "10",
    val result: SolarCalcOutput = defaultCalculation(10, 1, 2, 4.0, 46.0, 28.0, 6.0, 18.0, 10.0),
    val savedMessage: String? = null,
)

private fun defaultCalculation(
    series: Int,
    parallel: Int,
    mpptCount: Int,
    minTemp: Double,
    maxTemp: Double,
    dcLen: Double,
    dcMm2: Double,
    acLen: Double,
    acMm2: Double,
): SolarCalcOutput = SolarCalculatorEngine.calculate(
    SolarCalcInput(
        dailyEnergyKwh = 42.0,
        criticalBackupDailyKwh = 14.0,
        usableRoofAreaM2 = 120.0,
        shadingLossPct = 3.0,
        ambientMinTempC = minTemp,
        ambientMaxTempC = maxTemp,
        peakSunHoursPerDay = 5.2,
        tiltDegrees = 24.0,
        azimuthDegrees = 180.0,
        module = ModuleSpecInput(
            modelName = "Hi-MO 6 580W",
            pmaxW = 580.0,
            vocV = 52.21,
            vmpV = 44.06,
            iscA = 14.20,
            impA = 13.17,
            tempCoeffVocPctPerC = -0.26,
            tempCoeffPmaxPctPerC = -0.29,
        ),
        inverter = InverterSpecInput(
            modelName = "Nitrox Hybrid 12K-3P",
            inverterType = "hybrid",
            ratedAcPowerW = 12000.0,
            maxDcVoltageV = 800.0,
            mpptMinV = 200.0,
            mpptMaxV = 650.0,
            mpptCount = 2,
            maxInputCurrentPerMpptA = 26.0,
        ),
        modulesInSeries = series,
        parallelStringsPerMppt = parallel,
        activeMpptCount = mpptCount,
        dcCableOneWayLengthM = dcLen,
        dcCableCrossSectionMm2 = dcMm2,
        acCableOneWayLengthM = acLen,
        acCableCrossSectionMm2 = acMm2,
        systemCapexAmount = 2_450_000.0,
        gridTariffPerKwh = 62.0,
        exportTariffPerKwh = 22.0,
        annualOmCost = 35_000.0,
    ),
)

@HiltViewModel
class SolarEngineeringViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val offlineRepository: OfflineRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SolarEngineeringUiState())
    val uiState: StateFlow<SolarEngineeringUiState> = _uiState.asStateFlow()

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    fun updateTopology(
        series: String = _uiState.value.modulesInSeriesText,
        parallel: String = _uiState.value.parallelStringsText,
        mppt: String = _uiState.value.activeMpptText,
        minTemp: String = _uiState.value.ambientMinTempCText,
        maxTemp: String = _uiState.value.ambientMaxTempCText,
    ) {
        _uiState.update { cur ->
            val nextCalc = defaultCalculation(
                series = series.toIntOrNull()?.coerceAtLeast(1) ?: 10,
                parallel = parallel.toIntOrNull()?.coerceAtLeast(1) ?: 1,
                mpptCount = mppt.toIntOrNull()?.coerceAtLeast(1) ?: 2,
                minTemp = minTemp.toDoubleOrNull() ?: 4.0,
                maxTemp = maxTemp.toDoubleOrNull() ?: 46.0,
                dcLen = cur.dcCableLengthText.toDoubleOrNull() ?: 28.0,
                dcMm2 = cur.dcCableMm2Text.toDoubleOrNull() ?: 6.0,
                acLen = cur.acCableLengthText.toDoubleOrNull() ?: 18.0,
                acMm2 = cur.acCableMm2Text.toDoubleOrNull() ?: 10.0,
            )
            cur.copy(
                modulesInSeriesText = series,
                parallelStringsText = parallel,
                activeMpptText = mppt,
                ambientMinTempCText = minTemp,
                ambientMaxTempCText = maxTemp,
                result = nextCalc,
            )
        }
    }

    fun queueOfflineDesignDraft(organizationId: String, deviceId: String) {
        val s = _uiState.value
        val draft = SolarDesignDraftOutboxJson(
            projectId = s.projectId,
            title = s.title,
            formulaVersion = s.result.formulaVersion,
            modulesInSeries = s.modulesInSeriesText.toIntOrNull() ?: 10,
            parallelStringsPerMppt = s.parallelStringsText.toIntOrNull() ?: 1,
            activeMpptCount = s.activeMpptText.toIntOrNull() ?: 2,
            actualDcKwp = s.result.actualDcKwp,
            stringColdVocV = s.result.stringColdVocV,
            dcVoltageDropPct = s.result.dcVoltageDropPct,
            acVoltageDropPct = s.result.acVoltageDropPct,
        )
        viewModelScope.launch {
            offlineRepository.enqueueEntityOutboxMutation(
                organizationId = organizationId,
                entityType = "solar_design_draft",
                entityId = s.designId,
                operationType = "create",
                baseRowVersion = 0,
                payloadJson = Json.encodeToString(draft),
            )
            SyncWorker.enqueueOneTime(appContext, organizationId, deviceId)
            _uiState.update {
                it.copy(savedMessage = "Draft solar design queued in Room outbox (${s.result.actualDcKwp} kWp).")
            }
        }
    }
}
