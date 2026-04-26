"use client";

import { useEffect, useRef, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";

type Props = {
  stepIndex: number;
  totalSteps: number;
  targetId: string;
  title: string;
  description: string;
  confirmLabel: string;
  skipLabel: string;
  isSatisfied: boolean;
  lockScroll?: boolean;
  maxPanelWidth?: number;
  preferredPlacement?: "auto" | "top" | "bottom" | "left" | "right";
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onConfirm: () => void;
  onSkip: () => void;
};

type LayoutStyle = {
  left?: number;
  top?: number;
  bottom?: number;
  width?: number;
  right?: number;
};

const GUIDE_BOTTOM_OFFSET = 88;
const GUIDE_EDGE_OFFSET = 16;
const GUIDE_GAP = 14;
const GUIDE_FALLBACK_HEIGHT = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function WorkflowGuide({
  stepIndex,
  totalSteps,
  targetId,
  title,
  description,
  confirmLabel,
  skipLabel,
  isSatisfied,
  lockScroll = true,
  maxPanelWidth = 420,
  preferredPlacement = "auto",
  secondaryActionLabel,
  onSecondaryAction,
  onConfirm,
  onSkip
}: Props) {
  const { locale, t } = useDashboardLanguage();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const tutorialSkipButtonLabel = t("Skip tutorial", "Egitimi gec");

  useEffect(() => {
    const syncPanelHeight = () => {
      setPanelHeight(panelRef.current?.offsetHeight ?? 0);
    };

    syncPanelHeight();
    window.addEventListener("resize", syncPanelHeight);

    return () => {
      window.removeEventListener("resize", syncPanelHeight);
    };
  }, [confirmLabel, description, isSatisfied, secondaryActionLabel, skipLabel, title]);

  useEffect(() => {
    if (lockScroll) {
      document.body.classList.add("admin-guide-scroll-locked");
    }

    let frameId = 0;
    let intervalId = 0;
    let activeElement: HTMLElement | null = null;

    const syncActiveElementClass = (element: HTMLElement | null) => {
      if (!element) {
        return;
      }

      element.classList.toggle("admin-guide-target-active--scroll-free", !lockScroll);
    };

    const syncTarget = (shouldScroll: boolean) => {
      const nextTarget = document.querySelector(`[data-workflow-guide-id="${targetId}"]`) as HTMLElement | null;

      if (!nextTarget) {
        setTargetRect(null);
        return;
      }

      if (activeElement !== nextTarget) {
        activeElement?.classList.remove("admin-guide-target-active");
        activeElement?.classList.remove("admin-guide-target-active--scroll-free");
        activeElement = nextTarget;
        activeElement.classList.add("admin-guide-target-active");
      }

      syncActiveElementClass(activeElement);

      if (shouldScroll) {
        nextTarget.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest"
        });
      }

      setTargetRect(nextTarget.getBoundingClientRect());
    };

    frameId = window.requestAnimationFrame(() => syncTarget(true));

    const handleSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => syncTarget(false));
    };

    intervalId = window.setInterval(handleSync, 300);
    window.addEventListener("resize", handleSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      window.removeEventListener("resize", handleSync);
      activeElement?.classList.remove("admin-guide-target-active");
      activeElement?.classList.remove("admin-guide-target-active--scroll-free");
      if (lockScroll) {
        document.body.classList.remove("admin-guide-scroll-locked");
      }
    };
  }, [lockScroll, targetId]);

  const panelStyle: LayoutStyle = (() => {
    if (typeof window === "undefined") {
      return {};
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(maxPanelWidth, viewportWidth - 32);
    const effectivePanelHeight = panelHeight || GUIDE_FALLBACK_HEIGHT;

    if (viewportWidth <= 840) {
      return {
        left: GUIDE_EDGE_OFFSET,
        right: GUIDE_EDGE_OFFSET,
        bottom: GUIDE_BOTTOM_OFFSET
      };
    }

    if (!targetRect) {
      return {
        width,
        right: GUIDE_EDGE_OFFSET,
        bottom: GUIDE_BOTTOM_OFFSET
      };
    }

    const left = clamp(targetRect.left, GUIDE_EDGE_OFFSET, viewportWidth - width - GUIDE_EDGE_OFFSET);
    const roomRight = viewportWidth - targetRect.right - GUIDE_EDGE_OFFSET;
    const roomLeft = targetRect.left - GUIDE_EDGE_OFFSET;
    const roomBelow = viewportHeight - targetRect.bottom - GUIDE_BOTTOM_OFFSET;
    const roomAbove = targetRect.top - GUIDE_EDGE_OFFSET;
    const top = clamp(
      targetRect.top,
      GUIDE_EDGE_OFFSET,
      viewportHeight - effectivePanelHeight - GUIDE_BOTTOM_OFFSET
    );

    const placements =
      preferredPlacement === "auto"
        ? ["right", "left", "bottom", "top"]
        : [preferredPlacement, "right", "left", "bottom", "top"];

    for (const placement of placements) {
      if (placement === "right" && roomRight >= width + GUIDE_GAP) {
        return {
          width,
          left: targetRect.right + GUIDE_GAP,
          top
        };
      }

      if (placement === "left" && roomLeft >= width + GUIDE_GAP) {
        return {
          width,
          left: targetRect.left - width - GUIDE_GAP,
          top
        };
      }

      if (placement === "bottom" && roomBelow >= effectivePanelHeight + GUIDE_GAP) {
        return {
          width,
          left,
          top: targetRect.bottom + GUIDE_GAP
        };
      }

      if (placement === "top" && roomAbove >= effectivePanelHeight + GUIDE_GAP) {
        return {
          width,
          left,
          top: targetRect.top - effectivePanelHeight - GUIDE_GAP
        };
      }
    }

    if (targetRect.height >= effectivePanelHeight + 48) {
      return {
        width,
        left,
        top: clamp(
          targetRect.top + GUIDE_GAP,
          GUIDE_EDGE_OFFSET,
          viewportHeight - effectivePanelHeight - GUIDE_BOTTOM_OFFSET
        )
      };
    }

    return {
      width,
      left,
      bottom: GUIDE_BOTTOM_OFFSET
    };
  })();

  return (
    <>
      <div
        className={`admin-guide-overlay${lockScroll ? "" : " admin-guide-overlay--passive"}`}
        aria-hidden="true"
      />
      <aside ref={panelRef} className="admin-guide-panel" style={panelStyle} role="dialog" aria-modal="true">
        <p className="admin-guide-step">
          {locale === "tr" ? `${stepIndex + 1} / ${totalSteps}` : `${stepIndex + 1} of ${totalSteps}`}
        </p>
        <h3>{title}</h3>
        <p>{description}</p>

        {secondaryActionLabel && onSecondaryAction ? (
          <button type="button" className="admin-guide-secondary" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        ) : null}

        {!isSatisfied ? (
          <p className="admin-guide-waiting">
            {t(
              "Waiting for this step to be completed successfully.",
              "Bu adimin basariyla tamamlanmasi bekleniyor."
            )}
          </p>
        ) : null}

        <button type="button" className="admin-guide-confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>

        <button
          type="button"
          className="admin-guide-secondary admin-guide-skip"
          onClick={onSkip}
          aria-label={tutorialSkipButtonLabel}
          title={skipLabel}
        >
          {tutorialSkipButtonLabel}
        </button>
      </aside>
    </>
  );
}
