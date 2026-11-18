package com.vnexsolar.app.feature.safety

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.feature.surveys.SurveyCameraScreen

@Composable
fun SafetyInspectionScreen(
    organizationId: String = "local-org",
    deviceId: String = "android-field-device",
    viewModel: SafetyInspectionViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    var showCamera by remember { mutableStateOf(false) }

    if (showCamera) {
        SurveyCameraScreen(
            surveyId = state.inspectionId,
            onPhotoCaptured = { localPath, jpegBytes ->
                viewModel.queueSafetyEvidencePhoto(organizationId, localPath, jpegBytes)
                showCamera = false
            },
            onClose = { showCamera = false },
        )
        return
    }

    val passCount = state.checkItems.count { it.result == "pass" }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Safety & IEC 62446-1 Inspection",
            style = MaterialTheme.typography.headlineMedium,
        )

        VNexOfflineStatusBanner(
            isOnline = isOnline,
            pendingOutboxCount = if (state.statusMessage != null) 1 else 0,
        )

        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Pre-Energization Safety Controls",
                    style = MaterialTheme.typography.titleMedium,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = state.ppeVerified,
                        onCheckedChange = viewModel::togglePpeVerified,
                    )
                    Text("Class 0 PPE, helmet & dielectric footwear verified", style = MaterialTheme.typography.bodyMedium)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = state.electricalIsolationVerified,
                        onCheckedChange = viewModel::toggleElectricalIsolation,
                    )
                    Text("DC/AC LOTO electrical isolation verified", style = MaterialTheme.typography.bodyMedium)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = state.workingAtHeightVerified,
                        onCheckedChange = viewModel::toggleWorkingAtHeight,
                    )
                    Text("Roof harness & anchor lifeline inspection verified", style = MaterialTheme.typography.bodyMedium)
                }
                VNexMetricRow(
                    label = "Checklist items passing",
                    value = "$passCount / ${state.checkItems.size}",
                )
                VNexMetricRow(
                    label = "Evidence photos queued",
                    value = "${state.queuedPhotoCount}",
                    showDivider = false,
                )
            }
        }

        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Electrical Test Readings",
                    style = MaterialTheme.typography.titleMedium,
                )
                OutlinedTextField(
                    value = state.earthResistanceOhms,
                    onValueChange = viewModel::updateEarthResistance,
                    label = { Text("Earth Electrode Resistance (Ohm, limit <= 5.0)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = state.insulationResistanceMOhm,
                    onValueChange = viewModel::updateInsulationResistance,
                    label = { Text("DC String Insulation Resistance (MOhm, min >= 1.0)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }
        }

        state.checkItems.forEach { item ->
            VNexSurfaceCard {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.checkCode, style = MaterialTheme.typography.labelLarge)
                        Text(item.description, style = MaterialTheme.typography.bodyMedium)
                    }
                    OutlinedButton(onClick = { viewModel.toggleCheckItemResult(item.checkCode) }) {
                        Text(item.result.uppercase())
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = { showCamera = true },
                modifier = Modifier.weight(1f),
            ) {
                Text("Safety Photo")
            }
            Button(
                onClick = { viewModel.queueInspectionDraftOffline(organizationId, deviceId) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Queue Inspection")
            }
        }

        state.statusMessage?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
