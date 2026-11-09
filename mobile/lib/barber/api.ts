import type {
  AppointmentListResponse,
  AvailabilitySlot,
  BarberUser,
  Catalog,
  ClientHistoryAppointment,
  SaveServiceInput,
  SaveUserInput,
  Service,
  ServiceListResponse,
  SummaryResponse,
  UserListResponse,
  BarberUser as User,
} from "./types";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_BARBERSHOP_API_URL ?? "https://sistemashp.com.br/barbershop/api.php";
export const REQUEST_TIMEOUT_MS = 15_000;

type UnauthorizedHandler = (capturedToken: string, capturedGeneration: number) => void | Promise<void>;

let authToken: string | null = null;
let authGeneration = 0;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly endpointMissing: boolean;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number; code?: string; endpointMissing?: boolean; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.endpointMissing = options.endpointMissing ?? false;
    this.retryable = options.retryable ?? false;
  }
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  authGeneration += 1;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function getAuthSessionGeneration(): number {
  return authGeneration;
}

export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function isEndpointMissing(error: unknown): error is ApiError {
  return error instanceof ApiError && error.endpointMissing;
}

function actionUrl(action: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function parsePayload(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as { error?: unknown; message?: unknown; detail?: unknown };
  if (data.error !== undefined && data.error !== null && data.error !== "") return String(data.error);
  if (data.message !== undefined && data.message !== null && data.message !== "") return String(data.message);
  if (data.detail !== undefined && data.detail !== null && data.detail !== "") return String(data.detail);
  return fallback;
}

function payloadCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as { error?: unknown; code?: unknown };
  // The PHP contract uses `error`; keep it ahead of the older `code` field.
  const value = data.error ?? data.code;
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

export async function request<T>(
  action: string,
  options: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = options.method ?? "GET";
  const tokenAtStart = authToken;
  const generationAtStart = authGeneration;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (tokenAtStart) headers.Authorization = `Bearer ${tokenAtStart}`;

  try {
    const response = await fetch(actionUrl(action, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = parsePayload(await response.text());
    if (!response.ok) {
      const code = payloadCode(payload);
      // Only these PHP error values mean that the action itself is absent. A 404
      // may be an entity lookup failure, and 405 may be an action-level error.
      const endpointMissing = code === "not_found" || code === "endpoint_missing";
      if (
        response.status === 401 &&
        tokenAtStart !== null &&
        tokenAtStart === authToken &&
        generationAtStart === authGeneration
      ) {
        const handler = unauthorizedHandler;
        if (handler) {
          try {
            await handler(tokenAtStart, generationAtStart);
          } catch {
            // Session cleanup must not turn the original 401 into a network error.
          }
        }
        // The context handler normally clears this too. Keep the transport
        // safe when no handler is installed or a test/application handler is
        // observational only, but never clear a newer generation.
        if (tokenAtStart === authToken && generationAtStart === authGeneration) {
          setAuthToken(null);
        }
      }
      throw new ApiError(
        endpointMissing
          ? `Este recurso ainda não está disponível no servidor (endpoint ${action}). Implante a atualização do backend para habilitá-lo.`
          : errorMessage(payload, `Não foi possível concluir a operação (${response.status}).`),
        { status: response.status, code, endpointMissing, retryable: response.status >= 500 },
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("A solicitação demorou demais. Verifique a conexão e tente novamente.", {
        code: "timeout",
        retryable: true,
      });
    }
    throw new ApiError("Não foi possível conectar ao servidor. Verifique a internet e tente novamente.", {
      code: "network_error",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  login(identifier: string, password: string) {
    return request<{ token: string; user: User; expires_in?: number }>("login", {
      method: "POST",
      body: { identifier, password },
    });
  },
  me() {
    return request<{ user: User }>("me");
  },
  logout() {
    return request<void>("logout", { method: "POST" });
  },
  catalog() {
    return request<Catalog>("catalog");
  },
  availability(date: string, barberId: number, serviceIds: number[]) {
    return request<{ slots: AvailabilitySlot[] }>("availability", {
      query: { date, barber_id: barberId, service_ids: serviceIds.join(",") },
    });
  },
  appointmentCreate(input: {
    client_id?: number;
    barber_id: number;
    service_id: number;
    service_ids?: number[];
    starts_at: string;
    ends_at: string;
    notes?: string;
  }) {
    return request<{ appointment_id: number; status: string }>("appointment_create", {
      method: "POST",
      body: input,
    });
  },
  appointmentCancel(appointmentId: number) {
    return request<{ appointment_id: number; status: string }>("appointment_cancel", {
      method: "POST",
      body: { appointment_id: appointmentId },
    });
  },
  history() {
    return request<{ appointments: ClientHistoryAppointment[] }>("history");
  },
  summary() {
    return request<SummaryResponse>("summary");
  },
  users(role: "client" | "barber", search?: string) {
    return request<UserListResponse>("users", { query: { role, search } });
  },
  userSave(input: SaveUserInput) {
    return request<{ user: BarberUser }>("user_save", { method: "POST", body: input });
  },
  userDelete(userId: number) {
    return request<{ deleted_user_id: number }>("user_delete", { method: "POST", body: { id: userId } });
  },
  masterDashboard() {
    return request<import("./types").MasterDashboardResponse>("master_dashboard");
  },
  masterBilling(barbershopId: number, status: "paid" | "pending") {
    return request<{ barbershop_id: number; status: string }>("master_billing", { method: "POST", body: { barbershop_id: barbershopId, status } });
  },
  services() {
    return request<ServiceListResponse>("services");
  },
  serviceSave(input: SaveServiceInput) {
    return request<{ service: Service }>("service_save", { method: "POST", body: input });
  },
  appointmentList(date: string) {
    return request<AppointmentListResponse>("appointment_list", { query: { date } });
  },
  appointmentStatus(appointmentId: number, status: "confirmed" | "completed" | "no_show" | "cancelled") {
    return request<{ appointment_id: number; status: string }>("appointment_status", {
      method: "POST",
      body: { appointment_id: appointmentId, status },
    });
  },
};
