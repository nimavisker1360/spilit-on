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

type LinkItem = {
  href: string;
  label: string;
};

type Dict = {
  nav: {
    aria: string;
    brandAria: string;
    items: LinkItem[];
    cta: string;
    ctaHref: string;
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
    proofs: string[];
    ctaStart: string;
    ctaStartHref: string;
    ctaHow: string;
    ctaHowHref: string;
    scroll: string;
  };
  highlights: {
    kicker: string;
    title: string;
    lead: string;
    items: { value: string; label: string; desc: string }[];
  };
  features: {
    kicker: string;
    title: string;
    lead: string;
    items: { title: string; desc: string }[];
  };
  reasons: {
    kicker: string;
    title: string;
    lead: string;
    items: { title: string; desc: string; bullets: string[] }[];
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
    note: string;
  };
  cta: {
    kicker: string;
    title: string;
    desc: string;
    primary: string;
    primaryHref: string;
    secondary: string;
    secondaryHref: string;
  };
  footer: {
    tagline: string;
    product: { title: string; items: LinkItem[] };
    demo: { title: string; items: LinkItem[] };
    panels: { title: string; items: LinkItem[] };
    rights: string;
  };
};

const tr: Dict = {
  nav: {
    aria: "Ana navigasyon",
    brandAria: "MasaPayz ana sayfa",
    items: [
      { href: "#sonuclar", label: "Sonuçlar" },
      { href: "#nasil-calisir", label: "Akış" },
      { href: "#panel", label: "Paneller" },
      { href: "#odeme", label: "Ödeme" }
    ],
    cta: "Canlı Demo",
    ctaHref: "/admin",
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
    title: ["Masadaki hesabı ", "dakikalar değil", " saniyelerde kapatın"],
    sub: "MasaPayz, restoranın POS akışını misafirin telefonuyla buluşturur. QR okut, hesabı gör, eşit böl ya da ürüne göre öde.",
    proofs: ["Uygulama indirme yok", "4 rol, tek operasyon akışı", "iyzico / PayTR hazır"],
    ctaStart: "Yönetici Demoyu Aç",
    ctaStartHref: "/admin",
    ctaHow: "Akışı İncele",
    ctaHowHref: "#nasil-calisir",
    scroll: "Aşağı kaydır"
  },
  highlights: {
    kicker: "Sunum Özeti",
    title: "Müşteriye 30 saniyede anlatılacak değer önerisi",
    lead:
      "Bu ürün yalnızca ödeme almaz; masa kapanışını hızlandırır, personelin yükünü azaltır ve misafirin deneyimini sadeleştirir.",
    items: [
      {
        value: "0",
        label: "uygulama indirme",
        desc: "Misafir kamerayı açar, QR'ı okutur ve doğrudan ödeme akışına girer."
      },
      {
        value: "4",
        label: "rol odaklı panel",
        desc: "Yönetici, garson, mutfak ve kasa için ayrı ama birbiriyle uyumlu ekranlar."
      },
      {
        value: "1",
        label: "tek masa oturumu",
        desc: "Hesap, paylar ve kapanış tek oturum üzerinden yönetilir."
      },
      {
        value: "TRY",
        label: "yerel ödeme dili",
        desc: "Türkiye odaklı ödeme akışı: iyzico, PayTR ve kart desteği."
      }
    ]
  },
  features: {
    kicker: "Özellikler",
    title: "Restoranın en stresli anını sade bir dijital akışa çevirir",
    lead: "MasaPayz, hesabın masaya gelişinden tahsilat kapanışına kadar tüm adımları tek sistemde toplar.",
    items: [
      {
        title: "POS ile canlı hesap",
        desc: "Garson hesabı gönderdiği anda masadaki tüm telefonlarda güncel tutar görünür."
      },
      {
        title: "QR ile tek dokunuş",
        desc: "Misafir masa QR'ını okutur ve uygulama indirmeden doğrudan kendi akışına girer."
      },
      {
        title: "Eşit veya ürüne göre böl",
        desc: "Tamamını öde, eşit böl ya da seçilen ürünler kadar öde. Masada hesap tartışması azalır."
      },
      {
        title: "iyzico, PayTR ve kart",
        desc: "Türkiye odaklı ödeme altyapısı ile misafir alışık olduğu yöntemle işlemi tamamlar."
      },
      {
        title: "Bahşiş kısayolları",
        desc: "Ödeme öncesi hazır bahşiş seçenekleri ile akış kesilmeden devam eder."
      },
      {
        title: "Otomatik kapanış",
        desc: "Tüm paylar ödendiğinde masa kapanışa hazır hale gelir; personel manuel takip yapmaz."
      }
    ]
  },
  reasons: {
    kicker: "Neden Beğenilir",
    title: "Karar vereni etkileyen üç ana sebep",
    lead: "Demoda bu üç başlık net görünürse, müşteri ürünün neden değerli olduğunu hızlıca kavrar.",
    items: [
      {
        title: "Misafir tarafı anlaşılır",
        desc: "Masada ilk kez kullanan kişi bile birkaç dokunuşta kendi payını görür ve ödemesini tamamlar.",
        bullets: ["QR ile giriş", "Kendi payını seçme", "Bahşiş ekleme"]
      },
      {
        title: "Operasyon tarafı kontrollü",
        desc: "Kasa, salon ve mutfak aynı veri üzerinden ilerlediği için ekipte senkron bozulmaz.",
        bullets: ["Canlı masa durumu", "Rol bazlı paneller", "Daha az sözlü takip"]
      },
      {
        title: "Marka tarafı ölçeklenebilir",
        desc: "Şube, masa, QR ve müşteri arayüzü tek yerden yönetilerek ürün sunumu kurumsal hale gelir.",
        bullets: ["Şube bazlı yapı", "QR varlıkları", "Markalanabilir deneyim"]
      }
    ]
  },
  steps: {
    kicker: "Nasıl Çalışır",
    title: "Müşteriye göstereceğin ana akış dört adımda tamamlanır",
    lead: "Sunumda önce hesabı oluştur, sonra QR okut, ardından payı seçtir ve ödemeyi bitir.",
    items: [
      {
        num: "01",
        title: "Hesap masaya düşer",
        desc: "Kasiyer veya garson hesabı masa oturumuna gönderir. Sistem anında canlı tutarı üretir."
      },
      {
        num: "02",
        title: "Misafir QR'ı okutur",
        desc: "Misafir telefon kamerasıyla masadaki QR'ı okutur. Uygulama yükleme gerekmez."
      },
      {
        num: "03",
        title: "Ödeme şekli seçilir",
        desc: "Eşit böl, ürüne göre böl ya da tamamını öde. Her misafir yalnızca kendi ekranını yönetir."
      },
      {
        num: "04",
        title: "Tahsilat tamamlanır",
        desc: "Ödeme saniyeler içinde tamamlanır ve masa kapanışa hazır hale gelir."
      }
    ]
  },
  dashboards: {
    kicker: "Paneller",
    title: "Demoda göstereceğin ekranlar rol bazında hazır",
    lead: "Sunum sırası için en güçlü akış: kasa ekranı, misafir deneyimi, ardından yönetici görünümü.",
    items: [
      {
        title: "Yönetici Paneli",
        desc: "Şubeleri, masaları, QR varlıklarını ve müşteri deneyimini tek merkezden yönet."
      },
      {
        title: "Garson Paneli",
        desc: "Canlı masa oturumlarını aç, servis akışını hızlandır ve salon görünürlüğünü koru."
      },
      {
        title: "Mutfak Ekranı",
        desc: "Sipariş kalemlerini hazırlık aşamasına göre takip et. Operasyon genişledikçe akış bozulmasın."
      },
      {
        title: "Kasa Paneli",
        desc: "Hesabı hazırla ve tam, eşit veya ürüne göre bölüştürme akışını tek yerden başlat."
      }
    ]
  },
  providers: {
    label: "Ödeme ortakları",
    note: "Sunum için yeterince sade, prod entegrasyonu için yeterince hazır."
  },
  cta: {
    kicker: "Sunuma Hazır",
    title: "Railway staging'e alın, QR ile açın, müşteriye canlı gösterin",
    desc: "Bu landing, müşteriyi değer önerisinden gerçek demoya götürür. Sunuma yönetici panelinden başla, sonra misafir ve kasa akışına geç.",
    primary: "Yönetici Demoyu Aç",
    primaryHref: "/admin",
    secondary: "Yönetici Paneli",
    secondaryHref: "/admin"
  },
  footer: {
    tagline:
      "Türkiye'deki restoranlar için QR ile hesap bölüştürme ve ödeme akışı. Sunum için hızlı, operasyon için net, büyüme için ölçeklenebilir.",
    product: {
      title: "Ürün",
      items: [
        { href: "#sonuclar", label: "Sunum Özeti" },
        { href: "#ozellikler", label: "Özellikler" },
        { href: "#nasil-calisir", label: "Akış" },
        { href: "#odeme", label: "Ödeme Yöntemleri" }
      ]
    },
    demo: {
      title: "Demo",
      items: [
        { href: "/cashier", label: "Kasa Ekranı" },
        { href: "/waiter", label: "Garson Ekranı" },
        { href: "/kitchen", label: "Mutfak Ekranı" },
        { href: "/admin", label: "Yönetici Paneli" }
      ]
    },
    panels: {
      title: "Paneller",
      items: [
        { href: "#panel", label: "Rol Bazlı Görünümler" },
        { href: "#baslangic", label: "Sunum CTA" },
        { href: "#odeme", label: "Ödeme Katmanı" },
        { href: "/", label: "Landing Ana Sayfa" }
      ]
    },
    rights: "Tüm hakları saklıdır."
  }
};

const en: Dict = {
  nav: {
    aria: "Main navigation",
    brandAria: "MasaPayz home",
    items: [
      { href: "#sonuclar", label: "Outcomes" },
      { href: "#nasil-calisir", label: "Flow" },
      { href: "#panel", label: "Dashboards" },
      { href: "#odeme", label: "Payments" }
    ],
    cta: "Live Demo",
    ctaHref: "/admin",
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
    title: ["Close the table bill in ", "seconds", ", not minutes"],
    sub: "MasaPayz connects the restaurant POS flow to the guest's phone. Scan the QR, see the bill, split evenly or by item, and finish payment fast.",
    proofs: ["No app install", "4 role-based dashboards", "iyzico / PayTR ready"],
    ctaStart: "Open Admin Demo",
    ctaStartHref: "/admin",
    ctaHow: "Review the Flow",
    ctaHowHref: "#nasil-calisir",
    scroll: "Scroll"
  },
  highlights: {
    kicker: "Pitch Summary",
    title: "The value proposition you can explain in 30 seconds",
    lead:
      "This product does more than collect payments. It speeds up table settlement, reduces staff friction, and simplifies the guest experience.",
    items: [
      {
        value: "0",
        label: "app installs",
        desc: "Guests scan the QR and land directly in the payment flow."
      },
      {
        value: "4",
        label: "role-based dashboards",
        desc: "Dedicated surfaces for admin, waiter, kitchen, and cashier."
      },
      {
        value: "1",
        label: "shared table session",
        desc: "The bill, shares, and closeout are managed in one session."
      },
      {
        value: "TRY",
        label: "local payment fit",
        desc: "A payment flow designed around Turkish restaurant operations."
      }
    ]
  },
  features: {
    kicker: "Features",
    title: "Turns the most stressful restaurant moment into a clear digital flow",
    lead: "MasaPayz brings the bill from POS to checkout into one operating system for staff and guests.",
    items: [
      {
        title: "Live bill from POS",
        desc: "As soon as staff pushes the bill, every guest at the table sees the live amount on their own phone."
      },
      {
        title: "One tap via QR",
        desc: "Scan the table QR and land directly on the guest flow without downloading an app."
      },
      {
        title: "Split evenly or by item",
        desc: "Pay all, split evenly, or cover selected items only. The math disappears from the table."
      },
      {
        title: "iyzico, PayTR and cards",
        desc: "Payment rails aligned with the Turkish market and familiar to guests."
      },
      {
        title: "Tip shortcuts",
        desc: "Preset tip options let guests finish quickly without breaking the flow."
      },
      {
        title: "Auto close",
        desc: "Once all shares are covered, the session moves cleanly toward closeout."
      }
    ]
  },
  reasons: {
    kicker: "Why It Lands",
    title: "Three reasons decision makers respond to it fast",
    lead: "If the demo makes these three points obvious, the customer quickly understands why the product matters.",
    items: [
      {
        title: "Simple for guests",
        desc: "Even first-time users can understand the flow in seconds and pay without asking for help.",
        bullets: ["Scan and enter", "Pick your share", "Add a tip and finish"]
      },
      {
        title: "Controlled for operations",
        desc: "Cashier, floor staff, and kitchen work from the same system, so coordination stays intact.",
        bullets: ["Live table state", "Role-based views", "Less verbal follow-up"]
      },
      {
        title: "Scalable for the brand",
        desc: "Branches, tables, QR assets, and guest experience can be managed from one place as the business grows.",
        bullets: ["Branch structure", "QR assets", "Brandable experience"]
      }
    ]
  },
  steps: {
    kicker: "How it works",
    title: "The core demo flow completes in four steps",
    lead: "Build the bill, scan the QR, choose the share, and complete payment.",
    items: [
      {
        num: "01",
        title: "Bill reaches the table",
        desc: "The cashier or waiter sends the bill to the table session and the live amount is created instantly."
      },
      {
        num: "02",
        title: "Guest scans the QR",
        desc: "The guest uses the phone camera to scan the table QR. No app install required."
      },
      {
        num: "03",
        title: "Choose the payment mode",
        desc: "Split evenly, split by item, or pay the full bill. Each guest controls only their own view."
      },
      {
        num: "04",
        title: "Complete the collection",
        desc: "Payment finishes in seconds and the table session moves toward a clean closeout."
      }
    ]
  },
  dashboards: {
    kicker: "Dashboards",
    title: "The demo screens are ready by role",
    lead: "The strongest presentation sequence is cashier first, guest flow second, admin view third.",
    items: [
      {
        title: "Admin Panel",
        desc: "Manage branches, tables, QR assets, and the customer-facing experience from one place."
      },
      {
        title: "Waiter Panel",
        desc: "Open live sessions and keep floor operations moving with less friction."
      },
      {
        title: "Kitchen Display",
        desc: "Track item status by preparation stage as the operation expands."
      },
      {
        title: "Cashier Panel",
        desc: "Prepare the bill and launch full, equal, or by-item payment flows from one screen."
      }
    ]
  },
  providers: {
    label: "Payment partners",
    note: "Clean enough for a pitch, ready enough for production integration."
  },
  cta: {
    kicker: "Presentation Ready",
    title: "Deploy to Railway staging, open the QR flow, and show it live",
    desc: "This landing page now carries the customer from value proposition to live demo. Start in admin, then move into the guest and cashier flow.",
    primary: "Open Admin Demo",
    primaryHref: "/admin",
    secondary: "Open Admin Panel",
    secondaryHref: "/admin"
  },
  footer: {
    tagline:
      "A QR-based bill splitting and payment flow for restaurants. Fast to present, clear to operate, and structured to scale.",
    product: {
      title: "Product",
      items: [
        { href: "#sonuclar", label: "Pitch Summary" },
        { href: "#ozellikler", label: "Features" },
        { href: "#nasil-calisir", label: "Flow" },
        { href: "#odeme", label: "Payments" }
      ]
    },
    demo: {
      title: "Demo",
      items: [
        { href: "/cashier", label: "Cashier Screen" },
        { href: "/waiter", label: "Waiter Screen" },
        { href: "/kitchen", label: "Kitchen Screen" },
        { href: "/admin", label: "Admin Panel" }
      ]
    },
    panels: {
      title: "Views",
      items: [
        { href: "#panel", label: "Role-based Views" },
        { href: "#baslangic", label: "Presentation CTA" },
        { href: "#odeme", label: "Payment Stack" },
        { href: "/", label: "Landing Home" }
      ]
    },
    rights: "All rights reserved."
  }
};

const DICTS: Record<Lang, Dict> = { tr, en };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
};

const LangContext = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("tr");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
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
