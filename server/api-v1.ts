import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { VNEX_OPENAPI_SPEC } from '../apps/api/src/openapi/openapi-spec.ts';
import {
  UserRole,
  calculateSolarDesignEngineering,
} from '../packages/domain/src/index.ts';
import {
  AuthServiceError,
  InMemoryAuthTenantService,
  type AccessTokenClaims,
} from './auth-service.ts';
import { InMemoryCommissioningService } from './commissioning-service.ts';
import { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';
import { InMemoryInstallationService } from './installation-service.ts';
import { InMemoryInventoryService } from './inventory-service.ts';
import { InMemoryMaintenanceService } from './maintenance-service.ts';
import { InMemoryQuotationsBillingService } from './quotations-billing-service.ts';
import { InMemorySafetyService } from './safety-service.ts';
import { InMemorySolarEngineeringService } from './solar-engineering-service.ts';
import { InMemorySyncEngineService } from './sync-service.ts';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const registerOrgSchema = z.object({
  legalName: z.string().min(2).max(200),
  displayName: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  businessAddress: z.string().min(4).max(400),
  countryCode: z.string().length(2).default('PK'),
  defaultCurrency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  ownerFullName: z.string().min(2).max(160),
  ownerEmail: z.string().email(),
  password: z.string().min(10).max(128),
  deviceId: z.string().max(128).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  organizationSlug: z.string().max(100).optional(),
  deviceId: z.string().max(128).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(16),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(160),
  role: z.nativeEnum(UserRole),
  temporaryPassword: z.string().min(10).max(128),
});

const updateOrgSchema = z.object({
  displayName: z.string().min(2).max(200).optional(),
  businessAddress: z.string().min(4).max(400).optional(),
  defaultCurrency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).optional(),
  taxRegistrationNumber: z.string().max(100).nullable().optional(),
});

const createProjectSchema = z.object({
  title: z.string().min(2).max(200),
  assignedUserIds: z.array(z.string().uuid()).optional(),
});

const registerDeviceSchema = z.object({
  deviceIdentifier: z.string().min(2).max(128),
  platform: z.enum(['android', 'ios', 'web']),
  appVersion: z.string().min(1).max(32),
});

const syncBatchSchema = z.object({
  deviceId: z.string().min(1).max(128),
  operations: z.array(
    z.object({
      syncOperationId: z.string().uuid(),
      idempotencyKey: z.string().min(1).max(128),
      entityType: z.enum([
        'customer',
        'site_survey',
        'solar_design_draft',
        'quotation_draft',
        'installation_task',
        'inspection_draft',
        'maintenance_note',
        'finance_posting',
        'stock_deduction',
        'design_approval',
        'commissioning_approval',
      ]),
      entityId: z.string().uuid(),
      operationType: z.enum(['create', 'update', 'delete']),
      baseRowVersion: z.number().int().min(0),
      payloadSha256: z.string().min(3),
      payload: z.record(z.string(), z.unknown()),
      clientTimestamp: z.string().min(4),
    }),
  ).max(100),
});

const syncDeltaQuerySchema = z.object({
  sinceSeq: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const resolveConflictSchema = z.object({
  decision: z.enum(['accept_server', 'merge_client']),
  mergedPayload: z.record(z.string(), z.unknown()).optional(),
});

const updateCheckpointSchema = z.object({
  lastServerSeq: z.number().int().min(0),
});

const presignMediaRecoverySchema = z.object({
  deviceId: z.string().min(1).max(128),
  entityType: z.string().min(2).max(80),
  entityId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(80),
  byteSize: z.number().int().positive(),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

const verifyMediaRecoverySchema = z.object({
  actualSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

const createCustomerSchema = z.object({
  customerType: z.enum(['residential', 'commercial', 'industrial', 'agricultural']).default('residential'),
  fullName: z.string().min(2).max(200),
  companyName: z.string().max(200).nullable().optional(),
  primaryPhone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  billingAddress: z.string().max(400).nullable().optional(),
});

const updateCustomerSchema = z.object({
  baseRowVersion: z.number().int().min(1),
  fullName: z.string().min(2).max(200).optional(),
  companyName: z.string().max(200).nullable().optional(),
  primaryPhone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  billingAddress: z.string().max(400).nullable().optional(),
});

const createSiteSchema = z.object({
  siteName: z.string().min(2).max(180),
  addressLine: z.string().min(3).max(400),
  city: z.string().min(2).max(100),
  countryCode: z.string().length(2).default('PK'),
  utilityProvider: z.string().max(120).nullable().optional(),
  meterReference: z.string().max(120).nullable().optional(),
  connectionPhase: z.enum(['single', 'three']).default('three'),
});

const createFullProjectSchema = z.object({
  customerId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  systemType: z.enum(['on_grid', 'hybrid', 'off_grid']).default('hybrid'),
  targetCapacityKwp: z.number().positive().nullable().optional(),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  assignedUserIds: z.array(z.string().uuid()).optional(),
});

const roofSectionSchema = z.object({
  id: z.string().min(1),
  sectionName: z.string().min(1).max(100),
  roofType: z.string().min(1).max(48),
  usableAreaM2: z.number().min(0),
  tiltDegrees: z.number().min(0).max(90),
  azimuthDegrees: z.number().min(0).max(360),
  shadingFactorPct: z.number().min(0).max(100),
});

const loadProfileItemSchema = z.object({
  id: z.string().min(1),
  applianceName: z.string().min(1).max(120),
  quantity: z.number().int().min(1),
  ratedPowerW: z.number().min(0),
  dailyHours: z.number().min(0).max(24),
  isCriticalBackupLoad: z.boolean().default(false),
  surgeFactor: z.number().min(1).max(10).default(1),
});

const siteHazardSchema = z.object({
  id: z.string().min(1),
  hazardType: z.string().min(1).max(80),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1).max(500),
  mitigationPlan: z.string().max(500).default(''),
});

const createSurveySchema = z.object({
  projectId: z.string().uuid(),
  ambientMinTempC: z.number().min(-40).max(60).default(5),
  ambientMaxTempC: z.number().min(-20).max(70).default(46),
  earthingAvailable: z.boolean().default(false),
  notes: z.string().max(2000).default(''),
  roofSections: z.array(roofSectionSchema).default([]),
  loadProfiles: z.array(loadProfileItemSchema).default([]),
  siteHazards: z.array(siteHazardSchema).default([]),
});

const updateSurveySchema = z.object({
  baseRowVersion: z.number().int().min(1),
  ambientMinTempC: z.number().min(-40).max(60).optional(),
  ambientMaxTempC: z.number().min(-20).max(70).optional(),
  earthingAvailable: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  roofSections: z.array(roofSectionSchema).optional(),
  loadProfiles: z.array(loadProfileItemSchema).optional(),
  siteHazards: z.array(siteHazardSchema).optional(),
});

const presignPhotoSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(120),
  byteSize: z.number().int().min(1),
  sha256Checksum: z.string().length(64),
  caption: z.string().max(255).nullable().optional(),
});

const commitPhotoSchema = z.object({
  fileAttachmentId: z.string().uuid(),
  sha256Checksum: z.string().length(64),
});

const solarModuleSpecSchema = z.object({
  id: z.string().min(1),
  modelName: z.string().min(1),
  manufacturer: z.string().min(1),
  pmaxW: z.number().positive(),
  vocV: z.number().positive(),
  vmpV: z.number().positive(),
  iscA: z.number().positive(),
  impA: z.number().positive(),
  tempCoeffVocPctPerC: z.number(),
  tempCoeffPmaxPctPerC: z.number(),
  maxSystemVoltageV: z.number().positive().default(1500),
  areaM2: z.number().positive(),
  weightKg: z.number().positive(),
});

const inverterSpecSchema = z.object({
  id: z.string().min(1),
  modelName: z.string().min(1),
  manufacturer: z.string().min(1),
  inverterType: z.enum(['on_grid', 'hybrid', 'off_grid']),
  ratedAcPowerW: z.number().positive(),
  maxDcInputW: z.number().positive(),
  maxDcVoltageV: z.number().positive(),
  mpptMinV: z.number().positive(),
  mpptMaxV: z.number().positive(),
  mpptCount: z.number().int().min(1),
  maxInputCurrentPerMpptA: z.number().positive(),
  efficiencyPct: z.number().positive().max(100),
  phases: z.enum(['single', 'three']),
});

const batterySpecSchema = z.object({
  id: z.string().min(1),
  modelName: z.string().min(1),
  manufacturer: z.string().min(1),
  chemistry: z.enum(['LFP', 'LeadAcid', 'NMC']),
  nominalVoltageV: z.number().positive(),
  capacityAh: z.number().positive(),
  energyWh: z.number().positive(),
  maxDodPct: z.number().positive().max(100),
  roundTripEfficiencyPct: z.number().positive().max(100),
});

const solarDesignCalcInputSchema = z.object({
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  loadProfiles: z.array(loadProfileItemSchema).optional(),
  overrideDailyEnergyKwh: z.number().positive().optional(),
  overridePeakPowerKw: z.number().positive().optional(),
  overrideCriticalBackupKwh: z.number().min(0).optional(),
  usableRoofAreaM2: z.number().positive(),
  shadingLossPct: z.number().min(0).max(95).default(3),
  ambientMinTempC: z.number().min(-40).max(60),
  ambientMaxTempC: z.number().min(-20).max(70),
  cellTempRiseAboveAmbientC: z.number().min(0).max(45).optional(),
  peakSunHoursPerDay: z.number().min(1).max(12),
  tiltDegrees: z.number().min(0).max(90),
  azimuthDegrees: z.number().min(0).max(360),
  siteLatitudeDeg: z.number().min(-90).max(90).optional(),
  windSpeedMs: z.number().min(5).max(80).optional(),
  module: solarModuleSpecSchema,
  inverter: inverterSpecSchema,
  battery: batterySpecSchema.nullable().optional(),
  modulesInSeries: z.number().int().min(1),
  parallelStringsPerMppt: z.number().int().min(1),
  activeMpptCount: z.number().int().min(1),
  inverterCount: z.number().int().min(1).default(1),
  batteryUnitsCount: z.number().int().min(0).optional(),
  autonomyDays: z.number().min(0).max(14).optional(),
  dcCableOneWayLengthM: z.number().min(1),
  dcCableCrossSectionMm2: z.number().min(1.5),
  acCableOneWayLengthM: z.number().min(1),
  acCableCrossSectionMm2: z.number().min(1.5),
  acPowerFactor: z.number().min(0.7).max(1).optional(),
  performanceRatio: z.number().min(0.5).max(0.95).optional(),
  panelDegradationPctPerYear: z.number().min(0).max(2).optional(),
  gridEmissionFactorKgPerKwh: z.number().min(0).max(2).optional(),
  systemCapexAmount: z.number().min(0),
  gridTariffPerKwh: z.number().min(0),
  exportTariffPerKwh: z.number().min(0),
  tariffEscalationPctPerYear: z.number().min(0).max(25).optional(),
  annualOmCost: z.number().min(0),
  discountRatePct: z.number().min(0).max(30).optional(),
});

const createSolarDesignSchema = z.object({
  projectId: z.string().uuid(),
  siteSurveyId: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
  calculationInput: solarDesignCalcInputSchema,
});

const updateSolarDesignRevisionSchema = z.object({
  baseRowVersion: z.number().int().min(1),
  notes: z.string().max(2000).optional(),
  calculationInput: solarDesignCalcInputSchema,
});

const newSolarDesignRevisionSchema = z.object({
  notes: z.string().max(2000).optional(),
  calculationInput: solarDesignCalcInputSchema,
});

const reviewDesignSchema = z.object({
  reviewNotes: z.string().min(2).max(1000).default('Approved per electrical & structural standards'),
  revisionNumber: z.number().int().min(1).optional(),
});

const createWarehouseSchema = z.object({
  code: z.string().min(2).max(48),
  name: z.string().min(2).max(140),
  address: z.string().max(300).nullable().optional(),
  isDefault: z.boolean().optional(),
});

const createSupplierSchema = z.object({
  name: z.string().min(2).max(180),
  contactName: z.string().max(140).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().nullable().optional(),
  paymentTerms: z.string().max(120).nullable().optional(),
});

const createCatalogItemSchema = z.object({
  sku: z.string().min(2).max(80),
  category: z.enum([
    'pv_module',
    'inverter',
    'battery',
    'cable',
    'breaker',
    'mounting',
    'earthing',
    'accessory',
  ]),
  manufacturerName: z.string().min(1).max(160),
  modelName: z.string().min(2).max(180),
  unitOfMeasure: z.string().min(1).max(24).default('pcs'),
  unitCostMinor: z.number().int().min(0),
  unitSellPriceMinor: z.number().int().min(0),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  warrantyMonths: z.number().int().min(0).default(12),
  reorderLevel: z.number().min(0).default(5),
  isSerialized: z.boolean().default(true),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  items: z
    .array(
      z.object({
        equipmentCatalogId: z.string().uuid(),
        quantityOrdered: z.number().positive(),
        unitCostMinor: z.number().int().min(0),
      }),
    )
    .min(1),
});

const receivePoGoodsSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  equipmentCatalogId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  serialNumbers: z.array(z.string().min(2).max(160)).optional(),
  notes: z.string().max(500).optional(),
});

const reserveStockSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  equipmentCatalogId: z.string().uuid(),
  quantity: z.number().positive(),
});

const issueStockSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  equipmentCatalogId: z.string().uuid(),
  quantity: z.number().positive(),
  reservationId: z.string().uuid().optional(),
  serialNumbers: z.array(z.string().min(2).max(160)).optional(),
  notes: z.string().max(500).optional(),
});

const returnStockSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  projectId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  equipmentCatalogId: z.string().uuid(),
  quantity: z.number().positive(),
  serialNumbers: z.array(z.string().min(2).max(160)).optional(),
  notes: z.string().max(500).optional(),
});

const writeOffSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  warehouseId: z.string().uuid(),
  equipmentCatalogId: z.string().uuid(),
  quantity: z.number().positive(),
  serialNumbers: z.array(z.string().min(2).max(160)).optional(),
  reason: z.string().min(3).max(500),
});

const quotationLineItemSchema = z.object({
  id: z.string().optional(),
  equipmentCatalogId: z.string().uuid().nullable().optional(),
  lineType: z.enum(['equipment', 'material', 'labor', 'transport', 'service']),
  description: z.string().min(2).max(255),
  quantity: z.number().positive(),
  unitCostMinor: z.number().int().min(0),
  unitPriceMinor: z.number().int().min(0),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
});

const createQuotationSchema = z.object({
  projectId: z.string().uuid(),
  designRevisionId: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  termsAndConditions: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
  discountMinor: z.number().int().min(0).default(0),
  items: z.array(quotationLineItemSchema).min(1),
});

const updateQuotationRevisionSchema = z.object({
  baseRowVersion: z.number().int().min(1),
  title: z.string().min(2).max(200).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  termsAndConditions: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
  discountMinor: z.number().int().min(0).optional(),
  items: z.array(quotationLineItemSchema).min(1),
});

const newQuotationRevisionSchema = z.object({
  designRevisionId: z.string().uuid().nullable().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  termsAndConditions: z.string().max(4000).optional(),
  notes: z.string().max(2000).optional(),
  discountMinor: z.number().int().min(0).optional(),
  items: z.array(quotationLineItemSchema).min(1),
});

const reviewQuotationSchema = z.object({
  notes: z.string().min(2).max(1000).default('Commercial proposal accepted'),
  customerSignoffName: z.string().max(160).nullable().optional(),
  revisionNumber: z.number().int().min(1).optional(),
});

const createTaxRuleSchema = z.object({
  code: z.string().min(2).max(48),
  name: z.string().min(2).max(120),
  rateBps: z.number().int().min(0).max(10000),
  countryCode: z.string().length(2).default('PK'),
});

const createInvoiceSchema = z.object({
  projectId: z.string().uuid(),
  quotationRevisionId: z.string().uuid().nullable().optional(),
  invoiceType: z.enum(['advance', 'progress', 'final']),
  dueDate: z.string().min(8).max(32),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(2).max(255),
        quantity: z.number().positive(),
        unitPriceMinor: z.number().int().min(0),
        taxRuleId: z.string().uuid().nullable().optional(),
        taxRateBps: z.number().int().min(0).max(10000).optional(),
      }),
    )
    .min(1),
});

const recordPaymentSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  customerId: z.string().uuid(),
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque', 'card', 'online']),
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  amountMinor: z.number().int().positive(),
  referenceNo: z.string().max(120).nullable().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        allocatedMinor: z.number().int().positive(),
      }),
    )
    .default([]),
});

const issueCreditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  reason: z.string().min(3).max(500),
});

const manualJournalSchema = z.object({
  currency: z.enum(['PKR', 'USD', 'AED', 'EUR', 'GBP']).default('PKR'),
  description: z.string().min(3).max(300),
  referenceId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        accountCode: z.string().min(2).max(32),
        accountName: z.string().min(2).max(120),
        debitMinor: z.number().int().min(0),
        creditMinor: z.number().int().min(0),
      }),
    )
    .min(2),
});

const createInstallationJobSchema = z.object({
  projectId: z.string().uuid(),
  supervisorUserId: z.string().uuid().optional(),
  scheduledStartDate: z.string().min(8).max(32),
  scheduledEndDate: z.string().min(8).max(32).nullable().optional(),
  taskTitles: z.array(z.string().min(2).max(200)).min(1).max(30).optional(),
  teamAssignments: z
    .array(
      z.object({
        userId: z.string().uuid(),
        fullName: z.string().min(2).max(160),
        roleOnSite: z.string().min(2).max(80),
      }),
    )
    .optional(),
});

const assignInstallationTeamSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2).max(160),
  roleOnSite: z.string().min(2).max(80),
});

const updateInstallationTaskSchema = z.object({
  baseRowVersion: z.number().int().min(1),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
  assignedUserId: z.string().uuid().nullable().optional(),
});

const addDailySiteLogSchema = z.object({
  logDate: z.string().min(8).max(32),
  weatherConditions: z.string().max(120).nullable().optional(),
  workSummary: z.string().min(3).max(2000),
});

const issueJobMaterialSchema = z.object({
  idempotencyKey: z.string().min(4).max(128),
  warehouseId: z.string().uuid(),
  equipmentCatalogId: z.string().uuid(),
  quantity: z.number().positive(),
  reservationId: z.string().uuid().optional(),
  serialNumbers: z.array(z.string().min(2).max(160)).optional(),
  notes: z.string().max(500).optional(),
});

const createRiskAssessmentSchema = z.object({
  installationJobId: z.string().uuid(),
  workingAtHeightRequired: z.boolean().default(true),
  electricalIsolationVerified: z.boolean().default(false),
  ppeComplianceVerified: z.boolean().default(false),
  hazardNotes: z.string().max(2000).optional(),
});

const reviewSafetySchema = z.object({
  notes: z.string().min(2).max(1000).default('Verified per IEC 62446-1 & site safety standards'),
});

const recordSafetyChecklistSchema = z.object({
  installationJobId: z.string().uuid(),
  checklistType: z.enum(['ppe', 'working_at_height', 'electrical_isolation', 'loto_lockout']),
  items: z
    .array(
      z.object({
        code: z.string().min(2).max(40),
        label: z.string().min(2).max(240),
        verified: z.boolean(),
        notes: z.string().max(400).optional(),
      }),
    )
    .min(1),
});

const reportIncidentSchema = z.object({
  installationJobId: z.string().uuid().nullable().optional(),
  severity: z.enum(['near_miss', 'minor', 'major', 'critical']),
  description: z.string().min(3).max(2000),
  immediateActionTaken: z.string().max(1000).nullable().optional(),
});

const resolveIncidentSchema = z.object({
  actionNotes: z.string().min(3).max(1000),
});

const createInspectionSchema = z.object({
  installationJobId: z.string().uuid(),
  items: z
    .array(
      z.object({
        checkCode: z.string().min(2).max(64),
        description: z.string().min(2).max(255),
        result: z.enum(['pass', 'fail', 'na']),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1),
  testReadings: z
    .array(
      z.object({
        parameterName: z.string().min(2).max(100),
        measuredValue: z.number(),
        unit: z.string().min(1).max(24),
        withinTolerance: z.boolean(),
      }),
    )
    .default([]),
  initialCorrectiveAction: z.string().max(500).optional(),
});

const addCorrectiveActionSchema = z.object({
  description: z.string().min(3).max(1000),
  assignedToUserId: z.string().uuid().nullable().optional(),
  dueDate: z.string().max(32).nullable().optional(),
});

const updateCorrectiveActionSchema = z.object({
  status: z.enum(['open', 'resolved', 'verified']),
});

const createCommissioningSchema = z.object({
  projectId: z.string().uuid(),
  installationJobId: z.string().uuid(),
});

const addCommissioningTestSchema = z.object({
  testName: z.string().min(2).max(160),
  measuredValue: z.string().min(1).max(160),
  passed: z.boolean(),
});

const approveRejectCommissioningSchema = z.object({
  notes: z.string().min(2).max(1000).default('Verified commissioning suite & safety clearance'),
  telemetryProvider: z.string().max(120).nullable().optional(),
});

const acknowledgeHandoverSchema = z.object({
  signoffName: z.string().min(2).max(160),
});

const createMaintenanceScheduleSchema = z.object({
  projectId: z.string().uuid(),
  scheduleType: z.enum(['cleaning', 'preventive', 'inverter_check']),
  intervalDays: z.number().int().min(1).max(1825),
  nextDueDate: z.string().min(8).max(32),
  isActive: z.boolean().optional(),
});

const createServiceTicketSchema = z.object({
  projectId: z.string().uuid(),
  assetId: z.string().uuid().nullable().optional(),
  ticketType: z.enum(['preventive', 'corrective', 'cleaning', 'warranty']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  summary: z.string().min(3).max(200),
  description: z.string().min(3).max(4000),
});

const assignTicketTechnicianSchema = z.object({
  technicianUserId: z.string().uuid(),
});

const updateTicketStatusSchema = z.object({
  baseRowVersion: z.number().int().min(1),
  status: z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed']),
});

const addServiceVisitSchema = z.object({
  findings: z.string().min(3).max(2000),
  actionsTaken: z.string().min(3).max(2000),
});

const createWarrantyClaimSchema = z.object({
  assetId: z.string().uuid(),
  serviceTicketId: z.string().uuid().nullable().optional(),
  faultDescription: z.string().min(3).max(3000),
});

const decideWarrantyClaimSchema = z.object({
  decision: z.enum(['approved', 'replaced', 'rejected']),
  resolutionNotes: z.string().min(2).max(2000),
  replacementSerialNumber: z.string().max(160).nullable().optional(),
});

export interface MigrationAuditSummary {
  migrationFiles: string[];
  tableCount: number;
  tables: string[];
  rlsTableCount: number;
  triggerCount: number;
  indexCount: number;
}

export function inspectPostgresMigrations(drizzleDir: string): MigrationAuditSummary {
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const sql0001 = fs.readFileSync(path.join(drizzleDir, '0001_initial_schema.sql'), 'utf8');
  const sql0002Path = path.join(drizzleDir, '0002_rls_and_immutability.sql');
  const sql0002 = fs.existsSync(sql0002Path) ? fs.readFileSync(sql0002Path, 'utf8') : '';

  const tableMatches = [...sql0001.matchAll(/CREATE TABLE\s+([a-z_]+)\s*\(/gi)];
  const tables = tableMatches.map((m) => m[1]);
  const indexMatches = [...sql0001.matchAll(/CREATE INDEX\s+([a-z_]+)/gi)];
  const triggerMatches = [...sql0002.matchAll(/CREATE TRIGGER\s+([a-z_]+)/gi)];

  const rlsBlockMatch = sql0002.match(/tenant_tables\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\];/);
  const rlsTables = rlsBlockMatch
    ? [...rlsBlockMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];

  return {
    migrationFiles: files,
    tableCount: tables.length,
    tables,
    rlsTableCount: rlsTables.length,
    triggerCount: triggerMatches.length,
    indexCount: indexMatches.length,
  };
}

export function createApiV1Router(options?: {
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  drizzleDir?: string;
  authService?: InMemoryAuthTenantService;
}) {
  const router = express.Router();
  const rateLimitMax = options?.rateLimitMax ?? 120;
  const rateLimitWindowMs = options?.rateLimitWindowMs ?? 60_000;
  const drizzleDir =
    options?.drizzleDir ?? path.resolve(process.cwd(), 'apps/api/drizzle');
  const authService = options?.authService ?? new InMemoryAuthTenantService();
  const syncService = new InMemorySyncEngineService();
  const customersSurveysService = new InMemoryCustomersSurveysService();
  const solarEngineeringService = new InMemorySolarEngineeringService(customersSurveysService);
  const inventoryService = new InMemoryInventoryService(customersSurveysService);
  const quotationsBillingService = new InMemoryQuotationsBillingService(
    customersSurveysService,
    solarEngineeringService,
    inventoryService,
  );
  const installationService = new InMemoryInstallationService(
    customersSurveysService,
    inventoryService,
  );
  const safetyService = new InMemorySafetyService(
    customersSurveysService,
    installationService,
  );
  const commissioningService = new InMemoryCommissioningService(
    customersSurveysService,
    installationService,
    safetyService,
    inventoryService,
  );
  const maintenanceService = new InMemoryMaintenanceService(
    customersSurveysService,
    commissioningService,
  );

  const hits = new Map<string, { count: number; resetAt: number }>();

  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  router.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);
    res.locals.requestId = requestId;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Vary', 'Origin');
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-Id');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const key = req.ip || 'local';
    const now = Date.now();
    const current = hits.get(key);
    if (!current || now >= current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
      res.setHeader('X-RateLimit-Limit', String(rateLimitMax));
      res.setHeader('X-RateLimit-Remaining', String(rateLimitMax - 1));
      return next();
    }

    current.count += 1;
    const remaining = Math.max(0, rateLimitMax - current.count);
    res.setHeader('X-RateLimit-Limit', String(rateLimitMax));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (current.count > rateLimitMax) {
      return res.status(429).json({
        error: {
          statusCode: 429,
          requestId,
          message: 'Rate limit exceeded',
        },
      });
    }

    next();
  });

  async function requireAuth(req: Request, res: Response): Promise<AccessTokenClaims | null> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({
        error: { statusCode: 401, requestId: res.locals.requestId, message: 'Missing bearer token' },
      });
      return null;
    }
    const token = header.slice('Bearer '.length).trim();
    const claims = await authService.verifyAccessToken(token);
    return claims;
  }

  function handleError(res: Response, err: unknown) {
    if (err instanceof AuthServiceError) {
      return res.status(err.statusCode).json({
        error: {
          statusCode: err.statusCode,
          code: err.code,
          requestId: res.locals.requestId,
          message: err.message,
        },
      });
    }
    return res.status(500).json({
      error: {
        statusCode: 500,
        requestId: res.locals.requestId,
        message: 'Internal server error',
      },
    });
  }

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      service: 'vnex-solar-api',
      status: 'ok',
      apiVersion: 'v1',
      orm: 'drizzle-postgresql',
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(VNEX_OPENAPI_SPEC);
  });

  router.get('/meta/schema-summary', (req: Request, res: Response) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          statusCode: 400,
          requestId: res.locals.requestId,
          message: 'Validation failed',
          issues: parsed.error.issues,
        },
      });
    }

    const summary = inspectPostgresMigrations(drizzleDir);
    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const pagedTables = summary.tables.slice(offset, offset + limit);

    return res.json({
      migrationFiles: summary.migrationFiles,
      totalTables: summary.tableCount,
      rlsProtectedTables: summary.rlsTableCount,
      immutabilityTriggers: summary.triggerCount,
      targetedIndexes: summary.indexCount,
      pagination: { page, limit, total: summary.tableCount },
      tables: pagedTables,
    });
  });

  router.get('/meta/security-posture', (_req: Request, res: Response) => {
    const summary = inspectPostgresMigrations(drizzleDir);
    const openApiPathsCount = Object.keys(VNEX_OPENAPI_SPEC.paths).length;
    return res.json({
      passwordHashing: 'argon2id',
      accessTokenAlgorithm: 'HS256',
      refreshTokenRotation: true,
      bruteForceLockoutEnabled: true,
      securityHeadersHardened: true,
      cspPolicy: "default-src 'none'; frame-ancestors 'none'",
      minorUnitCurrencyOnly: true,
      openApiPathsCount,
      totalTables: summary.tableCount,
      rlsProtectedTables: summary.rlsTableCount,
      immutabilityTriggers: summary.triggerCount,
      targetedIndexes: summary.indexCount,
    });
  });

  // ============================================================================
  // PHASE 3: AUTHENTICATION & SESSION MANAGEMENT
  // ============================================================================

  router.post('/auth/register-organization', async (req: Request, res: Response) => {
    const parsed = registerOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const result = await authService.registerOrganization({
        ...parsed.data,
        requestId: res.locals.requestId,
      });
      return res.status(201).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const result = await authService.login({
        ...parsed.data,
        requestId: res.locals.requestId,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/auth/refresh', async (req: Request, res: Response) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const result = await authService.refreshSession({
        refreshToken: parsed.data.refreshToken,
        requestId: res.locals.requestId,
      });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/auth/logout', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(authService.logoutSession(claims, res.locals.requestId));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/auth/logout-all', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(authService.logoutAllOrgSessions(claims, res.locals.requestId));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/auth/me', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const org = authService.getCurrentOrganization(claims);
      return res.json({
        userId: claims.sub,
        organizationId: claims.orgId,
        organizationName: org.displayName,
        role: claims.role,
        sessionId: claims.sessionId,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 3: MULTI-TENANT ORGANIZATION, RBAC & AUDIT TRAIL
  // ============================================================================

  router.get('/organizations/current', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(authService.getCurrentOrganization(claims));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch('/organizations/current', async (req: Request, res: Response) => {
    const parsed = updateOrgSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(
        authService.updateCurrentOrganization(claims, parsed.data, res.locals.requestId),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/organizations/members', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json({ members: authService.listOrganizationMembers(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/organizations/members', async (req: Request, res: Response) => {
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const created = await authService.inviteAndProvisionMember(
        claims,
        parsed.data,
        res.locals.requestId,
      );
      return res.status(201).json(created);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/organizations/audit-events', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json({ events: authService.listAuditEvents(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 5: CUSTOMERS, SITES, PROJECTS & SITE SURVEYS
  // ============================================================================

  router.get('/customers', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:read');
      const search = typeof req.query.q === 'string' ? req.query.q : undefined;
      return res.json({ customers: customersSurveysService.listCustomers(claims, search) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/customers', async (req: Request, res: Response) => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:write');
      return res.status(201).json(customersSurveysService.createCustomer(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch('/customers/:id', async (req: Request, res: Response) => {
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:write');
      return res.json(
        customersSurveysService.updateCustomer(claims, String(req.params.id), parsed.data),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/customers/:id/sites', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:read');
      return res.json({
        sites: customersSurveysService.listSitesForCustomer(claims, String(req.params.id)),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/customers/:id/sites', async (req: Request, res: Response) => {
    const parsed = createSiteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:write');
      return res
        .status(201)
        .json(customersSurveysService.createSite(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/projects', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:read');
      return res.json({ projects: customersSurveysService.listProjects(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/projects', async (req: Request, res: Response) => {
    const parsed = createFullProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'customers:write');
      if (parsed.data.customerId && parsed.data.siteId) {
        const project = customersSurveysService.createProject(claims, {
          customerId: parsed.data.customerId,
          siteId: parsed.data.siteId,
          title: parsed.data.title,
          systemType: parsed.data.systemType,
          targetCapacityKwp: parsed.data.targetCapacityKwp ?? null,
          currency: parsed.data.currency,
          assignedUserIds: parsed.data.assignedUserIds,
        });
        return res.status(201).json(project);
      }
      const project = authService.createProjectStub(
        claims,
        parsed.data.title,
        parsed.data.assignedUserIds ?? [],
      );
      return res.status(201).json(project);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/projects/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const id = String(req.params.id);
      try {
        return res.json(customersSurveysService.getProject(claims, id));
      } catch (innerErr) {
        if (innerErr instanceof AuthServiceError && innerErr.statusCode === 404) {
          return res.json(authService.getProjectStub(claims, id));
        }
        throw innerErr;
      }
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/surveys', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ surveys: customersSurveysService.listSurveys(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/surveys', async (req: Request, res: Response) => {
    const parsed = createSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:write');
      return res.status(201).json(customersSurveysService.createSurvey(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/surveys/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:read');
      return res.json(customersSurveysService.getSurvey(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.put('/surveys/:id', async (req: Request, res: Response) => {
    const parsed = updateSurveySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:write');
      return res.json(
        customersSurveysService.updateSurvey(claims, String(req.params.id), parsed.data),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/surveys/:id/submit', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:write');
      return res.json(customersSurveysService.submitSurvey(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/surveys/:id/photos/presign', async (req: Request, res: Response) => {
    const parsed = presignPhotoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:write');
      return res
        .status(201)
        .json(
          customersSurveysService.presignSurveyPhotoUpload(
            claims,
            String(req.params.id),
            parsed.data,
          ),
        );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/surveys/:id/photos/commit', async (req: Request, res: Response) => {
    const parsed = commitPhotoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'surveys:write');
      return res
        .status(201)
        .json(
          customersSurveysService.commitSurveyPhotoUpload(
            claims,
            String(req.params.id),
            parsed.data,
          ),
        );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/files', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'survey.jpg';
      return res.status(201).json(authService.createFileStub(claims, filename));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/files/:id/download', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const fileId = String(req.params.id);
      try {
        return res.json(customersSurveysService.getAuthorizedPhotoDownload(claims, fileId));
      } catch (innerErr) {
        if (innerErr instanceof AuthServiceError && innerErr.statusCode === 404) {
          return res.json(authService.getFileDownloadGrant(claims, fileId));
        }
        throw innerErr;
      }
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 6: SOLAR ENGINEERING & DETERMINISTIC CALCULATIONS
  // ============================================================================

  router.get('/engineering/catalog', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:read');
      return res.json(solarEngineeringService.getCatalog(claims));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/calculate-preview', async (req: Request, res: Response) => {
    const parsed = solarDesignCalcInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:read');
      return res.json(calculateSolarDesignEngineering(parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/engineering/designs', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ designs: solarEngineeringService.listDesigns(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/designs', async (req: Request, res: Response) => {
    const parsed = createSolarDesignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:write');
      return res.status(201).json(solarEngineeringService.createDesign(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/engineering/designs/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:read');
      return res.json(solarEngineeringService.getDesignDetail(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.put('/engineering/designs/:id/revisions/:revNumber', async (req: Request, res: Response) => {
    const parsed = updateSolarDesignRevisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:write');
      return res.json(
        solarEngineeringService.updateDraftRevision(
          claims,
          String(req.params.id),
          Number(req.params.revNumber),
          parsed.data,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/designs/:id/revisions', async (req: Request, res: Response) => {
    const parsed = newSolarDesignRevisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:write');
      return res
        .status(201)
        .json(solarEngineeringService.createNewRevision(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/designs/:id/revisions/:revNumber/submit', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:write');
      return res.json(
        solarEngineeringService.submitRevision(
          claims,
          String(req.params.id),
          Number(req.params.revNumber),
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/designs/:id/approve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:approve');
      const parsed = reviewDesignSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        solarEngineeringService.approveOrRejectRevision(
          claims,
          String(req.params.id),
          'approved',
          parsed.data.reviewNotes,
          parsed.data.revisionNumber,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/engineering/designs/:id/reject', async (req: Request, res: Response) => {
    const parsed = reviewDesignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'engineering:approve');
      return res.json(
        solarEngineeringService.approveOrRejectRevision(
          claims,
          String(req.params.id),
          'rejected',
          parsed.data.reviewNotes,
          parsed.data.revisionNumber,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 7: EQUIPMENT & INVENTORY MANAGEMENT
  // ============================================================================

  router.get('/inventory/warehouses', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      return res.json({ warehouses: inventoryService.listWarehouses(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/warehouses', async (req: Request, res: Response) => {
    const parsed = createWarehouseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.createWarehouse(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/suppliers', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      return res.json({ suppliers: inventoryService.listSuppliers(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/suppliers', async (req: Request, res: Response) => {
    const parsed = createSupplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.createSupplier(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/catalog', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      const category =
        typeof req.query.category === 'string'
          ? (req.query.category as
              | 'pv_module'
              | 'inverter'
              | 'battery'
              | 'cable'
              | 'breaker'
              | 'mounting'
              | 'earthing'
              | 'accessory')
          : undefined;
      return res.json({ items: inventoryService.listCatalog(claims, category) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/catalog', async (req: Request, res: Response) => {
    const parsed = createCatalogItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.createCatalogItem(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/balances', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      return res.json(inventoryService.listBalances(claims));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/purchase-orders', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      return res.json({ purchaseOrders: inventoryService.listPurchaseOrders(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/purchase-orders', async (req: Request, res: Response) => {
    const parsed = createPurchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.createPurchaseOrder(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/purchase-orders/:id/issue', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.json(inventoryService.issuePurchaseOrder(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/purchase-orders/:id/receive', async (req: Request, res: Response) => {
    const parsed = receivePoGoodsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res
        .status(201)
        .json(inventoryService.receivePurchaseOrderGoods(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/reservations', async (req: Request, res: Response) => {
    const parsed = reserveStockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.reserveStock(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/issues', async (req: Request, res: Response) => {
    const parsed = issueStockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.issueToProject(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/returns', async (req: Request, res: Response) => {
    const parsed = returnStockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.returnToStock(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/inventory/write-offs', async (req: Request, res: Response) => {
    const parsed = writeOffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:transact');
      return res.status(201).json(inventoryService.writeOffDamaged(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/movements', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      const catalogId =
        typeof req.query.equipmentCatalogId === 'string'
          ? req.query.equipmentCatalogId
          : undefined;
      return res.json({ movements: inventoryService.listMovements(claims, catalogId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/inventory/serials', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'inventory:read');
      return res.json({
        serials: inventoryService.listSerials(claims, {
          serialNumber: typeof req.query.q === 'string' ? req.query.q : undefined,
          projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
        }),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 11: COMMISSIONING, HANDOVER CERTIFICATES & QR ASSET REGISTER
  // ============================================================================

  router.get('/commissioning', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'commissioning:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ records: commissioningService.listRecords(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/commissioning', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['commissioning:approve', 'installation:manage']);
      const parsed = createCommissioningSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(commissioningService.createRecord(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/commissioning/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'commissioning:read');
      return res.json(commissioningService.getRecord(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/commissioning/:id/tests', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['commissioning:approve', 'installation:manage']);
      const parsed = addCommissioningTestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(commissioningService.addCommissioningTest(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/commissioning/:id/approve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'commissioning:approve');
      const parsed = approveRejectCommissioningSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        commissioningService.approveOrReject(
          claims,
          String(req.params.id),
          'approved',
          parsed.data.notes,
          parsed.data.telemetryProvider,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/commissioning/:id/reject', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'commissioning:approve');
      const parsed = approveRejectCommissioningSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        commissioningService.approveOrReject(
          claims,
          String(req.params.id),
          'rejected',
          parsed.data.notes,
          parsed.data.telemetryProvider,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post(
    '/commissioning/:id/handovers/:handoverId/acknowledge',
    async (req: Request, res: Response) => {
      try {
        const claims = await requireAuth(req, res);
        if (!claims) return;
        authService.requirePermission(claims, 'commissioning:read');
        const parsed = acknowledgeHandoverSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
          });
        }
        return res.json(
          commissioningService.acknowledgeHandover(
            claims,
            String(req.params.id),
            String(req.params.handoverId),
            parsed.data.signoffName,
          ),
        );
      } catch (err) {
        return handleError(res, err);
      }
    },
  );

  router.get('/commissioning/:id/printable', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'commissioning:read');
      const org = authService.getCurrentOrganization(claims);
      return res.json(
        commissioningService.renderPrintableCertificateHtml(
          claims,
          String(req.params.id),
          org.displayName,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/assets', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['commissioning:read', 'maintenance:read']);
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ assets: commissioningService.listAssets(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 12: MAINTENANCE SCHEDULES, SERVICE TICKETS, QR ASSET LOOKUP & WARRANTY
  // ============================================================================

  router.get('/assets/qr/:qrToken', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['commissioning:read', 'maintenance:read']);
      return res.json(
        maintenanceService.lookupQrAssetWorkspace(claims, String(req.params.qrToken)),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/maintenance/schedules', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ schedules: maintenanceService.listSchedules(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/schedules', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['org:manage', 'users:manage']);
      const parsed = createMaintenanceScheduleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(maintenanceService.createSchedule(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/schedules/:id/trigger', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['org:manage', 'users:manage']);
      return res
        .status(201)
        .json(maintenanceService.triggerSchedule(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/maintenance/tickets', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:read');
      return res.json({
        tickets: maintenanceService.listTickets(claims, {
          projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
          assetId: typeof req.query.assetId === 'string' ? req.query.assetId : undefined,
          status:
            typeof req.query.status === 'string'
              ? (req.query.status as 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed')
              : undefined,
        }),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/tickets', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:write');
      const parsed = createServiceTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(maintenanceService.createTicket(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/maintenance/tickets/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:read');
      return res.json(maintenanceService.getTicket(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/tickets/:id/assign', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['org:manage', 'users:manage']);
      const parsed = assignTicketTechnicianSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        maintenanceService.assignTechnician(
          claims,
          String(req.params.id),
          parsed.data.technicianUserId,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch('/maintenance/tickets/:id/status', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:write');
      const parsed = updateTicketStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        maintenanceService.updateTicketStatus(claims, String(req.params.id), parsed.data),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/tickets/:id/visits', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:write');
      const parsed = addServiceVisitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(maintenanceService.addServiceVisit(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/maintenance/warranty-claims', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:read');
      const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined;
      return res.json({ claims: maintenanceService.listWarrantyClaims(claims, assetId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/warranty-claims', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:write');
      const parsed = createWarrantyClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(maintenanceService.createWarrantyClaim(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/maintenance/warranty-claims/:id/submit', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'maintenance:write');
      return res.json(maintenanceService.submitWarrantyClaim(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch('/maintenance/warranty-claims/:id/decision', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requireAnyPermission(claims, ['org:manage', 'users:manage']);
      const parsed = decideWarrantyClaimSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        maintenanceService.decideWarrantyClaim(claims, String(req.params.id), parsed.data),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 8: QUOTATIONS, BILLING, PAYMENTS, CREDIT NOTES & DOUBLE-ENTRY LEDGER
  // ============================================================================

  router.get('/quotations', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ quotations: quotationsBillingService.listQuotations(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations/from-design/:designId', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:write');
      const draftInput = quotationsBillingService.buildBomDraftFromDesign(
        claims,
        String(req.params.designId),
      );
      const createImmediately = req.query.create === 'true' || req.body?.create === true;
      if (createImmediately) {
        return res.status(201).json(
          quotationsBillingService.createQuotation(claims, {
            projectId: draftInput.projectId,
            designRevisionId: draftInput.designRevisionId,
            title: draftInput.title,
            currency: draftInput.currency,
            items: draftInput.items,
          }),
        );
      }
      return res.json(draftInput);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:write');
      const parsed = createQuotationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(quotationsBillingService.createQuotation(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/quotations/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:read');
      return res.json(quotationsBillingService.getQuotationDetail(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.put('/quotations/:id/revisions/:revNumber', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:write');
      const parsed = updateQuotationRevisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        quotationsBillingService.updateDraftRevision(
          claims,
          String(req.params.id),
          Number(req.params.revNumber),
          parsed.data,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations/:id/revisions', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:write');
      const parsed = newQuotationRevisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(quotationsBillingService.createNewRevision(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations/:id/send', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:write');
      const revNum = typeof req.body?.revisionNumber === 'number' ? req.body.revisionNumber : undefined;
      return res.json(quotationsBillingService.sendQuotation(claims, String(req.params.id), revNum));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations/:id/approve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:approve');
      const parsed = reviewQuotationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        quotationsBillingService.approveOrRejectQuotation(
          claims,
          String(req.params.id),
          'approved',
          parsed.data.notes,
          parsed.data.customerSignoffName,
          parsed.data.revisionNumber,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/quotations/:id/reject', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:approve');
      const parsed = reviewQuotationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        quotationsBillingService.approveOrRejectQuotation(
          claims,
          String(req.params.id),
          'rejected',
          parsed.data.notes,
          parsed.data.customerSignoffName,
          parsed.data.revisionNumber,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/quotations/:id/printable', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'quotations:read');
      const org = authService.getCurrentOrganization(claims);
      const revNumber = req.query.revisionNumber ? Number(req.query.revisionNumber) : undefined;
      return res.json(
        quotationsBillingService.renderPrintableQuotationHtml(
          claims,
          String(req.params.id),
          org.displayName,
          revNumber,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/summary', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      return res.json(quotationsBillingService.getFinanceSummary(claims));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/tax-rules', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      return res.json({ taxRules: quotationsBillingService.listTaxRules(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/tax-rules', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      const parsed = createTaxRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(quotationsBillingService.createTaxRule(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/invoices', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ invoices: quotationsBillingService.listInvoices(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/invoices', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      const parsed = createInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(quotationsBillingService.createInvoice(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/invoices/:id/issue', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      return res.json(quotationsBillingService.issueInvoice(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/payments', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      return res.json({ payments: quotationsBillingService.listPayments(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/payments', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      const parsed = recordPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(quotationsBillingService.recordPaymentAndAllocate(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/credit-notes', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      return res.json({ creditNotes: quotationsBillingService.listCreditNotes(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/credit-notes', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      const parsed = issueCreditNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(quotationsBillingService.issueCreditNote(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/finance/journals', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:read');
      return res.json({ journals: quotationsBillingService.listJournalEntries(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/finance/journals', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'finance:post');
      const parsed = manualJournalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(quotationsBillingService.postManualJournalEntry(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 9: INSTALLATION JOBS, TASKS, SITE LOGS & MATERIAL ISSUES
  // ============================================================================

  router.get('/installations', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:read');
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      return res.json({ installations: installationService.listJobs(claims, projectId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:manage');
      const parsed = createInstallationJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      const job = installationService.createJob(claims, parsed.data);
      for (const t of job.tasks) {
        syncService.upsertServerEntityState(claims.orgId, 'installation_task', t.id, t.rowVersion, {
          installationJobId: job.id,
          status: t.status,
          title: t.title,
        });
      }
      return res.status(201).json(job);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/installations/:id', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:read');
      return res.json(installationService.getJob(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/team', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:manage');
      const parsed = assignInstallationTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(installationService.assignTeamMember(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch('/installations/:id/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:update_assigned');
      const parsed = updateInstallationTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      const updated = installationService.updateTaskStatus(
        claims,
        String(req.params.id),
        String(req.params.taskId),
        parsed.data,
      );
      syncService.upsertServerEntityState(
        claims.orgId,
        'installation_task',
        updated.task.id,
        updated.task.rowVersion,
        {
          installationJobId: updated.job.id,
          status: updated.task.status,
          title: updated.task.title,
        },
      );
      return res.json(updated);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/complete', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:manage');
      return res.json(installationService.completeJob(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/logs', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:update_assigned');
      const parsed = addDailySiteLogSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(installationService.addDailySiteLog(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/material-issues', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:read');
      authService.requirePermission(claims, 'inventory:transact');
      const parsed = issueJobMaterialSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(installationService.issueJobMaterial(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/photos/presign', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:update_assigned');
      const parsed = presignPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(
          installationService.presignInstallationPhoto(claims, String(req.params.id), parsed.data),
        );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/installations/:id/photos/commit', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'installation:update_assigned');
      const parsed = commitPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(
          installationService.commitInstallationPhoto(claims, String(req.params.id), parsed.data),
        );
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 10: SAFETY ASSESSMENTS, CHECKLISTS, INCIDENTS, INSPECTIONS & HARD GATES
  // ============================================================================

  router.get('/safety/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:read');
      return res.json(safetyService.getJobSafetyBundle(claims, String(req.params.jobId)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/risk-assessments', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:write');
      const parsed = createRiskAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(safetyService.createRiskAssessment(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/risk-assessments/:id/approve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:approve');
      const parsed = reviewSafetySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        safetyService.approveOrRejectRiskAssessment(
          claims,
          String(req.params.id),
          'approved',
          parsed.data.notes,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/risk-assessments/:id/reject', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:approve');
      const parsed = reviewSafetySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        safetyService.approveOrRejectRiskAssessment(
          claims,
          String(req.params.id),
          'rejected',
          parsed.data.notes,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/checklists', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:write');
      const parsed = recordSafetyChecklistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(safetyService.recordSafetyChecklist(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/safety/incidents', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:read');
      const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
      return res.json({ incidents: safetyService.listIncidents(claims, jobId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/incidents', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:write');
      const parsed = reportIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(safetyService.reportSafetyIncident(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/incidents/:id/resolve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:approve');
      const parsed = resolveIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        safetyService.resolveSafetyIncident(claims, String(req.params.id), parsed.data.actionNotes),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/safety/inspections', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:read');
      const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
      return res.json({ inspections: safetyService.listInspections(claims, jobId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/inspections', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:write');
      const parsed = createInspectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(safetyService.createInspection(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/inspections/:id/corrective-actions', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:write');
      const parsed = addCorrectiveActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res
        .status(201)
        .json(safetyService.addCorrectiveAction(claims, String(req.params.id), parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.patch(
    '/safety/inspections/:id/corrective-actions/:actionId',
    async (req: Request, res: Response) => {
      try {
        const claims = await requireAuth(req, res);
        if (!claims) return;
        authService.requirePermission(claims, 'safety:write');
        const parsed = updateCorrectiveActionSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
          });
        }
        if (parsed.data.status === 'verified') {
          authService.requirePermission(claims, 'safety:approve');
        }
        return res.json(
          safetyService.updateCorrectiveActionStatus(
            claims,
            String(req.params.id),
            String(req.params.actionId),
            parsed.data.status,
          ),
        );
      } catch (err) {
        return handleError(res, err);
      }
    },
  );

  router.post('/safety/inspections/:id/approve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:approve');
      const parsed = reviewSafetySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        safetyService.approveOrRejectInspection(
          claims,
          String(req.params.id),
          'approved',
          parsed.data.notes,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/safety/inspections/:id/reject', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      authService.requirePermission(claims, 'safety:approve');
      const parsed = reviewSafetySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        safetyService.approveOrRejectInspection(
          claims,
          String(req.params.id),
          'rejected',
          parsed.data.notes,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 4: OFFLINE SYNCHRONIZATION ENGINE ENDPOINTS
  // ============================================================================

  router.post('/sync/devices/register', async (req: Request, res: Response) => {
    const parsed = registerDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(syncService.registerDevice(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/sync/batch', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot push offline staff sync mutations', 'FORBIDDEN');
      }
      const parsed = syncBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      const batchResult = syncService.processBatch(
        claims,
        parsed.data.deviceId,
        parsed.data.operations,
      );
      for (const op of parsed.data.operations) {
        const resItem = batchResult.results.find(
          (r) => r.syncOperationId === op.syncOperationId,
        );
        if (resItem?.status === 'applied' && !resItem.deduplicated) {
          customersSurveysService.applyOfflineSyncedEntity(
            claims,
            op.entityType,
            op.entityId,
            op.operationType,
            op.payload,
          );
          if (op.entityType === 'solar_design_draft') {
            solarEngineeringService.applyOfflineSyncedDraft(
              claims,
              op.entityId,
              op.operationType,
              op.payload,
            );
          }
          if (op.entityType === 'quotation_draft') {
            quotationsBillingService.applyOfflineSyncedQuotationDraft(
              claims,
              op.entityId,
              op.operationType,
              op.payload,
            );
          }
          if (op.entityType === 'installation_task') {
            installationService.applyOfflineSyncedInstallationTask(
              claims,
              op.entityId,
              op.operationType,
              op.payload,
            );
          }
          if (op.entityType === 'inspection_draft') {
            safetyService.applyOfflineSyncedInspectionDraft(
              claims,
              op.entityId,
              op.operationType,
              op.payload,
            );
          }
          if (op.entityType === 'maintenance_note') {
            maintenanceService.applyOfflineSyncedMaintenanceNote(
              claims,
              op.entityId,
              op.operationType,
              op.payload,
            );
          }
        }
      }
      return res.json(batchResult);
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/delta', async (req: Request, res: Response) => {
    const parsed = syncDeltaQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
      });
    }
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(syncService.getDelta(claims, parsed.data.sinceSeq, parsed.data.limit));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/conflicts', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json({ conflicts: syncService.listConflicts(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/sync/conflicts/:id/resolve', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot resolve staff sync conflicts', 'FORBIDDEN');
      }
      const parsed = resolveConflictSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        syncService.resolveConflict(
          claims,
          String(req.params.id),
          parsed.data.decision,
          parsed.data.mergedPayload,
        ),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ============================================================================
  // PHASE 13: ADVANCED SYNC DEVICES, CHECKPOINTS, DEAD-LETTERS & MEDIA RECOVERY
  // ============================================================================

  router.get('/sync/devices', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json({ devices: syncService.listDevices(claims) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/checkpoints/:deviceId', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(syncService.getCheckpoint(claims, String(req.params.deviceId)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.put('/sync/checkpoints/:deviceId', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot persist sync checkpoints', 'FORBIDDEN');
      }
      const parsed = updateCheckpointSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        syncService.updateCheckpoint(claims, String(req.params.deviceId), parsed.data.lastServerSeq),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/metrics', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      return res.json(syncService.getMetrics(claims));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/dead-letters', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const includeAcknowledged = req.query.includeAcknowledged === 'true';
      return res.json({
        deadLetters: syncService.listDeadLetters(claims, includeAcknowledged),
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/sync/dead-letters/:id/acknowledge', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot acknowledge sync dead letters', 'FORBIDDEN');
      }
      return res.json(syncService.acknowledgeDeadLetter(claims, String(req.params.id)));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.get('/sync/media', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
      return res.json({ items: syncService.listMediaQueue(claims, entityId) });
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/sync/media/presign', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot initiate field sync media uploads', 'FORBIDDEN');
      }
      const parsed = presignMediaRecoverySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.status(201).json(syncService.presignMediaUpload(claims, parsed.data));
    } catch (err) {
      return handleError(res, err);
    }
  });

  router.post('/sync/media/:id/verify', async (req: Request, res: Response) => {
    try {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      if (claims.role === UserRole.CUSTOMER) {
        throw new AuthServiceError(403, 'Customer role cannot verify field sync media uploads', 'FORBIDDEN');
      }
      const parsed = verifyMediaRecoverySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: { statusCode: 400, requestId: res.locals.requestId, issues: parsed.error.issues },
        });
      }
      return res.json(
        syncService.verifyMediaUpload(claims, String(req.params.id), parsed.data.actualSha256),
      );
    } catch (err) {
      return handleError(res, err);
    }
  });

  return router;
}
