import type { BarberRole } from "./types";

/** Expo Router may omit the index segment at the app root. Never redirect it to itself. */
export function tabAccessRedirect(
  route: string | undefined,
  role: BarberRole | null,
  authReady: boolean,
): "/" | null {
  if (!authReady) return null;
  const clientRoute = route === "booking" || route === "history";
  const staffRoute = route === "agenda";
  const adminRoute = route === "clients" || route === "services";
  const protectedRoute = clientRoute || staffRoute || adminRoute || route === "more";
  if (!protectedRoute) return null;
  if (!role) return "/";
  if (clientRoute && role !== "client") return "/";
  if (staffRoute && role !== "barber" && role !== "admin") return "/";
  if (adminRoute && role !== "admin") return "/";
  return null;
}
