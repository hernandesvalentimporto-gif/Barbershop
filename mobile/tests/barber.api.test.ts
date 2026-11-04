import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, isEndpointMissing, request, setAuthToken } from "../lib/barber/api";

describe("barber API transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthToken(null);
  });

  it("sends JSON POST and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ appointment_id: 17, status: "confirmed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    setAuthToken("token-test");

    const result = await request<{ appointment_id: number; status: string }>("appointment_create", {
      method: "POST",
      body: { barber_id: 2 },
    });

    expect(result).toEqual({ appointment_id: 17, status: "confirmed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-test", "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ barber_id: 2 }));
  });

  it("reports a missing endpoint without pretending success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: "endpoint_missing" }),
    }));

    try {
      await request("appointment_list");
      throw new Error("request should reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(isEndpointMissing(error)).toBe(true);
      expect((error as ApiError).status).toBe(404);
    }
  });
});
