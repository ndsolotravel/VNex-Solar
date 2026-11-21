import type { SupportedCurrency } from './design-tokens.ts';

export type QuotationLineType = 'equipment' | 'material' | 'labor' | 'transport' | 'service';
export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';

export type InvoiceType = 'advance' | 'progress' | 'final';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'void';
export type PaymentMethod =
  | 'bank_transfer'
  | 'cash'
  | 'jazzcash'
  | 'easypaisa'
  | 'cheque'
  | 'card'
  | 'online';

export interface QuotationLineItemInput {
  id?: string;
  equipmentCatalogId?: string | null;
  lineType: QuotationLineType;
  description: string;
  quantity: number;
  unitCostMinor: number;
  unitPriceMinor: number;
  taxRateBps: number; // e.g. 1800 = 18.00%, 0 = tax-exempt
}

export interface QuotationLineItemRecord {
  id: string;
  equipmentCatalogId: string | null;
  lineType: QuotationLineType;
  description: string;
  quantity: number;
  unitCostMinor: number;
  unitPriceMinor: number;
  taxRateBps: number;
  lineCostMinor: number;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
}

export interface QuotationTotalsSummary {
  items: QuotationLineItemRecord[];
  equipmentSubtotalMinor: number;
  laborCostMinor: number;
  transportCostMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  totalCostMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number; // 1850 = 18.50%
}

export interface QuotationRevisionRecord {
  id: string;
  organizationId: string;
  quotationId: string;
  designRevisionId: string | null;
  revisionNumber: number;
  status: Exclude<QuotationStatus, 'expired'>;
  currency: SupportedCurrency;
  validityDays: number;
  termsAndConditions: string;
  notes: string;
  items: QuotationLineItemRecord[];
  equipmentSubtotalMinor: number;
  laborCostMinor: number;
  transportCostMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  totalCostMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number;
  approvedAt: string | null;
  createdAt: string;
}

export interface QuotationApprovalRecord {
  id: string;
  organizationId: string;
  quotationRevisionId: string;
  approvedByUserId: string;
  customerSignoffName: string | null;
  decision: 'approved' | 'rejected';
  notes: string;
  decidedAt: string;
}

export interface QuotationRecord {
  id: string;
  organizationId: string;
  projectId: string;
  customerId: string;
  quotationNumber: string;
  title: string;
  currentRevisionNumber: number;
  status: QuotationStatus;
  currency: SupportedCurrency;
  createdByUserId: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxRuleRecord {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  rateBps: number;
  countryCode: string;
  isActive: boolean;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRuleId?: string | null;
  taxRateBps?: number;
}

export interface InvoiceItemRecord {
  id: string;
  taxRuleId: string | null;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRateBps: number;
  lineSubtotalMinor: number;
  taxAmountMinor: number;
  lineTotalMinor: number;
}

export interface InvoiceRecord {
  id: string;
  organizationId: string;
  projectId: string;
  customerId: string;
  quotationRevisionId: string | null;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  currency: SupportedCurrency;
  subtotalMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  amountPaidMinor: number;
  creditedAmountMinor: number;
  balanceDueMinor: number;
  dueDate: string;
  issuedAt: string | null;
  items: InvoiceItemRecord[];
  rowVersion: number;
  createdAt: string;
}

export interface PaymentAllocationRecord {
  id: string;
  organizationId: string;
  paymentId: string;
  invoiceId: string;
  allocatedMinor: number;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  paymentMethod: PaymentMethod;
  currency: SupportedCurrency;
  amountMinor: number;
  referenceNo: string | null;
  idempotencyKey: string;
  receivedAt: string;
  recordedByUserId: string;
  allocations: PaymentAllocationRecord[];
}

export interface CreditNoteRecord {
  id: string;
  organizationId: string;
  invoiceId: string;
  creditNoteNumber: string;
  reason: string;
  currency: SupportedCurrency;
  amountMinor: number;
  issuedByUserId: string;
  issuedAt: string;
}

export interface JournalLineInput {
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
}

export interface JournalLineRecord {
  id: string;
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
}

export interface JournalEntryRecord {
  id: string;
  organizationId: string;
  entryNumber: string;
  referenceType: 'invoice_issue' | 'payment_receipt' | 'credit_note' | 'manual_adjustment';
  referenceId: string;
  status: 'posted';
  currency: SupportedCurrency;
  description: string;
  lines: JournalLineRecord[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  postedAt: string;
  postedByUserId: string;
}

export const STANDARD_ACCOUNTS = {
  CASH_BANK: { code: '1010', name: 'Cash & Bank Clearing' },
  ACCOUNTS_RECEIVABLE: { code: '1100', name: 'Accounts Receivable' },
  CUSTOMER_ADVANCES: { code: '2100', name: 'Customer Advance Deposits' },
  TAX_PAYABLE: { code: '2200', name: 'Sales Tax / GST Payable' },
  SOLAR_REVENUE: { code: '4000', name: 'Solar EPC Project Revenue' },
  CREDIT_NOTES_CONTRA: { code: '4100', name: 'Sales Returns & Credit Notes' },
} as const;

export function calculateQuotationTotals(
  rawItems: ReadonlyArray<QuotationLineItemInput>,
  discountMinorInput: number = 0,
): QuotationTotalsSummary {
  let equipmentSubtotalMinor = 0;
  let laborCostMinor = 0;
  let transportCostMinor = 0;
  let grossSubtotalMinor = 0;
  let totalCostMinor = 0;

  const items: QuotationLineItemRecord[] = rawItems.map((raw, idx) => {
    const qty = Math.max(0.0001, raw.quantity);
    const unitCostMinor = Math.max(0, Math.round(raw.unitCostMinor));
    const unitPriceMinor = Math.max(0, Math.round(raw.unitPriceMinor));
    const taxRateBps = Math.max(0, Math.round(raw.taxRateBps));

    const lineCostMinor = Math.round(qty * unitCostMinor);
    const lineSubtotalMinor = Math.round(qty * unitPriceMinor);
    const lineTaxMinor = Math.round((lineSubtotalMinor * taxRateBps) / 10_000);
    const lineTotalMinor = lineSubtotalMinor + lineTaxMinor;

    totalCostMinor += lineCostMinor;
    grossSubtotalMinor += lineSubtotalMinor;

    if (raw.lineType === 'equipment' || raw.lineType === 'material') {
      equipmentSubtotalMinor += lineSubtotalMinor;
    } else if (raw.lineType === 'labor' || raw.lineType === 'service') {
      laborCostMinor += lineSubtotalMinor;
    } else if (raw.lineType === 'transport') {
      transportCostMinor += lineSubtotalMinor;
    }

    return {
      id: raw.id ?? `qt-line-${idx + 1}`,
      equipmentCatalogId: raw.equipmentCatalogId ?? null,
      lineType: raw.lineType,
      description: raw.description.trim(),
      quantity: qty,
      unitCostMinor,
      unitPriceMinor,
      taxRateBps,
      lineCostMinor,
      lineSubtotalMinor,
      lineTaxMinor,
      lineTotalMinor,
    };
  });

  const discountMinor = Math.max(0, Math.min(grossSubtotalMinor, Math.round(discountMinorInput)));
  const netSubtotalMinor = grossSubtotalMinor - discountMinor;

  // Allocate tax proportionally when a quotation-level discount is applied
  let taxAmountMinor = 0;
  if (grossSubtotalMinor > 0 && discountMinor > 0) {
    for (const item of items) {
      const discountedLineSub = Math.round(
        (item.lineSubtotalMinor * netSubtotalMinor) / grossSubtotalMinor,
      );
      taxAmountMinor += Math.round((discountedLineSub * item.taxRateBps) / 10_000);
    }
  } else {
    taxAmountMinor = items.reduce((acc, item) => acc + item.lineTaxMinor, 0);
  }

  const totalAmountMinor = netSubtotalMinor + taxAmountMinor;
  const grossProfitMinor = netSubtotalMinor - totalCostMinor;
  const grossMarginBps =
    netSubtotalMinor > 0 ? Math.round((grossProfitMinor * 10_000) / netSubtotalMinor) : 0;

  return {
    items,
    equipmentSubtotalMinor,
    laborCostMinor,
    transportCostMinor,
    discountMinor,
    subtotalMinor: netSubtotalMinor,
    taxAmountMinor,
    totalAmountMinor,
    totalCostMinor,
    grossProfitMinor,
    grossMarginBps,
  };
}

export function verifyJournalEntryBalanced(lines: ReadonlyArray<JournalLineInput>): {
  valid: boolean;
  totalDebitMinor: number;
  totalCreditMinor: number;
  reason?: string;
} {
  if (lines.length < 2) {
    return {
      valid: false,
      totalDebitMinor: 0,
      totalCreditMinor: 0,
      reason: 'Journal entry requires at least two lines (debit and credit).',
    };
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;

  for (const line of lines) {
    const d = Math.round(line.debitMinor);
    const c = Math.round(line.creditMinor);
    if (d < 0 || c < 0) {
      return {
        valid: false,
        totalDebitMinor,
        totalCreditMinor,
        reason: 'Debit and credit amounts must be non-negative.',
      };
    }
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
      return {
        valid: false,
        totalDebitMinor,
        totalCreditMinor,
        reason: `Account ${line.accountCode} must have either positive debit or positive credit, not both or zero.`,
      };
    }
    totalDebitMinor += d;
    totalCreditMinor += c;
  }

  if (totalDebitMinor !== totalCreditMinor || totalDebitMinor <= 0) {
    return {
      valid: false,
      totalDebitMinor,
      totalCreditMinor,
      reason: `Unbalanced journal entry: debits (${totalDebitMinor}) != credits (${totalCreditMinor}).`,
    };
  }

  return { valid: true, totalDebitMinor, totalCreditMinor };
}
