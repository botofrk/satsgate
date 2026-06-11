export const TOKEN_STORAGE_KEY = "aipp.session.token";
export const API_KEY_STORAGE_KEY = "aipp.session.apiKey";

export type AuthSession = {
  ok: boolean;
  authenticated: boolean;
  pubkey: string;
  account: {
    exists: boolean;
    client_id: number | null;
    credits: number | null;
    payee_lightning_address: string | null;
  };
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export function getStoredToken(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string) {
  if (!canUseStorage()) return;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getStoredApiKey(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setStoredApiKey(apiKey: string) {
  if (!canUseStorage()) return;
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

export function clearStoredSession() {
  if (!canUseStorage()) return;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function clearStoredApiKey() {
  if (!canUseStorage()) return;
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function decodeTokenSubject(token: string | null): string {
  if (!token) return "Loading...";
  try {
    return JSON.parse(atob(token.split(".")[1] ?? "")).sub ?? "unknown_wallet";
  } catch {
    return "unknown_wallet";
  }
}

