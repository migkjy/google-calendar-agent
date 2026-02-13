import { NextResponse } from "next/server";

import { getAuthUrl } from "@/libs/google-auth";

export async function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("OAuth start error:", error);
    const message =
      error instanceof Error ? error.message : "OAuth configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
