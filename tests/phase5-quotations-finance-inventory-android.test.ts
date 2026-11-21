import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { calculateQuotationTotals } from '../packages/domain/src/index.ts';

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

test('Phase 5 Android: QuotationCalculator, native PDF/Print/Sharesheet, Room v3, and Phase 5 screens parity', () => {
  const androidRoot = path.resolve(
    process.cwd(),
    'apps/android/app/src/main/java/com/vnexsolar/app',
  );

  const calcSrc = fs.readFileSync(path.join(androidRoot, 'feature/quotations/QuotationCalculator.kt'), 'utf8');
  const pdfSrc = fs.readFileSync(path.join(androidRoot, 'feature/quotations/QuotationPdfExporter.kt'), 'utf8');
  const quoteVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/quotations/QuotationsViewModel.kt'), 'utf8');
  const quoteScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/quotations/QuotationsScreen.kt'), 'utf8');
  const financeVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/finance/FinanceViewModel.kt'), 'utf8');
  const financeScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/finance/FinanceScreen.kt'), 'utf8');
  const invVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/inventory/InventoryViewModel.kt'), 'utf8');
  const invScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/inventory/InventoryScreen.kt'), 'utf8');
  const supScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/inventory/SuppliersScreen.kt'), 'utf8');
  const reportsScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/reports/ReportsScreen.kt'), 'utf8');
  const navSrc = fs.readFileSync(path.join(androidRoot, 'core/navigation/VNexNavGraph.kt'), 'utf8');
  const dbSrc = fs.readFileSync(path.join(androidRoot, 'core/database/VNexDatabase.kt'), 'utf8');
  const diSrc = fs.readFileSync(path.join(androidRoot, 'core/di/DatabaseModule.kt'), 'utf8');
  const domainConstSrc = fs.readFileSync(path.join(androidRoot, 'core/model/DomainConstants.kt'), 'utf8');

  // Verify TS calculateQuotationTotals parity on exact test vector used in QuotationCalculatorTest.kt
  const webTotals = calculateQuotationTotals(
    [
      {
        lineType: 'equipment',
        description: '585W Bifacial Panels',
        quantity: 20,
        unitCostMinor: 2_800_000,
        unitPriceMinor: 3_400_000,
        taxRateBps: 0,
      },
      {
        lineType: 'labor',
        description: 'EPC Installation & Earthing',
        quantity: 1,
        unitCostMinor: 8_000_000,
        unitPriceMinor: 12_000_000,
        taxRateBps: 1800,
      },
      {
        lineType: 'transport',
        description: 'Lahore Site Delivery',
        quantity: 1,
        unitCostMinor: 1_500_000,
        unitPriceMinor: 2_000_000,
        taxRateBps: 0,
      },
    ],
    4_100_000,
  );
  assert.equal(webTotals.equipmentSubtotalMinor, 68_000_000);
  assert.equal(webTotals.laborCostMinor, 12_000_000);
  assert.equal(webTotals.transportCostMinor, 2_000_000);
  assert.equal(webTotals.subtotalMinor, 77_900_000);
  assert.equal(webTotals.taxAmountMinor, 2_052_000);
  assert.equal(webTotals.totalAmountMinor, 79_952_000);
  assert.equal(webTotals.grossProfitMinor, 12_400_000);
  assert.equal(webTotals.grossMarginBps, 1592);

  assert.match(calcSrc, /discountedLineSub/);
  assert.match(calcSrc, /floor\(value \+ 0\.5\)\.toLong\(\)/);

  // Native Android PDF / PrintManager / Sharesheet (never WebView)
  assert.match(pdfSrc, /android\.graphics\.pdf\.PdfDocument/);
  assert.match(pdfSrc, /android\.graphics\.pdf\.PdfRenderer/);
  assert.match(pdfSrc, /PrintManager/);
  assert.match(pdfSrc, /Intent\.ACTION_SEND/);
  assert.match(pdfSrc, /FileProvider\.getUriForFile/);
  assert.ok(!pdfSrc.includes('android.webkit.WebView'));
  assert.ok(!quoteScreenSrc.includes('android.webkit.WebView'));

  // Room v3 migration & Phase 5 offline tables
  assert.match(dbSrc, /version = 3/);
  assert.match(dbSrc, /DraftExpenseEntity::class/);
  assert.match(dbSrc, /CachedQuotationEntity::class/);
  assert.match(diSrc, /MIGRATION_2_3/);

  // Offline quotation draft sync entity & BOM import
  assert.match(quoteVmSrc, /quotation_draft/);
  assert.match(quoteVmSrc, /buildQuotationBomFromDesign/);
  assert.match(quoteVmSrc, /createInvoice/);

  // Pakistan payment channels honesty + Room draft expenses + Double-entry
  assert.match(domainConstSrc, /JAZZCASH\("jazzcash", "JazzCash"\)/);
  assert.match(domainConstSrc, /EASYPAISA\("easypaisa", "Easypaisa"\)/);
  assert.match(financeScreenSrc, /no live gateway integration claimed/i);
  assert.match(financeVmSrc, /DraftExpenseEntity/);
  assert.match(financeVmSrc, /postManualJournal/);
  assert.match(financeVmSrc, /5100/);
  assert.match(financeVmSrc, /2000/);

  // Idempotent inventory actions + suppliers/POs + reports
  assert.match(invVmSrc, /inv-\$action-\$\{UUID\.randomUUID\(\)\}/);
  assert.match(invVmSrc, /grn-\$\{UUID\.randomUUID\(\)\}/);
  assert.match(invVmSrc, /STOCK\("Stock & Alerts"\)/);
  assert.match(invScreenSrc, /InventoryTab\.STOCK/);
  assert.match(invScreenSrc, /InventoryTab\.SERIALS/);
  assert.match(supScreenSrc, /Receive Goods \(GRN\)/);
  assert.match(reportsScreenSrc, /Profit & Loss Statement/);

  // NavGraph wiring replaces ModuleFoundationScreen shells for Phase 5 routes
  assert.match(navSrc, /FinanceScreen\(/);
  assert.match(navSrc, /QuotationsScreen\(/);
  assert.match(navSrc, /InventoryScreen\(/);
  assert.match(navSrc, /SuppliersScreen\(/);
  assert.match(navSrc, /ReportsScreen\(/);
});

test('Phase 5 Android E2E Backend Flows: Quotation Draft Sync, JazzCash/Easypaisa Payments, Expense Journal & Idempotent Inventory', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Phase 5 Android Solar Ltd',
        displayName: 'VNex Phase 5 PK',
        slug: `vnex-p5-${Date.now()}`,
        businessAddress: 'DHA Phase 5, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Zainab Tariq',
        ownerEmail: 'zainab@vnexp5.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const { accessToken } = await regRes.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

    // 1. Seed Customer, Site, Project
    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'residential', fullName: 'Bilal Ahmed' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Model Town Residence',
          addressLine: 'Block C House 14',
          city: 'Lahore',
          connectionPhase: 'three',
        }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '10kW Hybrid Lahore Home',
          systemType: 'hybrid',
          targetCapacityKwp: 10.2,
          currency: 'PKR',
        }),
      })
    ).json();

    // 2. Sync offline quotation_draft via /sync/batch -> approve -> convert to invoice
    const syncOpId = randomUUID();
    const localQuoteId = randomUUID();
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: 'android-phase5-tablet',
        operations: [
          {
            syncOperationId: syncOpId,
            idempotencyKey: `quotation_draft:create:${localQuoteId}:${syncOpId}`,
            entityType: 'quotation_draft',
            entityId: localQuoteId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'phase5-qt-sha',
            clientTimestamp: new Date().toISOString(),
            payload: {
              projectId: project.id,
              title: 'Offline 10kW Proposal',
              notes: 'Drafted offline in Android Room outbox',
              discountMinor: 500_000,
              items: [
                {
                  lineType: 'equipment',
                  description: '585W N-Type Panels (x18)',
                  quantity: 18,
                  unitCostMinor: 2_800_000,
                  unitPriceMinor: 3_400_000,
                  taxRateBps: 0,
                },
                {
                  lineType: 'labor',
                  description: 'Installation & Net Metering',
                  quantity: 1,
                  unitCostMinor: 8_000_000,
                  unitPriceMinor: 12_000_000,
                  taxRateBps: 1800,
                },
              ],
            },
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');

    const quotesList = await (await fetch(`${baseUrl}/quotations`, { headers })).json();
    assert.equal(quotesList.quotations.length, 1);
    const syncedQuote = quotesList.quotations[0];
    assert.equal(syncedQuote.quotation.title, 'Offline 10kW Proposal');

    const approveRes = await fetch(`${baseUrl}/quotations/${syncedQuote.quotation.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        notes: 'Customer approved on Android',
        customerSignoffName: 'Bilal Ahmed',
      }),
    });
    assert.equal(approveRes.status, 200);

    // 3. Convert approved quotation to Invoice -> Issue -> Record JazzCash & Easypaisa Receipts
    const invCreateRes = await fetch(`${baseUrl}/finance/invoices`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        quotationRevisionId: syncedQuote.latestRevision.id,
        invoiceType: 'advance',
        dueDate: '2026-12-01',
        currency: 'PKR',
        items: syncedQuote.latestRevision.items.map((item: { description: string; quantity: number; unitPriceMinor: number; taxRateBps: number }) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          taxRateBps: item.taxRateBps,
        })),
      }),
    });
    assert.equal(invCreateRes.status, 201);
    const invoice = await invCreateRes.json();

    const issueInvRes = await fetch(`${baseUrl}/finance/invoices/${invoice.id}/issue`, {
      method: 'POST',
      headers,
    });
    assert.equal(issueInvRes.status, 200);

    const jazzRes = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: `pay-jazz-${randomUUID()}`,
        customerId: cust.id,
        paymentMethod: 'jazzcash',
        currency: 'PKR',
        amountMinor: 10_000_000,
        referenceNo: 'JC-TID-99201',
        allocations: [{ invoiceId: invoice.id, allocatedMinor: 10_000_000 }],
      }),
    });
    assert.equal(jazzRes.status, 201);

    const easyRes = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: `pay-easy-${randomUUID()}`,
        customerId: cust.id,
        paymentMethod: 'easypaisa',
        currency: 'PKR',
        amountMinor: 5_000_000,
        referenceNo: 'EP-TID-44120',
        allocations: [{ invoiceId: invoice.id, allocatedMinor: 5_000_000 }],
      }),
    });
    assert.equal(easyRes.status, 201);

    // 4. Post Expense Journal from Android Draft Expense pattern (5100 DR / 1010 CR)
    const expRes = await fetch(`${baseUrl}/finance/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currency: 'PKR',
        description: '[Cash] Crane hoisting & earthing rod transport',
        lines: [
          { accountCode: '5100', accountName: 'Site & Operating Expenses', debitMinor: 1_800_000, creditMinor: 0 },
          { accountCode: '1010', accountName: 'Cash & Bank Clearing', debitMinor: 0, creditMinor: 1_800_000 },
        ],
      }),
    });
    assert.equal(expRes.status, 201);

    const finSummary = await (await fetch(`${baseUrl}/finance/summary`, { headers })).json();
    assert.equal(finSummary.issuedInvoiceCount, 1);
    assert.equal(finSummary.totalCollectedMinor, 15_000_000);

    // 5. Inventory: Supplier -> PO -> Issue -> GRN (idempotent) -> Issue to project (idempotent)
    const warehouses = (await (await fetch(`${baseUrl}/inventory/warehouses`, { headers })).json()).warehouses;
    const defaultWh = warehouses[0];
    const catalog = (await (await fetch(`${baseUrl}/inventory/catalog`, { headers })).json()).items;
    const skuItem = catalog[0];

    const supplier = await (
      await fetch(`${baseUrl}/inventory/suppliers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Lahore Solar Distributors', paymentTerms: 'Net 15' }),
      })
    ).json();
    const po = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId: supplier.id,
          warehouseId: defaultWh.id,
          currency: 'PKR',
          items: [{ equipmentCatalogId: skuItem.id, quantityOrdered: 10, unitCostMinor: skuItem.unitCostMinor }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, { method: 'POST', headers });

    const grnKey = `grn-${randomUUID()}`;
    const grnRes1 = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: grnKey,
        equipmentCatalogId: skuItem.id,
        quantityReceived: 10,
      }),
    });
    assert.equal(grnRes1.status, 201);
    const grnRes2 = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: grnKey,
        equipmentCatalogId: skuItem.id,
        quantityReceived: 10,
      }),
    });
    assert.equal(grnRes2.status, 201);
    const grnBody2 = await grnRes2.json();
    assert.equal(grnBody2.deduplicated, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
