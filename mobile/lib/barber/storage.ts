import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const BARBER_TOKEN_KEY = "barbershop_api_token";
export const WEB_STORAGE_WARNING =
  "No navegador, a sessão usa sessionStorage e é removida ao encerrar a aba; não é equivalente ao armazenamento seguro do Android.";

let webMemoryToken: string | null = null;

function getWebStorage(): Storage | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    const storage = getWebStorage();
    try {
      return storage?.getItem(BARBER_TOKEN_KEY) ?? webMemoryToken;
    } catch {
      return webMemoryToken;
    }
  }
  return SecureStore.getItemAsync(BARBER_TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    webMemoryToken = token;
    const storage = getWebStorage();
    try {
      storage?.setItem(BARBER_TOKEN_KEY, token);
    } catch {
      // sessionStorage may be disabled; memory is the documented fallback.
    }
    return;
  }
  await SecureStore.setItemAsync(BARBER_TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  webMemoryToken = null;
  if (Platform.OS === "web") {
    const storage = getWebStorage();
    try {
      storage?.removeItem(BARBER_TOKEN_KEY);
    } catch {
      // Nothing else to clear when browser storage is unavailable.
    }
    return;
  }
  await SecureStore.deleteItemAsync(BARBER_TOKEN_KEY);
}
