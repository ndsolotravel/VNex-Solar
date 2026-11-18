import { randomUUID } from 'node:crypto';
import {
  STANDARD_ACCOUNTS,
  calculateQuotationTotals,
  formatCurrency,
  minorToMajor,
  verifyJournalEntryBalanced,
  type CreditNoteRecord,
  type InvoiceItemInput,
  type InvoiceItemRecord,
  type InvoiceRecord,
  type InvoiceType,
  type JournalEntryRecord,
  type JournalLineInput,
  type JournalLineRecord,
  type PaymentAllocationRecord,
  type PaymentMethod,
  type PaymentRecord,
  type QuotationApprovalRecord,
  type QuotationLineItemInput,
  type QuotationRecord,
  type QuotationRevisionRecord,
  type SupportedCurrency,
  type TaxRuleRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';
import type { InMemoryInventoryService } from './inventory-service.ts';
import type { InMemorySolarEngineeringService } from './solar-engineering-service.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class InMemoryQuotationsBillingService {
  private readonly taxRules = new Map<string, TaxRuleRecord>();
  private readonly quotations = new Map<string, QuotationRecord>();
  private readonly revisions = new Map<string, QuotationRevisionRecord[]>();
  private readonly approvals = new Map<string, QuotationApprovalRecord[]>();
  private readonly invoices = new Map<string, InvoiceRecord>();
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly idempotentPayments = new Map<string, PaymentRecord>();
  private readonly creditNotes = new Map<string, CreditNoteRecord>();
  private readonly journals = new Map<string, JournalEntryRecord>();
  private readonly seededOrgs = new Set<string>();

  constructor(
    private readonly customersSurveys: InMemoryCustomersSurveysService,
    private readonly solarEngineering: InMemorySolarEngineeringService,
    private readonly inventory: InMemoryInventoryService,
  ) {}

  private ensureOrgTaxRules(orgId: string) {
    if (this.seededOrgs.has(orgId)) return;
    this.seededOrgs.add(orgId);

    const defaults: Array<Omit<TaxRuleRecord, 'id' | 'organizationId'>> = [
      {
        code: 'SOLAR-EXEMPT-0',
        name: 'Solar PV Equipment Zero-Rated / Exempt (0%)',
        rateBps: 0,
        countryCode: 'PK',
        isActive: true,
      },
      {
        code: 'SVC-GST-18',
        name: 'Installation & Engineering Services GST (18%)',
        rateBps: 1800,
        countryCode: 'PK',
        isActive: true,
      },
    ];

    for (const def of defaults) {
      const id = randomUUID();
      this.taxRules.set(id, { id, organizationId: orgId, ...def });
    }
  }

  listTaxRules(claims: AccessTokenClaims): TaxRuleRecord[] {
    this.ensureOrgTaxRules(claims.orgId);
    return [...this.taxRules.values()].filter((t) => t.organizationId === claims.orgId);
  }

  createTaxRule(
    claims: AccessTokenClaims,
    input: {
      code: string;
      name: string;
      rateBps: number;
      countryCode: string;
    },
  ): TaxRuleRecord {
    this.ensureOrgTaxRules(claims.orgId);
    const code = input.code.trim().toUpperCase();
    const dup = [...this.taxRules.values()].find(
      (t) => t.organizationId === claims.orgId && t.code === code,
    );
    if (dup) {
      throw new AuthServiceError(409, `Tax rule ${code} already exists`, 'DUPLICATE_TAX_RULE');
    }
    const rule: TaxRuleRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      code,
      name: input.name.trim(),
      rateBps: Math.round(input.rateBps),
      countryCode: input.countryCode.toUpperCase(),
      isActive: true,
    };
    this.taxRules.set(rule.id, rule);
    return rule;
  }

  buildBomDraftFromDesign(claims: AccessTokenClaims, designId: string): {
    designId: string;
    designRevisionId: string;
    projectId: string;
    customerId: string;
    currency: SupportedCurrency;
    title: string;
    items: QuotationLineItemInput[];
  } {
    this.ensureOrgTaxRules(claims.orgId);
    const detail = this.solarEngineering.getDesignDetail(claims, designId);
    const project = this.customersSurveys.getProject(claims, detail.design.projectId);
    const latestRev = detail.revisions[detail.revisions.length - 1];
    const catalog = this.inventory.listCatalog(claims);

    const pvCat = catalog.find((c) => c.category === 'pv_module');
    const invCat = catalog.find((c) => c.category === 'inverter');
    const batCat = catalog.find((c) => c.category === 'battery');
    const cableCat = catalog.find((c) => c.category === 'cable');

    const input = latestRev.inputs;
    const calc = latestRev.calculations;
    const items: QuotationLineItemInput[] = [];

    items.push({
      equipmentCatalogId: pvCat?.id ?? null,
      lineType: 'equipment',
      description: `${input.module.manufacturer} ${input.module.modelName} (${input.module.pmaxW}W)`,
      quantity: calc.totalPanelCount,
      unitCostMinor: pvCat?.unitCostMinor ?? 2150000,
      unitPriceMinor: pvCat?.unitSellPriceMinor ?? 2550000,
      taxRateBps: 0,
    });

    items.push({
      equipmentCatalogId: invCat?.id ?? null,
      lineType: 'equipment',
      description: `${input.inverter.manufacturer} ${input.inverter.modelName}`,
      quantity: input.inverterCount,
      unitCostMinor: invCat?.unitCostMinor ?? 49500000,
      unitPriceMinor: invCat?.unitSellPriceMinor ?? 56500000,
      taxRateBps: 0,
    });

    if (input.battery && calc.recommendedBatteryUnits > 0) {
      items.push({
        equipmentCatalogId: batCat?.id ?? null,
        lineType: 'equipment',
        description: `${input.battery.manufacturer} ${input.battery.modelName}`,
        quantity: calc.recommendedBatteryUnits,
        unitCostMinor: batCat?.unitCostMinor ?? 26500000,
        unitPriceMinor: batCat?.unitSellPriceMinor ?? 31000000,
        taxRateBps: 0,
      });
    }

    const dcCableMeters = Math.max(20, Math.round(input.dcCableOneWayLengthM * 2 * input.activeMpptCount));
    items.push({
      equipmentCatalogId: cableCat?.id ?? null,
      lineType: 'material',
      description: `Solar DC XLPO Cabling (${input.dcCableCrossSectionMm2}mm²) & Earthing Kit`,
      quantity: dcCableMeters,
      unitCostMinor: cableCat?.unitCostMinor ?? 38000,
      unitPriceMinor: cableCat?.unitSellPriceMinor ?? 48000,
      taxRateBps: 0,
    });

    items.push({
      lineType: 'labor',
      description: `EPC Installation, Elevated Mounting & Testing (${calc.actualDcKwp} kWp)`,
      quantity: 1,
      unitCostMinor: 9500000,
      unitPriceMinor: 14500000,
      taxRateBps: 1800,
    });

    items.push({
      lineType: 'transport',
      description: 'Site Logistics, Freight & Crane Handling',
      quantity: 1,
      unitCostMinor: 1800000,
      unitPriceMinor: 2500000,
      taxRateBps: 1800,
    });

    return {
      designId: detail.design.id,
      designRevisionId: latestRev.id,
      projectId: project.id,
      customerId: project.customerId,
      currency: project.currency,
      title: `${calc.actualDcKwp} kWp Solar Proposal · ${project.title}`,
      items,
    };
  }

  listQuotations(claims: AccessTokenClaims, projectId?: string) {
    this.ensureOrgTaxRules(claims.orgId);
    return [...this.quotations.values()]
      .filter((q) => q.organizationId === claims.orgId)
      .filter((q) => !projectId || q.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((q) => {
        const revs = this.revisions.get(q.id) ?? [];
        const latestRevision = revs[revs.length - 1];
        return {
          quotation: q,
          latestRevision,
          approvals: this.approvals.get(q.id) ?? [],
        };
      });
  }

  getQuotationDetail(claims: AccessTokenClaims, quotationId: string) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation || quotation.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Quotation not found in active organization', 'NOT_FOUND');
    }
    return {
      quotation,
      revisions: this.revisions.get(quotation.id) ?? [],
      approvals: this.approvals.get(quotation.id) ?? [],
    };
  }

  createQuotation(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      projectId: string;
      designRevisionId?: string | null;
      title: string;
      currency?: SupportedCurrency;
      validityDays?: number;
      termsAndConditions?: string;
      notes?: string;
      discountMinor?: number;
      items: QuotationLineItemInput[];
    },
  ) {
    this.ensureOrgTaxRules(claims.orgId);
    const project = this.customersSurveys.getProject(claims, input.projectId);
    const id = input.id ?? randomUUID();
    if (this.quotations.has(id)) {
      throw new AuthServiceError(409, 'Quotation ID already exists', 'DUPLICATE_QUOTATION');
    }

    const now = new Date().toISOString();
    const count = [...this.quotations.values()].filter(
      (q) => q.organizationId === claims.orgId,
    ).length;

    const currency = input.currency ?? project.currency;
    const totals = calculateQuotationTotals(input.items, input.discountMinor ?? 0);

    const quotation: QuotationRecord = {
      id,
      organizationId: claims.orgId,
      projectId: project.id,
      customerId: project.customerId,
      quotationNumber: `QT-${String(count + 1).padStart(4, '0')}`,
      title: input.title.trim(),
      currentRevisionNumber: 1,
      status: 'draft',
      currency,
      createdByUserId: claims.sub,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rev1: QuotationRevisionRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      quotationId: id,
      designRevisionId: input.designRevisionId ?? null,
      revisionNumber: 1,
      status: 'draft',
      currency,
      validityDays: input.validityDays ?? 15,
      termsAndConditions:
        input.termsAndConditions?.trim() ||
        '50% advance with order, 40% upon equipment delivery, 10% after commissioning.',
      notes: input.notes?.trim() ?? '',
      ...totals,
      approvedAt: null,
      createdAt: now,
    };

    this.quotations.set(id, quotation);
    this.revisions.set(id, [rev1]);
    this.approvals.set(id, []);
    return { quotation, revisions: [rev1], approvals: [] as QuotationApprovalRecord[] };
  }

  updateDraftRevision(
    claims: AccessTokenClaims,
    quotationId: string,
    revisionNumber: number,
    input: {
      baseRowVersion: number;
      title?: string;
      validityDays?: number;
      termsAndConditions?: string;
      notes?: string;
      discountMinor?: number;
      items: QuotationLineItemInput[];
    },
  ) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation || quotation.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Quotation not found in active organization', 'NOT_FOUND');
    }
    if (quotation.rowVersion !== input.baseRowVersion) {
      throw new AuthServiceError(
        409,
        `Quotation rowVersion conflict: expected ${quotation.rowVersion}, got ${input.baseRowVersion}`,
        'VERSION_CONFLICT',
      );
    }
    const revs = this.revisions.get(quotation.id) ?? [];
    const rev = revs.find((r) => r.revisionNumber === revisionNumber);
    if (!rev) {
      throw new AuthServiceError(404, `Revision ${revisionNumber} not found`, 'NOT_FOUND');
    }
    if (rev.status !== 'draft') {
      throw new AuthServiceError(
        409,
        `Revision v${revisionNumber} is ${rev.status} and immutable. Create a new revision instead.`,
        'REVISION_IMMUTABLE',
      );
    }

    const totals = calculateQuotationTotals(input.items, input.discountMinor ?? rev.discountMinor);
    Object.assign(rev, {
      ...totals,
      validityDays: input.validityDays ?? rev.validityDays,
      termsAndConditions: input.termsAndConditions?.trim() ?? rev.termsAndConditions,
      notes: input.notes?.trim() ?? rev.notes,
    });

    if (input.title) quotation.title = input.title.trim();
    quotation.rowVersion += 1;
    quotation.updatedAt = new Date().toISOString();

    return { quotation, revision: rev };
  }

  createNewRevision(
    claims: AccessTokenClaims,
    quotationId: string,
    input: {
      designRevisionId?: string | null;
      validityDays?: number;
      termsAndConditions?: string;
      notes?: string;
      discountMinor?: number;
      items: QuotationLineItemInput[];
    },
  ) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation || quotation.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Quotation not found in active organization', 'NOT_FOUND');
    }
    const revs = this.revisions.get(quotation.id) ?? [];
    const prev = revs[revs.length - 1];
    const nextRevNumber = (prev?.revisionNumber ?? 0) + 1;
    const totals = calculateQuotationTotals(input.items, input.discountMinor ?? 0);
    const now = new Date().toISOString();

    const newRev: QuotationRevisionRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      quotationId: quotation.id,
      designRevisionId: input.designRevisionId ?? prev?.designRevisionId ?? null,
      revisionNumber: nextRevNumber,
      status: 'draft',
      currency: quotation.currency,
      validityDays: input.validityDays ?? prev?.validityDays ?? 15,
      termsAndConditions: input.termsAndConditions?.trim() || prev?.termsAndConditions || '',
      notes: input.notes?.trim() ?? '',
      ...totals,
      approvedAt: null,
      createdAt: now,
    };

    revs.push(newRev);
    quotation.currentRevisionNumber = nextRevNumber;
    quotation.status = 'draft';
    quotation.rowVersion += 1;
    quotation.updatedAt = now;

    return { quotation, revision: newRev };
  }

  sendQuotation(claims: AccessTokenClaims, quotationId: string, revisionNumber?: number) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation || quotation.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Quotation not found in active organization', 'NOT_FOUND');
    }
    const revs = this.revisions.get(quotation.id) ?? [];
    const targetRev = revs.find(
      (r) => r.revisionNumber === (revisionNumber ?? quotation.currentRevisionNumber),
    );
    if (!targetRev) {
      throw new AuthServiceError(404, 'Target quotation revision not found', 'NOT_FOUND');
    }
    if (targetRev.status !== 'draft') {
      throw new AuthServiceError(
        409,
        `Quotation revision v${targetRev.revisionNumber} is already ${targetRev.status}`,
        'INVALID_STATE',
      );
    }

    targetRev.status = 'sent';
    quotation.status = 'sent';
    quotation.rowVersion += 1;
    quotation.updatedAt = new Date().toISOString();
    this.customersSurveys.advanceProjectStage(claims, quotation.projectId, 'quote_sent');
    return { quotation, revision: targetRev };
  }

  approveOrRejectQuotation(
    claims: AccessTokenClaims,
    quotationId: string,
    decision: 'approved' | 'rejected',
    notes: string,
    customerSignoffName?: string | null,
    revisionNumber?: number,
  ) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation || quotation.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Quotation not found in active organization', 'NOT_FOUND');
    }
    const revs = this.revisions.get(quotation.id) ?? [];
    const targetRev = revs.find(
      (r) => r.revisionNumber === (revisionNumber ?? quotation.currentRevisionNumber),
    );
    if (!targetRev) {
      throw new AuthServiceError(404, 'Target quotation revision not found', 'NOT_FOUND');
    }
    if (targetRev.status === 'approved') {
      throw new AuthServiceError(
        409,
        `Revision v${targetRev.revisionNumber} is already approved and immutable`,
        'REVISION_IMMUTABLE',
      );
    }

    const now = new Date().toISOString();
    targetRev.status = decision;
    if (decision === 'approved') {
      targetRev.approvedAt = now;
    }

    quotation.status = decision;
    quotation.rowVersion += 1;
    quotation.updatedAt = now;

    const approval: QuotationApprovalRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      quotationRevisionId: targetRev.id,
      approvedByUserId: claims.sub,
      customerSignoffName: customerSignoffName?.trim() || null,
      decision,
      notes: notes.trim(),
      decidedAt: now,
    };

    const existingApprovals = this.approvals.get(quotation.id) ?? [];
    existingApprovals.push(approval);
    this.approvals.set(quotation.id, existingApprovals);

    if (decision === 'approved') {
      this.customersSurveys.advanceProjectStage(claims, quotation.projectId, 'quote_approved');
    }

    return { quotation, revision: targetRev, approval };
  }

  renderPrintableQuotationHtml(
    claims: AccessTokenClaims,
    quotationId: string,
    orgDisplayName: string,
    revisionNumber?: number,
  ): { filename: string; quotationNumber: string; revisionNumber: number; html: string } {
    const detail = this.getQuotationDetail(claims, quotationId);
    const rev =
      detail.revisions.find(
        (r) => r.revisionNumber === (revisionNumber ?? detail.quotation.currentRevisionNumber),
      ) ?? detail.revisions[detail.revisions.length - 1];
    const customer = this.customersSurveys
      .listCustomers(claims)
      .find((c) => c.id === detail.quotation.customerId);
    const project = this.customersSurveys.getProject(claims, detail.quotation.projectId);

    const rowsHtml = rev.items
      .map(
        (item, idx) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.lineType)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.description)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(minorToMajor(item.unitPriceMinor), rev.currency))}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${(item.taxRateBps / 100).toFixed(2)}%</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(minorToMajor(item.lineTotalMinor), rev.currency))}</td>
      </tr>`,
      )
      .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(detail.quotation.quotationNumber)} v${rev.revisionNumber} — ${escapeHtml(orgDisplayName)}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:860px;margin:24px auto;padding:24px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:16px;">
    <div>
      <h1 style="margin:0;font-size:22px;">${escapeHtml(orgDisplayName)}</h1>
      <p style="margin:4px 0 0;color:#475569;font-size:13px;">Solar Commercial Proposal · ${escapeHtml(detail.quotation.quotationNumber)} (Revision v${rev.revisionNumber})</p>
    </div>
    <div style="text-align:right;font-size:13px;">
      <strong>Status:</strong> ${escapeHtml(rev.status.toUpperCase())}<br/>
      <strong>Validity:</strong> ${rev.validityDays} Days<br/>
      <strong>Currency:</strong> ${escapeHtml(rev.currency)}
    </div>
  </div>
  <div style="display:flex;justify-content:space-between;margin:16px 0;font-size:13px;">
    <div>
      <strong>Prepared For:</strong><br/>
      ${escapeHtml(customer?.fullName ?? 'Customer Account')}<br/>
      ${customer?.companyName ? `${escapeHtml(customer.companyName)}<br/>` : ''}
      ${escapeHtml(customer?.billingAddress ?? '')}
    </div>
    <div style="text-align:right;">
      <strong>Project:</strong> ${escapeHtml(project.projectCode)}<br/>
      ${escapeHtml(detail.quotation.title)}
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
    <thead>
      <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1;text-align:left;">
        <th style="padding:8px;">#</th>
        <th style="padding:8px;">Type</th>
        <th style="padding:8px;">Description</th>
        <th style="padding:8px;text-align:right;">Qty</th>
        <th style="padding:8px;text-align:right;">Unit Price</th>
        <th style="padding:8px;text-align:right;">Tax</th>
        <th style="padding:8px;text-align:right;">Line Total</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div style="margin-top:20px;margin-left:auto;max-width:320px;font-size:13px;">
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Subtotal (after discount):</span><strong style="font-family:monospace;">${escapeHtml(formatCurrency(minorToMajor(rev.subtotalMinor), rev.currency))}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Discount:</span><span style="font-family:monospace;">-${escapeHtml(formatCurrency(minorToMajor(rev.discountMinor), rev.currency))}</span></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Applicable Tax:</span><span style="font-family:monospace;">${escapeHtml(formatCurrency(minorToMajor(rev.taxAmountMinor), rev.currency))}</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:2px solid #0f172a;font-size:15px;"><strong>Grand Total:</strong><strong style="font-family:monospace;">${escapeHtml(formatCurrency(minorToMajor(rev.totalAmountMinor), rev.currency))}</strong></div>
  </div>
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:12px;color:#475569;">
    <strong>Terms &amp; Conditions:</strong><br/>
    ${escapeHtml(rev.termsAndConditions)}
  </div>
</body>
</html>`;

    return {
      filename: `${detail.quotation.quotationNumber}-v${rev.revisionNumber}.html`,
      quotationNumber: detail.quotation.quotationNumber,
      revisionNumber: rev.revisionNumber,
      html,
    };
  }

  applyOfflineSyncedQuotationDraft(
    claims: AccessTokenClaims,
    entityId: string,
    operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ) {
    if (operationType === 'delete') return;
    const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
    const title = typeof payload.title === 'string' ? payload.title : 'Offline Solar Quotation';
    const items = Array.isArray(payload.items)
      ? (payload.items as QuotationLineItemInput[])
      : [];
    if (!projectId || items.length === 0) return;

    const existing = this.quotations.get(entityId);
    if (!existing) {
      this.createQuotation(claims, {
        id: entityId,
        projectId,
        title,
        notes: typeof payload.notes === 'string' ? payload.notes : '',
        discountMinor: typeof payload.discountMinor === 'number' ? payload.discountMinor : 0,
        items,
      });
    } else if (existing.organizationId === claims.orgId) {
      const revs = this.revisions.get(existing.id) ?? [];
      const current = revs[revs.length - 1];
      if (current && current.status === 'draft') {
        this.updateDraftRevision(claims, existing.id, current.revisionNumber, {
          baseRowVersion: existing.rowVersion,
          title,
          notes: typeof payload.notes === 'string' ? payload.notes : current.notes,
          discountMinor:
            typeof payload.discountMinor === 'number' ? payload.discountMinor : current.discountMinor,
          items,
        });
      }
    }
  }

  // ============================================================================
  // BILLING: INVOICES, PAYMENTS, CREDIT NOTES & DOUBLE-ENTRY JOURNALS
  // ============================================================================

  private postInternalJournal(
    claims: AccessTokenClaims,
    referenceType: JournalEntryRecord['referenceType'],
    referenceId: string,
    currency: SupportedCurrency,
    description: string,
    rawLines: JournalLineInput[],
  ): JournalEntryRecord {
    const check = verifyJournalEntryBalanced(rawLines);
    if (!check.valid) {
      throw new AuthServiceError(422, check.reason ?? 'Unbalanced journal entry', 'UNBALANCED_JOURNAL');
    }
    const count = [...this.journals.values()].filter(
      (j) => j.organizationId === claims.orgId,
    ).length;

    const entry: JournalEntryRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      entryNumber: `JE-${String(count + 1).padStart(4, '0')}`,
      referenceType,
      referenceId,
      status: 'posted',
      currency,
      description,
      lines: rawLines.map(
        (l): JournalLineRecord => ({
          id: randomUUID(),
          accountCode: l.accountCode.trim(),
          accountName: l.accountName.trim(),
          debitMinor: Math.round(l.debitMinor),
          creditMinor: Math.round(l.creditMinor),
        }),
      ),
      totalDebitMinor: check.totalDebitMinor,
      totalCreditMinor: check.totalCreditMinor,
      postedAt: new Date().toISOString(),
      postedByUserId: claims.sub,
    };
    this.journals.set(entry.id, entry);
    return entry;
  }

  listInvoices(claims: AccessTokenClaims, projectId?: string): InvoiceRecord[] {
    this.ensureOrgTaxRules(claims.orgId);
    return [...this.invoices.values()]
      .filter((inv) => inv.organizationId === claims.orgId)
      .filter((inv) => !projectId || inv.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createInvoice(
    claims: AccessTokenClaims,
    input: {
      projectId: string;
      quotationRevisionId?: string | null;
      invoiceType: InvoiceType;
      dueDate: string;
      currency?: SupportedCurrency;
      items: InvoiceItemInput[];
    },
  ): InvoiceRecord {
    this.ensureOrgTaxRules(claims.orgId);
    const project = this.customersSurveys.getProject(claims, input.projectId);
    const currency = input.currency ?? project.currency;

    let subtotalMinor = 0;
    let taxAmountMinor = 0;

    const computedItems: InvoiceItemRecord[] = input.items.map((line) => {
      let taxRateBps = line.taxRateBps ?? 0;
      let resolvedRuleId: string | null = null;
      if (line.taxRuleId) {
        const rule = this.taxRules.get(line.taxRuleId);
        if (!rule || rule.organizationId !== claims.orgId) {
          throw new AuthServiceError(404, 'Tax rule not found in active organization', 'NOT_FOUND');
        }
        taxRateBps = rule.rateBps;
        resolvedRuleId = rule.id;
      }

      const qty = Math.max(0.0001, line.quantity);
      const unitPriceMinor = Math.max(0, Math.round(line.unitPriceMinor));
      const lineSubtotalMinor = Math.round(qty * unitPriceMinor);
      const lineTaxMinor = Math.round((lineSubtotalMinor * taxRateBps) / 10_000);
      const lineTotalMinor = lineSubtotalMinor + lineTaxMinor;

      subtotalMinor += lineSubtotalMinor;
      taxAmountMinor += lineTaxMinor;

      return {
        id: randomUUID(),
        taxRuleId: resolvedRuleId,
        description: line.description.trim(),
        quantity: qty,
        unitPriceMinor,
        taxRateBps,
        lineSubtotalMinor,
        taxAmountMinor: lineTaxMinor,
        lineTotalMinor,
      };
    });

    const totalAmountMinor = subtotalMinor + taxAmountMinor;
    const count = [...this.invoices.values()].filter(
      (i) => i.organizationId === claims.orgId,
    ).length;

    const invoice: InvoiceRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      projectId: project.id,
      customerId: project.customerId,
      quotationRevisionId: input.quotationRevisionId ?? null,
      invoiceNumber: `INV-${String(count + 1).padStart(4, '0')}`,
      invoiceType: input.invoiceType,
      status: 'draft',
      currency,
      subtotalMinor,
      taxAmountMinor,
      totalAmountMinor,
      amountPaidMinor: 0,
      creditedAmountMinor: 0,
      balanceDueMinor: totalAmountMinor,
      dueDate: input.dueDate,
      issuedAt: null,
      items: computedItems,
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  issueInvoice(claims: AccessTokenClaims, invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Invoice not found in active organization', 'NOT_FOUND');
    }
    if (invoice.status !== 'draft') {
      throw new AuthServiceError(
        409,
        `Cannot issue invoice from status ${invoice.status}`,
        'INVALID_STATE',
      );
    }

    const journalLines: JournalLineInput[] = [
      {
        accountCode: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        debitMinor: invoice.totalAmountMinor,
        creditMinor: 0,
      },
    ];
    if (invoice.subtotalMinor > 0) {
      journalLines.push({
        accountCode: STANDARD_ACCOUNTS.SOLAR_REVENUE.code,
        accountName: STANDARD_ACCOUNTS.SOLAR_REVENUE.name,
        debitMinor: 0,
        creditMinor: invoice.subtotalMinor,
      });
    }
    if (invoice.taxAmountMinor > 0) {
      journalLines.push({
        accountCode: STANDARD_ACCOUNTS.TAX_PAYABLE.code,
        accountName: STANDARD_ACCOUNTS.TAX_PAYABLE.name,
        debitMinor: 0,
        creditMinor: invoice.taxAmountMinor,
      });
    }

    const journalEntry = this.postInternalJournal(
      claims,
      'invoice_issue',
      invoice.id,
      invoice.currency,
      `Issued ${invoice.invoiceType} invoice ${invoice.invoiceNumber}`,
      journalLines,
    );

    invoice.status = 'issued';
    invoice.issuedAt = new Date().toISOString();
    invoice.rowVersion += 1;

    return { invoice, journalEntry };
  }

  listPayments(claims: AccessTokenClaims): PaymentRecord[] {
    return [...this.payments.values()]
      .filter((p) => p.organizationId === claims.orgId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  recordPaymentAndAllocate(
    claims: AccessTokenClaims,
    input: {
      idempotencyKey: string;
      customerId: string;
      paymentMethod: PaymentMethod;
      currency: SupportedCurrency;
      amountMinor: number;
      referenceNo?: string | null;
      allocations: Array<{ invoiceId: string; allocatedMinor: number }>;
    },
  ): { deduplicated: boolean; payment: PaymentRecord; journalEntry?: JournalEntryRecord } {
    const idemKey = `${claims.orgId}:${input.idempotencyKey}`;
    const existing = this.idempotentPayments.get(idemKey);
    if (existing) {
      return { deduplicated: true, payment: existing };
    }

    const amountMinor = Math.round(input.amountMinor);
    if (amountMinor <= 0) {
      throw new AuthServiceError(400, 'Payment amount must be positive', 'INVALID_AMOUNT');
    }

    const totalAllocated = input.allocations.reduce((acc, a) => acc + Math.round(a.allocatedMinor), 0);
    if (totalAllocated > amountMinor) {
      throw new AuthServiceError(
        400,
        `Total allocated minor (${totalAllocated}) exceeds payment amount (${amountMinor})`,
        'OVER_ALLOCATION',
      );
    }

    // Validate all target invoices cleanly before mutating state
    const resolvedTargets: Array<{ invoice: InvoiceRecord; allocatedMinor: number }> = [];
    for (const alloc of input.allocations) {
      const inv = this.invoices.get(alloc.invoiceId);
      if (!inv || inv.organizationId !== claims.orgId) {
        throw new AuthServiceError(404, 'Target invoice not found in active organization', 'NOT_FOUND');
      }
      if (inv.customerId !== input.customerId) {
        throw new AuthServiceError(
          400,
          `Invoice ${inv.invoiceNumber} belongs to a different customer`,
          'CUSTOMER_MISMATCH',
        );
      }
      if (inv.status !== 'issued' && inv.status !== 'partially_paid') {
        throw new AuthServiceError(
          409,
          `Invoice ${inv.invoiceNumber} status (${inv.status}) cannot accept allocations`,
          'INVALID_STATE',
        );
      }
      const allocMinor = Math.round(alloc.allocatedMinor);
      if (allocMinor <= 0 || allocMinor > inv.balanceDueMinor) {
        throw new AuthServiceError(
          409,
          `Allocation (${allocMinor}) exceeds invoice ${inv.invoiceNumber} balance due (${inv.balanceDueMinor})`,
          'EXCEEDS_BALANCE_DUE',
        );
      }
      resolvedTargets.push({ invoice: inv, allocatedMinor: allocMinor });
    }

    const paymentId = randomUUID();
    const now = new Date().toISOString();
    const count = [...this.payments.values()].filter((p) => p.organizationId === claims.orgId).length;
    const allocations: PaymentAllocationRecord[] = resolvedTargets.map(({ invoice, allocatedMinor }) => {
      invoice.amountPaidMinor += allocatedMinor;
      invoice.balanceDueMinor -= allocatedMinor;
      invoice.status = invoice.balanceDueMinor === 0 ? 'paid' : 'partially_paid';
      invoice.rowVersion += 1;

      return {
        id: randomUUID(),
        organizationId: claims.orgId,
        paymentId,
        invoiceId: invoice.id,
        allocatedMinor,
        createdAt: now,
      };
    });

    const unallocatedMinor = amountMinor - totalAllocated;
    const jLines: JournalLineInput[] = [
      {
        accountCode: STANDARD_ACCOUNTS.CASH_BANK.code,
        accountName: STANDARD_ACCOUNTS.CASH_BANK.name,
        debitMinor: amountMinor,
        creditMinor: 0,
      },
    ];
    if (totalAllocated > 0) {
      jLines.push({
        accountCode: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        debitMinor: 0,
        creditMinor: totalAllocated,
      });
    }
    if (unallocatedMinor > 0) {
      jLines.push({
        accountCode: STANDARD_ACCOUNTS.CUSTOMER_ADVANCES.code,
        accountName: STANDARD_ACCOUNTS.CUSTOMER_ADVANCES.name,
        debitMinor: 0,
        creditMinor: unallocatedMinor,
      });
    }

    const receiptNumber = `RCPT-${String(count + 1).padStart(4, '0')}`;
    const journalEntry = this.postInternalJournal(
      claims,
      'payment_receipt',
      paymentId,
      input.currency,
      `Customer payment receipt ${receiptNumber}`,
      jLines,
    );

    const payment: PaymentRecord = {
      id: paymentId,
      organizationId: claims.orgId,
      customerId: input.customerId,
      receiptNumber,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      amountMinor,
      referenceNo: input.referenceNo?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      receivedAt: now,
      recordedByUserId: claims.sub,
      allocations,
    };

    this.payments.set(payment.id, payment);
    this.idempotentPayments.set(idemKey, payment);

    return { deduplicated: false, payment, journalEntry };
  }

  listCreditNotes(claims: AccessTokenClaims): CreditNoteRecord[] {
    return [...this.creditNotes.values()]
      .filter((cn) => cn.organizationId === claims.orgId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  issueCreditNote(
    claims: AccessTokenClaims,
    input: {
      invoiceId: string;
      amountMinor: number;
      reason: string;
    },
  ) {
    const invoice = this.invoices.get(input.invoiceId);
    if (!invoice || invoice.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Invoice not found in active organization', 'NOT_FOUND');
    }
    if (invoice.status === 'draft' || invoice.status === 'void') {
      throw new AuthServiceError(
        409,
        `Cannot issue credit note against ${invoice.status} invoice`,
        'INVALID_STATE',
      );
    }
    const amountMinor = Math.round(input.amountMinor);
    const maxCreditable = invoice.totalAmountMinor - invoice.creditedAmountMinor;
    if (amountMinor <= 0 || amountMinor > maxCreditable) {
      throw new AuthServiceError(
        409,
        `Credit note amount (${amountMinor}) exceeds remaining creditable invoice total (${maxCreditable})`,
        'EXCESS_CREDIT_NOTE',
      );
    }

    const count = [...this.creditNotes.values()].filter(
      (cn) => cn.organizationId === claims.orgId,
    ).length;
    const cnId = randomUUID();
    const creditNoteNumber = `CN-${String(count + 1).padStart(4, '0')}`;

    const journalEntry = this.postInternalJournal(
      claims,
      'credit_note',
      cnId,
      invoice.currency,
      `Credit note ${creditNoteNumber} against ${invoice.invoiceNumber}`,
      [
        {
          accountCode: STANDARD_ACCOUNTS.CREDIT_NOTES_CONTRA.code,
          accountName: STANDARD_ACCOUNTS.CREDIT_NOTES_CONTRA.name,
          debitMinor: amountMinor,
          creditMinor: 0,
        },
        {
          accountCode: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
          accountName: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
          debitMinor: 0,
          creditMinor: amountMinor,
        },
      ],
    );

    invoice.creditedAmountMinor += amountMinor;
    invoice.balanceDueMinor = Math.max(0, invoice.balanceDueMinor - amountMinor);
    if (invoice.balanceDueMinor === 0 && invoice.status === 'issued') {
      invoice.status = 'paid';
    } else if (invoice.balanceDueMinor === 0 && invoice.status === 'partially_paid') {
      invoice.status = 'paid';
    }
    invoice.rowVersion += 1;

    const creditNote: CreditNoteRecord = {
      id: cnId,
      organizationId: claims.orgId,
      invoiceId: invoice.id,
      creditNoteNumber,
      reason: input.reason.trim(),
      currency: invoice.currency,
      amountMinor,
      issuedByUserId: claims.sub,
      issuedAt: new Date().toISOString(),
    };
    this.creditNotes.set(creditNote.id, creditNote);

    return { creditNote, invoice, journalEntry };
  }

  listJournalEntries(claims: AccessTokenClaims): JournalEntryRecord[] {
    return [...this.journals.values()]
      .filter((j) => j.organizationId === claims.orgId)
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  }

  postManualJournalEntry(
    claims: AccessTokenClaims,
    input: {
      currency: SupportedCurrency;
      description: string;
      referenceId?: string;
      lines: JournalLineInput[];
    },
  ): JournalEntryRecord {
    return this.postInternalJournal(
      claims,
      'manual_adjustment',
      input.referenceId ?? randomUUID(),
      input.currency,
      input.description.trim(),
      input.lines,
    );
  }

  getFinanceSummary(claims: AccessTokenClaims) {
    const orgInvoices = this.listInvoices(claims).filter((i) => i.status !== 'void' && i.status !== 'draft');
    const orgPayments = this.listPayments(claims);
    const orgCreditNotes = this.listCreditNotes(claims);
    const orgJournals = this.listJournalEntries(claims);

    const totalInvoicedMinor = orgInvoices.reduce((acc, i) => acc + i.totalAmountMinor, 0);
    const totalCollectedMinor = orgPayments.reduce((acc, p) => acc + p.amountMinor, 0);
    const totalCreditedMinor = orgCreditNotes.reduce((acc, c) => acc + c.amountMinor, 0);
    const accountsReceivableMinor = orgInvoices.reduce((acc, i) => acc + i.balanceDueMinor, 0);

    return {
      issuedInvoiceCount: orgInvoices.length,
      totalInvoicedMinor,
      totalCollectedMinor,
      totalCreditedMinor,
      accountsReceivableMinor,
      postedJournalCount: orgJournals.length,
    };
  }
}
