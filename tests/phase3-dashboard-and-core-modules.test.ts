import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { UserRole } from '../packages/domain/src/index.ts';

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

test('Dashboard summary aggregates real operational, sales, receivables, revenue, expenses, and 6-month series with RBAC scoping', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Indus Sun EPC Pvt Ltd',
        displayName: 'Indus Sun EPC',
        slug: 'indus-sun-dash',
        businessAddress: 'DHA Phase 6, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Bilal Khan',
        ownerEmail: 'bilal@indussun.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const ownerSession = await regRes.json();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerSession.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'commercial', fullName: 'Faisal Spinning Mills' }),
      })
    ).json();

    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Weaving Roof B',
          addressLine: 'Sheikhupura Road',
          city: 'Faisalabad',
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
          title: '20kW Commercial Hybrid',
          systemType: 'hybrid',
          targetCapacityKwp: 20,
          currency: 'PKR',
        }),
      })
    ).json();

    // Draft survey -> contributes to upcomingSiteVisits
    const surveyRes = await fetch(`${baseUrl}/surveys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        notes: 'Roof access clear',
      }),
    });
    assert.equal(surveyRes.status, 201);

    // Draft quotation -> contributes to pendingQuotations
    const qtRes = await fetch(`${baseUrl}/quotations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        title: '20kW Turnkey Proposal',
        items: [
          {
            lineType: 'equipment',
            description: '580W Bifacial Panels',
            quantity: 34,
            unitCostMinor: 2150000,
            unitPriceMinor: 2550000,
            taxRateBps: 0,
          },
        ],
      }),
    });
    assert.equal(qtRes.status, 201);

    // Issue invoice & record partial JazzCash payment
    const inv = await (
      await fetch(`${baseUrl}/finance/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          invoiceType: 'advance',
          dueDate: '2026-12-30',
          currency: 'PKR',
          items: [{ description: 'Milestone 1', quantity: 1, unitPriceMinor: 10_000_000 }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/finance/invoices/${inv.id}/issue`, { method: 'POST', headers });

    await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: `dash-pay-${randomUUID()}`,
        customerId: cust.id,
        paymentMethod: 'jazzcash',
        currency: 'PKR',
        amountMinor: 4_000_000,
        allocations: [{ invoiceId: inv.id, allocatedMinor: 4_000_000 }],
      }),
    });

    // Fetch Dashboard summary
    const dashRes = await fetch(`${baseUrl}/dashboard/summary?range=30d`, { headers });
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();

    assert.equal(dash.currency, 'PKR');
    assert.equal(dash.financialAccess, true);
    assert.equal(dash.kpis.totalProjects, 1);
    assert.equal(dash.kpis.pendingQuotations, 1);
    assert.equal(dash.kpis.upcomingSiteVisits, 1);
    assert.equal(dash.kpis.totalSalesMinor, 10_000_000);
    assert.equal(dash.kpis.monthlyRevenueMinor, 4_000_000);
    assert.equal(dash.kpis.outstandingPaymentsMinor, 6_000_000);
    assert.equal(dash.monthlySeries.length, 6);

    // Provision Field Technician & ensure financial figures are redacted
    await fetch(`${baseUrl}/organizations/members`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: 'tech@indussun.pk',
        fullName: 'Field Tech',
        role: UserRole.FIELD_TECHNICIAN,
        temporaryPassword: 'TechPassword!2026',
      }),
    });
    const techLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'tech@indussun.pk',
          password: 'TechPassword!2026',
          organizationSlug: 'indus-sun-dash',
        }),
      })
    ).json();

    const techDashRes = await fetch(`${baseUrl}/dashboard/summary?range=all`, {
      headers: { Authorization: `Bearer ${techLogin.accessToken}` },
    });
    assert.equal(techDashRes.status, 200);
    const techDash = await techDashRes.json();
    assert.equal(techDash.financialAccess, false);
    assert.equal(techDash.kpis.totalSalesMinor, 0);
    assert.equal(techDash.kpis.monthlyRevenueMinor, 0);
  } finally {
    server.close();
  }
});

test('Android Room v2 migration and Phase 3 Dashboard/Projects/Customers modules are intact', () => {
  const javaRoot = path.resolve(process.cwd(), 'apps/android/app/src/main/java/com/vnexsolar/app');
  const dbSource = fs.readFileSync(path.join(javaRoot, 'core/database/VNexDatabase.kt'), 'utf8');
  assert.match(dbSource, /version = [2-9]/);
  assert.match(dbSource, /ProjectEntity::class/);
  assert.match(dbSource, /SiteEntity::class/);
  assert.match(dbSource, /DashboardSnapshotEntity::class/);

  const dbModule = fs.readFileSync(path.join(javaRoot, 'core/di/DatabaseModule.kt'), 'utf8');
  assert.match(dbModule, /MIGRATION_1_2/);
  assert.match(dbModule, /addMigrations\(MIGRATION_1_2/);

  assert.ok(fs.existsSync(path.join(javaRoot, 'feature/dashboard/DashboardViewModel.kt')));
  assert.ok(fs.existsSync(path.join(javaRoot, 'feature/projects/ProjectsScreen.kt')));
  assert.ok(fs.existsSync(path.join(javaRoot, 'feature/customers/CustomersScreen.kt')));
  assert.ok(fs.existsSync(path.join(javaRoot, 'feature/employees/EmployeesScreen.kt')));
});
