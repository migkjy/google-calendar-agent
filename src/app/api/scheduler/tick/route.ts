import { NextResponse } from "next/server";

import { getValidToken } from "@/libs/google-auth";
import { getUpcomingEvents } from "@/libs/google-calendar";
import {
  getTriggeredReminders,
  logReminderTrigger,
} from "@/libs/reminder-engine";
import { sendMessage, sendReminder } from "@/libs/telegram";

export async function POST() {
  try {
    const now = new Date();

    // 1. 트리거 대상 리마인더 조회 + 텔레그램 발송
    const triggered = await getTriggeredReminders(now);
    const reminderResults = [];
    for (const reminder of triggered) {
      const message = `[${reminder.type}] ${reminder.title}${reminder.description ? ` - ${reminder.description}` : ""}`;
      await logReminderTrigger(reminder.id, message, now);
      const sent = await sendReminder(reminder.title, message);
      reminderResults.push({
        id: reminder.id,
        title: reminder.title,
        type: reminder.type,
        message,
        telegramSent: sent,
      });
    }

    // 2. 캘린더 연동 상태 확인 + 다음 30분 일정
    let calendarConnected = false;
    let upcomingEvents: { id: string; summary: string; start: string }[] = [];
    try {
      const token = await getValidToken();
      calendarConnected = token !== null;
      if (calendarConnected) {
        const events = await getUpcomingEvents(30);
        upcomingEvents = events.map((e) => ({
          id: e.id,
          summary: e.summary,
          start: e.start.dateTime ?? e.start.date ?? "",
        }));

        // 다가오는 일정 텔레그램 알림
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (chatId && upcomingEvents.length > 0) {
          const eventList = upcomingEvents
            .map((e) => {
              const time = e.start
                ? new Date(e.start).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                : "곧";
              return `  ${time} - ${e.summary}`;
            })
            .join("\n");
          await sendMessage(
            chatId,
            `📅 <b>30분 내 일정</b>\n\n${eventList}`,
          );
        }
      }
    } catch {
      // Calendar not connected or credentials not set
    }

    // 3. Daily Briefing 트리거 (09:00~09:29 사이 첫 틱)
    let dailyBriefingTriggered = false;
    const hour = now.getHours();
    const minute = now.getMinutes();
    if (hour === 9 && minute < 30) {
      dailyBriefingTriggered = true;
      // Daily Briefing은 /api/ai/daily-briefing을 별도 호출하거나
      // 여기서 직접 트리거할 수 있음. 여기서는 플래그만 설정.
    }

    return NextResponse.json({
      tickAt: now.toISOString(),
      calendarConnected,
      reminders: {
        triggered: reminderResults,
        count: reminderResults.length,
      },
      calendar: calendarConnected
        ? {
            upcoming: upcomingEvents,
            upcomingCount: upcomingEvents.length,
          }
        : {
            message: "Google Calendar not connected. Connect via /api/auth/google",
          },
      dailyBriefingTriggered,
    });
  } catch (error) {
    console.error("Scheduler tick error:", error);
    return NextResponse.json(
      { error: "Scheduler tick failed" },
      { status: 500 },
    );
  }
}
