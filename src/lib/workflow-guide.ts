export type WorkflowGuideStepKey =
  | "admin-restaurant"
  | "admin-branch"
  | "admin-table"
  | "admin-menu"
  | "admin-qr"
  | "admin-waiter"
  | "waiter-open-session"
  | "waiter-guest-join"
  | "waiter-guest"
  | "waiter-item"
  | "waiter-send-order"
  | "waiter-kitchen"
  | "kitchen-start-prep"
  | "kitchen-mark-ready"
  | "kitchen-mark-served"
  | "kitchen-cashier"
  | "cashier-calculate"
  | "cashier-prepare"
  | "cashier-collect"
  | "cashier-finish";

export const WORKFLOW_GUIDE_STEP_KEY = "workflow-guide-step-v3";
export const WORKFLOW_GUIDE_DONE_KEY = "workflow-guide-done-v3";
export const WORKFLOW_GUIDE_RESET_EVENT = "workflow-guide-reset";

export const WORKFLOW_GUIDE_STEPS: WorkflowGuideStepKey[] = [
  "admin-restaurant",
  "admin-branch",
  "admin-table",
  "admin-menu",
  "admin-qr",
  "admin-waiter",
  "waiter-open-session",
  "waiter-guest-join",
  "waiter-guest",
  "waiter-item",
  "waiter-send-order",
  "waiter-kitchen",
  "kitchen-start-prep",
  "kitchen-mark-ready",
  "kitchen-mark-served",
  "kitchen-cashier",
  "cashier-calculate",
  "cashier-prepare",
  "cashier-collect",
  "cashier-finish"
];

export function isWorkflowGuideDone() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(WORKFLOW_GUIDE_DONE_KEY) === "true";
}

export function readWorkflowGuideStep(): WorkflowGuideStepKey | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedStep = window.localStorage.getItem(WORKFLOW_GUIDE_STEP_KEY);
  if (!storedStep) {
    return null;
  }

  return WORKFLOW_GUIDE_STEPS.includes(storedStep as WorkflowGuideStepKey)
    ? (storedStep as WorkflowGuideStepKey)
    : null;
}

export function writeWorkflowGuideStep(step: WorkflowGuideStepKey | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (step) {
    window.localStorage.setItem(WORKFLOW_GUIDE_STEP_KEY, step);
    return;
  }

  window.localStorage.removeItem(WORKFLOW_GUIDE_STEP_KEY);
}

export function advanceWorkflowGuideStep(currentStep: WorkflowGuideStepKey): WorkflowGuideStepKey | null {
  const currentIndex = WORKFLOW_GUIDE_STEPS.indexOf(currentStep);
  const nextStep = WORKFLOW_GUIDE_STEPS[currentIndex + 1] ?? null;

  if (typeof window !== "undefined") {
    if (nextStep) {
      writeWorkflowGuideStep(nextStep);
    } else {
      completeWorkflowGuide();
    }
  }

  return nextStep;
}

export function completeWorkflowGuide() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(WORKFLOW_GUIDE_STEP_KEY);
  window.localStorage.setItem(WORKFLOW_GUIDE_DONE_KEY, "true");
}

export function resetWorkflowGuide(startStep: WorkflowGuideStepKey = "admin-restaurant") {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(WORKFLOW_GUIDE_DONE_KEY);
  writeWorkflowGuideStep(startStep);
}

export function emitWorkflowGuideReset() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(WORKFLOW_GUIDE_RESET_EVENT));
}
