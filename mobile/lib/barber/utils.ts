import type { Appointment } from "./types";

export const DAY_KEYS = Array.from({ length: 14 }, (_, index) => index);

const pad = (value: number) => String(value).padStart(2, "0");

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function nextDateKeys(count = 14, from = new Date()): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return toDateKey(date);
  });
}

export function formatShortDate(key: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
    .format(dateFromKey(key))
    .replace(".", "");
}

function localParts(value: string): [number, number, number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return match.slice(1).map(Number) as [number, number, number, number, number];
}

/** Formats server local DATETIME values without converting them through UTC. */
export function formatTime(value: string): string {
  const parts = localParts(value);
  if (parts) return `${pad(parts[3])}:${pad(parts[4])}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(parsed);
}

/** Formats a server local DATETIME value while preserving its calendar date. */
export function formatDateTime(value: string): string {
  const parts = localParts(value);
  if (parts) {
    return `${pad(parts[2])}/${pad(parts[1])}/${parts[0]} às ${pad(parts[3])}:${pad(parts[4])}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function parseMoneyToCents(value: string): number | null {
  const clean = value.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    completed: "Concluído",
    no_show: "Não compareceu",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

export function isAppointmentCancellable(appointment: Pick<Appointment, "status">): boolean {
  return !["cancelled", "completed", "no_show"].includes(appointment.status);
}

export function isActive(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "active";
}
