"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";

export type AdminSetupGuideStepKey = "restaurant" | "branch" | "table" | "menu";

type Props = {
  step: AdminSetupGuideStepKey | null;
  isSatisfied: boolean;
  onConfirmSatisfied: () => void;
  onSkipStep: () => void;
};

type GuideLayout = {
  left?: number;
  top?: number;
  bottom?: number;
  width?: number;
  right?: number;
};

const STEP_ORDER: AdminSetupGuideStepKey[] = ["restaurant", "branch", "table", "menu"];

const TARGET_IDS: Record<AdminSetupGuideStepKey, string> = {
  restaurant: "admin-guide-restaurant",
  branch: "admin-guide-branch",
  table: "admin-guide-table",
  menu: "admin-guide-menu"
};

const GUIDE_BOTTOM_OFFSET = 88;
const GUIDE_EDGE_OFFSET = 16;
const GUIDE_GAP = 14;
const GUIDE_FALLBACK_HEIGHT = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AdminSetupGuide({ step, isSatisfied, onConfirmSatisfied, onSkipStep }: Props) {
  const { locale, t } = useDashboardLanguage();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const tutorialSkipButtonLabel = t("Skip tutorial", "Egitimi gec");

  const currentStepIndex = step ? STEP_ORDER.indexOf(step) : -1;

  const copy = useMemo(() => {
    if (!step) {
      return null;
    }

    if (step === "restaurant") {
      return {
        title: t("Set the restaurant name", "Restoran adini belirle"),
        description: t(
          "Write the brand name here and save it. When the save succeeds, the guide will move on automatically. If this name is already correct, confirm it and continue.",
          "Marka adini buraya yazip kaydedin. Kayit basarili oldugunda kilavuz otomatik olarak sonraki adima gecer. Bu ad zaten dogruysa onaylayip devam edin."
        ),
        confirmLabel: t("This name is correct", "Bu ad dogru"),
        skipLabel: t("Skip this step", "Bu adimi gec")
      };
    }

    if (step === "branch") {
      return {
        title: t("Create the branch", "Subeyi olustur"),
        description: t(
          "Complete this branch form and create the operating location. After the branch is created successfully, the next guide step opens automatically.",
          "Bu sube formunu doldurun ve operasyon lokasyonunu olusturun. Sube basariyla olustuktan sonra bir sonraki kilavuz adimi otomatik olarak acilir."
        ),
        confirmLabel: t("This branch already exists", "Bu sube zaten hazir"),
        skipLabel: t("Skip this step", "Bu adimi gec")
      };
    }

    if (step === "table") {
      return {
        title: t("Create the table", "Masayi olustur"),
        description: t(
          "Choose the branch, set the table name and capacity, then create the table. The guide waits here until the table is created successfully.",
          "Subeyi secin, masa adini ve kapasitesini girin, sonra masayi olusturun. Kilavuz masa basariyla olusturulana kadar bu adimda bekler."
        ),
        confirmLabel: t("This table already exists", "Bu masa zaten hazir"),
        skipLabel: t("Skip this step", "Bu adimi gec")
      };
    }

    return {
      title: t("Import the menu", "Menuyu ice aktar"),
      description: t(
        "Select the branch, choose the Excel or CSV file, then complete the import. As soon as the import succeeds, the onboarding ends.",
        "Subeyi secin, Excel veya CSV dosyasini yukleyin ve ice aktarmayi tamamlayin. Ice aktarma basarili olur olmaz onboarding tamamlanir."
      ),
      confirmLabel: t("The menu is already ready", "Menu zaten hazir"),
      skipLabel: t("Skip this step", "Bu adimi gec")
    };
  }, [step, t]);

  useEffect(() => {
    const syncPanelHeight = () => {
      setPanelHeight(panelRef.current?.offsetHeight ?? 0);
    };

    syncPanelHeight();
    window.addEventListener("resize", syncPanelHeight);

    return () => {
      window.removeEventListener("resize", syncPanelHeight);
    };
  }, [copy, isSatisfied]);

  useEffect(() => {
    if (!step) {
      document.body.classList.remove("admin-guide-scroll-locked");
      return;
    }

    document.body.classList.add("admin-guide-scroll-locked");

    let frameId = 0;
    let intervalId = 0;
    let activeElement: HTMLElement | null = null;

    const syncTarget = (shouldScroll: boolean) => {
      const nextTarget = document.querySelector(`[data-admin-guide-id="${TARGET_IDS[step]}"]`) as HTMLElement | null;

      if (!nextTarget) {
        setTargetRect(null);
        return;
      }

      if (activeElement !== nextTarget) {
        activeElement?.classList.remove("admin-guide-target-active");
        activeElement = nextTarget;
        activeElement.classList.add("admin-guide-target-active");
      }

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
      document.body.classList.remove("admin-guide-scroll-locked");
    };
  }, [step]);

  if (!step || !copy) {
    return null;
  }

  const panelStyle: GuideLayout = (() => {
    if (typeof window === "undefined") {
      return {};
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const effectivePanelHeight = panelHeight || GUIDE_FALLBACK_HEIGHT;

    if (viewportWidth <= 840 || !targetRect) {
      return {
        left: GUIDE_EDGE_OFFSET,
        right: GUIDE_EDGE_OFFSET,
        bottom: GUIDE_BOTTOM_OFFSET
      };
    }

    const width = Math.min(420, viewportWidth - 32);
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

    if (roomRight >= width + GUIDE_GAP) {
      return {
        width,
        left: targetRect.right + GUIDE_GAP,
        top
      };
    }

    if (roomLeft >= width + GUIDE_GAP) {
      return {
        width,
        left: targetRect.left - width - GUIDE_GAP,
        top
      };
    }

    if (roomBelow >= effectivePanelHeight + GUIDE_GAP) {
      return {
        width,
        left,
        top: targetRect.bottom + GUIDE_GAP
      };
    }

    if (roomAbove >= effectivePanelHeight + GUIDE_GAP) {
      return {
        width,
        left,
        top: targetRect.top - effectivePanelHeight - GUIDE_GAP
      };
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
      <div className="admin-guide-overlay" aria-hidden="true" />
      <aside ref={panelRef} className="admin-guide-panel" style={panelStyle} role="dialog" aria-modal="true">
        <p className="admin-guide-step">
          {locale === "tr" ? `${currentStepIndex + 1} / ${STEP_ORDER.length}` : `${currentStepIndex + 1} of ${STEP_ORDER.length}`}
        </p>
        <h3>{copy.title}</h3>
        <p>{copy.description}</p>

        {!isSatisfied ? (
          <p className="admin-guide-waiting">
            {t(
              "Waiting for this step to be completed successfully.",
              "Bu adimin basariyla tamamlanmasi bekleniyor."
            )}
          </p>
        ) : null}

        <button type="button" className="admin-guide-confirm" onClick={onConfirmSatisfied}>
          {copy.confirmLabel}
        </button>

        <button
          type="button"
          className="admin-guide-secondary admin-guide-skip"
          onClick={onSkipStep}
          aria-label={tutorialSkipButtonLabel}
          title={copy.skipLabel}
        >
          {tutorialSkipButtonLabel}
        </button>
      </aside>
    </>
  );
}
