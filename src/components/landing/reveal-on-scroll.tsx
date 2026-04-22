"use client";

import { useEffect } from "react";

export function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mp-reveal"));
    if (!("IntersectionObserver" in window) || els.length === 0) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
