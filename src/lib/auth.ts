import { loadConfig, saveConfig } from "./config";

const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const REDIRECT_URI = "http://localhost:3000/callback";
const SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];

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

export async function refreshAccessToken(
  appId: string,
  appSecret: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${accessToken}`,
    { method: "GET" }
  );

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
      const newToken = await refreshAccessToken(app_id, app_secret, access_token);
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
      config.auth.access_token = newToken;
      config.auth.expires_at = expiresAt;
      saveConfig(config);
      return { token: newToken, userId: user_id };
    } catch {
      return null;
    }
  }

  return { token: access_token, userId: user_id };
}
