import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  calculateQuotationTotals,
  formatCurrency,
  majorToMinor,
  minorToMajor,
  type CreditNoteRecord,
  type InvoiceRecord,
  type InvoiceType,
  type JournalEntryRecord,
  type PaymentMethod,
  type PaymentRecord,
  type ProjectRecord,
  type QuotationApprovalRecord,
  type QuotationLineItemInput,
  type QuotationLineType,
  type QuotationRecord,
  type QuotationRevisionRecord,
  type SolarDesignRecord,
  type SupportedCurrency,
  type TaxRuleRecord,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  section: 'quotations' | 'finance';
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
  onNavigateSection: (section: 'quotations' | 'finance') => void;
}

interface QuotationEntry {
  quotation: QuotationRecord;
  latestRevision: QuotationRevisionRecord;
  approvals: QuotationApprovalRecord[];
}

interface FinanceSummary {
  issuedInvoiceCount: number;
  totalInvoicedMinor: number;
  totalCollectedMinor: number;
  totalCreditedMinor: number;
  accountsReceivableMinor: number;
  postedJournalCount: number;
}

function generateIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function QuotationsBillingWorkspace({
  section,
  currency,
  session,
  onSessionEstablished,
  onNavigateSection,
}: Props) {
  const [quotations, setQuotations] = useState<QuotationEntry[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [designs, setDesigns] = useState<Array<{ design: SolarDesignRecord }>>([]);
  const [taxRules, setTaxRules] = useState<TaxRuleRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [journals, setJournals] = useState<JournalEntryRecord[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Quotation builder state
  const [qtProjectId, setQtProjectId] = useState('');
  const [qtDesignId, setQtDesignId] = useState('');
  const [qtTitle, setQtTitle] = useState('12 kWp Hybrid EPC Proposal');
  const [qtValidityDays, setQtValidityDays] = useState(15);
  const [qtDiscountMajor, setQtDiscountMajor] = useState(25000);
  const [qtTerms, setQtTerms] = useState(
    '50% advance with order, 40% upon equipment delivery, 10% after commissioning.',
  );
  const [qtLines, setQtLines] = useState<QuotationLineItemInput[]>([
    {
      lineType: 'equipment',
      description: 'LONGi Hi-MO 6 580W Bifacial PV Module',
      quantity: 20,
      unitCostMinor: 2150000,
      unitPriceMinor: 2550000,
      taxRateBps: 0,
    },
    {
      lineType: 'equipment',
      description: 'Inverex Nitrox 12K-3P Hybrid Inverter IP65',
      quantity: 1,
      unitCostMinor: 49500000,
      unitPriceMinor: 56500000,
      taxRateBps: 0,
    },
    {
      lineType: 'labor',
      description: 'Elevated Structure Mounting, DC/AC Earthing & Commissioning',
      quantity: 1,
      unitCostMinor: 9500000,
      unitPriceMinor: 14500000,
      taxRateBps: 1800,
    },
  ]);

  // Printable quotation preview
  const [printableDoc, setPrintableDoc] = useState<{
    filename: string;
    quotationNumber: string;
    revisionNumber: number;
    html: string;
  } | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Invoice builder state
  const [invProjectId, setInvProjectId] = useState('');
  const [invQuotationRevId, setInvQuotationRevId] = useState('');
  const [invType, setInvType] = useState<InvoiceType>('advance');
  const [invDueDate, setInvDueDate] = useState(() => {
    const d = new Date(Date.now() + 14 * 86400_000);
    return d.toISOString().slice(0, 10);
  });
  const [invDesc, setInvDesc] = useState('50% Advance Milestone — Solar EPC Equipment Supply');
  const [invAmountMajor, setInvAmountMajor] = useState(600000);
  const [invTaxRuleId, setInvTaxRuleId] = useState('');

  // Payment allocation state
  const [payInvoiceId, setPayInvoiceId] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payAmountMajor, setPayAmountMajor] = useState(300000);
  const [payReferenceNo, setPayReferenceNo] = useState('IBFT-994210');
  const [payIdemKey, setPayIdemKey] = useState(() => generateIdempotencyKey('pay'));

  // Credit Note state
  const [cnInvoiceId, setCnInvoiceId] = useState('');
  const [cnAmountMajor, setCnAmountMajor] = useState(15000);
  const [cnReason, setCnReason] = useState('Site trenching scope reduction credit');

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-fin-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Commercial & Finance',
        displayName: 'VNex Solar Commercial & Finance',
        slug,
        businessAddress: 'Blue Area, Islamabad',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Ayesha Siddiqui',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'Finance!2026',
        deviceId: 'web-commercial-console',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Session initialization failed');
    const created: WebAuthSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      organizationName: data.organization.displayName,
      organizationId: data.organization.id,
      userEmail: data.user.email,
      role: data.role,
    };
    onSessionEstablished(created);
    return created;
  }

  async function refreshCommercialData(active: WebAuthSession) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const [qtRes, projRes, desRes, trRes, invRes, payRes, cnRes, jeRes, sumRes] =
        await Promise.all([
          fetch('/api/v1/quotations', { headers }),
          fetch('/api/v1/projects', { headers }),
          fetch('/api/v1/engineering/designs', { headers }),
          fetch('/api/v1/finance/tax-rules', { headers }),
          fetch('/api/v1/finance/invoices', { headers }),
          fetch('/api/v1/finance/payments', { headers }),
          fetch('/api/v1/finance/credit-notes', { headers }),
          fetch('/api/v1/finance/journals', { headers }),
          fetch('/api/v1/finance/summary', { headers }),
        ]);

      if (qtRes.ok) {
        const qData = await qtRes.json();
        setQuotations(qData.quotations ?? []);
      }
      if (projRes.ok) {
        const pData = await projRes.json();
        const pList: ProjectRecord[] = pData.projects ?? [];
        setProjects(pList);
        if (pList[0] && !qtProjectId) setQtProjectId(pList[0].id);
        if (pList[0] && !invProjectId) setInvProjectId(pList[0].id);
      }
      if (desRes.ok) {
        const dData = await desRes.json();
        setDesigns(dData.designs ?? []);
      }
      if (trRes.ok) {
        const trData = await trRes.json();
        const rules: TaxRuleRecord[] = trData.taxRules ?? [];
        setTaxRules(rules);
        if (rules[0] && !invTaxRuleId) setInvTaxRuleId(rules[0].id);
      }
      if (invRes.ok) {
        const iData = await invRes.json();
        const invList: InvoiceRecord[] = iData.invoices ?? [];
        setInvoices(invList);
        const payable = invList.find(
          (i) => i.status === 'issued' || i.status === 'partially_paid',
        );
        if (payable) {
          setPayInvoiceId((prev) => prev || payable.id);
          setCnInvoiceId((prev) => prev || payable.id);
        }
      }
      if (payRes.ok) setPayments((await payRes.json()).payments ?? []);
      if (cnRes.ok) setCreditNotes((await cnRes.json()).creditNotes ?? []);
      if (jeRes.ok) setJournals((await jeRes.json()).journals ?? []);
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to refresh commercial data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void refreshCommercialData(session);
    }
  }, [session]);

  const previewTotals = useMemo(
    () => calculateQuotationTotals(qtLines, majorToMinor(qtDiscountMajor)),
    [qtLines, qtDiscountMajor],
  );

  async function ensureSampleProject(active: WebAuthSession, preferredId?: string): Promise<string> {
    if (preferredId) return preferredId;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${active.accessToken}`,
    };
    const cust = await (
      await fetch('/api/v1/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerType: 'commercial',
          fullName: 'Margalla Hills Residence & Cold Store',
          billingAddress: 'Sector F-7/2, Islamabad',
        }),
      })
    ).json();
    const site = await (
      await fetch(`/api/v1/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Main Rooftop',
          addressLine: 'Street 18, Sector F-7/2',
          city: 'Islamabad',
          utilityProvider: 'IESCO',
        }),
      })
    ).json();
    const proj = await (
      await fetch('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: qtTitle,
          systemType: 'hybrid',
          targetCapacityKwp: 11.6,
          currency,
        }),
      })
    ).json();
    setQtProjectId(proj.id);
    setInvProjectId(proj.id);
    return proj.id;
  }

  async function handleImportFromDesign() {
    if (!session || !qtDesignId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/quotations/from-design/${qtDesignId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ create: false }),
      });
      const draft = await res.json();
      if (!res.ok) throw new Error(draft?.error?.message ?? 'Failed to derive BOM from design');
      setQtProjectId(draft.projectId);
      setQtTitle(draft.title);
      setQtLines(draft.items);
      setStatusMsg('Populated quotation BOM lines directly from selected Solar Engineering design.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'BOM import failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateQuotation(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const projectId = await ensureSampleProject(active, qtProjectId);
      const res = await fetch('/api/v1/quotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          title: qtTitle,
          currency,
          validityDays: qtValidityDays,
          termsAndConditions: qtTerms,
          discountMinor: majorToMinor(qtDiscountMajor),
          items: qtLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Quotation creation failed');
      setStatusMsg(
        `Created ${data.quotation.quotationNumber} v1 (${formatCurrency(minorToMajor(data.revisions[0].totalAmountMinor), data.quotation.currency)}).`,
      );
      await refreshCommercialData(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Quotation error');
    } finally {
      setBusy(false);
    }
  }

  async function handleQuotationAction(
    quotationId: string,
    action: 'send' | 'approve' | 'revise' | 'printable',
    entry?: QuotationEntry,
  ) {
    if (!session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      };
      if (action === 'printable') {
        const res = await fetch(`/api/v1/quotations/${quotationId}/printable`, { headers });
        const doc = await res.json();
        if (!res.ok) throw new Error(doc?.error?.message ?? 'Printable export failed');
        setPrintableDoc(doc);
      } else if (action === 'send') {
        const res = await fetch(`/api/v1/quotations/${quotationId}/send`, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'Send failed');
        setStatusMsg(
          `Marked ${data.quotation.quotationNumber} v${data.revision.revisionNumber} as sent. Project stage advanced to quote_sent.`,
        );
      } else if (action === 'approve') {
        const res = await fetch(`/api/v1/quotations/${quotationId}/approve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            notes: 'Approved commercial terms and BOM specification',
            customerSignoffName: 'Authorized Customer Signatory',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'Approval blocked');
        setInvQuotationRevId(data.revision.id);
        setInvProjectId(data.quotation.projectId);
        setInvAmountMajor(Math.round(minorToMajor(data.revision.totalAmountMinor) * 0.5));
        setStatusMsg(
          `Approved & locked ${data.quotation.quotationNumber} v${data.revision.revisionNumber}. Project advanced to quote_approved.`,
        );
      } else if (action === 'revise' && entry) {
        const res = await fetch(`/api/v1/quotations/${quotationId}/revisions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            notes: `Revision v${entry.quotation.currentRevisionNumber + 1} updated commercial pricing`,
            discountMinor: entry.latestRevision.discountMinor,
            items: entry.latestRevision.items.map((i) => ({
              equipmentCatalogId: i.equipmentCatalogId,
              lineType: i.lineType,
              description: i.description,
              quantity: i.quantity,
              unitCostMinor: i.unitCostMinor,
              unitPriceMinor: i.unitPriceMinor,
              taxRateBps: i.taxRateBps,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'New revision failed');
        setStatusMsg(
          `Created Revision v${data.revision.revisionNumber} on ${data.quotation.quotationNumber} while keeping prior approved revisions immutable.`,
        );
      }
      await refreshCommercialData(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Quotation action failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvoice(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const projectId = await ensureSampleProject(active, invProjectId);
      const res = await fetch('/api/v1/finance/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          quotationRevisionId: invQuotationRevId || null,
          invoiceType: invType,
          dueDate: invDueDate,
          currency,
          items: [
            {
              description: invDesc,
              quantity: 1,
              unitPriceMinor: majorToMinor(invAmountMajor),
              taxRuleId: invTaxRuleId || null,
            },
          ],
        }),
      });
      const inv = await res.json();
      if (!res.ok) throw new Error(inv?.error?.message ?? 'Invoice creation failed');
      setStatusMsg(
        `Created draft invoice ${inv.invoiceNumber} (${formatCurrency(minorToMajor(inv.totalAmountMinor), inv.currency)}). Issue it to post double-entry AR journal.`,
      );
      await refreshCommercialData(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Invoice creation error');
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueInvoice(invoiceId: string) {
    if (!session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/finance/invoices/${invoiceId}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Invoice issuance failed');
      setPayInvoiceId(data.invoice.id);
      setCnInvoiceId(data.invoice.id);
      setStatusMsg(
        `Issued ${data.invoice.invoiceNumber} & auto-posted balanced journal ${data.journalEntry.entryNumber}.`,
      );
      await refreshCommercialData(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Invoice issue failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const targetInv = invoices.find((i) => i.id === payInvoiceId);
    if (!targetInv) {
      setErrMsg('Select an issued invoice to allocate this payment.');
      return;
    }
    setBusy(true);
    setErrMsg(null);
    try {
      const amtMinor = majorToMinor(payAmountMajor);
      const allocMinor = Math.min(amtMinor, targetInv.balanceDueMinor);
      const res = await fetch('/api/v1/finance/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          idempotencyKey: payIdemKey,
          customerId: targetInv.customerId,
          paymentMethod: payMethod,
          currency: targetInv.currency,
          amountMinor: amtMinor,
          referenceNo: payReferenceNo || null,
          allocations: allocMinor > 0 ? [{ invoiceId: targetInv.id, allocatedMinor: allocMinor }] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Payment posting failed');
      setStatusMsg(
        data.deduplicated
          ? `Idempotency key ${payIdemKey} replayed safely without duplicate receipt.`
          : `Recorded receipt ${data.payment.receiptNumber} (${formatCurrency(minorToMajor(data.payment.amountMinor), data.payment.currency)}) & posted journal ${data.journalEntry?.entryNumber ?? ''}.`,
      );
      if (!data.deduplicated) {
        setPayIdemKey(generateIdempotencyKey('pay'));
      }
      await refreshCommercialData(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Payment recording error');
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueCreditNote(e: FormEvent) {
    e.preventDefault();
    if (!session || !cnInvoiceId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch('/api/v1/finance/credit-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          invoiceId: cnInvoiceId,
          amountMinor: majorToMinor(cnAmountMajor),
          reason: cnReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Credit note failed');
      setStatusMsg(
        `Issued credit note ${data.creditNote.creditNoteNumber} & posted reversing journal ${data.journalEntry.entryNumber}.`,
      );
      await refreshCommercialData(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Credit note error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Commercial &amp; Financial Control
            {session ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{session.organizationName}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono">{session.role}</span>
              </>
            ) : null}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            {section === 'quotations'
              ? 'Quotations, BOM Pricing & Proposal Export'
              : 'Invoices, Payment Allocations & Double-Entry Ledger'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Integer minor-unit BOM quotations with immutable approved revisions, printable proposal
            PDFs, milestone invoicing, credit notes, and balanced double-entry journals.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!session ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErrMsg(null);
                try {
                  const s = await ensureActiveSession();
                  await refreshCommercialData(s);
                  setStatusMsg(`Connected commercial & ledger session for ${s.organizationName}.`);
                } catch (err) {
                  setErrMsg(err instanceof Error ? err.message : 'Session error');
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {busy ? 'Connecting...' : 'Connect Commercial Tenant'}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void refreshCommercialData(session)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          )}
        </div>
      </div>

      {/* Sub-navigation switcher */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onNavigateSection('quotations')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'quotations'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Quotations &amp; BOM ({quotations.length})
        </button>
        <button
          type="button"
          onClick={() => onNavigateSection('finance')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'finance'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Billing, Payments &amp; Ledger ({invoices.length})
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          {errMsg}
        </div>
      )}

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Invoiced (Issued)
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {formatCurrency(minorToMajor(summary?.totalInvoicedMinor ?? 0), currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary?.issuedInvoiceCount ?? 0} issued invoices
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cash Collected</p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(minorToMajor(summary?.totalCollectedMinor ?? 0), currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {payments.length} payment receipts
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Accounts Receivable Due
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {formatCurrency(minorToMajor(summary?.accountsReceivableMinor ?? 0), currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Net of credit notes ({formatCurrency(minorToMajor(summary?.totalCreditedMinor ?? 0), currency)})
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Double-Entry Journals
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {journals.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            100% balanced debit/credit postings
          </p>
        </div>
      </div>

      {/* SECTION A: QUOTATIONS */}
      {section === 'quotations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Quotation Builder */}
            <form
              onSubmit={handleCreateQuotation}
              className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Draft Commercial Quotation
                </h2>
                {designs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={qtDesignId}
                      onChange={(e) => setQtDesignId(e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs"
                    >
                      <option value="">Select Solar Design...</option>
                      {designs.map((d) => (
                        <option key={d.design.id} value={d.design.id}>
                          {d.design.designCode} · {d.design.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!qtDesignId || busy}
                      onClick={() => void handleImportFromDesign()}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                    >
                      Import BOM
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Target Solar Project
                  <select
                    value={qtProjectId}
                    onChange={(e) => setQtProjectId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Auto-create Residential/Commercial Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} · {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Proposal Title
                  <input
                    required
                    value={qtTitle}
                    onChange={(e) => setQtTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    BOM, Labor &amp; Transport Line Items
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQtLines((prev) => [
                        ...prev,
                        {
                          lineType: 'service',
                          description: 'Net Metering Utility Processing & Approvals',
                          quantity: 1,
                          unitCostMinor: 2500000,
                          unitPriceMinor: 3500000,
                          taxRateBps: 1800,
                        },
                      ])
                    }
                    className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    + Add Line Item
                  </button>
                </div>

                <div className="space-y-2">
                  {qtLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-xs"
                    >
                      <select
                        value={line.lineType}
                        onChange={(e) => {
                          const val = e.target.value as QuotationLineType;
                          setQtLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, lineType: val } : l)),
                          );
                        }}
                        className="col-span-3 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1"
                      >
                        <option value="equipment">equipment</option>
                        <option value="material">material</option>
                        <option value="labor">labor</option>
                        <option value="transport">transport</option>
                        <option value="service">service</option>
                      </select>
                      <input
                        value={line.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQtLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, description: val } : l)),
                          );
                        }}
                        className="col-span-4 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1"
                      />
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value));
                          setQtLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l)),
                          );
                        }}
                        title="Quantity"
                        className="col-span-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 font-mono text-right"
                      />
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={minorToMajor(line.unitPriceMinor)}
                        onChange={(e) => {
                          const val = majorToMinor(Number(e.target.value));
                          setQtLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, unitPriceMinor: val } : l)),
                          );
                        }}
                        title="Unit Sell Price"
                        className="col-span-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 font-mono text-right"
                      />
                      <select
                        value={line.taxRateBps}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setQtLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, taxRateBps: val } : l)),
                          );
                        }}
                        className="col-span-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 py-1 font-mono"
                      >
                        <option value={0}>0% Tax</option>
                        <option value={1800}>18% GST</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Commercial Discount ({currency})
                  <input
                    type="number"
                    min={0}
                    value={qtDiscountMajor}
                    onChange={(e) => setQtDiscountMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Validity (Days)
                  <input
                    type="number"
                    min={1}
                    value={qtValidityDays}
                    onChange={(e) => setQtValidityDays(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Payment Terms
                  <input
                    value={qtTerms}
                    onChange={(e) => setQtTerms(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </label>
              </div>

              {/* Live Integer Pricing Summary */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                  <span>
                    Net Subtotal:{' '}
                    <strong>{formatCurrency(minorToMajor(previewTotals.subtotalMinor), currency)}</strong>
                  </span>
                  <span>
                    Tax: <strong>{formatCurrency(minorToMajor(previewTotals.taxAmountMinor), currency)}</strong>
                  </span>
                  <span>
                    Grand Total:{' '}
                    <strong className="text-amber-700 dark:text-amber-400">
                      {formatCurrency(minorToMajor(previewTotals.totalAmountMinor), currency)}
                    </strong>
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Margin: {(previewTotals.grossMarginBps / 100).toFixed(2)}%
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  Save Quotation Draft
                </button>
              </div>
            </form>

            {/* Quotations Registry */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Quotations ({quotations.length})
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Approved revisions lock immutably
                </span>
              </div>
              {quotations.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No quotations saved yet. Use the BOM pricing builder on the left to create Revision v1.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {quotations.map((entry) => {
                    const { quotation, latestRevision } = entry;
                    return (
                      <div key={quotation.id} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {quotation.quotationNumber} · v{quotation.currentRevisionNumber} ·{' '}
                              <span
                                className={
                                  quotation.status === 'approved'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : quotation.status === 'sent'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-600 dark:text-slate-400'
                                }
                              >
                                {quotation.status}
                              </span>
                            </p>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                              {quotation.title}
                            </p>
                          </div>
                          <div className="text-right font-mono tabular-nums text-xs">
                            <p className="font-semibold text-slate-900 dark:text-slate-50">
                              {formatCurrency(
                                minorToMajor(latestRevision.totalAmountMinor),
                                quotation.currency,
                              )}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              GM {(latestRevision.grossMarginBps / 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {latestRevision.status === 'draft' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleQuotationAction(quotation.id, 'send')}
                              className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Send Proposal
                            </button>
                          )}
                          {(latestRevision.status === 'draft' || latestRevision.status === 'sent') && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleQuotationAction(quotation.id, 'approve')}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              Approve &amp; Lock
                            </button>
                          )}
                          {latestRevision.status === 'approved' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleQuotationAction(quotation.id, 'revise', entry)}
                              className="px-2.5 py-1 text-xs font-medium rounded-md border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                            >
                              New Revision v{quotation.currentRevisionNumber + 1}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleQuotationAction(quotation.id, 'printable')}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Printable PDF View
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* In-app Printable Proposal Preview (no window.open) */}
          {printableDoc && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Printable Commercial Proposal · {printableDoc.quotationNumber} v{printableDoc.revisionNumber}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => printFrameRef.current?.contentWindow?.print()}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-amber-600 text-white cursor-pointer"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintableDoc(null)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
              <iframe
                ref={printFrameRef}
                title={printableDoc.filename}
                srcDoc={printableDoc.html}
                sandbox="allow-same-origin allow-modals"
                className="w-full h-96 bg-white"
              />
            </div>
          )}
        </div>
      )}

      {/* SECTION B: BILLING, PAYMENTS, CREDIT NOTES & DOUBLE-ENTRY JOURNALS */}
      {section === 'finance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Create Invoice */}
            <form
              onSubmit={handleCreateInvoice}
              className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                Create Milestone Invoice
              </h2>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Project
                <select
                  value={invProjectId}
                  onChange={(e) => setInvProjectId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                >
                  <option value="">Auto-create Solar Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} · {p.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Invoice Stage
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value as InvoiceType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                  >
                    <option value="advance">advance</option>
                    <option value="progress">progress</option>
                    <option value="final">final</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Due Date
                  <input
                    type="date"
                    required
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Line Description
                <input
                  required
                  value={invDesc}
                  onChange={(e) => setInvDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount ({currency})
                  <input
                    type="number"
                    min={1}
                    required
                    value={invAmountMajor}
                    onChange={(e) => setInvAmountMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tax Rule
                  <select
                    value={invTaxRuleId}
                    onChange={(e) => setInvTaxRuleId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                  >
                    {taxRules.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} ({(t.rateBps / 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white cursor-pointer disabled:opacity-60"
              >
                Create Draft Invoice
              </button>
            </form>

            {/* Record Payment Allocation */}
            <form
              onSubmit={handleRecordPayment}
              className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                Record Payment &amp; Allocate
              </h2>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Issued Invoice
                <select
                  value={payInvoiceId}
                  onChange={(e) => setPayInvoiceId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                >
                  <option value="">Select issued invoice...</option>
                  {invoices
                    .filter((i) => i.status === 'issued' || i.status === 'partially_paid')
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} · Due {formatCurrency(minorToMajor(i.balanceDueMinor), i.currency)}
                      </option>
                    ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Method
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">Easypaisa</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                    <option value="online">Online Transfer</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount ({currency})
                  <input
                    type="number"
                    min={1}
                    required
                    value={payAmountMajor}
                    onChange={(e) => setPayAmountMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono tabular-nums"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Bank Reference / Receipt Ref
                <input
                  value={payReferenceNo}
                  onChange={(e) => setPayReferenceNo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Idempotency Key
                <input
                  required
                  value={payIdemKey}
                  onChange={(e) => setPayIdemKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                />
              </label>

              <button
                type="submit"
                disabled={busy || !payInvoiceId}
                className="w-full py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
              >
                Post Payment Receipt
              </button>
            </form>

            {/* Issue Credit Note */}
            <form
              onSubmit={handleIssueCreditNote}
              className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                Issue Credit Note
              </h2>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Target Invoice
                <select
                  value={cnInvoiceId}
                  onChange={(e) => setCnInvoiceId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                >
                  <option value="">Select issued invoice...</option>
                  {invoices
                    .filter((i) => i.status !== 'draft' && i.status !== 'void')
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} · Total {formatCurrency(minorToMajor(i.totalAmountMinor), i.currency)}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Credit Amount ({currency})
                <input
                  type="number"
                  min={1}
                  required
                  value={cnAmountMajor}
                  onChange={(e) => setCnAmountMajor(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums"
                />
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reason
                <input
                  required
                  value={cnReason}
                  onChange={(e) => setCnReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                />
              </label>

              <button
                type="submit"
                disabled={busy || !cnInvoiceId}
                className="w-full py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer disabled:opacity-50"
              >
                Post Credit Note &amp; Reversal
              </button>
            </form>
          </div>

          {/* Invoices Ledger Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Invoices &amp; Receivables ({invoices.length})
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Credit notes: {creditNotes.length}
              </span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Invoice</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Subtotal</th>
                  <th className="py-2.5 px-4 text-right">Tax</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4 text-right">Paid</th>
                  <th className="py-2.5 px-4 text-right">Credited</th>
                  <th className="py-2.5 px-4 text-right">Balance Due</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">
                      No invoices created yet.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {inv.invoiceNumber}
                        <span aria-hidden="true"> · </span>
                        <span className="font-sans font-normal text-slate-500 dark:text-slate-400">
                          {inv.invoiceType}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono">{inv.status}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(minorToMajor(inv.subtotalMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(minorToMajor(inv.taxAmountMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatCurrency(minorToMajor(inv.totalAmountMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(minorToMajor(inv.amountPaidMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(minorToMajor(inv.creditedAmountMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                        {formatCurrency(minorToMajor(inv.balanceDueMinor), inv.currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {inv.status === 'draft' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleIssueInvoice(inv.id)}
                            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Issue &amp; Post JE
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Double-Entry General Ledger Journals */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Posted Double-Entry Journal Entries ({journals.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Every issued invoice, payment receipt, and credit note enforces Σ Debit = Σ Credit.
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Entry</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Account Lines</th>
                  <th className="py-2.5 px-4 text-right">Total Debit</th>
                  <th className="py-2.5 px-4 text-right">Total Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {journals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">
                      Issue an invoice or record a payment to inspect balanced double-entry journals.
                    </td>
                  </tr>
                ) : (
                  journals.map((je) => (
                    <tr key={je.id} className="align-top">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {je.entryNumber}
                        <p className="font-sans font-normal text-slate-500 dark:text-slate-400">
                          {je.referenceType}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{je.description}</td>
                      <td className="py-3 px-4 space-y-1 font-mono">
                        {je.lines.map((l) => (
                          <div key={l.id} className="flex items-center justify-between gap-4">
                            <span>
                              {l.accountCode} {l.accountName}
                            </span>
                            <span className="tabular-nums text-slate-600 dark:text-slate-400">
                              {l.debitMinor > 0
                                ? `DR ${formatCurrency(minorToMajor(l.debitMinor), je.currency)}`
                                : `CR ${formatCurrency(minorToMajor(l.creditMinor), je.currency)}`}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatCurrency(minorToMajor(je.totalDebitMinor), je.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatCurrency(minorToMajor(je.totalCreditMinor), je.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
