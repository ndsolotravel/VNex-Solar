import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { InMemoryAuthTenantService } from '../server/auth-service.ts';
import { computeCanonicalSha256 } from '../server/sync-service.ts';
import {
  DEFAULT_COMMISSIONING_TESTS,
  DEFAULT_PV_CHECKLIST_ITEMS,
  UserRole,
} from '../packages/domain/src/index.ts';

async function startHardenedTestServer(authService?: InMemoryAuthTenantService) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
          error: {
            statusCode: 400,
            code: 'BAD_JSON',
            message: 'Malformed JSON request body',
          },
        });
      }
      return next(err);
    },
  );
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 500, authService }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}/api/v1` };
}

async function registerOrg(baseUrl: string, slug: string, displayName?: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `QA Solar ${slug}`,
      displayName: displayName ?? `QA ${slug}`,
      slug,
      businessAddress: 'Model Town, Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'QaStrongPassword!2026',
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

test('Test 43: Security headers, x-powered-by suppression, strict CORS non-reflection, and malformed JSON handling', async () => {
  const { server, baseUrl } = await startHardenedTestServer();
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil-attacker.example' },
    });
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(
      healthRes.headers.get('content-security-policy'),
      "default-src 'none'; frame-ancestors 'none'",
    );
    // Arbitrary origin must NOT be reflected back
    assert.equal(healthRes.headers.get('access-control-allow-origin'), null);

    // Malformed JSON returns clean 400 BAD_JSON without stack traces
    const badJsonRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken',
    });
    assert.equal(badJsonRes.status, 400);
    const badJson = await badJsonRes.json();
    assert.equal(badJson.error.code, 'BAD_JSON');
    assert.equal(JSON.stringify(badJson).includes('SyntaxError'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 44: Brute-force login lockout, refresh-token reuse revocation, and cross-tenant isolation', async () => {
  const authService = new InMemoryAuthTenantService({
    maxFailedLoginAttempts: 5,
    lockoutDurationMs: 60_000,
  });
  const { server, baseUrl } = await startHardenedTestServer(authService);
  try {
    const orgA = await registerOrg(baseUrl, 'sec-lock-a');
    const orgB = await registerOrg(baseUrl, 'sec-lock-b');
    const orgAAuditor = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'sec-lock-a',
      'auditor@sec-lock-a.pk',
      UserRole.ORG_OWNER,
    );

    // 5 consecutive failed logins trigger 429 ACCOUNT_LOCKED on attempt 6
    for (let i = 0; i < 5; i++) {
      const failRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'owner@sec-lock-a.pk',
          password: `WrongPassword!${i}`,
          organizationSlug: 'sec-lock-a',
        }),
      });
      assert.equal(failRes.status, 401);
    }

    const lockedRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@sec-lock-a.pk',
        password: 'QaStrongPassword!2026',
        organizationSlug: 'sec-lock-a',
      }),
    });
    assert.equal(lockedRes.status, 429);
    const lockedJson = await lockedRes.json();
    assert.equal(lockedJson.error.code, 'ACCOUNT_LOCKED');

    // Separate tenant user remains completely unaffected
    const orgBLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@sec-lock-b.pk',
        password: 'QaStrongPassword!2026',
        organizationSlug: 'sec-lock-b',
      }),
    });
    assert.equal(orgBLogin.status, 200);

    // Refresh token rotation & reuse detection revokes entire token family
    const rotate1 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: orgA.refreshToken }),
    });
    assert.equal(rotate1.status, 200);
    const rotatedPair = await rotate1.json();

    // Reusing old refreshToken triggers 401 TOKEN_REUSE and invalidates rotatedPair + orgA session family
    const reuseRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: orgA.refreshToken }),
    });
    assert.equal(reuseRes.status, 401);
    assert.equal((await reuseRes.json()).error.code, 'TOKEN_REUSE');

    const revokedFollowup = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotatedPair.refreshToken }),
    });
    assert.equal(revokedFollowup.status, 401);

    // Revoked access token from compromised family must be rejected immediately
    const revokedAccessCheck = await fetch(`${baseUrl}/organizations/audit-events`, {
      headers: { Authorization: `Bearer ${orgA.accessToken}` },
    });
    assert.equal(revokedAccessCheck.status, 401);

    // Unaffected Org A Company Manager confirms lock + refresh reuse audit events
    const auditRes = await fetch(`${baseUrl}/organizations/audit-events`, {
      headers: { Authorization: `Bearer ${orgAAuditor.accessToken}` },
    });
    assert.equal(auditRes.status, 200);
    const auditActions = ((await auditRes.json()).events as Array<{ action: string }>).map(
      (e) => e.action,
    );
    assert.ok(auditActions.includes('auth.login_locked'));
    assert.ok(auditActions.includes('auth.refresh_reuse_detected'));

    // Cross-tenant access isolation check on customer created in Org B
    const custB = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${orgB.accessToken}`,
        },
        body: JSON.stringify({ customerType: 'residential', fullName: 'Tenant B Client' }),
      })
    ).json();
    const orgACustList = await (
      await fetch(`${baseUrl}/customers`, {
        headers: { Authorization: `Bearer ${orgAAuditor.accessToken}` },
      })
    ).json();
    assert.equal(
      (orgACustList.customers as Array<{ id: string }>).some((c) => c.id === custB.id),
      false,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 45: OpenAPI 100% route-and-method parity, RLS/schema posture audit, and printable HTML XSS neutralization', async () => {
  const { server, baseUrl } = await startHardenedTestServer();
  try {
    // 1) Dynamic 100% OpenAPI-to-Express route parity check
    const spec = await (await fetch(`${baseUrl}/openapi.json`)).json();
    const apiSrc = fs.readFileSync('server/api-v1.ts', 'utf8');
    const expressRoutes = [
      ...apiSrc.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g),
    ].map((m) => ({ method: m[1].toLowerCase(), path: m[2] }));

    const norm = (p: string) =>
      p.replace(/:[a-zA-Z0-9_]+/g, '{param}').replace(/\{[a-zA-Z0-9_]+\}/g, '{param}');

    const specMap = new Map<string, string[]>(
      Object.keys(spec.paths).map((p) => [norm(p), Object.keys(spec.paths[p])]),
    );

    const missing: string[] = [];
    for (const r of expressRoutes) {
      const methods = specMap.get(norm(r.path));
      if (!methods || !methods.includes(r.method)) {
        missing.push(`${r.method.toUpperCase()} ${r.path}`);
      }
    }
    assert.deepEqual(missing, []);
    const specPathCount = Object.keys(spec.paths).length;
    assert.ok(specPathCount >= 117);

    // 2) Security posture & schema audit check
    const posture = await (await fetch(`${baseUrl}/meta/security-posture`)).json();
    assert.equal(posture.passwordHashing, 'argon2id');
    assert.equal(posture.bruteForceLockoutEnabled, true);
    assert.equal(posture.securityHeadersHardened, true);
    assert.equal(posture.minorUnitCurrencyOnly, true);
    assert.equal(posture.totalTables, 85);
    assert.equal(posture.rlsProtectedTables, 80);
    assert.equal(posture.immutabilityTriggers, 4);
    assert.equal(posture.openApiPathsCount, specPathCount);

    // 3) XSS payload escaping across printable Quotation HTML
    const org = await registerOrg(baseUrl, 'xss-audit', 'Solar <script>alert("xss")</script> EPC');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerType: 'commercial',
          fullName: 'Client <img src=x onerror=alert(1)>',
          billingAddress: '<script>evil()</script> Gulberg',
        }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Roof A',
          addressLine: 'Block C',
          city: 'Lahore',
          countryCode: 'PK',
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
          title: '10kW <svg onload=alert(9)> System',
          systemType: 'hybrid',
          targetCapacityKwp: 10,
          currency: 'PKR',
        }),
      })
    ).json();

    const quote = await (
      await fetch(`${baseUrl}/quotations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          title: 'Proposal <script>alert(2)</script>',
          termsAndConditions: 'Standard <script>stealCookies()</script> Terms',
          items: [
            {
              lineType: 'equipment',
              description: '585W Module <script>alert(3)</script>',
              quantity: 10,
              unitCostMinor: 2500000,
              unitPriceMinor: 3200000,
              taxRateBps: 1800,
            },
          ],
        }),
      })
    ).json();

    const printableRes = await fetch(`${baseUrl}/quotations/${quote.quotation.id}/printable`, {
      headers: { Authorization: `Bearer ${org.accessToken}` },
    });
    assert.equal(printableRes.status, 200);
    const printable = await printableRes.json();
    assert.equal(printable.html.includes('<script>'), false);
    assert.equal(printable.html.includes('<img src=x'), false);
    assert.ok(printable.html.includes('&lt;script&gt;'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 46: Full End-to-End Solar EPC Business Lifecycle Sign-Off & Integer Minor-Unit Audit', async () => {
  const { server, baseUrl } = await startHardenedTestServer();
  try {
    // 1. Register Organization + Provision Multi-Role Team
    const owner = await registerOrg(baseUrl, 'e2e-lifecycle');
    const engineer = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'e2e-lifecycle',
      'engineer@e2e-lifecycle.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safety = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'e2e-lifecycle',
      'safety@e2e-lifecycle.pk',
      UserRole.SAFETY_OFFICER,
    );
    const tech = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'e2e-lifecycle',
      'tech@e2e-lifecycle.pk',
      UserRole.FIELD_TECHNICIAN,
    );

    const ownerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.accessToken}`,
    };
    const engHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${engineer.accessToken}`,
    };
    const safeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safety.accessToken}`,
    };
    const techHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tech.accessToken}`,
    };

    // 2. Customer, Site, Solar Project & Survey
    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          customerType: 'commercial',
          fullName: 'Beacon Textile Mills',
        }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          siteName: 'Spinning Hall A',
          addressLine: 'Kot Lakhpat Industrial Area',
          city: 'Lahore',
          countryCode: 'PK',
          connectionPhase: 'three',
        }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '20kW Hybrid Commercial Array',
          systemType: 'hybrid',
          targetCapacityKwp: 20,
          currency: 'PKR',
          assignedUserIds: [tech.user.id],
        }),
      })
    ).json();

    const survey = await (
      await fetch(`${baseUrl}/surveys`, {
        method: 'POST',
        headers: engHeaders,
        body: JSON.stringify({
          projectId: project.id,
          ambientMinTempC: 4,
          ambientMaxTempC: 45,
          earthingAvailable: true,
          roofSections: [
            {
              id: 'roof-1',
              sectionName: 'Main Concrete Slab',
              roofType: 'rcc',
              usableAreaM2: 180,
              tiltDegrees: 26,
              azimuthDegrees: 180,
              shadingFactorPct: 3,
            },
          ],
          loadProfiles: [
            {
              id: 'load-1',
              applianceName: 'Chiller Compressor',
              quantity: 2,
              ratedPowerW: 3500,
              dailyHours: 8,
              isCriticalBackupLoad: true,
              surgeFactor: 1.5,
            },
          ],
        }),
      })
    ).json();

    const submitSurvey = await fetch(`${baseUrl}/surveys/${survey.id}/submit`, {
      method: 'POST',
      headers: engHeaders,
    });
    assert.equal(submitSurvey.status, 200);

    // 3. Engineering Catalog + Solar Design + Approve
    const catalog = await (
      await fetch(`${baseUrl}/engineering/catalog`, { headers: engHeaders })
    ).json();
    const modSpec = catalog.modules[0];
    const invSpec = catalog.inverters[0];
    const batSpec = catalog.batteries[0];

    const designRes = await fetch(`${baseUrl}/engineering/designs`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({
        projectId: project.id,
        siteSurveyId: survey.id,
        title: '20kW Hybrid String Layout',
        calculationInput: {
          usableRoofAreaM2: 180,
          overrideDailyEnergyKwh: 56,
          ambientMinTempC: 4,
          ambientMaxTempC: 45,
          peakSunHoursPerDay: 5.4,
          tiltDegrees: 26,
          azimuthDegrees: 180,
          module: modSpec,
          inverter: invSpec,
          battery: batSpec,
          modulesInSeries: 12,
          parallelStringsPerMppt: 1,
          activeMpptCount: 2,
          inverterCount: 1,
          batteryUnitsCount: 2,
          autonomyDays: 0.5,
          dcCableOneWayLengthM: 25,
          dcCableCrossSectionMm2: 6,
          acCableOneWayLengthM: 20,
          acCableCrossSectionMm2: 16,
          systemCapexAmount: 4200000,
          gridTariffPerKwh: 55,
          exportTariffPerKwh: 22,
          annualOmCost: 45000,
        },
      }),
    });
    assert.equal(designRes.status, 201);
    const designPayload = await designRes.json();

    assert.equal(
      (
        await fetch(`${baseUrl}/engineering/designs/${designPayload.design.id}/revisions/1/submit`, {
          method: 'POST',
          headers: engHeaders,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/engineering/designs/${designPayload.design.id}/approve`, {
          method: 'POST',
          headers: engHeaders,
          body: JSON.stringify({ reviewNotes: 'Voc & thermal margins verified' }),
        })
      ).status,
      200,
    );

    // 4. Inventory Warehouse, Supplier, Catalog, PO Receive & Issue
    const wh = await (
      await fetch(`${baseUrl}/inventory/warehouses`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ code: 'LHR-01', name: 'Lahore Hub', isDefault: true }),
      })
    ).json();
    const sup = await (
      await fetch(`${baseUrl}/inventory/suppliers`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ name: 'Jinko & Sungrow PK' }),
      })
    ).json();
    const invSku = await (
      await fetch(`${baseUrl}/inventory/catalog`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          sku: 'INV-20K-HYB',
          category: 'inverter',
          manufacturerName: 'Sungrow',
          modelName: 'SH20T',
          unitOfMeasure: 'pcs',
          unitCostMinor: 95000000,
          unitSellPriceMinor: 118000000,
          currency: 'PKR',
          warrantyMonths: 60,
          isSerialized: true,
        }),
      })
    ).json();
    const po = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          supplierId: sup.id,
          warehouseId: wh.id,
          currency: 'PKR',
          items: [{ equipmentCatalogId: invSku.id, quantityOrdered: 1, unitCostMinor: 95000000 }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, {
      method: 'POST',
      headers: ownerHeaders,
    });
    const invSerial = `SH20T-${Math.floor(100000 + Math.random() * 899999)}`;
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        idempotencyKey: `e2e-rcv-${randomUUID()}`,
        equipmentCatalogId: invSku.id,
        quantityReceived: 1,
        serialNumbers: [invSerial],
      }),
    });

    // 5. Commercial Quotation & Integer Minor-Unit Invoice + Payment
    const quoteRes = await fetch(`${baseUrl}/quotations/from-design/${designPayload.design.id}`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({ create: true }),
    });
    assert.equal(quoteRes.status, 201);
    const quoteCreated = await quoteRes.json();
    const qRev = quoteCreated.revisions[0];
    assert.equal(Number.isInteger(qRev.totalAmountMinor), true);
    assert.equal(Number.isInteger(qRev.taxAmountMinor), true);

    assert.equal(
      (
        await fetch(`${baseUrl}/quotations/${quoteCreated.quotation.id}/send`, {
          method: 'POST',
          headers: ownerHeaders,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/quotations/${quoteCreated.quotation.id}/approve`, {
          method: 'POST',
          headers: ownerHeaders,
          body: JSON.stringify({ notes: 'Customer signed PO', customerSignoffName: 'Tariq Mills' }),
        })
      ).status,
      200,
    );

    const invoice = await (
      await fetch(`${baseUrl}/finance/invoices`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          projectId: project.id,
          quotationRevisionId: qRev.id,
          invoiceType: 'advance',
          dueDate: '2026-12-01',
          items: [
            {
              description: '50% Advance Mobilization',
              quantity: 1,
              unitPriceMinor: 200000000,
              taxRateBps: 1800,
            },
          ],
        }),
      })
    ).json();
    assert.equal(invoice.subtotalMinor, 200000000);
    assert.equal(invoice.taxAmountMinor, 36000000);
    assert.equal(invoice.totalAmountMinor, 236000000);

    assert.equal(
      (
        await fetch(`${baseUrl}/finance/invoices/${invoice.id}/issue`, {
          method: 'POST',
          headers: ownerHeaders,
        })
      ).status,
      200,
    );
    const paymentRes = await fetch(`${baseUrl}/finance/payments`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        idempotencyKey: `e2e-pay-${randomUUID()}`,
        customerId: cust.id,
        paymentMethod: 'bank_transfer',
        currency: 'PKR',
        amountMinor: 236000000,
        allocations: [{ invoiceId: invoice.id, allocatedMinor: 236000000 }],
      }),
    });
    assert.equal(paymentRes.status, 201);

    // 6. Installation Job, Issue Serialized Gear, Tasks, Safety Clearance, Completion
    const job = await (
      await fetch(`${baseUrl}/installations`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          projectId: project.id,
          scheduledStartDate: '2026-11-18',
          taskTitles: ['Install inverter & DC SPD'],
          teamAssignments: [
            { userId: tech.user.id, fullName: 'Lead Field Tech', roleOnSite: 'Lead Technician' },
          ],
        }),
      })
    ).json();

    assert.equal(
      (
        await fetch(`${baseUrl}/installations/${job.id}/material-issues`, {
          method: 'POST',
          headers: ownerHeaders,
          body: JSON.stringify({
            idempotencyKey: `e2e-job-iss-${randomUUID()}`,
            warehouseId: wh.id,
            equipmentCatalogId: invSku.id,
            quantity: 1,
            serialNumbers: [invSerial],
          }),
        })
      ).status,
      201,
    );

    // Complete task
    assert.equal(
      (
        await fetch(`${baseUrl}/installations/${job.id}/tasks/${job.tasks[0].id}`, {
          method: 'PATCH',
          headers: techHeaders,
          body: JSON.stringify({ baseRowVersion: 1, status: 'completed' }),
        })
      ).status,
      200,
    );

    // Risk assessment + IEC 62446-1 inspection approval
    const ra = await (
      await fetch(`${baseUrl}/safety/risk-assessments`, {
        method: 'POST',
        headers: safeHeaders,
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          ppeComplianceVerified: true,
          electricalIsolationVerified: true,
          hazardNotes: 'All PPE & LOTO verified',
        }),
      })
    ).json();
    assert.equal(
      (
        await fetch(`${baseUrl}/safety/risk-assessments/${ra.id}/approve`, {
          method: 'POST',
          headers: safeHeaders,
          body: JSON.stringify({ notes: 'Approved' }),
        })
      ).status,
      200,
    );

    const insp = await (
      await fetch(`${baseUrl}/safety/inspections`, {
        method: 'POST',
        headers: safeHeaders,
        body: JSON.stringify({
          installationJobId: job.id,
          items: DEFAULT_PV_CHECKLIST_ITEMS.electrical_isolation.map((i) => ({
            checkCode: i.code,
            description: i.label,
            result: 'pass',
          })),
          testReadings: [
            { parameterName: 'Earth Resistance', measuredValue: 1.2, unit: 'Ohm', withinTolerance: true },
          ],
        }),
      })
    ).json();
    assert.equal(
      (
        await fetch(`${baseUrl}/safety/inspections/${insp.id}/approve`, {
          method: 'POST',
          headers: safeHeaders,
          body: JSON.stringify({ notes: 'IEC 62446-1 passed' }),
        })
      ).status,
      200,
    );

    assert.equal(
      (
        await fetch(`${baseUrl}/installations/${job.id}/complete`, {
          method: 'POST',
          headers: ownerHeaders,
        })
      ).status,
      200,
    );

    // 7. Commissioning, QR Asset Registration, Handover Sign-Off
    const comm = await (
      await fetch(`${baseUrl}/commissioning`, {
        method: 'POST',
        headers: engHeaders,
        body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
      })
    ).json();
    for (const def of DEFAULT_COMMISSIONING_TESTS) {
      assert.equal(
        (
          await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
            method: 'POST',
            headers: engHeaders,
            body: JSON.stringify({
              testName: def.testName,
              measuredValue: 'Pass within IEC limits',
              passed: true,
            }),
          })
        ).status,
        201,
      );
    }
    const commApproved = await (
      await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
        method: 'POST',
        headers: engHeaders,
        body: JSON.stringify({ notes: 'System energized', telemetryProvider: 'Sungrow iSolarCloud' }),
      })
    ).json();
    assert.equal(commApproved.status, 'approved');
    assert.equal(commApproved.generatedAssets.length, 1);
    const asset = commApproved.generatedAssets[0];

    const ackRes = await fetch(
      `${baseUrl}/commissioning/${comm.id}/handovers/${commApproved.handoverDocuments[0].id}/acknowledge`,
      {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ signoffName: 'Plant Manager Tariq' }),
      },
    );
    assert.equal(ackRes.status, 200);

    // 8. QR Asset Maintenance & Warranty + Offline Sync Batch Verification
    const qrBundle = await (
      await fetch(`${baseUrl}/assets/qr/${asset.qrCodeToken}`, { headers: techHeaders })
    ).json();
    assert.equal(qrBundle.warrantyActive, true);

    const syncPayload = { fullName: 'E2E Offline Sync Customer' };
    const syncBatch = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers: techHeaders,
        body: JSON.stringify({
          deviceId: 'e2e-android-01',
          operations: [
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `e2e-sync-${randomUUID()}`,
              entityType: 'customer',
              entityId: randomUUID(),
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: computeCanonicalSha256(syncPayload),
              payload: syncPayload,
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      })
    ).json();
    assert.equal(syncBatch.results[0].status, 'applied');

    const metrics = await (
      await fetch(`${baseUrl}/sync/metrics`, { headers: ownerHeaders })
    ).json();
    assert.equal(metrics.appliedOpsCount, 1);

    const finSummary = await (
      await fetch(`${baseUrl}/finance/summary`, { headers: ownerHeaders })
    ).json();
    assert.equal(finSummary.totalInvoicedMinor, 236000000);
    assert.equal(finSummary.totalCollectedMinor, 236000000);
    assert.equal(finSummary.accountsReceivableMinor, 0);
    assert.equal(finSummary.postedJournalCount, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
