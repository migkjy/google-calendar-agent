import { NextResponse } from "next/server";

import { createReminder, getActiveReminders } from "@/libs/reminder-engine";

export async function POST() {
  // Block in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seed endpoint is disabled in production" },
      { status: 403 },
    );
  }

  try {
    // Check if already seeded
    const existing = await getActiveReminders();
    const alreadyExists = existing.some(
      (r) => r.title === "경찰벌금내기" && r.type === "recurring",
    );

    if (alreadyExists) {
      return NextResponse.json({
        message: "Seed data already exists",
        skipped: true,
      });
    }

    const reminder = await createReminder({
      title: "경찰벌금내기",
      description: "교통 벌금 납부 확인. 미납 시 가산금 발생.",
      type: "recurring",
      cronExpression: "0 9 * * 1", // 매주 월요일 09:00
    });

    return NextResponse.json({
      message: "Seed data created",
      reminder,
    }, { status: 201 });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json(
      { error: "Failed to seed data" },
      { status: 500 },
    );
  }
}
