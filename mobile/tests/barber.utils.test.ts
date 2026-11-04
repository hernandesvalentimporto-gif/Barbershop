import { describe, expect, it } from "vitest";

import { formatBRL, formatTime, isAppointmentCancellable, nextDateKeys, parseMoneyToCents, toDateKey } from "../lib/barber/utils";

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

  it("only allows cancellation for open appointments", () => {
    expect(isAppointmentCancellable({ status: "confirmed" })).toBe(true);
    expect(isAppointmentCancellable({ status: "completed" })).toBe(false);
    expect(isAppointmentCancellable({ status: "cancelled" })).toBe(false);
  });
});
