package com.vnexsolar.app.feature.sync

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import java.util.Locale

@Composable
fun SyncQueueScreen(
    canResolveConflicts: Boolean = true,
    viewModel: SyncQueueViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()
    val outboxItems by viewModel.outboxItems.collectAsState()
    val conflicts by viewModel.pendingConflicts.collectAsState()
    val mediaQueue by viewModel.mediaQueue.collectAsState()
    val checkpoint by viewModel.checkpoint.collectAsState()

    val pendingOutboxCount = outboxItems.count { it.status in setOf("PENDING", "IN_FLIGHT", "FAILED_RETRYABLE") }
    val pendingMediaCount = mediaQueue.count { it.status != "VERIFIED" }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Offline Sync Queue", style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = "Last sync: ${SyncQueueViewModel.formatEpochTimestamp(checkpoint?.lastSyncCompletedAtEpochMs)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = { viewModel.syncNow() },
                enabled = !state.isSyncing,
            ) {
                Text(if (state.isSyncing) "Syncing..." else "Sync Now")
            }
        }

        VNexOfflineStatusBanner(
            isOnline = isOnline,
            pendingOutboxCount = pendingOutboxCount,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )

        ScrollableTabRow(selectedTabIndex = state.activeTab.ordinal, edgePadding = 12.dp) {
            SyncTab.entries.forEach { tab ->
                val badge = when (tab) {
                    SyncTab.OUTBOX -> " (${outboxItems.size})"
                    SyncTab.CONFLICTS -> " (${conflicts.size})"
                    SyncTab.MEDIA_METRICS -> " ($pendingMediaCount)"
                }
                Tab(
                    selected = state.activeTab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = { Text("${tab.label}$badge", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
        }

        state.statusMessage?.let { msg ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(msg, modifier = Modifier.padding(12.dp), color = VNexColors.NominalGreen, style = MaterialTheme.typography.bodyMedium)
            }
        }
        state.errorMessage?.let { err ->
            VNexSurfaceCard(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                Text(err, modifier = Modifier.padding(12.dp), color = VNexColors.WarningAmber, style = MaterialTheme.typography.bodyMedium)
            }
        }

        when (state.activeTab) {
            SyncTab.OUTBOX -> {
                val filteredOutbox = if (state.statusFilter.statuses == null) {
                    outboxItems
                } else {
                    outboxItems.filter { it.status in state.statusFilter.statuses!! }
                }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    item {
                        VNexSurfaceCard {
                            Column(modifier = Modifier.padding(14.dp)) {
                                VNexMetricRow("Server Delta Checkpoint", "Seq #${checkpoint?.lastServerSeq ?: 0L}")
                                VNexMetricRow("Pending / Retryable Ops", "$pendingOutboxCount")
                                VNexMetricRow("Pending Conflicts", "${conflicts.size}")
                                VNexMetricRow("WorkManager Schedule", "15m Periodic + On Reconnect", showDivider = false)
                            }
                        }
                    }

                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                OutboxStatusFilter.entries.forEach { filter ->
                                    FilterChip(
                                        selected = state.statusFilter == filter,
                                        onClick = { viewModel.selectFilter(filter) },
                                        label = { Text(filter.label) },
                                    )
                                }
                            }
                            if (outboxItems.any { it.status == "APPLIED" }) {
                                OutlinedButton(onClick = { viewModel.clearAppliedHistory() }) {
                                    Text("Clear Applied")
                                }
                            }
                        }
                    }

                    if (filteredOutbox.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "No queued mutations matching this filter.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        items(filteredOutbox, key = { it.syncOperationId }) { op ->
                            val statusColor = when (op.status) {
                                "APPLIED" -> VNexColors.NominalGreen
                                "CONFLICT", "REJECTED" -> VNexColors.CriticalRed
                                "FAILED_RETRYABLE" -> VNexColors.WarningAmber
                                else -> MaterialTheme.colorScheme.primary
                            }
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("${op.entityType} · ${op.operationType.uppercase(Locale.US)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                        Text(op.status, style = MaterialTheme.typography.labelMedium, color = statusColor)
                                    }
                                    Text("ID: ${op.entityId.take(12)} · Base v${op.baseRowVersion} · Retries: ${op.retryCount}", style = MaterialTheme.typography.bodyMedium)
                                    Text("Key: ${op.idempotencyKey.take(32)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    op.lastError?.let { err ->
                                        Text(err, style = MaterialTheme.typography.bodyMedium, color = VNexColors.WarningAmber)
                                    }
                                    if (op.status == "FAILED_RETRYABLE") {
                                        OutlinedButton(onClick = { viewModel.retryOperationNow(op.syncOperationId) }) {
                                            Text("Retry Now")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            SyncTab.CONFLICTS -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (conflicts.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "No version conflicts detected. Optimistic rowVersion checks are clean.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        items(conflicts, key = { it.conflictId }) { conflict ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text("${conflict.entityType} · ${conflict.entityId.take(12)}", style = MaterialTheme.typography.titleMedium, color = VNexColors.CriticalRed)
                                    Text("Local Offline Payload:", style = MaterialTheme.typography.labelMedium)
                                    Text(conflict.clientPayloadJson.take(260), style = MaterialTheme.typography.bodyMedium)
                                    HorizontalDivider()
                                    Text("Server Authoritative Snapshot:", style = MaterialTheme.typography.labelMedium)
                                    Text(conflict.serverSnapshotJson.take(260), style = MaterialTheme.typography.bodyMedium)

                                    if (canResolveConflicts) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            OutlinedButton(
                                                onClick = { viewModel.resolveConflict(conflict, acceptClientMerge = false) },
                                                enabled = !state.isSyncing,
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Keep Server") }
                                            Button(
                                                onClick = { viewModel.resolveConflict(conflict, acceptClientMerge = true) },
                                                enabled = !state.isSyncing,
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Merge Client") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            SyncTab.MEDIA_METRICS -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    state.serverMetrics?.let { m ->
                        item {
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text("Tenant Sync Health Metrics", style = MaterialTheme.typography.titleMedium)
                                    VNexMetricRow("Applied / Deduplicated Ops", "${m.appliedOpsCount} / ${m.deduplicatedOpsCount}")
                                    VNexMetricRow("Rejected / Dead Letters", "${m.rejectedOpsCount} / ${m.pendingDeadLettersCount}")
                                    VNexMetricRow("Active Syncing Devices", "${m.activeDevicesCount}")
                                    VNexMetricRow("Latest Server Sequence", "#${m.latestServerSeq}", showDivider = false)
                                }
                            }
                        }
                    }

                    item {
                        Text("Media Upload Queue (${mediaQueue.size})", style = MaterialTheme.typography.titleMedium)
                    }
                    if (mediaQueue.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text("No field photos queued for SHA-256 upload verification.", modifier = Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    } else {
                        items(mediaQueue, key = { it.mediaId }) { item ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text("${item.entityType} · ${item.byteSize} B", style = MaterialTheme.typography.labelMedium)
                                        Text(item.status, style = MaterialTheme.typography.labelMedium, color = if (item.status == "VERIFIED") VNexColors.NominalGreen else VNexColors.WarningAmber)
                                    }
                                    Text(item.localFilePath.substringAfterLast('/'), style = MaterialTheme.typography.bodyMedium)
                                    Text("SHA-256: ${item.sha256Checksum.take(16)}...", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    item.lastError?.let { err ->
                                        Text(err, style = MaterialTheme.typography.bodyMedium, color = VNexColors.WarningAmber)
                                    }
                                }
                            }
                        }
                    }

                    if (state.deadLetters.isNotEmpty()) {
                        item {
                            Text("Server Dead Letters (${state.deadLetters.size})", style = MaterialTheme.typography.titleMedium)
                        }
                        items(state.deadLetters, key = { it.id }) { dl ->
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text("${dl.entityType} (${dl.operationType})", style = MaterialTheme.typography.titleMedium, color = VNexColors.CriticalRed)
                                    Text(dl.reason, style = MaterialTheme.typography.bodyMedium)
                                    if (canResolveConflicts) {
                                        OutlinedButton(onClick = { viewModel.acknowledgeDeadLetter(dl.id) }) {
                                            Text("Acknowledge")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
