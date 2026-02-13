import { NextResponse } from "next/server";

import { exchangeCode, saveToken } from "@/libs/google-auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return new NextResponse(
      htmlPage(
        "Authorization Failed",
        `Google denied access: ${error}. <a href="/api/auth/google">Try again</a>.`,
      ),
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code) {
    return new NextResponse(
      htmlPage(
        "Missing Code",
        'No authorization code received. <a href="/api/auth/google">Try again</a>.',
      ),
      { status: 400, headers: { "Content-Type": "text/html" } },
    );
  }

  try {
    const tokenData = await exchangeCode(code);
    await saveToken(tokenData);

    return new NextResponse(
      htmlPage(
        "Connected!",
        'Google Calendar connected successfully. You can close this window. <a href="/">Back to dashboard</a>.',
      ),
      { status: 200, headers: { "Content-Type": "text/html" } },
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    const message =
      err instanceof Error ? err.message : "Token exchange failed";
    return new NextResponse(
      htmlPage(
        "Connection Failed",
        `${message}. <a href="/api/auth/google">Try again</a>.`,
      ),
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:2rem;max-width:400px;text-align:center}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style>
</head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
