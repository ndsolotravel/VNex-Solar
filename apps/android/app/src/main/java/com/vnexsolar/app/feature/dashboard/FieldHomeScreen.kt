package com.vnexsolar.app.feature.dashboard

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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.navigation.VNexRoute

@Composable
fun FieldHomeScreen(
    onNavigate: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Field Operations Workspace",
            style = MaterialTheme.typography.headlineMedium,
        )

        VNexOfflineStatusBanner(
            isOnline = true,
            pendingOutboxCount = 0,
        )

        VNexSurfaceCard {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Local Storage & Sync Readiness",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                VNexMetricRow(label = "Local source of truth", value = "Room SQLite (Phase 4)")
                VNexMetricRow(label = "Background worker", value = "WorkManager")
                VNexMetricRow(label = "Credential vault", value = "Android Keystore AES-256")
                VNexMetricRow(label = "Media capture", value = "CameraX", showDivider = false)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Button(
                onClick = { onNavigate(VNexRoute.Surveys.route) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Site Surveys")
            }
            OutlinedButton(
                onClick = { onNavigate(VNexRoute.SyncQueue.route) },
                modifier = Modifier.weight(1f),
            ) {
                Text("Sync Queue")
            }
        }
    }
}
