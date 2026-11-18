import type { SupportedCurrency } from './design-tokens.ts';
import type { LoadProfileItemInput } from './customers-surveys.ts';

export const SOLAR_ENGINEERING_FORMULA_VERSION = 'vnex-eng-v1.0.0' as const;
export const PV_COPPER_RESISTIVITY_OHM_MM2_PER_M = 0.0178 as const;

export interface SolarModuleSpec {
  id: string;
  modelName: string;
  manufacturer: string;
  pmaxW: number;
  vocV: number;
  vmpV: number;
  iscA: number;
  impA: number;
  tempCoeffVocPctPerC: number;
  tempCoeffPmaxPctPerC: number;
  maxSystemVoltageV: number;
  areaM2: number;
  weightKg: number;
}

export interface InverterSpec {
  id: string;
  modelName: string;
  manufacturer: string;
  inverterType: 'on_grid' | 'hybrid' | 'off_grid';
  ratedAcPowerW: number;
  maxDcInputW: number;
  maxDcVoltageV: number;
  mpptMinV: number;
  mpptMaxV: number;
  mpptCount: number;
  maxInputCurrentPerMpptA: number;
  efficiencyPct: number;
  phases: 'single' | 'three';
}

export interface BatterySpec {
  id: string;
  modelName: string;
  manufacturer: string;
  chemistry: 'LFP' | 'LeadAcid' | 'NMC';
  nominalVoltageV: number;
  capacityAh: number;
  energyWh: number;
  maxDodPct: number;
  roundTripEfficiencyPct: number;
}

export interface SolarDesignCalculationInput {
  currency: SupportedCurrency;
  // Site & Load parameters
  loadProfiles?: ReadonlyArray<LoadProfileItemInput>;
  overrideDailyEnergyKwh?: number;
  overridePeakPowerKw?: number;
  overrideCriticalBackupKwh?: number;
  usableRoofAreaM2: number;
  shadingLossPct: number;
  ambientMinTempC: number;
  ambientMaxTempC: number;
  cellTempRiseAboveAmbientC?: number;
  peakSunHoursPerDay: number;
  tiltDegrees: number;
  azimuthDegrees: number;
  siteLatitudeDeg?: number;
  windSpeedMs?: number;

  // Equipment specs
  module: SolarModuleSpec;
  inverter: InverterSpec;
  battery?: BatterySpec | null;

  // Array & String topology
  modulesInSeries: number;
  parallelStringsPerMppt: number;
  activeMpptCount: number;
  inverterCount: number;

  // Storage & Cable parameters
  batteryUnitsCount?: number;
  autonomyDays?: number;
  dcCableOneWayLengthM: number;
  dcCableCrossSectionMm2: number;
  acCableOneWayLengthM: number;
  acCableCrossSectionMm2: number;
  acPowerFactor?: number;

  // Performance & Financials
  performanceRatio?: number;
  panelDegradationPctPerYear?: number;
  gridEmissionFactorKgPerKwh?: number;
  systemCapexAmount: number;
  gridTariffPerKwh: number;
  exportTariffPerKwh: number;
  tariffEscalationPctPerYear?: number;
  annualOmCost: number;
  discountRatePct?: number;
}

export interface SolarDesignCalculationOutput {
  formulaVersion: typeof SOLAR_ENGINEERING_FORMULA_VERSION;
  // 1. Daily consumption & peak load
  dailyEnergyKwh: number;
  connectedPowerKw: number;
  peakSurgePowerKw: number;
  criticalBackupDailyKwh: number;
  // 2. Required PV capacity
  requiredPvKwp: number;
  // 3. Panel count & Actual DC kWp
  totalPanelCount: number;
  actualDcKwp: number;
  totalRatedAcKw: number;
  // 4. DC/AC ratio
  dcAcRatio: number;
  // 5. Cold-temperature string Voc & safety check
  moduleColdVocV: number;
  stringColdVocV: number;
  vocLimitV: number;
  vocOvervoltageFault: boolean;
  // 6. Hot-cell string Vmp & MPPT window check
  moduleHotVmpV: number;
  stringHotVmpV: number;
  mpptWindowValid: boolean;
  // 7. Safe min/max modules in series
  minModulesInSeries: number;
  maxModulesInSeries: number;
  // 8. MPPT current check
  mpptOperatingCurrentA: number;
  mpptShortCircuitCurrentA: number;
  mpptCurrentExceeded: boolean;
  // 9. Battery bank sizing
  requiredUsableBatteryKwh: number;
  requiredNominalBatteryKwh: number;
  recommendedBatteryUnits: number;
  installedNominalBatteryKwh: number;
  installedUsableBatteryKwh: number;
  // 10. Orientation factor & Annual Yield
  orientationFactor: number;
  expectedDailyYieldKwh: number;
  expectedAnnualYieldKwh: number;
  specificYieldKwhPerKwp: number;
  // 11. Energy offset & self-consumption
  annualDemandKwh: number;
  annualSolarOffsetPct: number;
  estimatedSelfConsumedKwh: number;
  estimatedGridExportKwh: number;
  // 12. DC cable voltage drop
  dcVoltageDropV: number;
  dcVoltageDropPct: number;
  dcCablePass: boolean;
  // 13. AC cable voltage drop & phase current
  acCurrentPerInverterA: number;
  acVoltageDropV: number;
  acVoltageDropPct: number;
  acCablePass: boolean;
  // 14. Protection switchgear ratings
  recommendedStringFuseA: number;
  recommendedAcBreakerA: number;
  recommendedDcSpdVoltageV: 600 | 1000 | 1500;
  // 15. Earthing conductor sizing
  recommendedEarthingMm2: number;
  targetEarthResistanceOhms: number;
  // 16. Roof area utilization
  totalModuleFootprintM2: number;
  requiredRoofAreaM2: number;
  roofAreaUtilizationPct: number;
  roofFitPass: boolean;
  // 17. Structural dead weight & wind uplift
  totalArrayMassKg: number;
  distributedRoofLoadKgM2: number;
  estimatedWindUpliftKn: number;
  // 18. 25-year degraded lifetime yield
  lifetime25YrYieldKwh: number;
  // 19. Environmental carbon impact
  annualCo2AvoidedKg: number;
  lifetimeCo2AvoidedTonnes: number;
  // 20. Financial engineering metrics
  currency: SupportedCurrency;
  firstYearGrossSavings: number;
  firstYearNetCashflow: number;
  simplePaybackYears: number | null;
  netPresentValue: number;
  roi25YrPct: number;
  lcoePerKwh: number;
  // Summary gates
  hardSafetyErrors: string[];
  engineeringWarnings: string[];
  safetyChecksPassed: boolean;
}

export interface DesignApprovalRecord {
  id: string;
  organizationId: string;
  designRevisionId: string;
  reviewerUserId: string;
  reviewerRole: string;
  decision: 'approved' | 'rejected';
  reviewNotes: string;
  decidedAt: string;
}

export interface DesignRevisionRecord {
  id: string;
  organizationId: string;
  solarDesignId: string;
  revisionNumber: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  formulaVersion: typeof SOLAR_ENGINEERING_FORMULA_VERSION;
  inputs: SolarDesignCalculationInput;
  calculations: SolarDesignCalculationOutput;
  notes: string;
  approvedAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface SolarDesignRecord {
  id: string;
  organizationId: string;
  projectId: string;
  siteSurveyId: string | null;
  designCode: string;
  title: string;
  currentRevisionNumber: number;
  status: 'draft' | 'submitted' | 'approved' | 'superseded';
  createdByUserId: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

const STANDARD_BREAKER_RATINGS_A = [
  10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 630,
];

const STANDARD_EARTH_SIZES_MM2 = [6, 10, 16, 25, 35, 50, 70];

function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function nextStandardRating(requiredAmps: number, steps: ReadonlyArray<number>): number {
  for (const step of steps) {
    if (step >= requiredAmps) return step;
  }
  return steps[steps.length - 1];
}

export function calculateSolarDesignEngineering(
  input: SolarDesignCalculationInput,
): SolarDesignCalculationOutput {
  const perfRatio = input.performanceRatio ?? 0.8;
  const degradationRate = (input.panelDegradationPctPerYear ?? 0.45) / 100;
  const cellTempRise = input.cellTempRiseAboveAmbientC ?? 25;
  const siteLatitude = input.siteLatitudeDeg ?? 31.5; // Lahore default latitude
  const windSpeedMs = input.windSpeedMs ?? 32;
  const gridEmissionFactor = input.gridEmissionFactorKgPerKwh ?? 0.58;
  const acPowerFactor = input.acPowerFactor ?? 0.98;
  const escalationRate = (input.tariffEscalationPctPerYear ?? 6.0) / 100;
  const discountRate = (input.discountRatePct ?? 10.0) / 100;
  const autonomyDays = input.autonomyDays ?? 0.5;

  // 1. Daily energy consumption & peak load power
  let connectedW = 0;
  let peakSurgeW = 0;
  let dailyWh = 0;
  let criticalWh = 0;

  if (input.loadProfiles && input.loadProfiles.length > 0) {
    for (const item of input.loadProfiles) {
      const qty = Math.max(0, item.quantity);
      const watts = Math.max(0, item.ratedPowerW);
      const hours = Math.max(0, Math.min(24, item.dailyHours));
      const surge = Math.max(1, item.surgeFactor || 1);
      const itemW = qty * watts;
      connectedW += itemW;
      peakSurgeW += itemW * surge;
      dailyWh += itemW * hours;
      if (item.isCriticalBackupLoad) {
        criticalWh += itemW * hours;
      }
    }
  }

  const dailyEnergyKwh =
    input.overrideDailyEnergyKwh !== undefined
      ? Math.max(0.1, input.overrideDailyEnergyKwh)
      : Math.max(0.1, dailyWh / 1000);
  const connectedPowerKw =
    input.overridePeakPowerKw !== undefined
      ? Math.max(0.1, input.overridePeakPowerKw)
      : connectedW / 1000;
  const peakSurgePowerKw =
    input.overridePeakPowerKw !== undefined && (!input.loadProfiles || input.loadProfiles.length === 0)
      ? input.overridePeakPowerKw * 1.25
      : peakSurgeW / 1000;
  const criticalBackupDailyKwh =
    input.overrideCriticalBackupKwh !== undefined
      ? Math.max(0, input.overrideCriticalBackupKwh)
      : criticalWh > 0
        ? criticalWh / 1000
        : dailyEnergyKwh * 0.4;

  // 2. Required PV capacity
  const safePsh = Math.max(1, input.peakSunHoursPerDay);
  const requiredPvKwp = dailyEnergyKwh / (safePsh * perfRatio);

  // 3. Actual Panel Count & DC / AC Capacity
  const stringsTotal =
    Math.max(1, input.activeMpptCount) * Math.max(1, input.parallelStringsPerMppt);
  const totalPanelCount = Math.max(1, input.modulesInSeries) * stringsTotal;
  const actualDcKwp = (totalPanelCount * input.module.pmaxW) / 1000;
  const totalRatedAcKw =
    (Math.max(1, input.inverterCount) * input.inverter.ratedAcPowerW) / 1000;

  // 4. DC-to-AC ratio
  const dcAcRatio = actualDcKwp / Math.max(0.1, totalRatedAcKw);

  // 5. Cold-temperature Open-Circuit Voltage (Voc)
  const dTCold = input.ambientMinTempC - 25;
  const moduleColdVocV =
    input.module.vocV * (1 + (input.module.tempCoeffVocPctPerC / 100) * dTCold);
  const stringColdVocV = moduleColdVocV * input.modulesInSeries;
  const vocLimitV = Math.min(
    input.inverter.maxDcVoltageV,
    input.module.maxSystemVoltageV,
  );
  const vocOvervoltageFault = stringColdVocV > vocLimitV;

  // 6. Hot-cell Maximum Power Point Voltage (Vmp) & MPPT window check
  const cellMaxTempC = input.ambientMaxTempC + cellTempRise;
  const dTHot = cellMaxTempC - 25;
  const moduleHotVmpV =
    input.module.vmpV * (1 + (input.module.tempCoeffPmaxPctPerC / 100) * dTHot);
  const stringHotVmpV = moduleHotVmpV * input.modulesInSeries;
  const mpptWindowValid =
    stringHotVmpV >= input.inverter.mpptMinV &&
    stringHotVmpV <= input.inverter.mpptMaxV;

  // 7. Safe min/max modules per series string
  const minModulesInSeries = Math.ceil(
    input.inverter.mpptMinV / Math.max(1, moduleHotVmpV),
  );
  const maxModulesInSeries = Math.floor(
    vocLimitV / Math.max(1, moduleColdVocV),
  );

  // 8. MPPT current check
  const mpptOperatingCurrentA =
    input.module.impA * input.parallelStringsPerMppt;
  const mpptShortCircuitCurrentA =
    input.module.iscA * input.parallelStringsPerMppt;
  const mpptCurrentExceeded =
    mpptOperatingCurrentA > input.inverter.maxInputCurrentPerMpptA;

  // 9. Battery bank sizing
  const battery = input.battery ?? null;
  const isBatteryRelevant = input.inverter.inverterType !== 'on_grid' && battery !== null;
  const requiredUsableBatteryKwh =
    input.inverter.inverterType === 'on_grid' ? 0 : criticalBackupDailyKwh * autonomyDays;
  const requiredNominalBatteryKwh =
    isBatteryRelevant && battery
      ? requiredUsableBatteryKwh /
        ((battery.maxDodPct / 100) *
          (battery.roundTripEfficiencyPct / 100) *
          (input.inverter.efficiencyPct / 100))
      : 0;
  const recommendedBatteryUnits =
    isBatteryRelevant && battery
      ? Math.ceil((requiredNominalBatteryKwh * 1000) / Math.max(1, battery.energyWh))
      : 0;
  const installedUnits =
    input.batteryUnitsCount !== undefined
      ? Math.max(0, input.batteryUnitsCount)
      : recommendedBatteryUnits;
  const installedNominalBatteryKwh =
    battery && installedUnits > 0 ? (installedUnits * battery.energyWh) / 1000 : 0;
  const installedUsableBatteryKwh =
    battery && installedNominalBatteryKwh > 0
      ? installedNominalBatteryKwh * (battery.maxDodPct / 100)
      : 0;

  // 10. Orientation factor & Expected Yield
  const optimalTilt = Math.max(5, Math.min(45, Math.abs(siteLatitude) - 4));
  const tiltDeltaDeg = Math.abs(input.tiltDegrees - optimalTilt);
  const azimuthDeltaDeg = Math.abs(((input.azimuthDegrees - 180 + 540) % 360) - 180);
  const orientationFactor = Math.max(
    0.65,
    1 - tiltDeltaDeg * 0.0025 - (azimuthDeltaDeg / 90) * 0.12,
  );
  const shadingFactor = Math.max(0.1, 1 - Math.max(0, Math.min(90, input.shadingLossPct)) / 100);
  const expectedDailyYieldKwh =
    actualDcKwp * safePsh * perfRatio * shadingFactor * orientationFactor;
  const expectedAnnualYieldKwh = expectedDailyYieldKwh * 365;
  const specificYieldKwhPerKwp = expectedAnnualYieldKwh / Math.max(0.1, actualDcKwp);

  // 11. Energy offset & self-consumption balance
  const annualDemandKwh = dailyEnergyKwh * 365;
  const annualSolarOffsetPct = (expectedAnnualYieldKwh / Math.max(1, annualDemandKwh)) * 100;
  const selfConsumptionRatio =
    installedUsableBatteryKwh > 0 ? 0.72 : 0.48;
  const estimatedSelfConsumedKwh = Math.min(
    annualDemandKwh,
    expectedAnnualYieldKwh * selfConsumptionRatio,
  );
  const estimatedGridExportKwh = Math.max(
    0,
    expectedAnnualYieldKwh - estimatedSelfConsumedKwh,
  );

  // 12. DC string cable voltage drop (%)
  const stringVmpNominalV = input.module.vmpV * input.modulesInSeries;
  const dcVoltageDropV =
    (2 *
      input.dcCableOneWayLengthM *
      mpptOperatingCurrentA *
      PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) /
    Math.max(0.5, input.dcCableCrossSectionMm2);
  const dcVoltageDropPct = (dcVoltageDropV / Math.max(1, stringVmpNominalV)) * 100;
  const dcCablePass = dcVoltageDropPct <= 2.0;

  // 13. AC cable voltage drop (%)
  const acLineVoltageV = input.inverter.phases === 'three' ? 400 : 230;
  const acCurrentPerInverterA =
    input.inverter.phases === 'three'
      ? input.inverter.ratedAcPowerW / (Math.sqrt(3) * 400 * acPowerFactor)
      : input.inverter.ratedAcPowerW / (230 * acPowerFactor);
  const acMultiplier = input.inverter.phases === 'three' ? Math.sqrt(3) : 2;
  const acVoltageDropV =
    (acMultiplier *
      input.acCableOneWayLengthM *
      acCurrentPerInverterA *
      PV_COPPER_RESISTIVITY_OHM_MM2_PER_M) /
    Math.max(1, input.acCableCrossSectionMm2);
  const acVoltageDropPct = (acVoltageDropV / acLineVoltageV) * 100;
  const acCablePass = acVoltageDropPct <= 2.5;

  // 14. Protection switchgear ratings (DC Fuse, AC Breaker, DC SPD)
  const recommendedStringFuseA = nextStandardRating(
    mpptShortCircuitCurrentA * 1.56,
    STANDARD_BREAKER_RATINGS_A,
  );
  const recommendedAcBreakerA = nextStandardRating(
    acCurrentPerInverterA * 1.25,
    STANDARD_BREAKER_RATINGS_A,
  );
  const requiredSpdV = stringColdVocV * 1.1;
  const recommendedDcSpdVoltageV: 600 | 1000 | 1500 =
    requiredSpdV <= 600 ? 600 : requiredSpdV <= 1000 ? 1000 : 1500;

  // 15. Earthing conductor sizing
  const minEarthMm2 =
    input.acCableCrossSectionMm2 <= 16
      ? Math.max(6, input.acCableCrossSectionMm2)
      : Math.max(16, input.acCableCrossSectionMm2 / 2);
  const recommendedEarthingMm2 = nextStandardRating(minEarthMm2, STANDARD_EARTH_SIZES_MM2);
  const targetEarthResistanceOhms = 2.0;

  // 16. Roof area utilization & row spacing
  const totalModuleFootprintM2 = totalPanelCount * input.module.areaM2;
  const spacingFactor = 1.25 + (Math.max(0, input.tiltDegrees) / 90) * 0.45;
  const requiredRoofAreaM2 = totalModuleFootprintM2 * spacingFactor;
  const roofAreaUtilizationPct =
    (requiredRoofAreaM2 / Math.max(1, input.usableRoofAreaM2)) * 100;
  const roofFitPass = requiredRoofAreaM2 <= input.usableRoofAreaM2;

  // 17. Structural dead weight & wind uplift
  const totalArrayMassKg = totalPanelCount * (input.module.weightKg + 4.5);
  const distributedRoofLoadKgM2 =
    totalArrayMassKg / Math.max(1, totalModuleFootprintM2);
  const estimatedWindUpliftKn =
    (0.5 * 1.225 * windSpeedMs * windSpeedMs * 1.15 * totalModuleFootprintM2) / 1000;

  // 18. 25-year degraded lifetime yield
  let lifetime25YrYieldKwh = 0;
  for (let yr = 0; yr < 25; yr += 1) {
    lifetime25YrYieldKwh += expectedAnnualYieldKwh * (1 - degradationRate) ** yr;
  }

  // 19. Environmental carbon impact
  const annualCo2AvoidedKg = expectedAnnualYieldKwh * gridEmissionFactor;
  const lifetimeCo2AvoidedTonnes = (lifetime25YrYieldKwh * gridEmissionFactor) / 1000;

  // 20. Financial engineering metrics (25-year NPV, LCOE, ROI, Payback)
  const firstYearGrossSavings =
    estimatedSelfConsumedKwh * input.gridTariffPerKwh +
    estimatedGridExportKwh * input.exportTariffPerKwh;
  const firstYearNetCashflow = firstYearGrossSavings - input.annualOmCost;
  const simplePaybackYears =
    firstYearNetCashflow > 0 ? input.systemCapexAmount / firstYearNetCashflow : null;

  let npv = -input.systemCapexAmount;
  let totalDiscountedCosts = input.systemCapexAmount;
  let totalDiscountedYieldKwh = 0;
  let totalNominalNetCashflow = -input.systemCapexAmount;

  for (let yr = 1; yr <= 25; yr += 1) {
    const degFactor = (1 - degradationRate) ** (yr - 1);
    const tariffFactor = (1 + escalationRate) ** (yr - 1);
    const yrSelfConsumed = estimatedSelfConsumedKwh * degFactor;
    const yrExported = estimatedGridExportKwh * degFactor;
    const yrSavings =
      yrSelfConsumed * input.gridTariffPerKwh * tariffFactor +
      yrExported * input.exportTariffPerKwh * tariffFactor;
    const yrOm = input.annualOmCost * (1 + 0.03) ** (yr - 1);
    const yrNet = yrSavings - yrOm;
    const discountDivisor = (1 + discountRate) ** yr;

    npv += yrNet / discountDivisor;
    totalDiscountedCosts += yrOm / discountDivisor;
    totalDiscountedYieldKwh += (expectedAnnualYieldKwh * degFactor) / discountDivisor;
    totalNominalNetCashflow += yrNet;
  }

  const roi25YrPct =
    input.systemCapexAmount > 0
      ? (totalNominalNetCashflow / input.systemCapexAmount) * 100
      : 0;
  const lcoePerKwh =
    totalDiscountedYieldKwh > 0 ? totalDiscountedCosts / totalDiscountedYieldKwh : 0;

  // Hard Safety Blockers & Engineering Warnings
  const hardSafetyErrors: string[] = [];
  const engineeringWarnings: string[] = [];

  if (vocOvervoltageFault) {
    hardSafetyErrors.push(
      `Cold-temperature Voc (${roundTo(stringColdVocV, 1)}V at ${input.ambientMinTempC}°C) exceeds inverter/module limit (${vocLimitV}V). Reduce series modules to <= ${maxModulesInSeries}.`,
    );
  }
  if (input.activeMpptCount > input.inverter.mpptCount * input.inverterCount) {
    hardSafetyErrors.push(
      `Active MPPT channels (${input.activeMpptCount}) exceed total available inverter MPPT inputs (${input.inverter.mpptCount * input.inverterCount}).`,
    );
  }
  if (!mpptWindowValid) {
    engineeringWarnings.push(
      `Hot-cell Vmp (${roundTo(stringHotVmpV, 1)}V) falls outside inverter MPPT window (${input.inverter.mpptMinV}–${input.inverter.mpptMaxV}V).`,
    );
  }
  if (mpptCurrentExceeded) {
    engineeringWarnings.push(
      `Parallel string Imp (${roundTo(mpptOperatingCurrentA, 2)}A) exceeds per-MPPT limit (${input.inverter.maxInputCurrentPerMpptA}A).`,
    );
  }
  if (!dcCablePass) {
    engineeringWarnings.push(
      `DC cable voltage drop (${roundTo(dcVoltageDropPct, 2)}%) exceeds 2.0% threshold.`,
    );
  }
  if (!acCablePass) {
    engineeringWarnings.push(
      `AC cable voltage drop (${roundTo(acVoltageDropPct, 2)}%) exceeds 2.5% threshold.`,
    );
  }
  if (!roofFitPass) {
    engineeringWarnings.push(
      `Required roof area (${roundTo(requiredRoofAreaM2, 1)} m²) exceeds usable site roof area (${input.usableRoofAreaM2} m²).`,
    );
  }
  if (dcAcRatio > 1.35) {
    engineeringWarnings.push(
      `DC/AC ratio (${roundTo(dcAcRatio, 2)}) exceeds 1.35; inverter clipping losses expected.`,
    );
  }

  return {
    formulaVersion: SOLAR_ENGINEERING_FORMULA_VERSION,
    dailyEnergyKwh: roundTo(dailyEnergyKwh, 3),
    connectedPowerKw: roundTo(connectedPowerKw, 3),
    peakSurgePowerKw: roundTo(peakSurgePowerKw, 3),
    criticalBackupDailyKwh: roundTo(criticalBackupDailyKwh, 3),
    requiredPvKwp: roundTo(requiredPvKwp, 3),
    totalPanelCount,
    actualDcKwp: roundTo(actualDcKwp, 3),
    totalRatedAcKw: roundTo(totalRatedAcKw, 3),
    dcAcRatio: roundTo(dcAcRatio, 3),
    moduleColdVocV: roundTo(moduleColdVocV, 3),
    stringColdVocV: roundTo(stringColdVocV, 3),
    vocLimitV: roundTo(vocLimitV, 2),
    vocOvervoltageFault,
    moduleHotVmpV: roundTo(moduleHotVmpV, 3),
    stringHotVmpV: roundTo(stringHotVmpV, 3),
    mpptWindowValid,
    minModulesInSeries,
    maxModulesInSeries,
    mpptOperatingCurrentA: roundTo(mpptOperatingCurrentA, 3),
    mpptShortCircuitCurrentA: roundTo(mpptShortCircuitCurrentA, 3),
    mpptCurrentExceeded,
    requiredUsableBatteryKwh: roundTo(requiredUsableBatteryKwh, 3),
    requiredNominalBatteryKwh: roundTo(requiredNominalBatteryKwh, 3),
    recommendedBatteryUnits,
    installedNominalBatteryKwh: roundTo(installedNominalBatteryKwh, 3),
    installedUsableBatteryKwh: roundTo(installedUsableBatteryKwh, 3),
    orientationFactor: roundTo(orientationFactor, 4),
    expectedDailyYieldKwh: roundTo(expectedDailyYieldKwh, 2),
    expectedAnnualYieldKwh: roundTo(expectedAnnualYieldKwh, 1),
    specificYieldKwhPerKwp: roundTo(specificYieldKwhPerKwp, 1),
    annualDemandKwh: roundTo(annualDemandKwh, 1),
    annualSolarOffsetPct: roundTo(annualSolarOffsetPct, 1),
    estimatedSelfConsumedKwh: roundTo(estimatedSelfConsumedKwh, 1),
    estimatedGridExportKwh: roundTo(estimatedGridExportKwh, 1),
    dcVoltageDropV: roundTo(dcVoltageDropV, 2),
    dcVoltageDropPct: roundTo(dcVoltageDropPct, 3),
    dcCablePass,
    acCurrentPerInverterA: roundTo(acCurrentPerInverterA, 2),
    acVoltageDropV: roundTo(acVoltageDropV, 2),
    acVoltageDropPct: roundTo(acVoltageDropPct, 3),
    acCablePass,
    recommendedStringFuseA,
    recommendedAcBreakerA,
    recommendedDcSpdVoltageV,
    recommendedEarthingMm2,
    targetEarthResistanceOhms,
    totalModuleFootprintM2: roundTo(totalModuleFootprintM2, 2),
    requiredRoofAreaM2: roundTo(requiredRoofAreaM2, 2),
    roofAreaUtilizationPct: roundTo(roofAreaUtilizationPct, 1),
    roofFitPass,
    totalArrayMassKg: roundTo(totalArrayMassKg, 1),
    distributedRoofLoadKgM2: roundTo(distributedRoofLoadKgM2, 2),
    estimatedWindUpliftKn: roundTo(estimatedWindUpliftKn, 2),
    lifetime25YrYieldKwh: roundTo(lifetime25YrYieldKwh, 1),
    annualCo2AvoidedKg: roundTo(annualCo2AvoidedKg, 1),
    lifetimeCo2AvoidedTonnes: roundTo(lifetimeCo2AvoidedTonnes, 2),
    currency: input.currency,
    firstYearGrossSavings: roundTo(firstYearGrossSavings, 2),
    firstYearNetCashflow: roundTo(firstYearNetCashflow, 2),
    simplePaybackYears: simplePaybackYears !== null ? roundTo(simplePaybackYears, 2) : null,
    netPresentValue: roundTo(npv, 2),
    roi25YrPct: roundTo(roi25YrPct, 1),
    lcoePerKwh: roundTo(lcoePerKwh, 4),
    hardSafetyErrors,
    engineeringWarnings,
    safetyChecksPassed: hardSafetyErrors.length === 0,
  };
}
