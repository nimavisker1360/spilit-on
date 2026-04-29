# Phase 1 Billing: Quick Start & Test Checklist

## TL;DR - Apply Migration

```bash
# 1. Apply migration
npm run db:migrate

# 2. Regenerate Prisma client
npm run db:generate

# 3. Verify schema
npm run typecheck

# 4. Test it
npm run dev
# Navigate to any protected route to ensure app still works
```

---

## Migration Details

**Migration ID:** `20260428152024_add_billing_foundation`  
**Location:** `prisma/migrations/20260428152024_add_billing_foundation/migration.sql`  
**Schema File:** `prisma/schema.prisma`

---

## What Changed

### New Models (3)
- `PaymentMethod` - Store payment cards/bank accounts
- `PlatformInvoice` - Subscription billing invoices
- `PlatformPayment` - Payment records

### New Enums (3)
- `InvoiceStatus` (DRAFT, ISSUED, PAID, OVERDUE, FAILED, REFUNDED, CANCELLED)
- `PaymentMethodType` (CARD, BANK_TRANSFER, CRYPTO)
- `PlatformPaymentStatus` (PENDING, SUCCEEDED, FAILED, REFUNDED, CANCELLED)

### Modified Models (2)
- `TenantSubscription` - Added: nextBillingDate, lastBillingDate, autoRenew, paymentMethodId
- `Restaurant` - Added relations to payment methods, invoices, payments

---

## Pre-Migration Checklist

- [ ] Backup database (production only)
- [ ] Verify DATABASE_URL: `echo $DATABASE_URL`
- [ ] No uncommitted Prisma changes: `git status prisma/`
- [ ] All tests passing: `npm run typecheck`
- [ ] Recent schema.prisma and migration.sql files exist

---

## Post-Migration Verification

### ✅ Step 1: Migration Applied
```bash
npx prisma migrate status
```
Expected: Shows `20260428152024_add_billing_foundation` as applied

**Checklist:**
- [ ] Command succeeds
- [ ] No migration errors in output

### ✅ Step 2: Prisma Client Healthy
```bash
npm run db:generate && npm run typecheck
```

**Checklist:**
- [ ] No errors
- [ ] No warnings about billing models

### ✅ Step 3: Tables Exist (Optional Verification)
```bash
# Via psql (if you have direct DB access)
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'Platform%' OR tablename = 'PaymentMethod';"

# Should return: PaymentMethod, PlatformInvoice, PlatformPayment
```

**Checklist:**
- [ ] All 3 tables listed

### ✅ Step 4: TenantSubscription Extended
```bash
# Via psql
psql $DATABASE_URL -c "\d \"TenantSubscription\""

# Look for: nextBillingDate, lastBillingDate, autoRenew, paymentMethodId
```

**Checklist:**
- [ ] 4 new columns visible
- [ ] autoRenew defaults to true
- [ ] paymentMethodId has FK constraint

### ✅ Step 5: Application Starts
```bash
npm run build && npm start
```

**Checklist:**
- [ ] Build succeeds
- [ ] App starts without errors
- [ ] No database connection errors

### ✅ Step 6: Existing Functionality Works
- [ ] Login still works
- [ ] Restaurant CRUD still works
- [ ] Payment flows still work
- [ ] No TypeScript errors in codebase

---

## Quick Database Queries

### Check Migration Status
```bash
npx prisma migrate status
```

### View New Tables
```sql
SELECT tablename FROM pg_tables 
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment', 'TenantSubscription')
ORDER BY tablename;
```

### View New Enums
```sql
SELECT typname FROM pg_type 
WHERE typname IN ('InvoiceStatus', 'PaymentMethodType', 'PlatformPaymentStatus')
ORDER BY typname;
```

### Check Indexes on New Tables
```sql
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY tablename, indexname;
```

### Count Tables (Sanity Check)
```sql
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
-- Should be 22 before migration, 25 after (added 3 new tables)
```

---

## Rollback (If Needed)

```bash
# Option 1: Rollback the migration
npx prisma migrate resolve --rolled-back 20260428152024_add_billing_foundation

# Option 2: Reset everything (⚠️ Deletes all data)
npx prisma migrate reset

# Option 3: Direct SQL (last resort)
psql $DATABASE_URL -c "DROP TABLE IF EXISTS \"PlatformPayment\", \"PlatformInvoice\", \"PaymentMethod\";"
psql $DATABASE_URL -c "ALTER TABLE \"TenantSubscription\" DROP COLUMN IF EXISTS nextBillingDate, DROP COLUMN IF EXISTS lastBillingDate, DROP COLUMN IF EXISTS autoRenew, DROP COLUMN IF EXISTS paymentMethodId;"
psql $DATABASE_URL -c "DROP TYPE IF EXISTS \"InvoiceStatus\", \"PaymentMethodType\", \"PlatformPaymentStatus\";"
```

---

## Testing Data (Optional)

Once migration is applied, you can manually test the new tables:

```typescript
// In a script or test file
import { prisma } from "@/lib/prisma";

// Test 1: Create a payment method
const pm = await prisma.paymentMethod.create({
  data: {
    restaurantId: "your-restaurant-id",
    type: "CARD",
    provider: "test",
    last4: "4242",
  },
});
console.log("✓ PaymentMethod created:", pm.id);

// Test 2: Query it back
const found = await prisma.paymentMethod.findUnique({
  where: { id: pm.id },
});
console.log("✓ PaymentMethod found:", found?.holderName);

// Test 3: Delete it
await prisma.paymentMethod.delete({
  where: { id: pm.id },
});
console.log("✓ PaymentMethod deleted");
```

---

## Troubleshooting

### "Migration not found"
→ Ensure migration directory exists: `prisma/migrations/20260428152024_add_billing_foundation/`

### "Enum type does not exist"
→ Run `npm run db:generate` to update Prisma client

### "Foreign key violation on insert"
→ Ensure parent records (Restaurant, TenantSubscription) exist first

### "Column does not exist"
→ Run migration: `npm run db:migrate`

### "Permission denied on Windows"
→ Restart IDE or terminal; Prisma file locks on Windows can be finicky

### "UNIQUE constraint violation"
→ Migration expects (restaurantId, invoiceNumber) pairs to be unique

---

## Files Modified

1. **prisma/schema.prisma** - Added models, enums, relationships
2. **prisma/migrations/20260428152024_add_billing_foundation/migration.sql** - SQL DDL
3. **BILLING_MIGRATION.md** - Comprehensive guide (you're reading the condensed version)
4. **BILLING_SCHEMA_SUMMARY.md** - Detailed schema documentation

---

## What's NOT Implemented Yet (Phase 2+)

- ❌ Billing service logic
- ❌ Invoice generation scheduler
- ❌ Payment processing integration
- ❌ Admin pricing/subscription UI
- ❌ Customer portal
- ❌ Stripe/Iyzico webhook handlers
- ❌ Invoice email delivery
- ❌ Dunning/retry logic

These require Phase 2+. For now, the database is ready.

---

## Next Steps

1. ✅ Apply migration (this phase)
2. 🔄 Phase 2: Implement `src/features/billing/billing.service.ts`
3. 🔄 Phase 3: Create `/api/billing/*` routes
4. 🔄 Phase 4: Build admin billing UI
5. 🔄 Phase 5: Integrate payment processor

---

## Questions?

Refer to full guides:
- `BILLING_MIGRATION.md` - Complete step-by-step with SQL examples
- `BILLING_SCHEMA_SUMMARY.md` - Data model deep-dive
- Prisma docs: https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate
