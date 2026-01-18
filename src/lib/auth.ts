import { loadConfig, saveConfig } from "./config";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_GRAPH_URL = "https://graph.threads.net";
const THREADS_TOKEN_URL = `${THREADS_GRAPH_URL}/oauth/access_token`;
const REDIRECT_URI = "https://localhost:3000/callback";
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

export const TOKEN_EXPIRY_DAYS = 60;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function getAuthUrl(appId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(","),
    response_type: "code",
  });
  return `${THREADS_AUTH_URL}?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(THREADS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    userId: data.user_id,
  };
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appSecret: string
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });
  const response = await fetch(`${THREADS_GRAPH_URL}/access_token?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Long-lived token exchange failed: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

export async function refreshAccessToken(accessToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: accessToken,
  });
  const response = await fetch(`${THREADS_GRAPH_URL}/refresh_access_token?${params}`);

  if (!response.ok) {
    throw new Error("Token refresh failed");
  }

  const data = await response.json();
  return data.access_token;
}

export function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt);
  const now = new Date();
  // Consider expired if less than 1 day remaining
  return expiry.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
}

export async function getValidAccessToken(): Promise<{ token: string; userId: string } | null> {
  const config = loadConfig();
  const { access_token, user_id, expires_at, app_id, app_secret } = config.auth;

  if (!access_token || !user_id) {
    return null;
  }

  if (isTokenExpired(expires_at) && app_id && app_secret) {
    try {
      const newToken = await refreshAccessToken(access_token);
      config.auth.access_token = newToken;
      config.auth.expires_at = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();
      saveConfig(config);
      return { token: newToken, userId: user_id };
    } catch {
      return null;
    }
  }

  return { token: access_token, userId: user_id };
}
