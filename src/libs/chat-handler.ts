import { and, asc, desc, eq, lt } from "drizzle-orm";
import OpenAI from "openai";

import { db } from "@/libs/db";
import {
  createEvent,
  deleteEvent,
  getEvents,
  updateEvent,
  type CalendarEvent,
} from "@/libs/google-calendar";
import {
  completeTask,
  createTask,
  deleteTask,
  getTasks,
  type GoogleTask,
} from "@/libs/google-tasks";
import { sendMessage } from "@/libs/telegram";
import { chatHistorySchema } from "@/models/schema";

type ChatFunction =
  | "list_events"
  | "create_event"
  | "update_event"
  | "delete_event"
  | "list_tasks"
  | "create_task"
  | "complete_task"
  | "delete_task"
  | "general_chat";

interface ParsedIntent {
  function: ChatFunction;
  parameters: Record<string, string | undefined>;
}

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_events",
      description:
        "List calendar events for a date range. Use when user asks about schedule, events, or what's happening on a day.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The target date in YYYY-MM-DD format. Use today if not specified.",
          },
          days: {
            type: "string",
            description:
              "Number of days to look ahead from the date. Default 1.",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_event",
      description:
        "Create a new calendar event. Use when user wants to schedule a meeting, appointment, or event.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title/summary",
          },
          date: {
            type: "string",
            description: "Event date in YYYY-MM-DD format",
          },
          start_time: {
            type: "string",
            description: "Start time in HH:MM (24h) format",
          },
          end_time: {
            type: "string",
            description:
              "End time in HH:MM (24h) format. Default: 1 hour after start.",
          },
          location: {
            type: "string",
            description: "Event location (optional)",
          },
          description: {
            type: "string",
            description: "Event description (optional)",
          },
        },
        required: ["summary", "date", "start_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_event",
      description:
        "Update/modify an existing calendar event. Use when user wants to change time, title, description, or location of an event. Search by the original title first.",
      parameters: {
        type: "object",
        properties: {
          search_summary: {
            type: "string",
            description: "Original event title to search for",
          },
          date: {
            type: "string",
            description: "Date of the event in YYYY-MM-DD format. Default: today.",
          },
          new_summary: {
            type: "string",
            description: "New event title (optional, only if changing title)",
          },
          new_start_time: {
            type: "string",
            description: "New start time in HH:MM (24h) format (optional)",
          },
          new_end_time: {
            type: "string",
            description: "New end time in HH:MM (24h) format (optional)",
          },
          new_description: {
            type: "string",
            description: "New event description (optional)",
          },
          new_location: {
            type: "string",
            description: "New event location (optional)",
          },
        },
        required: ["search_summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_event",
      description:
        "Delete a calendar event by searching for it. Use when user wants to cancel or remove an event.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title to search for and delete",
          },
          date: {
            type: "string",
            description: "Date of the event in YYYY-MM-DD format",
          },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "List Google Tasks (to-do items). Use when user asks about tasks, to-do list, or what needs to be done.",
      parameters: {
        type: "object",
        properties: {
          show_completed: {
            type: "string",
            description: "Whether to include completed tasks. Default false.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task/to-do item. Use when user wants to add something to their to-do list.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title",
          },
          notes: {
            type: "string",
            description: "Task notes/details (optional)",
          },
          due: {
            type: "string",
            description: "Due date in YYYY-MM-DD format (optional)",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Mark a task as completed. Use when user says they finished a task.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title to search for and complete",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task. Use when user wants to remove a task.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Task title to search for and delete",
          },
        },
        required: ["title"],
      },
    },
  },
];

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// --- Chat History ---

async function getChatHistory(
  chatId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select({ role: chatHistorySchema.role, content: chatHistorySchema.content })
    .from(chatHistorySchema)
    .where(eq(chatHistorySchema.chatId, Number(chatId)))
    .orderBy(asc(chatHistorySchema.id))
    .limit(10);

  return rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
}

async function saveChatMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await db.insert(chatHistorySchema).values({
    chatId: Number(chatId),
    role,
    content,
  });

  // Cleanup: keep only the latest 10 messages per chat_id
  const rows = await db
    .select({ id: chatHistorySchema.id })
    .from(chatHistorySchema)
    .where(eq(chatHistorySchema.chatId, Number(chatId)))
    .orderBy(desc(chatHistorySchema.id))
    .limit(10);

  if (rows.length === 10) {
    const minId = rows[rows.length - 1].id;
    await db.delete(chatHistorySchema).where(
      and(
        eq(chatHistorySchema.chatId, Number(chatId)),
        lt(chatHistorySchema.id, minId),
      ),
    );
  }
}

// --- Intent Parsing ---

async function parseIntent(
  client: OpenAI,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<ParsedIntent> {
  const now = new Date();
  const systemPrompt = `당신은 김준영 대표의 개인 일정 비서입니다.
간결하고 친근한 한국어로 답변하세요. 존댓말을 사용하세요.
핵심만 답변하고 불필요한 설명은 생략하세요.
일정이나 할일을 추가/수정/삭제할 때는 반드시 결과를 확인 메시지로 알려주세요.
오늘 날짜와 시간을 항상 인지하고 '내일', '다음주' 등 상대적 시간을 정확히 계산하세요.

오늘: ${todayStr()} (${now.toLocaleDateString("ko-KR", { weekday: "long" })})
현재 시각: ${now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: 0.1,
  });

  const msg = response.choices[0]?.message;

  if (msg?.tool_calls && msg.tool_calls.length > 0) {
    const toolCall = msg.tool_calls[0];
    if (toolCall.type === "function") {
      const args = JSON.parse(toolCall.function.arguments);
      return {
        function: toolCall.function.name as ChatFunction,
        parameters: args,
      };
    }
  }

  return {
    function: "general_chat",
    parameters: { response: msg?.content ?? "무슨 말씀이신지 잘 모르겠어요." },
  };
}

// --- Function Executors ---

async function executeListEvents(params: Record<string, string | undefined>): Promise<string> {
  const date = params.date ?? todayStr();
  const days = parseInt(params.days ?? "1", 10);

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await getEvents(from.toISOString(), to.toISOString());

  if (events.length === 0) {
    return days === 1
      ? `${date} 일정이 없습니다.`
      : `${date}부터 ${days}일간 일정이 없습니다.`;
  }

  const lines = events.map((e: CalendarEvent) => {
    const start = e.start.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "종일";
    const end = e.end.dateTime
      ? new Date(e.end.dateTime).toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const loc = e.location ? ` (${e.location})` : "";
    return `  ${start}${end ? `~${end}` : ""} ${e.summary}${loc}`;
  });

  const header =
    days === 1 ? `${date} 일정 (${events.length}건):` : `${date}부터 ${days}일간 일정 (${events.length}건):`;
  return `${header}\n${lines.join("\n")}`;
}

async function executeCreateEvent(params: Record<string, string | undefined>): Promise<string> {
  const summary = params.summary!;
  const date = params.date ?? tomorrowStr();
  const startTime = params.start_time!;

  const startHour = parseInt(startTime.split(":")[0], 10);
  const startMin = parseInt(startTime.split(":")[1] ?? "0", 10);

  let endHour = startHour + 1;
  let endMin = startMin;
  if (params.end_time) {
    endHour = parseInt(params.end_time.split(":")[0], 10);
    endMin = parseInt(params.end_time.split(":")[1] ?? "0", 10);
  }

  const startDt = `${date}T${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00+09:00`;
  const endDt = `${date}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00+09:00`;

  const event = await createEvent({
    summary,
    description: params.description,
    location: params.location,
    start: { dateTime: startDt, timeZone: "Asia/Seoul" },
    end: { dateTime: endDt, timeZone: "Asia/Seoul" },
  });

  const startDisplay = new Date(startDt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `"${event.summary}" 일정을 ${date} ${startDisplay}에 추가했습니다.`;
}

async function executeUpdateEvent(params: Record<string, string | undefined>): Promise<string> {
  const searchTitle = params.search_summary!.toLowerCase();
  const date = params.date ?? todayStr();

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const events = await getEvents(from.toISOString(), to.toISOString());

  const match = events.find(
    (e: CalendarEvent) => e.summary.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return `"${params.search_summary}" 일정을 찾을 수 없습니다.`;
  }

  const updates: {
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
  } = {};

  if (params.new_summary) {
    updates.summary = params.new_summary;
  }
  if (params.new_description) {
    updates.description = params.new_description;
  }
  if (params.new_location) {
    updates.location = params.new_location;
  }
  if (params.new_start_time) {
    const [h, m] = params.new_start_time.split(":");
    updates.start = {
      dateTime: `${date}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+09:00`,
      timeZone: "Asia/Seoul",
    };
  }
  if (params.new_end_time) {
    const [h, m] = params.new_end_time.split(":");
    updates.end = {
      dateTime: `${date}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+09:00`,
      timeZone: "Asia/Seoul",
    };
  }

  // If only start time changed but no end time, shift end by same duration
  if (updates.start && !updates.end && match.start.dateTime && match.end.dateTime) {
    const origStart = new Date(match.start.dateTime).getTime();
    const origEnd = new Date(match.end.dateTime).getTime();
    const duration = origEnd - origStart;
    const newStart = new Date(updates.start.dateTime).getTime();
    const newEnd = new Date(newStart + duration);
    updates.end = {
      dateTime: newEnd.toISOString().replace("Z", "+09:00"),
      timeZone: "Asia/Seoul",
    };
  }

  const updated = await updateEvent(match.id, updates);

  const changes: string[] = [];
  if (params.new_summary) changes.push(`제목: "${params.new_summary}"`);
  if (params.new_start_time) changes.push(`시작: ${params.new_start_time}`);
  if (params.new_end_time) changes.push(`종료: ${params.new_end_time}`);
  if (params.new_description) changes.push(`설명 수정`);
  if (params.new_location) changes.push(`장소: ${params.new_location}`);

  return `"${match.summary}" 일정을 수정했습니다.\n변경: ${changes.join(", ")}`;
}

async function executeDeleteEvent(params: Record<string, string | undefined>): Promise<string> {
  const searchTitle = params.summary!.toLowerCase();
  const date = params.date ?? todayStr();

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const events = await getEvents(from.toISOString(), to.toISOString());

  const match = events.find(
    (e: CalendarEvent) => e.summary.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return `"${params.summary}" 일정을 찾을 수 없습니다.`;
  }

  await deleteEvent(match.id);
  return `"${match.summary}" 일정을 삭제했습니다.`;
}

async function executeListTasks(params: Record<string, string | undefined>): Promise<string> {
  const showCompleted = params.show_completed === "true";
  const tasks = await getTasks("@default", showCompleted);

  if (tasks.length === 0) {
    return showCompleted ? "할일이 없습니다." : "미완료 할일이 없습니다.";
  }

  const lines = tasks.map((t: GoogleTask) => {
    const status = t.status === "completed" ? "[완료]" : "[ ]";
    const due = t.due ? ` (기한: ${t.due.slice(0, 10)})` : "";
    return `  ${status} ${t.title}${due}`;
  });

  return `할일 목록 (${tasks.length}건):\n${lines.join("\n")}`;
}

async function executeCreateTask(params: Record<string, string | undefined>): Promise<string> {
  const task = await createTask("@default", {
    title: params.title!,
    notes: params.notes,
    due: params.due ? `${params.due}T00:00:00.000Z` : undefined,
  });

  const dueStr = params.due ? ` (기한: ${params.due})` : "";
  return `"${task.title}"을(를) 할일에 추가했습니다.${dueStr}`;
}

async function executeCompleteTask(params: Record<string, string | undefined>): Promise<string> {
  const searchTitle = params.title!.toLowerCase();
  const tasks = await getTasks("@default", false);

  const match = tasks.find(
    (t: GoogleTask) => t.title.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return `"${params.title}" 할일을 찾을 수 없습니다.`;
  }

  await completeTask("@default", match.id);
  return `"${match.title}" 할일을 완료 처리했습니다.`;
}

async function executeDeleteTask(params: Record<string, string | undefined>): Promise<string> {
  const searchTitle = params.title!.toLowerCase();
  const tasks = await getTasks("@default", true);

  const match = tasks.find(
    (t: GoogleTask) => t.title.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return `"${params.title}" 할일을 찾을 수 없습니다.`;
  }

  await deleteTask("@default", match.id);
  return `"${match.title}" 할일을 삭제했습니다.`;
}

/** Process a user message from Telegram, execute the intent, and reply */
export async function handleChatMessage(
  chatId: string,
  userMessage: string,
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    const reply = "AI 기능이 비활성화되어 있습니다. (OPENAI_API_KEY 미설정)";
    await sendMessage(chatId, reply);
    return reply;
  }

  let reply: string;

  try {
    // Load chat history for context
    const history = await getChatHistory(chatId);

    // Save user message
    await saveChatMessage(chatId, "user", userMessage);

    const intent = await parseIntent(client, userMessage, history);

    switch (intent.function) {
      case "list_events":
        reply = await executeListEvents(intent.parameters);
        break;
      case "create_event":
        reply = await executeCreateEvent(intent.parameters);
        break;
      case "update_event":
        reply = await executeUpdateEvent(intent.parameters);
        break;
      case "delete_event":
        reply = await executeDeleteEvent(intent.parameters);
        break;
      case "list_tasks":
        reply = await executeListTasks(intent.parameters);
        break;
      case "create_task":
        reply = await executeCreateTask(intent.parameters);
        break;
      case "complete_task":
        reply = await executeCompleteTask(intent.parameters);
        break;
      case "delete_task":
        reply = await executeDeleteTask(intent.parameters);
        break;
      case "general_chat":
      default:
        reply = intent.parameters.response ?? "무슨 말씀이신지 잘 모르겠어요.";
        break;
    }

    // Save assistant reply
    await saveChatMessage(chatId, "assistant", reply);
  } catch (error) {
    console.error("Chat handler error:", error);
    reply =
      error instanceof Error && error.message.includes("not connected")
        ? "Google 계정이 연결되지 않았습니다. 먼저 OAuth 인증을 완료해 주세요."
        : "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }

  await sendMessage(chatId, reply);
  return reply;
}
