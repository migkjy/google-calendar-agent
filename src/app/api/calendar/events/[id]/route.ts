import { NextResponse } from "next/server";

import { deleteEvent, getEvent, updateEvent } from "@/libs/google-calendar";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const event = await getEvent(id);
    return NextResponse.json({ event });
  } catch (error) {
    console.error("Calendar event GET error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { summary, description, location, start, end } = body;

    const input: Record<string, unknown> = {};
    if (summary !== undefined) input.summary = summary;
    if (description !== undefined) input.description = description;
    if (location !== undefined) input.location = location;
    if (start !== undefined) input.start = start;
    if (end !== undefined) input.end = end;

    const event = await updateEvent(id, input);
    return NextResponse.json({ event });
  } catch (error) {
    console.error("Calendar event PUT error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteEvent(id);
    return NextResponse.json({ message: "Event deleted" });
  } catch (error) {
    console.error("Calendar event DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
