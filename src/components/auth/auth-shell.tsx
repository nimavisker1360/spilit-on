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
          <video className="auth-banner-video" autoPlay muted loop playsInline preload="auto">
            <source src="/promp.mp4" type="video/mp4" />
          </video>
        </aside>
      </div>
    </main>
  );
}
