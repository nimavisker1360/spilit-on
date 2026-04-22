"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MINIMUM_VIDEO_MS = 1400;
const LOADING_MS = 3000;
const FALLBACK_VIDEO_MS = 10000;
const EXIT_ANIMATION_MS = 260;

export function GuestLaunchSplash() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [videoFinished, setVideoFinished] = useState(false);
  const [phase, setPhase] = useState<"video" | "loading" | "leaving" | "done">("video");

  const showLoading = useCallback(() => {
    setPhase((current) => (current === "video" ? "loading" : current));
  }, []);

  const dismiss = useCallback(() => {
    setPhase((current) => (current === "loading" ? "leaving" : current));
  }, []);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_VIDEO_MS);
    const fallbackTimer = window.setTimeout(() => setVideoFinished(true), FALLBACK_VIDEO_MS);

    void videoRef.current?.play().catch(() => {
      setVideoFinished(true);
    });

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (minimumElapsed && videoFinished) {
      showLoading();
    }
  }, [minimumElapsed, showLoading, videoFinished]);

  useEffect(() => {
    if (phase === "done") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "loading") {
      return;
    }

    const loadingTimer = window.setTimeout(dismiss, LOADING_MS);

    return () => {
      window.clearTimeout(loadingTimer);
    };
  }, [dismiss, phase]);

  useEffect(() => {
    if (phase !== "leaving") {
      return;
    }

    const exitTimer = window.setTimeout(() => setPhase("done"), EXIT_ANIMATION_MS);

    return () => {
      window.clearTimeout(exitTimer);
    };
  }, [phase]);

  if (phase === "done") {
    return null;
  }

  return (
    <div
      className={`guest-launch-splash${phase !== "video" ? " is-loading" : ""}${phase === "leaving" ? " is-leaving" : ""}`}
      role="status"
      aria-label="MasaPayz is loading"
    >
      {phase === "video" ? (
        <video
          ref={videoRef}
          className="guest-launch-splash-video"
          src="/mobile_back.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setVideoFinished(true)}
          onError={() => setVideoFinished(true)}
        />
      ) : (
        <div className="guest-launch-loader">
          <div className="guest-launch-loader-copy">
            <strong>
              Masa<span className="guest-launch-loader-brand-accent">Payz</span>
            </strong>
            <span>Preparing your table</span>
          </div>
          <div className="guest-launch-loader-bar" aria-hidden="true">
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
