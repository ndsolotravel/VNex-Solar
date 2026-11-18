package com.vnexsolar.app.feature.installations

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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.feature.surveys.SurveyCameraScreen

@Composable
fun InstallationTasksScreen(
    organizationId: String = "local-org",
    deviceId: String = "android-field-device",
    viewModel: InstallationTasksViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    var showCamera by remember { mutableStateOf(false) }

    if (showCamera) {
        SurveyCameraScreen(
            surveyId = state.jobId,
            onPhotoCaptured = { localPath, jpegBytes ->
                viewModel.queueInstallationPhoto(organizationId, localPath, jpegBytes)
                showCamera = false
            },
            onClose = { showCamera = false },
        )
        return
    }

    val completedCount = state.tasks.count { it.status == "completed" }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Field Installation Tasks",
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
                    text = "Job Summary (${state.jobCode})",
                    style = MaterialTheme.typography.titleMedium,
                )
                VNexMetricRow(
                    label = "Tasks completed",
                    value = "$completedCount / ${state.tasks.size}",
                )
                VNexMetricRow(
                    label = "Queued site photos",
                    value = "${state.queuedPhotoCount}",
                )
                VNexMetricRow(
                    label = "Safety gate",
                    value = if (state.safetyCleared) "Cleared" else "Pending inspection",
                    showDivider = false,
                )
            }
        }

        state.tasks.forEachIndexed { idx, task ->
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "0${idx + 1}. ${task.title}",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = "Status: ${task.status.replace('_', ' ')} · v${task.rowVersion}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = {
                                viewModel.advanceTaskStatusOffline(
                                    organizationId = organizationId,
                                    deviceId = deviceId,
                                    taskId = task.id,
                                    nextStatus = "in_progress",
                                )
                            },
                            enabled = task.status == "pending",
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Start")
                        }
                        Button(
                            onClick = {
                                viewModel.advanceTaskStatusOffline(
                                    organizationId = organizationId,
                                    deviceId = deviceId,
                                    taskId = task.id,
                                    nextStatus = "completed",
                                )
                            },
                            enabled = task.status != "completed",
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Complete")
                        }
                    }
                }
            }
        }

        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Daily Site Diary & Photo Proof",
                    style = MaterialTheme.typography.titleMedium,
                )
                OutlinedTextField(
                    value = state.weatherConditions,
                    onValueChange = viewModel::updateWeatherConditions,
                    label = { Text("Weather conditions") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = state.workSummary,
                    onValueChange = viewModel::updateWorkSummary,
                    label = { Text("Crew progress, torque & earthing summary") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = { showCamera = true },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Capture Photo")
                    }
                    Button(
                        onClick = { viewModel.submitDailySiteLogOffline(organizationId, deviceId) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Queue Site Log")
                    }
                }
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
