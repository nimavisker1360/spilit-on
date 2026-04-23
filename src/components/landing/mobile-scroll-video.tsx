"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLang } from "./i18n";

const MOBILE_VIDEO_SRC = "/mobile.mp4";
const PHONE_ENTER_DELAY_MS = 420;
const IMAGE_REVEAL_DELAY_MS = 220;
const FALLBACK_LOCK_TRIGGER_Y_VH = 0.12;
const LOCK_TRIGGER_TOLERANCE_PX = 2;
const IN_VIEW_THRESHOLD_VH = 0.2;
const MIN_VISIBLE_SECTION_PX = 80;
const PHONE_IDLE_Y = 40;
const PHONE_ACTIVE_Y = 0;
const PHONE_OFFSCREEN_Y = 340;

const TYPE_TITLE_MS = 40;
const TYPE_DESC_MS = 22;
const STAGE_HOLD_MS = 1300;
const STAGE_SWITCH_MS = 520;
const FINAL_HOLD_MS = 900;

type Stage = {
  image: string;
  title: string;
  description: string;
};

const STAGE_IMAGES = ["/m01.png", "/002.png", "/003.png", "/004.png"];
// Maps stage order (by image) to index in t.steps.items (which is in POS order).
// image m01 (scan QR) = steps.items[1]; image 002 (push bill) = steps.items[0];
// image 003 (choose split) = steps.items[2]; image 004 (pay) = steps.items[3].
const STAGE_TO_STEP_INDEX = [1, 0, 2, 3];
const STAGE_COUNT = STAGE_IMAGES.length;

const clearTimer = (timerRef: { current: number | null }) => {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
};

const getStageStickyTop = (stage: HTMLElement | null) => {
  if (!stage) return window.innerHeight * FALLBACK_LOCK_TRIGGER_Y_VH;

  const stickyTop = Number.parseFloat(window.getComputedStyle(stage).top);
  return Number.isFinite(stickyTop)
    ? stickyTop
    : window.innerHeight * FALLBACK_LOCK_TRIGGER_Y_VH;
};

const getWheelDeltaYPx = (event: WheelEvent) => {
  if (event.deltaMode === window.WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }

  if (event.deltaMode === window.WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }

  return event.deltaY;
};

type TypewriterProps = {
  text: string;
  active: boolean;
  speed: number;
  onDone?: () => void;
  showCaret?: boolean;
};

function Typewriter({ text, active, speed, onDone, showCaret = true }: TypewriterProps) {
  const [count, setCount] = useState(0);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) {
      setCount(0);
      return;
    }

    let i = 0;
    let timer: number | null = null;
    let settled = false;

    const tick = () => {
      i += 1;
      setCount(i);
      if (i < text.length) {
        timer = window.setTimeout(tick, speed);
      } else if (!settled) {
        settled = true;
        onDoneRef.current?.();
      }
    };

    timer = window.setTimeout(tick, speed);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [text, active, speed]);

  return (
    <span className="mp-typewriter">
      <span>{text.slice(0, count)}</span>
      {showCaret && active && count < text.length ? (
        <span className="mp-typewriter-caret" aria-hidden="true" />
      ) : null}
    </span>
  );
}

export function MobileScrollVideo() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const stageTimerRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const lockScrollYRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const finishStartedRef = useRef(false);
  const ownsScrollLockRef = useRef(false);
  const sequenceStartedRef = useRef(false);

  const { t, lang } = useLang();
  const stages: Stage[] = useMemo(
    () =>
      STAGE_IMAGES.map((image, i) => {
        const step = t.steps.items[STAGE_TO_STEP_INDEX[i]];
        return {
          image,
          title: step?.title ?? "",
          description: step?.desc ?? ""
        };
      }),
    [t]
  );
  const navLabels = useMemo(
    () =>
      lang === "tr"
        ? { step: "Adım", of: "/", prev: "Önceki adım", next: "Sonraki adım", goto: "Adıma git" }
        : { step: "Step", of: "/", prev: "Previous step", next: "Next step", goto: "Go to step" },
    [lang]
  );

  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [sequenceDone, setSequenceDone] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const manualModeRef = useRef(false);

  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);

  const getLockScrollY = useCallback(() => {
    const section = sectionRef.current;
    const stickyTop = getStageStickyTop(stageRef.current);
    if (!section) return window.scrollY;

    const lockScrollY = window.scrollY + section.getBoundingClientRect().top - stickyTop;
    return Math.max(0, Math.round(lockScrollY));
  }, []);

  const snapToLockPoint = useCallback(() => {
    const lockScrollY = getLockScrollY();
    window.scrollTo({
      top: lockScrollY,
      left: window.scrollX,
      behavior: "auto"
    });
    return lockScrollY;
  }, [getLockScrollY]);

  const lockBodyScroll = useCallback((scrollY: number) => {
    lockScrollYRef.current = scrollY;
    document.body.classList.add("mp-scroll-locked");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    ownsScrollLockRef.current = true;
  }, []);

  const unlockBodyScroll = useCallback(() => {
    if (!ownsScrollLockRef.current) return;

    document.body.classList.remove("mp-scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo({ top: lockScrollYRef.current, left: window.scrollX, behavior: "auto" });
    ownsScrollLockRef.current = false;
  }, []);

  const unlockScroll = useCallback(() => {
    unlockBodyScroll();
    setIsLocked(false);
    setSequenceDone(true);
    setManualMode(true);
  }, [unlockBodyScroll]);

  const stageIndexRef = useRef(0);

  useEffect(() => {
    stageIndexRef.current = stageIndex;
  }, [stageIndex]);

  const advanceStage = useCallback(() => {
    clearTimer(stageTimerRef);
    if (manualModeRef.current) return;

    const current = stageIndexRef.current;

    if (current + 1 >= STAGE_COUNT) {
      clearTimer(unlockTimerRef);
      unlockTimerRef.current = window.setTimeout(unlockScroll, FINAL_HOLD_MS);
      return;
    }

    setTitleDone(false);
    setStageIndex(current + 1);
  }, [unlockScroll]);

  const handleDescDone = useCallback(() => {
    clearTimer(stageTimerRef);
    if (manualModeRef.current) return;
    stageTimerRef.current = window.setTimeout(advanceStage, STAGE_HOLD_MS);
  }, [advanceStage]);

  const handleTitleDone = useCallback(() => {
    setTitleDone(true);
  }, []);

  const goToStage = useCallback((index: number) => {
    if (index < 0 || index >= STAGE_COUNT) return;
    clearTimer(stageTimerRef);
    clearTimer(unlockTimerRef);
    setManualMode(true);
    setTitleDone(false);
    setStageIndex(index);
  }, []);

  const goPrev = useCallback(() => {
    goToStage(stageIndexRef.current - 1);
  }, [goToStage]);

  const goNext = useCallback(() => {
    goToStage(stageIndexRef.current + 1);
  }, [goToStage]);

  const startStages = useCallback(() => {
    setResultVisible(true);
    setStageIndex(0);
    setTitleDone(false);
  }, []);

  const finishVideoPhase = useCallback(() => {
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
    revealTimerRef.current = window.setTimeout(startStages, IMAGE_REVEAL_DELAY_MS);
  }, [startStages]);

  const armFallbackUnlock = useCallback(() => {
    clearTimer(fallbackTimerRef);
    const video = videoRef.current;
    const maxLockMs =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? video.duration * 1000 + 6000
        : 18000;

    fallbackTimerRef.current = window.setTimeout(finishVideoPhase, maxLockMs);
  }, [finishVideoPhase]);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      finishVideoPhase();
      return;
    }

    video.muted = true;
    video.currentTime = 0;
    setProgress(0);
    armFallbackUnlock();

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => finishVideoPhase());
    }
  }, [armFallbackUnlock, finishVideoPhase]);

  const startSequence = useCallback(() => {
    if (sequenceStartedRef.current || sequenceStarted || sequenceDone) return;

    sequenceStartedRef.current = true;
    const lockScrollY = snapToLockPoint();
    lockBodyScroll(lockScrollY);
    finishStartedRef.current = false;

    setSequenceStarted(true);
    setSequenceDone(false);
    setIsLocked(true);
    setResultVisible(false);
    setProgress(0);
    setStageIndex(0);
    setTitleDone(false);

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }

    clearTimer(playTimerRef);
    playTimerRef.current = window.setTimeout(playVideo, PHONE_ENTER_DELAY_MS);
  }, [lockBodyScroll, playVideo, sequenceDone, sequenceStarted, snapToLockPoint]);

  const canHoldSceneAtCurrentScroll = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return false;

    const rect = section.getBoundingClientRect();
    const stickyTop = getStageStickyTop(stageRef.current);
    return rect.bottom > stickyTop + MIN_VISIBLE_SECTION_PX;
  }, []);

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

      const stickyTop = getStageStickyTop(stageRef.current);
      const hasReachedLockPoint = rect.top <= stickyTop + LOCK_TRIGGER_TOLERANCE_PX;
      // Allow locking even if the user fast-scrolled past the ideal point,
      // as long as a meaningful portion of the section is still visible.
      // startSequence() will snap back to the lock point.
      const hasRoomToHoldScene = canHoldSceneAtCurrentScroll();

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
  }, [canHoldSceneAtCurrentScroll, sequenceDone, sequenceStarted, startSequence]);

  useEffect(() => {
    if (sequenceDone) return;

    const lockBeforeWheelOvershoots = (event: WheelEvent) => {
      if (event.defaultPrevented || sequenceStartedRef.current || event.deltaY <= 0) return;

      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const stickyTop = getStageStickyTop(stageRef.current);
      const nextSectionTop = rect.top - getWheelDeltaYPx(event);
      const isBeforeLockPoint = rect.top > stickyTop + LOCK_TRIGGER_TOLERANCE_PX;
      const willCrossLockPoint = nextSectionTop <= stickyTop + LOCK_TRIGGER_TOLERANCE_PX;
      const hasRoomToHoldScene = canHoldSceneAtCurrentScroll();

      if (isBeforeLockPoint && willCrossLockPoint && hasRoomToHoldScene) {
        event.preventDefault();
        startSequence();
      }
    };

    window.addEventListener("wheel", lockBeforeWheelOvershoots, { passive: false });

    return () => {
      window.removeEventListener("wheel", lockBeforeWheelOvershoots);
    };
  }, [canHoldSceneAtCurrentScroll, sequenceDone, startSequence]);

  useEffect(() => {
    if (sequenceDone) return;

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const lockBeforeTouchOvershoots = (event: TouchEvent) => {
      if (event.defaultPrevented || sequenceStartedRef.current || event.touches.length !== 1) return;

      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;

      const deltaY = startY - currentY;
      if (deltaY <= 0) return;

      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const stickyTop = getStageStickyTop(stageRef.current);
      const nextSectionTop = rect.top - deltaY;
      const isBeforeLockPoint = rect.top > stickyTop + LOCK_TRIGGER_TOLERANCE_PX;
      const willCrossLockPoint = nextSectionTop <= stickyTop + LOCK_TRIGGER_TOLERANCE_PX;
      const hasRoomToHoldScene = canHoldSceneAtCurrentScroll();

      if (isBeforeLockPoint && willCrossLockPoint && hasRoomToHoldScene) {
        event.preventDefault();
        startSequence();
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", lockBeforeTouchOvershoots, { passive: false });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", lockBeforeTouchOvershoots);
    };
  }, [canHoldSceneAtCurrentScroll, sequenceDone, startSequence]);

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
      clearTimer(stageTimerRef);
      clearTimer(unlockTimerRef);
      clearTimer(fallbackTimerRef);

      unlockBodyScroll();
    };
  }, [unlockBodyScroll]);

  const activeStage = stages[stageIndex] ?? stages[0];
  const canGoPrev = stageIndex > 0;
  const canGoNext = stageIndex < STAGE_COUNT - 1;

  return (
    <section className="mp-mobile-scroll" ref={sectionRef} aria-label="Mobile payment flow">
      <div className="mp-mobile-scroll-stage" ref={stageRef}>
        <motion.div
          className="mp-mobile-scroll-glow"
          initial={false}
          animate={{ opacity: sequenceStarted ? 0.55 : isInView ? 0.32 : 0.12 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />

        <div className={`mp-mobile-scroll-layout${resultVisible ? " is-result-visible" : ""}`}>
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
                  onEnded={finishVideoPhase}
                />

                <AnimatePresence initial={false}>
                  {resultVisible ? (
                    <motion.img
                      key={activeStage.image}
                      className="mp-mobile-scroll-result"
                      src={activeStage.image}
                      alt=""
                      aria-hidden="true"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: STAGE_SWITCH_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="mp-mobile-scroll-text"
            initial={false}
            animate={{ opacity: resultVisible ? 1 : 0, x: resultVisible ? 0 : 24 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: resultVisible ? "auto" : "none" }}
          >
            <span className="mp-mobile-scroll-step">
              {navLabels.step} {String(stageIndex + 1).padStart(2, "0")} {navLabels.of}{" "}
              {String(STAGE_COUNT).padStart(2, "0")}
            </span>
            <AnimatePresence mode="wait">
              <motion.div
                key={`copy-${stageIndex}`}
                className="mp-mobile-scroll-copy"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <h3>
                  <Typewriter
                    text={activeStage.title}
                    active={resultVisible}
                    speed={TYPE_TITLE_MS}
                    onDone={handleTitleDone}
                  />
                </h3>
                <p>
                  <Typewriter
                    text={activeStage.description}
                    active={resultVisible && titleDone}
                    speed={TYPE_DESC_MS}
                    onDone={handleDescDone}
                  />
                </p>
              </motion.div>
            </AnimatePresence>

            <div
              className={`mp-mobile-scroll-dots${manualMode ? " is-manual" : ""}`}
              role={manualMode ? "tablist" : undefined}
              aria-hidden={manualMode ? undefined : true}
            >
              {stages.map((stage, i) => {
                const isActive = i === stageIndex;
                const className = `mp-mobile-scroll-dot${isActive ? " is-active" : ""}${
                  i < stageIndex ? " is-done" : ""
                }`;
                if (!manualMode) {
                  return <span key={stage.image} className={className} />;
                }
                return (
                  <button
                    key={stage.image}
                    type="button"
                    className={className}
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`${navLabels.goto} ${i + 1}`}
                    onClick={() => goToStage(i)}
                  />
                );
              })}
            </div>

            {manualMode ? (
              <div className="mp-mobile-scroll-nav">
                <button
                  type="button"
                  className="mp-mobile-scroll-nav-btn"
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  aria-label={navLabels.prev}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  <span>{navLabels.prev}</span>
                </button>
                <button
                  type="button"
                  className="mp-mobile-scroll-nav-btn is-primary"
                  onClick={goNext}
                  disabled={!canGoNext}
                  aria-label={navLabels.next}
                >
                  <span>{navLabels.next}</span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>

        <div className="mp-mobile-scroll-progress" aria-hidden="true">
          <motion.span animate={{ scaleY: progress }} transition={{ duration: 0.18 }} />
        </div>
      </div>
    </section>
  );
}
