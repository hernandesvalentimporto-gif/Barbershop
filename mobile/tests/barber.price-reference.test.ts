import { describe, expect, it } from "vitest";
import { PRICE_REFERENCE, PRICE_REFERENCE_PENDING } from "../lib/barber/price-reference";

describe("Referência de preços fornecida pelo usuário", () => {
  it("preserva os sete valores claramente legíveis em centavos", () => {
    expect(PRICE_REFERENCE.map((item) => item.price_cents)).toEqual([3500, 4000, 4000, 4000, 3000, 10000, 12000]);
  });
  it("não inventa duração e mantém itens encobertos fora do cadastro sugerido", () => {
    for (const item of PRICE_REFERENCE) {
      expect(item).not.toHaveProperty("duration_minutes");
      expect(item.name).not.toBe("Corte Infantil");
      expect(item.name).not.toBe("Pezinho");
    }
    expect(PRICE_REFERENCE_PENDING).toContain("confirmação");
  });
});
