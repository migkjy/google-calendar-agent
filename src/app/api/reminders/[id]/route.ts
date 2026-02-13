import { NextResponse } from "next/server";

import {
  deleteReminder,
  getReminderById,
  updateReminder,
} from "@/libs/reminder-engine";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const reminder = await getReminderById(id);

    if (!reminder) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ reminder });
  } catch (error) {
    console.error("Reminder GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reminder" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { title, description, active, minutesBefore, cronExpression, deadlineAt } = body;

    const existing = await getReminderById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (active !== undefined) data.active = active;
    if (minutesBefore !== undefined) data.minutesBefore = minutesBefore;
    if (cronExpression !== undefined) data.cronExpression = cronExpression;
    if (deadlineAt !== undefined) data.deadlineAt = new Date(deadlineAt);

    const reminder = await updateReminder(id, data);
    return NextResponse.json({ reminder });
  } catch (error) {
    console.error("Reminder PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update reminder" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await getReminderById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 },
      );
    }

    const reminder = await deleteReminder(id);
    return NextResponse.json({ reminder, message: "Reminder deactivated" });
  } catch (error) {
    console.error("Reminder DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete reminder" },
      { status: 500 },
    );
  }
}
