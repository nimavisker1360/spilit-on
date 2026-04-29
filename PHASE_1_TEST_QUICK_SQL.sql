-- ============================================================================
-- PHASE 1 TRIAL CREATION TEST - QUICK SQL CHEAT SHEET
-- ============================================================================
-- Replace RESTAURANT_ID with your actual restaurant ID
-- Copy these queries into: psql $DATABASE_URL
-- ============================================================================

-- ============================================================================
-- 1. FIND YOUR TEST RESTAURANT (if you don't know the ID)
-- ============================================================================

SELECT id, name, status, "trialEndsAt", "createdAt"
FROM "Restaurant"
ORDER BY "createdAt" DESC
LIMIT 5;

-- Look for your test restaurant in the results. Copy the ID.


-- ============================================================================
-- 2. VERIFY RESTAURANT + TRIAL SUBSCRIPTION (Main Test)
-- ============================================================================

SELECT
  r.id AS restaurant_id,
  r.name,
  r.status AS restaurant_status,
  r."trialEndsAt",
  ts.id AS subscription_id,
  ts.status AS subscription_status,
  ts."billingPeriod",
  ts."autoRenew",
  sp.code AS plan_code,
  sp.name AS plan_name,
  sp."monthlyPrice"
FROM "Restaurant" r
LEFT JOIN "TenantSubscription" ts ON r.id = ts."restaurantId"
LEFT JOIN "SubscriptionPlan" sp ON ts."planId" = sp.id
WHERE r.id = 'RESTAURANT_ID';

-- EXPECTED: 1 row showing TRIALING restaurant with TRIALING subscription


-- ============================================================================
-- 3. VERIFY TRIAL DURATION (Should be ~14 days)
-- ============================================================================

SELECT
  "trialStartedAt",
  "trialEndsAt",
  AGE("trialEndsAt", "trialStartedAt") AS trial_duration,
  AGE("trialEndsAt", NOW()) AS remaining_days
FROM "Restaurant"
WHERE id = 'RESTAURANT_ID';

-- EXPECTED: 14 days duration, remaining_days should be ~14 (or less if time passed)


-- ============================================================================
-- 4. VERIFY NEW BILLING TABLES ARE EMPTY (Expected for new trial)
-- ============================================================================

SELECT
  (SELECT COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" = 'RESTAURANT_ID') AS payment_methods,
  (SELECT COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" = 'RESTAURANT_ID') AS invoices,
  (SELECT COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" = 'RESTAURANT_ID') AS payments;

-- EXPECTED: 0, 0, 0 (all empty - no billing activity yet)


-- ============================================================================
-- 5. VERIFY SUBSCRIPTION FIELDS
-- ============================================================================

SELECT
  id,
  "autoRenew",
  "nextBillingDate",
  "lastBillingDate",
  "paymentMethodId",
  status
FROM "TenantSubscription"
WHERE "restaurantId" = 'RESTAURANT_ID';

-- EXPECTED:
--  autoRenew = true (default)
--  nextBillingDate = NULL (not yet set)
--  lastBillingDate = NULL (no invoices yet)
--  paymentMethodId = NULL (no payment method set)
--  status = TRIALING


-- ============================================================================
-- 6. COUNT ALL BILLING DATA FOR RESTAURANT
-- ============================================================================

SELECT
  'Subscriptions' AS data_type, COUNT(*) FROM "TenantSubscription" WHERE "restaurantId" = 'RESTAURANT_ID'
UNION ALL SELECT 'Payment Methods', COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" = 'RESTAURANT_ID'
UNION ALL SELECT 'Invoices', COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" = 'RESTAURANT_ID'
UNION ALL SELECT 'Payments', COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" = 'RESTAURANT_ID';

-- EXPECTED: 1, 0, 0, 0


-- ============================================================================
-- 7. VERIFY USER + MEMBERSHIP RELATIONSHIP
-- ============================================================================

SELECT
  u.id AS user_id,
  u.email,
  m.id AS membership_id,
  m.role,
  m.status AS membership_status,
  r.name AS restaurant_name
FROM "User" u
JOIN "Membership" m ON u.id = m."userId"
JOIN "Restaurant" r ON m."restaurantId" = r.id
WHERE r.id = 'RESTAURANT_ID';

-- EXPECTED: User linked as OWNER with ACTIVE membership


-- ============================================================================
-- 8. COMPREHENSIVE RESTAURANT PROFILE
-- ============================================================================

SELECT
  r.id,
  r.name,
  r.status,
  r."defaultCurrency",
  r."trialEndsAt",
  (SELECT COUNT(*) FROM "TenantSubscription" WHERE "restaurantId" = r.id) AS subscriptions,
  (SELECT COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" = r.id) AS payment_methods,
  (SELECT COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" = r.id) AS invoices,
  (SELECT COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" = r.id) AS payments,
  (SELECT COUNT(*) FROM "Membership" WHERE "restaurantId" = r.id) AS members,
  (SELECT COUNT(*) FROM "Branch" WHERE "restaurantId" = r.id) AS branches
FROM "Restaurant" r
WHERE r.id = 'RESTAURANT_ID';

-- EXPECTED:
--  status = TRIALING
--  subscriptions = 1
--  payment_methods = 0
--  invoices = 0
--  payments = 0
--  members = 1
--  branches = 1 (auto-created starter branch)


-- ============================================================================
-- 9. VERIFY NO ORPHANED DATA (Data Integrity Check)
-- ============================================================================

SELECT
  'Broken Restaurant refs' AS issue,
  COUNT(*) FROM "TenantSubscription"
  WHERE "restaurantId" = 'RESTAURANT_ID'
    AND "restaurantId" NOT IN (SELECT id FROM "Restaurant")
UNION ALL
SELECT 'Broken Plan refs', COUNT(*)
  FROM "TenantSubscription"
  WHERE "restaurantId" = 'RESTAURANT_ID'
    AND "planId" NOT IN (SELECT id FROM "SubscriptionPlan")
UNION ALL
SELECT 'Broken User refs', COUNT(*)
  FROM "Membership"
  WHERE "restaurantId" = 'RESTAURANT_ID'
    AND "userId" NOT IN (SELECT id FROM "User");

-- EXPECTED: All 0 (no broken relationships)


-- ============================================================================
-- 10. VERIFY SUBSCRIPTION PLAN DETAILS
-- ============================================================================

SELECT
  sp.id,
  sp.code,
  sp.name,
  sp."monthlyPrice",
  sp."annualPrice",
  sp."includedTables",
  sp."includedBranches",
  sp."includedStaff",
  sp."isActive"
FROM "SubscriptionPlan" sp
WHERE sp.id = (
  SELECT "planId" FROM "TenantSubscription"
  WHERE "restaurantId" = 'RESTAURANT_ID'
);

-- EXPECTED: Trial plan with monthlyPrice = 0, isActive = true


-- ============================================================================
-- 11. ONE-LINE TEST (Returns 1 if all good, 0 if problem)
-- ============================================================================

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "Restaurant" r
      WHERE r.id = 'RESTAURANT_ID'
        AND r.status = 'TRIALING'
        AND EXISTS (
          SELECT 1 FROM "TenantSubscription" ts
          WHERE ts."restaurantId" = r.id
            AND ts.status = 'TRIALING'
            AND ts."autoRenew" = true
        )
    ) THEN 'PASS: Trial subscription created correctly'
    ELSE 'FAIL: Trial subscription not found or incorrect'
  END AS test_result;

-- EXPECTED: "PASS: Trial subscription created correctly"


-- ============================================================================
-- 12. MIGRATION INTEGRITY CHECK
-- ============================================================================

SELECT
  'New tables exist' AS check_name,
  COUNT(*)::text || '/3' AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('PaymentMethod', 'PlatformInvoice', 'PlatformPayment')
UNION ALL
SELECT 'New enums exist',
  COUNT(*)::text || '/3'
FROM pg_type
WHERE typtype = 'e'
  AND typname IN ('InvoiceStatus', 'PaymentMethodType', 'PlatformPaymentStatus')
UNION ALL
SELECT 'TenantSubscription columns added',
  COUNT(*)::text || '/4'
FROM information_schema.columns
WHERE table_name = 'TenantSubscription'
  AND column_name IN ('nextBillingDate', 'lastBillingDate', 'autoRenew', 'paymentMethodId');

-- EXPECTED: All show 3/3, 3/3, 4/4


-- ============================================================================
-- QUICK TEST SUMMARY (Run this to see everything at once)
-- ============================================================================

\echo '================================================================================'
\echo 'PHASE 1 TRIAL CREATION TEST SUMMARY'
\echo '================================================================================'

-- Restaurant exists and is TRIALING
\echo ''
\echo '1. RESTAURANT STATUS:'
SELECT r.id, r.name, r.status, r."trialEndsAt"
FROM "Restaurant" r
WHERE r.id = 'RESTAURANT_ID' \gset

-- Subscription exists and is TRIALING
\echo ''
\echo '2. SUBSCRIPTION STATUS:'
SELECT ts.id, ts.status, ts."autoRenew", COUNT(ts.id)
FROM "TenantSubscription" ts
WHERE ts."restaurantId" = 'RESTAURANT_ID'
GROUP BY ts.id, ts.status, ts."autoRenew";

-- Billing tables are empty (expected)
\echo ''
\echo '3. BILLING TABLES (should all be 0):'
SELECT
  (SELECT COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" = 'RESTAURANT_ID') AS payment_methods,
  (SELECT COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" = 'RESTAURANT_ID') AS invoices,
  (SELECT COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" = 'RESTAURANT_ID') AS payments;

-- No orphaned data
\echo ''
\echo '4. DATA INTEGRITY (should all be 0 = good):'
SELECT
  (SELECT COUNT(*) FROM "PaymentMethod" pm
   WHERE pm."restaurantId" = 'RESTAURANT_ID' AND pm."restaurantId" NOT IN (SELECT id FROM "Restaurant")) AS orphaned_payment_methods,
  (SELECT COUNT(*) FROM "PlatformInvoice" pi
   WHERE pi."restaurantId" = 'RESTAURANT_ID' AND pi."restaurantId" NOT IN (SELECT id FROM "Restaurant")) AS orphaned_invoices,
  (SELECT COUNT(*) FROM "PlatformPayment" pp
   WHERE pp."restaurantId" = 'RESTAURANT_ID' AND pp."restaurantId" NOT IN (SELECT id FROM "Restaurant")) AS orphaned_payments;

\echo ''
\echo '================================================================================'
\echo 'If all queries above show expected results: PHASE 1 TEST PASSED ✓'
\echo '================================================================================'

-- ============================================================================
-- END OF QUICK CHEAT SHEET
-- ============================================================================
