-- VNex Solar | Phase 2 Migration 0002: PostgreSQL Row-Level Security & Immutability Guards

CREATE OR REPLACE FUNCTION vnex_current_org_id() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Prevent silent modification or deletion of immutable records
CREATE OR REPLACE FUNCTION vnex_prevent_immutable_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_events' THEN
    RAISE EXCEPTION 'audit_events is append-only and cannot be modified or deleted';
  END IF;

  IF TG_TABLE_NAME = 'design_revisions' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved engineering design revision % is immutable', OLD.id;
  END IF;

  IF TG_TABLE_NAME = 'quotation_revisions' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'Approved quotation revision % is immutable', OLD.id;
  END IF;

  IF TG_TABLE_NAME = 'journal_entries' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal entry % is immutable', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION vnex_prevent_immutable_mutation();

CREATE TRIGGER trg_design_revisions_immutable
  BEFORE UPDATE OR DELETE ON design_revisions
  FOR EACH ROW EXECUTE FUNCTION vnex_prevent_immutable_mutation();

CREATE TRIGGER trg_quotation_revisions_immutable
  BEFORE UPDATE OR DELETE ON quotation_revisions
  FOR EACH ROW EXECUTE FUNCTION vnex_prevent_immutable_mutation();

CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION vnex_prevent_immutable_mutation();

-- Enable tenant isolation RLS across organization-scoped tables
DO $$
DECLARE
  tbl TEXT;
  tenant_tables TEXT[] := ARRAY[
    'organization_memberships', 'user_sessions', 'invitations', 'audit_events',
    'file_attachments', 'document_templates', 'notifications', 'notification_preferences',
    'customers', 'customer_contacts', 'sites', 'projects', 'project_assignments',
    'project_stages', 'project_documents', 'site_surveys', 'survey_measurements',
    'roof_sections', 'survey_photos', 'load_profiles', 'site_hazards',
    'manufacturers', 'suppliers', 'warehouses', 'equipment_catalog',
    'solar_modules', 'inverters', 'batteries', 'solar_designs', 'design_revisions',
    'pv_arrays', 'pv_strings', 'design_calculations', 'design_approvals',
    'purchase_orders', 'purchase_order_items', 'stock_movements', 'stock_reservations',
    'equipment_serial_numbers', 'quotation_templates', 'quotations', 'quotation_revisions',
    'quotation_items', 'quotation_approvals', 'tax_rules', 'invoices', 'invoice_items',
    'payments', 'payment_allocations', 'expenses', 'credit_notes', 'journal_entries',
    'journal_lines', 'installation_jobs', 'installation_tasks', 'team_assignments',
    'daily_site_logs', 'material_issues', 'installation_photos', 'risk_assessments',
    'safety_checklists', 'safety_incidents', 'inspection_records', 'inspection_items',
    'test_readings', 'corrective_actions', 'inspection_approvals', 'commissioning_records',
    'commissioning_tests', 'commissioning_approvals', 'handover_documents',
    'asset_register', 'maintenance_schedules', 'service_tickets', 'service_visits',
    'warranty_claims', 'device_registrations', 'sync_operations', 'sync_conflicts',
    'sync_checkpoints'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I USING (organization_id = vnex_current_org_id()) WITH CHECK (organization_id = vnex_current_org_id());',
      tbl
    );
  END LOOP;
END $$;
