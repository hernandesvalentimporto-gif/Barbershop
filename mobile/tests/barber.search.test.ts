import { describe, expect, it } from "vitest";

import { filterSearchableItems, normalizeSearchText } from "../lib/barber/search";

const options = [
  { id: "1", label: "Carlos Oliveira", description: "Cliente", keywords: "+55 (11) 99999-0001" },
  { id: "2", label: "André Santos", description: "Cliente", keywords: "(21) 98888-2002" },
  { id: "3", label: "Corte masculino", description: "30 min · R$ 40,00", keywords: "cabelo" },
];

describe("searchable picker filtering", () => {
  it("normalizes accents and case for Portuguese searches", () => {
    expect(normalizeSearchText("  ANDRÉ  ")).toBe("andre");
    expect(filterSearchableItems(options, "andre").map((item) => item.id)).toEqual(["2"]);
  });

  it("matches client phone numbers as well as names", () => {
    expect(filterSearchableItems(options, "98888").map((item) => item.id)).toEqual(["2"]);
    expect(filterSearchableItems([{ ...options[0], keywords: "+55 (11) 99999-0001 5511999990001" }], "5511999990001")).toHaveLength(1);
  });

  it("returns the full scrollable list when the search is empty", () => {
    expect(filterSearchableItems(options, " ")).toHaveLength(options.length);
  });
});
