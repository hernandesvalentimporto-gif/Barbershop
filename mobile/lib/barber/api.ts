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

let authToken: string | null = null;
let unauthorizedHandler: (() => void | Promise<void>) | null = null;

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
}

export function registerUnauthorizedHandler(handler: (() => void | Promise<void>) | null): void {
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

function errorMessage(payload: any, fallback: string): string {
  if (typeof payload === "string") return payload;
  return payload?.error ?? payload?.message ?? payload?.detail ?? fallback;
}

export async function request<T>(
  action: string,
  options: { method?: "GET" | "POST"; query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  try {
    const response = await fetch(actionUrl(action, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = parsePayload(await response.text());
    if (!response.ok) {
      const code = typeof payload === "object" && payload ? String((payload as any).code ?? "") : undefined;
      const endpointMissing =
        response.status === 404 ||
        response.status === 405 ||
        code === "endpoint_missing" ||
        (typeof payload === "object" && payload ? (payload as any).endpoint_missing === true : false);
      if (response.status === 401) {
        authToken = null;
        await unauthorizedHandler?.();
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
  login(email: string, password: string) {
    return request<{ token: string; user: User; expires_in?: number }>("login", {
      method: "POST",
      body: { email, password },
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
  availability(date: string, barberId: number, serviceId: number) {
    return request<{ slots: AvailabilitySlot[] }>("availability", {
      query: { date, barber_id: barberId, service_id: serviceId },
    });
  },
  appointmentCreate(input: {
    barber_id: number;
    service_id: number;
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
