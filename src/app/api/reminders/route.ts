import { NextResponse } from "next/server";

import {
  createReminder,
  getActiveReminders,
} from "@/libs/reminder-engine";

export async function GET() {
  try {
    const reminders = await getActiveReminders();
    return NextResponse.json({ reminders });
  } catch (error) {
    console.error("Reminders GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reminders" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, type, googleEventId, minutesBefore, cronExpression, deadlineAt } = body;

    if (!title || !type) {
      return NextResponse.json(
        { error: "title and type are required" },
        { status: 400 },
      );
    }

    const validTypes = ["event_before", "daily_briefing", "recurring", "deadline"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    const reminder = await createReminder({
      title,
      description,
      type,
      googleEventId,
      minutesBefore,
      cronExpression,
      deadlineAt: deadlineAt ? new Date(deadlineAt) : undefined,
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    console.error("Reminders POST error:", error);
    return NextResponse.json(
      { error: "Failed to create reminder" },
      { status: 500 },
    );
  }
}
