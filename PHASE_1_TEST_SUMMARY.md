# Phase 1 Test Suite - Trial Subscription Auto-Creation

## Overview

This test verifies that the Phase 1 billing foundation works correctly with the existing app's trial subscription auto-creation feature.

**Test Goal:** Create a test restaurant and confirm:
1. ✅ Restaurant created with TRIALING status
2. ✅ Subscription auto-created with TRIALING status
3. ✅ Trial period set to 14 days
4. ✅ All relationships between Restaurant/Subscription/Billing tables
5. ✅ No orphaned data
6. ✅ Billing tables empty (expected for new trial)

---

## Test Files Provided

### 1. **PHASE_1_TEST_TRIAL_INSTRUCTIONS.txt** ⚡ START HERE
**Format:** Simple step-by-step instructions  
**Time:** 10-15 minutes  
**Contains:**
- Two methods to create test restaurant (browser or script)
- 4 key SQL queries to verify
- Verification checklist
- Troubleshooting

**Use this when:** You want the fastest path from "no test data" to "verified trial"

---

### 2. **PHASE_1_TEST_QUICK_SQL.sql** 🗄️ SQL QUERIES
**Format:** 12 organized SQL queries ready to copy-paste  
**Time:** 5 minutes (if you have restaurant ID)  
**Contains:**
- Find your test restaurant
- Verify restaurant + subscription
- Verify trial duration
- Verify new tables empty
- Verify no orphaned data
- Verify relationships
- One-line test summary

**Use this when:** You have a restaurant ID and just want to run SQL

---

### 3. **PHASE_1_TEST_TRIAL_CREATION.md** 📋 COMPREHENSIVE
**Format:** Detailed markdown with explanations  
**Time:** 20-30 minutes  
**Contains:**
- Two methods (API signup or Prisma script)
- 12 detailed SQL queries with expected output
- Data relationships explained
- All-in-one comprehensive query
- Verification checklist
- Cleanup instructions
- Troubleshooting

**Use this when:** You want to understand every detail of what's being tested

---

## Quick Test Path (10 minutes)

```
1. Read: PHASE_1_TEST_TRIAL_INSTRUCTIONS.txt (3 min)
   ↓
2. Create test restaurant: Option A or B (3-5 min)
   ↓
3. Run 4 SQL queries (2-3 min)
   ↓
4. Check verification boxes
   ↓
5. Done! ✓
```

---

## Comprehensive Test Path (30 minutes)

```
1. Read: PHASE_1_TEST_TRIAL_CREATION.md (5 min)
   ↓
2. Create test restaurant: Option A or B (5 min)
   ↓
3. Run all 12 SQL queries (10 min)
   ↓
4. Verify expected output (5 min)
   ↓
5. Check comprehensive checklist (3 min)
   ↓
6. Done! ✓
```

---

## SQL Query Quick Reference

| Query # | Purpose | Expected Result |
|---------|---------|-----------------|
| 1 | Find test restaurant | 1 row with TRIALING status |
| 2 | Verify subscription created | 1 row with TRIALING status |
| 3 | Verify trial duration | 14 days |
| 4 | Verify no billing data | 0, 0, 0 (all empty) |
| 5 | Verify subscription fields | autoRenew=true, dates=NULL |
| 6 | Count billing data | 1, 0, 0, 0 (1 subscription only) |
| 7 | Verify user relationship | User linked as OWNER |
| 8 | Comprehensive profile | 1 subscription, 0 methods, 0 invoices |
| 9 | Check orphaned data | No orphaned records |
| 10 | Verify plan | Trial plan with $0 cost |
| 11 | One-line test | "PASS: Trial subscription created correctly" |
| 12 | Migration check | 3/3 tables, 3/3 enums, 4/4 columns |

---

## Testing Workflow

### Step 1: Prepare
```bash
npm run dev                    # Start app
# OR
npx tsx test-create-restaurant.ts  # Create test data programmatically
```

### Step 2: Create Test Data
**Option A - Browser:**
- Go to http://localhost:3000
- Sign up with test account
- Note the restaurantId

**Option B - Script:**
- Use PHASE_1_TEST_TRIAL_CREATION.md Method 2
- Copy restaurant ID from output

### Step 3: Run SQL Verification
```bash
# Open new terminal
psql $DATABASE_URL

# Run queries from PHASE_1_TEST_QUICK_SQL.sql
# Replace RESTAURANT_ID with your ID
```

### Step 4: Verify Results
- All queries return expected output
- Check all verification boxes
- No errors or missing data

### Step 5: Interpret Results

**PASS (All checks ✓):**
- Phase 1 migration is working
- Restaurant creation still works
- Trial subscription auto-creation works
- Relationships are intact
- Ready for Phase 2

**FAIL (Some checks ✗):**
- See troubleshooting section in test file
- Check PHASE_1_VERIFICATION_CHECKLIST.md
- Verify migration applied: `npx prisma migrate status`

---

## Key Validation Points

### 1. Restaurant Created
```sql
SELECT status, "trialEndsAt" FROM "Restaurant" WHERE id = 'YOUR_ID';
-- EXPECT: TRIALING | 2026-05-12 (or ~14 days from now)
```

### 2. Subscription Linked
```sql
SELECT status, "autoRenew" FROM "TenantSubscription" WHERE "restaurantId" = 'YOUR_ID';
-- EXPECT: TRIALING | true
```

### 3. Billing Tables Ready
```sql
SELECT
  (SELECT COUNT(*) FROM "PaymentMethod" WHERE "restaurantId" = 'YOUR_ID') +
  (SELECT COUNT(*) FROM "PlatformInvoice" WHERE "restaurantId" = 'YOUR_ID') +
  (SELECT COUNT(*) FROM "PlatformPayment" WHERE "restaurantId" = 'YOUR_ID') AS total;
-- EXPECT: 0 (all billing tables empty - expected for new trial)
```

### 4. Relationships Work
```sql
SELECT COUNT(*)
FROM "Restaurant" r
JOIN "TenantSubscription" ts ON r.id = ts."restaurantId"
WHERE r.id = 'YOUR_ID';
-- EXPECT: 1 (relationship exists)
```

---

## What Gets Tested

### ✅ Database Structure
- 3 new tables exist and are accessible
- 3 new enums are defined
- 4 new columns on TenantSubscription
- All indexes created
- All foreign keys created

### ✅ Application Flow
- Restaurant creation still works
- Trial subscription auto-created
- Status fields set correctly
- Dates set correctly
- Relationships intact

### ✅ Data Integrity
- No orphaned records
- Foreign keys working
- Cascading deletes would work
- No constraint violations

### ✅ Billing Foundation
- Billing tables empty (expected)
- Ready for Phase 2 implementation
- No conflicts with existing features

---

## Passing Criteria

**Minimum to Pass:**
- Restaurant has status = TRIALING
- Subscription has status = TRIALING
- Trial period = 14 days
- autoRenew = true
- Billing tables are empty

**Recommended to Pass:**
- All above plus:
- All 4 subscription fields correct
- No orphaned data found
- User/Membership relationships work
- All 12 SQL queries return correct results

---

## When Something Goes Wrong

### "Migration not applied"
```bash
npx prisma migrate status
npm run db:migrate
npm run db:generate
```

### "Restaurant has wrong status"
- Check auth.ts creates with "TRIALING" status
- Verify TenantStatus enum includes "TRIALING"

### "Subscription not created"
- Check trial plan exists: `SELECT * FROM "SubscriptionPlan" WHERE code='trial';`
- Verify auth.ts creates subscription
- Check for errors in app logs

### "Billing tables don't exist"
- Re-run migration: `npm run db:migrate`
- Verify migration SQL ran: `npx prisma migrate status`

### "Foreign key errors"
- Check parent records exist first
- Verify cascade rules with: `\d "TenantSubscription"`

---

## After Test Passes ✓

Once all tests pass:

1. You've confirmed Phase 1 migration works
2. You've confirmed existing features still work
3. You've confirmed relationships are correct
4. You're ready for Phase 2 (Billing Service)

---

## Files in This Test Suite

```
PHASE_1_TEST_TRIAL_INSTRUCTIONS.txt    ← Start here (10 min)
PHASE_1_TEST_QUICK_SQL.sql             ← SQL queries (5 min)
PHASE_1_TEST_TRIAL_CREATION.md         ← Detailed guide (20 min)
PHASE_1_TEST_SUMMARY.md                ← This file
```

---

## One-Command Test

If you want to test with minimal setup:

```bash
# Create app, sign up via Google/credentials
npm run dev
# Go to http://localhost:3000 and sign up

# In another terminal, find your restaurant:
psql $DATABASE_URL -c "SELECT id, name, status FROM \"Restaurant\" ORDER BY \"createdAt\" DESC LIMIT 1;"

# Copy that ID, then run this query:
psql $DATABASE_URL -c "
SELECT r.name, r.status, ts.status, ts.\"autoRenew\"
FROM \"Restaurant\" r
JOIN \"TenantSubscription\" ts ON r.id = ts.\"restaurantId\"
WHERE r.id = 'PASTE_ID_HERE';"

# EXPECT: Test Restaurant | TRIALING | TRIALING | t
# If you see that: TEST PASSED ✓
```

---

## Summary

| Aspect | Status |
|--------|--------|
| Phase 1 migration | Ready to test |
| Trial creation | Should work (existing feature) |
| New tables | Should be empty (expected) |
| Relationships | Should be intact |
| Ready for Phase 2 | Yes, after testing |

---

## Next Steps

1. **If tests PASS:** Proceed to Phase 2 (Billing Service)
2. **If tests FAIL:** Check troubleshooting section
3. **If unsure:** Run comprehensive test (PHASE_1_TEST_TRIAL_CREATION.md)

---

**Test File Quick Links:**
- ⚡ **Quick (10 min):** PHASE_1_TEST_TRIAL_INSTRUCTIONS.txt
- 🗄️ **SQL only (5 min):** PHASE_1_TEST_QUICK_SQL.sql  
- 📋 **Detailed (20 min):** PHASE_1_TEST_TRIAL_CREATION.md
