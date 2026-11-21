package com.vnexsolar.app.feature.maintenance

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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.media.QrBarcodeScannerDialog

@Composable
fun MaintenanceWarrantyScreen(
    viewModel: MaintenanceWarrantyViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()
    var showQrScanner by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "O&M Service Visit & QR Asset Lookup",
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = if (isOnline) "Network: Online — ML Kit QR lookup & /sync/batch ready" else "Network: Offline — notes queued locally in Room",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        VNexSurfaceCard {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = state.qrCodeToken,
                    onValueChange = viewModel::updateQrCodeToken,
                    label = { Text("Asset QR Code Token") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { showQrScanner = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Scan QR (ML Kit)")
                    }
                    Button(
                        onClick = { viewModel.lookupQrAsset() },
                        enabled = !state.isLookingUpQr,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(if (state.isLookingUpQr) "Looking Up..." else "Lookup Asset")
                    }
                }
            }
        }

        state.lookedUpAsset?.let { workspace ->
            VNexSurfaceCard {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(workspace.asset.sku, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                        Text(
                            text = if (workspace.warrantyActive) "WARRANTY ACTIVE" else "WARRANTY EXPIRED",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (workspace.warrantyActive) VNexColors.NominalGreen else VNexColors.CriticalRed,
                        )
                    }
                    Text(workspace.asset.modelName, style = MaterialTheme.typography.bodyMedium)
                    VNexMetricRow("Serial Number", workspace.asset.serialNumber)
                    VNexMetricRow("Warranty Expires", workspace.asset.warrantyExpiresOn ?: "n/a")
                    VNexMetricRow("Open Tickets / Claims", "${workspace.tickets.size} / ${workspace.warrantyClaims.size}", showDivider = false)
                }
            }
        }

        VNexSurfaceCard {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Field Maintenance Note", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = state.fieldFindings,
                    onValueChange = viewModel::updateFieldFindings,
                    label = { Text("Field Inspection Findings") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.actionsTaken,
                    onValueChange = viewModel::updateActionsTaken,
                    label = { Text("Corrective / Cleaning Actions") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { viewModel.queueMaintenanceNoteOffline() },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Queue Offline Service Note (${state.queuedNotesCount})")
                }
                state.statusMessage?.let { msg ->
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.bodySmall,
                        color = VNexColors.NominalGreen,
                    )
                }
                state.errorMessage?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = VNexColors.WarningAmber,
                    )
                }
            }
        }

        if (state.recentSchedules.isNotEmpty() || state.recentTickets.isNotEmpty()) {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("O&M Schedules & Active Tickets", style = MaterialTheme.typography.titleMedium)
                    VNexMetricRow("Active Preventive Schedules", "${state.recentSchedules.size}")
                    VNexMetricRow("Service Tickets", "${state.recentTickets.size}", showDivider = false)
                }
            }
        }
    }

    if (showQrScanner) {
        QrBarcodeScannerDialog(
            title = "Scan Solar Asset QR Code",
            hint = "Point camera at the VNex Solar equipment QR tag on inverter, array, or combiner box.",
            onScanned = { rawCode ->
                showQrScanner = false
                viewModel.onQrBarcodeScanned(rawCode)
            },
            onDismiss = { showQrScanner = false },
        )
    }
}
