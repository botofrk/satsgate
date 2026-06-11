/**
 * Centralized API configuration.
 *
 * In production (static export), NEXT_PUBLIC_API_URL must be set at build time.
 * In development, a reverse proxy or this variable routes /api/* to satsgate.
 */
const DEFAULT_API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "/api";

function getRuntimeApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }

    if (protocol === "https:" && hostname) {
      return "/api";
    }
  }

  return DEFAULT_API_BASE;
}

export function apiUrl(path: string): string {
  // Ensure path starts with /
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${getRuntimeApiBase()}${cleanPath}`;
}

export default getRuntimeApiBase();
