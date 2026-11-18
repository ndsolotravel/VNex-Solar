import { createHash, randomUUID } from 'node:crypto';
import {
  evaluateCommissioningReadiness,
  type AssetRegisterRecord,
  type CommissioningApprovalRecord,
  type CommissioningRecordDetail,
  type CommissioningTestRecord,
  type HandoverDocumentRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';
import type { InMemoryInstallationService } from './installation-service.ts';
import type { InMemoryInventoryService } from './inventory-service.ts';
import type { InMemorySafetyService } from './safety-service.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function addMonthsIsoDate(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export class InMemoryCommissioningService {
  private readonly records = new Map<string, CommissioningRecordDetail>();
  private readonly assets = new Map<string, AssetRegisterRecord>();

  constructor(
    private readonly customersSurveys: InMemoryCustomersSurveysService,
    private readonly installationService: InMemoryInstallationService,
    private readonly safetyService: InMemorySafetyService,
    private readonly inventoryService: InMemoryInventoryService,
  ) {}

  private refreshSafetySnapshot(record: CommissioningRecordDetail): CommissioningRecordDetail {
    const safetyCleared = this.safetyService.isJobClearedForCommissioning(
      record.organizationId,
      record.installationJobId,
    );
    record.safetyClearedSnapshot = safetyCleared;
    if (record.status === 'pending_safety' && safetyCleared) {
      record.status = 'ready_for_review';
    } else if (record.status === 'ready_for_review' && !safetyCleared) {
      record.status = 'pending_safety';
    }
    return record;
  }

  listRecords(claims: AccessTokenClaims, projectId?: string): CommissioningRecordDetail[] {
    return [...this.records.values()]
      .filter((r) => r.organizationId === claims.orgId)
      .filter((r) => !projectId || r.projectId === projectId)
      .map((r) => this.refreshSafetySnapshot(r))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getRecord(claims: AccessTokenClaims, id: string): CommissioningRecordDetail {
    const rec = this.records.get(id);
    if (!rec || rec.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Commissioning record not found in active organization', 'NOT_FOUND');
    }
    return this.refreshSafetySnapshot(rec);
  }

  listAssets(claims: AccessTokenClaims, projectId?: string): AssetRegisterRecord[] {
    return [...this.assets.values()]
      .filter((a) => a.organizationId === claims.orgId)
      .filter((a) => !projectId || a.projectId === projectId)
      .sort((a, b) => b.installedOn.localeCompare(a.installedOn));
  }

  getAsset(claims: AccessTokenClaims, assetId: string): AssetRegisterRecord {
    const asset = this.assets.get(assetId);
    if (!asset || asset.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Asset not found in active organization', 'NOT_FOUND');
    }
    return asset;
  }

  findAssetByQrToken(claims: AccessTokenClaims, qrToken: string): AssetRegisterRecord {
    const normalized = qrToken.trim().toUpperCase();
    const asset = [...this.assets.values()].find(
      (a) => a.organizationId === claims.orgId && a.qrCodeToken.toUpperCase() === normalized,
    );
    if (!asset) {
      throw new AuthServiceError(404, `QR asset ${qrToken} not found in active organization`, 'NOT_FOUND');
    }
    return asset;
  }

  updateAssetReplacementSerial(
    claims: AccessTokenClaims,
    assetId: string,
    replacementSerialNumber: string,
  ): AssetRegisterRecord {
    const asset = this.getAsset(claims, assetId);
    asset.serialNumber = replacementSerialNumber.trim();
    asset.externalDeviceId = `DEV-${asset.serialNumber}`;
    return asset;
  }

  createRecord(
    claims: AccessTokenClaims,
    input: { projectId: string; installationJobId: string },
  ): CommissioningRecordDetail {
    const project = this.customersSurveys.getProject(claims, input.projectId);
    const job = this.installationService.getJob(claims, input.installationJobId);
    if (job.projectId !== project.id) {
      throw new AuthServiceError(
        400,
        'Installation job does not belong to the specified project',
        'PROJECT_JOB_MISMATCH',
      );
    }

    const safetyCleared = this.safetyService.isJobClearedForCommissioning(claims.orgId, job.id);
    const orgCount = [...this.records.values()].filter((r) => r.organizationId === claims.orgId).length;
    const now = new Date().toISOString();

    const record: CommissioningRecordDetail = {
      id: randomUUID(),
      organizationId: claims.orgId,
      projectId: project.id,
      installationJobId: job.id,
      certificateCode: `CERT-${String(orgCount + 1).padStart(4, '0')}`,
      status: safetyCleared ? 'ready_for_review' : 'pending_safety',
      safetyClearedSnapshot: safetyCleared,
      commissionedAt: null,
      tests: [],
      approvals: [],
      handoverDocuments: [],
      generatedAssets: [],
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.id, record);
    this.customersSurveys.advanceProjectStage(claims, project.id, 'commissioning_pending');
    return record;
  }

  addCommissioningTest(
    claims: AccessTokenClaims,
    commissioningId: string,
    input: { testName: string; measuredValue: string; passed: boolean },
  ): { record: CommissioningRecordDetail; test: CommissioningTestRecord } {
    const rec = this.getRecord(claims, commissioningId);
    if (rec.status === 'approved') {
      throw new AuthServiceError(
        409,
        'Commissioning record is already approved and immutable',
        'COMMISSIONING_IMMUTABLE',
      );
    }
    const now = new Date().toISOString();
    const testItem: CommissioningTestRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      commissioningRecordId: rec.id,
      testName: input.testName.trim(),
      measuredValue: input.measuredValue.trim(),
      passed: Boolean(input.passed),
      testedByUserId: claims.sub,
      testedAt: now,
    };
    rec.tests.push(testItem);
    rec.rowVersion += 1;
    rec.updatedAt = now;
    return { record: rec, test: testItem };
  }

  approveOrReject(
    claims: AccessTokenClaims,
    commissioningId: string,
    decision: 'approved' | 'rejected',
    notes: string,
    telemetryProvider?: string | null,
  ): CommissioningRecordDetail {
    const rec = this.getRecord(claims, commissioningId);
    if (rec.status === 'approved') {
      throw new AuthServiceError(
        409,
        'Approved commissioning certificate is immutable and cannot be modified',
        'COMMISSIONING_IMMUTABLE',
      );
    }

    const job = this.installationService.getJob(claims, rec.installationJobId);
    const project = this.customersSurveys.getProject(claims, rec.projectId);
    const safetyCleared = this.safetyService.isJobClearedForCommissioning(claims.orgId, job.id);

    if (decision === 'approved') {
      if (!safetyCleared) {
        throw new AuthServiceError(
          422,
          'Commissioning blocked: safety gate not cleared (approved Risk Assessment & passed IEC 62446-1 inspection required)',
          'SAFETY_GATE_BLOCKED',
        );
      }
      if (job.status !== 'completed') {
        throw new AuthServiceError(
          409,
          `Installation job ${job.jobCode} must be completed before commissioning approval`,
          'INSTALLATION_NOT_COMPLETED',
        );
      }
      const readiness = evaluateCommissioningReadiness(safetyCleared, true, rec.tests);
      if (!readiness.ready) {
        throw new AuthServiceError(422, readiness.blockers.join('; '), 'COMMISSIONING_CHECKS_UNMET');
      }
    }

    const now = new Date().toISOString();
    const installedDate = now.slice(0, 10);

    const approval: CommissioningApprovalRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      commissioningRecordId: rec.id,
      approverUserId: claims.sub,
      approverRole: claims.role,
      decision,
      notes: notes.trim(),
      decidedAt: now,
    };
    rec.approvals.push(approval);

    if (decision === 'rejected') {
      rec.status = 'rejected';
      rec.rowVersion += 1;
      rec.updatedAt = now;
      return rec;
    }

    // Generate QR Asset Register entries for serialized installed equipment on this project
    const catalog = this.inventoryService.listCatalog(claims);
    const installedSerials = this.inventoryService.listSerials(claims, {
      projectId: project.id,
      status: 'installed',
    });

    const createdAssets: AssetRegisterRecord[] = [];
    if (installedSerials.length > 0) {
      for (const sn of installedSerials) {
        const cat = catalog.find((c) => c.id === sn.equipmentCatalogId);
        const warrantyMonths = cat?.warrantyMonths ?? 60;
        const token = `VNEX-QR-${rec.certificateCode}-${sn.serialNumber}`.toUpperCase();
        const asset: AssetRegisterRecord = {
          id: randomUUID(),
          organizationId: claims.orgId,
          projectId: project.id,
          siteId: project.siteId,
          equipmentCatalogId: sn.equipmentCatalogId,
          sku: cat?.sku ?? 'SOLAR-EQUIP',
          modelName: cat?.modelName ?? 'PV Equipment Unit',
          serialNumber: sn.serialNumber,
          qrCodeToken: token,
          installedOn: installedDate,
          warrantyExpiresOn: addMonthsIsoDate(installedDate, warrantyMonths),
          telemetryProvider: telemetryProvider?.trim() || 'Solarman / Modbus TCP',
          externalDeviceId: `DEV-${sn.serialNumber}`,
        };
        this.assets.set(asset.id, asset);
        createdAssets.push(asset);
      }
    } else {
      // Register default commissioned system asset linked to tenant primary inverter/PV SKU
      const fallbackCat = catalog.find((c) => c.category === 'inverter') ?? catalog[0];
      if (fallbackCat) {
        const serial = `SYS-${rec.certificateCode}`;
        const asset: AssetRegisterRecord = {
          id: randomUUID(),
          organizationId: claims.orgId,
          projectId: project.id,
          siteId: project.siteId,
          equipmentCatalogId: fallbackCat.id,
          sku: fallbackCat.sku,
          modelName: fallbackCat.modelName,
          serialNumber: serial,
          qrCodeToken: `VNEX-QR-${serial}`,
          installedOn: installedDate,
          warrantyExpiresOn: addMonthsIsoDate(installedDate, fallbackCat.warrantyMonths),
          telemetryProvider: telemetryProvider?.trim() || 'Solarman / Modbus TCP',
          externalDeviceId: `DEV-${serial}`,
        };
        this.assets.set(asset.id, asset);
        createdAssets.push(asset);
      }
    }

    const digest = createHash('sha256')
      .update(`${rec.id}:${rec.certificateCode}:${now}:${createdAssets.map((a) => a.qrCodeToken).join(',')}`)
      .digest('hex');

    const handover: HandoverDocumentRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      commissioningRecordId: rec.id,
      documentTitle: `${project.title} — Commissioning Certificate & Handover Pack`,
      certificateNumber: rec.certificateCode,
      fileAttachmentId: randomUUID(),
      sha256Digest: digest,
      customerAcknowledgedAt: null,
      customerSignoffName: null,
      createdAt: now,
    };

    rec.status = 'approved';
    rec.commissionedAt = now;
    rec.generatedAssets = createdAssets;
    rec.handoverDocuments.push(handover);
    rec.rowVersion += 1;
    rec.updatedAt = now;

    this.customersSurveys.advanceProjectStage(claims, project.id, 'commissioned');
    return rec;
  }

  acknowledgeHandover(
    claims: AccessTokenClaims,
    commissioningId: string,
    handoverId: string,
    signoffName: string,
  ): CommissioningRecordDetail {
    const rec = this.getRecord(claims, commissioningId);
    if (rec.status !== 'approved') {
      throw new AuthServiceError(
        409,
        'Commissioning certificate must be approved before customer handover acknowledgement',
        'NOT_APPROVED',
      );
    }
    const doc = rec.handoverDocuments.find((h) => h.id === handoverId);
    if (!doc) {
      throw new AuthServiceError(404, 'Handover document not found', 'NOT_FOUND');
    }
    const now = new Date().toISOString();
    doc.customerAcknowledgedAt = now;
    doc.customerSignoffName = signoffName.trim();
    rec.rowVersion += 1;
    rec.updatedAt = now;

    this.customersSurveys.advanceProjectStage(claims, rec.projectId, 'handed_over');
    return rec;
  }

  renderPrintableCertificateHtml(
    claims: AccessTokenClaims,
    commissioningId: string,
    organizationName: string,
  ): { certificateCode: string; html: string } {
    const rec = this.getRecord(claims, commissioningId);
    const project = this.customersSurveys.getProject(claims, rec.projectId);
    const safeOrg = escapeHtml(organizationName);
    const safeTitle = escapeHtml(project.title);
    const safeCode = escapeHtml(rec.certificateCode);

    const testRows = rec.tests
      .map(
        (t) => `
        <tr>
          <td>${escapeHtml(t.testName)}</td>
          <td><code>${escapeHtml(t.measuredValue)}</code></td>
          <td>${t.passed ? 'PASS' : 'FAIL'}</td>
        </tr>`,
      )
      .join('');

    const assetRows = rec.generatedAssets
      .map(
        (a) => `
        <tr>
          <td><code>${escapeHtml(a.qrCodeToken)}</code></td>
          <td>${escapeHtml(a.sku)} — ${escapeHtml(a.modelName)}</td>
          <td><code>${escapeHtml(a.serialNumber)}</code></td>
          <td>${escapeHtml(a.warrantyExpiresOn ?? 'n/a')}</td>
        </tr>`,
      )
      .join('');

    const handover = rec.handoverDocuments[0];
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Commissioning Certificate ${safeCode}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; padding: 32px; max-width: 820px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .box { border: 1px solid #cbd5e1; padding: 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>${safeOrg} — Solar PV Commissioning Certificate (${safeCode})</h1>
  <div class="meta">Project: ${safeTitle} · Status: ${escapeHtml(rec.status.toUpperCase())} · Commissioned: ${escapeHtml(rec.commissionedAt ?? 'Pending')}</div>
  <div class="box">
    <strong>Safety &amp; Regulatory Sign-Off Gate:</strong>
    ${rec.safetyClearedSnapshot ? 'CLEARED (Risk Assessment &amp; IEC 62446-1 Inspection Verified)' : 'PENDING'}
    <br/>
    <strong>Certificate SHA-256 Digest:</strong> <code>${escapeHtml(handover?.sha256Digest ?? 'Pending approval')}</code>
  </div>
  <h3>Commissioning Test Suite</h3>
  <table>
    <thead><tr><th>Verification Test</th><th>Measured Result</th><th>Outcome</th></tr></thead>
    <tbody>${testRows || '<tr><td colspan="3">No commissioning tests logged yet</td></tr>'}</tbody>
  </table>
  <h3>Registered QR Assets &amp; Warranty Dates</h3>
  <table>
    <thead><tr><th>QR Token</th><th>Equipment</th><th>Serial No.</th><th>Warranty Until</th></tr></thead>
    <tbody>${assetRows || '<tr><td colspan="4">Generated upon engineer approval</td></tr>'}</tbody>
  </table>
  <div class="box">
    <strong>Customer Handover Acknowledgement:</strong>
    ${handover?.customerSignoffName ? `${escapeHtml(handover.customerSignoffName)} (${escapeHtml(handover.customerAcknowledgedAt ?? '')})` : 'Awaiting customer sign-off'}
  </div>
</body>
</html>`;

    return { certificateCode: rec.certificateCode, html };
  }
}
