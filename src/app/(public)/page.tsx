import type { Metadata } from "next";

import { HeroVideoSequence } from "@/components/landing/hero-video-sequence";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import {
  CtaSection,
  DashboardsSection,
  FeaturesSection,
  HowItWorksSection,
  PaymentProvidersSection
} from "@/components/landing/landing-sections";
import { RevealOnScroll } from "@/components/landing/reveal-on-scroll";

import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "MasaPayz — Restoran Hesap Bölüştürme ve QR Ödeme",
  description:
    "Restoran hesabınızı QR kod ile misafirlerinize anında iletin. Eşit böl, ürüne göre böl veya tek seferde öde. iyzico, PayTR ve kart desteği.",
  openGraph: {
    title: "MasaPayz — Restoran Hesap Bölüştürme",
    description:
      "POS entegrasyonlu QR ödeme. Hesabı saniyeler içinde böl, iyzico ve PayTR ile tahsil et."
  }
};

export default function LandingPage() {
  return (
    <div className="mp-landing">
      <LandingNavbar />
      <HeroVideoSequence />

      <main>
        <FeaturesSection />
        <HowItWorksSection />
        <DashboardsSection />
        <PaymentProvidersSection />
        <CtaSection />
      </main>

      <LandingFooter />
      <RevealOnScroll />
    </div>
  );
}
