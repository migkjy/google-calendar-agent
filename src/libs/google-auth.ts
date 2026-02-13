import { eq } from "drizzle-orm";

import { db } from "@/libs/db";
import { calendarTokensSchema } from "@/models/schema";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return secret;
}

function getRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:3000/api/auth/callback"
  );
}

/** Google OAuth 인증 URL 생성 */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** authorization_code → access_token + refresh_token 교환 */
export async function exchangeCode(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    tokenType: (data.token_type as string) ?? "Bearer",
    expiresIn: data.expires_in as number,
    scope: data.scope as string,
  };
}

/** refresh_token으로 access_token 갱신 */
async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    expiresIn: data.expires_in as number,
    scope: data.scope as string,
  };
}

/** 토큰을 NeonDB calendar_tokens 테이블에 저장 (upsert) */
export async function saveToken(tokenData: {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn: number;
  scope?: string;
}) {
  const expiresAt = new Date(Date.now() + tokenData.expiresIn * 1000);

  // CEO 토큰이 이미 있는지 확인
  const [existing] = await db
    .select()
    .from(calendarTokensSchema)
    .where(eq(calendarTokensSchema.userLabel, "ceo"))
    .limit(1);

  if (existing) {
    // 기존 토큰 업데이트
    const [updated] = await db
      .update(calendarTokensSchema)
      .set({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenType: tokenData.tokenType ?? "Bearer",
        expiresAt,
        scope: tokenData.scope,
      })
      .where(eq(calendarTokensSchema.id, existing.id))
      .returning();
    return updated;
  }

  // 새 토큰 생성
  const [created] = await db
    .insert(calendarTokensSchema)
    .values({
      userLabel: "ceo",
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      tokenType: tokenData.tokenType ?? "Bearer",
      expiresAt,
      scope: tokenData.scope,
    })
    .returning();
  return created;
}

/** DB에서 토큰 조회, 만료 시 자동 갱신, 유효한 access_token 반환 */
export async function getValidToken(): Promise<string | null> {
  const [token] = await db
    .select()
    .from(calendarTokensSchema)
    .where(eq(calendarTokensSchema.userLabel, "ceo"))
    .limit(1);

  if (!token) return null;

  // 만료 5분 전 버퍼
  const bufferMs = 5 * 60 * 1000;
  const isExpired = token.expiresAt.getTime() < Date.now() + bufferMs;

  if (!isExpired) {
    return token.accessToken;
  }

  // refresh_token으로 갱신
  try {
    const refreshed = await refreshAccessToken(token.refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

    await db
      .update(calendarTokensSchema)
      .set({
        accessToken: refreshed.accessToken,
        expiresAt: newExpiresAt,
        scope: refreshed.scope,
      })
      .where(eq(calendarTokensSchema.id, token.id));

    return refreshed.accessToken;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
}
