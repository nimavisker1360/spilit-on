# Phase 1: Billing Foundation Migration Guide

## Overview
This migration adds the database foundation for the monetization system. It includes:
- 3 new billing models: `PaymentMethod`, `PlatformInvoice`, `PlatformPayment`
- 3 new enums: `InvoiceStatus`, `PaymentMethodType`, `PlatformPaymentStatus`
- Extensions to `TenantSubscription` for billing coordination

**Migration ID:** `20260428152024_add_billing_foundation`

---

## Migration Commands

### Prerequisites
Ensure your environment is set up:
```bash
# Verify database connection
echo $DATABASE_URL  # Should show your PostgreSQL connection string
```

### Step 1: Apply the Migration (Recommended)
```bash
# Run the migration from Prisma
npm run db:migrate

# When prompted for a name, it should auto-detect: add_billing_foundation
# Or manually deploy an existing migration:
npm run db:deploy
```

### Step 2: Generate Updated Prisma Client
```bash
# This is automatic in most cases, but explicitly run if needed:
npm run db:generate
```

### Step 3 (Optional): Verify Migration Applied
```bash
# List all applied migrations:
npx prisma migrate status

# Expected output should include:
# - 20260428152024_add_billing_foundation (Migrate)
```

---

## Database Schema Changes

### New Enums
1. **InvoiceStatus**: DRAFT, ISSUED, PAID, OVERDUE, FAILED, REFUNDED, CANCELLED
2. **PaymentMethodType**: CARD, BANK_TRANSFER, CRYPTO
3. **PlatformPaymentStatus**: PENDING, SUCCEEDED, FAILED, REFUNDED, CANCELLED

### New Tables

#### PaymentMethod
Stores subscription payment methods for a restaurant.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (PK) | CUID |
| restaurantId | TEXT (FK) | Links to Restaurant |
| type | PaymentMethodType | CARD, BANK_TRANSFER, or CRYPTO |
| provider | VARCHAR(64) | Payment provider (e.g., "stripe", "iyzico") |
| providerPaymentMethodId | VARCHAR(128) | Provider's token/ID for the payment method |
| last4 | VARCHAR(4) | Last 4 digits (card only) |
| expiryMonth | INT | Card expiry month |
| expiryYear | INT | Card expiry year |
| holderName | TEXT | Name on the card/account |
| isDefault | BOOLEAN | Whether this is the default payment method |
| createdAt | TIMESTAMP | Auto-set to now() |
| updatedAt | TIMESTAMP | Auto-updated on modification |

**Indexes:**
- restaurantId
- provider + providerPaymentMethodId

#### PlatformInvoice
Represents a subscription billing invoice issued to a restaurant.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (PK) | CUID |
| restaurantId | TEXT (FK) | Links to Restaurant |
| subscriptionId | TEXT (FK) | Links to TenantSubscription |
| invoiceNumber | TEXT | Unique per restaurant (with restaurantId) |
| status | InvoiceStatus | Lifecycle: DRAFT → ISSUED → PAID or FAILED |
| currency | VARCHAR(3) | Default: "TRY" |
| amount | DECIMAL(10,2) | Base amount (before tax/discount) |
| taxAmount | DECIMAL(10,2) | Tax component |
| discountAmount | DECIMAL(10,2) | Discount component |
| totalAmount | DECIMAL(10,2) | Final amount = amount + tax - discount |
| description | TEXT | Line item description or notes |
| billingPeriodStart | TIMESTAMP | Start of billing period |
| billingPeriodEnd | TIMESTAMP | End of billing period |
| dueDate | TIMESTAMP | Payment due date |
| issuedAt | TIMESTAMP | When invoice was issued |
| paidAt | TIMESTAMP | When fully paid (null if unpaid) |
| failedAt | TIMESTAMP | When payment failed |
| refundedAt | TIMESTAMP | When refunded |
| metadata | JSONB | Additional data (e.g., line items) |
| createdAt | TIMESTAMP | Auto-set to now() |
| updatedAt | TIMESTAMP | Auto-updated on modification |

**Unique Constraints:**
- (restaurantId, invoiceNumber)

**Indexes:**
- restaurantId + status
- subscriptionId + status
- dueDate + status
- issuedAt

#### PlatformPayment
Records actual payments made toward platform invoices.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (PK) | CUID |
| restaurantId | TEXT (FK) | Links to Restaurant |
| subscriptionId | TEXT (FK) | Links to TenantSubscription |
| invoiceId | TEXT (FK, nullable) | Links to PlatformInvoice (can be null for non-invoice payments) |
| amount | DECIMAL(10,2) | Payment amount |
| currency | VARCHAR(3) | Default: "TRY" |
| status | PlatformPaymentStatus | PENDING → SUCCEEDED or FAILED |
| provider | VARCHAR(64) | Payment processor (e.g., "stripe", "iyzico") |
| providerPaymentId | VARCHAR(128) | Provider's payment ID |
| providerTransactionId | VARCHAR(128) | Provider's transaction ID (for tracking) |
| method | PaymentMethodType | CARD, BANK_TRANSFER, CRYPTO (nullable) |
| failureReason | TEXT | Human-readable failure message |
| attemptCount | INT | Number of payment attempts |
| lastAttemptedAt | TIMESTAMP | When last payment attempt was made |
| succeededAt | TIMESTAMP | When payment succeeded |
| refundedAt | TIMESTAMP | When refund was processed |
| metadata | JSONB | Additional data (webhook payload, etc.) |
| createdAt | TIMESTAMP | Auto-set to now() |
| updatedAt | TIMESTAMP | Auto-updated on modification |

**Indexes:**
- restaurantId + status
- subscriptionId + status
- invoiceId
- provider + providerPaymentId
- succeededAt

### Modified Tables

#### TenantSubscription
Added 4 new columns to support billing coordination:

| Column | Type | Notes |
|--------|------|-------|
| nextBillingDate | TIMESTAMP (nullable) | When the next invoice should be issued |
| lastBillingDate | TIMESTAMP (nullable) | When the last invoice was issued |
| autoRenew | BOOLEAN | Default: true. Whether to auto-renew when period ends |
| paymentMethodId | TEXT (FK, nullable) | Links to PaymentMethod |

**New Index:**
- nextBillingDate (for querying upcoming billing dates)

#### Restaurant
Added 3 new relationship fields (no new columns, just relations):
- paymentMethods: OneToMany to PaymentMethod
- platformInvoices: OneToMany to PlatformInvoice
- platformPayments: OneToMany to PlatformPayment

---

## Rollback Instructions (If Needed)

If you need to rollback this migration:

```bash
# Rollback the last migration
npx prisma migrate resolve --rolled-back 20260428152024_add_billing_foundation

# Or completely reset (CAUTION: Deletes all data)
npx prisma migrate reset
```

---

## Test Checklist

### Pre-Migration Tests

- [ ] Database is accessible: `echo $DATABASE_URL` works
- [ ] Current Prisma client generates without errors: `npm run db:generate`
- [ ] No uncommitted changes in `prisma/schema.prisma`
- [ ] `.env` file has correct DATABASE_URL

### Post-Migration Verification

#### 1. Schema Validation
- [ ] Migration applied successfully: `npx prisma migrate status`
- [ ] No error messages in migration logs
- [ ] Prisma client generates without errors: `npm run db:generate`
- [ ] TypeScript compilation succeeds: `npm run typecheck`

#### 2. Table Existence (PostgreSQL CLI)
```bash
# Connect to your database and verify tables exist
psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"

# Verify these new tables appear:
# - PaymentMethod
# - PlatformInvoice
# - PlatformPayment
```

Checklist:
- [ ] `PaymentMethod` table exists
- [ ] `PlatformInvoice` table exists
- [ ] `PlatformPayment` table exists
- [ ] `TenantSubscription` has new columns

#### 3. Enum Verification
```bash
# Check enums exist
psql $DATABASE_URL -c "SELECT typname FROM pg_type WHERE typtype='e' AND typname ILIKE '%Invoice%' OR typname ILIKE '%Payment%';"

# Expected enums:
# - InvoiceStatus
# - PaymentMethodType
# - PlatformPaymentStatus
```

Checklist:
- [ ] `InvoiceStatus` enum created
- [ ] `PaymentMethodType` enum created
- [ ] `PlatformPaymentStatus` enum created

#### 4. Column Verification on TenantSubscription
```bash
# Check new columns
psql $DATABASE_URL -c "\d \"TenantSubscription\""

# Verify these columns exist:
# - nextBillingDate
# - lastBillingDate
# - autoRenew (default: true)
# - paymentMethodId (FK to PaymentMethod)
```

Checklist:
- [ ] `nextBillingDate` column exists
- [ ] `lastBillingDate` column exists
- [ ] `autoRenew` column exists with default true
- [ ] `paymentMethodId` column exists with FK constraint

#### 5. Foreign Key Verification
```bash
# Check foreign key constraints
psql $DATABASE_URL -c "
SELECT constraint_name, table_name, column_name 
FROM information_schema.key_column_usage 
WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY table_name;"

# Expected FKs:
# PaymentMethod.restaurantId → Restaurant.id
# PlatformInvoice.restaurantId → Restaurant.id
# PlatformInvoice.subscriptionId → TenantSubscription.id
# PlatformPayment.restaurantId → Restaurant.id
# PlatformPayment.subscriptionId → TenantSubscription.id
# PlatformPayment.invoiceId → PlatformInvoice.id
# TenantSubscription.paymentMethodId → PaymentMethod.id
```

Checklist:
- [ ] All 7 FK constraints exist with correct cascading rules
- [ ] onDelete policies: CASCADE for restaurant/subscription, SET NULL for optional refs

#### 6. Index Verification
```bash
# List all indexes
psql $DATABASE_URL -c "
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment', 'TenantSubscription')
ORDER BY tablename, indexname;"

# Expected indexes (21 total):
# PaymentMethod: 2 indexes
# PlatformInvoice: 5 indexes
# PlatformPayment: 5 indexes
# TenantSubscription: 1 new index (nextBillingDate)
```

Checklist:
- [ ] PaymentMethod has 2 indexes
- [ ] PlatformInvoice has 5 indexes (including unique constraint)
- [ ] PlatformPayment has 5 indexes
- [ ] TenantSubscription has new nextBillingDate index

#### 7. Application Startup
```bash
# Ensure app starts without errors
npm run build

# Check for TypeScript errors related to billing models
npm run typecheck
```

Checklist:
- [ ] Application builds successfully
- [ ] No TypeScript compilation errors
- [ ] No Prisma client generation warnings related to billing

#### 8. Data Integrity (Optional but Recommended)
```bash
# Verify no orphaned records
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"TenantSubscription\" WHERE \"paymentMethodId\" IS NOT NULL AND \"paymentMethodId\" NOT IN (SELECT id FROM \"PaymentMethod\");"

# Result should be: 0 (no orphaned records)
```

Checklist:
- [ ] No orphaned payment method references
- [ ] No constraint violations detected

---

## Quick Reference: Accessing New Tables

### Via Prisma Client
```typescript
// Create a payment method
const paymentMethod = await prisma.paymentMethod.create({
  data: {
    restaurantId: "restaurant_id",
    type: "CARD",
    provider: "stripe",
    last4: "4242",
  },
});

// Create an invoice
const invoice = await prisma.platformInvoice.create({
  data: {
    restaurantId: "restaurant_id",
    subscriptionId: "subscription_id",
    invoiceNumber: "INV-001",
    status: "ISSUED",
    amount: 99.99,
    totalAmount: 99.99,
    billingPeriodStart: new Date(),
    billingPeriodEnd: new Date(),
  },
});

// Record a payment
const payment = await prisma.platformPayment.create({
  data: {
    restaurantId: "restaurant_id",
    subscriptionId: "subscription_id",
    invoiceId: "invoice_id",
    amount: 99.99,
    status: "SUCCEEDED",
    provider: "stripe",
  },
});
```

### Via SQL (Direct Database)
```sql
-- View payment methods
SELECT * FROM "PaymentMethod" WHERE "restaurantId" = 'restaurant_id';

-- View invoices
SELECT * FROM "PlatformInvoice" WHERE "restaurantId" = 'restaurant_id' ORDER BY "issuedAt" DESC;

-- View payments
SELECT * FROM "PlatformPayment" WHERE "restaurantId" = 'restaurant_id' ORDER BY "createdAt" DESC;

-- View unpaid invoices
SELECT * FROM "PlatformInvoice" WHERE status IN ('ISSUED', 'OVERDUE') AND "restaurantId" = 'restaurant_id';
```

---

## Support & Troubleshooting

### Common Issues

**Error: "Unknown column type"**
- Ensure all enum types are created before tables
- Solution: Run migration again, it should be idempotent

**Error: "Foreign key constraint violation"**
- Ensure restaurantId and subscriptionId exist before inserting
- Solution: Check that parent records exist first

**Prisma client generation fails**
- Clear the node_modules/.prisma cache and regenerate
- Solution: `rm -rf node_modules/.prisma && npm run db:generate`

**Migration not found**
- Ensure migration SQL file is in correct directory: `prisma/migrations/20260428152024_add_billing_foundation/`
- Solution: Verify directory exists and migration.sql file is present

---

## Next Steps

After successful migration:

1. **Phase 2:** Implement Billing Service (`src/features/billing/billing.service.ts`)
2. **Phase 3:** Create API endpoints for subscription management
3. **Phase 4:** Add pricing/upgrade UI components
4. **Phase 5:** Integrate with payment processor (Iyzico/Stripe)

For now, the billing tables are ready to use but not connected to any business logic yet.
