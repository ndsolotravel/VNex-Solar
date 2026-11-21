import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { SUPPORTED_CURRENCIES } from '../packages/domain/src/index.ts';

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

test('Domain & API accept SAR currency plus JazzCash and Easypaisa payment methods', async () => {
  assert.ok(SUPPORTED_CURRENCIES.some((c) => c.code === 'SAR'));

  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Riyadh & Lahore Solar LLC',
        displayName: 'VNex KSA-PK',
        slug: 'vnex-sar-test',
        businessAddress: 'Olaya District, Riyadh / Gulberg, Lahore',
        countryCode: 'SA',
        defaultCurrency: 'SAR',
        ownerFullName: 'Tariq Mahmood',
        ownerEmail: 'tariq@vnex-sar.test',
        password: 'StrongPassword!2026',
        deviceId: 'android-pixel-test',
      }),
    });
    assert.equal(regRes.status, 201);
    const session = await regRes.json();
    assert.equal(session.organization.defaultCurrency, 'SAR');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    };

    const custRes = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ customerType: 'commercial', fullName: 'Al Noor Cold Storage' }),
    });
    assert.equal(custRes.status, 201);
    const customer = await custRes.json();

    const siteRes = await fetch(`${baseUrl}/customers/${customer.id}/sites`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        siteName: 'Main Warehouse',
        addressLine: 'Plot 14 Industrial Estate',
        city: 'Lahore',
        connectionPhase: 'three',
      }),
    });
    assert.equal(siteRes.status, 201);
    const site = await siteRes.json();

    const projRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: customer.id,
        siteId: site.id,
        title: '50kW Commercial Hybrid',
        systemType: 'hybrid',
        targetCapacityKwp: 50,
        currency: 'SAR',
      }),
    });
    assert.equal(projRes.status, 201);
    const project = await projRes.json();
    assert.equal(project.currency, 'SAR');

    const invRes = await fetch(`${baseUrl}/finance/invoices`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        projectId: project.id,
        invoiceType: 'advance',
        dueDate: '2026-12-31',
        currency: 'PKR',
        items: [{ description: 'Advance deposit', quantity: 1, unitPriceMinor: 5_000_000 }],
      }),
    });
    assert.equal(invRes.status, 201);
    const invoice = await invRes.json();

    const issueRes = await fetch(`${baseUrl}/finance/invoices/${invoice.id}/issue`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(issueRes.status, 200);

    const jazzRes = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        idempotencyKey: `jc-${randomUUID()}`,
        customerId: customer.id,
        paymentMethod: 'jazzcash',
        currency: 'PKR',
        amountMinor: 2_000_000,
        referenceNo: 'JC-TID-998811',
        allocations: [{ invoiceId: invoice.id, allocatedMinor: 2_000_000 }],
      }),
    });
    assert.equal(jazzRes.status, 201);
    const jazzPayment = await jazzRes.json();
    assert.equal(jazzPayment.payment.paymentMethod, 'jazzcash');

    const epRes = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        idempotencyKey: `ep-${randomUUID()}`,
        customerId: customer.id,
        paymentMethod: 'easypaisa',
        currency: 'PKR',
        amountMinor: 3_000_000,
        referenceNo: 'EP-TID-445566',
        allocations: [{ invoiceId: invoice.id, allocatedMinor: 3_000_000 }],
      }),
    });
    assert.equal(epRes.status, 201);
    const epPayment = await epRes.json();
    assert.equal(epPayment.payment.paymentMethod, 'easypaisa');
  } finally {
    server.close();
  }
});

test('Android Phase 2 Foundation structural invariants are in place', () => {
  const androidRoot = path.resolve(process.cwd(), 'apps/android/app/src/main');
  const dbModule = fs.readFileSync(
    path.join(androidRoot, 'java/com/vnexsolar/app/core/di/DatabaseModule.kt'),
    'utf8',
  );
  assert.match(dbModule, /provideCachedEquipmentDao/);

  const navGraph = fs.readFileSync(
    path.join(androidRoot, 'java/com/vnexsolar/app/core/navigation/VNexNavGraph.kt'),
    'utf8',
  );
  assert.match(navGraph, /NavigationBar/);
  assert.match(navGraph, /NavigationRail/);
  assert.match(navGraph, /VNexRoute\.Dashboard/);
  assert.match(navGraph, /VNexRoute\.Projects/);
  assert.match(navGraph, /VNexRoute\.Customers/);
  assert.match(navGraph, /VNexRoute\.Finance/);
  assert.match(navGraph, /VNexRoute\.More/);

  const manifest = fs.readFileSync(path.join(androidRoot, 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.USE_BIOMETRIC/);
  assert.match(manifest, /androidx\.core\.content\.FileProvider/);
  assert.match(manifest, /networkSecurityConfig/);

  const sessionVault = fs.readFileSync(
    path.join(androidRoot, 'java/com/vnexsolar/app/core/security/SessionVault.kt'),
    'utf8',
  );
  assert.match(sessionVault, /keystoreManager\.encrypt/);
  assert.match(sessionVault, /keystoreManager\.decrypt/);
});
