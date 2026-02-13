import { NextResponse } from "next/server";

import { getEvents } from "@/libs/google-calendar";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // 기본값: 오늘 시작~끝
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const from = searchParams.get("from") ?? todayStart.toISOString();
    const to = searchParams.get("to") ?? todayEnd.toISOString();
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const events = await getEvents(from, to, limit);

    return NextResponse.json({
      events,
      count: events.length,
      from,
      to,
    });
  } catch (error) {
    console.error("Calendar events error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch events";
    const status = message.includes("not connected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
