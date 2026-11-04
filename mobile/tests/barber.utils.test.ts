import { describe, expect, it } from "vitest";

import {
  appointmentMatchesDate,
  bookingSelectionKey,
  bookingSelectionMatches,
  canTransitionAppointmentStatus,
  formatBRL,
  formatTime,
  isAppointmentCancellable,
  legalAppointmentStatusTransitions,
  nextDateKeys,
  parseMoneyToCents,
  toDateKey,
} from "../lib/barber/utils";

describe("barber utils", () => {
  it("builds local date keys without UTC conversion", () => {
    expect(toDateKey(new Date(2026, 10, 4))).toBe("2026-11-04");
    expect(nextDateKeys(3, new Date(2026, 10, 4))).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
  });

  it("keeps local server DATETIME time intact", () => {
    expect(formatTime("2026-11-04 19:30:00")).toBe("19:30");
  });

  it("parses BRL into exact integer cents", () => {
    expect(parseMoneyToCents("R$ 1.234,56")).toBe(123456);
    expect(parseMoneyToCents("45,00")).toBe(4500);
    expect(parseMoneyToCents("45.5")).toBe(4550);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(formatBRL(4500)).toContain("45,00");
  });

  it("keys booking availability by all selected dimensions", () => {
    const selection = { date: "2026-11-04", barberId: 2, serviceId: 7 };
    const key = bookingSelectionKey(selection);
    expect(bookingSelectionMatches(key, selection)).toBe(true);
    expect(bookingSelectionMatches(key, { ...selection, date: "2026-11-05" })).toBe(false);
    expect(bookingSelectionMatches(key, { ...selection, barberId: 3 })).toBe(false);
    expect(bookingSelectionMatches(key, { ...selection, serviceId: 8 })).toBe(false);
  });

  it("allows only the documented appointment status transitions", () => {
    expect(legalAppointmentStatusTransitions("pending")).toEqual(["confirmed", "cancelled"]);
    expect(legalAppointmentStatusTransitions("confirmed")).toEqual(["completed", "no_show", "cancelled"]);
    expect(legalAppointmentStatusTransitions("completed")).toEqual([]);
    expect(canTransitionAppointmentStatus("pending", "confirmed")).toBe(true);
    expect(canTransitionAppointmentStatus("pending", "completed")).toBe(false);
    expect(canTransitionAppointmentStatus("cancelled", "confirmed")).toBe(false);
  });

  it("filters fallback appointments by their server calendar date", () => {
    expect(appointmentMatchesDate({ starts_at: "2026-11-04 19:30:00" }, "2026-11-04")).toBe(true);
    expect(appointmentMatchesDate({ starts_at: "2026-11-04 19:30:00" }, "2026-11-05")).toBe(false);
  });

  it("only allows cancellation for pending or confirmed appointments", () => {
    expect(isAppointmentCancellable({ status: "pending" })).toBe(true);
    expect(isAppointmentCancellable({ status: "confirmed" })).toBe(true);
    expect(isAppointmentCancellable({ status: "completed" })).toBe(false);
    expect(isAppointmentCancellable({ status: "cancelled" })).toBe(false);
    expect(isAppointmentCancellable({ status: "no_show" })).toBe(false);
  });
});
