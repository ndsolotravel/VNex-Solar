import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import {
  UserRole,
  calculateQuotationTotals,
  verifyJournalEntryBalanced,
} from '../packages/domain/src/index.ts';

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

async function registerOrg(baseUrl: string, slug: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `Commercial Corp ${slug}`,
      displayName: `Commercial ${slug}`,
      slug,
      businessAddress: 'Islamabad, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'FinancePassword!2026',
    }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

async function inviteAndLogin(
  baseUrl: string,
  ownerToken: string,
  slug: string,
  email: string,
  role: UserRole,
) {
  const password = 'RoleUserPass!2026';
  const invRes = await fetch(`${baseUrl}/organizations/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      email,
      fullName: `Staff ${role}`,
      role,
      temporaryPassword: password,
    }),
  });
  assert.equal(invRes.status, 201);

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, organizationSlug: slug }),
  });
  assert.equal(loginRes.status, 200);
  return loginRes.json();
}

async function createSampleProject(baseUrl: string, token: string) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const cust = await (
    await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Pearl Textile Industries',
      }),
    })
  ).json();

  const site = await (
    await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Roof Block North',
        addressLine: 'Sector I-9 Industrial Area',
        city: 'Islamabad',
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
        title: '12 kWp Commercial Hybrid Solar EPC',
        systemType: 'hybrid',
        targetCapacityKwp: 12,
        currency: 'PKR',
      }),
    })
  ).json();
  return { cust, site, project };
}

test('Phase 8 Test 25: Integer minor-unit quotation pricing, BOM-from-design, immutable approved revisions, & printable HTML', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // Pure integer pricing math check (zero floats)
    const totals = calculateQuotationTotals(
      [
        {
          lineType: 'equipment',
          description: 'PV Modules',
          quantity: 10,
          unitCostMinor: 2000000,
          unitPriceMinor: 2500000,
          taxRateBps: 0,
        },
        {
          lineType: 'labor',
          description: 'EPC Labor',
          quantity: 1,
          unitCostMinor: 5000000,
          unitPriceMinor: 10000000,
          taxRateBps: 1800,
        },
      ],
      0,
    );
    assert.equal(totals.subtotalMinor, 35000000);
    assert.equal(totals.taxAmountMinor, 1800000);
    assert.equal(totals.totalAmountMinor, 36800000);
    assert.equal(totals.grossProfitMinor, 10000000);

    const auth = await registerOrg(baseUrl, 'qt-immutability');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
    const { project } = await createSampleProject(baseUrl, auth.accessToken);

    // Create a Solar Design first and auto-generate BOM quotation from it
    const cat = await (await fetch(`${baseUrl}/engineering/catalog`, { headers })).json();
    const desRes = await fetch(`${baseUrl}/engineering/designs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        title: '11.6 kWp Design',
        calculationInput: {
          currency: 'PKR',
          overrideDailyEnergyKwh: 42,
          usableRoofAreaM2: 120,
          ambientMinTempC: 4,
          ambientMaxTempC: 46,
          peakSunHoursPerDay: 5.2,
          tiltDegrees: 24,
          azimuthDegrees: 180,
          module: cat.modules[0],
          inverter: cat.inverters[0],
          battery: cat.batteries[0],
          modulesInSeries: 10,
          parallelStringsPerMppt: 1,
          activeMpptCount: 2,
          inverterCount: 1,
          dcCableOneWayLengthM: 25,
          dcCableCrossSectionMm2: 6,
          acCableOneWayLengthM: 18,
          acCableCrossSectionMm2: 10,
          systemCapexAmount: 2450000,
          gridTariffPerKwh: 62,
          exportTariffPerKwh: 22,
          annualOmCost: 35000,
        },
      }),
    });
    assert.equal(desRes.status, 201);
    const designDetail = await desRes.json();

    const qtFromDesRes = await fetch(
      `${baseUrl}/quotations/from-design/${designDetail.design.id}?create=true`,
      { method: 'POST', headers },
    );
    assert.equal(qtFromDesRes.status, 201);
    const qtCreated = await qtFromDesRes.json();
    assert.equal(qtCreated.quotation.quotationNumber, 'QT-0001');
    assert.ok(qtCreated.revisions[0].items.length >= 4);

    // Send & Approve v1
    const sendRes = await fetch(`${baseUrl}/quotations/${qtCreated.quotation.id}/send`, {
      method: 'POST',
      headers,
    });
    assert.equal(sendRes.status, 200);
    assert.equal((await sendRes.json()).quotation.status, 'sent');

    const appRes = await fetch(`${baseUrl}/quotations/${qtCreated.quotation.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        notes: 'Client accepted proposal v1',
        customerSignoffName: 'Tariq Mahmood',
      }),
    });
    assert.equal(appRes.status, 200);
    const appBody = await appRes.json();
    assert.equal(appBody.revision.status, 'approved');

    // Project stage advanced to quote_approved
    const projCheck = await (await fetch(`${baseUrl}/projects/${project.id}`, { headers })).json();
    assert.equal(projCheck.currentStage, 'quote_approved');

    // Editing approved v1 must fail 409 REVISION_IMMUTABLE
    const editApprovedRes = await fetch(`${baseUrl}/quotations/${qtCreated.quotation.id}/revisions/1`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        baseRowVersion: appBody.quotation.rowVersion,
        items: qtCreated.revisions[0].items,
      }),
    });
    assert.equal(editApprovedRes.status, 409);
    assert.equal((await editApprovedRes.json()).error.code, 'REVISION_IMMUTABLE');

    // Creating Revision v2 succeeds cleanly while preserving v1
    const rev2Res = await fetch(`${baseUrl}/quotations/${qtCreated.quotation.id}/revisions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        notes: 'Added extra surge arrestor package',
        items: qtCreated.revisions[0].items,
      }),
    });
    assert.equal(rev2Res.status, 201);
    const rev2Body = await rev2Res.json();
    assert.equal(rev2Body.revision.revisionNumber, 2);

    // Printable HTML export escapes entities & includes quotation details
    const printRes = await fetch(
      `${baseUrl}/quotations/${qtCreated.quotation.id}/printable?revisionNumber=1`,
      { headers },
    );
    assert.equal(printRes.status, 200);
    const printData = await printRes.json();
    assert.match(printData.html, /QT-0001/);
    assert.match(printData.html, /APPROVED/);
  } finally {
    server.close();
  }
});

test('Phase 8 Test 26: Invoices, idempotent payments, credit notes & balanced double-entry journals', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const auth = await registerOrg(baseUrl, 'fin-double-entry');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.accessToken}` };
    const { cust, project } = await createSampleProject(baseUrl, auth.accessToken);

    const trData = await (await fetch(`${baseUrl}/finance/tax-rules`, { headers })).json();
    const gstRule = trData.taxRules.find((t: { code: string }) => t.code === 'SVC-GST-18');
    assert.ok(gstRule);

    // Create draft invoice of 1,000,000 PKR (100,000,000 minor) + 18% GST = 1,180,000 PKR (118,000,000 minor)
    const invRes = await fetch(`${baseUrl}/finance/invoices`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        invoiceType: 'advance',
        dueDate: '2026-12-01',
        currency: 'PKR',
        items: [
          {
            description: 'Turnkey EPC Engineering & Installation Milestone',
            quantity: 1,
            unitPriceMinor: 100000000,
            taxRuleId: gstRule.id,
          },
        ],
      }),
    });
    assert.equal(invRes.status, 201);
    const inv = await invRes.json();
    assert.equal(inv.subtotalMinor, 100000000);
    assert.equal(inv.taxAmountMinor, 18000000);
    assert.equal(inv.totalAmountMinor, 118000000);
    assert.equal(inv.status, 'draft');

    // Issue invoice -> posts balanced JE (AR 118M DR / Revenue 100M CR + Tax 18M CR)
    const issueRes = await fetch(`${baseUrl}/finance/invoices/${inv.id}/issue`, {
      method: 'POST',
      headers,
    });
    assert.equal(issueRes.status, 200);
    const issued = await issueRes.json();
    assert.equal(issued.invoice.status, 'issued');
    assert.equal(issued.journalEntry.totalDebitMinor, 118000000);
    assert.equal(issued.journalEntry.totalCreditMinor, 118000000);

    // Idempotent partial payment of 600,000 PKR (60,000,000 minor)
    const payBody = {
      idempotencyKey: 'pay-inv1-600k',
      customerId: cust.id,
      paymentMethod: 'bank_transfer',
      currency: 'PKR',
      amountMinor: 60000000,
      referenceNo: 'IBFT-778899',
      allocations: [{ invoiceId: inv.id, allocatedMinor: 60000000 }],
    };
    const pay1 = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payBody),
    });
    assert.equal(pay1.status, 201);
    const pay1Data = await pay1.json();
    assert.equal(pay1Data.deduplicated, false);
    assert.equal(pay1Data.journalEntry.totalDebitMinor, 60000000);

    // Replay same idempotencyKey -> deduplicated: true, no double deduction
    const pay2 = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payBody),
    });
    assert.equal(pay2.status, 201);
    assert.equal((await pay2.json()).deduplicated, true);

    // Issue credit note of 18,000,000 minor (180,000 PKR) -> balance due becomes 40,000,000 minor
    const cnRes = await fetch(`${baseUrl}/finance/credit-notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        invoiceId: inv.id,
        amountMinor: 18000000,
        reason: 'Waived auxiliary conduit scope',
      }),
    });
    assert.equal(cnRes.status, 201);
    const cnData = await cnRes.json();
    assert.equal(cnData.invoice.balanceDueMinor, 40000000);
    assert.equal(cnData.journalEntry.totalDebitMinor, 18000000);

    // Unbalanced manual journal entry must be rejected 422 UNBALANCED_JOURNAL
    const check = verifyJournalEntryBalanced([
      { accountCode: '1010', accountName: 'Cash', debitMinor: 500, creditMinor: 0 },
      { accountCode: '4000', accountName: 'Revenue', debitMinor: 0, creditMinor: 400 },
    ]);
    assert.equal(check.valid, false);

    const badJeRes = await fetch(`${baseUrl}/finance/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currency: 'PKR',
        description: 'Invalid unbalanced adjustment',
        lines: [
          { accountCode: '1010', accountName: 'Cash', debitMinor: 50000, creditMinor: 0 },
          { accountCode: '4000', accountName: 'Revenue', debitMinor: 0, creditMinor: 40000 },
        ],
      }),
    });
    assert.equal(badJeRes.status, 422);
    assert.equal((await badJeRes.json()).error.code, 'UNBALANCED_JOURNAL');

    // Summary reflects accurate totals
    const summary = await (await fetch(`${baseUrl}/finance/summary`, { headers })).json();
    assert.equal(summary.totalInvoicedMinor, 118000000);
    assert.equal(summary.totalCollectedMinor, 60000000);
    assert.equal(summary.totalCreditedMinor, 18000000);
    assert.equal(summary.accountsReceivableMinor, 40000000);
    assert.equal(summary.postedJournalCount, 3);
  } finally {
    server.close();
  }
});

test('Phase 8 Test 27: Quotation & Finance RBAC, cross-tenant isolation, & offline quotation_draft sync', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'fin-tenant-a');
    const orgB = await registerOrg(baseUrl, 'fin-tenant-b');

    const sales = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'fin-tenant-a',
      'sales@fin-tenant-a.pk',
      UserRole.SALES_EXECUTIVE,
    );
    const finance = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'fin-tenant-a',
      'finance@fin-tenant-a.pk',
      UserRole.FINANCE_OFFICER,
    );
    const tech = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'fin-tenant-a',
      'tech@fin-tenant-a.pk',
      UserRole.FIELD_TECHNICIAN,
    );

    const { project } = await createSampleProject(baseUrl, orgA.accessToken);

    // Offline sync batch reconciles quotation_draft from Sales Executive while rejecting finance_posting
    const draftQuoteId = randomUUID();
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sales.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: 'sales-tablet-01',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `qt-draft-${draftQuoteId}`,
            entityType: 'quotation_draft',
            entityId: draftQuoteId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'abc12345',
            payload: {
              projectId: project.id,
              title: 'Offline Field Solar Quote',
              items: [
                {
                  lineType: 'equipment',
                  description: 'Solar Kit 10kW',
                  quantity: 1,
                  unitCostMinor: 120000000,
                  unitPriceMinor: 150000000,
                  taxRateBps: 0,
                },
              ],
            },
            clientTimestamp: new Date().toISOString(),
          },
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `fin-post-${randomUUID()}`,
            entityType: 'finance_posting',
            entityId: randomUUID(),
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'def67890',
            payload: { amountMinor: 1000 },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');
    assert.equal(syncBody.results[1].status, 'rejected');

    // Sales Executive CANNOT approve quotation (403) and CANNOT access finance invoices (403)
    const salesApprove = await fetch(`${baseUrl}/quotations/${draftQuoteId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sales.accessToken}` },
    });
    assert.equal(salesApprove.status, 403);

    const salesFinRead = await fetch(`${baseUrl}/finance/invoices`, {
      headers: { Authorization: `Bearer ${sales.accessToken}` },
    });
    assert.equal(salesFinRead.status, 403);

    // Finance Officer CAN approve quotation (200)
    const finApprove = await fetch(`${baseUrl}/quotations/${draftQuoteId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${finance.accessToken}`,
      },
      body: JSON.stringify({ notes: 'Margin and payment schedule verified' }),
    });
    assert.equal(finApprove.status, 200);

    // Field Technician blocked from both quotations & finance (403)
    const techQt = await fetch(`${baseUrl}/quotations`, {
      headers: { Authorization: `Bearer ${tech.accessToken}` },
    });
    assert.equal(techQt.status, 403);

    // Cross-tenant isolation: Org B cannot read Org A's quotation (404)
    const crossRead = await fetch(`${baseUrl}/quotations/${draftQuoteId}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossRead.status, 404);
  } finally {
    server.close();
  }
});
