import { NextResponse } from "next/server";

import { generateDailyBriefing } from "@/libs/ai-analyzer";
import { getValidToken } from "@/libs/google-auth";
import { getEvents } from "@/libs/google-calendar";
import { getActiveReminders } from "@/libs/reminder-engine";
import { sendMessage } from "@/libs/telegram";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    let calendarConnected = false;
    let events: Awaited<ReturnType<typeof getEvents>> = [];
    let briefingText: string;

    // Calendar 연결 시 일정 조회
    try {
      const token = await getValidToken();
      calendarConnected = token !== null;
      if (calendarConnected) {
        events = await getEvents(todayStart.toISOString(), todayEnd.toISOString());
      }
    } catch {
      // Calendar not connected
    }

    if (calendarConnected && events.length > 0) {
      briefingText = await generateDailyBriefing(events);
    } else if (calendarConnected) {
      briefingText = "오늘 예정된 일정이 없습니다. 자유롭게 활용할 수 있는 하루입니다.";
    } else {
      // Calendar 미연결: 리마인더만 포함
      const reminders = await getActiveReminders();
      if (reminders.length > 0) {
        const reminderList = reminders
          .map((r) => `  - [${r.type}] ${r.title}`)
          .join("\n");
        briefingText = `Google Calendar 미연결 상태입니다.\n\n활성 리마인더 ${reminders.length}건:\n${reminderList}`;
      } else {
        briefingText = "Google Calendar 미연결 상태이며, 활성 리마인더가 없습니다.";
      }
    }

    // 텔레그램으로 CEO에게 전송
    let telegramSent = false;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      const header = `📋 <b>오늘의 브리핑</b> (${now.toLocaleDateString("ko-KR")})\n\n`;
      telegramSent = await sendMessage(chatId, header + briefingText);
    }

    return NextResponse.json({
      briefing: briefingText,
      calendarConnected,
      eventsCount: events.length,
      telegramSent,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Daily briefing error:", error);
    return NextResponse.json(
      { error: "Failed to generate daily briefing" },
      { status: 500 },
    );
  }
}
