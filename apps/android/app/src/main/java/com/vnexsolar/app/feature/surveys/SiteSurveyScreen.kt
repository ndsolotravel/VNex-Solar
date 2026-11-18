package com.vnexsolar.app.feature.surveys

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

@Composable
fun SiteSurveyScreen(
    organizationId: String = "local-org",
    surveyorUserId: String = "local-user",
    deviceId: String = "android-field-device",
    viewModel: SiteSurveyViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    var showCamera by remember { mutableStateOf(false) }

    if (showCamera) {
        SurveyCameraScreen(
            surveyId = state.surveyId,
            onPhotoCaptured = { localPath, jpegBytes ->
                viewModel.queueCapturedPhoto(organizationId, localPath, jpegBytes)
                showCamera = false
            },
            onClose = { showCamera = false },
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Offline Site Survey",
            style = MaterialTheme.typography.headlineMedium,
        )

        VNexOfflineStatusBanner(
            isOnline = isOnline,
            pendingOutboxCount = if (state.lastSavedMessage != null) 1 else 0,
        )

        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    text = "Site Summary",
                    style = MaterialTheme.typography.titleMedium,
                )
                VNexMetricRow(label = "Roof sections", value = "${state.roofSections.size}")
                VNexMetricRow(label = "Appliance load entries", value = "${state.loadItems.size}")
                VNexMetricRow(
                    label = "CameraX queued photos",
                    value = "${state.queuedPhotoCount}",
                    showDivider = false,
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Checkbox(
                checked = state.earthingAvailable,
                onCheckedChange = viewModel::toggleEarthing,
            )
            Text(
                text = "Existing earthing pit verified on site",
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        OutlinedTextField(
            value = state.notes,
            onValueChange = viewModel::updateNotes,
            label = { Text("Surveyor field observations & shading notes") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = {
                    viewModel.addRoofSection(
                        RoofSectionDraft(
                            sectionName = "Main RCC Slab ${state.roofSections.size + 1}",
                            roofType = "rcc_flat",
                            usableAreaM2 = 72.0,
                            tiltDegrees = 24.0,
                            azimuthDegrees = 180.0,
                            shadingFactorPct = 4.0,
                        ),
                    )
                },
                modifier = Modifier.weight(1f),
            ) {
                Text("Add Roof Section")
            }

            OutlinedButton(
                onClick = { showCamera = true },
                modifier = Modifier.weight(1f),
            ) {
                Text("Capture Photo")
            }
        }

        Button(
            onClick = {
                viewModel.saveSurveyOffline(organizationId, surveyorUserId, deviceId)
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save Offline Draft & Enqueue Sync")
        }

        state.lastSavedMessage?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
