import type { ReactNode } from "react";
import { useLanguage, activeLanguage, dateLocale } from "../../lib/i18n";
import { message } from "../../lib/adminMessages";

export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : message("generic");
}

export function Feedback({ error, notice }: { error?: string; notice?: string }): ReactNode {
  return (
    <>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice ok" role="status">{notice}</p>}
    </>
  );
}

export const sessionStatusLabel = { scheduled: "Planifiée", published: "Publiée", cancelled: "Annulée" } as const;

export function dayLabel(value: string, locale = dateLocale[activeLanguage()]): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value.slice(0, 10) + "T00:00:00Z"));
}

export function dateTimeLabel(value: string, locale = dateLocale[activeLanguage()]): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
