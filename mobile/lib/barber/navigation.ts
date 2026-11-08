import type { BarberRole } from "./types";

/** Expo Router may omit the index segment at the app root. Never redirect it to itself. */
export function tabAccessRedirect(
  route: string | undefined,
  role: BarberRole | null,
  authReady: boolean,
): "/" | null {
  if (!authReady) return null;
  const clientRoute = route === "history";
  const bookingRoute = route === "booking";
  const staffRoute = route === "agenda";
  const adminRoute = route === "clients" || route === "services";
  const protectedRoute = clientRoute || bookingRoute || staffRoute || adminRoute || route === "more";
  if (!protectedRoute) return null;
  if (!role) return "/";
  if (clientRoute && role !== "client") return "/";
  if (bookingRoute && role !== "client" && role !== "barber") return "/";
  if (staffRoute && role !== "barber" && role !== "admin") return "/";
  if (adminRoute && role !== "admin") return "/";
  return null;
}
