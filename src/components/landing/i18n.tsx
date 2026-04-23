"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type Lang = "tr" | "en";

type Dict = {
  nav: {
    aria: string;
    brandAria: string;
    items: { href: string; label: string }[];
    cta: string;
    menuOpen: string;
    menuClose: string;
    mobileMenuAria: string;
    langSwitcherLabel: string;
    langTr: string;
    langEn: string;
  };
  hero: {
    sectionAria: string;
    badge: string;
    title: [string, string, string];
    sub: string;
    ctaStart: string;
    ctaHow: string;
    scroll: string;
  };
  features: {
    kicker: string;
    title: string;
    lead: string;
    items: { title: string; desc: string }[];
  };
  steps: {
    kicker: string;
    title: string;
    lead: string;
    items: { num: string; title: string; desc: string }[];
  };
  dashboards: {
    kicker: string;
    title: string;
    lead: string;
    items: { title: string; desc: string }[];
  };
  providers: {
    label: string;
  };
  cta: {
    kicker: string;
    title: string;
    desc: string;
    primary: string;
    secondary: string;
  };
  footer: {
    tagline: string;
    product: { title: string; items: { href: string; label: string }[] };
    company: { title: string; items: string[] };
    legal: { title: string; items: string[] };
    rights: string;
  };
};

const tr: Dict = {
  nav: {
    aria: "Ana navigasyon",
    brandAria: "MasaPayz ana sayfa",
    items: [
      { href: "#ozellikler", label: "Özellikler" },
      { href: "#nasil-calisir", label: "Nasıl Çalışır" },
      { href: "#panel", label: "Paneller" },
      { href: "#odeme", label: "Ödeme" }
    ],
    cta: "Panele Git",
    menuOpen: "Menüyü aç",
    menuClose: "Menüyü kapat",
    mobileMenuAria: "Mobil menü",
    langSwitcherLabel: "Dil seçimi",
    langTr: "Türkçe",
    langEn: "İngilizce"
  },
  hero: {
    sectionAria: "MasaPayz tanıtım",
    badge: "QR ile hesap bölüştürme",
    title: ["Hesabı bölmek artık ", "saniyeler", " sürer"],
    sub: "Masadaki QR ile canlı hesap telefonda. Eşit böl veya ürüne göre öde — iyzico, PayTR ve kartla.",
    ctaStart: "Hemen Başla",
    ctaHow: "Nasıl çalışır?",
    scroll: "Kaydır",
  },
  features: {
    kicker: "Özellikler",
    title: "Restoran için sadeleştirilmiş bölüştürme deneyimi",
    lead: "MasaPayz, POS'tan kasaya kadar olan tüm adımları tek akışta toplar. Personel için pratik, misafir için sürtünmesiz.",
    items: [
      {
        title: "POS ile canlı hesap",
        desc: "Garson POS'tan hesabı gönderir göndermez, masadaki misafirlerin telefonunda anında görünür."
      },
      {
        title: "QR ile tek dokunuş",
        desc: "Masadaki QR'ı okutan her misafir kendi telefonundan bölüştürme ekranına düşer."
      },
      {
        title: "Eşit veya ürüne göre böl",
        desc: "Tamamını öde, eşit böl ya da seçtiğin ürünler kadar öde — matematik derdi yok."
      },
      {
        title: "iyzico, PayTR ve kart",
        desc: "Türkiye'ye özel ödeme altyapısı. Kart, cüzdan veya taksit — hepsi tek akışta."
      },
      {
        title: "Bahşiş kısayolları",
        desc: "Ödeme öncesi %5, %10, %15 hazır seçenekler. Personel bahşişi doğrudan alır."
      },
      {
        title: "Otomatik kapanış",
        desc: "Tüm paylar ödendiğinde POS'taki masa otomatik kapanır. Manuel takip yok."
      }
    ]
  },
  steps: {
    kicker: "Nasıl Çalışır",
    title: "Dört adımda hesap bölüştürme",
    lead: "Garson hesabı gönderir, misafir QR'ı okutur, herkes kendi payını saniyeler içinde öder.",
    items: [
      {
        num: "01",
        title: "Restoran hesabı gönderir",
        desc: "Kasiyer veya garson POS'tan hesabı masa akışına iletir. Hesap anında oluşur."
      },
      {
        num: "02",
        title: "Misafir QR'ı okutur",
        desc: "Masadaki QR kodu telefona tutması yeterli. Uygulama indirmek gerekmez."
      },
      {
        num: "03",
        title: "Paylaşım seçilir",
        desc: "Eşit böl, ürüne göre böl veya tamamını öde. Her misafir kendi payını görür."
      },
      {
        num: "04",
        title: "Güvenli ödeme",
        desc: "iyzico, PayTR veya kartla saniyeler içinde tamamlanır. Masa otomatik kapanır."
      }
    ]
  },
  dashboards: {
    kicker: "Paneller",
    title: "Her rol için ayrı çalışma alanı",
    lead: "Yönetici, garson, mutfak ve kasa için özel olarak tasarlanmış arayüzler. Herkes işine odaklanır.",
    items: [
      {
        title: "Yönetici Paneli",
        desc: "Şubeler, masalar, QR belirteçleri ve müşteriye yönelik markayı tek yerden yönet."
      },
      {
        title: "Garson Paneli",
        desc: "Canlı masa oturumlarını aç, salon operasyonunu hızlıca takip et."
      },
      {
        title: "Mutfak Ekranı",
        desc: "Sipariş kalemlerini hazırlık aşamasına göre takip et. Şube sipariş akışını kullanıyorsa devreye girer."
      },
      {
        title: "Kasa Paneli",
        desc: "Hesabı hazırla ve tam / eşit / ürüne göre bölüştürme akışını başlat."
      }
    ]
  },
  providers: {
    label: "Ödeme ortakları"
  },
  cta: {
    kicker: "Hemen Başla",
    title: "Restoranın için MasaPayz'ı bugün kur",
    desc: "İlk şubeni birkaç dakikada hazırla. Varsayılan veri setiyle masaları, menüyü ve kasa akışını otomatik kur, misafirlerini saniyeler içinde karşıla.",
    primary: "Ücretsiz Dene",
    secondary: "Demo'yu Gör"
  },
  footer: {
    tagline:
      "Türkiye'nin restoranları için QR ile hesap bölüştürme ve ödeme platformu. POS entegrasyonu, iyzico ve PayTR desteği ile.",
    product: {
      title: "Ürün",
      items: [
        { href: "#ozellikler", label: "Özellikler" },
        { href: "#nasil-calisir", label: "Nasıl Çalışır" },
        { href: "#panel", label: "Paneller" },
        { href: "#odeme", label: "Ödeme Yöntemleri" }
      ]
    },
    company: {
      title: "Şirket",
      items: ["Hakkımızda", "İletişim", "Kariyer", "Blog"]
    },
    legal: {
      title: "Yasal",
      items: ["Kullanım Koşulları", "Gizlilik Politikası", "KVKK Aydınlatma", "Çerez Politikası"]
    },
    rights: "Tüm hakları saklıdır."
  }
};

const en: Dict = {
  nav: {
    aria: "Main navigation",
    brandAria: "MasaPayz home",
    items: [
      { href: "#ozellikler", label: "Features" },
      { href: "#nasil-calisir", label: "How it works" },
      { href: "#panel", label: "Dashboards" },
      { href: "#odeme", label: "Payments" }
    ],
    cta: "Go to Dashboard",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    mobileMenuAria: "Mobile menu",
    langSwitcherLabel: "Language",
    langTr: "Turkish",
    langEn: "English"
  },
  hero: {
    sectionAria: "MasaPayz intro",
    badge: "QR bill splitting",
    title: ["Splitting the bill now takes ", "seconds", ""],
    sub: "The live bill on every phone via the table QR. Split evenly or by item — pay with iyzico, PayTR or card.",
    ctaStart: "Get Started",
    ctaHow: "How it works?",
    scroll: "Scroll",
  },
  features: {
    kicker: "Features",
    title: "A streamlined splitting experience for restaurants",
    lead: "MasaPayz combines every step from POS to checkout in one flow. Practical for staff, frictionless for guests.",
    items: [
      {
        title: "Live bill from POS",
        desc: "As soon as the waiter pushes the bill from the POS, it appears instantly on every guest's phone at the table."
      },
      {
        title: "One tap via QR",
        desc: "Every guest that scans the table QR lands straight on the splitting screen from their own phone."
      },
      {
        title: "Split evenly or by item",
        desc: "Pay the full bill, split evenly, or pay only for the items you chose — no math headaches."
      },
      {
        title: "iyzico, PayTR and cards",
        desc: "Payment infrastructure tailored for Türkiye. Card, wallet or installment — all in one flow."
      },
      {
        title: "Tip shortcuts",
        desc: "5%, 10%, 15% presets before payment. Staff receive tips directly."
      },
      {
        title: "Auto close",
        desc: "Once all shares are paid, the table automatically closes on the POS. No manual tracking."
      }
    ]
  },
  steps: {
    kicker: "How it works",
    title: "Bill splitting in four steps",
    lead: "The waiter pushes the bill, the guest scans the QR, everyone pays their share in seconds.",
    items: [
      {
        num: "01",
        title: "Restaurant pushes the bill",
        desc: "The cashier or waiter sends the bill from the POS to the table flow. The bill is created instantly."
      },
      {
        num: "02",
        title: "Guest scans the QR",
        desc: "Just point the phone at the table QR. No app install needed."
      },
      {
        num: "03",
        title: "Choose how to split",
        desc: "Split evenly, split by item, or pay the full bill. Every guest sees their own share."
      },
      {
        num: "04",
        title: "Secure payment",
        desc: "Completed in seconds with iyzico, PayTR or card. The table closes automatically."
      }
    ]
  },
  dashboards: {
    kicker: "Dashboards",
    title: "A dedicated workspace for every role",
    lead: "Interfaces crafted for admin, waiter, kitchen and cashier. Everyone focuses on their job.",
    items: [
      {
        title: "Admin Panel",
        desc: "Manage branches, tables, QR tokens and your customer-facing brand — all in one place."
      },
      {
        title: "Waiter Panel",
        desc: "Open live table sessions and keep floor operations moving."
      },
      {
        title: "Kitchen Display",
        desc: "Track order items by preparation stage. Kicks in when the branch uses the order flow."
      },
      {
        title: "Cashier Panel",
        desc: "Prepare the bill and kick off full / even / by-item split flows."
      }
    ]
  },
  providers: {
    label: "Payment partners"
  },
  cta: {
    kicker: "Get Started",
    title: "Set up MasaPayz for your restaurant today",
    desc: "Spin up your first branch in minutes. The default dataset wires up tables, the menu and the cashier flow so you can greet guests in seconds.",
    primary: "Try Free",
    secondary: "See the Demo"
  },
  footer: {
    tagline:
      "A QR-based bill splitting and payment platform for restaurants. POS integration with iyzico and PayTR support.",
    product: {
      title: "Product",
      items: [
        { href: "#ozellikler", label: "Features" },
        { href: "#nasil-calisir", label: "How it works" },
        { href: "#panel", label: "Dashboards" },
        { href: "#odeme", label: "Payment methods" }
      ]
    },
    company: {
      title: "Company",
      items: ["About", "Contact", "Careers", "Blog"]
    },
    legal: {
      title: "Legal",
      items: ["Terms of Use", "Privacy Policy", "GDPR Notice", "Cookie Policy"]
    },
    rights: "All rights reserved."
  }
};

const DICTS: Record<Lang, Dict> = { tr, en };
const STORAGE_KEY = "masapayz:lang";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("tr");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (stored === "tr" || stored === "en") {
        setLangState(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: DICTS[lang] }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) {
    return { lang: "tr" as Lang, setLang: () => {}, t: tr };
  }
  return ctx;
}
