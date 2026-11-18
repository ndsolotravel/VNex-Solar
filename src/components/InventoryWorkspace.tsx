import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  formatCurrency,
  majorToMinor,
  minorToMajor,
  type EquipmentCatalogItem,
  type EquipmentCategory,
  type EquipmentSerialRecord,
  type ProjectRecord,
  type PurchaseOrderRecord,
  type StockBalanceSummary,
  type StockMovementRecord,
  type StockReservationRecord,
  type SupplierRecord,
  type SupportedCurrency,
  type WarehouseRecord,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

type InventoryTab = 'balances' | 'procurement' | 'allocation' | 'ledger';
type AllocationAction = 'reserve' | 'issue' | 'return' | 'writeoff';

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  pv_module: 'PV Modules',
  inverter: 'Inverters',
  battery: 'Batteries',
  cable: 'Cables',
  breaker: 'Breakers',
  mounting: 'Mounting',
  earthing: 'Earthing',
  accessory: 'Accessories',
};

function generateClientIdempotencyKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function InventoryWorkspace({ currency, session, onSessionEstablished }: Props) {
  const [activeTab, setActiveTab] = useState<InventoryTab>('balances');

  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [balances, setBalances] = useState<StockBalanceSummary[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<StockBalanceSummary[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [serials, setSerials] = useState<EquipmentSerialRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [sessionReservations, setSessionReservations] = useState<StockReservationRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<EquipmentCategory | 'all'>('all');
  const [balanceSearch, setBalanceSearch] = useState('');
  const [serialQuery, setSerialQuery] = useState('');
  const [serialStatusFilter, setSerialStatusFilter] = useState<string>('all');

  // New SKU Form
  const [showAddSkuForm, setShowAddSkuForm] = useState(false);
  const [newSku, setNewSku] = useState('BRK-DC-32A-2P');
  const [newCategory, setNewCategory] = useState<EquipmentCategory>('breaker');
  const [newManufacturer, setNewManufacturer] = useState('Chint Electric');
  const [newModelName, setNewModelName] = useState('NB1-63DC 1000V 32A MCB');
  const [newUom, setNewUom] = useState('pcs');
  const [newCostMajor, setNewCostMajor] = useState(4200);
  const [newSellMajor, setNewSellMajor] = useState(5500);
  const [newWarrantyMonths, setNewWarrantyMonths] = useState(24);
  const [newReorderLevel, setNewReorderLevel] = useState(10);
  const [newIsSerialized, setNewIsSerialized] = useState(false);

  // New PO Form
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poWarehouseId, setPoWarehouseId] = useState('');
  const [poCatalogId, setPoCatalogId] = useState('');
  const [poQty, setPoQty] = useState(25);
  const [poUnitCostMajor, setPoUnitCostMajor] = useState(21500);

  // Quick Supplier / Warehouse Form
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supName, setSupName] = useState('Ravi Renewable Logistics');
  const [supContact, setSupContact] = useState('Zainab Tariq');
  const [supPhone, setSupPhone] = useState('+92-321-8899001');
  const [supTerms, setSupTerms] = useState('Net 30 Days');

  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [whCode, setWhCode] = useState('WH-KHI-01');
  const [whName, setWhName] = useState('Karachi Port Hub');
  const [whAddress, setWhAddress] = useState('SITE Industrial Area, Karachi');

  // Receive Goods Form (per selected PO)
  const [receivePoId, setReceivePoId] = useState('');
  const [receiveCatalogId, setReceiveCatalogId] = useState('');
  const [receiveQty, setReceiveQty] = useState(2);
  const [receiveSerialsText, setReceiveSerialsText] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('Inspected pallet seal and barcode manifest');
  const [receiveIdemKey, setReceiveIdemKey] = useState(() => generateClientIdempotencyKey('grn'));

  // Allocation / Issue / Return / Write-off Form
  const [allocAction, setAllocAction] = useState<AllocationAction>('reserve');
  const [allocProjectId, setAllocProjectId] = useState('');
  const [allocWarehouseId, setAllocWarehouseId] = useState('');
  const [allocCatalogId, setAllocCatalogId] = useState('');
  const [allocQty, setAllocQty] = useState(2);
  const [allocReservationId, setAllocReservationId] = useState('');
  const [allocSerialsText, setAllocSerialsText] = useState('');
  const [allocNotes, setAllocNotes] = useState('Allocated for rooftop DC array commissioning');
  const [allocIdemKey, setAllocIdemKey] = useState(() => generateClientIdempotencyKey('mov'));

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-inv-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Supply & Logistics',
        displayName: 'VNex Solar Supply & Logistics',
        slug,
        businessAddress: 'Sundar Industrial Estate, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Bilal Mahmood',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'Inventory!2026',
        deviceId: 'web-inventory-console',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to initialize tenant session');
    const created: WebAuthSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      organizationName: data.organization.displayName,
      organizationId: data.organization.id,
      userEmail: data.user.email,
      role: data.role,
    };
    onSessionEstablished(created);
    return created;
  }

  async function refreshInventoryState(active: WebAuthSession) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const [whRes, supRes, catRes, balRes, poRes, movRes, serRes, projRes] = await Promise.all([
        fetch('/api/v1/inventory/warehouses', { headers }),
        fetch('/api/v1/inventory/suppliers', { headers }),
        fetch('/api/v1/inventory/catalog', { headers }),
        fetch('/api/v1/inventory/balances', { headers }),
        fetch('/api/v1/inventory/purchase-orders', { headers }),
        fetch('/api/v1/inventory/movements', { headers }),
        fetch('/api/v1/inventory/serials', { headers }),
        fetch('/api/v1/projects', { headers }),
      ]);

      if (!balRes.ok) {
        const errBody = await balRes.json().catch(() => ({}));
        throw new Error(
          errBody?.error?.message ??
            `Active role (${active.role}) cannot access inventory endpoints.`,
        );
      }

      const [whData, supData, catData, balData, poData, movData, serData, projData] =
        await Promise.all([
          whRes.json(),
          supRes.json(),
          catRes.json(),
          balRes.json(),
          poRes.json(),
          movRes.json(),
          serRes.json(),
          projRes.ok ? projRes.json() : Promise.resolve({ projects: [] }),
        ]);

      const whList: WarehouseRecord[] = whData.warehouses ?? [];
      const supList: SupplierRecord[] = supData.suppliers ?? [];
      const catList: EquipmentCatalogItem[] = catData.items ?? [];
      const poList: PurchaseOrderRecord[] = poData.purchaseOrders ?? [];
      const projList: ProjectRecord[] = projData.projects ?? [];

      setWarehouses(whList);
      setSuppliers(supList);
      setCatalog(catList);
      setBalances(balData.balances ?? []);
      setLowStockAlerts(balData.lowStockAlerts ?? []);
      setPurchaseOrders(poList);
      setMovements(movData.movements ?? []);
      setSerials(serData.serials ?? []);
      setProjects(projList);

      if (whList[0] && !poWarehouseId) setPoWarehouseId(whList[0].id);
      if (whList[0] && !allocWarehouseId) setAllocWarehouseId(whList[0].id);
      if (supList[0] && !poSupplierId) setPoSupplierId(supList[0].id);
      if (catList[0] && !poCatalogId) {
        setPoCatalogId(catList[0].id);
        setPoUnitCostMajor(minorToMajor(catList[0].unitCostMinor));
      }
      if (catList[0] && !allocCatalogId) setAllocCatalogId(catList[0].id);
      if (projList[0] && !allocProjectId) setAllocProjectId(projList[0].id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load inventory data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void refreshInventoryState(session);
    }
  }, [session]);

  const filteredBalances = useMemo(() => {
    const q = balanceSearch.trim().toLowerCase();
    return balances.filter((b) => {
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        b.sku.toLowerCase().includes(q) ||
        b.modelName.toLowerCase().includes(q) ||
        b.warehouseCode.toLowerCase().includes(q)
      );
    });
  }, [balances, categoryFilter, balanceSearch]);

  const filteredSerials = useMemo(() => {
    const q = serialQuery.trim().toUpperCase();
    return serials.filter((s) => {
      if (serialStatusFilter !== 'all' && s.status !== serialStatusFilter) return false;
      if (!q) return true;
      return s.serialNumber.toUpperCase().includes(q);
    });
  }, [serials, serialQuery, serialStatusFilter]);

  const catalogById = useMemo(() => {
    const map = new Map<string, EquipmentCatalogItem>();
    for (const item of catalog) map.set(item.id, item);
    return map;
  }, [catalog]);

  const warehouseById = useMemo(() => {
    const map = new Map<string, WarehouseRecord>();
    for (const wh of warehouses) map.set(wh.id, wh);
    return map;
  }, [warehouses]);

  const supplierById = useMemo(() => {
    const map = new Map<string, SupplierRecord>();
    for (const sup of suppliers) map.set(sup.id, sup);
    return map;
  }, [suppliers]);

  const activeReceivePo = useMemo(
    () => purchaseOrders.find((p) => p.id === receivePoId) ?? null,
    [purchaseOrders, receivePoId],
  );

  const inventoryMetrics = useMemo(() => {
    const totalOnHandUnits = balances.reduce((acc, b) => acc + b.onHandQty, 0);
    const totalValuationMinor = balances.reduce(
      (acc, b) => acc + Math.round(b.onHandQty * b.unitCostMinor),
      0,
    );
    const openPos = purchaseOrders.filter(
      (p) => p.status === 'draft' || p.status === 'issued' || p.status === 'partially_received',
    ).length;
    return {
      totalOnHandUnits,
      totalValuationMinor,
      lowStockCount: lowStockAlerts.length,
      openPos,
    };
  }, [balances, lowStockAlerts.length, purchaseOrders]);

  async function handleConnectTenant() {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      await refreshInventoryState(active);
      setStatusMsg(`Connected to ${active.organizationName} warehouse ledger.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Tenant initialization failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCatalogSku(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/inventory/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          sku: newSku,
          category: newCategory,
          manufacturerName: newManufacturer,
          modelName: newModelName,
          unitOfMeasure: newUom,
          unitCostMinor: majorToMinor(newCostMajor),
          unitSellPriceMinor: majorToMinor(newSellMajor),
          currency,
          warrantyMonths: newWarrantyMonths,
          reorderLevel: newReorderLevel,
          isSerialized: newIsSerialized,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add equipment SKU');
      setShowAddSkuForm(false);
      setStatusMsg(`Registered SKU ${data.sku} (${data.modelName}) in tenant catalog.`);
      await refreshInventoryState(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'SKU registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSupplier(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/inventory/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          name: supName,
          contactName: supContact,
          phone: supPhone,
          paymentTerms: supTerms,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add supplier');
      setPoSupplierId(data.id);
      setShowAddSupplier(false);
      setStatusMsg(`Added supplier ${data.supplierCode} · ${data.name}.`);
      await refreshInventoryState(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Supplier creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWarehouse(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/inventory/warehouses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          code: whCode,
          name: whName,
          address: whAddress,
          isDefault: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add warehouse');
      setPoWarehouseId(data.id);
      setAllocWarehouseId(data.id);
      setShowAddWarehouse(false);
      setStatusMsg(`Added warehouse ${data.code} · ${data.name}.`);
      await refreshInventoryState(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Warehouse creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePurchaseOrder(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const supplierId = poSupplierId || suppliers[0]?.id;
      const warehouseId = poWarehouseId || warehouses[0]?.id;
      const itemCatalogId = poCatalogId || catalog[0]?.id;
      if (!supplierId || !warehouseId || !itemCatalogId) {
        throw new Error('Select a supplier, warehouse, and equipment SKU first.');
      }

      const res = await fetch('/api/v1/inventory/purchase-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          supplierId,
          warehouseId,
          currency,
          items: [
            {
              equipmentCatalogId: itemCatalogId,
              quantityOrdered: poQty,
              unitCostMinor: majorToMinor(poUnitCostMajor),
            },
          ],
        }),
      });
      const po = await res.json();
      if (!res.ok) throw new Error(po?.error?.message ?? 'Failed to create purchase order');
      setStatusMsg(
        `Created ${po.poNumber} in draft (${formatCurrency(minorToMajor(po.totalAmountMinor), po.currency)}).`,
      );
      await refreshInventoryState(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Purchase order creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleIssuePo(poId: string) {
    if (!session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/inventory/purchase-orders/${poId}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to issue PO');
      setReceivePoId(data.id);
      if (data.items?.[0]) {
        const line = data.items[0];
        setReceiveCatalogId(line.equipmentCatalogId);
        setReceiveQty(Math.max(1, line.quantityOrdered - line.quantityReceived));
      }
      setReceiveIdemKey(generateClientIdempotencyKey('grn'));
      setStatusMsg(`Issued ${data.poNumber} to supplier. Ready for Goods Receipt (GRN).`);
      await refreshInventoryState(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to issue purchase order');
    } finally {
      setBusy(false);
    }
  }

  async function handleReceiveGoods(e: FormEvent) {
    e.preventDefault();
    if (!session || !activeReceivePo) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const serialNumbers = receiveSerialsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/v1/inventory/purchase-orders/${activeReceivePo.id}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          idempotencyKey: receiveIdemKey,
          equipmentCatalogId: receiveCatalogId || activeReceivePo.items[0]?.equipmentCatalogId,
          quantityReceived: receiveQty,
          serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
          notes: receiveNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Goods receipt failed');

      if (data.deduplicated) {
        setStatusMsg(
          `Idempotency replay detected (${receiveIdemKey}) · stock ledger was not double-counted.`,
        );
      } else {
        setStatusMsg(
          `Received ${receiveQty} units on ${data.purchaseOrder?.poNumber ?? activeReceivePo.poNumber} (status: ${data.purchaseOrder?.status}). Registered ${data.serials?.length ?? 0} serials.`,
        );
        setReceiveSerialsText('');
        setReceiveIdemKey(generateClientIdempotencyKey('grn'));
      }
      await refreshInventoryState(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Goods receipt error');
    } finally {
      setBusy(false);
    }
  }

  async function ensureProjectIdForAllocation(active: WebAuthSession): Promise<string> {
    if (allocProjectId) return allocProjectId;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${active.accessToken}`,
    };
    const custRes = await fetch('/api/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Al-Noor Textile Mills Solar',
        companyName: 'Al-Noor Textile Mills Ltd',
      }),
    });
    const cust = await custRes.json();
    const siteRes = await fetch(`/api/v1/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Weaving Hall Shed B',
        addressLine: 'Plot 14, Kot Lakhpat Industrial Area',
        city: 'Lahore',
        utilityProvider: 'LESCO',
      }),
    });
    const site = await siteRes.json();
    const projRes = await fetch('/api/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: cust.id,
        siteId: site.id,
        title: '12 kWp Commercial Hybrid Allocation',
        systemType: 'hybrid',
        targetCapacityKwp: 12,
        currency,
      }),
    });
    const proj = await projRes.json();
    setAllocProjectId(proj.id);
    return proj.id;
  }

  async function handleStockActionSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const warehouseId = allocWarehouseId || warehouses[0]?.id;
      const equipmentCatalogId = allocCatalogId || catalog[0]?.id;
      if (!warehouseId || !equipmentCatalogId) {
        throw new Error('Select both a warehouse and an equipment SKU.');
      }

      const serialNumbers = allocSerialsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.accessToken}`,
      };

      if (allocAction === 'writeoff') {
        const res = await fetch('/api/v1/inventory/write-offs', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            idempotencyKey: allocIdemKey,
            warehouseId,
            equipmentCatalogId,
            quantity: allocQty,
            serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
            reason: allocNotes || 'Damaged during warehouse inspection',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'Write-off failed');
        setStatusMsg(
          data.deduplicated
            ? `Idempotency replay prevented duplicate write-off.`
            : `Recorded damaged write-off for ${allocQty} unit(s).`,
        );
      } else {
        const projectId = await ensureProjectIdForAllocation(active);
        if (allocAction === 'reserve') {
          const res = await fetch('/api/v1/inventory/reservations', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              idempotencyKey: allocIdemKey,
              projectId,
              warehouseId,
              equipmentCatalogId,
              quantity: allocQty,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error?.message ?? 'Reservation rejected');
          if (data.reservation) {
            setSessionReservations((prev) => {
              if (prev.some((r) => r.id === data.reservation.id)) return prev;
              return [data.reservation, ...prev];
            });
            setAllocReservationId(data.reservation.id);
          }
          setStatusMsg(
            data.deduplicated
              ? `Idempotent replay: reservation preserved without double locking.`
              : `Reserved ${allocQty} unit(s) for project. Available stock reduced immediately.`,
          );
        } else if (allocAction === 'issue') {
          const res = await fetch('/api/v1/inventory/issues', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              idempotencyKey: allocIdemKey,
              projectId,
              warehouseId,
              equipmentCatalogId,
              quantity: allocQty,
              reservationId: allocReservationId || undefined,
              serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
              notes: allocNotes,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error?.message ?? 'Issue to project failed');
          if (data.reservation) {
            setSessionReservations((prev) =>
              prev.map((r) => (r.id === data.reservation.id ? data.reservation : r)),
            );
          }
          setStatusMsg(
            data.deduplicated
              ? `Idempotent replay: material issue was already posted.`
              : `Issued ${allocQty} unit(s) to project (${data.serials?.length ?? 0} serial(s) moved to installed).`,
          );
        } else {
          const res = await fetch('/api/v1/inventory/returns', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              idempotencyKey: allocIdemKey,
              projectId,
              warehouseId,
              equipmentCatalogId,
              quantity: allocQty,
              serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
              notes: allocNotes,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error?.message ?? 'Stock return failed');
          setStatusMsg(
            data.deduplicated
              ? `Idempotent replay: return already recorded.`
              : `Returned ${allocQty} unit(s) back to warehouse stock.`,
          );
        }
      }

      setAllocSerialsText('');
      setAllocIdemKey(generateClientIdempotencyKey('mov'));
      await refreshInventoryState(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Inventory transaction failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Equipment &amp; Inventory Ledger
            {session ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{session.organizationName}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono">{session.role}</span>
              </>
            ) : null}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Warehouse Stock, Procurement &amp; Serial Control
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Ledger-backed stock balances with integer minor-unit costing, idempotent Goods Receipt
            Notes, reservation locking, and tenant-unique serial traceability.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!session ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleConnectTenant}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {busy ? 'Connecting...' : 'Connect & Seed Warehouse'}
            </button>
          ) : (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void refreshInventoryState(session)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh Ledger'}
            </button>
          )}
        </div>
      </div>

      {/* Feedback messages */}
      {statusMsg && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          {errMsg}
        </div>
      )}

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">On-Hand Units</p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {inventoryMetrics.totalOnHandUnits}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across {warehouses.length} warehouse{warehouses.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Ledger Stock Valuation
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {formatCurrency(minorToMajor(inventoryMetrics.totalValuationMinor), currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Integer minor-unit costing
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Low-Stock Alerts</p>
          <p
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              inventoryMetrics.lowStockCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {inventoryMetrics.lowStockCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {inventoryMetrics.lowStockCount > 0 ? 'Reorder threshold reached' : 'All SKUs nominal'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Purchase Orders
          </p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-50">
            {inventoryMetrics.openPos}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {serials.length} tracked serial{serials.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          {(
            [
              ['balances', 'Balances & Catalog'],
              ['procurement', 'Purchase Orders & GRN'],
              ['allocation', 'Reserve / Issue / Return'],
              ['ledger', 'Serials & Movement Ledger'],
            ] as Array<[InventoryTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'balances' && (
          <button
            type="button"
            onClick={() => setShowAddSkuForm((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showAddSkuForm ? 'Close SKU Form' : 'Add Equipment SKU'}
          </button>
        )}
      </div>

      {/* Empty state prior to tenant connection */}
      {!session && !loading && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            No active warehouse session
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Connect to an organization to inspect live ledger stock balances, create supplier
            purchase orders, receive serialized panels and inverters, and allocate materials to
            installation projects.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handleConnectTenant}
            className="mt-5 px-5 py-2.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {busy ? 'Initializing...' : 'Initialize Tenant Warehouse'}
          </button>
        </div>
      )}

      {/* TAB 1: BALANCES & CATALOG */}
      {session && activeTab === 'balances' && (
        <div className="space-y-6">
          {showAddSkuForm && (
            <form
              onSubmit={handleAddCatalogSku}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Register New Equipment Catalog SKU
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Costs converted to integer minor units
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  SKU Code
                  <input
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Category
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as EquipmentCategory)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Manufacturer
                  <input
                    required
                    value={newManufacturer}
                    onChange={(e) => setNewManufacturer(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Model Name
                  <input
                    required
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unit Cost ({currency})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={newCostMajor}
                    onChange={(e) => setNewCostMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unit Sell Price ({currency})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={newSellMajor}
                    onChange={(e) => setNewSellMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unit &amp; Reorder Level
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newUom}
                      onChange={(e) => setNewUom(e.target.value)}
                      placeholder="pcs"
                      className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={0}
                      value={newReorderLevel}
                      onChange={(e) => setNewReorderLevel(Number(e.target.value))}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </label>
                <div className="flex flex-col justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <label className="block">
                    Warranty (months)
                    <input
                      type="number"
                      min={0}
                      value={newWarrantyMonths}
                      onChange={(e) => setNewWarrantyMonths(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsSerialized}
                    onChange={(e) => setNewIsSerialized(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700"
                  />
                  Require individual unit serial numbers
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  Save Equipment SKU
                </button>
              </div>
            </form>
          )}

          {/* Low-stock alert panel */}
          {lowStockAlerts.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-amber-200/70 dark:border-amber-900/40">
                <div>
                  <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                    Low-Stock Replenishment Queue ({lowStockAlerts.length})
                  </h2>
                  <p className="text-xs text-amber-800 dark:text-amber-300/80">
                    Available balance is at or below reorder threshold. Issue a Purchase Order to
                    replenish.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const first = lowStockAlerts[0];
                    if (first) {
                      setPoCatalogId(first.equipmentCatalogId);
                      setPoWarehouseId(first.warehouseId);
                      setPoUnitCostMajor(minorToMajor(first.unitCostMinor));
                      setPoQty(Math.max(10, first.reorderLevel * 2));
                    }
                    setActiveTab('procurement');
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Create Replenishment PO
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {lowStockAlerts.map((alert) => (
                  <div
                    key={`${alert.warehouseId}-${alert.equipmentCatalogId}`}
                    className="flex items-center justify-between gap-2 py-1 text-amber-950 dark:text-amber-100"
                  >
                    <div className="min-w-0">
                      <p className="font-mono font-medium truncate">{alert.sku}</p>
                      <p className="text-amber-800 dark:text-amber-300/80 truncate">
                        {alert.warehouseCode}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold shrink-0">
                      {alert.availableQty} / {alert.reorderLevel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                All Categories
              </button>
              {(['pv_module', 'inverter', 'battery', 'cable', 'breaker'] as EquipmentCategory[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ),
              )}
            </div>

            <input
              type="search"
              value={balanceSearch}
              onChange={(e) => setBalanceSearch(e.target.value)}
              placeholder="Filter SKU, model, or warehouse..."
              className="w-full md:w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Balances Data Grid */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">SKU &amp; Model</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4 text-right">On Hand</th>
                  <th className="py-3 px-4 text-right">Reserved</th>
                  <th className="py-3 px-4 text-right">Available</th>
                  <th className="py-3 px-4 text-right">Reorder</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400"
                    >
                      {loading ? 'Loading inventory balances...' : 'No matching equipment SKUs.'}
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((row) => (
                    <tr
                      key={`${row.warehouseId}-${row.equipmentCatalogId}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {row.sku}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {row.modelName}
                          <span aria-hidden="true"> · </span>
                          {CATEGORY_LABELS[row.category]}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {row.warehouseCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {row.onHandQty}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {row.reservedQty}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-50">
                        {row.availableQty}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {row.reorderLevel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {formatCurrency(minorToMajor(row.unitCostMinor), row.currency)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span
                          className={
                            row.isLowStock
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }
                        >
                          {row.isLowStock ? 'Low stock' : 'Nominal'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setPoCatalogId(row.equipmentCatalogId);
                            setPoWarehouseId(row.warehouseId);
                            setPoUnitCostMajor(minorToMajor(row.unitCostMinor));
                            setActiveTab('procurement');
                          }}
                          className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Restock PO
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASE ORDERS & GOODS RECEIPT */}
      {session && activeTab === 'procurement' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Create PO & Supplier/Warehouse helpers */}
          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleCreatePurchaseOrder}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Create Purchase Order
                </h2>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddSupplier((p) => !p)}
                    className="font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    + Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddWarehouse((p) => !p)}
                    className="font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    + Warehouse
                  </button>
                </div>
              </div>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Supplier
                <select
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplierCode} · {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Destination Warehouse
                <select
                  value={poWarehouseId}
                  onChange={(e) => setPoWarehouseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Equipment SKU
                <select
                  value={poCatalogId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPoCatalogId(id);
                    const found = catalog.find((c) => c.id === id);
                    if (found) setPoUnitCostMajor(minorToMajor(found.unitCostMinor));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} · {c.modelName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Quantity Ordered
                  <input
                    type="number"
                    min={1}
                    required
                    value={poQty}
                    onChange={(e) => setPoQty(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unit Cost ({currency})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={poUnitCostMajor}
                    onChange={(e) => setPoUnitCostMajor(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Line Total:{' '}
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(
                      minorToMajor(Math.round(poQty * majorToMinor(poUnitCostMajor))),
                      currency,
                    )}
                  </strong>
                </span>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  Create Draft PO
                </button>
              </div>
            </form>

            {showAddSupplier && (
              <form
                onSubmit={handleCreateSupplier}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Add Supplier
                </h3>
                <input
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="Supplier legal name"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    placeholder="Contact person"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  <input
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="Phone"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={supTerms}
                    onChange={(e) => setSupTerms(e.target.value)}
                    placeholder="Payment terms"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-amber-600 text-white cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            {showAddWarehouse && (
              <form
                onSubmit={handleCreateWarehouse}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Add Warehouse Location
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    placeholder="Code (e.g. WH-KHI-01)"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                  />
                  <input
                    required
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="Warehouse name"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={whAddress}
                    onChange={(e) => setWhAddress(e.target.value)}
                    placeholder="Address"
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-amber-600 text-white cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* PO Queue + Goods Receipt Panel */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Purchase Orders ({purchaseOrders.length})
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Issue draft POs before logging Goods Receipt Notes
                </span>
              </div>
              {purchaseOrders.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No purchase orders created yet. Submit the form on the left to issue stock orders.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {purchaseOrders.map((po) => {
                    const supplier = supplierById.get(po.supplierId);
                    const wh = warehouseById.get(po.warehouseId);
                    return (
                      <div key={po.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {po.poNumber}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {po.status}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {supplier?.name ?? po.supplierId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              {wh?.code ?? po.warehouseId}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                            {po.items.map((line) => (
                              <p key={line.id}>
                                <span className="font-mono">{line.sku}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  Received {line.quantityReceived}/{line.quantityOrdered}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {formatCurrency(minorToMajor(po.totalAmountMinor), po.currency)}
                                </span>
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {po.status === 'draft' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleIssuePo(po.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Issue PO
                            </button>
                          )}
                          {(po.status === 'issued' || po.status === 'partially_received') && (
                            <button
                              type="button"
                              onClick={() => {
                                setReceivePoId(po.id);
                                const pendingLine =
                                  po.items.find((i) => i.quantityReceived < i.quantityOrdered) ??
                                  po.items[0];
                                if (pendingLine) {
                                  setReceiveCatalogId(pendingLine.equipmentCatalogId);
                                  setReceiveQty(
                                    Math.max(
                                      1,
                                      pendingLine.quantityOrdered - pendingLine.quantityReceived,
                                    ),
                                  );
                                }
                                setReceiveIdemKey(generateClientIdempotencyKey('grn'));
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Receive Goods
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {activeReceivePo && (
              <form
                onSubmit={handleReceiveGoods}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Goods Receipt Note · {activeReceivePo.poNumber}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setReceivePoId('')}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    PO Line Item
                    <select
                      value={receiveCatalogId}
                      onChange={(e) => setReceiveCatalogId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                    >
                      {activeReceivePo.items.map((line) => (
                        <option key={line.id} value={line.equipmentCatalogId}>
                          {line.sku} (Remaining: {line.quantityOrdered - line.quantityReceived})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Quantity Received Now
                    <input
                      type="number"
                      min={1}
                      required
                      value={receiveQty}
                      onChange={(e) => setReceiveQty(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Serial Numbers (comma or newline separated — required count when provided on serialized SKUs)
                  <textarea
                    rows={2}
                    value={receiveSerialsText}
                    onChange={(e) => setReceiveSerialsText(e.target.value)}
                    placeholder="e.g. LNG-2026-0001, LNG-2026-0002"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Idempotency Key
                    <input
                      required
                      value={receiveIdemKey}
                      onChange={(e) => setReceiveIdemKey(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Receiving Notes
                    <input
                      value={receiveNotes}
                      onChange={(e) => setReceiveNotes(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    Post Goods Receipt
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RESERVATIONS, ISSUES, RETURNS & WRITE-OFFS */}
      {session && activeTab === 'allocation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleStockActionSubmit}
            className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Stock Movement &amp; Project Allocation
              </h2>
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    ['reserve', 'Reserve'],
                    ['issue', 'Issue to Project'],
                    ['return', 'Return'],
                    ['writeoff', 'Damaged Write-Off'],
                  ] as Array<[AllocationAction, string]>
                ).map(([act, label]) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => {
                      setAllocAction(act);
                      setAllocIdemKey(generateClientIdempotencyKey(act));
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      allocAction === act
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allocAction !== 'writeoff' && (
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Target Project
                  <select
                    value={allocProjectId}
                    onChange={(e) => setAllocProjectId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Auto-create Commercial Solar Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} · {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Warehouse
                <select
                  value={allocWarehouseId}
                  onChange={(e) => setAllocWarehouseId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Equipment SKU
                <select
                  value={allocCatalogId}
                  onChange={(e) => setAllocCatalogId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} · {c.modelName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Quantity
                <input
                  type="number"
                  min={1}
                  required
                  value={allocQty}
                  onChange={(e) => setAllocQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            {allocAction === 'issue' && (
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Fulfill Active Reservation (optional)
                <select
                  value={allocReservationId}
                  onChange={(e) => setAllocReservationId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="">Direct unreserved issue</option>
                  {sessionReservations
                    .filter((r) => r.status === 'active')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id.slice(0, 8)} · Reserved {r.quantityReserved - r.quantityIssued} remaining
                      </option>
                    ))}
                </select>
              </label>
            )}

            {allocAction !== 'reserve' && (
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Serial Numbers (comma-separated, optional)
                <input
                  value={allocSerialsText}
                  onChange={(e) => setAllocSerialsText(e.target.value)}
                  placeholder="e.g. LNG-2026-0001, LNG-2026-0002"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Idempotency Key
                <input
                  required
                  value={allocIdemKey}
                  onChange={(e) => setAllocIdemKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                {allocAction === 'writeoff' ? 'Damage Reason (required)' : 'Movement Notes'}
                <input
                  required={allocAction === 'writeoff'}
                  value={allocNotes}
                  onChange={(e) => setAllocNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {allocAction === 'reserve'
                  ? 'Lock Reservation'
                  : allocAction === 'issue'
                    ? 'Issue Stock to Project'
                    : allocAction === 'return'
                      ? 'Return Stock to Warehouse'
                      : 'Confirm Damaged Write-Off'}
              </button>
            </div>
          </form>

          {/* Session Reservations & Quick Serial Picker */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
                Session Reservations ({sessionReservations.length})
              </h3>
              {sessionReservations.length === 0 ? (
                <p className="pt-3 text-xs text-slate-500 dark:text-slate-400">
                  Reservations created in this session appear here for one-click issue fulfillment.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 mt-2">
                  {sessionReservations.map((resv) => {
                    const cat = catalogById.get(resv.equipmentCatalogId);
                    return (
                      <div key={resv.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-mono font-medium text-slate-900 dark:text-slate-100">
                            {cat?.sku ?? resv.equipmentCatalogId.slice(0, 8)}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Status: {resv.status}
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">
                              Issued {resv.quantityIssued}/{resv.quantityReserved}
                            </span>
                          </p>
                        </div>
                        {resv.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAllocAction('issue');
                              setAllocProjectId(resv.projectId);
                              setAllocWarehouseId(resv.warehouseId);
                              setAllocCatalogId(resv.equipmentCatalogId);
                              setAllocReservationId(resv.id);
                              setAllocQty(resv.quantityReserved - resv.quantityIssued);
                              setAllocIdemKey(generateClientIdempotencyKey('issue'));
                            }}
                            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Fulfill
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
                In-Stock Serials for Selected SKU
              </h3>
              {(() => {
                const candidates = serials.filter(
                  (s) =>
                    s.equipmentCatalogId === allocCatalogId &&
                    (allocAction === 'return'
                      ? s.status === 'installed'
                      : s.status === 'in_stock' || s.status === 'reserved'),
                );
                if (candidates.length === 0) {
                  return (
                    <p className="pt-3 text-xs text-slate-500 dark:text-slate-400">
                      No matching serialized units recorded for this SKU and operation.
                    </p>
                  );
                }
                return (
                  <div className="pt-3 flex flex-wrap gap-2">
                    {candidates.slice(0, 12).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setAllocSerialsText((prev) =>
                            prev.includes(s.serialNumber)
                              ? prev
                              : prev
                                ? `${prev}, ${s.serialNumber}`
                                : s.serialNumber,
                          )
                        }
                        className="px-2 py-1 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 cursor-pointer"
                      >
                        + {s.serialNumber}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SERIAL TRACKER & IMMUTABLE MOVEMENT LEDGER */}
      {session && activeTab === 'ledger' && (
        <div className="space-y-6">
          {/* Serial Registry */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Serialized Equipment Registry ({filteredSerials.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tenant-unique serial numbers tracked from goods receipt to installation or write-off.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={serialQuery}
                  onChange={(e) => setSerialQuery(e.target.value)}
                  placeholder="Search serial..."
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono"
                />
                <select
                  value={serialStatusFilter}
                  onChange={(e) => setSerialStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="all">All Statuses</option>
                  <option value="in_stock">in_stock</option>
                  <option value="installed">installed</option>
                  <option value="damaged">damaged</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">Serial Number</th>
                    <th className="py-2.5 px-4">Equipment SKU</th>
                    <th className="py-2.5 px-4">Lifecycle State</th>
                    <th className="py-2.5 px-4">Location / Project</th>
                    <th className="py-2.5 px-4">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {filteredSerials.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">
                        No serial numbers registered yet. Receive a Purchase Order with serial numbers to track units.
                      </td>
                    </tr>
                  ) : (
                    filteredSerials.map((s) => {
                      const cat = catalogById.get(s.equipmentCatalogId);
                      const wh = s.warehouseId ? warehouseById.get(s.warehouseId) : null;
                      return (
                        <tr key={s.id}>
                          <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {s.serialNumber}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                            <span className="font-mono">{cat?.sku ?? s.equipmentCatalogId.slice(0, 8)}</span>
                            {cat ? (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>{cat.modelName}</span>
                              </>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            <span
                              className={
                                s.status === 'damaged'
                                  ? 'text-red-700 dark:text-red-400'
                                  : s.status === 'installed'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                              }
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {wh
                              ? `Warehouse ${wh.code}`
                              : s.projectId
                                ? `Project ${s.projectId.slice(0, 8)}`
                                : 'Unassigned'}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {new Date(s.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Movement Ledger */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Immutable Stock Movement Ledger ({movements.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Append-only inventory transactions protected by per-tenant idempotency keys.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-4">Movement Type</th>
                    <th className="py-2.5 px-4">SKU</th>
                    <th className="py-2.5 px-4 text-right">Qty Delta</th>
                    <th className="py-2.5 px-4 text-right">Unit Cost</th>
                    <th className="py-2.5 px-4">Idempotency Key</th>
                    <th className="py-2.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-center text-slate-500 dark:text-slate-400">
                        No stock movements recorded yet.
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => {
                      const cat = catalogById.get(m.equipmentCatalogId);
                      return (
                        <tr key={m.id}>
                          <td className="py-2.5 px-4 font-mono text-slate-900 dark:text-slate-100">
                            {m.movementType}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                            {cat?.sku ?? m.equipmentCatalogId.slice(0, 8)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                              m.quantityDelta > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : m.quantityDelta < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {formatCurrency(minorToMajor(m.unitCostMinor), cat?.currency ?? currency)}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 max-w-44 truncate">
                            {m.idempotencyKey}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                            {m.notes ?? '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
