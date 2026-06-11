/**
 * Centralized API configuration.
 *
 * In production (static export), NEXT_PUBLIC_API_URL must be set at build time.
 * In development, a reverse proxy or this variable routes /api/* to satsgate.
 */
const DEFAULT_API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://api.aipp.dev";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;

export function apiUrl(path: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}

export default API_BASE;
