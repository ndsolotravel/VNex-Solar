import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLE_DEFINITIONS,
  SUPPORTED_CURRENCIES,
  UserRole,
  VNEX_DARK_TOKENS,
  VNEX_LIGHT_TOKENS,
  VNEX_NAVIGATION,
  hasPermission,
} from '../index.ts';

test('all 9 VNex Solar roles are defined with least-privilege separation', () => {
  const roles = Object.values(UserRole);
  assert.equal(roles.length, 9);

  // Sales Executive can create quotations but cannot approve commissioning
  assert.equal(hasPermission(UserRole.SALES_EXECUTIVE, 'quotations:write'), true);
  assert.equal(hasPermission(UserRole.SALES_EXECUTIVE, 'commissioning:approve'), false);

  // Finance Officer can post financial records but cannot approve electrical engineering
  assert.equal(hasPermission(UserRole.FINANCE_OFFICER, 'finance:post'), true);
  assert.equal(hasPermission(UserRole.FINANCE_OFFICER, 'engineering:approve'), false);

  // Safety Officer can approve safety records but cannot post financial journals
  assert.equal(hasPermission(UserRole.SAFETY_OFFICER, 'safety:approve'), true);
  assert.equal(hasPermission(UserRole.SAFETY_OFFICER, 'finance:post'), false);

  // Field Technician can update assigned installation tasks but cannot manage org settings
  assert.equal(hasPermission(UserRole.FIELD_TECHNICIAN, 'installation:update_assigned'), true);
  assert.equal(hasPermission(UserRole.FIELD_TECHNICIAN, 'org:manage'), false);
});

test('navigation taxonomy covers all core modules and marks server-authoritative vs offline modules', () => {
  assert.ok(VNEX_NAVIGATION.length >= 13);
  const finance = VNEX_NAVIGATION.find((n) => n.id === 'finance');
  const surveys = VNEX_NAVIGATION.find((n) => n.id === 'surveys');
  assert.equal(finance?.offlineSupported, false);
  assert.equal(surveys?.offlineSupported, true);
});

test('design tokens and currencies include PKR and international options', () => {
  assert.equal(VNEX_LIGHT_TOKENS.mode, 'light');
  assert.equal(VNEX_DARK_TOKENS.mode, 'dark');
  const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
  assert.ok(codes.includes('PKR'));
  assert.ok(codes.includes('USD'));
  assert.ok(codes.includes('AED'));
  assert.equal(ROLE_DEFINITIONS[UserRole.ORG_OWNER].permissions.length > 20, true);
});
