import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const BARBER_TOKEN_KEY = "barbershop_api_token";
export const WEB_STORAGE_WARNING =
  "No navegador, a sessão usa sessionStorage e é removida ao encerrar a aba; não é equivalente ao armazenamento seguro do Android.";

let webMemoryToken: string | null = null;
let webStorageBlocked = false;

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
    if (webStorageBlocked) return webMemoryToken;
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
    webStorageBlocked = false;
    const storage = getWebStorage();
    try {
      storage?.setItem(BARBER_TOKEN_KEY, token);
    } catch {
      // Memory remains the explicit fallback, while the UI documents web storage limits.
      webStorageBlocked = true;
    }
    return;
  }
  await SecureStore.setItemAsync(BARBER_TOKEN_KEY, token);
}

/**
 * Remove the stored token. When expectedToken is supplied, do not delete a
 * newer login's token if an older logout/restore operation finishes late.
 */
export async function clearStoredToken(expectedToken?: string | null): Promise<void> {
  if (Platform.OS === "web") {
    const storage = getWebStorage();
    let current: string | null = webMemoryToken;
    if (!webStorageBlocked) {
      try {
        current = storage?.getItem(BARBER_TOKEN_KEY) ?? webMemoryToken;
      } catch {
        current = webMemoryToken;
      }
    }
    if (expectedToken !== undefined && current !== expectedToken) return;

    // Clear the in-memory fallback before touching browser storage so a failed
    // remove cannot leave the current React session authenticated.
    webMemoryToken = null;
    try {
      storage?.removeItem(BARBER_TOKEN_KEY);
      webStorageBlocked = false;
    } catch (error) {
      webStorageBlocked = true;
      throw error instanceof Error
        ? error
        : new Error("O armazenamento da sessão do navegador não pôde ser limpo.");
    }
    return;
  }

  if (expectedToken !== undefined) {
    const current = await SecureStore.getItemAsync(BARBER_TOKEN_KEY);
    if (current !== expectedToken) return;
  }
  await SecureStore.deleteItemAsync(BARBER_TOKEN_KEY);
}
