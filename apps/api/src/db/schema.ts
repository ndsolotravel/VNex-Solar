import {
  boolean,
  char,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  legalName: varchar('legal_name', { length: 200 }).notNull(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  businessAddress: text('business_address').notNull(),
  countryCode: char('country_code', { length: 2 }).notNull().default('PK'),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('PKR'),
  taxRegistrationNumber: varchar('tax_registration_number', { length: 100 }),
  taxConfigJson: jsonb('tax_config_json').notNull().default({}),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMemberships = pgTable('organization_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  tokenFamilyId: uuid('token_family_id').notNull(),
  refreshTokenHash: char('refresh_token_hash', { length: 64 }).notNull().unique(),
  deviceId: varchar('device_id', { length: 128 }),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: uuid('entity_id'),
  requestId: varchar('request_id', { length: 64 }),
  ipAddress: inet('ip_address'),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customerCode: varchar('customer_code', { length: 64 }).notNull(),
  customerType: varchar('customer_type', { length: 32 }).notNull().default('residential'),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  companyName: varchar('company_name', { length: 200 }),
  primaryPhone: varchar('primary_phone', { length: 40 }),
  email: varchar('email', { length: 255 }),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  siteId: uuid('site_id').notNull(),
  projectCode: varchar('project_code', { length: 64 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  systemType: varchar('system_type', { length: 32 }).notNull(),
  targetCapacityKwp: numeric('target_capacity_kwp', { precision: 12, scale: 4 }),
  currentStage: varchar('current_stage', { length: 48 }).notNull().default('lead'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  currency: char('currency', { length: 3 }).notNull().default('PKR'),
  rowVersion: integer('row_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
