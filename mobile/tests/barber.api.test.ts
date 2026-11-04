import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getAuthSessionGeneration,
  isEndpointMissing,
  registerUnauthorizedHandler,
  request,
  setAuthToken,
} from "../lib/barber/api";

describe("barber API transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    registerUnauthorizedHandler(null);
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
      text: async () => JSON.stringify({ error: "endpoint_missing" }),
    }));

    try {
      await request("appointment_list");
      throw new Error("request should reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(isEndpointMissing(error)).toBe(true);
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).code).toBe("endpoint_missing");
    }
  });

  it("uses PHP error before code and does not classify entity or method errors as missing endpoints", async () => {
    const responses = [
      { status: 404, payload: { error: "service_not_found", code: "endpoint_missing" } },
      { status: 405, payload: { error: "method405" } },
    ];
    for (const response of responses) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: response.status,
        text: async () => JSON.stringify(response.payload),
      }));
      await expect(request("services")).rejects.toMatchObject({
        code: response.payload.error,
        endpointMissing: false,
        message: response.payload.error,
      });
    }
  });

  it("does not let a stale 401 invalidate a newer token generation", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    const unauthorized = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    registerUnauthorizedHandler(unauthorized);
    setAuthToken("old-token");
    const pending = request("me");
    const oldGeneration = getAuthSessionGeneration();

    setAuthToken("new-token");
    resolveFetch?.({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    } as Response);

    await expect(pending).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(unauthorized).not.toHaveBeenCalled();
    expect(getAuthSessionGeneration()).toBeGreaterThan(oldGeneration);
  });
});
