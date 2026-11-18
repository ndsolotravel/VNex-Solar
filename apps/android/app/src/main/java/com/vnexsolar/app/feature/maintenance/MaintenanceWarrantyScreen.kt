package com.vnexsolar.app.feature.maintenance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard

@Composable
fun MaintenanceWarrantyScreen(
    viewModel: MaintenanceWarrantyViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()

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
            text = if (isOnline) "Network: Online — /sync/batch & QR lookup ready" else "Network: Offline — notes queued locally",
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
                    onClick = viewModel::queueMaintenanceNoteOffline,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Queue Offline Service Note (${state.queuedNotesCount})")
                }
                state.statusMessage?.let { msg ->
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}
