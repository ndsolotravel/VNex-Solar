import type { SupportedCurrency } from './design-tokens.ts';

export type EquipmentCategory =
  | 'pv_module'
  | 'inverter'
  | 'battery'
  | 'cable'
  | 'breaker'
  | 'mounting'
  | 'earthing'
  | 'accessory';

export type PurchaseOrderStatus =
  | 'draft'
  | 'issued'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export type StockMovementType =
  | 'goods_receipt'
  | 'reservation'
  | 'issue_to_project'
  | 'return_to_stock'
  | 'damaged_writeoff'
  | 'adjustment';

export type SerialLifecycleStatus =
  | 'in_stock'
  | 'reserved'
  | 'installed'
  | 'damaged'
  | 'rma';

export interface EquipmentCatalogItem {
  id: string;
  organizationId: string;
  sku: string;
  category: EquipmentCategory;
  manufacturerName: string;
  modelName: string;
  unitOfMeasure: string;
  unitCostMinor: number;
  unitSellPriceMinor: number;
  currency: SupportedCurrency;
  warrantyMonths: number;
  reorderLevel: number;
  isSerialized: boolean;
  isActive: boolean;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRecord {
  id: string;
  organizationId: string;
  supplierCode: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  rowVersion: number;
  createdAt: string;
}

export interface WarehouseRecord {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
}

export interface PurchaseOrderItemRecord {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  equipmentCatalogId: string;
  sku: string;
  modelName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCostMinor: number;
}

export interface PurchaseOrderRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  warehouseId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  currency: SupportedCurrency;
  totalAmountMinor: number;
  orderedAt: string | null;
  createdByUserId: string;
  rowVersion: number;
  createdAt: string;
  items: PurchaseOrderItemRecord[];
}

export interface StockMovementRecord {
  id: string;
  organizationId: string;
  warehouseId: string;
  equipmentCatalogId: string;
  projectId: string | null;
  movementType: StockMovementType;
  quantityDelta: number;
  unitCostMinor: number;
  idempotencyKey: string;
  performedByUserId: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface StockReservationRecord {
  id: string;
  organizationId: string;
  projectId: string;
  warehouseId: string;
  equipmentCatalogId: string;
  quantityReserved: number;
  quantityIssued: number;
  status: 'active' | 'fulfilled' | 'released';
  createdAt: string;
}

export interface EquipmentSerialRecord {
  id: string;
  organizationId: string;
  equipmentCatalogId: string;
  warehouseId: string | null;
  projectId: string | null;
  serialNumber: string;
  status: SerialLifecycleStatus;
  warrantyExpiresAt: string | null;
  createdAt: string;
}

export interface StockBalanceSummary {
  equipmentCatalogId: string;
  sku: string;
  modelName: string;
  category: EquipmentCategory;
  warehouseId: string;
  warehouseCode: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  reorderLevel: number;
  isLowStock: boolean;
  unitCostMinor: number;
  currency: SupportedCurrency;
}

export function minorToMajor(minorUnits: number): number {
  return Math.round(minorUnits) / 100;
}

export function majorToMinor(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}

export function computeStockBalanceFromLedger(
  movements: ReadonlyArray<StockMovementRecord>,
  reservations: ReadonlyArray<StockReservationRecord>,
  reorderLevel: number,
): {
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  isLowStock: boolean;
} {
  let onHandQty = 0;
  for (const m of movements) {
    if (m.movementType !== 'reservation') {
      onHandQty += m.quantityDelta;
    }
  }
  let reservedQty = 0;
  for (const r of reservations) {
    if (r.status === 'active') {
      reservedQty += Math.max(0, r.quantityReserved - r.quantityIssued);
    }
  }
  const availableQty = onHandQty - reservedQty;
  return {
    onHandQty,
    reservedQty,
    availableQty,
    isLowStock: availableQty <= reorderLevel,
  };
}
