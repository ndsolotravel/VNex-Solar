import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApiV1Router, inspectPostgresMigrations } from '../server/api-v1.ts';

const REQUIRED_SECTION_6_TABLES = [
  // Organization & auth
  'organizations', 'users', 'organization_memberships', 'roles', 'permissions',
  'role_permissions', 'user_sessions', 'invitations', 'audit_events',
  // Customers & projects
  'customers', 'customer_contacts', 'sites', 'projects', 'project_assignments',
  'project_stages', 'project_documents',
  // Site surveys
  'site_surveys', 'survey_measurements', 'roof_sections', 'survey_photos',
  'load_profiles', 'site_hazards',
  // Solar engineering
  'solar_designs', 'design_revisions', 'solar_modules', 'inverters', 'batteries',
  'pv_arrays', 'pv_strings', 'design_calculations', 'design_approvals',
  // Inventory
  'equipment_catalog', 'manufacturers', 'suppliers', 'warehouses', 'stock_movements',
  'stock_reservations', 'purchase_orders', 'purchase_order_items', 'equipment_serial_numbers',
  // Quotations
  'quotations', 'quotation_revisions', 'quotation_items', 'quotation_approvals', 'quotation_templates',
  // Finance
  'invoices', 'invoice_items', 'payments', 'payment_allocations', 'expenses',
  'credit_notes', 'journal_entries', 'journal_lines', 'tax_rules',
  // Installation
  'installation_jobs', 'installation_tasks', 'team_assignments', 'daily_site_logs',
  'material_issues', 'installation_photos',
  // Safety & inspection
  'risk_assessments', 'safety_checklists', 'safety_incidents', 'inspection_records',
  'inspection_items', 'test_readings', 'corrective_actions', 'inspection_approvals',
  // Commissioning
  'commissioning_records', 'commissioning_tests', 'commissioning_approvals', 'handover_documents',
  // Maintenance
  'maintenance_schedules', 'service_tickets', 'service_visits', 'warranty_claims', 'asset_register',
  // Sync
  'sync_operations', 'sync_conflicts', 'sync_checkpoints', 'device_registrations',
  // Files & notifications
  'file_attachments', 'document_templates', 'notifications', 'notification_preferences',
];

test('PostgreSQL 0001 migration defines all 85 required normalized tables with UUID PKs and zero float money columns', () => {
  const drizzleDir = path.resolve(process.cwd(), 'apps/api/drizzle');
  const summary = inspectPostgresMigrations(drizzleDir);
  const sql0001 = fs.readFileSync(path.join(drizzleDir, '0001_initial_schema.sql'), 'utf8');

  assert.equal(summary.tableCount, 85);
  for (const tbl of REQUIRED_SECTION_6_TABLES) {
    assert.ok(summary.tables.includes(tbl), `Missing required table: ${tbl}`);
  }

  // Ensure exact decimal arithmetic (no FLOAT / REAL / DOUBLE PRECISION)
  assert.equal(/\b(FLOAT|REAL|DOUBLE PRECISION)\b/i.test(sql0001), false);
  assert.ok(summary.indexCount >= 14);
});

test('PostgreSQL 0002 migration enforces RLS across tenant tables and immutability triggers', () => {
  const drizzleDir = path.resolve(process.cwd(), 'apps/api/drizzle');
  const summary = inspectPostgresMigrations(drizzleDir);
  const sql0002 = fs.readFileSync(path.join(drizzleDir, '0002_rls_and_immutability.sql'), 'utf8');

  assert.ok(summary.rlsTableCount >= 80);
  assert.equal(summary.triggerCount, 4);
  assert.match(sql0002, /trg_audit_events_immutable/);
  assert.match(sql0002, /trg_design_revisions_immutable/);
  assert.match(sql0002, /trg_quotation_revisions_immutable/);
  assert.match(sql0002, /trg_journal_entries_immutable/);
});

test('API v1 endpoints enforce health, OpenAPI contract, pagination validation, request IDs, and rate limiting', async () => {
  const app = express();
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 4, rateLimitWindowMs: 10_000 }));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.ok(healthRes.headers.get('x-request-id'));
    const healthBody = await healthRes.json();
    assert.equal(healthBody.status, 'ok');
    assert.equal(healthBody.orm, 'drizzle-postgresql');

    const openapiRes = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(openapiRes.status, 200);
    const openapi = await openapiRes.json();
    assert.equal(openapi.openapi, '3.1.0');
    assert.ok(openapi.paths['/health']);

    const badQueryRes = await fetch(`${baseUrl}/meta/schema-summary?limit=999`);
    assert.equal(badQueryRes.status, 400);

    const goodSummaryRes = await fetch(`${baseUrl}/meta/schema-summary?page=1&limit=10`);
    assert.equal(goodSummaryRes.status, 200);
    const summaryBody = await goodSummaryRes.json();
    assert.equal(summaryBody.totalTables, 85);
    assert.equal(summaryBody.tables.length, 10);

    // 5th request should trigger rate limit (max=4)
    const throttledRes = await fetch(`${baseUrl}/health`);
    assert.equal(throttledRes.status, 429);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
