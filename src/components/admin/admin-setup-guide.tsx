"use client";

import { useEffect, useMemo, useState } from "react";

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AdminSetupGuide({ step, isSatisfied, onConfirmSatisfied, onSkipStep }: Props) {
  const { locale, t } = useDashboardLanguage();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

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

    if (viewportWidth <= 840 || !targetRect) {
      return {
        left: 16,
        right: 16,
        bottom: 16
      };
    }

    const width = Math.min(420, viewportWidth - 32);
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
      <div className="admin-guide-overlay" aria-hidden="true" />
      <aside className="admin-guide-panel" style={panelStyle} role="dialog" aria-modal="true">
        <button
          type="button"
          className="admin-guide-close"
          onClick={onSkipStep}
          aria-label={t("Skip this step", "Bu adimi gec")}
          title={copy.skipLabel}
        >
          x
        </button>

        <p className="admin-guide-step">
          {locale === "tr" ? `${currentStepIndex + 1} / ${STEP_ORDER.length}` : `${currentStepIndex + 1} of ${STEP_ORDER.length}`}
        </p>
        <h3>{copy.title}</h3>
        <p>{copy.description}</p>

        {isSatisfied ? (
          <button type="button" className="admin-guide-confirm" onClick={onConfirmSatisfied}>
            {copy.confirmLabel}
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
