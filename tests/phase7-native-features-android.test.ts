import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApiV1Router } from '../server/api-v1.ts';

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 500 }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}/api/v1` };
}

test('Phase 7 Android: Native CameraX, ML Kit Scanner, Canvas Signature Pad, Commissioning PDF & NavGraph Completion', () => {
  const androidRoot = path.resolve(
    process.cwd(),
    'apps/android/app/src/main/java/com/vnexsolar/app',
  );

  const cameraSrc = fs.readFileSync(path.join(androidRoot, 'core/media/NativeCameraCapture.kt'), 'utf8');
  const scannerSrc = fs.readFileSync(path.join(androidRoot, 'core/media/QrBarcodeScannerDialog.kt'), 'utf8');
  const sigSrc = fs.readFileSync(path.join(androidRoot, 'core/media/SignaturePadDialog.kt'), 'utf8');
  const commVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/commissioning/CommissioningViewModel.kt'), 'utf8');
  const commScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/commissioning/CommissioningScreen.kt'), 'utf8');
  const commPdfSrc = fs.readFileSync(path.join(androidRoot, 'feature/commissioning/CommissioningPdfExporter.kt'), 'utf8');
  const maintVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/maintenance/MaintenanceWarrantyViewModel.kt'), 'utf8');
  const maintScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/maintenance/MaintenanceWarrantyScreen.kt'), 'utf8');
  const invScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/inventory/InventoryScreen.kt'), 'utf8');
  const navSrc = fs.readFileSync(path.join(androidRoot, 'core/navigation/VNexNavGraph.kt'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(androidRoot, 'core/network/WorkspaceApiService.kt'), 'utf8');

  // 1. Reusable CameraX capture with flash & JPEG compression
  assert.match(cameraSrc, /ProcessCameraProvider/);
  assert.match(cameraSrc, /ImageCapture/);
  assert.match(cameraSrc, /FLASH_MODE_AUTO/);
  assert.match(cameraSrc, /Manifest\.permission\.CAMERA/);

  // 2. Reusable ML Kit Barcode/QR scanner with CameraX ImageAnalysis
  assert.match(scannerSrc, /BarcodeScanning\.getClient/);
  assert.match(scannerSrc, /InputImage\.fromMediaImage/);
  assert.match(scannerSrc, /ImageAnalysis/);
  assert.match(scannerSrc, /QrBarcodeScannerDialog/);

  // 3. Native Compose Canvas Customer Signature Pad with PNG + SHA-256 checksum
  assert.match(sigSrc, /detectDragGestures/);
  assert.match(sigSrc, /Bitmap\.CompressFormat\.PNG/);
  assert.match(sigSrc, /ChecksumUtil\.sha256Hex/);
  assert.match(sigSrc, /CustomerSignatureDialog/);

  // 4. Full Commissioning workflow + native PDF + FileProvider Sharesheet + PrintManager (zero WebView)
  assert.match(commVmSrc, /recordStandardIecTests/);
  assert.match(commVmSrc, /approveOrRejectCommissioning/);
  assert.match(commVmSrc, /acknowledgeHandoverWithCanvasSignature/);
  assert.match(commVmSrc, /enqueueMediaAttachment/);
  assert.match(commScreenSrc, /CustomerSignatureDialog/);
  assert.match(commScreenSrc, /Approve & Register QR/);
  assert.match(commPdfSrc, /PdfDocument/);
  assert.match(commPdfSrc, /PdfRenderer/);
  assert.match(commPdfSrc, /PrintManager/);
  assert.match(commPdfSrc, /FileProvider\.getUriForFile/);
  assert.equal(commPdfSrc.includes('android.webkit.WebView'), false);

  // 5. ML Kit QR/Barcode integrated into Maintenance & Inventory screens
  assert.match(maintVmSrc, /lookupQrAsset/);
  assert.match(maintScreenSrc, /QrBarcodeScannerDialog/);
  assert.match(maintScreenSrc, /Scan QR \(ML Kit\)/);
  assert.match(invScreenSrc, /QrBarcodeScannerDialog/);

  // 6. All VNexRoutes natively implemented — ModuleFoundationScreen shell removed
  assert.match(navSrc, /CommissioningScreen\(/);
  assert.equal(navSrc.includes('ModuleFoundationScreen'), false);

  // 7. WorkspaceApiService exposes commissioning & asset QR endpoints
  assert.match(apiSrc, /api\/v1\/commissioning/);
  assert.match(apiSrc, /api\/v1\/assets\/qr\/\{qrToken\}/);
  assert.match(apiSrc, /handovers\/\{handoverId\}\/acknowledge/);
});

test('Phase 7 Android E2E Backend Flows: Safety Gate, Commissioning Approval, QR Asset Generation & Handover Sign-Off', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Phase 7 Commissioning Solar Ltd',
        displayName: 'VNex Phase 7 Field',
        slug: `vnex-p7-${Date.now()}`,
        businessAddress: 'DHA Phase 6, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Tariq Mahmood',
        ownerEmail: 'tariq@vnexp7.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const { accessToken } = await regRes.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

    // 1. Customer -> Site -> Project
    const custRes = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customerType: 'commercial', fullName: 'Al-Noor Textiles' }),
    });
    assert.equal(custRes.status, 201);
    const cust = await custRes.json();

    const siteRes = await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ siteName: 'Main Mill Roof', addressLine: 'Plot 12 Sundar', city: 'Lahore' }),
    });
    assert.equal(siteRes.status, 201);
    const site = await siteRes.json();

    const projRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customerId: cust.id, siteId: site.id, title: '50kW Grid-Tied Plant', systemType: 'on_grid' }),
    });
    assert.equal(projRes.status, 201);
    const proj = await projRes.json();

    // 2. Installation Job + Tasks -> completed
    const jobRes = await fetch(`${baseUrl}/installations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: proj.id,
        scheduledStartDate: '2026-11-20',
        taskTitles: ['Mount inverter and AC/DC protection'],
      }),
    });
    assert.equal(jobRes.status, 201);
    const job = await jobRes.json();
    const task = job.tasks[0];
    const tRes = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'completed', baseRowVersion: task.rowVersion }),
    });
    assert.equal(tRes.status, 200);
    const completeRes = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers,
    });
    assert.equal(completeRes.status, 200);

    // 3. Risk Assessment + IEC 62446-1 Inspection -> Clear safety gate
    const ra = await (
      await fetch(`${baseUrl}/safety/risk-assessments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          ppeComplianceVerified: true,
          electricalIsolationVerified: true,
          hazardNotes: 'Roof harness and DC LOTO verified',
        }),
      })
    ).json();
    const raApp = await fetch(`${baseUrl}/safety/risk-assessments/${ra.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notes: 'Risk assessment approved' }),
    });
    assert.equal(raApp.status, 200);

    const insp = await (
      await fetch(`${baseUrl}/safety/inspections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          installationJobId: job.id,
          items: [{ checkCode: 'IEC-01', description: 'Earth continuity check', result: 'pass' }],
          testReadings: [{ parameterName: 'Earth Resistance', measuredValue: 1.2, unit: 'ohm', withinTolerance: true }],
        }),
      })
    ).json();
    const inspApp = await fetch(`${baseUrl}/safety/inspections/${insp.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notes: 'IEC 62446-1 inspection passed' }),
    });
    assert.equal(inspApp.status, 200);

    // 4. Create Commissioning Record -> Log IEC Test -> Approve -> Lookup Minted QR Asset -> Acknowledge Handover
    const comm = await (
      await fetch(`${baseUrl}/commissioning`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId: proj.id, installationJobId: job.id }),
      })
    ).json();
    assert.equal(comm.safetyClearedSnapshot, true);

    const testRes = await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        testName: 'Open Circuit String Voltage (Voc)',
        measuredValue: '642 V DC',
        passed: true,
      }),
    });
    assert.equal(testRes.status, 201);

    // Ensure at least one catalog item exists so QR fallback registers a concrete asset
    await fetch(`${baseUrl}/inventory/catalog`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: 'INV-SUN2000-50KTL',
        category: 'inverter',
        manufacturerName: 'Huawei',
        modelName: 'SUN2000-50KTL-M3',
        unitCostMinor: 95000000,
        unitSellPriceMinor: 112000000,
        warrantyMonths: 60,
      }),
    });

    const approved = await (
      await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: 'Approved on Android commissioning suite', telemetryProvider: 'FusionSolar' }),
      })
    ).json();
    assert.equal(approved.status, 'approved');
    assert.ok(approved.generatedAssets.length >= 1);
    assert.ok(approved.handoverDocuments.length >= 1);

    const qrToken = approved.generatedAssets[0].qrCodeToken;
    const qrRes = await fetch(`${baseUrl}/assets/qr/${encodeURIComponent(qrToken)}`, { headers });
    assert.equal(qrRes.status, 200);
    const qrWorkspace = await qrRes.json();
    assert.equal(qrWorkspace.asset.qrCodeToken, qrToken);
    assert.equal(qrWorkspace.warrantyActive, true);

    const handoverId = approved.handoverDocuments[0].id;
    const ackRes = await fetch(`${baseUrl}/commissioning/${comm.id}/handovers/${handoverId}/acknowledge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ signoffName: 'Kashif Ali (Director)' }),
    });
    assert.equal(ackRes.status, 200);
    const ackBody = await ackRes.json();
    assert.equal(ackBody.handoverDocuments[0].customerSignoffName, 'Kashif Ali (Director)');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
