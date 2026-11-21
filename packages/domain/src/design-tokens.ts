export interface VNexThemeTokens {
  mode: 'light' | 'dark';
  canvas: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentTextOnPrimary: string;
  nominal: string;
  warning: string;
  critical: string;
}

export const VNEX_LIGHT_TOKENS: VNexThemeTokens = {
  mode: 'light',
  canvas: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#F1F5F9',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  accentPrimary: '#D97706',
  accentPrimaryHover: '#B45309',
  accentTextOnPrimary: '#FFFFFF',
  nominal: '#16A34A',
  warning: '#D97706',
  critical: '#DC2626',
};

export const VNEX_DARK_TOKENS: VNexThemeTokens = {
  mode: 'dark',
  canvas: '#0B1120',
  surface: '#111827',
  surfaceElevated: '#1E293B',
  border: '#1F2937',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  accentPrimary: '#F59E0B',
  accentPrimaryHover: '#D97706',
  accentTextOnPrimary: '#0F172A',
  nominal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

export type SupportedCurrency = 'PKR' | 'USD' | 'AED' | 'SAR' | 'EUR' | 'GBP';

export const SUPPORTED_CURRENCIES: ReadonlyArray<{
  code: SupportedCurrency;
  symbol: string;
  label: string;
  minorUnits: number;
}> = [
  { code: 'PKR', symbol: 'Rs', label: 'Pakistani Rupee (PKR)', minorUnits: 2 },
  { code: 'USD', symbol: '$', label: 'US Dollar (USD)', minorUnits: 2 },
  { code: 'AED', symbol: 'AED', label: 'UAE Dirham (AED)', minorUnits: 2 },
  { code: 'SAR', symbol: 'SAR', label: 'Saudi Riyal (SAR)', minorUnits: 2 },
  { code: 'EUR', symbol: '€', label: 'Euro (EUR)', minorUnits: 2 },
  { code: 'GBP', symbol: '£', label: 'British Pound (GBP)', minorUnits: 2 },
];

export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const meta = SUPPORTED_CURRENCIES.find((c) => c.code === currency) ?? SUPPORTED_CURRENCIES[0];
  const formatted = Math.round(amount).toLocaleString('en-US');
  return `${meta.symbol} ${formatted}`;
}
