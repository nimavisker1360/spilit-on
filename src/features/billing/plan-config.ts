import type { PlanFeatures, PlanLimits } from "./feature-gate.types";

export const TRIAL_DURATION_DAYS = 10;

export const PRO_PLAN_CODE = "pro";
export const PRO_PLAN_NAME = "Pro";
export const PRO_PLAN_PRICE_MONTHLY = "1499.00";
export const PRO_PLAN_PRICE_LABEL = "\u20BA1,499";
export const PRO_PLAN_PERIOD_LABEL = "/month";
export const PRO_TRIAL_LABEL = "10-day free trial";
export const PRO_TRIAL_PRICING_LABEL = `10 days free, then ${PRO_PLAN_PRICE_LABEL}/month`;

export const PRO_PLAN_FEATURES: PlanFeatures = {
  qrOrdering: true,
  splitBill: true,
  onlinePayments: true,
  kitchenDisplay: true,
  staffManagement: true,
  cashierPanel: true,
  tableManagement: true,
  menuManagement: true,
  basicAnalytics: true,
  pwaAccess: true,
};

export const LOCKED_PLAN_FEATURES: PlanFeatures = {
  qrOrdering: false,
  splitBill: false,
  onlinePayments: false,
  kitchenDisplay: false,
  staffManagement: false,
  cashierPanel: false,
  tableManagement: false,
  menuManagement: false,
  basicAnalytics: false,
  pwaAccess: false,
};

export const PRO_PLAN_LIMITS: PlanLimits = {
  maxBranches: 1,
  maxTables: 30,
  maxStaff: 10,
};

export const PRO_PLAN_FEATURE_ITEMS: Array<{
  key: keyof PlanFeatures;
  label: string;
}> = [
  { key: "qrOrdering", label: "QR Menu" },
  { key: "splitBill", label: "Split Payment" },
  { key: "onlinePayments", label: "Online Payment" },
  { key: "kitchenDisplay", label: "Kitchen Display" },
  { key: "staffManagement", label: "Staff Management" },
  { key: "cashierPanel", label: "Cashier Panel" },
  { key: "tableManagement", label: "Table Management" },
  { key: "menuManagement", label: "Menu Management" },
  { key: "basicAnalytics", label: "Basic Analytics" },
  { key: "pwaAccess", label: "PWA Access" },
];

export function getTrialEndsAt(now: Date): Date {
  return new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

export function getEffectiveTrialEndsAt(
  trialStartedAt: Date | string | null,
  storedTrialEndsAt?: Date | string | null
): Date | null {
  if (!trialStartedAt) {
    return storedTrialEndsAt ? new Date(storedTrialEndsAt) : null;
  }

  const calculatedTrialEndsAt = getTrialEndsAt(new Date(trialStartedAt));

  if (!storedTrialEndsAt) {
    return calculatedTrialEndsAt;
  }

  const storedEnd = new Date(storedTrialEndsAt);

  return storedEnd.getTime() < calculatedTrialEndsAt.getTime()
    ? storedEnd
    : calculatedTrialEndsAt;
}

export function getProPlanFeaturePayload(): Record<string, boolean> {
  return { ...PRO_PLAN_FEATURES };
}
