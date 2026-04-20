"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStarIcon } from "@/components/auth/auth-star-icon";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
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

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", restaurantName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Bir hata oluştu"); setLoading(false); return; }
    setLoading(false);
    router.push("/login");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/admin" });
  }

  const fields: { id: string; name: keyof typeof form; label: string; type: string; placeholder: string; autoComplete: string }[] = [
    { id: "name", name: "name", label: "Adınız Soyadınız", type: "text", placeholder: "Ad Soyad", autoComplete: "name" },
    { id: "restaurantName", name: "restaurantName", label: "Restoran Adı", type: "text", placeholder: "Restoran adınız", autoComplete: "organization" },
    { id: "email", name: "email", label: "E-posta adresi", type: "email", placeholder: "ornek@restoran.com", autoComplete: "email" },
    { id: "password", name: "password", label: "Şifre", type: "password", placeholder: "En az 8 karakter", autoComplete: "new-password" },
  ];

  return (
    <AuthShell>
        <div className="auth-card">

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#fff" }}>Hesap Oluşturun</h1>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#94a3b8" }}>SplitTable ile devam edin</p>
            </div>
            <AuthStarIcon />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {error && (
              <div style={{ borderRadius: "10px", border: "1px solid rgba(248,113,113,0.2)", background: "rgba(239,68,68,0.1)", padding: "12px 16px", fontSize: "13px", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            {fields.map((f) => (
              <div key={f.id}>
                <label htmlFor={f.id} style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: 500, color: "#cbd5e1" }}>
                  {f.label}
                </label>
                <input
                  id={f.id}
                  name={f.name}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  required
                  minLength={f.name === "password" ? 8 : undefined}
                  value={form[f.name]}
                  onChange={handleChange}
                  onFocus={() => setFocused(f.id)}
                  onBlur={() => setFocused(null)}
                  placeholder={f.placeholder}
                  style={{ ...inputStyle, borderColor: focused === f.id ? "rgba(249,115,22,0.6)" : "#252b38" }}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: "4px", width: "100%", backgroundColor: "#f97316", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.65 : 1, minHeight: "unset", transition: "background-color 150ms ease" }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#ea6c0a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#f97316"; }}
            >
              {loading ? "Hesap oluşturuluyor..." : "Devam Et"}
            </button>
          </form>

          <p style={{ marginTop: "20px", textAlign: "center", fontSize: "13px", color: "#94a3b8" }}>
            Zaten hesabınız var mı?{" "}
            <Link href="/login" style={{ fontWeight: 600, color: "#fb923c" }}>
              Giriş yapın
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
            disabled={googleLoading}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", backgroundColor: "#0d1018", border: "1px solid #252b38", borderRadius: "10px", padding: "11px 16px", fontSize: "13px", fontWeight: 500, color: "#e2e8f0", cursor: googleLoading ? "not-allowed" : "pointer", opacity: googleLoading ? 0.6 : 1, minHeight: "unset", transition: "border-color 150ms ease" }}
            onMouseEnter={(e) => { if (!googleLoading) { e.currentTarget.style.borderColor = "#3e4a5c"; e.currentTarget.style.backgroundColor = "#141824"; }}}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#252b38"; e.currentTarget.style.backgroundColor = "#0d1018"; }}
          >
            <GoogleIcon />
            {googleLoading ? "Yönlendiriliyor..." : "Google ile Devam Et"}
          </button>

        </div>
    </AuthShell>
  );
}
