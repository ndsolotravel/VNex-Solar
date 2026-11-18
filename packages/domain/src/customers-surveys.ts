import type { SupportedCurrency } from './design-tokens.ts';

export type CustomerType = 'residential' | 'commercial' | 'industrial' | 'agricultural';
export type SystemType = 'on_grid' | 'hybrid' | 'off_grid';
export type SurveyStatus = 'draft' | 'submitted' | 'reviewed' | 'approved';
export type HazardSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CustomerRecord {
  id: string;
  organizationId: string;
  customerCode: string;
  customerType: CustomerType;
  fullName: string;
  companyName: string | null;
  primaryPhone: string | null;
  email: string | null;
  billingAddress: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteRecord {
  id: string;
  organizationId: string;
  customerId: string;
  siteName: string;
  addressLine: string;
  city: string;
  countryCode: string;
  utilityProvider: string | null;
  meterReference: string | null;
  connectionPhase: 'single' | 'three';
  rowVersion: number;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  customerId: string;
  siteId: string;
  projectCode: string;
  title: string;
  systemType: SystemType;
  targetCapacityKwp: number | null;
  currentStage: string;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  currency: SupportedCurrency;
  assignedUserIds: string[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoofSectionInput {
  id: string;
  sectionName: string;
  roofType: string;
  usableAreaM2: number;
  tiltDegrees: number;
  azimuthDegrees: number;
  shadingFactorPct: number;
}

export interface LoadProfileItemInput {
  id: string;
  applianceName: string;
  quantity: number;
  ratedPowerW: number;
  dailyHours: number;
  isCriticalBackupLoad: boolean;
  surgeFactor: number;
}

export interface SiteHazardInput {
  id: string;
  hazardType: string;
  severity: HazardSeverity;
  description: string;
  mitigationPlan: string;
}

export interface SurveyPhotoRecord {
  id: string;
  organizationId: string;
  siteSurveyId: string;
  fileAttachmentId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  caption: string | null;
  capturedAt: string;
}

export interface SiteSurveyRecord {
  id: string;
  organizationId: string;
  projectId: string;
  siteId: string;
  surveyorUserId: string;
  surveyStatus: SurveyStatus;
  surveyedAt: string;
  ambientMinTempC: number;
  ambientMaxTempC: number;
  earthingAvailable: boolean;
  notes: string;
  roofSections: RoofSectionInput[];
  loadProfiles: LoadProfileItemInput[];
  siteHazards: SiteHazardInput[];
  photos: SurveyPhotoRecord[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyLoadSummary {
  totalConnectedPowerW: number;
  peakSurgePowerW: number;
  dailyEnergyWh: number;
  dailyEnergyKwh: number;
  criticalBackupEnergyKwh: number;
  totalUsableRoofAreaM2: number;
  effectiveUnshadedRoofAreaM2: number;
}

export function computeSurveyLoadSummary(
  roofSections: ReadonlyArray<RoofSectionInput>,
  loadProfiles: ReadonlyArray<LoadProfileItemInput>,
): SurveyLoadSummary {
  let totalConnectedPowerW = 0;
  let peakSurgePowerW = 0;
  let dailyEnergyWh = 0;
  let criticalWh = 0;

  for (const item of loadProfiles) {
    const qty = Math.max(0, item.quantity);
    const watts = Math.max(0, item.ratedPowerW);
    const hours = Math.max(0, Math.min(24, item.dailyHours));
    const surge = Math.max(1, item.surgeFactor || 1);

    const itemConnectedW = qty * watts;
    const itemWh = itemConnectedW * hours;

    totalConnectedPowerW += itemConnectedW;
    peakSurgePowerW += itemConnectedW * surge;
    dailyEnergyWh += itemWh;
    if (item.isCriticalBackupLoad) {
      criticalWh += itemWh;
    }
  }

  let totalUsableRoofAreaM2 = 0;
  let effectiveUnshadedRoofAreaM2 = 0;
  for (const roof of roofSections) {
    const area = Math.max(0, roof.usableAreaM2);
    const shading = Math.max(0, Math.min(100, roof.shadingFactorPct));
    totalUsableRoofAreaM2 += area;
    effectiveUnshadedRoofAreaM2 += area * (1 - shading / 100);
  }

  return {
    totalConnectedPowerW: Number(totalConnectedPowerW.toFixed(2)),
    peakSurgePowerW: Number(peakSurgePowerW.toFixed(2)),
    dailyEnergyWh: Number(dailyEnergyWh.toFixed(2)),
    dailyEnergyKwh: Number((dailyEnergyWh / 1000).toFixed(3)),
    criticalBackupEnergyKwh: Number((criticalWh / 1000).toFixed(3)),
    totalUsableRoofAreaM2: Number(totalUsableRoofAreaM2.toFixed(2)),
    effectiveUnshadedRoofAreaM2: Number(effectiveUnshadedRoofAreaM2.toFixed(2)),
  };
}
