import type { Appointment } from "./types";

export const DAY_KEYS = Array.from({ length: 14 }, (_, index) => index);

const pad = (value: number) => String(value).padStart(2, "0");

export type BookingSelection = {
  date: string;
  barberId: number | null;
  serviceId: number | null;
};

export function bookingSelectionKey(selection: BookingSelection): string {
  return `${selection.date}|barber:${selection.barberId ?? "none"}|service:${selection.serviceId ?? "none"}`;
}

export function bookingSelectionMatches(key: string, selection: BookingSelection): boolean {
  return key === bookingSelectionKey(selection);
}

export type AppointmentActionStatus = "confirmed" | "completed" | "no_show" | "cancelled";

const LEGAL_STATUS_TRANSITIONS: Record<string, readonly AppointmentActionStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: [],
};

export function legalAppointmentStatusTransitions(status: string): AppointmentActionStatus[] {
  return [...(LEGAL_STATUS_TRANSITIONS[status] ?? [])];
}

export function canTransitionAppointmentStatus(from: string, to: AppointmentActionStatus): boolean {
  return legalAppointmentStatusTransitions(from).includes(to);
}

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

/** Match the server's calendar date without relabeling today's data as another day. */
export function appointmentMatchesDate(appointment: Pick<Appointment, "starts_at">, dateKey: string): boolean {
  const local = localParts(appointment.starts_at);
  if (local) return `${local[0]}-${pad(local[1])}-${pad(local[2])}` === dateKey;
  const parsed = new Date(appointment.starts_at);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === dateKey;
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
  return legalAppointmentStatusTransitions(appointment.status).includes("cancelled");
}

export function isActive(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "active";
}
