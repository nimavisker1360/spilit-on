# Phase 1 Billing Foundation - Schema Summary

## Changes Made

### 1. New Enums (4 added)

#### InvoiceStatus
```
DRAFT → ISSUED → PAID
                ↓
              OVERDUE
                ↓
              FAILED → REFUNDED
                ↓
            CANCELLED
```

#### PaymentMethodType
```
CARD | BANK_TRANSFER | CRYPTO
```

#### PlatformPaymentStatus
```
PENDING → SUCCEEDED
        ↓
       FAILED → REFUNDED
         ↓
      CANCELLED
```

---

## 2. New Models (3 added)

### Model: PaymentMethod
**Purpose:** Store subscription payment methods (cards, bank accounts, etc.)

**Relationships:**
- `restaurant` → Restaurant (many-to-one, CASCADE on delete)
- `subscriptions` → TenantSubscription[] (one-to-many)

**Key Fields:**
- Provider token storage (providerPaymentMethodId)
- Card metadata (last4, expiry month/year)
- Default payment method flag
- Indexed by restaurantId and provider

---

### Model: PlatformInvoice
**Purpose:** Represent a subscription billing invoice

**Relationships:**
- `restaurant` → Restaurant (many-to-one, CASCADE)
- `subscription` → TenantSubscription (many-to-one, CASCADE)
- `payments` → PlatformPayment[] (one-to-many)

**Key Fields:**
- Invoice number (unique per restaurant)
- Status lifecycle (DRAFT → ISSUED → PAID/FAILED/OVERDUE)
- Amount breakdown (amount, tax, discount, total)
- Billing period tracking
- Key dates (issuedAt, dueDate, paidAt, failedAt, refundedAt)
- Metadata (JSON) for line items or custom data

**Indexes:**
- restaurantId + status (for filtering invoices by status)
- subscriptionId + status (for subscription-specific queries)
- dueDate + status (for finding overdue invoices)
- issuedAt (for chronological queries)

**Unique Constraints:**
- (restaurantId, invoiceNumber) - Each restaurant's invoices are numbered sequentially

---

### Model: PlatformPayment
**Purpose:** Record actual payments made toward platform invoices

**Relationships:**
- `restaurant` → Restaurant (many-to-one, CASCADE)
- `subscription` → TenantSubscription (many-to-one, CASCADE)
- `invoice` → PlatformInvoice? (many-to-one, SET NULL)
  - Optional: payment can exist without specific invoice (e.g., credits)

**Key Fields:**
- Amount and currency
- Status tracking (PENDING → SUCCEEDED / FAILED)
- Provider reference (payment processor name + IDs)
- Payment method used (CARD, BANK_TRANSFER, CRYPTO)
- Retry tracking (attemptCount, lastAttemptedAt)
- Completion dates (succeededAt, refundedAt)
- Failure reason for debugging
- Metadata (JSON) for webhook payloads or processor-specific data

**Indexes:**
- restaurantId + status (for finding pending payments)
- subscriptionId + status (for subscription-level query)
- invoiceId (for linking payments to invoices)
- provider + providerPaymentId (for deduplication and reconciliation)
- succeededAt (for revenue reporting)

---

## 3. Modified Models (2 updated)

### TenantSubscription (Extended)

**New Columns:**
```
nextBillingDate   DateTime?   -- When next invoice should be issued
lastBillingDate   DateTime?   -- When last invoice was issued
autoRenew         Boolean     -- Default: true. Auto-renew on expiration
paymentMethodId   String?     -- FK to PaymentMethod (SET NULL on delete)
```

**New Relationships:**
```
paymentMethod   → PaymentMethod? (optional)
invoices        → PlatformInvoice[] (one-to-many)
payments        → PlatformPayment[] (one-to-many)
```

**New Index:**
- nextBillingDate (for querying upcoming billing dates)

---

### Restaurant (Extended - No New Columns)

**New Relationships Added:**
```
paymentMethods    → PaymentMethod[]
platformInvoices  → PlatformInvoice[]
platformPayments  → PlatformPayment[]
```

**Note:** No new columns added. Restaurant model already had:
- billingEmail (existing, now can be used with invoices)
- currentPlan (existing subscription relationship)

---

## 4. Database Structure Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        RESTAURANT                                │
│  (Tenant)                                                        │
├─────────────────────────────────────────────────────────────────┤
│  id, name, slug, billingEmail, status, ...                      │
│  currentPlanId → SubscriptionPlan                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─────────────────────┬──────────────────────┐
         │                     │                      │
         ▼                     ▼                      ▼
┌──────────────────────┐  ┌────────────────┐  ┌─────────────────┐
│ TenantSubscription   │  │ PaymentMethod  │  │ PlatformInvoice │
├──────────────────────┤  ├────────────────┤  ├─────────────────┤
│ id                   │  │ id             │  │ id              │
│ restaurantId         │  │ restaurantId ──┼──┼─ restaurantId   │
│ planId (→ Plan)      │  │ type           │  │ subscriptionId  │
│ status               │  │ provider       │  │ invoiceNumber   │
│ billingPeriod        │  │ providerToken  │  │ status          │
│                      │  │ last4, expiry  │  │ amount, tax     │
│ nextBillingDate ◄────┼──┤ isDefault      │  │ billingPeriod   │
│ lastBillingDate      │  │ createdAt      │  │ dueDate, paidAt │
│ autoRenew            │  │ updatedAt      │  │ createdAt       │
│ paymentMethodId ─────┼──┼─────────────────  │ updatedAt       │
│ createdAt, updatedAt │  └────────────────┘  └─────────────────┘
└──────────────────────┘                              │
         │                                            │
         │                                            │
         ├────────────────────────┬──────────────────┘
         │                        │
         ▼                        ▼
    ┌──────────────────────────────────────┐
    │      PlatformPayment                 │
    ├──────────────────────────────────────┤
    │ id                                   │
    │ restaurantId                         │
    │ subscriptionId (→ TenantSubscription)│
    │ invoiceId (→ PlatformInvoice)?      │
    │ amount, currency, status             │
    │ provider, providerPaymentId          │
    │ method (PaymentMethodType)           │
    │ attemptCount, succeededAt, refundedAt
    │ createdAt, updatedAt                 │
    └──────────────────────────────────────┘
```

---

## 5. Data Flow Examples

### Scenario 1: New Restaurant Signs Up
```
1. Restaurant created with status TRIALING
2. TenantSubscription created with trial plan
3. No PaymentMethod or PlatformInvoice yet
```

### Scenario 2: Trial Ends, Auto-renew Enabled
```
1. Billing job detects nextBillingDate reached
2. Creates PlatformInvoice (status: DRAFT)
3. Changes invoice status to ISSUED
4. Uses default PaymentMethod from TenantSubscription
5. Creates PlatformPayment (status: PENDING)
6. Attempts payment via provider
7. On success:
   - PlatformPayment.status = SUCCEEDED
   - PlatformPayment.succeededAt = now()
   - PlatformInvoice.status = PAID
   - PlatformInvoice.paidAt = now()
   - TenantSubscription.lastBillingDate = now()
   - TenantSubscription.nextBillingDate = now() + 1 month
```

### Scenario 3: Payment Fails
```
1. PlatformPayment.status = FAILED
2. PlatformPayment.failureReason = "insufficient_funds"
3. PlatformInvoice.status = remains ISSUED
4. TenantSubscription.status stays ACTIVE (for now)
5. System retries after delay
6. After N retries, PlatformInvoice.status = OVERDUE
7. TenantSubscription.status = PAST_DUE
```

### Scenario 4: Customer Downgrades (Not Yet Implemented)
```
1. Request to change TenantSubscription.planId
2. Calculate prorated amount
3. May create credit or charge
4. Continue payment tracking with PlatformInvoice/Payment
```

---

## 6. API Surface (Ready to Implement in Phase 2)

### Billing Service Skeleton
```typescript
// Get subscription with payment methods and invoices
getSubscriptionDetails(subscriptionId: string)

// Create/update payment method
upsertPaymentMethod(restaurantId, method)
deletePaymentMethod(paymentMethodId)
setDefaultPaymentMethod(paymentMethodId)

// Query invoices
getInvoicesByRestaurant(restaurantId, filters?)
getInvoicesBySubscription(subscriptionId)
getInvoicesByStatus(restaurantId, status)

// Query payments
getPaymentsByInvoice(invoiceId)
getPaymentsByRestaurant(restaurantId)
getPaymentsByStatus(status)

// Billing operations
generateInvoice(subscriptionId, metadata?)
recordPayment(invoiceId, amount, provider, token)
refundPayment(paymentId)
sendInvoiceReminder(invoiceId)
```

---

## 7. Validation Rules (To Implement)

- **Invoice:** totalAmount = amount + taxAmount - discountAmount
- **Invoice:** billingPeriodEnd must be > billingPeriodStart
- **Invoice:** dueDate should be > issuedAt
- **Invoice:** paidAt must be null if status ≠ PAID
- **Payment:** amount ≤ invoice.totalAmount (for single invoice)
- **Payment:** cannot create payment for DRAFT invoice
- **PaymentMethod:** Only one default per restaurant
- **TenantSubscription:** nextBillingDate should be within period (no past dates)
- **PlatformInvoice:** invoiceNumber must be unique per restaurant

---

## 8. Indexes Rationale

**High-Traffic Queries (Optimized):**
1. "Find invoices by status for reporting" → `(restaurantId, status)`
2. "Find upcoming billing" → `nextBillingDate`
3. "Reconcile payments" → `(provider, providerPaymentId)`
4. "Find overdue invoices" → `(dueDate, status)`
5. "Revenue reporting" → `succeededAt`

**Uniqueness Constraints:**
- (restaurantId, invoiceNumber) prevents duplicate invoice numbers

---

## 9. Foreign Key Cascade Rules

| Table | FK | OnDelete | Reason |
|-------|-----|----------|--------|
| PaymentMethod | restaurantId | CASCADE | If restaurant deleted, cleanup methods |
| PlatformInvoice | restaurantId | CASCADE | If restaurant deleted, cleanup invoices |
| PlatformInvoice | subscriptionId | CASCADE | If subscription cancels, delete invoices |
| PlatformPayment | restaurantId | CASCADE | If restaurant deleted, cleanup payments |
| PlatformPayment | subscriptionId | CASCADE | If subscription cancels, delete payments |
| PlatformPayment | invoiceId | SET NULL | Payment survives if invoice is deleted |
| TenantSubscription | paymentMethodId | SET NULL | Can unlink payment method without deleting |

---

## File Changes Summary

- ✅ `prisma/schema.prisma` - Updated with new models, enums, relationships
- ✅ `prisma/migrations/20260428152024_add_billing_foundation/migration.sql` - SQL migration
- ✅ `BILLING_MIGRATION.md` - This comprehensive guide

No other files modified (Phase 1 is database-only).

---

## Verification Checklist

- [ ] Schema is syntactically valid (no TypeScript errors in Prisma)
- [ ] Migration SQL is valid PostgreSQL
- [ ] All relationships are properly defined
- [ ] All indexes are specified
- [ ] All FK constraints are specified with correct cascade rules
- [ ] Currency fields use DECIMAL(10,2)
- [ ] All timestamps use TIMESTAMP(3)
- [ ] Unique constraints protect data integrity
- [ ] No circular dependencies between tables
