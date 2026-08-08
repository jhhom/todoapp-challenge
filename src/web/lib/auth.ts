const TOKEN_KEY = "todo_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Decodes the JWT payload (without verifying the signature) to read the
 * logged-in user's email. This is safe for display purposes — the token's
 * integrity is still verified server-side on every authenticated request.
 */
export function getUserEmail(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(json) as { email?: string };
    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}
