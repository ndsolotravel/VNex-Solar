import { randomUUID } from 'node:crypto';
import {
  computeStockBalanceFromLedger,
  type EquipmentCatalogItem,
  type EquipmentCategory,
  type EquipmentSerialRecord,
  type PurchaseOrderItemRecord,
  type PurchaseOrderRecord,
  type StockBalanceSummary,
  type StockMovementRecord,
  type StockReservationRecord,
  type SupplierRecord,
  type SupportedCurrency,
  type WarehouseRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';

export class InMemoryInventoryService {
  private readonly warehouses = new Map<string, WarehouseRecord>();
  private readonly suppliers = new Map<string, SupplierRecord>();
  private readonly catalog = new Map<string, EquipmentCatalogItem>();
  private readonly purchaseOrders = new Map<string, PurchaseOrderRecord>();
  private readonly movements: StockMovementRecord[] = [];
  private readonly idempotentMovementResults = new Map<
    string,
    { movement: StockMovementRecord; serials: EquipmentSerialRecord[]; reservation?: StockReservationRecord }
  >();
  private readonly reservations = new Map<string, StockReservationRecord>();
  private readonly serials = new Map<string, EquipmentSerialRecord>();
  private readonly seededOrgs = new Set<string>();

  constructor(private readonly customersSurveys: InMemoryCustomersSurveysService) {}

  private ensureOrgDefaults(orgId: string, currency: SupportedCurrency = 'PKR') {
    if (this.seededOrgs.has(orgId)) return;
    this.seededOrgs.add(orgId);

    const whId = randomUUID();
    const now = new Date().toISOString();
    this.warehouses.set(whId, {
      id: whId,
      organizationId: orgId,
      code: 'WH-MAIN',
      name: 'Central Solar Depot',
      address: 'Industrial Logistics Park',
      isDefault: true,
    });

    const supId = randomUUID();
    this.suppliers.set(supId, {
      id: supId,
      organizationId: orgId,
      supplierCode: 'SUP-0001',
      name: 'Pak-Sino Solar Distribution',
      contactName: 'Tariq Jamil',
      phone: '+92-300-4455667',
      email: 'procurement@paksinosolar.pk',
      paymentTerms: 'Net 15 Days',
      rowVersion: 1,
      createdAt: now,
    });

    const starterItems: Array<{
      sku: string;
      category: EquipmentCategory;
      manufacturerName: string;
      modelName: string;
      unitOfMeasure: string;
      unitCostMinor: number;
      unitSellPriceMinor: number;
      warrantyMonths: number;
      reorderLevel: number;
      isSerialized: boolean;
    }> = [
      {
        sku: 'PV-LONGI-580M',
        category: 'pv_module',
        manufacturerName: 'LONGi Solar',
        modelName: 'Hi-MO 6 Explorer 580W Bifacial',
        unitOfMeasure: 'pcs',
        unitCostMinor: 2150000, // PKR 21,500.00
        unitSellPriceMinor: 2550000,
        warrantyMonths: 300,
        reorderLevel: 20,
        isSerialized: true,
      },
      {
        sku: 'INV-NITROX-12K3P',
        category: 'inverter',
        manufacturerName: 'Inverex / Deye',
        modelName: 'Nitrox Hybrid 12K-3P IP65',
        unitOfMeasure: 'pcs',
        unitCostMinor: 49500000, // PKR 495,000.00
        unitSellPriceMinor: 56500000,
        warrantyMonths: 60,
        reorderLevel: 3,
        isSerialized: true,
      },
      {
        sku: 'BAT-PYLON-US5000',
        category: 'battery',
        manufacturerName: 'Pylontech',
        modelName: 'US5000 48V 100Ah LFP',
        unitOfMeasure: 'pcs',
        unitCostMinor: 26500000, // PKR 265,000.00
        unitSellPriceMinor: 31000000,
        warrantyMonths: 84,
        reorderLevel: 4,
        isSerialized: true,
      },
      {
        sku: 'CAB-DC-6MM-BLK',
        category: 'cable',
        manufacturerName: 'Fast Cables',
        modelName: 'EN50618 Solar DC 6mm² XLPO',
        unitOfMeasure: 'meters',
        unitCostMinor: 38000, // PKR 380.00/m
        unitSellPriceMinor: 48000,
        warrantyMonths: 24,
        reorderLevel: 100,
        isSerialized: false,
      },
    ];

    for (const s of starterItems) {
      const id = randomUUID();
      this.catalog.set(id, {
        id,
        organizationId: orgId,
        sku: s.sku,
        category: s.category,
        manufacturerName: s.manufacturerName,
        modelName: s.modelName,
        unitOfMeasure: s.unitOfMeasure,
        unitCostMinor: s.unitCostMinor,
        unitSellPriceMinor: s.unitSellPriceMinor,
        currency,
        warrantyMonths: s.warrantyMonths,
        reorderLevel: s.reorderLevel,
        isSerialized: s.isSerialized,
        isActive: true,
        rowVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  listWarehouses(claims: AccessTokenClaims): WarehouseRecord[] {
    this.ensureOrgDefaults(claims.orgId);
    return [...this.warehouses.values()].filter((w) => w.organizationId === claims.orgId);
  }

  createWarehouse(
    claims: AccessTokenClaims,
    input: { code: string; name: string; address?: string | null; isDefault?: boolean },
  ): WarehouseRecord {
    this.ensureOrgDefaults(claims.orgId);
    const dup = [...this.warehouses.values()].find(
      (w) => w.organizationId === claims.orgId && w.code.toUpperCase() === input.code.toUpperCase(),
    );
    if (dup) {
      throw new AuthServiceError(409, `Warehouse code ${input.code} already exists`, 'DUPLICATE_WAREHOUSE');
    }
    const wh: WarehouseRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      code: input.code.toUpperCase(),
      name: input.name.trim(),
      address: input.address?.trim() || null,
      isDefault: Boolean(input.isDefault),
    };
    this.warehouses.set(wh.id, wh);
    return wh;
  }

  listSuppliers(claims: AccessTokenClaims): SupplierRecord[] {
    this.ensureOrgDefaults(claims.orgId);
    return [...this.suppliers.values()].filter((s) => s.organizationId === claims.orgId);
  }

  createSupplier(
    claims: AccessTokenClaims,
    input: {
      name: string;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      paymentTerms?: string | null;
    },
  ): SupplierRecord {
    this.ensureOrgDefaults(claims.orgId);
    const count = this.listSuppliers(claims).length;
    const sup: SupplierRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      supplierCode: `SUP-${String(count + 1).padStart(4, '0')}`,
      name: input.name.trim(),
      contactName: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      paymentTerms: input.paymentTerms?.trim() || null,
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.suppliers.set(sup.id, sup);
    return sup;
  }

  listCatalog(claims: AccessTokenClaims, category?: EquipmentCategory): EquipmentCatalogItem[] {
    this.ensureOrgDefaults(claims.orgId);
    return [...this.catalog.values()]
      .filter((c) => c.organizationId === claims.orgId)
      .filter((c) => !category || c.category === category);
  }

  createCatalogItem(
    claims: AccessTokenClaims,
    input: {
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
    },
  ): EquipmentCatalogItem {
    this.ensureOrgDefaults(claims.orgId, input.currency);
    const dup = [...this.catalog.values()].find(
      (c) => c.organizationId === claims.orgId && c.sku.toUpperCase() === input.sku.toUpperCase(),
    );
    if (dup) {
      throw new AuthServiceError(409, `SKU ${input.sku} already exists`, 'DUPLICATE_SKU');
    }
    const now = new Date().toISOString();
    const item: EquipmentCatalogItem = {
      id: randomUUID(),
      organizationId: claims.orgId,
      sku: input.sku.trim().toUpperCase(),
      category: input.category,
      manufacturerName: input.manufacturerName.trim(),
      modelName: input.modelName.trim(),
      unitOfMeasure: input.unitOfMeasure.trim(),
      unitCostMinor: Math.round(input.unitCostMinor),
      unitSellPriceMinor: Math.round(input.unitSellPriceMinor),
      currency: input.currency,
      warrantyMonths: input.warrantyMonths,
      reorderLevel: input.reorderLevel,
      isSerialized: input.isSerialized,
      isActive: true,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.catalog.set(item.id, item);
    return item;
  }

  getStockBalanceForItem(
    organizationId: string,
    warehouseId: string,
    equipmentCatalogId: string,
  ) {
    const item = this.catalog.get(equipmentCatalogId);
    if (!item || item.organizationId !== organizationId) {
      throw new AuthServiceError(404, 'Equipment SKU not found in active organization', 'NOT_FOUND');
    }
    const wh = this.warehouses.get(warehouseId);
    if (!wh || wh.organizationId !== organizationId) {
      throw new AuthServiceError(404, 'Warehouse not found in active organization', 'NOT_FOUND');
    }

    const itemMoves = this.movements.filter(
      (m) =>
        m.organizationId === organizationId &&
        m.warehouseId === warehouseId &&
        m.equipmentCatalogId === equipmentCatalogId,
    );
    const itemReservations = [...this.reservations.values()].filter(
      (r) =>
        r.organizationId === organizationId &&
        r.warehouseId === warehouseId &&
        r.equipmentCatalogId === equipmentCatalogId,
    );
    return computeStockBalanceFromLedger(itemMoves, itemReservations, item.reorderLevel);
  }

  listBalances(claims: AccessTokenClaims): {
    balances: StockBalanceSummary[];
    lowStockAlerts: StockBalanceSummary[];
  } {
    this.ensureOrgDefaults(claims.orgId);
    const items = this.listCatalog(claims);
    const warehouses = this.listWarehouses(claims);
    const balances: StockBalanceSummary[] = [];

    for (const wh of warehouses) {
      for (const item of items) {
        const stats = this.getStockBalanceForItem(claims.orgId, wh.id, item.id);
        balances.push({
          equipmentCatalogId: item.id,
          sku: item.sku,
          modelName: item.modelName,
          category: item.category,
          warehouseId: wh.id,
          warehouseCode: wh.code,
          onHandQty: stats.onHandQty,
          reservedQty: stats.reservedQty,
          availableQty: stats.availableQty,
          reorderLevel: item.reorderLevel,
          isLowStock: stats.isLowStock,
          unitCostMinor: item.unitCostMinor,
          currency: item.currency,
        });
      }
    }

    return {
      balances,
      lowStockAlerts: balances.filter((b) => b.isLowStock),
    };
  }

  listPurchaseOrders(claims: AccessTokenClaims): PurchaseOrderRecord[] {
    this.ensureOrgDefaults(claims.orgId);
    return [...this.purchaseOrders.values()]
      .filter((po) => po.organizationId === claims.orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createPurchaseOrder(
    claims: AccessTokenClaims,
    input: {
      supplierId: string;
      warehouseId: string;
      currency: SupportedCurrency;
      items: Array<{ equipmentCatalogId: string; quantityOrdered: number; unitCostMinor: number }>;
    },
  ): PurchaseOrderRecord {
    this.ensureOrgDefaults(claims.orgId, input.currency);
    const sup = this.suppliers.get(input.supplierId);
    const wh = this.warehouses.get(input.warehouseId);
    if (!sup || sup.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Supplier not found in active organization', 'NOT_FOUND');
    }
    if (!wh || wh.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Warehouse not found in active organization', 'NOT_FOUND');
    }

    const poId = randomUUID();
    let totalAmountMinor = 0;
    const poItems: PurchaseOrderItemRecord[] = input.items.map((line) => {
      const cat = this.catalog.get(line.equipmentCatalogId);
      if (!cat || cat.organizationId !== claims.orgId) {
        throw new AuthServiceError(404, 'Equipment SKU not found in active organization', 'NOT_FOUND');
      }
      const lineCost = Math.round(line.quantityOrdered * line.unitCostMinor);
      totalAmountMinor += lineCost;
      return {
        id: randomUUID(),
        organizationId: claims.orgId,
        purchaseOrderId: poId,
        equipmentCatalogId: cat.id,
        sku: cat.sku,
        modelName: cat.modelName,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: 0,
        unitCostMinor: Math.round(line.unitCostMinor),
      };
    });

    const count = this.listPurchaseOrders(claims).length;
    const po: PurchaseOrderRecord = {
      id: poId,
      organizationId: claims.orgId,
      supplierId: sup.id,
      warehouseId: wh.id,
      poNumber: `PO-${String(count + 1).padStart(4, '0')}`,
      status: 'draft',
      currency: input.currency,
      totalAmountMinor,
      orderedAt: null,
      createdByUserId: claims.sub,
      rowVersion: 1,
      createdAt: new Date().toISOString(),
      items: poItems,
    };
    this.purchaseOrders.set(poId, po);
    return po;
  }

  issuePurchaseOrder(claims: AccessTokenClaims, poId: string): PurchaseOrderRecord {
    const po = this.purchaseOrders.get(poId);
    if (!po || po.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Purchase order not found in active organization', 'NOT_FOUND');
    }
    if (po.status !== 'draft') {
      throw new AuthServiceError(409, `Cannot issue PO from status ${po.status}`, 'INVALID_STATE');
    }
    po.status = 'issued';
    po.orderedAt = new Date().toISOString();
    po.rowVersion += 1;
    return po;
  }

  receivePurchaseOrderGoods(
    claims: AccessTokenClaims,
    poId: string,
    input: {
      idempotencyKey: string;
      equipmentCatalogId: string;
      quantityReceived: number;
      serialNumbers?: string[];
      notes?: string;
    },
  ) {
    const idemMapKey = `${claims.orgId}:${input.idempotencyKey}`;
    const cached = this.idempotentMovementResults.get(idemMapKey);
    if (cached) {
      return {
        deduplicated: true,
        purchaseOrder: this.purchaseOrders.get(poId),
        ...cached,
      };
    }

    const po = this.purchaseOrders.get(poId);
    if (!po || po.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Purchase order not found in active organization', 'NOT_FOUND');
    }
    if (po.status === 'draft' || po.status === 'cancelled' || po.status === 'received') {
      throw new AuthServiceError(
        409,
        `Purchase order must be issued/partially_received to receive goods (status=${po.status})`,
        'INVALID_STATE',
      );
    }

    const line = po.items.find((i) => i.equipmentCatalogId === input.equipmentCatalogId);
    if (!line) {
      throw new AuthServiceError(404, 'Item is not on this purchase order', 'NOT_FOUND');
    }
    if (line.quantityReceived + input.quantityReceived > line.quantityOrdered) {
      throw new AuthServiceError(
        400,
        `Receipt quantity (${input.quantityReceived}) exceeds remaining ordered quantity (${line.quantityOrdered - line.quantityReceived})`,
        'OVER_RECEIPT',
      );
    }

    const catalogItem = this.catalog.get(line.equipmentCatalogId)!;
    const serialList = input.serialNumbers ?? [];
    if (catalogItem.isSerialized && serialList.length > 0 && serialList.length !== input.quantityReceived) {
      throw new AuthServiceError(
        400,
        `Serial count (${serialList.length}) must match received quantity (${input.quantityReceived})`,
        'SERIAL_MISMATCH',
      );
    }

    // Check tenant-unique serials atomically before mutating state
    for (const sn of serialList) {
      const normalized = sn.trim().toUpperCase();
      const conflict = [...this.serials.values()].find(
        (s) => s.organizationId === claims.orgId && s.serialNumber === normalized,
      );
      if (conflict) {
        throw new AuthServiceError(
          409,
          `Serial number ${normalized} is already registered in this organization`,
          'DUPLICATE_SERIAL',
        );
      }
    }

    const now = new Date().toISOString();
    line.quantityReceived += input.quantityReceived;
    const allReceived = po.items.every((i) => i.quantityReceived >= i.quantityOrdered);
    po.status = allReceived ? 'received' : 'partially_received';
    po.rowVersion += 1;

    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      warehouseId: po.warehouseId,
      equipmentCatalogId: line.equipmentCatalogId,
      projectId: null,
      movementType: 'goods_receipt',
      quantityDelta: input.quantityReceived,
      unitCostMinor: line.unitCostMinor,
      idempotencyKey: input.idempotencyKey,
      performedByUserId: claims.sub,
      referenceType: 'purchase_order',
      referenceId: po.id,
      notes: input.notes ?? `GRN against ${po.poNumber}`,
      createdAt: now,
    };
    this.movements.push(movement);

    const createdSerials: EquipmentSerialRecord[] = [];
    for (const sn of serialList) {
      const rec: EquipmentSerialRecord = {
        id: randomUUID(),
        organizationId: claims.orgId,
        equipmentCatalogId: line.equipmentCatalogId,
        warehouseId: po.warehouseId,
        projectId: null,
        serialNumber: sn.trim().toUpperCase(),
        status: 'in_stock',
        warrantyExpiresAt: null,
        createdAt: now,
      };
      this.serials.set(rec.id, rec);
      createdSerials.push(rec);
    }

    const resultPayload = { movement, serials: createdSerials };
    this.idempotentMovementResults.set(idemMapKey, resultPayload);

    return {
      deduplicated: false,
      purchaseOrder: po,
      ...resultPayload,
    };
  }

  reserveStock(
    claims: AccessTokenClaims,
    input: {
      idempotencyKey: string;
      projectId: string;
      warehouseId: string;
      equipmentCatalogId: string;
      quantity: number;
    },
  ) {
    const idemMapKey = `${claims.orgId}:${input.idempotencyKey}`;
    const cached = this.idempotentMovementResults.get(idemMapKey);
    if (cached) {
      return { deduplicated: true, ...cached };
    }

    this.customersSurveys.getProject(claims, input.projectId);
    const balance = this.getStockBalanceForItem(
      claims.orgId,
      input.warehouseId,
      input.equipmentCatalogId,
    );
    if (input.quantity > balance.availableQty) {
      throw new AuthServiceError(
        409,
        `Insufficient available stock: requested ${input.quantity}, available ${balance.availableQty}`,
        'INSUFFICIENT_STOCK',
      );
    }

    const catalogItem = this.catalog.get(input.equipmentCatalogId)!;
    const now = new Date().toISOString();
    const reservation: StockReservationRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      projectId: input.projectId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      quantityReserved: input.quantity,
      quantityIssued: 0,
      status: 'active',
      createdAt: now,
    };
    this.reservations.set(reservation.id, reservation);

    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      projectId: input.projectId,
      movementType: 'reservation',
      quantityDelta: 0,
      unitCostMinor: catalogItem.unitCostMinor,
      idempotencyKey: input.idempotencyKey,
      performedByUserId: claims.sub,
      referenceType: 'stock_reservation',
      referenceId: reservation.id,
      notes: `Reserved ${input.quantity} ${catalogItem.unitOfMeasure}`,
      createdAt: now,
    };
    this.movements.push(movement);

    const payload = { movement, reservation, serials: [] as EquipmentSerialRecord[] };
    this.idempotentMovementResults.set(idemMapKey, payload);
    return { deduplicated: false, ...payload };
  }

  issueToProject(
    claims: AccessTokenClaims,
    input: {
      idempotencyKey: string;
      projectId: string;
      warehouseId: string;
      equipmentCatalogId: string;
      quantity: number;
      reservationId?: string;
      serialNumbers?: string[];
      notes?: string;
    },
  ) {
    const idemMapKey = `${claims.orgId}:${input.idempotencyKey}`;
    const cached = this.idempotentMovementResults.get(idemMapKey);
    if (cached) {
      return { deduplicated: true, ...cached };
    }

    this.customersSurveys.getProject(claims, input.projectId);
    const catalogItem = this.catalog.get(input.equipmentCatalogId);
    if (!catalogItem || catalogItem.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Equipment SKU not found in active organization', 'NOT_FOUND');
    }

    const balance = this.getStockBalanceForItem(
      claims.orgId,
      input.warehouseId,
      input.equipmentCatalogId,
    );

    let reservation: StockReservationRecord | undefined;
    if (input.reservationId) {
      reservation = this.reservations.get(input.reservationId);
      if (
        !reservation ||
        reservation.organizationId !== claims.orgId ||
        reservation.projectId !== input.projectId ||
        reservation.status !== 'active'
      ) {
        throw new AuthServiceError(404, 'Active stock reservation not found', 'NOT_FOUND');
      }
      const remainingReserved = reservation.quantityReserved - reservation.quantityIssued;
      if (input.quantity > remainingReserved) {
        throw new AuthServiceError(
          409,
          `Issue quantity (${input.quantity}) exceeds remaining reservation (${remainingReserved})`,
          'INSUFFICIENT_RESERVATION',
        );
      }
      if (input.quantity > balance.onHandQty) {
        throw new AuthServiceError(409, 'Insufficient physical on-hand stock', 'INSUFFICIENT_STOCK');
      }
    } else if (input.quantity > balance.availableQty) {
      throw new AuthServiceError(
        409,
        `Insufficient unreserved stock: requested ${input.quantity}, available ${balance.availableQty}`,
        'INSUFFICIENT_STOCK',
      );
    }

    const serialsToBind: EquipmentSerialRecord[] = [];
    for (const rawSn of input.serialNumbers ?? []) {
      const sn = rawSn.trim().toUpperCase();
      const rec = [...this.serials.values()].find(
        (s) =>
          s.organizationId === claims.orgId &&
          s.serialNumber === sn &&
          s.equipmentCatalogId === input.equipmentCatalogId,
      );
      if (!rec || (rec.status !== 'in_stock' && rec.status !== 'reserved')) {
        throw new AuthServiceError(
          409,
          `Serial number ${sn} is not available in warehouse stock`,
          'SERIAL_UNAVAILABLE',
        );
      }
      serialsToBind.push(rec);
    }

    if (reservation) {
      reservation.quantityIssued += input.quantity;
      if (reservation.quantityIssued >= reservation.quantityReserved) {
        reservation.status = 'fulfilled';
      }
    }

    const now = new Date().toISOString();
    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      projectId: input.projectId,
      movementType: 'issue_to_project',
      quantityDelta: -input.quantity,
      unitCostMinor: catalogItem.unitCostMinor,
      idempotencyKey: input.idempotencyKey,
      performedByUserId: claims.sub,
      referenceType: reservation ? 'stock_reservation' : 'project',
      referenceId: reservation?.id ?? input.projectId,
      notes: input.notes ?? 'Issued to project installation crew',
      createdAt: now,
    };
    this.movements.push(movement);

    for (const s of serialsToBind) {
      s.status = 'installed';
      s.projectId = input.projectId;
      s.warehouseId = null;
    }

    const payload = { movement, reservation, serials: serialsToBind };
    this.idempotentMovementResults.set(idemMapKey, payload);
    return { deduplicated: false, ...payload };
  }

  returnToStock(
    claims: AccessTokenClaims,
    input: {
      idempotencyKey: string;
      projectId: string;
      warehouseId: string;
      equipmentCatalogId: string;
      quantity: number;
      serialNumbers?: string[];
      notes?: string;
    },
  ) {
    const idemMapKey = `${claims.orgId}:${input.idempotencyKey}`;
    const cached = this.idempotentMovementResults.get(idemMapKey);
    if (cached) {
      return { deduplicated: true, ...cached };
    }

    this.customersSurveys.getProject(claims, input.projectId);
    const catalogItem = this.catalog.get(input.equipmentCatalogId);
    if (!catalogItem || catalogItem.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Equipment SKU not found', 'NOT_FOUND');
    }

    const netIssued = this.movements
      .filter(
        (m) =>
          m.organizationId === claims.orgId &&
          m.projectId === input.projectId &&
          m.equipmentCatalogId === input.equipmentCatalogId &&
          (m.movementType === 'issue_to_project' || m.movementType === 'return_to_stock'),
      )
      .reduce((acc, m) => acc + -m.quantityDelta, 0);

    if (input.quantity > netIssued) {
      throw new AuthServiceError(
        409,
        `Cannot return ${input.quantity}; project net issued quantity is ${netIssued}`,
        'EXCESS_RETURN',
      );
    }

    const serialsToRestore: EquipmentSerialRecord[] = [];
    for (const rawSn of input.serialNumbers ?? []) {
      const sn = rawSn.trim().toUpperCase();
      const rec = [...this.serials.values()].find(
        (s) =>
          s.organizationId === claims.orgId &&
          s.serialNumber === sn &&
          s.projectId === input.projectId,
      );
      if (!rec) {
        throw new AuthServiceError(404, `Serial ${sn} is not assigned to this project`, 'NOT_FOUND');
      }
      serialsToRestore.push(rec);
    }

    const now = new Date().toISOString();
    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      projectId: input.projectId,
      movementType: 'return_to_stock',
      quantityDelta: input.quantity,
      unitCostMinor: catalogItem.unitCostMinor,
      idempotencyKey: input.idempotencyKey,
      performedByUserId: claims.sub,
      referenceType: 'project',
      referenceId: input.projectId,
      notes: input.notes ?? 'Returned unused material to warehouse',
      createdAt: now,
    };
    this.movements.push(movement);

    for (const s of serialsToRestore) {
      s.status = 'in_stock';
      s.warehouseId = input.warehouseId;
      s.projectId = null;
    }

    const payload = { movement, serials: serialsToRestore };
    this.idempotentMovementResults.set(idemMapKey, payload);
    return { deduplicated: false, ...payload };
  }

  writeOffDamaged(
    claims: AccessTokenClaims,
    input: {
      idempotencyKey: string;
      warehouseId: string;
      equipmentCatalogId: string;
      quantity: number;
      serialNumbers?: string[];
      reason: string;
    },
  ) {
    const idemMapKey = `${claims.orgId}:${input.idempotencyKey}`;
    const cached = this.idempotentMovementResults.get(idemMapKey);
    if (cached) {
      return { deduplicated: true, ...cached };
    }

    const balance = this.getStockBalanceForItem(
      claims.orgId,
      input.warehouseId,
      input.equipmentCatalogId,
    );
    if (input.quantity > balance.availableQty) {
      throw new AuthServiceError(
        409,
        `Cannot write off ${input.quantity}; available stock is ${balance.availableQty}`,
        'INSUFFICIENT_STOCK',
      );
    }

    const catalogItem = this.catalog.get(input.equipmentCatalogId)!;
    const damagedSerials: EquipmentSerialRecord[] = [];
    for (const rawSn of input.serialNumbers ?? []) {
      const sn = rawSn.trim().toUpperCase();
      const rec = [...this.serials.values()].find(
        (s) => s.organizationId === claims.orgId && s.serialNumber === sn && s.status === 'in_stock',
      );
      if (!rec) {
        throw new AuthServiceError(404, `In-stock serial ${sn} not found`, 'NOT_FOUND');
      }
      damagedSerials.push(rec);
    }

    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      projectId: null,
      movementType: 'damaged_writeoff',
      quantityDelta: -input.quantity,
      unitCostMinor: catalogItem.unitCostMinor,
      idempotencyKey: input.idempotencyKey,
      performedByUserId: claims.sub,
      referenceType: 'writeoff',
      referenceId: null,
      notes: input.reason,
      createdAt: new Date().toISOString(),
    };
    this.movements.push(movement);

    for (const s of damagedSerials) {
      s.status = 'damaged';
    }

    const payload = { movement, serials: damagedSerials };
    this.idempotentMovementResults.set(idemMapKey, payload);
    return { deduplicated: false, ...payload };
  }

  listMovements(claims: AccessTokenClaims, equipmentCatalogId?: string): StockMovementRecord[] {
    return this.movements
      .filter((m) => m.organizationId === claims.orgId)
      .filter((m) => !equipmentCatalogId || m.equipmentCatalogId === equipmentCatalogId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listSerials(
    claims: AccessTokenClaims,
    filters?: { serialNumber?: string; projectId?: string; status?: string },
  ): EquipmentSerialRecord[] {
    const q = filters?.serialNumber?.trim().toUpperCase();
    return [...this.serials.values()]
      .filter((s) => s.organizationId === claims.orgId)
      .filter((s) => !q || s.serialNumber.includes(q))
      .filter((s) => !filters?.projectId || s.projectId === filters.projectId)
      .filter((s) => !filters?.status || s.status === filters.status);
  }
}
