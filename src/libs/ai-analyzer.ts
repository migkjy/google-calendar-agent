import type { CalendarEvent } from "@/libs/google-calendar";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.0-flash-lite";

/** 일정 목록을 받아 자연어 요약 생성 (한국어) */
export async function generateDailyBriefing(events: CalendarEvent[]): Promise<string> {
  if (events.length === 0) {
    return "오늘 예정된 일정이 없습니다. 자유롭게 활용할 수 있는 하루입니다.";
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;

  // AI API 없으면 템플릿 기반 fallback
  if (!apiKey) {
    return templateBriefing(events);
  }

  try {
    return await geminiBriefing(apiKey, events);
  } catch (error) {
    console.error("Gemini API error, falling back to template:", error);
    return templateBriefing(events);
  }
}

async function geminiBriefing(apiKey: string, events: CalendarEvent[]): Promise<string> {
  const eventList = events
    .map((e) => {
      const start = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        : "종일";
      const end = e.end.dateTime
        ? new Date(e.end.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        : "";
      const location = e.location ? ` (${e.location})` : "";
      return `- ${start}${end ? `~${end}` : ""}: ${e.summary}${location}`;
    })
    .join("\n");

  const prompt = `당신은 CEO의 일정 비서입니다. 아래 오늘 일정을 간결하고 실용적으로 요약해 주세요.
핵심 일정, 주의사항, 빈 시간대를 포함해 주세요. 한국어로 작성하고, 3-5문장 이내로 요약해 주세요.

오늘 일정 (${events.length}건):
${eventList}`;

  const res = await fetch(`${GEMINI_API}/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${error}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

function templateBriefing(events: CalendarEvent[]): string {
  const lines: string[] = [`오늘 일정 ${events.length}건:`];

  for (const e of events) {
    const start = e.start.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      : "종일";
    const end = e.end.dateTime
      ? new Date(e.end.dateTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      : "";
    const location = e.location ? ` @ ${e.location}` : "";
    lines.push(`  ${start}${end ? ` ~ ${end}` : ""} - ${e.summary}${location}`);
  }

  return lines.join("\n");
}
