export const VNEX_OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'VNex Solar Management API',
    version: '1.0.0',
    description:
      'Multi-tenant REST API for offline-first solar engineering, inventory, quotations, billing, safety, commissioning, and maintenance.',
  },
  servers: [{ url: '/api/v1', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Service readiness probe',
        tags: ['System'],
        responses: {
          '200': { description: 'API service is healthy' },
        },
      },
    },
    '/meta/schema-summary': {
      get: {
        summary: 'PostgreSQL schema & RLS migration verification summary',
        tags: ['System'],
        responses: {
          '200': { description: 'Normalized table count, RLS coverage, and migration metadata' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate user with Argon2id password verification and rotating refresh token',
        tags: ['Authentication'],
        responses: {
          '200': { description: 'Access and refresh token pair issued' },
          '401': { description: 'Invalid credentials' },
          '429': { description: 'Rate limit exceeded' },
        },
      },
    },
    '/sync/batch': {
      post: {
        summary: 'Idempotent offline outbox synchronization batch',
        tags: ['Synchronization'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Batch processed with per-operation ack or explicit 409 conflict payload' },
        },
      },
    },
    '/customers': {
      get: {
        summary: 'List tenant customers with optional search filter',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant-scoped customer list' } },
      },
      post: {
        summary: 'Create a tenant-scoped customer',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Customer created with initial rowVersion=1' } },
      },
    },
    '/customers/{id}/sites': {
      get: {
        summary: 'List installation sites for a customer',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Customer site records' } },
      },
      post: {
        summary: 'Create metered installation site for a customer',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Site created' } },
      },
    },
    '/projects': {
      get: {
        summary: 'List solar projects (resource-filtered for Field Technicians)',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Authorized solar projects' } },
      },
      post: {
        summary: 'Create a solar project linked to customer and site',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Project created in survey_scheduled stage' } },
      },
    },
    '/surveys': {
      get: {
        summary: 'List site surveys in active tenant',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Authorized site surveys' } },
      },
      post: {
        summary: 'Create draft site survey with roof geometry, loads, and site hazards',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Draft site survey created with deterministic load summary' } },
      },
    },
    '/surveys/{id}': {
      get: {
        summary: 'Get site survey details and computed load summary',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Site survey record and load summary' } },
      },
      put: {
        summary: 'Update site survey with optimistic baseRowVersion concurrency check',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Survey updated cleanly' },
          '409': { description: 'Stale baseRowVersion conflict' },
        },
      },
    },
    '/surveys/{id}/submit': {
      post: {
        summary: 'Submit completed survey and advance linked project stage to survey_completed',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Survey submitted' },
          '400': { description: 'Survey missing roof section measurements' },
        },
      },
    },
    '/surveys/{id}/photos/presign': {
      post: {
        summary: 'Generate private object-storage upload grant for SHA-256 verified survey photo',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Signed upload grant issued' } },
      },
    },
    '/surveys/{id}/photos/commit': {
      post: {
        summary: 'Verify SHA-256 checksum and bind uploaded photo to site survey',
        tags: ['Site Surveys'],
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Photo verified and attached' },
          '422': { description: 'SHA-256 checksum mismatch' },
        },
      },
    },
    '/files/{id}/download': {
      get: {
        summary: 'Issue time-limited private object-storage download grant for authorized tenant',
        tags: ['Media Storage'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Authorized download grant' },
          '404': { description: 'File not found in active tenant' },
        },
      },
    },
    '/engineering/catalog': {
      get: {
        summary: 'List tenant solar modules, inverters, and battery datasheets',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant PV catalog specs' } },
      },
    },
    '/engineering/calculate-preview': {
      post: {
        summary: 'Run all 20 deterministic SI-unit solar engineering calculations',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Versioned calculation outputs and safety checks' } },
      },
    },
    '/engineering/designs': {
      get: {
        summary: 'List solar designs and latest revisions in active organization',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant solar designs' } },
      },
      post: {
        summary: 'Create solar design with Revision 1 and deterministic engineering outputs',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Solar design created' } },
      },
    },
    '/engineering/designs/{id}/revisions': {
      post: {
        summary: 'Create a new draft revision when revising an approved or rejected design',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'New draft revision created' } },
      },
    },
    '/engineering/designs/{id}/approve': {
      post: {
        summary: 'Approve submitted solar design (Solar Engineer / Owner only; locks revision immutably)',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Design revision approved and locked' },
          '403': { description: 'Role lacks engineering:approve permission' },
          '409': { description: 'Approved revision is already immutable' },
          '422': { description: 'Electrical safety violation blocks approval' },
        },
      },
    },
    '/inventory/balances': {
      get: {
        summary: 'Get real-time warehouse stock balances, active reservations, and low-stock alerts',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Stock balances and low-stock alerts' } },
      },
    },
    '/inventory/purchase-orders': {
      get: {
        summary: 'List purchase orders in active organization',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant purchase orders' } },
      },
      post: {
        summary: 'Create purchase order in integer minor currency units',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Draft purchase order created' } },
      },
    },
    '/inventory/purchase-orders/{id}/receive': {
      post: {
        summary: 'Idempotently receive PO goods into warehouse stock and register equipment serial numbers',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Goods received atomically' } },
      },
    },
    '/inventory/reservations': {
      post: {
        summary: 'Idempotently reserve available warehouse stock for a project',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Stock reserved' }, '409': { description: 'Insufficient stock' } },
      },
    },
    '/inventory/issues': {
      post: {
        summary: 'Idempotently issue reserved or available stock & serial numbers to a project',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Material issued to project' } },
      },
    },
    '/inventory/serials': {
      get: {
        summary: 'Search serialized inverters, batteries, and PV modules across lifecycle states',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Matching serial records' } },
      },
    },
    '/quotations': {
      get: {
        summary: 'List tenant quotations with latest revisions and margin breakdowns',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant quotations' } },
      },
      post: {
        summary: 'Create a quotation with integer minor-unit BOM, labor, transport, and tax calculation',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Draft quotation created' } },
      },
    },
    '/quotations/from-design/{designId}': {
      post: {
        summary: 'Generate or create a quotation BOM directly from an engineering solar design revision',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'BOM pricing draft or created quotation' } },
      },
    },
    '/quotations/{id}/approve': {
      post: {
        summary: 'Approve quotation revision immutably and advance project stage to quote_approved',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Quotation revision approved and locked' } },
      },
    },
    '/quotations/{id}/printable': {
      get: {
        summary: 'Generate printable HTML commercial proposal document for PDF export',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Printable proposal HTML payload' } },
      },
    },
    '/finance/invoices': {
      get: {
        summary: 'List advance, progress, and final invoices in active organization',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant invoices' } },
      },
      post: {
        summary: 'Create draft invoice linked to customer, project, and optional approved quotation',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Draft invoice created' } },
      },
    },
    '/finance/invoices/{id}/issue': {
      post: {
        summary: 'Issue invoice and post balanced double-entry Accounts Receivable / Revenue / Tax journal',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Invoice issued with posted journal entry' } },
      },
    },
    '/finance/payments': {
      get: {
        summary: 'List customer payment receipts and invoice allocations',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant payment receipts' } },
      },
      post: {
        summary: 'Idempotently record customer payment, allocate to issued invoices, and post Cash/AR journal',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Payment recorded and allocated' } },
      },
    },
    '/finance/credit-notes': {
      get: {
        summary: 'List credit notes issued in active organization',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant credit notes' } },
      },
      post: {
        summary: 'Issue credit note against an invoice and post balanced reversing double-entry journal',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Credit note issued with reversing journal' } },
      },
    },
    '/finance/journals': {
      get: {
        summary: 'List posted double-entry accounting journal entries',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant double-entry journals' } },
      },
      post: {
        summary: 'Post balanced manual double-entry journal (rejects unbalanced debits/credits with 422)',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Balanced journal entry posted' },
          '422': { description: 'Unbalanced journal entry rejected' },
        },
      },
    },
    '/installations': {
      get: {
        summary: 'List tenant installation jobs (scoped to assigned jobs for Field Technicians)',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Authorized installation jobs' } },
      },
      post: {
        summary: 'Schedule an installation job, generate crew tasks, and advance project to installation_scheduled',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Installation job scheduled' } },
      },
    },
    '/installations/{id}/tasks/{taskId}': {
      patch: {
        summary: 'Update installation checklist task status with optimistic baseRowVersion check',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Task updated cleanly' },
          '403': { description: 'Field Technician not assigned to this job' },
          '409': { description: 'Stale baseRowVersion conflict' },
        },
      },
    },
    '/installations/{id}/logs': {
      post: {
        summary: 'Record daily site diary and weather log on an installation job',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Daily site log recorded' } },
      },
    },
    '/installations/{id}/material-issues': {
      post: {
        summary: 'Idempotently issue warehouse inventory and serialized gear directly to an installation job',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Material issued to installation job' } },
      },
    },
    '/installations/{id}/complete': {
      post: {
        summary: 'Complete installation job after verifying all tasks completed and no active safety block',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Installation job completed' },
          '409': { description: 'Incomplete tasks block completion' },
          '422': { description: 'Safety gate block prevents completion' },
        },
      },
    },
    '/safety/jobs/{jobId}': {
      get: {
        summary: 'Retrieve risk assessments, checklists, incidents, inspections, and computed hard safety gate for a job',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Job safety workspace bundle' } },
      },
    },
    '/safety/risk-assessments': {
      post: {
        summary: 'Submit risk assessment verifying PPE, working at height, and electrical isolation',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Risk assessment submitted' } },
      },
    },
    '/safety/risk-assessments/{id}/approve': {
      post: {
        summary: 'Approve risk assessment (Safety Officer / Owner only; enforces PPE & electrical isolation checks)',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Risk assessment approved' },
          '403': { description: 'Role lacks safety:approve permission' },
          '422': { description: 'PPE or electrical isolation verification missing' },
        },
      },
    },
    '/safety/incidents': {
      get: {
        summary: 'List safety incidents reported in active organization',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant safety incidents' } },
      },
      post: {
        summary: 'Report safety incident (major/critical incidents immediately place installation job into safety_blocked)',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Incident logged and safety gate re-evaluated' } },
      },
    },
    '/safety/inspections': {
      get: {
        summary: 'List IEC 62446-1 inspection records in active organization',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant inspection records' } },
      },
      post: {
        summary: 'Record IEC 62446-1 inspection checklist items and electrical test readings',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Inspection record created' } },
      },
    },
    '/safety/inspections/{id}/approve': {
      post: {
        summary: 'Pass inspection immutably and clear hard safety gate for commissioning (Safety Officer / Owner only)',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Inspection passed and safety gate cleared' },
          '403': { description: 'Role lacks safety:approve permission' },
          '409': { description: 'Inspection already passed immutably' },
          '422': { description: 'Failed items, out-of-tolerance readings, or unverified corrective actions block clearance' },
        },
      },
    },
    '/commissioning': {
      get: {
        summary: 'List commissioning records and live safety-gate snapshots for the tenant',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Commissioning record list' } },
      },
      post: {
        summary: 'Open a commissioning package linked to a project and installation job',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Commissioning record created' } },
      },
    },
    '/commissioning/{id}/tests': {
      post: {
        summary: 'Record Voc, anti-islanding, CT polarity, or BMS commissioning test results',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Commissioning test recorded' },
          '409': { description: 'Commissioning record already approved immutably' },
        },
      },
    },
    '/commissioning/{id}/approve': {
      post: {
        summary: 'Approve commissioning certificate, auto-register QR assets, and issue SHA-256 handover pack',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Commissioning approved and assets registered' },
          '403': { description: 'Role lacks commissioning:approve permission' },
          '409': { description: 'Already approved or installation job incomplete' },
          '422': { description: 'Hard safety gate or test readiness checks failed' },
        },
      },
    },
    '/commissioning/{id}/handovers/{handoverId}/acknowledge': {
      post: {
        summary: 'Capture customer handover sign-off and advance project stage to handed_over',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Handover acknowledged' } },
      },
    },
    '/commissioning/{id}/printable': {
      get: {
        summary: 'Generate XSS-escaped printable commissioning certificate and QR asset register sheet',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Printable HTML certificate payload' } },
      },
    },
    '/assets': {
      get: {
        summary: 'List tenant QR-registered serialized solar assets and warranty expiration dates',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Registered asset list' } },
      },
    },
    '/assets/qr/{qrToken}': {
      get: {
        summary: 'Look up QR asset token, warranty status, service tickets, warranty claims, and maintenance schedules',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'QR asset maintenance & warranty bundle' },
          '404': { description: 'QR token not found in active tenant' },
        },
      },
    },
    '/maintenance/schedules': {
      get: {
        summary: 'List preventive maintenance, module cleaning, and inverter check schedules',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Maintenance schedules list' } },
      },
      post: {
        summary: 'Create recurring preventive maintenance schedule for a project',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Schedule created' } },
      },
    },
    '/maintenance/schedules/{id}/trigger': {
      post: {
        summary: 'Generate due service ticket from maintenance schedule and advance nextDueDate',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Preventive ticket generated and due date advanced' } },
      },
    },
    '/maintenance/tickets': {
      get: {
        summary: 'List service tickets (enforces Field Technician assignment isolation)',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Service ticket list' } },
      },
      post: {
        summary: 'Open preventive, corrective, cleaning, or warranty service ticket',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Service ticket created' } },
      },
    },
    '/maintenance/tickets/{id}/assign': {
      post: {
        summary: 'Assign field technician to a service ticket',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Technician assigned' } },
      },
    },
    '/maintenance/tickets/{id}/status': {
      patch: {
        summary: 'Transition service ticket lifecycle with optimistic rowVersion concurrency check',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Ticket status updated' },
          '409': { description: 'Version conflict or closed ticket' },
        },
      },
    },
    '/maintenance/tickets/{id}/visits': {
      post: {
        summary: 'Log technician field service visit findings and actions taken',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Service visit logged' } },
      },
    },
    '/maintenance/warranty-claims': {
      get: {
        summary: 'List manufacturer warranty claims across registered assets',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Warranty claim list' } },
      },
      post: {
        summary: 'Create draft warranty claim linked to serialized asset and optional service ticket',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Draft warranty claim created' } },
      },
    },
    '/maintenance/warranty-claims/{id}/submit': {
      post: {
        summary: 'Submit draft warranty claim after verifying active asset warranty expiration date',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Warranty claim submitted' },
          '422': { description: 'Asset warranty expired' },
        },
      },
    },
    '/maintenance/warranty-claims/{id}/decision': {
      patch: {
        summary: 'Approve, replace (updating asset serial number), or reject submitted warranty claim',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Warranty claim decision applied' },
          '422': { description: 'Replacement serial number required for replaced decision' },
        },
      },
    },
    '/sync/devices': {
      get: {
        summary: 'List registered sync devices and latest monotonic serverSeq checkpoints',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Registered sync devices' } },
      },
    },
    '/sync/checkpoints/{deviceId}': {
      get: {
        summary: 'Get stored monotonic sync checkpoint for a device',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Device checkpoint' } },
      },
      put: {
        summary: 'Persist monotonic sync checkpoint (rejects regressions with 409)',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Checkpoint persisted' },
          '409': { description: 'Checkpoint regression rejected' },
        },
      },
    },
    '/sync/metrics': {
      get: {
        summary: 'Return tenant sync engine health metrics (applied, deduplicated, rejected, conflicts, dead-letters)',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant sync metrics' } },
      },
    },
    '/sync/dead-letters': {
      get: {
        summary: 'Inspect rejected or corrupted sync operations in tenant dead-letter queue',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Dead-letter queue list' } },
      },
    },
    '/sync/dead-letters/{id}/acknowledge': {
      post: {
        summary: 'Acknowledge a permanent sync dead-letter rejection',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Dead-letter acknowledged' } },
      },
    },
    '/sync/media/presign': {
      post: {
        summary: 'Create SHA-256 guarded media upload recovery ticket',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Media recovery ticket created' } },
      },
    },
    '/sync/media/{id}/verify': {
      post: {
        summary: 'Verify uploaded media SHA-256 digest and transition mismatched uploads to recovered on retry',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Media SHA-256 verified or recovered' },
          '422': { description: 'Media SHA-256 checksum mismatch' },
        },
      },
    },
    '/openapi.json': {
      get: {
        summary: 'Serve live OpenAPI 3.1 JSON specification',
        tags: ['System'],
        responses: { '200': { description: 'OpenAPI 3.1 document' } },
      },
    },
    '/meta/security-posture': {
      get: {
        summary: 'Non-sensitive security hardening and schema posture diagnostic summary',
        tags: ['System'],
        responses: { '200': { description: 'Security hardening posture' } },
      },
    },
    '/auth/register-organization': {
      post: {
        summary: 'Register new solar EPC tenant organization and Org Owner account with Argon2id password',
        tags: ['Authentication'],
        responses: { '201': { description: 'Organization registered and session tokens issued' } },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token (revokes entire token family on reuse detection)',
        tags: ['Authentication'],
        responses: {
          '200': { description: 'Rotated access & refresh token pair' },
          '401': { description: 'Expired or reused refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Revoke current active user session',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Session revoked' } },
      },
    },
    '/auth/logout-all': {
      post: {
        summary: 'Revoke all active sessions for the user within the active tenant',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'All organization sessions revoked' } },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Return active user profile, organization context, and permissions',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Active authenticated session identity' } },
      },
    },
    '/organizations/current': {
      get: {
        summary: 'Retrieve active organization settings and default currency',
        tags: ['Organizations & RBAC'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Organization profile' } },
      },
      patch: {
        summary: 'Update organization metadata and tax registration settings (Org Owner only)',
        tags: ['Organizations & RBAC'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Organization updated' } },
      },
    },
    '/organizations/members': {
      get: {
        summary: 'List organization memberships and RBAC role assignments',
        tags: ['Organizations & RBAC'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Organization members' } },
      },
      post: {
        summary: 'Provision a new organization member with RBAC role and Argon2id password',
        tags: ['Organizations & RBAC'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Member provisioned' } },
      },
    },
    '/organizations/audit-events': {
      get: {
        summary: 'List immutable append-only audit trail events for active organization',
        tags: ['Organizations & RBAC'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant audit events' } },
      },
    },
    '/customers/{id}': {
      patch: {
        summary: 'Update customer record with optimistic baseRowVersion concurrency check',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Customer updated' },
          '409': { description: 'Stale rowVersion conflict' },
        },
      },
    },
    '/projects/{id}': {
      get: {
        summary: 'Retrieve tenant-scoped solar project record',
        tags: ['Customers & Projects'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Solar project detail' } },
      },
    },
    '/files': {
      post: {
        summary: 'Register tenant-scoped private file metadata object',
        tags: ['Media Storage'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'File attachment registered' } },
      },
    },
    '/engineering/designs/{id}': {
      get: {
        summary: 'Get solar design header and revision history',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Solar design detail' } },
      },
    },
    '/engineering/designs/{id}/revisions/{revNumber}': {
      put: {
        summary: 'Update draft solar design revision engineering parameters',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Draft design revision updated' } },
      },
    },
    '/engineering/designs/{id}/revisions/{revNumber}/submit': {
      post: {
        summary: 'Submit draft solar design revision for Solar Engineer approval',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Design revision submitted' } },
      },
    },
    '/engineering/designs/{id}/reject': {
      post: {
        summary: 'Reject submitted solar design revision with engineering notes',
        tags: ['Solar Engineering'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Design revision rejected' } },
      },
    },
    '/inventory/warehouses': {
      get: {
        summary: 'List tenant warehouses',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant warehouses' } },
      },
      post: {
        summary: 'Create a warehouse location in active organization',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Warehouse created' } },
      },
    },
    '/inventory/suppliers': {
      get: {
        summary: 'List tenant equipment suppliers',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant suppliers' } },
      },
      post: {
        summary: 'Create an equipment supplier record',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Supplier created' } },
      },
    },
    '/inventory/catalog': {
      get: {
        summary: 'List tenant inventory SKU catalog items',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Inventory catalog items' } },
      },
      post: {
        summary: 'Create an equipment SKU catalog entry',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Catalog item created' } },
      },
    },
    '/inventory/purchase-orders/{id}/issue': {
      post: {
        summary: 'Issue draft purchase order to supplier',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Purchase order issued' } },
      },
    },
    '/inventory/returns': {
      post: {
        summary: 'Idempotently return issued project stock back into warehouse balance',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Stock return recorded' } },
      },
    },
    '/inventory/write-offs': {
      post: {
        summary: 'Idempotently write off damaged or lost warehouse inventory',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Stock write-off recorded' } },
      },
    },
    '/inventory/movements': {
      get: {
        summary: 'List append-only stock movement ledger entries',
        tags: ['Equipment & Inventory'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Stock movement history' } },
      },
    },
    '/commissioning/{id}': {
      get: {
        summary: 'Get commissioning record, tests, approvals, handovers, and registered assets',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Commissioning detail' } },
      },
    },
    '/commissioning/{id}/reject': {
      post: {
        summary: 'Reject commissioning package with punch-list remediation notes',
        tags: ['Commissioning & Handover'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Commissioning rejected' } },
      },
    },
    '/maintenance/tickets/{id}': {
      get: {
        summary: 'Get service ticket details and field visit history',
        tags: ['Maintenance & Warranty'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Service ticket detail' } },
      },
    },
    '/quotations/{id}': {
      get: {
        summary: 'Get quotation header and all revision snapshots',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Quotation detail' } },
      },
    },
    '/quotations/{id}/revisions/{revNumber}': {
      put: {
        summary: 'Update draft quotation revision line items and commercial terms',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Draft quotation revision updated' } },
      },
    },
    '/quotations/{id}/revisions': {
      post: {
        summary: 'Create new draft revision from existing quotation',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'New quotation revision created' } },
      },
    },
    '/quotations/{id}/send': {
      post: {
        summary: 'Mark quotation revision as sent to customer',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Quotation marked sent' } },
      },
    },
    '/quotations/{id}/reject': {
      post: {
        summary: 'Record quotation rejection decision',
        tags: ['Quotations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Quotation rejected' } },
      },
    },
    '/finance/summary': {
      get: {
        summary: 'Get integer minor-unit billing, AR, tax, and cash collection summary',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant finance summary' } },
      },
    },
    '/finance/tax-rules': {
      get: {
        summary: 'List tenant tax rules in basis points (bps)',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Tenant tax rules' } },
      },
      post: {
        summary: 'Create tax rule in basis points (bps)',
        tags: ['Billing & Finance'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Tax rule created' } },
      },
    },
    '/installations/{id}': {
      get: {
        summary: 'Get installation job detail, tasks, crew, daily logs, and photos',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Installation job detail' } },
      },
    },
    '/installations/{id}/team': {
      post: {
        summary: 'Assign installation team members to an installation job',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Team assignment updated' } },
      },
    },
    '/installations/{id}/photos/presign': {
      post: {
        summary: 'Presign SHA-256 verified installation progress photo upload',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Upload grant issued' } },
      },
    },
    '/installations/{id}/photos/commit': {
      post: {
        summary: 'Verify SHA-256 checksum and commit installation progress photo',
        tags: ['Installations'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Photo committed' } },
      },
    },
    '/safety/risk-assessments/{id}/reject': {
      post: {
        summary: 'Reject risk assessment with remediation instructions',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Risk assessment rejected' } },
      },
    },
    '/safety/checklists': {
      post: {
        summary: 'Record PPE, working-at-height, electrical isolation, or LOTO safety checklist',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Safety checklist recorded' } },
      },
    },
    '/safety/incidents/{id}/resolve': {
      post: {
        summary: 'Resolve open safety incident and re-evaluate job safety gate',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Incident resolved' } },
      },
    },
    '/safety/inspections/{id}/corrective-actions': {
      post: {
        summary: 'Add corrective action item to an inspection record',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Corrective action added' } },
      },
    },
    '/safety/inspections/{id}/corrective-actions/{actionId}': {
      patch: {
        summary: 'Transition corrective action item status (open, resolved, verified)',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Corrective action updated' } },
      },
    },
    '/safety/inspections/{id}/reject': {
      post: {
        summary: 'Reject inspection record with failed compliance findings',
        tags: ['Safety & Inspection'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Inspection rejected' } },
      },
    },
    '/sync/devices/register': {
      post: {
        summary: 'Register offline-capable Android, iOS, or Web sync device',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Sync device registered' } },
      },
    },
    '/sync/delta': {
      get: {
        summary: 'Paginate server-assigned delta events since monotonic serverSeq cursor',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Delta event page' } },
      },
    },
    '/sync/conflicts': {
      get: {
        summary: 'List unresolved optimistic-concurrency sync conflicts in active tenant',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Active sync conflicts' } },
      },
    },
    '/sync/conflicts/{id}/resolve': {
      post: {
        summary: 'Resolve sync conflict via accept_server or merge_client strategy',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Conflict resolved' } },
      },
    },
    '/sync/media': {
      get: {
        summary: 'List tenant SHA-256 media upload verification and recovery tickets',
        tags: ['Offline Sync'],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Media recovery queue' } },
      },
    },
  },
} as const;
