"use client";

import { useEffect, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export function InstallAppButton() {
  const { t } = useDashboardLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [showIosInstallOption, setShowIosInstallOption] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const inStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as NavigatorWithStandalone).standalone === true;
    const isIosDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    setIsStandalone(inStandaloneMode);
    setShowIosInstallOption(isIosDevice && !inStandaloneMode);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowIosInstallHint(false);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
      return;
    }

    if (showIosInstallOption) {
      setShowIosInstallHint((current) => !current);
    }
  }

  if (isStandalone || (!deferredPrompt && !showIosInstallOption)) {
    return null;
  }

  return (
    <div className="install-cta">
      <button type="button" className="install-btn" onClick={handleInstall}>
        {t("Install App", "Uygulamayi Yukle")}
      </button>
      {showIosInstallOption && showIosInstallHint ? (
        <p className="install-hint">
          {t(
            "On iPhone and iPad, tap Share, then Add to Home Screen.",
            "iPhone ve iPad'de Paylas'a, sonra Ana Ekrana Ekle'ye dokunun."
          )}
        </p>
      ) : null}
    </div>
  );
}
