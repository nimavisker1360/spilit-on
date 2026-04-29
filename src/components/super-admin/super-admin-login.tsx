"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SuperAdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const response = await fetch("/api/super-admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };

    setIsLoading(false);

    if (!response.ok) {
      setError(json.error || "Giris basarisiz.");
      return;
    }

    router.push(searchParams?.get("callbackUrl") || "/super-admin");
    router.refresh();
  };

  return (
    <main className="super-admin-login-page">
      <form className="super-admin-login-card" onSubmit={submit}>
        <div className="super-admin-brand super-admin-brand--login">
          <span className="super-admin-brand-mark">MP</span>
          <div>
            <strong>MasaPayz</strong>
            <span>Platform sahibi girisi</span>
          </div>
        </div>

        <div>
          <h1>Super Admin Girisi</h1>
          <p>Restoran panelinden ayri platform yonetici hesabi ile giris yapin.</p>
        </div>

        {error ? <div className="super-admin-error">{error}</div> : null}

        <label>
          E-posta
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Sifre
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Giris yapiliyor..." : "Giris yap"}
        </button>
      </form>
    </main>
  );
}
