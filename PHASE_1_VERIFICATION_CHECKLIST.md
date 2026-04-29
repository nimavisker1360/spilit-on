# Phase 1 Verification Checklist

**Objective:** Confirm billing foundation is correctly deployed and connected to existing models.

---

## Pre-Check: Environment Setup

```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL
# Should output: postgresql://user:pass@host:port/dbname

# Verify you can connect
psql $DATABASE_URL -c "SELECT 1;"
# Should return: 1 (success)
```

**Checklist:**
- [ ] DATABASE_URL is set
- [ ] Can connect to PostgreSQL
- [ ] No connection errors

---

## Part 1: Migration Applied

### Check 1.1: Migration Status
```bash
npx prisma migrate status
```

**Expected Output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

All migrations have been applied:
  20260413201023_init
  20260414001500_mvp_model_refactor
  ...
  20260428152024_add_billing_foundation
```

**Checklist:**
- [ ] `npx prisma migrate status` runs without errors
- [ ] `20260428152024_add_billing_foundation` listed as applied
- [ ] Shows "All migrations have been applied"

### Check 1.2: Prisma Client Generated
```bash
npm run db:generate
```

**Expected Output:**
```
> restaurant-split-pwa@0.1.0 db:generate
> prisma generate

Prisma schema loaded from prisma\schema.prisma
Generated Prisma Client (X.Y.Z) to ./node_modules/@prisma/client in XXXms
```

**Checklist:**
- [ ] Command succeeds without errors
- [ ] No "Unknown model" or "Unknown type" errors
- [ ] Generated Prisma Client v6.19.3 or later

### Check 1.3: TypeScript Compiles
```bash
npm run typecheck
```

**Expected Output:**
```
> restaurant-split-pwa@0.1.0 typecheck
> tsc --noEmit

# No output = success
```

**Checklist:**
- [ ] TypeScript compilation succeeds
- [ ] No errors about billing models
- [ ] No errors about Restaurant model changes

---

## Part 2: Enums Exist

### Check 2.1: List All Enums
```bash
psql $DATABASE_URL -c "
SELECT 
  typname AS enum_name,
  (enum_range(NULL::type_enum))[1] AS sample_value
FROM pg_type 
WHERE typtype = 'e' 
ORDER BY typname;"
```

**Expected Output:** List including:
```
         enum_name          | sample_value
----------------------------+--------------
 AuditActorType             | CUSTOMER
 BillingPeriod              | MONTHLY
 InvoiceStatus              | DRAFT
 KitchenItemStatus          | PENDING
 LocaleCode                 | EN
 MembershipStatus           | INVITED
 OrderSource                | CUSTOMER
 OrderStatus                | PENDING
 PaymentMethodType          | CARD
 PaymentSessionStatus       | OPEN
 PaymentShareStatus         | UNPAID
 PaymentStatus              | PENDING
 PlatformPaymentStatus      | PENDING
 ...
```

**Checklist:**
- [ ] `InvoiceStatus` enum exists
- [ ] `PaymentMethodType` enum exists  
- [ ] `PlatformPaymentStatus` enum exists
- [ ] Other existing enums unchanged

### Check 2.2: Verify Enum Values
```bash
psql $DATABASE_URL -c "
SELECT enum_range(NULL::\"InvoiceStatus\") AS invoice_statuses;"
```

**Expected Output:**
```
                    invoice_statuses
---------------------------------------------------
 {DRAFT,ISSUED,PAID,OVERDUE,FAILED,REFUNDED,CANCELLED}
```

**Checklist:**
- [ ] InvoiceStatus has all 7 values
- [ ] PaymentMethodType has CARD, BANK_TRANSFER, CRYPTO
- [ ] PlatformPaymentStatus has PENDING, SUCCEEDED, FAILED, REFUNDED, CANCELLED

```bash
# Verify PaymentMethodType
psql $DATABASE_URL -c "
SELECT enum_range(NULL::\"PaymentMethodType\") AS payment_method_types;"
```

```bash
# Verify PlatformPaymentStatus  
psql $DATABASE_URL -c "
SELECT enum_range(NULL::\"PlatformPaymentStatus\") AS platform_payment_statuses;"
```

---

## Part 3: New Tables Exist

### Check 3.1: List All Tables
```bash
psql $DATABASE_URL -c "
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;"
```

**Expected Output:** Should include:
```
        tablename
--------------------------
 Account
 AuditLog
 AuthSession
 Branch
 BranchSettings
 Guest
 Invitation
 Invoice
 InvoiceAssignment
 InvoiceLine
 Kitchen
 Membership
 MembershipBranchAccess
 MenuCategory
 MenuItem
 OnboardingProgress
 Order
 OrderItem
 Payment
 PaymentAttempt
 PaymentMethod          ← NEW
 PaymentSession
 PaymentShare
 PlatformInvoice        ← NEW
 PlatformPayment        ← NEW
 Restaurant
 ...
```

**Checklist:**
- [ ] `PaymentMethod` table exists
- [ ] `PlatformInvoice` table exists
- [ ] `PlatformPayment` table exists
- [ ] Total table count is 25 (was 22 before migration)

### Check 3.2: Count Total Tables
```bash
psql $DATABASE_URL -c "
SELECT COUNT(*) AS total_tables
FROM pg_tables 
WHERE schemaname = 'public';"
```

**Expected Output:**
```
 total_tables
--------------
    25
```

**Checklist:**
- [ ] Total tables = 25 (22 existing + 3 new)

---

## Part 4: New Table Schemas

### Check 4.1: PaymentMethod Table Structure
```bash
psql $DATABASE_URL -c "\d \"PaymentMethod\""
```

**Expected Output:**
```
                         Table "public.PaymentMethod"
        Column         |           Type            | Collation | Nullable | Default
-----------------------+---------------------------+-----------+----------+---------
 id                    | text                      |           | not null |
 restaurantId          | text                      |           | not null |
 type                  | "PaymentMethodType"       |           | not null |
 provider              | character varying(64)     |           | not null |
 providerPaymentMethodId | character varying(128)  |           |          |
 last4                 | character varying(4)      |           |          |
 expiryMonth           | integer                   |           |          |
 expiryYear            | integer                   |           |          |
 holderName            | text                      |           |          |
 isDefault             | boolean                   |           | not null | false
 createdAt             | timestamp(3) without time zone |   | not null | CURRENT_TIMESTAMP
 updatedAt             | timestamp(3) without time zone |   | not null |
Indexes:
    "PaymentMethod_pkey" PRIMARY KEY, btree (id)
    "PaymentMethod_restaurantId_idx" btree (restaurantId)
    "PaymentMethod_provider_providerPaymentMethodId_idx" btree (provider, "providerPaymentMethodId")
Foreign-key constraints:
    "PaymentMethod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"(id) ON DELETE CASCADE
```

**Checklist:**
- [ ] 12 columns present
- [ ] id (text, PK)
- [ ] restaurantId (text, NOT NULL)
- [ ] type (PaymentMethodType enum)
- [ ] provider (varchar 64)
- [ ] isDefault (boolean, default false)
- [ ] createdAt, updatedAt (timestamp(3))
- [ ] 2 indexes created
- [ ] FK to Restaurant with CASCADE

### Check 4.2: PlatformInvoice Table Structure
```bash
psql $DATABASE_URL -c "\d \"PlatformInvoice\""
```

**Expected Output:** Should show:
```
                       Table "public.PlatformInvoice"
      Column       |           Type            | Collation | Nullable | Default
-------------------+---------------------------+-----------+----------+---------
 id                | text                      |           | not null |
 restaurantId      | text                      |           | not null |
 subscriptionId    | text                      |           | not null |
 invoiceNumber     | text                      |           | not null |
 status            | "InvoiceStatus"           |           | not null | 'DRAFT'
 currency          | character varying(3)      |           | not null | 'TRY'
 amount            | numeric(10,2)             |           | not null |
 taxAmount         | numeric(10,2)             |           | not null | 0
 discountAmount    | numeric(10,2)             |           | not null | 0
 totalAmount       | numeric(10,2)             |           | not null |
 description       | text                      |           |          |
 billingPeriodStart| timestamp(3) without time zone |   | not null |
 billingPeriodEnd  | timestamp(3) without time zone |   | not null |
 dueDate           | timestamp(3) without time zone |   |          |
 issuedAt          | timestamp(3) without time zone |   | not null | CURRENT_TIMESTAMP
 paidAt            | timestamp(3) without time zone |   |          |
 failedAt          | timestamp(3) without time zone |   |          |
 refundedAt        | timestamp(3) without time zone |   |          |
 metadata          | jsonb                     |           |          |
 createdAt         | timestamp(3) without time zone |   | not null | CURRENT_TIMESTAMP
 updatedAt         | timestamp(3) without time zone |   | not null |
Indexes:
    "PlatformInvoice_pkey" PRIMARY KEY, btree (id)
    "PlatformInvoice_restaurantId_invoiceNumber_key" UNIQUE, btree ("restaurantId", "invoiceNumber")
    "PlatformInvoice_restaurantId_status_idx" btree ("restaurantId", status)
    "PlatformInvoice_subscriptionId_status_idx" btree ("subscriptionId", status)
    "PlatformInvoice_dueDate_status_idx" btree ("dueDate", status)
    "PlatformInvoice_issuedAt_idx" btree ("issuedAt")
Foreign-key constraints:
    "PlatformInvoice_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"(id) ON DELETE CASCADE
    "PlatformInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"(id) ON DELETE CASCADE
```

**Checklist:**
- [ ] 21 columns present
- [ ] invoiceNumber (text, NOT NULL)
- [ ] status (InvoiceStatus, default DRAFT)
- [ ] amount, taxAmount, discountAmount, totalAmount (numeric(10,2))
- [ ] billingPeriodStart, billingPeriodEnd (NOT NULL)
- [ ] Key date fields present (issuedAt, paidAt, failedAt, refundedAt)
- [ ] metadata (jsonb)
- [ ] 6 indexes (1 unique + 5 regular)
- [ ] FK to Restaurant (CASCADE)
- [ ] FK to TenantSubscription (CASCADE)

### Check 4.3: PlatformPayment Table Structure
```bash
psql $DATABASE_URL -c "\d \"PlatformPayment\""
```

**Expected Output:** Should show:
```
                       Table "public.PlatformPayment"
       Column        |           Type            | Collation | Nullable | Default
---------------------+---------------------------+-----------+----------+---------
 id                  | text                      |           | not null |
 restaurantId        | text                      |           | not null |
 subscriptionId      | text                      |           | not null |
 invoiceId           | text                      |           |          |
 amount              | numeric(10,2)             |           | not null |
 currency            | character varying(3)      |           | not null | 'TRY'
 status              | "PlatformPaymentStatus"   |           | not null | 'PENDING'
 provider            | character varying(64)     |           | not null |
 providerPaymentId   | character varying(128)    |           |          |
 providerTransactionId | character varying(128)  |           |          |
 method              | "PaymentMethodType"       |           |          |
 failureReason       | text                      |           |          |
 attemptCount        | integer                   |           | not null | 0
 lastAttemptedAt     | timestamp(3) without time zone |   |          |
 succeededAt         | timestamp(3) without time zone |   |          |
 refundedAt          | timestamp(3) without time zone |   |          |
 metadata            | jsonb                     |           |          |
 createdAt           | timestamp(3) without time zone |   | not null | CURRENT_TIMESTAMP
 updatedAt           | timestamp(3) without time zone |   | not null |
Indexes:
    "PlatformPayment_pkey" PRIMARY KEY, btree (id)
    "PlatformPayment_restaurantId_status_idx" btree ("restaurantId", status)
    "PlatformPayment_subscriptionId_status_idx" btree ("subscriptionId", status)
    "PlatformPayment_invoiceId_idx" btree ("invoiceId")
    "PlatformPayment_provider_providerPaymentId_idx" btree (provider, "providerPaymentId")
    "PlatformPayment_succeededAt_idx" btree ("succeededAt")
Foreign-key constraints:
    "PlatformPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"(id) ON DELETE CASCADE
    "PlatformPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"(id) ON DELETE CASCADE
    "PlatformPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PlatformInvoice"(id) ON DELETE SET NULL
```

**Checklist:**
- [ ] 19 columns present
- [ ] invoiceId (nullable - can exist without specific invoice)
- [ ] status (PlatformPaymentStatus, default PENDING)
- [ ] provider, providerPaymentId, providerTransactionId
- [ ] method (PaymentMethodType, nullable)
- [ ] attemptCount, lastAttemptedAt
- [ ] succeededAt, refundedAt
- [ ] 6 indexes
- [ ] FK to Restaurant (CASCADE)
- [ ] FK to TenantSubscription (CASCADE)
- [ ] FK to PlatformInvoice (SET NULL - important!)

---

## Part 5: TenantSubscription Extended

### Check 5.1: View TenantSubscription Changes
```bash
psql $DATABASE_URL -c "\d \"TenantSubscription\""
```

**Expected Output:** Should include:
```
                 Table "public.TenantSubscription"
        Column        |           Type            | Collation | Nullable | Default
----------------------+---------------------------+-----------+----------+---------
 id                   | text                      |           | not null |
 restaurantId         | text                      |           | not null |
 planId               | text                      |           | not null |
 provider             | character varying(64)     |           | not null | 'manual'
 providerSubscriptionId | character varying(128)  |           |          |
 status               | "SubscriptionStatus"      |           | not null | 'TRIALING'
 billingPeriod        | "BillingPeriod"           |           | not null | 'MONTHLY'
 currentPeriodStart   | timestamp(3) without time zone |   | not null |
 currentPeriodEnd     | timestamp(3) without time zone |   | not null |
 nextBillingDate      | timestamp(3) without time zone |   |          | ← NEW
 lastBillingDate      | timestamp(3) without time zone |   |          | ← NEW
 cancelAtPeriodEnd    | boolean                   |           | not null | false
 autoRenew            | boolean                   |           | not null | true    | ← NEW
 paymentMethodId      | text                      |           |          | ← NEW
 createdAt            | timestamp(3) without time zone |   | not null | CURRENT_TIMESTAMP
 updatedAt            | timestamp(3) without time zone |   | not null |
Indexes:
    "TenantSubscription_pkey" PRIMARY KEY, btree (id)
    "TenantSubscription_restaurantId_status_idx" btree ("restaurantId", status)
    "TenantSubscription_provider_providerSubscriptionId_idx" btree (provider, "providerSubscriptionId")
    "TenantSubscription_nextBillingDate_idx" btree ("nextBillingDate") | ← NEW INDEX
Foreign-key constraints:
    "TenantSubscription_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"(id) ON DELETE CASCADE
    "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"(id) ON DELETE RESTRICT
    "TenantSubscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"(id) ON DELETE SET NULL | ← NEW
Referenced by:
    TABLE "PlatformInvoice" CONSTRAINT "PlatformInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"(id) ON DELETE CASCADE
    TABLE "PlatformPayment" CONSTRAINT "PlatformPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"(id) ON DELETE CASCADE
```

**Checklist:**
- [ ] `nextBillingDate` column added (nullable timestamp)
- [ ] `lastBillingDate` column added (nullable timestamp)
- [ ] `autoRenew` column added (boolean, default true)
- [ ] `paymentMethodId` column added (text, nullable)
- [ ] `TenantSubscription_nextBillingDate_idx` index exists
- [ ] FK to PaymentMethod exists with SET NULL
- [ ] Referenced by PlatformInvoice and PlatformPayment (shows proper relationships)

---

## Part 6: Restaurant Extended

### Check 6.1: Restaurant Model References
```bash
psql $DATABASE_URL -c "
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_name = 'PaymentMethod' OR table_name = 'PlatformInvoice' OR table_name = 'PlatformPayment'
ORDER BY table_name, constraint_name;"
```

**Expected Output:**
```
          constraint_name          |     table_name     |    column_name
-----------------------------------+--------------------+------------------
 PlatformInvoice_restaurantId_fkey | PlatformInvoice    | restaurantId
 PlatformInvoice_subscriptionId_fkey | PlatformInvoice  | subscriptionId
 PlatformPayment_invoiceId_fkey    | PlatformPayment    | invoiceId
 PlatformPayment_restaurantId_fkey | PlatformPayment    | restaurantId
 PlatformPayment_subscriptionId_fkey | PlatformPayment  | subscriptionId
 PaymentMethod_restaurantId_fkey   | PaymentMethod      | restaurantId
```

**Checklist:**
- [ ] PaymentMethod.restaurantId → Restaurant (CASCADE)
- [ ] PlatformInvoice.restaurantId → Restaurant (CASCADE)
- [ ] PlatformInvoice.subscriptionId → TenantSubscription (CASCADE)
- [ ] PlatformPayment.restaurantId → Restaurant (CASCADE)
- [ ] PlatformPayment.subscriptionId → TenantSubscription (CASCADE)
- [ ] PlatformPayment.invoiceId → PlatformInvoice (SET NULL)

### Check 6.2: Verify Cascade Rules
```bash
psql $DATABASE_URL -c "
SELECT 
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name,
  delete_rule
FROM information_schema.referential_constraints
WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY table_name;"
```

**Expected Output:**
```
          constraint_name          |     table_name     | delete_rule
-----------------------------------+--------------------+-------------
 PaymentMethod_restaurantId_fkey   | PaymentMethod      | CASCADE
 PlatformInvoice_restaurantId_fkey | PlatformInvoice    | CASCADE
 PlatformInvoice_subscriptionId_fkey | PlatformInvoice  | CASCADE
 PlatformPayment_restaurantId_fkey | PlatformPayment    | CASCADE
 PlatformPayment_invoiceId_fkey    | PlatformPayment    | SET NULL
 PlatformPayment_subscriptionId_fkey | PlatformPayment  | CASCADE
```

**Checklist:**
- [ ] Restaurant deletions CASCADE to PaymentMethod
- [ ] Restaurant deletions CASCADE to PlatformInvoice
- [ ] Restaurant deletions CASCADE to PlatformPayment
- [ ] TenantSubscription deletions CASCADE to PlatformInvoice
- [ ] TenantSubscription deletions CASCADE to PlatformPayment
- [ ] PlatformInvoice deletions SET NULL on PlatformPayment.invoiceId

---

## Part 7: Indexes Verification

### Check 7.1: Count Indexes
```bash
psql $DATABASE_URL -c "
SELECT tablename, COUNT(*) AS index_count
FROM pg_indexes
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
GROUP BY tablename
ORDER BY tablename;"
```

**Expected Output:**
```
    tablename    | index_count
-----------------+-------------
 PaymentMethod   |           2
 PlatformInvoice |           5
 PlatformPayment |           5
```

**Checklist:**
- [ ] PaymentMethod has 2 indexes
- [ ] PlatformInvoice has 5 indexes (1 unique + 4 regular)
- [ ] PlatformPayment has 5 indexes

### Check 7.2: List All Indexes
```bash
psql $DATABASE_URL -c "
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY tablename, indexname;"
```

**Expected Output:**
```
    tablename    |                      indexname                      |                         indexdef
-----------------+-----------------------------------------------------+-------------------------------------------
 PaymentMethod   | PaymentMethod_pkey                                  | CREATE UNIQUE INDEX "PaymentMethod_pkey" ... ON "PaymentMethod" USING btree (id)
 PaymentMethod   | PaymentMethod_provider_providerPaymentMethodId_idx  | CREATE INDEX "PaymentMethod_provider_..." ... ON "PaymentMethod" USING btree (provider, "providerPaymentMethodId")
 PaymentMethod   | PaymentMethod_restaurantId_idx                      | CREATE INDEX "PaymentMethod_restaurantId_..." ... ON "PaymentMethod" USING btree ("restaurantId")
 PlatformInvoice | PlatformInvoice_dueDate_status_idx                  | CREATE INDEX "PlatformInvoice_dueDate_..." ... ON "PlatformInvoice" USING btree ("dueDate", status)
 PlatformInvoice | PlatformInvoice_issuedAt_idx                        | CREATE INDEX "PlatformInvoice_issuedAt_..." ... ON "PlatformInvoice" USING btree ("issuedAt")
 PlatformInvoice | PlatformInvoice_pkey                                | CREATE UNIQUE INDEX "PlatformInvoice_pkey" ... ON "PlatformInvoice" USING btree (id)
 PlatformInvoice | PlatformInvoice_restaurantId_invoiceNumber_key      | CREATE UNIQUE INDEX "PlatformInvoice_restaurantId_..." ... ON "PlatformInvoice" USING btree ("restaurantId", "invoiceNumber")
 PlatformInvoice | PlatformInvoice_restaurantId_status_idx             | CREATE INDEX "PlatformInvoice_restaurantId_..." ... ON "PlatformInvoice" USING btree ("restaurantId", status)
 PlatformInvoice | PlatformInvoice_subscriptionId_status_idx           | CREATE INDEX "PlatformInvoice_subscriptionId_..." ... ON "PlatformInvoice" USING btree ("subscriptionId", status)
 PlatformPayment | PlatformPayment_invoiceId_idx                       | CREATE INDEX "PlatformPayment_invoiceId_..." ... ON "PlatformPayment" USING btree ("invoiceId")
 PlatformPayment | PlatformPayment_pkey                                | CREATE UNIQUE INDEX "PlatformPayment_pkey" ... ON "PlatformPayment" USING btree (id)
 PlatformPayment | PlatformPayment_provider_providerPaymentId_idx      | CREATE INDEX "PlatformPayment_provider_..." ... ON "PlatformPayment" USING btree (provider, "providerPaymentId")
 PlatformPayment | PlatformPayment_restaurantId_status_idx             | CREATE INDEX "PlatformPayment_restaurantId_..." ... ON "PlatformPayment" USING btree ("restaurantId", status)
 PlatformPayment | PlatformPayment_subscriptionId_status_idx           | CREATE INDEX "PlatformPayment_subscriptionId_..." ... ON "PlatformPayment" USING btree ("subscriptionId", status)
 PlatformPayment | PlatformPayment_succeededAt_idx                     | CREATE INDEX "PlatformPayment_succeededAt_..." ... ON "PlatformPayment" USING btree ("succeededAt")
```

**Checklist:**
- [ ] PaymentMethod indexes:
  - [ ] PK on id
  - [ ] Composite on (provider, providerPaymentMethodId)
  - [ ] Single on restaurantId

- [ ] PlatformInvoice indexes:
  - [ ] PK on id
  - [ ] UNIQUE on (restaurantId, invoiceNumber)
  - [ ] Composite on (restaurantId, status)
  - [ ] Composite on (subscriptionId, status)
  - [ ] Composite on (dueDate, status)
  - [ ] Single on issuedAt

- [ ] PlatformPayment indexes:
  - [ ] PK on id
  - [ ] Composite on (restaurantId, status)
  - [ ] Composite on (subscriptionId, status)
  - [ ] Single on invoiceId
  - [ ] Composite on (provider, providerPaymentId)
  - [ ] Single on succeededAt

---

## Part 8: Data Integrity Tests

### Check 8.1: Restaurant Still Has Data
```bash
psql $DATABASE_URL -c "
SELECT COUNT(*) as total_restaurants, 
       COUNT(CASE WHEN status::text = 'TRIALING' THEN 1 END) as trialing,
       COUNT(CASE WHEN status::text = 'ACTIVE' THEN 1 END) as active
FROM \"Restaurant\";"
```

**Expected Output:** Shows count of restaurants (should be > 0)
```
 total_restaurants | trialing | active
-------------------+----------+--------
        X          |    Y     |   Z
```

**Checklist:**
- [ ] COUNT shows restaurants exist
- [ ] Status column still populated

### Check 8.2: TenantSubscription Still Intact
```bash
psql $DATABASE_URL -c "
SELECT COUNT(*) as total_subscriptions,
       COUNT(CASE WHEN \"autoRenew\" THEN 1 END) as auto_renew_true,
       COUNT(CASE WHEN \"paymentMethodId\" IS NOT NULL THEN 1 END) as has_payment_method
FROM \"TenantSubscription\";"
```

**Expected Output:**
```
 total_subscriptions | auto_renew_true | has_payment_method
---------------------+-----------------+--------------------
        X            |        Y        |         0
```

**Checklist:**
- [ ] Subscriptions count unchanged
- [ ] autoRenew defaults to true for existing records
- [ ] paymentMethodId is NULL for existing records (no payment methods assigned yet)

### Check 8.3: No Orphaned Data
```bash
psql $DATABASE_URL -c "
SELECT 
  'Orphaned PaymentMethod' AS issue, COUNT(*) AS count
FROM \"PaymentMethod\"
WHERE \"restaurantId\" NOT IN (SELECT id FROM \"Restaurant\")
UNION ALL
SELECT 
  'Orphaned PlatformInvoice', COUNT(*)
FROM \"PlatformInvoice\"
WHERE \"restaurantId\" NOT IN (SELECT id FROM \"Restaurant\")
UNION ALL
SELECT 
  'Orphaned PlatformPayment', COUNT(*)
FROM \"PlatformPayment\"
WHERE \"restaurantId\" NOT IN (SELECT id FROM \"Restaurant\")
UNION ALL
SELECT 
  'Orphaned TenantSubscription refs', COUNT(*)
FROM \"PlatformInvoice\"
WHERE \"subscriptionId\" NOT IN (SELECT id FROM \"TenantSubscription\");"
```

**Expected Output:**
```
            issue             | count
------------------------------+-------
 Orphaned PaymentMethod       |    0
 Orphaned PlatformInvoice     |    0
 Orphaned PlatformPayment     |    0
 Orphaned TenantSubscription refs |  0
```

**Checklist:**
- [ ] No orphaned PaymentMethod records
- [ ] No orphaned PlatformInvoice records
- [ ] No orphaned PlatformPayment records
- [ ] No orphaned subscription references

---

## Part 9: Relationship Testing

### Check 9.1: Restaurant → PaymentMethod Relationship
```bash
psql $DATABASE_URL -c "
SELECT 
  r.id,
  r.name,
  COUNT(pm.id) as payment_methods_count
FROM \"Restaurant\" r
LEFT JOIN \"PaymentMethod\" pm ON r.id = pm.\"restaurantId\"
GROUP BY r.id, r.name
LIMIT 5;"
```

**Expected Output:** Shows restaurants (empty payment methods for now is OK)
```
                  id                  |        name        | payment_methods_count
---------------------------------------+--------------------+----------------------
 clpr1234567890abcdefghijklm          | Alice's Restaurant |                     0
 clpr9876543210abcdefghijklm          | Bob's Cafe         |                     0
```

**Checklist:**
- [ ] Relationship query succeeds
- [ ] COUNT works (no FK constraint errors)
- [ ] Results show expected restaurants

### Check 9.2: TenantSubscription → PaymentMethod Relationship
```bash
psql $DATABASE_URL -c "
SELECT 
  ts.id,
  ts.\"restaurantId\",
  ts.\"autoRenew\",
  ts.\"nextBillingDate\",
  pm.id as payment_method_id,
  pm.\"last4\"
FROM \"TenantSubscription\" ts
LEFT JOIN \"PaymentMethod\" pm ON ts.\"paymentMethodId\" = pm.id
LIMIT 5;"
```

**Expected Output:** Shows subscriptions with optional payment methods
```
                  id                  |         restaurantId         | autoRenew | nextBillingDate | payment_method_id | last4
---------------------------------------+------------------------------+-----------+-----------------+-------------------+-------
 clpr1234567890abcdefghijklm          | clpr0987654321abcdefghijklm  | t         |                 |                   |
 clpr9876543210abcdefghijklm          | clpr0987654321abcdefghijklm  | t         |                 |                   |
```

**Checklist:**
- [ ] Relationship query succeeds
- [ ] autoRenew shows true for all (default value)
- [ ] nextBillingDate NULL for all (not yet set)
- [ ] paymentMethodId NULL for all (no methods assigned yet)

### Check 9.3: TenantSubscription → PlatformInvoice Relationship
```bash
psql $DATABASE_URL -c "
SELECT 
  ts.id as subscription_id,
  COUNT(pi.id) as invoice_count,
  MAX(pi.\"issuedAt\") as latest_invoice
FROM \"TenantSubscription\" ts
LEFT JOIN \"PlatformInvoice\" pi ON ts.id = pi.\"subscriptionId\"
GROUP BY ts.id
LIMIT 5;"
```

**Expected Output:** Shows subscriptions with zero invoices (expected, none created yet)
```
             subscription_id             | invoice_count | latest_invoice
---------------------------------------+---------------+----------------
 clpr1234567890abcdefghijklm          |             0 |
 clpr9876543210abcdefghijklm          |             0 |
```

**Checklist:**
- [ ] Relationship query succeeds
- [ ] All subscriptions have 0 invoices (expected, migration just applied)

### Check 9.4: Restaurant → PlatformInvoice Relationship
```bash
psql $DATABASE_URL -c "
SELECT 
  r.id,
  r.name,
  COUNT(pi.id) as invoice_count
FROM \"Restaurant\" r
LEFT JOIN \"PlatformInvoice\" pi ON r.id = pi.\"restaurantId\"
GROUP BY r.id, r.name
LIMIT 5;"
```

**Expected Output:**
```
                  id                  |        name        | invoice_count
---------------------------------------+--------------------+---------------
 clpr1234567890abcdefghijklm          | Alice's Restaurant |             0
 clpr9876543210abcdefghijklm          | Bob's Cafe         |             0
```

**Checklist:**
- [ ] Relationship query succeeds
- [ ] All restaurants have 0 invoices (expected at this phase)

---

## Part 10: Application Integration

### Check 10.1: App Starts
```bash
npm run dev
```

**Expected Output:**
```
  ▲ Next.js 14.2.24
  - Local:        http://localhost:3000
```

**Checklist:**
- [ ] Application starts without errors
- [ ] No database connection errors
- [ ] No Prisma client errors

### Check 10.2: Existing Features Work
In browser at http://localhost:3000:

- [ ] Login page loads
- [ ] Can log in (if test account exists)
- [ ] Admin dashboard loads
- [ ] Restaurant list shows
- [ ] Branch list shows
- [ ] Can create a test restaurant (if enabled)
- [ ] Menu items visible
- [ ] Payment flows still work

### Check 10.3: No TypeScript Errors
```bash
npm run typecheck
```

**Expected Output:** (no output = success)

**Checklist:**
- [ ] TypeScript compilation succeeds
- [ ] No errors about Restaurant model
- [ ] No errors about TenantSubscription model
- [ ] No errors about new billing models

---

## Part 11: Summary Verification Script

Run this single comprehensive check:

```bash
# Save as check_billing_migration.sh
#!/bin/bash

echo "=== Phase 1 Billing Migration Verification ==="
echo ""

echo "1. Checking migration status..."
npx prisma migrate status | grep -q "add_billing_foundation" && echo "✓ Migration applied" || echo "✗ Migration NOT applied"

echo ""
echo "2. Checking new tables exist..."
TABLE_COUNT=$(psql $DATABASE_URL -tc "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment');")
[ "$TABLE_COUNT" -eq 3 ] && echo "✓ All 3 new tables exist" || echo "✗ Tables missing"

echo ""
echo "3. Checking new enums..."
ENUM_COUNT=$(psql $DATABASE_URL -tc "SELECT COUNT(*) FROM pg_type WHERE typtype='e' AND typname IN ('InvoiceStatus', 'PaymentMethodType', 'PlatformPaymentStatus');")
[ "$ENUM_COUNT" -eq 3 ] && echo "✓ All 3 new enums exist" || echo "✗ Enums missing"

echo ""
echo "4. Checking TenantSubscription columns..."
COLUMN_COUNT=$(psql $DATABASE_URL -tc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='TenantSubscription' AND column_name IN ('nextBillingDate', 'lastBillingDate', 'autoRenew', 'paymentMethodId');")
[ "$COLUMN_COUNT" -eq 4 ] && echo "✓ All 4 new columns added" || echo "✗ Columns missing"

echo ""
echo "5. Checking foreign keys..."
FK_COUNT=$(psql $DATABASE_URL -tc "SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment', 'TenantSubscription') AND column_name LIKE '%Id' AND referenced_table_name IS NOT NULL;" 2>/dev/null || echo "0")

echo ""
echo "6. Checking indexes..."
INDEX_COUNT=$(psql $DATABASE_URL -tc "SELECT COUNT(*) FROM pg_indexes WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment');")
[ "$INDEX_COUNT" -eq 12 ] && echo "✓ All 12 expected indexes exist (2+5+5)" || echo "✗ Index count mismatch (expected 12, got $INDEX_COUNT)"

echo ""
echo "7. Checking Prisma client..."
npm run db:generate 2>&1 | grep -q "error" && echo "✗ Prisma client generation failed" || echo "✓ Prisma client generated"

echo ""
echo "8. Checking TypeScript..."
npm run typecheck 2>&1 | grep -q "error" && echo "✗ TypeScript errors found" || echo "✓ TypeScript clean"

echo ""
echo "=== End Verification ==="
```

Run it:
```bash
chmod +x check_billing_migration.sh
./check_billing_migration.sh
```

**Checklist:**
- [ ] All 8 checks pass
- [ ] No failures reported

---

## Final Checklist Summary

**Critical (Must Pass):**
- [ ] Migration applied: `npx prisma migrate status`
- [ ] Prisma regenerated: `npm run db:generate`
- [ ] TypeScript clean: `npm run typecheck`
- [ ] 3 new tables exist in PostgreSQL
- [ ] 3 new enums exist in PostgreSQL
- [ ] 4 new columns on TenantSubscription
- [ ] 7 foreign key constraints active

**Important (Should Pass):**
- [ ] All 13 indexes created
- [ ] Foreign key cascade rules correct
- [ ] No orphaned data
- [ ] TenantSubscription data intact
- [ ] Restaurant data intact

**Functional (Should Work):**
- [ ] App starts without errors
- [ ] Existing auth/login works
- [ ] Existing restaurant features work
- [ ] Existing payment flows work
- [ ] No TypeScript errors in codebase

---

## If Any Check Fails

**Table doesn't exist?**
```bash
# Verify migration file exists
ls -la prisma/migrations/20260428152024_add_billing_foundation/migration.sql

# Check migration content
cat prisma/migrations/20260428152024_add_billing_foundation/migration.sql | head -20
```

**Foreign key error?**
```bash
# Check all FKs
psql $DATABASE_URL -c "
SELECT constraint_name, table_name, column_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE constraint_name LIKE '%fkey%'
ORDER BY table_name;"
```

**Enum doesn't exist?**
```bash
# List all enums
psql $DATABASE_URL -c "
SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname;"
```

**Column missing?**
```bash
# Check TenantSubscription columns
psql $DATABASE_URL -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name='TenantSubscription' 
ORDER BY column_name;"
```

---

**Phase 1 verification complete. DO NOT proceed to Phase 2 until all checks pass.**
