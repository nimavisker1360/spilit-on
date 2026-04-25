"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { useLang } from "./i18n";

const HERO_QR_IMAGE_SRC = "/Qrcode.png";

// Unlock scroll when the video reaches this fraction of its duration.
const UNLOCK_AT = 0.85;
// Reveal hero text after the MasaPayz logo fades out in the intro of the video.
const TEXT_REVEAL_AT_SECONDS = 3;

export function HeroVideoSequence() {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubSectionRef = useRef<HTMLDivElement | null>(null);
  const [scrollUnlocked, setScrollUnlocked] = useState(false);
  const [textRevealed, setTextRevealed] = useState(false);

  // === Phase 1: lock scroll and autoplay the video ===
  useEffect(() => {
    document.body.classList.add("mp-scroll-locked");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const video = videoRef.current;
    if (video) {
      video.muted = true;
      const p = video.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => window.setTimeout(unlock, 400));
      }
    }

    // Safety: never trap users for more than 15s.
    const fallback = window.setTimeout(unlock, 15000);
    return () => window.clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = () => {
    setScrollUnlocked((prev) => {
      if (prev) return prev;
      document.body.classList.remove("mp-scroll-locked");
      return true;
    });
  };

  // === Phase 2: unlock scroll near the end of the video ===
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      // Reveal hero text once the video intro (MasaPayz logo) has passed.
      if (video.currentTime >= TEXT_REVEAL_AT_SECONDS) {
        setTextRevealed((prev) => prev || true);
      }
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const progress = video.currentTime / video.duration;
      if (progress >= UNLOCK_AT) {
        unlock();
      }
    };
    const onEnded = () => {
      setTextRevealed(true);
      unlock();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    // Safety: guarantee the text is revealed even if timeupdate never fires.
    const revealFallback = window.setTimeout(() => setTextRevealed(true), 6000);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      window.clearTimeout(revealFallback);
    };
  }, []);

  // === Phase 3: scroll-driven powerful framer-motion animations ===
  const { scrollYProgress } = useScroll({
    target: scrubSectionRef,
    offset: ["start start", "end start"]
  });

  // Strong parallax + zoom + 3D rotate on the video itself.
  const videoScale = useTransform(scrollYProgress, [0, 1], [1, 1.45]);
  const videoOpacity = useTransform(scrollYProgress, [0, 0.55, 1], [1, 0.9, 0]);
  const videoY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const videoRotateX = useTransform(scrollYProgress, [0, 1], [0, 18]);
  const videoBlur = useTransform(scrollYProgress, [0, 0.8, 1], [0, 0, 8]);
  const videoFilter = useTransform(videoBlur, (b) => `blur(${b}px) brightness(${1 - b * 0.04})`);

  // Text: strong rise + fade + scale-out.
  const copyOpacity = useTransform(scrollYProgress, [0, 0.3, 0.6], [1, 0.8, 0]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -220]);
  const copyScale = useTransform(scrollYProgress, [0, 1], [1, 0.72]);
  const copyRotateX = useTransform(scrollYProgress, [0, 1], [0, -28]);

  // Darken overlay as user scrolls — gives depth.
  const overlayOpacity = useTransform(scrollYProgress, [0, 1], [0, 0.65]);

  return (
    <section className="mp-hero" aria-label={t.hero.sectionAria}>
      <div className="mp-hero-scrub" ref={scrubSectionRef}>
        <div className="mp-hero-scrub-stage" style={{ perspective: 1200 }}>
          <motion.video
            ref={videoRef}
            src="/002.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            style={{
              scale: videoScale,
              opacity: videoOpacity,
              y: videoY,
              rotateX: videoRotateX,
              filter: videoFilter,
              transformStyle: "preserve-3d"
            }}
          />

          <motion.div
            className="mp-hero-dark-overlay"
            style={{ opacity: overlayOpacity }}
          />

          <div className="mp-hero-copy">
            <motion.div
              className="mp-hero-copy-reveal"
              initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
              animate={
                textRevealed
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : { opacity: 0, y: 40, filter: "blur(12px)" }
              }
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
            <motion.div
              className="mp-hero-copy-inner"
              style={{
                opacity: copyOpacity,
                y: copyY,
                scale: copyScale,
                rotateX: copyRotateX,
                transformPerspective: 1000
              }}
            >
              <span className="mp-hero-badge">{t.hero.badge}</span>
              <h1 className="mp-hero-title">
                {t.hero.title[0]}<span className="mp-accent">{t.hero.title[1]}</span>{t.hero.title[2]}
              </h1>
              <p className="mp-hero-sub">{t.hero.sub}</p>
              <div className="mp-hero-proof-row">
                {t.hero.proofs.map((proof) => (
                  <span key={proof} className="mp-hero-proof">
                    {proof}
                  </span>
                ))}
              </div>
              <div className="mp-hero-qr-shell" aria-hidden="true">
                <Image className="mp-hero-qr" src={HERO_QR_IMAGE_SRC} alt="" width={240} height={240} />
              </div>
              <div className="mp-hero-cta-row">
                <Link href={t.hero.ctaStartHref} className="mp-btn mp-btn-primary" scroll>
                  {t.hero.ctaStart}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
                <a href={t.hero.ctaHowHref} className="mp-btn mp-btn-ghost">
                  {t.hero.ctaHow}
                </a>
              </div>
            </motion.div>
            </motion.div>

            {/* Scroll hint — always mounted to avoid layout shift;
                visibility is driven by scrollUnlocked only. */}
            <motion.div
              className="mp-scroll-hint"
              initial={false}
              animate={{ opacity: scrollUnlocked ? 1 : 0, y: scrollUnlocked ? 0 : 8 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden={!scrollUnlocked}
            >
              <span>{t.hero.scroll}</span>
              <span className="mp-scroll-hint-bar" />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
