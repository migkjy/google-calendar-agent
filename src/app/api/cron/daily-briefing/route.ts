import { NextResponse } from "next/server";

import { getValidToken } from "@/libs/google-auth";
import { getEvents, type CalendarEvent } from "@/libs/google-calendar";
import { getTasks, type GoogleTask } from "@/libs/google-tasks";
import { sendMessage } from "@/libs/telegram";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret (Vercel Cron sends Authorization header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStr = now.toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    let calendarConnected = false;
    let events: CalendarEvent[] = [];
    let tasks: GoogleTask[] = [];

    // Calendar + Tasks
    try {
      const token = await getValidToken();
      calendarConnected = token !== null;
      if (calendarConnected) {
        [events, tasks] = await Promise.all([
          getEvents(todayStart.toISOString(), todayEnd.toISOString()),
          getTasks("@default", false),
        ]);
      }
    } catch {
      // Calendar not connected
    }

    if (!calendarConnected) {
      return NextResponse.json({
        ok: false,
        error: "Google Calendar not connected",
      });
    }

    // Build briefing message
    const lines: string[] = [];
    lines.push("\uD83C\uDF05 좋은 아침입니다, 대표님!");
    lines.push("");

    // Events section
    lines.push(`\uD83D\uDCC5 오늘 일정 (${todayStr})`);
    if (events.length === 0) {
      lines.push("  오늘은 일정이 없습니다.");
    } else {
      for (const e of events) {
        const start = e.start.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "종일";
        const loc = e.location ? ` @ ${e.location}` : "";
        lines.push(`  \u2022 ${start} ${e.summary}${loc}`);
      }
    }
    lines.push("");

    // Tasks section
    lines.push("\u2705 오늘 할일");
    if (tasks.length === 0) {
      lines.push("  미완료 할일이 없습니다.");
    } else {
      for (const t of tasks.slice(0, 10)) {
        const due = t.due ? ` (기한: ${t.due.slice(0, 10)})` : "";
        lines.push(`  \u2022 ${t.title}${due}`);
      }
      if (tasks.length > 10) {
        lines.push(`  ... 외 ${tasks.length - 10}건`);
      }
    }
    lines.push("");
    lines.push("오늘도 화이팅하세요! \uD83D\uDCAA");

    const briefingText = lines.join("\n");

    // Send via Telegram
    let telegramSent = false;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (chatId) {
      telegramSent = await sendMessage(chatId, briefingText);
    }

    return NextResponse.json({
      ok: true,
      briefing: briefingText,
      eventsCount: events.length,
      tasksCount: tasks.length,
      telegramSent,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Daily briefing cron error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to generate daily briefing" },
      { status: 500 },
    );
  }
}
