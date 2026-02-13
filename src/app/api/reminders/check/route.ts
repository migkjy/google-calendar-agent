import { NextResponse } from "next/server";

import { getTriggeredReminders } from "@/libs/reminder-engine";

export async function GET() {
  try {
    const now = new Date();
    const triggered = await getTriggeredReminders(now);

    return NextResponse.json({
      triggered,
      checkedAt: now.toISOString(),
      count: triggered.length,
    });
  } catch (error) {
    console.error("Reminders check error:", error);
    return NextResponse.json(
      { error: "Failed to check reminders" },
      { status: 500 },
    );
  }
}
