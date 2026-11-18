import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createApiV1Router } from '../server/api-v1.ts';
import {
  UserRole,
  majorToMinor,
  minorToMajor,
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
      legalName: `Inventory Corp ${slug}`,
      displayName: `Inventory ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'InventoryPass!2026',
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
  const inviteRes = await fetch(`${baseUrl}/organizations/members`, {
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
  assert.equal(inviteRes.status, 201);

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      organizationSlug: slug,
    }),
  });
  assert.equal(loginRes.status, 200);
  return loginRes.json();
}

async function createSampleProject(baseUrl: string, token: string) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const custRes = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerType: 'commercial',
      fullName: 'Crescent Mills Solar Project',
    }),
  });
  assert.equal(custRes.status, 201);
  const cust = await custRes.json();

  const siteRes = await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      siteName: 'Roof Block A',
      addressLine: 'Plot 19, Industrial Zone',
      city: 'Lahore',
      connectionPhase: 'three',
    }),
  });
  assert.equal(siteRes.status, 201);
  const site = await siteRes.json();

  const projRes = await fetch(`${baseUrl}/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: cust.id,
      siteId: site.id,
      title: '12 kWp Commercial Hybrid Installation',
      systemType: 'hybrid',
      targetCapacityKwp: 12,
      currency: 'PKR',
    }),
  });
  assert.equal(projRes.status, 201);
  return projRes.json();
}

test('Phase 7 Test 21: PO draft -> issued -> partially_received -> received, minor-unit totals & unique serials', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const auth = await registerOrg(baseUrl, 'inv-po-flow');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
    };

    const [whRes, supRes, catRes] = await Promise.all([
      fetch(`${baseUrl}/inventory/warehouses`, { headers }),
      fetch(`${baseUrl}/inventory/suppliers`, { headers }),
      fetch(`${baseUrl}/inventory/catalog`, { headers }),
    ]);
    assert.equal(whRes.status, 200);
    const { warehouses } = await whRes.json();
    const { suppliers } = await supRes.json();
    const { items } = await catRes.json();

    const invItem = items.find((i: { sku: string }) => i.sku === 'INV-NITROX-12K3P');
    assert.ok(invItem);
    assert.equal(majorToMinor(495000), 49500000);
    assert.equal(minorToMajor(49500000), 495000);

    // Create PO for 4 inverters at 495,000.00 PKR (49,500,000 minor units)
    const poRes = await fetch(`${baseUrl}/inventory/purchase-orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: suppliers[0].id,
        warehouseId: warehouses[0].id,
        currency: 'PKR',
        items: [
          {
            equipmentCatalogId: invItem.id,
            quantityOrdered: 4,
            unitCostMinor: 49500000,
          },
        ],
      }),
    });
    assert.equal(poRes.status, 201);
    const po = await poRes.json();
    assert.equal(po.status, 'draft');
    assert.equal(po.totalAmountMinor, 198000000);

    // Receiving before issuing must fail (409)
    const prematureRes = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'premature-grn-1',
        equipmentCatalogId: invItem.id,
        quantityReceived: 1,
      }),
    });
    assert.equal(prematureRes.status, 409);

    // Issue PO
    const issueRes = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, {
      method: 'POST',
      headers,
    });
    assert.equal(issueRes.status, 200);
    const issuedPo = await issueRes.json();
    assert.equal(issuedPo.status, 'issued');

    // Partial receive (2 of 4) with serial numbers
    const grn1Res = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-batch-1',
        equipmentCatalogId: invItem.id,
        quantityReceived: 2,
        serialNumbers: ['ntx-2026-001', 'ntx-2026-002'],
      }),
    });
    assert.equal(grn1Res.status, 201);
    const grn1 = await grn1Res.json();
    assert.equal(grn1.deduplicated, false);
    assert.equal(grn1.purchaseOrder.status, 'partially_received');
    assert.equal(grn1.serials.length, 2);
    assert.equal(grn1.serials[0].serialNumber, 'NTX-2026-001');

    // Duplicate serial number inside same org must fail with 409 DUPLICATE_SERIAL
    const dupSerialRes = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-batch-dup-serial',
        equipmentCatalogId: invItem.id,
        quantityReceived: 1,
        serialNumbers: ['NTX-2026-001'],
      }),
    });
    assert.equal(dupSerialRes.status, 409);
    const dupBody = await dupSerialRes.json();
    assert.equal(dupBody.error.code, 'DUPLICATE_SERIAL');

    // Final partial receive (remaining 2) -> status transitions to received
    const grn2Res = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-batch-2',
        equipmentCatalogId: invItem.id,
        quantityReceived: 2,
        serialNumbers: ['NTX-2026-003', 'NTX-2026-004'],
      }),
    });
    assert.equal(grn2Res.status, 201);
    const grn2 = await grn2Res.json();
    assert.equal(grn2.purchaseOrder.status, 'received');

    // Check balances -> onHandQty=4, availableQty=4, reorderLevel=3 -> isLowStock=false
    const balRes = await fetch(`${baseUrl}/inventory/balances`, { headers });
    const balData = await balRes.json();
    const invBalance = balData.balances.find(
      (b: { equipmentCatalogId: string }) => b.equipmentCatalogId === invItem.id,
    );
    assert.equal(invBalance.onHandQty, 4);
    assert.equal(invBalance.availableQty, 4);
    assert.equal(invBalance.isLowStock, false);
  } finally {
    server.close();
  }
});

test('Phase 7 Test 22: Idempotent movement replay & over-allocation/negative-stock protection', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const auth = await registerOrg(baseUrl, 'inv-idempotent');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
    };

    const project = await createSampleProject(baseUrl, auth.accessToken);
    const { warehouses } = await (await fetch(`${baseUrl}/inventory/warehouses`, { headers })).json();
    const { suppliers } = await (await fetch(`${baseUrl}/inventory/suppliers`, { headers })).json();
    const { items } = await (await fetch(`${baseUrl}/inventory/catalog`, { headers })).json();
    const cable = items.find((i: { sku: string }) => i.sku === 'CAB-DC-6MM-BLK');
    assert.ok(cable);

    // Order & receive 150 meters of DC cable
    const po = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId: suppliers[0].id,
          warehouseId: warehouses[0].id,
          currency: 'PKR',
          items: [{ equipmentCatalogId: cable.id, quantityOrdered: 150, unitCostMinor: 38000 }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, { method: 'POST', headers });

    const grnRes1 = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-cable-150',
        equipmentCatalogId: cable.id,
        quantityReceived: 150,
      }),
    });
    assert.equal(grnRes1.status, 201);
    assert.equal((await grnRes1.json()).deduplicated, false);

    // Replay same GRN idempotencyKey -> deduplicated: true, no double receipt
    const grnRes2 = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-cable-150',
        equipmentCatalogId: cable.id,
        quantityReceived: 150,
      }),
    });
    assert.equal(grnRes2.status, 201);
    assert.equal((await grnRes2.json()).deduplicated, true);

    // Reserve 100m idempotently (replay test)
    const resv1 = await fetch(`${baseUrl}/inventory/reservations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'resv-cable-100',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: cable.id,
        quantity: 100,
      }),
    });
    assert.equal(resv1.status, 201);
    const r1Body = await resv1.json();
    assert.equal(r1Body.deduplicated, false);

    const resv2 = await fetch(`${baseUrl}/inventory/reservations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'resv-cable-100',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: cable.id,
        quantity: 100,
      }),
    });
    assert.equal(resv2.status, 201);
    assert.equal((await resv2.json()).deduplicated, true);

    // Trying to reserve another 60m (when available is 50m) must fail 409 INSUFFICIENT_STOCK
    const overResv = await fetch(`${baseUrl}/inventory/reservations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'resv-cable-over',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: cable.id,
        quantity: 60,
      }),
    });
    assert.equal(overResv.status, 409);
    assert.equal((await overResv.json()).error.code, 'INSUFFICIENT_STOCK');

    // Issue 60m against the reservation idempotently (replay safe)
    const issue1 = await fetch(`${baseUrl}/inventory/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'issue-cable-60',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: cable.id,
        quantity: 60,
        reservationId: r1Body.reservation.id,
      }),
    });
    assert.equal(issue1.status, 201);
    assert.equal((await issue1.json()).deduplicated, false);

    const issue2 = await fetch(`${baseUrl}/inventory/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'issue-cable-60',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: cable.id,
        quantity: 60,
        reservationId: r1Body.reservation.id,
      }),
    });
    assert.equal(issue2.status, 201);
    assert.equal((await issue2.json()).deduplicated, true);

    // Balance check: onHand = 150 - 60 = 90, remaining reserved = 40, available = 50 -> <= reorderLevel (100) => low stock!
    const balData = await (await fetch(`${baseUrl}/inventory/balances`, { headers })).json();
    const cableBal = balData.balances.find(
      (b: { equipmentCatalogId: string }) => b.equipmentCatalogId === cable.id,
    );
    assert.equal(cableBal.onHandQty, 90);
    assert.equal(cableBal.reservedQty, 40);
    assert.equal(cableBal.availableQty, 50);
    assert.equal(cableBal.isLowStock, true);
  } finally {
    server.close();
  }
});

test('Phase 7 Test 23: Serialized issue -> installed -> return_to_stock -> damaged_writeoff lifecycle', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const auth = await registerOrg(baseUrl, 'inv-serial-lifecycle');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
    };
    const project = await createSampleProject(baseUrl, auth.accessToken);
    const { warehouses } = await (await fetch(`${baseUrl}/inventory/warehouses`, { headers })).json();
    const { suppliers } = await (await fetch(`${baseUrl}/inventory/suppliers`, { headers })).json();
    const { items } = await (await fetch(`${baseUrl}/inventory/catalog`, { headers })).json();
    const bat = items.find((i: { sku: string }) => i.sku === 'BAT-PYLON-US5000');
    assert.ok(bat);

    const po = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId: suppliers[0].id,
          warehouseId: warehouses[0].id,
          currency: 'PKR',
          items: [{ equipmentCatalogId: bat.id, quantityOrdered: 2, unitCostMinor: 26500000 }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, { method: 'POST', headers });
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'grn-bat-2',
        equipmentCatalogId: bat.id,
        quantityReceived: 2,
        serialNumbers: ['PYL-5000-A', 'PYL-5000-B'],
      }),
    });

    // Issue 2 batteries with serial numbers -> status = installed
    const issueRes = await fetch(`${baseUrl}/inventory/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'issue-bat-2',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: bat.id,
        quantity: 2,
        serialNumbers: ['PYL-5000-A', 'PYL-5000-B'],
      }),
    });
    assert.equal(issueRes.status, 201);
    const issueBody = await issueRes.json();
    assert.equal(issueBody.serials[0].status, 'installed');
    assert.equal(issueBody.serials[0].projectId, project.id);

    // Return 1 unused battery (PYL-5000-B) -> status = in_stock
    const retRes = await fetch(`${baseUrl}/inventory/returns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'ret-bat-1',
        projectId: project.id,
        warehouseId: warehouses[0].id,
        equipmentCatalogId: bat.id,
        quantity: 1,
        serialNumbers: ['PYL-5000-B'],
      }),
    });
    assert.equal(retRes.status, 201);
    const retBody = await retRes.json();
    assert.equal(retBody.serials[0].status, 'in_stock');
    assert.equal(retBody.serials[0].warehouseId, warehouses[0].id);

    // Write off returned damaged unit PYL-5000-B -> status = damaged
    const woRes = await fetch(`${baseUrl}/inventory/write-offs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'wo-bat-1',
        warehouseId: warehouses[0].id,
        equipmentCatalogId: bat.id,
        quantity: 1,
        serialNumbers: ['PYL-5000-B'],
        reason: 'Forklift enclosure impact during site unload',
      }),
    });
    assert.equal(woRes.status, 201);
    assert.equal((await woRes.json()).serials[0].status, 'damaged');

    // Filter serials by status
    const damagedRes = await fetch(`${baseUrl}/inventory/serials?status=damaged`, { headers });
    const damagedData = await damagedRes.json();
    assert.equal(damagedData.serials.length, 1);
    assert.equal(damagedData.serials[0].serialNumber, 'PYL-5000-B');
  } finally {
    server.close();
  }
});

test('Phase 7 Test 24: Inventory RBAC enforcement & strict cross-tenant isolation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'inv-tenant-a');
    const orgB = await registerOrg(baseUrl, 'inv-tenant-b');

    const financeUser = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'inv-tenant-a',
      'finance@inv-tenant-a.pk',
      UserRole.FINANCE_OFFICER,
    );
    const techUser = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'inv-tenant-a',
      'tech@inv-tenant-a.pk',
      UserRole.FIELD_TECHNICIAN,
    );
    const supervisorUser = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'inv-tenant-a',
      'sup@inv-tenant-a.pk',
      UserRole.INSTALLATION_SUPERVISOR,
    );

    // Finance Officer has inventory:read (200) but NOT inventory:transact (403)
    const finRead = await fetch(`${baseUrl}/inventory/balances`, {
      headers: { Authorization: `Bearer ${financeUser.accessToken}` },
    });
    assert.equal(finRead.status, 200);

    const finWrite = await fetch(`${baseUrl}/inventory/warehouses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${financeUser.accessToken}`,
      },
      body: JSON.stringify({ code: 'WH-FIN', name: 'Blocked Warehouse' }),
    });
    assert.equal(finWrite.status, 403);

    // Field Technician lacks both inventory:read and inventory:transact -> 403
    const techRead = await fetch(`${baseUrl}/inventory/balances`, {
      headers: { Authorization: `Bearer ${techUser.accessToken}` },
    });
    assert.equal(techRead.status, 403);

    // Installation Supervisor has inventory:transact -> 201
    const supCreateWh = await fetch(`${baseUrl}/inventory/warehouses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorUser.accessToken}`,
      },
      body: JSON.stringify({ code: 'WH-SITE-2', name: 'Islamabad Staging Hub' }),
    });
    assert.equal(supCreateWh.status, 201);

    // Cross-tenant isolation: Org A PO cannot be issued by Org B (404)
    const orgAHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgA.accessToken}`,
    };
    const { warehouses: whA } = await (await fetch(`${baseUrl}/inventory/warehouses`, { headers: orgAHeaders })).json();
    const { suppliers: supA } = await (await fetch(`${baseUrl}/inventory/suppliers`, { headers: orgAHeaders })).json();
    const { items: catA } = await (await fetch(`${baseUrl}/inventory/catalog`, { headers: orgAHeaders })).json();

    const poA = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers: orgAHeaders,
        body: JSON.stringify({
          supplierId: supA[0].id,
          warehouseId: whA[0].id,
          currency: 'PKR',
          items: [{ equipmentCatalogId: catA[0].id, quantityOrdered: 5, unitCostMinor: 2150000 }],
        }),
      })
    ).json();

    const crossTenantIssue = await fetch(`${baseUrl}/inventory/purchase-orders/${poA.id}/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossTenantIssue.status, 404);
  } finally {
    server.close();
  }
});
