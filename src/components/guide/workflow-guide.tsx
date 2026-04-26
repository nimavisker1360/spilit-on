"use client";

import { useEffect, useState } from "react";

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
  secondaryActionLabel,
  onSecondaryAction,
  onConfirm,
  onSkip
}: Props) {
  const { t } = useDashboardLanguage();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

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

    if (viewportWidth <= 840) {
      return {
        left: 16,
        right: 16,
        bottom: 16
      };
    }

    if (!targetRect) {
      return {
        width,
        right: 16,
        bottom: 16
      };
    }

    const left = clamp(targetRect.left, 16, viewportWidth - width - 16);
    const hasRoomBelow = targetRect.bottom + 178 <= viewportHeight - 16;

    if (hasRoomBelow) {
      return {
        width,
        left,
        top: targetRect.bottom + 14
      };
    }

    return {
      width,
      left,
      bottom: 16
    };
  })();

  return (
    <>
      <div
        className={`admin-guide-overlay${lockScroll ? "" : " admin-guide-overlay--passive"}`}
        aria-hidden="true"
      />
      <aside className="admin-guide-panel" style={panelStyle} role="dialog" aria-modal="true">
        <button type="button" className="admin-guide-close" onClick={onSkip} aria-label={skipLabel} title={skipLabel}>
          ×
        </button>

        <p className="admin-guide-step">{`${stepIndex + 1} / ${totalSteps}`}</p>
        <h3>{title}</h3>
        <p>{description}</p>

        {secondaryActionLabel && onSecondaryAction ? (
          <button type="button" className="admin-guide-secondary" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        ) : null}

        {isSatisfied ? (
          <button type="button" className="admin-guide-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        ) : (
          <p className="admin-guide-waiting">
            {t(
              "Waiting for this step to be completed successfully.",
              "Bu adimin basariyla tamamlanmasi bekleniyor."
            )}
          </p>
        )}
      </aside>
    </>
  );
}
