"use client";

import { Suspense, useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { MasaPayLogo } from "@/components/masapay-logo";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#ff7000"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#0d1018",
  border: "1px solid #252b38",
  borderRadius: "10px",
  padding: "10px 14px",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  minHeight: "unset",
  boxShadow: "none",
  transition: "border-color 150ms ease",
};

const authAccent = {
  base: "#ff7000",
  hover: "#ea580c",
  focus: "rgba(255,112,0,0.65)",
};

function postLoginPath(callbackUrl: string | null): string {
  if (!callbackUrl) return "/admin";
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) return "/admin";
  if (callbackUrl === "/onboarding" || callbackUrl.startsWith("/onboarding/")) return "/admin";
  return callbackUrl;
}

function authErrorMessage(error: string | null): string {
  switch (error) {
    case "OAuthAccountNotLinked":
      return "Bu e-posta zaten başka bir giriş yöntemiyle kayıtlı.";
    case "AccessDenied":
      return "Google hesabı doğrulanmış bir e-posta içermiyor.";
    case "Configuration":
    case "InvalidProvider":
      return "Google girişi için AUTH_GOOGLE_ID ve AUTH_GOOGLE_SECRET ayarlanmalı.";
    default:
      return "";
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams?.get("error") ?? null;
  const callbackUrl = postLoginPath(searchParams?.get("callbackUrl") ?? null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getProviders()
      .then((providers) => {
        if (isMounted) setGoogleAvailable(Boolean(providers?.google));
      })
      .catch(() => {
        if (isMounted) setGoogleAvailable(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const message = authErrorMessage(authError);
    if (message) setError(message);
  }, [authError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email: email.toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) { setError("E-posta veya şifre hatalı"); return; }
    router.push(callbackUrl);
    router.refresh();
  }

  async function handleGoogle() {
    if (googleAvailable !== true) {
      setError("Google girişi için AUTH_GOOGLE_ID ve AUTH_GOOGLE_SECRET ayarlanmalı.");
      return;
    }

    setError("");
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  const googleDisabled = googleLoading || googleAvailable !== true;
  const googleLabel = googleLoading
    ? "Yönlendiriliyor..."
    : googleAvailable === false
      ? "Google ayarları eksik"
      : "Google ile Giriş Yap";

  return (
    <AuthShell>
        <div className="auth-card">
          <Link href="/" className="auth-back-home" aria-label="Ana sayfaya don" title="Ana sayfa">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.5 4.5L7 10L12.5 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px", marginTop: "18px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff" }}>Giriş Yap</h1>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#94a3b8" }}>SplitTable ile devam edin</p>
            </div>
            <MasaPayLogo className="auth-page-logo" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {error && (
              <div style={{ borderRadius: "10px", border: "1px solid rgba(248,113,113,0.2)", background: "rgba(239,68,68,0.1)", padding: "12px 16px", fontSize: "13px", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#cbd5e1" }}>
                E-posta adresi
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocus(true)}
                onBlur={() => setEmailFocus(false)}
                placeholder="ornek@restoran.com"
                style={{ ...inputStyle, borderColor: emailFocus ? authAccent.focus : "#252b38" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#cbd5e1" }}>
                Şifre
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPassFocus(true)}
                onBlur={() => setPassFocus(false)}
                placeholder="••••••••"
                style={{ ...inputStyle, borderColor: passFocus ? authAccent.focus : "#252b38" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                <Link href="/forgot-password" style={{ fontSize: "12px", color: authAccent.base }}>
                  Şifremi unuttum?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: "100%", backgroundColor: authAccent.base, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.65 : 1, transition: "background-color 150ms ease", minHeight: "unset" }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.backgroundColor = authAccent.hover); }}
              onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = authAccent.base); }}
            >
              {loading ? "Giriş yapılıyor..." : "Devam Et"}
            </button>
          </form>

          <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#94a3b8" }}>
            Hesabınız yok mu?{" "}
            <Link href="/signup" style={{ fontWeight: 600, color: authAccent.base }}>
              Kayıt olun
            </Link>
          </p>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "20px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: "11px", color: "#64748b" }}>veya</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleDisabled}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", backgroundColor: "#0d1018", border: "1px solid #252b38", borderRadius: "10px", padding: "11px 16px", fontSize: "13px", fontWeight: 500, color: "#e2e8f0", cursor: googleDisabled ? "not-allowed" : "pointer", opacity: googleDisabled ? 0.6 : 1, minHeight: "unset", transition: "border-color 150ms ease" }}
            onMouseEnter={(e) => { if (!googleDisabled) { e.currentTarget.style.borderColor = "#3e4a5c"; e.currentTarget.style.backgroundColor = "#141824"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#252b38"; e.currentTarget.style.backgroundColor = "#0d1018"; }}
          >
            <GoogleIcon />
            {googleLabel}
          </button>

        </div>
    </AuthShell>
  );
}
