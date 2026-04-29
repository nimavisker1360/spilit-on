export type SubscriptionAccessStatus =
  | 'active'         // ACTIVE subscription, period valid
  | 'trial'          // TRIALING, trialEndsAt > now
  | 'expired_trial'  // TRIALING but trialEndsAt <= now
  | 'past_due'       // PAST_DUE subscription
  | 'cancelled'      // CANCELLED subscription
  | 'no_subscription'; // no subscription record at all

export type PlanFeatures = {
  qrOrdering: boolean;
  splitBill: boolean;
  onlinePayments: boolean;
  kitchenDisplay: boolean;
  staffManagement: boolean;
  cashierPanel: boolean;
  tableManagement: boolean;
  menuManagement: boolean;
  basicAnalytics: boolean;
  pwaAccess: boolean;
};

export type UsageSummary = {
  branches: number;
  tables: number;
  staff: number;
};

export type PlanLimits = {
  maxBranches: number;
  maxTables: number;
  maxStaff: number;
};

export type FeatureAccess = {
  status: SubscriptionAccessStatus;
  isAccessible: boolean;
  isPremiumLocked: boolean;
  features: PlanFeatures;
  limits: PlanLimits;
  usage: UsageSummary;
  canAdd: {
    branch: boolean;
    table: boolean;
    staff: boolean;
  };
  plan: { id: string; code: string; name: string } | null;
};
