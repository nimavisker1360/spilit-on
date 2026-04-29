-- ============================================================================
-- PHASE 1 VERIFICATION - SQL QUERIES
-- Copy and paste these commands into: psql $DATABASE_URL
-- ============================================================================

-- ============================================================================
-- VERIFICATION 1: Check Tables Exist
-- ============================================================================

-- List all new tables
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY tablename;

-- Expected output:
--     tablename
-- --------------------
--  PaymentMethod
--  PlatformInvoice
--  PlatformPayment


-- Count total tables (should be 25, was 22 before)
SELECT COUNT(*) AS total_tables
FROM pg_tables
WHERE schemaname = 'public';

-- Expected: 25


-- ============================================================================
-- VERIFICATION 2: Check Enums Exist
-- ============================================================================

-- List all new enums
SELECT typname
FROM pg_type
WHERE typtype = 'e'
  AND typname IN ('InvoiceStatus', 'PaymentMethodType', 'PlatformPaymentStatus')
ORDER BY typname;

-- Expected output:
--        typname
-- -------------------------
--  InvoiceStatus
--  PaymentMethodType
--  PlatformPaymentStatus


-- Show enum values for InvoiceStatus
SELECT enum_range(NULL::"InvoiceStatus") AS invoice_statuses;

-- Expected: {DRAFT,ISSUED,PAID,OVERDUE,FAILED,REFUNDED,CANCELLED}


-- Show enum values for PaymentMethodType
SELECT enum_range(NULL::"PaymentMethodType") AS payment_method_types;

-- Expected: {CARD,BANK_TRANSFER,CRYPTO}


-- Show enum values for PlatformPaymentStatus
SELECT enum_range(NULL::"PlatformPaymentStatus") AS platform_payment_statuses;

-- Expected: {PENDING,SUCCEEDED,FAILED,REFUNDED,CANCELLED}


-- ============================================================================
-- VERIFICATION 3: Check TenantSubscription Extended
-- ============================================================================

-- View full TenantSubscription schema
\d "TenantSubscription"

-- Check specific columns
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'TenantSubscription'
  AND column_name IN ('nextBillingDate', 'lastBillingDate', 'autoRenew', 'paymentMethodId')
ORDER BY column_name;

-- Expected output (4 rows):
--      column_name      |           data_type           | is_nullable
-- -----------------------+-------------------------------+-------------
--  autoRenew            | boolean                       | NO
--  lastBillingDate      | timestamp without time zone   | YES
--  nextBillingDate      | timestamp without time zone   | YES
--  paymentMethodId      | text                          | YES


-- ============================================================================
-- VERIFICATION 4: Check Foreign Keys
-- ============================================================================

-- List all FKs involving billing tables
SELECT
  constraint_name,
  table_name,
  column_name,
  referenced_table_name,
  referenced_column_name
FROM information_schema.referential_constraints
WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment', 'TenantSubscription')
ORDER BY table_name, constraint_name;

-- Expected output (7 rows):
--                    constraint_name                 |     table_name     |    column_name     | referenced_table_name | referenced_column_name
-- ---------------------------------------------------------------+--------------------+--------------------+-----------------------+------------------------
--  PaymentMethod_restaurantId_fkey                   | PaymentMethod      | restaurantId       | Restaurant            | id
--  PlatformInvoice_restaurantId_fkey                 | PlatformInvoice    | restaurantId       | Restaurant            | id
--  PlatformInvoice_subscriptionId_fkey               | PlatformInvoice    | subscriptionId     | TenantSubscription    | id
--  PlatformPayment_invoiceId_fkey                    | PlatformPayment    | invoiceId          | PlatformInvoice       | id
--  PlatformPayment_restaurantId_fkey                 | PlatformPayment    | restaurantId       | Restaurant            | id
--  PlatformPayment_subscriptionId_fkey               | PlatformPayment    | subscriptionId     | TenantSubscription    | id
--  TenantSubscription_paymentMethodId_fkey           | TenantSubscription | paymentMethodId    | PaymentMethod         | id


-- ============================================================================
-- VERIFICATION 5: Check Indexes
-- ============================================================================

-- Count indexes on new tables
SELECT
  tablename,
  COUNT(*) AS index_count
FROM pg_indexes
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
GROUP BY tablename
ORDER BY tablename;

-- Expected output (3 rows):
--    tablename    | index_count
-- -----------------+-------------
--  PaymentMethod   |           2
--  PlatformInvoice |           5
--  PlatformPayment |           5


-- List all indexes
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY tablename, indexname;

-- Expected: 12 total indexes (2+5+5)


-- Check index details
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
ORDER BY tablename, indexname;


-- ============================================================================
-- VERIFICATION 6: Check Data Integrity
-- ============================================================================

-- Check for orphaned PaymentMethod records
SELECT COUNT(*) AS orphaned_payment_methods
FROM "PaymentMethod" pm
WHERE pm."restaurantId" NOT IN (SELECT id FROM "Restaurant");

-- Expected: 0


-- Check for orphaned PlatformInvoice records
SELECT COUNT(*) AS orphaned_invoices
FROM "PlatformInvoice" pi
WHERE pi."restaurantId" NOT IN (SELECT id FROM "Restaurant");

-- Expected: 0


-- Check for orphaned PlatformPayment records
SELECT COUNT(*) AS orphaned_payments
FROM "PlatformPayment" pp
WHERE pp."restaurantId" NOT IN (SELECT id FROM "Restaurant");

-- Expected: 0


-- Check for broken subscription references in invoices
SELECT COUNT(*) AS broken_invoice_subscriptions
FROM "PlatformInvoice" pi
WHERE pi."subscriptionId" NOT IN (SELECT id FROM "TenantSubscription");

-- Expected: 0


-- All orphaned data in one query
SELECT
  'PaymentMethod' AS table_name,
  COUNT(*) AS orphaned_count
FROM "PaymentMethod"
WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")
UNION ALL
SELECT
  'PlatformInvoice',
  COUNT(*)
FROM "PlatformInvoice"
WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")
UNION ALL
SELECT
  'PlatformPayment',
  COUNT(*)
FROM "PlatformPayment"
WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")
UNION ALL
SELECT
  'PlatformInvoice (broken subscription)',
  COUNT(*)
FROM "PlatformInvoice"
WHERE "subscriptionId" NOT IN (SELECT id FROM "TenantSubscription");

-- Expected: All zeros


-- ============================================================================
-- VERIFICATION 7: Check Existing Data Intact
-- ============================================================================

-- Count restaurants
SELECT COUNT(*) AS total_restaurants
FROM "Restaurant";

-- Expected: > 0 (your existing restaurants)


-- Count subscriptions
SELECT COUNT(*) AS total_subscriptions
FROM "TenantSubscription";

-- Expected: > 0 (your existing subscriptions)


-- Check new fields are properly initialized
SELECT
  COUNT(*) AS total_subscriptions,
  COUNT(CASE WHEN "autoRenew" THEN 1 END) AS auto_renew_true,
  COUNT(CASE WHEN "nextBillingDate" IS NOT NULL THEN 1 END) AS has_next_billing,
  COUNT(CASE WHEN "lastBillingDate" IS NOT NULL THEN 1 END) AS has_last_billing,
  COUNT(CASE WHEN "paymentMethodId" IS NOT NULL THEN 1 END) AS has_payment_method
FROM "TenantSubscription";

-- Expected:
-- total_subscriptions | auto_renew_true | has_next_billing | has_last_billing | has_payment_method
-- --------------------+-----------------+------------------+------------------+--------------------
--        X            |        X        |         0        |         0        |         0


-- ============================================================================
-- VERIFICATION 8: Check Relationships Work
-- ============================================================================

-- Test Restaurant → PaymentMethod relationship
SELECT
  r.id,
  r.name,
  COUNT(pm.id) AS payment_methods
FROM "Restaurant" r
LEFT JOIN "PaymentMethod" pm ON r.id = pm."restaurantId"
GROUP BY r.id, r.name
LIMIT 3;

-- Expected: Shows restaurants with 0 payment methods (none created yet)


-- Test TenantSubscription → PaymentMethod relationship
SELECT
  ts.id,
  ts."autoRenew",
  pm.id AS payment_method_id,
  pm."last4"
FROM "TenantSubscription" ts
LEFT JOIN "PaymentMethod" pm ON ts."paymentMethodId" = pm.id
LIMIT 3;

-- Expected: All payment_method_id NULL, all autoRenew = true


-- Test TenantSubscription → PlatformInvoice relationship
SELECT
  ts.id,
  COUNT(pi.id) AS invoice_count
FROM "TenantSubscription" ts
LEFT JOIN "PlatformInvoice" pi ON ts.id = pi."subscriptionId"
GROUP BY ts.id
LIMIT 3;

-- Expected: All invoice_count = 0


-- Test Restaurant → PlatformInvoice relationship
SELECT
  r.id,
  r.name,
  COUNT(pi.id) AS invoice_count
FROM "Restaurant" r
LEFT JOIN "PlatformInvoice" pi ON r.id = pi."restaurantId"
GROUP BY r.id, r.name
LIMIT 3;

-- Expected: All invoice_count = 0


-- Test PlatformInvoice → PlatformPayment relationship
SELECT
  pi.id,
  pi."invoiceNumber",
  COUNT(pp.id) AS payment_count
FROM "PlatformInvoice" pi
LEFT JOIN "PlatformPayment" pp ON pi.id = pp."invoiceId"
GROUP BY pi.id, pi."invoiceNumber"
LIMIT 3;

-- Expected: No data (no invoices/payments created yet)


-- ============================================================================
-- VERIFICATION 9: Check Unique Constraints
-- ============================================================================

-- List all unique constraints
SELECT
  constraint_name,
  table_name,
  string_agg(column_name, ', ') AS columns
FROM information_schema.key_column_usage
WHERE constraint_type = 'UNIQUE'
  AND table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
GROUP BY constraint_name, table_name
ORDER BY table_name;

-- Expected:
-- constraint_name                              | table_name      | columns
-- -----------------------------------------------+-----------------+-------------------------------------
--  PlatformInvoice_pkey                        | PlatformInvoice | id
--  PlatformInvoice_restaurantId_invoiceNumber_key | PlatformInvoice | restaurantId, invoiceNumber
--  PaymentMethod_pkey                          | PaymentMethod   | id
--  PlatformPayment_pkey                        | PlatformPayment | id


-- ============================================================================
-- VERIFICATION 10: Check Default Values
-- ============================================================================

-- Check defaults on new columns
SELECT
  column_name,
  column_default
FROM information_schema.columns
WHERE table_name = 'TenantSubscription'
  AND column_name IN ('autoRenew', 'nextBillingDate', 'lastBillingDate', 'paymentMethodId');

-- Expected:
-- column_name | column_default
-- --------+----------------------------
--  autoRenew  | true
--  (others are NULL)


-- Check defaults on new tables
SELECT
  table_name,
  column_name,
  column_default
FROM information_schema.columns
WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
  AND column_default IS NOT NULL
ORDER BY table_name, column_name;

-- Expected defaults:
-- TABLE: PaymentMethod
--  isDefault → false
--  createdAt → CURRENT_TIMESTAMP
--  updatedAt → (no default, set by application)
--
-- TABLE: PlatformInvoice
--  status → 'DRAFT'
--  currency → 'TRY'
--  taxAmount → 0
--  discountAmount → 0
--  issuedAt → CURRENT_TIMESTAMP
--  createdAt → CURRENT_TIMESTAMP
--  updatedAt → (no default)
--
-- TABLE: PlatformPayment
--  status → 'PENDING'
--  currency → 'TRY'
--  attemptCount → 0
--  createdAt → CURRENT_TIMESTAMP
--  updatedAt → (no default)


-- ============================================================================
-- VERIFICATION 11: Check All Column Types
-- ============================================================================

-- PaymentMethod columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PaymentMethod'
ORDER BY ordinal_position;

-- Expected: 12 columns with correct types


-- PlatformInvoice columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PlatformInvoice'
ORDER BY ordinal_position;

-- Expected: 21 columns with correct types


-- PlatformPayment columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'PlatformPayment'
ORDER BY ordinal_position;

-- Expected: 19 columns with correct types


-- ============================================================================
-- VERIFICATION 12: Final Summary Report
-- ============================================================================

-- One-stop verification query
SELECT
  'Tables' AS category,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment'))::text || '/3' AS status
UNION ALL
SELECT
  'Enums',
  (SELECT COUNT(*) FROM pg_type WHERE typtype='e' AND typname IN ('InvoiceStatus', 'PaymentMethodType', 'PlatformPaymentStatus'))::text || '/3'
UNION ALL
SELECT
  'TenantSubscription Columns',
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='TenantSubscription' AND column_name IN ('nextBillingDate', 'lastBillingDate', 'autoRenew', 'paymentMethodId'))::text || '/4'
UNION ALL
SELECT
  'Foreign Keys',
  (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE table_name IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment', 'TenantSubscription'))::text || '/7'
UNION ALL
SELECT
  'Indexes',
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment'))::text || '/12'
UNION ALL
SELECT
  'Orphaned Data',
  ((SELECT COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")) +
   (SELECT COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")) +
   (SELECT COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" NOT IN (SELECT id FROM "Restaurant")))::text || '/0'
ORDER BY 1;

-- Expected output:
--        category        | status
-- -----------------------+--------
--  Enums                 | 3/3 ✓
--  Foreign Keys          | 7/7 ✓
--  Indexes               | 12/12 ✓
--  Orphaned Data         | 0/0 ✓
--  Tables                | 3/3 ✓
--  TenantSubscription Columns | 4/4 ✓

-- If all status values match expected ratios, Phase 1 is VERIFIED ✓

-- ============================================================================
-- END OF VERIFICATION QUERIES
-- ============================================================================
