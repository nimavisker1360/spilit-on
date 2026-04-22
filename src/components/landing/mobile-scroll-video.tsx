"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const MOBILE_VIDEO_SRC = "/mobile.mp4";
const RESULT_IMAGE_SRC = "/m01.png";
const PHONE_ENTER_DELAY_MS = 420;
const IMAGE_REVEAL_DELAY_MS = 220;
const UNLOCK_AFTER_IMAGE_MS = 1500;
const LOCK_TRIGGER_OFFSET_VH = 0.04;
const IN_VIEW_THRESHOLD_VH = 0.2;
const PHONE_IDLE_Y = 96;
const PHONE_ACTIVE_Y = 56;
const PHONE_OFFSCREEN_Y = 320;

const clearTimer = (timerRef: { current: number | null }) => {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
};

export function MobileScrollVideo() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const finishStartedRef = useRef(false);
  const ownsScrollLockRef = useRef(false);
  const sequenceStartedRef = useRef(false);

  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [sequenceDone, setSequenceDone] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const unlockScroll = useCallback(() => {
    if (ownsScrollLockRef.current) {
      document.body.classList.remove("mp-scroll-locked");
      ownsScrollLockRef.current = false;
    }

    setIsLocked(false);
    setSequenceDone(true);
  }, []);

  const finishSequence = useCallback(() => {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    clearTimer(fallbackTimerRef);

    const video = videoRef.current;
    if (video) {
      video.pause();
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
      }
    }

    setProgress(1);
    revealTimerRef.current = window.setTimeout(() => {
      setResultVisible(true);
    }, IMAGE_REVEAL_DELAY_MS);
    unlockTimerRef.current = window.setTimeout(() => {
      unlockScroll();
    }, IMAGE_REVEAL_DELAY_MS + UNLOCK_AFTER_IMAGE_MS);
  }, [unlockScroll]);

  const armFallbackUnlock = useCallback(() => {
    clearTimer(fallbackTimerRef);
    const video = videoRef.current;
    const maxLockMs =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? video.duration * 1000 + 6000
        : 18000;

    fallbackTimerRef.current = window.setTimeout(finishSequence, maxLockMs);
  }, [finishSequence]);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      finishSequence();
      return;
    }

    video.muted = true;
    video.currentTime = 0;
    setProgress(0);
    armFallbackUnlock();

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => finishSequence());
    }
  }, [armFallbackUnlock, finishSequence]);

  const startSequence = useCallback(() => {
    if (sequenceStartedRef.current || sequenceStarted || sequenceDone) return;

    sequenceStartedRef.current = true;
    document.body.classList.add("mp-scroll-locked");
    ownsScrollLockRef.current = true;
    finishStartedRef.current = false;

    setSequenceStarted(true);
    setSequenceDone(false);
    setIsLocked(true);
    setResultVisible(false);
    setProgress(0);

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }

    clearTimer(playTimerRef);
    playTimerRef.current = window.setTimeout(playVideo, PHONE_ENTER_DELAY_MS);
  }, [playVideo, sequenceDone, sequenceStarted]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setProgress(0);
    if (isLocked) {
      armFallbackUnlock();
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    setProgress(Math.min(1, video.currentTime / video.duration));
  };

  useEffect(() => {
    if (sequenceDone) return;

    const evaluateScroll = () => {
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;

      const hasEnteredView = rect.top <= vh * (1 - IN_VIEW_THRESHOLD_VH) && rect.bottom >= 0;
      setIsInView(hasEnteredView);

      if (sequenceStarted) return;

      const hasReachedLockPoint = rect.top <= -vh * LOCK_TRIGGER_OFFSET_VH;
      const hasRoomToHoldScene = rect.bottom >= vh * 0.85;

      if (hasReachedLockPoint && hasRoomToHoldScene) {
        startSequence();
      }
    };

    evaluateScroll();
    window.addEventListener("scroll", evaluateScroll, { passive: true });
    window.addEventListener("resize", evaluateScroll);

    return () => {
      window.removeEventListener("scroll", evaluateScroll);
      window.removeEventListener("resize", evaluateScroll);
    };
  }, [sequenceDone, sequenceStarted, startSequence]);

  useEffect(() => {
    if (!isLocked) return;

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };
    const preventScrollKeys = (event: KeyboardEvent) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "End",
          "Home",
          "PageDown",
          "PageUp",
          " "
        ].includes(event.key)
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventScrollKeys);

    return () => {
      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventScrollKeys);
    };
  }, [isLocked]);

  useEffect(() => {
    return () => {
      clearTimer(playTimerRef);
      clearTimer(revealTimerRef);
      clearTimer(unlockTimerRef);
      clearTimer(fallbackTimerRef);

      if (ownsScrollLockRef.current) {
        document.body.classList.remove("mp-scroll-locked");
        ownsScrollLockRef.current = false;
      }
    };
  }, []);

  return (
    <section className="mp-mobile-scroll" ref={sectionRef} aria-label="Mobile payment flow">
      <div className="mp-mobile-scroll-stage">
        <motion.div
          className="mp-mobile-scroll-glow"
          initial={false}
          animate={{ opacity: sequenceStarted ? 0.55 : isInView ? 0.32 : 0.12 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />

        <motion.div
          className="mp-mobile-scroll-frame"
          initial={false}
          animate={{
            opacity: isInView || sequenceStarted ? 1 : 0,
            scale: resultVisible
              ? 1.03
              : sequenceStarted
                ? 1
                : isInView
                  ? 0.96
                  : 0.9,
            y: sequenceStarted
              ? PHONE_ACTIVE_Y
              : isInView
                ? PHONE_IDLE_Y
                : PHONE_OFFSCREEN_Y,
            rotateX: sequenceStarted ? 0 : isInView ? 6 : 14,
            rotateZ: resultVisible ? 0 : sequenceStarted ? -1 : isInView ? -2 : -4
          }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={`mp-mobile-scroll-phone${resultVisible ? " is-framed" : ""}`}>
            <div className="mp-mobile-scroll-screen">
              <video
                ref={videoRef}
                src={MOBILE_VIDEO_SRC}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={finishSequence}
              />

              <AnimatePresence>
                {resultVisible ? (
                  <motion.img
                    key="mobile-result"
                    className="mp-mobile-scroll-result"
                    src={RESULT_IMAGE_SRC}
                    alt=""
                    aria-hidden="true"
                    initial={{ opacity: 0, y: 42, scale: 0.94, filter: "blur(12px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <div className="mp-mobile-scroll-progress" aria-hidden="true">
          <motion.span animate={{ scaleY: progress }} transition={{ duration: 0.18 }} />
        </div>
      </div>
    </section>
  );
}
