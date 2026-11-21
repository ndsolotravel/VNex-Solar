package com.vnexsolar.app.feature.surveys

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexReadableContentBox
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.location.SiteLocationHelper
import java.util.Locale

@Composable
fun SiteSurveyScreen(
    organizationId: String = "local-org",
    surveyorUserId: String = "local-user",
    deviceId: String = "android-field-device",
    viewModel: SiteSurveyViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    var showCamera by rememberSaveable { mutableStateOf(false) }

    val readGpsFix: () -> Unit = {
        val fix = SiteLocationHelper.readBestLastKnownLocation(context)
        if (fix != null) {
            val latStr = String.format(Locale.US, "%.6f", fix.latitude)
            val lngStr = String.format(Locale.US, "%.6f", fix.longitude)
            val accLabel = fix.accuracyMeters?.let { " (+/- ${it.toInt()}m)" } ?: ""
            viewModel.updateSiteCoordinates(latStr, lngStr, "GPS tagged via ${fix.provider}$accLabel")
        } else {
            viewModel.updateSiteCoordinates(
                state.latitude,
                state.longitude,
                "No cached GPS fix available yet; enter coordinates manually or enable Location.",
            )
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            readGpsFix()
        } else {
            viewModel.updateSiteCoordinates(
                state.latitude,
                state.longitude,
                "Location permission denied; manual coordinate entry remains available.",
            )
        }
    }

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

    VNexReadableContentBox(modifier = Modifier.fillMaxSize()) {
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
                        label = "GPS Coordinates",
                        value = if (state.latitude.isNotBlank() && state.longitude.isNotBlank()) {
                            "${state.latitude}, ${state.longitude}"
                        } else {
                            "Optional (not tagged)"
                        },
                    )
                    VNexMetricRow(
                        label = "CameraX queued photos",
                        value = "${state.queuedPhotoCount}",
                        showDivider = false,
                    )
                }
            }

            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Optional GPS Site Tag",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        OutlinedButton(
                            onClick = {
                                if (SiteLocationHelper.hasLocationPermission(context)) {
                                    readGpsFix()
                                } else {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_COARSE_LOCATION,
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                        ),
                                    )
                                }
                            },
                        ) {
                            Text("Tag GPS")
                        }
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = state.latitude,
                            onValueChange = { viewModel.updateSiteCoordinates(it, state.longitude) },
                            label = { Text("Latitude") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.longitude,
                            onValueChange = { viewModel.updateSiteCoordinates(state.latitude, it) },
                            label = { Text("Longitude") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    state.gpsStatusLabel?.let { status ->
                        Text(
                            text = status,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
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
}
