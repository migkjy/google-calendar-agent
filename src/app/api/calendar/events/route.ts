import { NextResponse } from "next/server";

import { createEvent, getEvents } from "@/libs/google-calendar";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { summary, description, location, start, end } = body;

    if (!summary || !start?.dateTime || !end?.dateTime) {
      return NextResponse.json(
        { error: "summary, start.dateTime, and end.dateTime are required" },
        { status: 400 },
      );
    }

    const event = await createEvent({
      summary,
      description,
      location,
      start: { dateTime: start.dateTime, timeZone: start.timeZone ?? "Asia/Seoul" },
      end: { dateTime: end.dateTime, timeZone: end.timeZone ?? "Asia/Seoul" },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Calendar event create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create event";
    const status = message.includes("not connected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
