import { describe, expect, it } from "vitest";
import { tabAccessRedirect } from "../lib/barber/navigation";

describe("entrada e permissões do aplicativo", () => {
  it.each([undefined, "(tabs)", "index"])("permite mostrar o login na raiz %s sem redirecionar a si mesma", (route) => {
    expect(tabAccessRedirect(route, null, true)).toBeNull();
  });
  it.each(["booking", "history", "agenda", "clients", "services", "more"])("protege a rota %s sem bloquear a tela inicial", (route) => {
    expect(tabAccessRedirect(route, null, true)).toBe("/");
    expect(tabAccessRedirect("index", null, true)).toBeNull();
  });
  it("aguarda restauração e mantém as permissões por perfil", () => {
    expect(tabAccessRedirect("booking", null, false)).toBeNull();
    expect(tabAccessRedirect("booking", "client", true)).toBeNull();
    expect(tabAccessRedirect("agenda", "barber", true)).toBeNull();
    expect(tabAccessRedirect("services", "admin", true)).toBeNull();
    expect(tabAccessRedirect("services", "client", true)).toBe("/");
    expect(tabAccessRedirect("booking", "admin", true)).toBe("/");
  });
});
