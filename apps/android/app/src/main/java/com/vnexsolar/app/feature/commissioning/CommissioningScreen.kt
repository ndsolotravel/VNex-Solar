package com.vnexsolar.app.feature.commissioning

import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.media.CustomerSignatureDialog
import java.util.Locale

@Composable
fun CommissioningScreen(
    canApproveCommissioning: Boolean,
    canManageInstallation: Boolean,
    viewModel: CommissioningViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()
    val isOnline by viewModel.isOnline.collectAsState()

    var selectedProjectId by remember { mutableStateOf("") }
    var selectedJobId by remember { mutableStateOf("") }
    var customTestName by remember { mutableStateOf("Earth Loop Impedance (Ze)") }
    var customMeasuredValue by remember { mutableStateOf("0.42 Ohm") }
    var customTestPassed by remember { mutableStateOf(true) }
    var approvalNotes by remember { mutableStateOf("Verified IEC 62446-1 suite, anti-islanding & safety clearance") }
    var telemetryProvider by remember { mutableStateOf("Solarman / Modbus TCP") }
    var showSignaturePadForHandoverId by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Commissioning & Handover", style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = if (isOnline) "Online — Certificates, QR Assets & Signature Handover" else "Offline — Reconnect to submit commissioning sign-offs",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = { viewModel.refresh() }, enabled = !state.isLoading) {
                Text(if (state.isLoading) "Syncing" else "Refresh")
            }
        }

        ScrollableTabRow(selectedTabIndex = state.activeTab.ordinal, edgePadding = 12.dp) {
            CommissioningTab.entries.forEach { tab ->
                val countBadge = when (tab) {
                    CommissioningTab.CERTIFICATES -> " (${state.records.size})"
                    CommissioningTab.TESTS_SIGNOFF -> ""
                    CommissioningTab.QR_ASSETS -> " (${state.assets.size})"
                }
                Tab(
                    selected = state.activeTab == tab,
                    onClick = { viewModel.selectTab(tab) },
                    text = { Text("${tab.label}$countBadge", maxLines = 1, overflow = TextOverflow.Ellipsis) },
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
            CommissioningTab.CERTIFICATES -> {
                val activeProjId = selectedProjectId.ifBlank { state.projects.firstOrNull()?.id.orEmpty() }
                val activeJobId = selectedJobId.ifBlank { state.installationJobs.firstOrNull()?.id.orEmpty() }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (canManageInstallation) {
                        item {
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text("Start Commissioning Certificate", style = MaterialTheme.typography.titleMedium)
                                    Text("Project", style = MaterialTheme.typography.labelMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        state.projects.forEach { p ->
                                            FilterChip(
                                                selected = activeProjId == p.id,
                                                onClick = { selectedProjectId = p.id },
                                                label = { Text("${p.projectCode}: ${p.title.take(18)}") },
                                            )
                                        }
                                    }

                                    Text("Installation Job", style = MaterialTheme.typography.labelMedium)
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState()),
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        state.installationJobs.forEach { j ->
                                            FilterChip(
                                                selected = activeJobId == j.id,
                                                onClick = { selectedJobId = j.id },
                                                label = { Text("${j.jobCode} (${j.status})") },
                                            )
                                        }
                                    }

                                    Button(
                                        onClick = { viewModel.createCommissioningRecord(activeProjId, activeJobId) },
                                        enabled = !state.isSubmitting && activeProjId.isNotBlank() && activeJobId.isNotBlank(),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        Text("Create Commissioning Certificate")
                                    }
                                }
                            }
                        }
                    }

                    if (state.records.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "No commissioning records found yet. Create one after an installation job is scheduled or completed.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        items(state.records, key = { it.id }) { rec ->
                            val projectTitle = state.projects.firstOrNull { it.id == rec.projectId }?.title ?: rec.projectId.take(8)
                            val statusColor = when (rec.status) {
                                "approved" -> VNexColors.NominalGreen
                                "rejected" -> VNexColors.CriticalRed
                                else -> VNexColors.WarningAmber
                            }
                            VNexSurfaceCard {
                                Column(
                                    modifier = Modifier.padding(14.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(rec.certificateCode, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                                        Text(rec.status.uppercase(Locale.US), style = MaterialTheme.typography.labelMedium, color = statusColor)
                                    }
                                    Text(projectTitle, style = MaterialTheme.typography.bodyMedium)
                                    VNexMetricRow("Safety Gate Snapshot", if (rec.safetyClearedSnapshot) "CLEARED" else "PENDING")
                                    VNexMetricRow("Tests / QR Assets", "${rec.tests.size} test(s) · ${rec.generatedAssets.size} asset(s)", showDivider = false)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        Button(
                                            onClick = {
                                                viewModel.selectRecord(rec.id)
                                                viewModel.selectTab(CommissioningTab.TESTS_SIGNOFF)
                                            },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Text("Open Workflow")
                                        }
                                        OutlinedButton(
                                            onClick = { viewModel.generatePdfPreview(rec) },
                                            modifier = Modifier.weight(1f),
                                        ) {
                                            Text("PDF Certificate")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            CommissioningTab.TESTS_SIGNOFF -> {
                val activeRecord = state.selectedRecord
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (activeRecord == null) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "Select or create a commissioning certificate in the Certificates tab first.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        item {
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text("${activeRecord.certificateCode} · ${activeRecord.status.uppercase(Locale.US)}", style = MaterialTheme.typography.titleMedium)
                                    VNexMetricRow("Safety & LOTO Gate", if (activeRecord.safetyClearedSnapshot) "CLEARED" else "BLOCKED (Requires Inspection)")
                                    VNexMetricRow("Recorded Tests", "${activeRecord.tests.size} (${activeRecord.tests.count { it.passed }} PASS)")
                                    VNexMetricRow("QR Assets Registered", "${activeRecord.generatedAssets.size}", showDivider = false)
                                }
                            }
                        }

                        if (activeRecord.status != "approved" && canManageInstallation) {
                            item {
                                VNexSurfaceCard {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("IEC 62446-1 Verification Tests", style = MaterialTheme.typography.titleMedium)
                                        OutlinedButton(
                                            onClick = { viewModel.recordStandardIecTests(activeRecord.id) },
                                            enabled = !state.isSubmitting,
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text("Run Standard 4-Test IEC Suite")
                                        }
                                        OutlinedTextField(
                                            value = customTestName,
                                            onValueChange = { customTestName = it },
                                            label = { Text("Verification Test Name") },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        OutlinedTextField(
                                            value = customMeasuredValue,
                                            onValueChange = { customMeasuredValue = it },
                                            label = { Text("Measured Value & Tolerance") },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Checkbox(checked = customTestPassed, onCheckedChange = { customTestPassed = it })
                                            Text("Test reading passes acceptance criteria", style = MaterialTheme.typography.bodyMedium)
                                        }
                                        Button(
                                            onClick = {
                                                viewModel.addCommissioningTest(
                                                    commissioningId = activeRecord.id,
                                                    testName = customTestName,
                                                    measuredValue = customMeasuredValue,
                                                    passed = customTestPassed,
                                                )
                                            },
                                            enabled = !state.isSubmitting,
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text("Record Test Reading")
                                        }
                                    }
                                }
                            }
                        }

                        items(activeRecord.tests, key = { it.id }) { testItem ->
                            VNexSurfaceCard {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(testItem.testName, style = MaterialTheme.typography.titleSmall)
                                        Text(testItem.measuredValue, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text(
                                        text = if (testItem.passed) "PASS" else "FAIL",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = if (testItem.passed) VNexColors.NominalGreen else VNexColors.CriticalRed,
                                    )
                                }
                            }
                        }

                        if (activeRecord.status != "approved" && canApproveCommissioning) {
                            item {
                                VNexSurfaceCard {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Commissioning Engineer Sign-Off", style = MaterialTheme.typography.titleMedium)
                                        OutlinedTextField(
                                            value = telemetryProvider,
                                            onValueChange = { telemetryProvider = it },
                                            label = { Text("Inverter Telemetry Provider") },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        OutlinedTextField(
                                            value = approvalNotes,
                                            onValueChange = { approvalNotes = it },
                                            label = { Text("Approval / Rejection Notes") },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            OutlinedButton(
                                                onClick = {
                                                    viewModel.approveOrRejectCommissioning(
                                                        commissioningId = activeRecord.id,
                                                        approve = false,
                                                        notes = approvalNotes,
                                                        telemetryProvider = telemetryProvider,
                                                    )
                                                },
                                                enabled = !state.isSubmitting,
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Reject") }
                                            Button(
                                                onClick = {
                                                    viewModel.approveOrRejectCommissioning(
                                                        commissioningId = activeRecord.id,
                                                        approve = true,
                                                        notes = approvalNotes,
                                                        telemetryProvider = telemetryProvider,
                                                    )
                                                },
                                                enabled = !state.isSubmitting,
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Approve & Register QR") }
                                        }
                                    }
                                }
                            }
                        }

                        if (activeRecord.status == "approved") {
                            item {
                                VNexSurfaceCard {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("Customer Handover & Canvas Signature", style = MaterialTheme.typography.titleMedium)
                                        val handover = activeRecord.handoverDocuments.firstOrNull()
                                        if (handover != null) {
                                            VNexMetricRow("Document", handover.documentTitle)
                                            VNexMetricRow("SHA-256 Digest", handover.sha256Digest.take(24) + "...")
                                            VNexMetricRow(
                                                label = "Customer Sign-Off",
                                                value = handover.customerSignoffName ?: "Awaiting canvas signature",
                                                showDivider = false,
                                            )
                                            Button(
                                                onClick = { showSignaturePadForHandoverId = handover.id },
                                                enabled = !state.isSubmitting,
                                                modifier = Modifier.fillMaxWidth(),
                                            ) {
                                                Text(
                                                    if (handover.customerSignoffName != null) "Re-Capture Canvas Signature" else "Capture Customer Canvas Signature",
                                                )
                                            }
                                        }

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            OutlinedButton(
                                                onClick = { viewModel.generatePdfPreview(activeRecord) },
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Preview PDF") }
                                            OutlinedButton(
                                                onClick = { viewModel.printPdf(context, activeRecord) },
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Print") }
                                            Button(
                                                onClick = { viewModel.exportAndSharePdf(activeRecord) },
                                                modifier = Modifier.weight(1f),
                                            ) { Text("Share PDF") }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            CommissioningTab.QR_ASSETS -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (state.assets.isEmpty()) {
                        item {
                            VNexSurfaceCard {
                                Text(
                                    text = "No commissioned QR assets registered yet. Approve a commissioning certificate to mint QR tokens.",
                                    modifier = Modifier.padding(14.dp),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    } else {
                        items(state.assets, key = { it.id }) { asset ->
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(asset.qrCodeToken, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                                    Text("${asset.sku} · ${asset.modelName}", style = MaterialTheme.typography.bodyMedium)
                                    VNexMetricRow("Serial Number", asset.serialNumber)
                                    VNexMetricRow("Telemetry Device", "${asset.telemetryProvider ?: "Local"} (${asset.externalDeviceId ?: "n/a"})")
                                    VNexMetricRow("Warranty Expires", asset.warrantyExpiresOn ?: "n/a", showDivider = false)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val activeRecordForSig = state.selectedRecord
    if (showSignaturePadForHandoverId != null && activeRecordForSig != null) {
        CustomerSignatureDialog(
            certificateCode = activeRecordForSig.certificateCode,
            onSignatureConfirmed = { name, pngBytes, filePath, sha256 ->
                val handoverId = showSignaturePadForHandoverId!!
                showSignaturePadForHandoverId = null
                viewModel.acknowledgeHandoverWithCanvasSignature(
                    commissioningId = activeRecordForSig.id,
                    handoverId = handoverId,
                    signoffName = name,
                    signaturePngBytes = pngBytes,
                    signatureFilePath = filePath,
                    signatureSha256 = sha256,
                )
            },
            onDismiss = { showSignaturePadForHandoverId = null },
        )
    }

    val bmp = state.previewBitmap
    val activePreviewRec = state.selectedRecord
    if (bmp != null && activePreviewRec != null) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissPreview() },
            title = { Text("Certificate PDF Preview (${activePreviewRec.certificateCode})") },
            text = {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "Commissioning Certificate Preview",
                    contentScale = ContentScale.FillWidth,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(380.dp),
                )
            },
            confirmButton = {
                Button(onClick = { viewModel.exportAndSharePdf(activePreviewRec) }) {
                    Text("Share PDF")
                }
            },
            dismissButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { viewModel.printPdf(context, activePreviewRec) }) {
                        Text("Print")
                    }
                    TextButton(onClick = { viewModel.dismissPreview() }) {
                        Text("Close")
                    }
                }
            },
        )
    }
}
