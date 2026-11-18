-- VNex Solar | Phase 2 Initial Normalized PostgreSQL Schema (85 Tables)
-- Target Engine: Self-Hosted PostgreSQL 16+
-- Standards: UUID primary keys, organization_id tenant scoping, exact NUMERIC decimals, row_version concurrency

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. ORGANIZATION AND AUTHENTICATION
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  legal_name VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  logo_file_id UUID,
  business_address TEXT NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'PK',
  default_currency CHAR(3) NOT NULL DEFAULT 'PKR',
  tax_registration_number VARCHAR(100),
  tax_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  module VARCHAR(64) NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_family_id UUID NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  device_id VARCHAR(128),
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id UUID REFERENCES user_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by_user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  request_id VARCHAR(64),
  ip_address INET,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13 (EARLY REFERENCES). FILES AND DOCUMENT TEMPLATES
-- ============================================================================

CREATE TABLE file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id),
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  storage_bucket VARCHAR(120) NOT NULL,
  storage_key TEXT NOT NULL,
  thumbnail_key TEXT,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  sha256_checksum CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, storage_key)
);

CREATE TABLE document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_type VARCHAR(64) NOT NULL CHECK (template_type IN ('quotation', 'invoice', 'commissioning_cert', 'handover', 'safety_report')),
  name VARCHAR(160) NOT NULL,
  body_template TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'push')),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, user_id, event_type)
);

-- ============================================================================
-- 2. CUSTOMERS AND PROJECTS
-- ============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_code VARCHAR(64) NOT NULL,
  customer_type VARCHAR(32) NOT NULL DEFAULT 'residential' CHECK (customer_type IN ('residential', 'commercial', 'industrial', 'agricultural')),
  full_name VARCHAR(200) NOT NULL,
  company_name VARCHAR(200),
  primary_phone VARCHAR(40),
  email VARCHAR(255),
  tax_id VARCHAR(80),
  billing_address TEXT,
  notes TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, customer_code)
);

CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name VARCHAR(160) NOT NULL,
  role_title VARCHAR(100),
  phone VARCHAR(40),
  email VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  site_name VARCHAR(180) NOT NULL,
  address_line TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  province_state VARCHAR(100),
  country_code CHAR(2) NOT NULL DEFAULT 'PK',
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  utility_provider VARCHAR(120),
  meter_reference VARCHAR(120),
  connection_phase VARCHAR(16) CHECK (connection_phase IN ('single', 'three')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  project_code VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  system_type VARCHAR(32) NOT NULL CHECK (system_type IN ('on_grid', 'hybrid', 'off_grid')),
  target_capacity_kwp NUMERIC(12,4),
  current_stage VARCHAR(48) NOT NULL DEFAULT 'lead',
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, project_code)
);

CREATE TABLE project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_role VARCHAR(64) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, project_id, user_id, assignment_role)
);

CREATE TABLE project_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name VARCHAR(64) NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  changed_by_user_id UUID REFERENCES users(id)
);

CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_attachment_id UUID NOT NULL REFERENCES file_attachments(id) ON DELETE CASCADE,
  document_category VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. SITE SURVEYS
-- ============================================================================

CREATE TABLE site_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id),
  surveyor_user_id UUID NOT NULL REFERENCES users(id),
  survey_status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (survey_status IN ('draft', 'submitted', 'reviewed', 'approved')),
  surveyed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ambient_min_temp_c NUMERIC(6,2),
  ambient_max_temp_c NUMERIC(6,2),
  earthing_available BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE survey_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_survey_id UUID NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  measurement_label VARCHAR(120) NOT NULL,
  value_numeric NUMERIC(14,4) NOT NULL,
  unit VARCHAR(24) NOT NULL,
  notes TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roof_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_survey_id UUID NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  section_name VARCHAR(100) NOT NULL,
  roof_type VARCHAR(48) NOT NULL,
  usable_area_m2 NUMERIC(10,2) NOT NULL CHECK (usable_area_m2 >= 0),
  tilt_degrees NUMERIC(5,2) NOT NULL,
  azimuth_degrees NUMERIC(6,2) NOT NULL,
  shading_factor_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE survey_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_survey_id UUID NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  file_attachment_id UUID REFERENCES file_attachments(id),
  local_client_uri TEXT,
  caption VARCHAR(255),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE load_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_survey_id UUID NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  appliance_name VARCHAR(120) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  rated_power_w NUMERIC(12,2) NOT NULL CHECK (rated_power_w >= 0),
  daily_hours NUMERIC(5,2) NOT NULL CHECK (daily_hours >= 0 AND daily_hours <= 24),
  is_critical_backup_load BOOLEAN NOT NULL DEFAULT FALSE,
  surge_factor NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE site_hazards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_survey_id UUID NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  hazard_type VARCHAR(80) NOT NULL,
  severity VARCHAR(24) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  mitigation_plan TEXT,
  row_version INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- 5 (EARLY EQUIPMENT CATALOG). INVENTORY MASTER DATA
-- ============================================================================

CREATE TABLE manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  country VARCHAR(80),
  website TEXT,
  UNIQUE (organization_id, name)
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_code VARCHAR(64) NOT NULL,
  name VARCHAR(180) NOT NULL,
  contact_name VARCHAR(140),
  phone VARCHAR(40),
  email VARCHAR(255),
  payment_terms VARCHAR(120),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, supplier_code)
);

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(48) NOT NULL,
  name VARCHAR(140) NOT NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (organization_id, code)
);

CREATE TABLE equipment_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  manufacturer_id UUID REFERENCES manufacturers(id),
  sku VARCHAR(80) NOT NULL,
  category VARCHAR(48) NOT NULL CHECK (category IN ('pv_module', 'inverter', 'battery', 'cable', 'breaker', 'mounting', 'earthing', 'accessory')),
  model_name VARCHAR(180) NOT NULL,
  unit_of_measure VARCHAR(24) NOT NULL DEFAULT 'pcs',
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit_sell_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  warranty_months INTEGER NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,4) NOT NULL DEFAULT 0,
  specs_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  datasheet_file_id UUID REFERENCES file_attachments(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sku)
);

-- ============================================================================
-- 4. SOLAR ENGINEERING
-- ============================================================================

CREATE TABLE solar_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_catalog_id UUID REFERENCES equipment_catalog(id),
  model_name VARCHAR(180) NOT NULL,
  pmax_w NUMERIC(10,2) NOT NULL,
  voc_v NUMERIC(8,3) NOT NULL,
  vmp_v NUMERIC(8,3) NOT NULL,
  isc_a NUMERIC(8,3) NOT NULL,
  imp_a NUMERIC(8,3) NOT NULL,
  temp_coeff_voc_pct_c NUMERIC(6,4) NOT NULL,
  temp_coeff_pmax_pct_c NUMERIC(6,4) NOT NULL,
  max_system_voltage_v NUMERIC(8,2) NOT NULL DEFAULT 1500
);

CREATE TABLE inverters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_catalog_id UUID REFERENCES equipment_catalog(id),
  model_name VARCHAR(180) NOT NULL,
  inverter_type VARCHAR(32) NOT NULL CHECK (inverter_type IN ('on_grid', 'hybrid', 'off_grid')),
  rated_ac_power_w NUMERIC(12,2) NOT NULL,
  max_dc_input_w NUMERIC(12,2) NOT NULL,
  max_dc_voltage_v NUMERIC(8,2) NOT NULL,
  mppt_min_v NUMERIC(8,2) NOT NULL,
  mppt_max_v NUMERIC(8,2) NOT NULL,
  mppt_count INTEGER NOT NULL CHECK (mppt_count > 0),
  max_input_current_per_mppt_a NUMERIC(8,2) NOT NULL,
  efficiency_pct NUMERIC(5,2) NOT NULL DEFAULT 97.50
);

CREATE TABLE batteries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_catalog_id UUID REFERENCES equipment_catalog(id),
  model_name VARCHAR(180) NOT NULL,
  chemistry VARCHAR(48) NOT NULL,
  nominal_voltage_v NUMERIC(8,2) NOT NULL,
  capacity_ah NUMERIC(10,2) NOT NULL,
  energy_wh NUMERIC(12,2) NOT NULL,
  max_dod_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  round_trip_efficiency_pct NUMERIC(5,2) NOT NULL DEFAULT 92.00
);

CREATE TABLE solar_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  site_survey_id UUID REFERENCES site_surveys(id),
  design_code VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'superseded')),
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, design_code)
);

CREATE TABLE design_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  solar_design_id UUID NOT NULL REFERENCES solar_designs(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  formula_version VARCHAR(32) NOT NULL,
  assumptions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_dc_kwp NUMERIC(12,4) NOT NULL,
  total_ac_kw NUMERIC(12,4) NOT NULL,
  battery_kwh NUMERIC(12,4) NOT NULL DEFAULT 0,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (solar_design_id, revision_number)
);

CREATE TABLE pv_arrays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  design_revision_id UUID NOT NULL REFERENCES design_revisions(id) ON DELETE CASCADE,
  solar_module_id UUID NOT NULL REFERENCES solar_modules(id),
  inverter_id UUID NOT NULL REFERENCES inverters(id),
  array_name VARCHAR(100) NOT NULL,
  tilt_degrees NUMERIC(5,2) NOT NULL,
  azimuth_degrees NUMERIC(6,2) NOT NULL
);

CREATE TABLE pv_strings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pv_array_id UUID NOT NULL REFERENCES pv_arrays(id) ON DELETE CASCADE,
  mppt_index INTEGER NOT NULL CHECK (mppt_index > 0),
  modules_in_series INTEGER NOT NULL CHECK (modules_in_series > 0),
  parallel_strings INTEGER NOT NULL CHECK (parallel_strings > 0),
  cold_voc_v NUMERIC(10,3) NOT NULL,
  hot_vmp_v NUMERIC(10,3) NOT NULL,
  string_isc_a NUMERIC(10,3) NOT NULL,
  cable_length_m NUMERIC(8,2) NOT NULL,
  cable_cross_section_mm2 NUMERIC(6,2) NOT NULL,
  voltage_drop_pct NUMERIC(6,3) NOT NULL
);

CREATE TABLE design_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  design_revision_id UUID NOT NULL REFERENCES design_revisions(id) ON DELETE CASCADE,
  formula_version VARCHAR(32) NOT NULL,
  inputs_json JSONB NOT NULL,
  outputs_json JSONB NOT NULL,
  reference_warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE design_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  design_revision_id UUID NOT NULL REFERENCES design_revisions(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(24) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  review_notes TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5 (CONTINUED). INVENTORY TRANSACTIONS & SERIAL TRACKING
-- ============================================================================

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  po_number VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_received', 'received', 'cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  ordered_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, po_number)
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  quantity_ordered NUMERIC(14,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0)
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  project_id UUID REFERENCES projects(id),
  movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('goods_receipt', 'reservation', 'issue_to_project', 'return_to_stock', 'damaged_writeoff', 'adjustment')),
  quantity_delta NUMERIC(14,4) NOT NULL,
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(128) NOT NULL,
  performed_by_user_id UUID NOT NULL REFERENCES users(id),
  reference_type VARCHAR(64),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  quantity_reserved NUMERIC(14,4) NOT NULL CHECK (quantity_reserved > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE equipment_serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  warehouse_id UUID REFERENCES warehouses(id),
  project_id UUID REFERENCES projects(id),
  serial_number VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'installed', 'damaged', 'rma')),
  warranty_expires_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, serial_number)
);

-- ============================================================================
-- 6. QUOTATIONS
-- ============================================================================

CREATE TABLE quotation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  terms_and_conditions TEXT NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 15,
  default_margin_pct NUMERIC(6,2) NOT NULL DEFAULT 18.00
);

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  quotation_number VARCHAR(64) NOT NULL,
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, quotation_number)
);

CREATE TABLE quotation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  design_revision_id UUID REFERENCES design_revisions(id),
  revision_number INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
  subtotal_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  transport_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  gross_margin_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  pdf_file_id UUID REFERENCES file_attachments(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quotation_id, revision_number)
);

CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_revision_id UUID NOT NULL REFERENCES quotation_revisions(id) ON DELETE CASCADE,
  equipment_catalog_id UUID REFERENCES equipment_catalog(id),
  line_type VARCHAR(32) NOT NULL CHECK (line_type IN ('equipment', 'material', 'labor', 'transport', 'service')),
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_rate_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,4) NOT NULL DEFAULT 0
);

CREATE TABLE quotation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_revision_id UUID NOT NULL REFERENCES quotation_revisions(id) ON DELETE CASCADE,
  approved_by_user_id UUID REFERENCES users(id),
  customer_signoff_name VARCHAR(160),
  decision VARCHAR(24) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. FINANCE
-- ============================================================================

CREATE TABLE tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(48) NOT NULL,
  name VARCHAR(120) NOT NULL,
  rate_pct NUMERIC(6,3) NOT NULL CHECK (rate_pct >= 0),
  country_code CHAR(2) NOT NULL DEFAULT 'PK',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (organization_id, code)
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  quotation_revision_id UUID REFERENCES quotation_revisions(id),
  invoice_number VARCHAR(64) NOT NULL,
  invoice_type VARCHAR(24) NOT NULL CHECK (invoice_type IN ('advance', 'progress', 'final')),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  subtotal_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(18,4) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_rule_id UUID REFERENCES tax_rules(id),
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,4) NOT NULL,
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18,4) NOT NULL
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  receipt_number VARCHAR(64) NOT NULL,
  payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('bank_transfer', 'cash', 'cheque', 'card', 'online')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  reference_no VARCHAR(120),
  idempotency_key VARCHAR(128) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  UNIQUE (organization_id, receipt_number),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(18,4) NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  amount NUMERIC(18,4) NOT NULL CHECK (amount >= 0),
  incurred_on DATE NOT NULL,
  receipt_file_id UUID REFERENCES file_attachments(id),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  credit_note_number VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  issued_by_user_id UUID NOT NULL REFERENCES users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, credit_note_number)
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entry_number VARCHAR(64) NOT NULL,
  reference_type VARCHAR(48) NOT NULL,
  reference_id UUID NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted')),
  currency CHAR(3) NOT NULL DEFAULT 'PKR',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by_user_id UUID NOT NULL REFERENCES users(id),
  UNIQUE (organization_id, entry_number)
);

CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code VARCHAR(32) NOT NULL,
  account_name VARCHAR(120) NOT NULL,
  debit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

-- ============================================================================
-- 8. INSTALLATION
-- ============================================================================

CREATE TABLE installation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supervisor_user_id UUID NOT NULL REFERENCES users(id),
  scheduled_start_date DATE NOT NULL,
  scheduled_end_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'safety_blocked', 'in_progress', 'completed')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES users(id),
  title VARCHAR(180) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_on_site VARCHAR(64) NOT NULL,
  UNIQUE (organization_id, installation_job_id, user_id)
);

CREATE TABLE daily_site_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  author_user_id UUID NOT NULL REFERENCES users(id),
  weather_conditions VARCHAR(100),
  work_summary TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE material_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  stock_movement_id UUID REFERENCES stock_movements(id),
  quantity_issued NUMERIC(14,4) NOT NULL CHECK (quantity_issued > 0),
  issued_by_user_id UUID NOT NULL REFERENCES users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE installation_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  file_attachment_id UUID REFERENCES file_attachments(id),
  local_client_uri TEXT,
  caption VARCHAR(255),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. SAFETY AND INSPECTION
-- ============================================================================

CREATE TABLE risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  assessed_by_user_id UUID NOT NULL REFERENCES users(id),
  working_at_height_required BOOLEAN NOT NULL DEFAULT TRUE,
  electrical_isolation_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ppe_compliance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  approved_by_user_id UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE safety_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  checklist_type VARCHAR(48) NOT NULL,
  items_json JSONB NOT NULL,
  completed_by_user_id UUID NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID REFERENCES installation_jobs(id),
  reported_by_user_id UUID NOT NULL REFERENCES users(id),
  severity VARCHAR(24) NOT NULL CHECK (severity IN ('near_miss', 'minor', 'major', 'critical')),
  description TEXT NOT NULL,
  immediate_action_taken TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id) ON DELETE CASCADE,
  inspector_user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'passed', 'failed')),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_record_id UUID NOT NULL REFERENCES inspection_records(id) ON DELETE CASCADE,
  check_code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  result VARCHAR(24) NOT NULL CHECK (result IN ('pass', 'fail', 'na')),
  notes TEXT
);

CREATE TABLE test_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_record_id UUID NOT NULL REFERENCES inspection_records(id) ON DELETE CASCADE,
  parameter_name VARCHAR(100) NOT NULL,
  measured_value NUMERIC(14,4) NOT NULL,
  unit VARCHAR(24) NOT NULL,
  within_tolerance BOOLEAN NOT NULL
);

CREATE TABLE corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_record_id UUID NOT NULL REFERENCES inspection_records(id) ON DELETE CASCADE,
  assigned_to_user_id UUID REFERENCES users(id),
  description TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'verified')),
  due_date DATE,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE inspection_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inspection_record_id UUID NOT NULL REFERENCES inspection_records(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(24) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comments TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. COMMISSIONING
-- ============================================================================

CREATE TABLE commissioning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  installation_job_id UUID NOT NULL REFERENCES installation_jobs(id),
  status VARCHAR(32) NOT NULL DEFAULT 'pending_safety' CHECK (status IN ('pending_safety', 'ready_for_review', 'approved', 'rejected')),
  commissioned_at TIMESTAMPTZ,
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commissioning_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commissioning_record_id UUID NOT NULL REFERENCES commissioning_records(id) ON DELETE CASCADE,
  test_name VARCHAR(120) NOT NULL,
  measured_value VARCHAR(80) NOT NULL,
  passed BOOLEAN NOT NULL,
  tested_by_user_id UUID NOT NULL REFERENCES users(id),
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commissioning_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commissioning_record_id UUID NOT NULL REFERENCES commissioning_records(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(24) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE handover_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  commissioning_record_id UUID NOT NULL REFERENCES commissioning_records(id) ON DELETE CASCADE,
  file_attachment_id UUID NOT NULL REFERENCES file_attachments(id),
  customer_acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. MAINTENANCE AND WARRANTY
-- ============================================================================

CREATE TABLE asset_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  equipment_catalog_id UUID NOT NULL REFERENCES equipment_catalog(id),
  serial_number_id UUID REFERENCES equipment_serial_numbers(id),
  qr_code_token VARCHAR(128) NOT NULL,
  installed_on DATE NOT NULL,
  warranty_expires_on DATE,
  telemetry_provider VARCHAR(64),
  external_device_id VARCHAR(128),
  UNIQUE (organization_id, qr_code_token)
);

CREATE TABLE maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schedule_type VARCHAR(32) NOT NULL CHECK (schedule_type IN ('cleaning', 'preventive', 'inverter_check')),
  interval_days INTEGER NOT NULL CHECK (interval_days > 0),
  next_due_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE service_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id),
  asset_id UUID REFERENCES asset_register(id),
  ticket_number VARCHAR(64) NOT NULL,
  ticket_type VARCHAR(32) NOT NULL CHECK (ticket_type IN ('preventive', 'corrective', 'cleaning', 'warranty')),
  priority VARCHAR(24) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
  summary VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  assigned_technician_id UUID REFERENCES users(id),
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, ticket_number)
);

CREATE TABLE service_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  technician_user_id UUID NOT NULL REFERENCES users(id),
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  findings TEXT NOT NULL,
  actions_taken TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE warranty_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES asset_register(id),
  service_ticket_id UUID REFERENCES service_tickets(id),
  manufacturer_id UUID REFERENCES manufacturers(id),
  claim_number VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'replaced', 'rejected')),
  fault_description TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  UNIQUE (organization_id, claim_number)
);

-- ============================================================================
-- 12. OFFLINE SYNCHRONIZATION
-- ============================================================================

CREATE TABLE device_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_identifier VARCHAR(128) NOT NULL,
  platform VARCHAR(24) NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  app_version VARCHAR(32) NOT NULL,
  last_sync_at TIMESTAMPTZ,
  UNIQUE (organization_id, user_id, device_identifier)
);

CREATE TABLE sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_registration_id UUID NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  sync_operation_id UUID NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  operation_type VARCHAR(24) NOT NULL CHECK (operation_type IN ('create', 'update', 'delete')),
  status VARCHAR(24) NOT NULL CHECK (status IN ('applied', 'conflict', 'rejected')),
  server_seq BIGINT GENERATED ALWAYS AS IDENTITY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sync_operation_id UUID NOT NULL REFERENCES sync_operations(id) ON DELETE CASCADE,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  client_payload_json JSONB NOT NULL,
  server_snapshot_json JSONB NOT NULL,
  resolution_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'accepted_server', 'merged_client')),
  resolved_by_user_id UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_registration_id UUID NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  last_server_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, device_registration_id)
);

-- ============================================================================
-- TARGETED COMPOSITE INDEXES FOR TENANT-SCOPED QUERIES
-- ============================================================================

CREATE INDEX idx_memberships_org_user ON organization_memberships (organization_id, user_id);
CREATE INDEX idx_sessions_user_family ON user_sessions (user_id, token_family_id);
CREATE INDEX idx_audit_org_created ON audit_events (organization_id, created_at DESC);
CREATE INDEX idx_customers_org_name ON customers (organization_id, full_name);
CREATE INDEX idx_projects_org_stage ON projects (organization_id, current_stage, status);
CREATE INDEX idx_surveys_org_project ON site_surveys (organization_id, project_id);
CREATE INDEX idx_designs_org_project ON solar_designs (organization_id, project_id);
CREATE INDEX idx_stock_org_catalog ON stock_movements (organization_id, equipment_catalog_id, created_at DESC);
CREATE INDEX idx_quotations_org_status ON quotations (organization_id, status);
CREATE INDEX idx_invoices_org_status_due ON invoices (organization_id, status, due_date);
CREATE INDEX idx_jobs_org_status ON installation_jobs (organization_id, status);
CREATE INDEX idx_tickets_org_status ON service_tickets (organization_id, status, priority);
CREATE INDEX idx_sync_ops_org_seq ON sync_operations (organization_id, server_seq);
CREATE INDEX idx_files_org_entity ON file_attachments (organization_id, entity_type, entity_id);
