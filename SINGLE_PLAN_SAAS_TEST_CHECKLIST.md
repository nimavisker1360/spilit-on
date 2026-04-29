# Single-Plan SaaS Test Checklist

## Plan Seed

- [ ] Run `npm run db:seed`.
- [ ] Verify `SubscriptionPlan` has an active `pro` plan with monthly price `1499.00` and currency `TRY`.
- [ ] Verify any existing `starter`, `business`, or `trial` plan rows still exist but have `isActive = false`.
- [ ] Verify the seeded demo restaurant points to the `pro` plan and has a `TRIALING` subscription with a 10-day period.

## Trial Provisioning

- [ ] Create a new account from `/signup`.
- [ ] Verify the restaurant is created with `status = TRIALING`, `workspaceMode = TRIAL`, and `currentPlanId` set to the `pro` plan.
- [ ] Verify `trialEndsAt` is 10 days after `trialStartedAt`.
- [ ] Verify the created `TenantSubscription` uses the `pro` plan with `status = TRIALING`.

## Billing Dashboard

- [ ] Open `/admin/billing`.
- [ ] Verify the page shows current trial status.
- [ ] Verify the page shows `10-day free trial`.
- [ ] Verify only one plan card is shown.
- [ ] Verify the plan card is `Pro`.
- [ ] Verify the CTA text is `Activate Pro Plan`.
- [ ] Verify the plan card shows `QR Menu`, `Split Payment`, `Online Payment`, `Kitchen Display`, `Staff Management`, `Cashier Panel`, `Table Management`, `Menu Management`, `Basic Analytics`, and `PWA Access`.

## Landing Page Pricing

- [ ] Open `/`.
- [ ] Scroll to the pricing section.
- [ ] Verify only one pricing card is shown.
- [ ] Verify the pricing copy says `10 days free, then ₺1,499/month`.
- [ ] Verify the CTA text is `Start Free Trial`.
- [ ] Verify Starter and Business are not shown anywhere in the visible pricing UI.

## Feature Access

- [ ] During an active trial, verify all Pro features are reported as enabled on `/admin/billing`.
- [ ] During an active Pro subscription, verify all Pro features are reported as enabled on `/admin/billing`.
- [ ] Simulate an expired trial by setting `trialEndsAt` to a past timestamp while keeping subscription status `TRIALING`.
- [ ] Verify the billing page shows the trial as expired.
- [ ] Verify premium features are locked after trial expiry.
- [ ] Verify `canAdd.branch`, `canAdd.table`, and `canAdd.staff` resolve to `false` after trial expiry.

## Regression Check

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint` if your local Next.js lint configuration is available.
- [ ] Verify signup, login, and landing page rendering still work after the billing model change.
