import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/libs/db";
import { calendarTokensSchema } from "@/models/schema";

export async function GET() {
  try {
    const [token] = await db
      .select()
      .from(calendarTokensSchema)
      .where(eq(calendarTokensSchema.userLabel, "ceo"))
      .limit(1);

    if (!token) {
      return NextResponse.json({
        connected: false,
        message: "Google Calendar not connected. OAuth setup required.",
      });
    }

    const now = new Date();
    const isExpired = token.expiresAt < now;

    return NextResponse.json({
      connected: true,
      expired: isExpired,
      expiresAt: token.expiresAt.toISOString(),
      scope: token.scope,
      updatedAt: token.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Auth status error:", error);
    return NextResponse.json(
      { error: "Failed to check auth status" },
      { status: 500 },
    );
  }
}
