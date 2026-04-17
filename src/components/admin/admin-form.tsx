"use client";

import type { ReactNode } from "react";

type AdminFormCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function AdminFormCard({ title, description, children }: AdminFormCardProps) {
  return (
    <section className="form-card stack-md admin-form-card">
      <div>
        <h3>{title}</h3>
        {description ? <p className="meta">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type AdminFieldProps = {
  label: string;
  children: ReactNode;
};

export function AdminField({ label, children }: AdminFieldProps) {
  return (
    <label className="admin-field">
      <span className="admin-field-label">{label}</span>
      {children}
    </label>
  );
}

type AdminActionsProps = {
  children: ReactNode;
};

export function AdminActions({ children }: AdminActionsProps) {
  return <div className="inline admin-actions">{children}</div>;
}
