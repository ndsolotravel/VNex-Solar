# ORM Compatibility Evaluation: Drizzle ORM vs Prisma

## Decision: **Drizzle ORM (`drizzle-orm` + `pg` + SQL Migrations)**

### Criteria Evaluated for VNex Solar
1. **PostgreSQL Row-Level Security (RLS) & Transaction-Local GUCs**:
   - VNex Solar enforces multi-tenant isolation using `SET LOCAL app.current_organization_id = '<uuid>'` inside database transactions.
   - **Drizzle** runs all queries inside standard `db.transaction(async (tx) => ...)` using the native `pg` driver without a separate Rust query engine, guaranteeing the same physical Postgres connection and transaction state for RLS.
2. **Exact Decimal & Numeric Precision**:
   - Financial ledgers (`PKR`, `USD`, `AED`, `EUR`) and solar engineering calculations require `NUMERIC(18,4)` / `NUMERIC(14,4)` without IEEE-754 float coercion. Drizzle maps `numeric()` directly to exact strings/Decimal.js values.
3. **Version-Controlled SQL Migrations & Triggers**:
   - Immutability triggers (blocking silent edits to approved engineering revisions, approved quotations, posted journals, and `audit_events`) and RLS policies are pure PostgreSQL DDL. Drizzle Kit generates and tracks plain SQL migration files cleanly alongside custom DDL migrations.
4. **VPS Cost & Memory Footprint**:
   - Drizzle has zero sidecar binary (~10x smaller memory footprint on a single Linux VPS compared to Prisma's query engine binary).
