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

// --- Tool definitions ---

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
        "Update/modify an existing calendar event. Search by the original title first.",
      parameters: {
        type: "object",
        properties: {
          search_summary: {
            type: "string",
            description: "Original event title to search for",
          },
          date: {
            type: "string",
            description:
              "Date of the event in YYYY-MM-DD format. Default: today.",
          },
          new_summary: {
            type: "string",
            description:
              "New event title (optional, only if changing title)",
          },
          new_start_time: {
            type: "string",
            description:
              "New start time in HH:MM (24h) format (optional)",
          },
          new_end_time: {
            type: "string",
            description:
              "New end time in HH:MM (24h) format (optional)",
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
        "Delete a calendar event by searching for it.",
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
            description:
              "Whether to include completed tasks. Default false.",
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
        "Create a new task/to-do item. Call this once per task. For multiple tasks, call this function multiple times.",
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
      description:
        "Delete a task. Use when user wants to remove a task.",
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

// --- Helpers ---

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getNowSeoul(): Date {
  // Get current time in Asia/Seoul
  const now = new Date();
  return now;
}

function todaySeoul(): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(getNowSeoul()); // YYYY-MM-DD
}

function buildSystemPrompt(): string {
  const now = getNowSeoul();

  const dateStr = now.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const timeStr = now.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `당신은 김준영 대표의 개인 일정/할일 비서입니다.
간결하고 친근한 한국어로 답변하세요. 존댓말을 사용하세요.
핵심만 답변하고 불필요한 설명은 생략하세요.

오늘: ${todaySeoul()} (${dateStr})
현재 시각: ${timeStr}
시간대: Asia/Seoul (KST, UTC+9)

중요 규칙:
- 사용자가 "내일", "모레", "다음주 월요일" 등 상대적 시간 표현을 사용하면, 오늘 날짜(${todaySeoul()})를 기준으로 정확한 YYYY-MM-DD 날짜를 계산해서 tool에 전달하세요.
- 여러 할일이나 일정을 동시에 요청하면, 각각에 대해 별도의 tool call을 만드세요.
- 일정과 할일이 섞인 요청도 각각 적절한 tool로 처리하세요.
- tool 실행 결과를 바탕으로 자연스러운 한국어 응답을 만들어주세요.`;
}

// --- Chat History ---

async function getChatHistory(
  chatId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select({
      role: chatHistorySchema.role,
      content: chatHistorySchema.content,
    })
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
    await db
      .delete(chatHistorySchema)
      .where(
        and(
          eq(chatHistorySchema.chatId, Number(chatId)),
          lt(chatHistorySchema.id, minId),
        ),
      );
  }
}

// --- Tool executors (return structured JSON for LLM) ---

async function execListEvents(
  args: Record<string, string>,
): Promise<string> {
  const date = args.date ?? todaySeoul();
  const days = parseInt(args.days ?? "1", 10);

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await getEvents(from.toISOString(), to.toISOString());

  if (events.length === 0) {
    return JSON.stringify({
      status: "ok",
      count: 0,
      date,
      days,
      events: [],
    });
  }

  const mapped = events.map((e: CalendarEvent) => ({
    id: e.id,
    summary: e.summary,
    start: e.start.dateTime ?? e.start.date ?? "",
    end: e.end.dateTime ?? e.end.date ?? "",
    location: e.location ?? null,
    allDay: !e.start.dateTime,
  }));

  return JSON.stringify({
    status: "ok",
    count: events.length,
    date,
    days,
    events: mapped,
  });
}

async function execCreateEvent(
  args: Record<string, string>,
): Promise<string> {
  const summary = args.summary;
  const date = args.date ?? todaySeoul();
  const startTime = args.start_time;

  if (!summary || !startTime) {
    return JSON.stringify({
      status: "error",
      message: "summary and start_time are required",
    });
  }

  const [startH, startM] = startTime.split(":").map(Number);

  let endH = startH + 1;
  let endM = startM;
  if (args.end_time) {
    [endH, endM] = args.end_time.split(":").map(Number);
  }

  const startDt = `${date}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00+09:00`;
  const endDt = `${date}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00+09:00`;

  const event = await createEvent({
    summary,
    description: args.description,
    location: args.location,
    start: { dateTime: startDt, timeZone: "Asia/Seoul" },
    end: { dateTime: endDt, timeZone: "Asia/Seoul" },
  });

  return JSON.stringify({
    status: "ok",
    event: {
      id: event.id,
      summary: event.summary,
      date,
      start_time: startTime,
      end_time: args.end_time ?? `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`,
      location: args.location ?? null,
    },
  });
}

async function execUpdateEvent(
  args: Record<string, string>,
): Promise<string> {
  const searchTitle = args.search_summary?.toLowerCase();
  if (!searchTitle) {
    return JSON.stringify({
      status: "error",
      message: "search_summary is required",
    });
  }

  const date = args.date ?? todaySeoul();

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const events = await getEvents(from.toISOString(), to.toISOString());

  const match = events.find((e: CalendarEvent) =>
    e.summary.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return JSON.stringify({
      status: "error",
      message: `Event "${args.search_summary}" not found on ${date}`,
    });
  }

  const updates: {
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
  } = {};

  if (args.new_summary) updates.summary = args.new_summary;
  if (args.new_description) updates.description = args.new_description;
  if (args.new_location) updates.location = args.new_location;

  if (args.new_start_time) {
    const [h, m] = args.new_start_time.split(":");
    updates.start = {
      dateTime: `${date}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+09:00`,
      timeZone: "Asia/Seoul",
    };
  }
  if (args.new_end_time) {
    const [h, m] = args.new_end_time.split(":");
    updates.end = {
      dateTime: `${date}T${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00+09:00`,
      timeZone: "Asia/Seoul",
    };
  }

  // If only start time changed, shift end by same duration
  if (
    updates.start &&
    !updates.end &&
    match.start.dateTime &&
    match.end.dateTime
  ) {
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

  await updateEvent(match.id, updates);

  const changes: string[] = [];
  if (args.new_summary) changes.push(`title -> "${args.new_summary}"`);
  if (args.new_start_time) changes.push(`start -> ${args.new_start_time}`);
  if (args.new_end_time) changes.push(`end -> ${args.new_end_time}`);
  if (args.new_description) changes.push("description updated");
  if (args.new_location) changes.push(`location -> "${args.new_location}"`);

  return JSON.stringify({
    status: "ok",
    original_summary: match.summary,
    changes,
  });
}

async function execDeleteEvent(
  args: Record<string, string>,
): Promise<string> {
  const searchTitle = args.summary?.toLowerCase();
  if (!searchTitle) {
    return JSON.stringify({
      status: "error",
      message: "summary is required",
    });
  }

  const date = args.date ?? todaySeoul();

  const from = new Date(`${date}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const events = await getEvents(from.toISOString(), to.toISOString());

  const match = events.find((e: CalendarEvent) =>
    e.summary.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return JSON.stringify({
      status: "error",
      message: `Event "${args.summary}" not found on ${date}`,
    });
  }

  await deleteEvent(match.id);

  return JSON.stringify({
    status: "ok",
    deleted_summary: match.summary,
    date,
  });
}

async function execListTasks(
  args: Record<string, string>,
): Promise<string> {
  const showCompleted = args.show_completed === "true";
  const tasks = await getTasks("@default", showCompleted);

  const mapped = tasks.map((t: GoogleTask) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    due: t.due ?? null,
    notes: t.notes ?? null,
  }));

  return JSON.stringify({
    status: "ok",
    count: tasks.length,
    show_completed: showCompleted,
    tasks: mapped,
  });
}

async function execCreateTask(
  args: Record<string, string>,
): Promise<string> {
  if (!args.title) {
    return JSON.stringify({
      status: "error",
      message: "title is required",
    });
  }

  const task = await createTask("@default", {
    title: args.title,
    notes: args.notes,
    due: args.due ? `${args.due}T00:00:00.000Z` : undefined,
  });

  return JSON.stringify({
    status: "ok",
    task: {
      id: task.id,
      title: task.title,
      due: args.due ?? null,
    },
  });
}

async function execCompleteTask(
  args: Record<string, string>,
): Promise<string> {
  if (!args.title) {
    return JSON.stringify({
      status: "error",
      message: "title is required",
    });
  }

  const searchTitle = args.title.toLowerCase();
  const tasks = await getTasks("@default", false);

  const match = tasks.find((t: GoogleTask) =>
    t.title.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return JSON.stringify({
      status: "error",
      message: `Task "${args.title}" not found`,
    });
  }

  await completeTask("@default", match.id);

  return JSON.stringify({
    status: "ok",
    completed_title: match.title,
  });
}

async function execDeleteTask(
  args: Record<string, string>,
): Promise<string> {
  if (!args.title) {
    return JSON.stringify({
      status: "error",
      message: "title is required",
    });
  }

  const searchTitle = args.title.toLowerCase();
  const tasks = await getTasks("@default", true);

  const match = tasks.find((t: GoogleTask) =>
    t.title.toLowerCase().includes(searchTitle),
  );
  if (!match) {
    return JSON.stringify({
      status: "error",
      message: `Task "${args.title}" not found`,
    });
  }

  await deleteTask("@default", match.id);

  return JSON.stringify({
    status: "ok",
    deleted_title: match.title,
  });
}

// --- Tool executor dispatcher ---

const TOOL_EXECUTORS: Record<
  string,
  (args: Record<string, string>) => Promise<string>
> = {
  list_events: execListEvents,
  create_event: execCreateEvent,
  update_event: execUpdateEvent,
  delete_event: execDeleteEvent,
  list_tasks: execListTasks,
  create_task: execCreateTask,
  complete_task: execCompleteTask,
  delete_task: execDeleteTask,
};

const MAX_TOOL_ITERATIONS = 10;

// --- Main chat handler: LLM-first multi-tool loop ---

export async function handleChatMessage(
  chatId: string,
  userMessage: string,
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    const reply =
      "AI 기능이 비활성화되어 있습니다. (OPENAI_API_KEY 미설정)";
    await sendMessage(chatId, reply);
    return reply;
  }

  let reply: string;

  try {
    // Load chat history for context
    const history = await getChatHistory(chatId);

    // Save user message
    await saveChatMessage(chatId, "user", userMessage);

    // Build conversation messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt() },
      ...history.map(
        (h) =>
          ({
            role: h.role as "user" | "assistant",
            content: h.content,
          }) as OpenAI.Chat.ChatCompletionMessageParam,
      ),
      { role: "user", content: userMessage },
    ];

    // Multi-tool-call loop
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.1,
      });

      const msg = response.choices[0]?.message;
      if (!msg) {
        reply = "응답을 생성하지 못했습니다. 다시 시도해 주세요.";
        break;
      }

      // If no tool calls, we have the final text response
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = msg.content ?? "무슨 말씀이신지 잘 모르겠어요.";
        break;
      }

      // Add the assistant message with tool_calls to conversation
      messages.push(msg);

      // Execute ALL tool calls in parallel
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (toolCall) => {
          if (toolCall.type !== "function") {
            return {
              tool_call_id: toolCall.id,
              result: JSON.stringify({
                status: "error",
                message: "Unknown tool type",
              }),
            };
          }

          const executor = TOOL_EXECUTORS[toolCall.function.name];
          if (!executor) {
            return {
              tool_call_id: toolCall.id,
              result: JSON.stringify({
                status: "error",
                message: `Unknown tool: ${toolCall.function.name}`,
              }),
            };
          }

          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executor(args);
            return { tool_call_id: toolCall.id, result };
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : "Unknown error";
            return {
              tool_call_id: toolCall.id,
              result: JSON.stringify({
                status: "error",
                message: errorMsg,
              }),
            };
          }
        }),
      );

      // Add all tool results to conversation
      for (const tr of toolResults) {
        messages.push({
          role: "tool",
          tool_call_id: tr.tool_call_id,
          content: tr.result,
        });
      }

      // Continue loop - LLM will see tool results and either
      // make more tool calls or produce a final text response
    }

    // Safety: if we hit max iterations without a text response
    reply ??= "요청을 처리하는 데 너무 많은 단계가 필요합니다. 더 간단하게 요청해 주세요.";

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
