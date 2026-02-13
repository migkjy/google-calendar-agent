import { NextResponse } from "next/server";

import { getValidToken } from "@/libs/google-auth";
import {
  getTriggeredReminders,
  logReminderTrigger,
} from "@/libs/reminder-engine";
import { sendReminder } from "@/libs/telegram";

export async function POST() {
  try {
    const now = new Date();

    // 1. 트리거 대상 리마인더 조회
    const triggered = await getTriggeredReminders(now);

    // 2. 트리거된 리마인더 로그 기록 + 텔레그램 발송
    const results = [];
    for (const reminder of triggered) {
      const message = `[${reminder.type}] ${reminder.title}${reminder.description ? ` - ${reminder.description}` : ""}`;
      await logReminderTrigger(reminder.id, message, now);

      // 텔레그램 알림 (환경변수 없으면 graceful skip)
      const sent = await sendReminder(reminder.title, message);

      results.push({
        id: reminder.id,
        title: reminder.title,
        type: reminder.type,
        message,
        telegramSent: sent,
      });
    }

    // 3. 캘린더 연동 상태 확인
    let calendarConnected = false;
    try {
      const token = await getValidToken();
      calendarConnected = token !== null;
    } catch {
      // OAuth credentials not configured yet
    }

    return NextResponse.json({
      tickAt: now.toISOString(),
      calendarConnected,
      reminders: {
        triggered: results,
        count: results.length,
      },
      calendar: calendarConnected
        ? {} // OAuth 구현 후: upcoming events, changes
        : {
            message:
              "Google Calendar not connected. Connect via /api/auth/google",
          },
    });
  } catch (error) {
    console.error("Scheduler tick error:", error);
    return NextResponse.json(
      { error: "Scheduler tick failed" },
      { status: 500 },
    );
  }
}
