import Image from "next/image";
import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-shell-layout">
        <div className="auth-form-pane">{children}</div>
        <aside className="auth-banner-panel" aria-hidden="true">
          <Image
            src="/banner.png"
            alt=""
            fill
            priority
            sizes="(min-width: 900px) 460px, 100vw"
            className="auth-banner-image"
          />
        </aside>
      </div>
    </main>
  );
}
