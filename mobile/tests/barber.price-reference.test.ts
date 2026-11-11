import { describe, expect, it } from "vitest";
import { PRICE_REFERENCE, PRICE_REFERENCE_PENDING } from "../lib/barber/price-reference";

describe("Referência de preços fornecida pelo usuário", () => {
  it("preserva os 18 preços padrão em centavos", () => {
    expect(PRICE_REFERENCE).toHaveLength(18);
    expect(PRICE_REFERENCE.slice(-11).map((item) => item.price_cents)).toEqual([3000, 4000, 15000, 12000, 6000, 8000, 6500, 5000, 7500, 7000, 8500]);
    expect(PRICE_REFERENCE.filter((item) => item.category === "Combos promocionais")).toHaveLength(5);
  });
  it("não inventa duração e orienta a edição do catálogo da barbearia", () => {
    for (const item of PRICE_REFERENCE) {
      expect(item).not.toHaveProperty("duration_minutes");
    }
    expect(PRICE_REFERENCE_PENDING).toContain("editar");
    expect(PRICE_REFERENCE_PENDING).toContain("inativar");
  });
});
