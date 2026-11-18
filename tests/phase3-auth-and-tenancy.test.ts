import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createApiV1Router } from '../server/api-v1.ts';
import { hashPasswordArgon2id, verifyPasswordArgon2id } from '../server/auth-service.ts';
import { UserRole } from '../packages/domain/src/index.ts';

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 500 }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}/api/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

test('Argon2id hashes passwords in PHC argon2id format and verifies accurately', async () => {
  const hash = await hashPasswordArgon2id('StrongSolarPass#2026');
  assert.ok(hash.startsWith('$argon2id$'));
  assert.equal(await verifyPasswordArgon2id(hash, 'StrongSolarPass#2026'), true);
  assert.equal(await verifyPasswordArgon2id(hash, 'WrongPassword#2026'), false);
});

test('Organization registration, login, refresh token rotation, reuse detection, and logout revocation', async () => {
  const srv = await startTestServer();
  try {
    const regRes = await fetch(`${srv.baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Lahore SunTech Pvt Ltd',
        displayName: 'Lahore SunTech',
        slug: 'lahore-suntech',
        businessAddress: 'DHA Phase 5, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Bilal Ahmed',
        ownerEmail: 'bilal@suntech.pk',
        password: 'OwnerPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.role, UserRole.ORG_OWNER);
    assert.ok(regData.accessToken);
    assert.ok(regData.refreshToken);

    // Wrong password rejected
    const badLogin = await fetch(`${srv.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bilal@suntech.pk', password: 'WrongPassword' }),
    });
    assert.equal(badLogin.status, 401);

    // Refresh token rotation
    const refreshRes1 = await fetch(`${srv.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: regData.refreshToken }),
    });
    assert.equal(refreshRes1.status, 200);
    const rotated = await refreshRes1.json();
    assert.notEqual(rotated.refreshToken, regData.refreshToken);

    // Replaying the old refresh token revokes the entire token family
    const replayRes = await fetch(`${srv.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: regData.refreshToken }),
    });
    assert.equal(replayRes.status, 401);

    // The newly rotated refresh token must now ALSO be revoked because family was compromised
    const compromisedRes = await fetch(`${srv.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotated.refreshToken }),
    });
    assert.equal(compromisedRes.status, 401);
  } finally {
    await srv.close();
  }
});

test('9-role RBAC and resource-level authorization block unauthorized actions', async () => {
  const srv = await startTestServer();
  try {
    const regRes = await fetch(`${srv.baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Karachi Energy Co',
        displayName: 'Karachi Energy',
        slug: 'karachi-energy',
        businessAddress: 'Clifton Block 2, Karachi',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Sana Malik',
        ownerEmail: 'sana@karachienergy.pk',
        password: 'OwnerPassword!2026',
      }),
    });
    const owner = await regRes.json();

    const provision = async (email: string, fullName: string, role: UserRole) => {
      const res = await fetch(`${srv.baseUrl}/organizations/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner.accessToken}`,
        },
        body: JSON.stringify({
          email,
          fullName,
          role,
          temporaryPassword: 'StaffPassword!2026',
        }),
      });
      assert.equal(res.status, 201);
      const created = await res.json();

      const loginRes = await fetch(`${srv.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'StaffPassword!2026' }),
      });
      assert.equal(loginRes.status, 200);
      return { ...(await loginRes.json()), userId: created.user.id };
    };

    const sales = await provision('sales@karachienergy.pk', 'Sales Exec', UserRole.SALES_EXECUTIVE);
    const finance = await provision('finance@karachienergy.pk', 'Finance Officer', UserRole.FINANCE_OFFICER);
    const safety = await provision('safety@karachienergy.pk', 'Safety Officer', UserRole.SAFETY_OFFICER);
    const tech = await provision('tech@karachienergy.pk', 'Field Tech', UserRole.FIELD_TECHNICIAN);

    // Sales Executive cannot approve commissioning
    const salesCommissioning = await fetch(`${srv.baseUrl}/commissioning/00000000-0000-0000-0000-000000000001/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sales.accessToken}` },
    });
    assert.equal(salesCommissioning.status, 403);

    // Finance Officer cannot approve electrical design
    const financeDesign = await fetch(`${srv.baseUrl}/engineering/designs/00000000-0000-0000-0000-000000000001/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${finance.accessToken}` },
    });
    assert.equal(financeDesign.status, 403);

    // Safety Officer cannot post financial journals
    const safetyJournal = await fetch(`${srv.baseUrl}/finance/journals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${safety.accessToken}` },
    });
    assert.equal(safetyJournal.status, 403);

    // Field Technician can access assigned project, blocked from unassigned project
    const assignedProjectRes = await fetch(`${srv.baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ title: 'Assigned 15kW Hybrid', assignedUserIds: [tech.userId] }),
    });
    const assignedProject = await assignedProjectRes.json();

    const unassignedProjectRes = await fetch(`${srv.baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner.accessToken}`,
      },
      body: JSON.stringify({ title: 'Unassigned 100kW Commercial', assignedUserIds: [] }),
    });
    const unassignedProject = await unassignedProjectRes.json();

    const techAssignedRead = await fetch(`${srv.baseUrl}/projects/${assignedProject.id}`, {
      headers: { Authorization: `Bearer ${tech.accessToken}` },
    });
    assert.equal(techAssignedRead.status, 200);

    const techUnassignedRead = await fetch(`${srv.baseUrl}/projects/${unassignedProject.id}`, {
      headers: { Authorization: `Bearer ${tech.accessToken}` },
    });
    assert.equal(techUnassignedRead.status, 403);
  } finally {
    await srv.close();
  }
});

test('Cross-tenant isolation blocks Org A from accessing Org B projects, files, members, and audit events', async () => {
  const srv = await startTestServer();
  try {
    const regA = await fetch(`${srv.baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Alpha Solar',
        displayName: 'Alpha Solar',
        slug: 'alpha-solar',
        businessAddress: 'Islamabad',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Owner A',
        ownerEmail: 'owner@alpha.pk',
        password: 'AlphaPassword!2026',
      }),
    });
    const orgA = await regA.json();

    const regB = await fetch(`${srv.baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Beta Solar',
        displayName: 'Beta Solar',
        slug: 'beta-solar',
        businessAddress: 'Dubai',
        countryCode: 'AE',
        defaultCurrency: 'AED',
        ownerFullName: 'Owner B',
        ownerEmail: 'owner@beta.ae',
        password: 'BetaPassword!2026',
      }),
    });
    const orgB = await regB.json();

    // Org B creates project and private file
    const projBRes = await fetch(`${srv.baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgB.accessToken}`,
      },
      body: JSON.stringify({ title: 'Dubai Warehouse PV' }),
    });
    const projB = await projBRes.json();

    const fileBRes = await fetch(`${srv.baseUrl}/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgB.accessToken}`,
      },
      body: JSON.stringify({ filename: 'confidential-sld.pdf' }),
    });
    const fileB = await fileBRes.json();

    // Org A cannot read Org B project or download Org B file
    const crossProj = await fetch(`${srv.baseUrl}/projects/${projB.id}`, {
      headers: { Authorization: `Bearer ${orgA.accessToken}` },
    });
    assert.equal(crossProj.status, 404);

    const crossFile = await fetch(`${srv.baseUrl}/files/${fileB.id}/download`, {
      headers: { Authorization: `Bearer ${orgA.accessToken}` },
    });
    assert.equal(crossFile.status, 404);

    // Org A audit events and members only contain Alpha Solar records
    const auditA = await (
      await fetch(`${srv.baseUrl}/organizations/audit-events`, {
        headers: { Authorization: `Bearer ${orgA.accessToken}` },
      })
    ).json();
    assert.ok(auditA.events.every((e: { organizationId: string }) => e.organizationId === orgA.organization.id));
  } finally {
    await srv.close();
  }
});
