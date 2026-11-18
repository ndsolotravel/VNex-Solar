package com.vnexsolar.app.feature.engineering

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard

@Composable
fun SolarEngineeringScreen(
    organizationId: String = "local-org",
    deviceId: String = "android-field-device",
    viewModel: SolarEngineeringViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    val calc = state.result

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Solar Engineering Calculator",
            style = MaterialTheme.typography.headlineMedium,
        )

        VNexOfflineStatusBanner(
            isOnline = isOnline,
            pendingOutboxCount = if (state.savedMessage != null) 1 else 0,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = state.modulesInSeriesText,
                onValueChange = { viewModel.updateTopology(series = it) },
                label = { Text("Series / String") },
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = state.activeMpptText,
                onValueChange = { viewModel.updateTopology(mppt = it) },
                label = { Text("Active MPPTs") },
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = state.ambientMinTempCText,
                onValueChange = { viewModel.updateTopology(minTemp = it) },
                label = { Text("Min °C") },
                modifier = Modifier.weight(1f),
            )
        }

        if (!calc.safetyChecksPassed) {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "Safety Validation Blocked",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    calc.hardSafetyErrors.forEach { err ->
                        Text(
                            text = err,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }

        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Deterministic Sizing (${calc.formulaVersion})",
                    style = MaterialTheme.typography.titleMedium,
                )
                VNexMetricRow("Array capacity", "${calc.actualDcKwp} kWp (${calc.totalPanelCount} panels)")
                VNexMetricRow("Cold string Voc", "${calc.stringColdVocV} V (max ${calc.vocLimitV} V)")
                VNexMetricRow("Hot string Vmp", "${calc.stringHotVmpV} V (MPPT ok: ${calc.mpptWindowValid})")
                VNexMetricRow("DC / AC voltage drop", "${calc.dcVoltageDropPct}% / ${calc.acVoltageDropPct}%")
                VNexMetricRow("Recommended fuse / AC MCB", "${calc.recommendedStringFuseA}A / ${calc.recommendedAcBreakerA}A")
                VNexMetricRow("Annual yield", "${calc.expectedAnnualYieldKwh} kWh (${calc.annualSolarOffsetPct}% offset)")
                VNexMetricRow("25-Yr payback", "${calc.simplePaybackYears ?: "N/A"} yrs", showDivider = false)
            }
        }

        Button(
            onClick = { viewModel.queueOfflineDesignDraft(organizationId, deviceId) },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save Design Draft to Offline Sync Queue")
        }

        state.savedMessage?.let { msg ->
            Text(
                text = msg,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
