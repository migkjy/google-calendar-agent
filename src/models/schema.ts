import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// OAuth 토큰 저장 (CEO 1명, 단일 행)
export const calendarTokensSchema = pgTable("calendar_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userLabel: text("user_label").notNull().default("ceo"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenType: text("token_type").default("Bearer"),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Google Calendar 이벤트 로컬 캐시
export const calendarCacheSchema = pgTable(
  "calendar_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    googleEventId: text("google_event_id").unique().notNull(),
    summary: text("summary"),
    description: text("description"),
    location: text("location"),
    startTime: timestamp("start_time", { mode: "date" }).notNull(),
    endTime: timestamp("end_time", { mode: "date" }).notNull(),
    allDay: boolean("all_day").default(false),
    status: text("status").default("confirmed"),
    attendees: jsonb("attendees").default([]),
    rawData: jsonb("raw_data").default({}),
    syncedAt: timestamp("synced_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_calendar_cache_start").on(table.startTime),
    index("idx_calendar_cache_google_id").on(table.googleEventId),
  ],
);

// 커스텀 리마인더 규칙
export const remindersSchema = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull(), // event_before | daily_briefing | recurring | deadline

    // event_before 타입
    googleEventId: text("google_event_id"),
    minutesBefore: integer("minutes_before"),

    // recurring 타입
    cronExpression: text("cron_expression"),

    // deadline 타입
    deadlineAt: timestamp("deadline_at", { mode: "date" }),

    // 공통
    active: boolean("active").default(true),
    lastTriggeredAt: timestamp("last_triggered_at", { mode: "date" }),
    notifyVia: text("notify_via").default("telegram"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_reminders_active").on(table.active),
    index("idx_reminders_type").on(table.type),
  ],
);

// 리마인더 발송 이력
export const reminderLogsSchema = pgTable(
  "reminder_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reminderId: uuid("reminder_id").references(() => remindersSchema.id),
    triggeredAt: timestamp("triggered_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    message: text("message").notNull(),
    status: text("status").default("sent"), // sent | acknowledged | failed
    acknowledgedAt: timestamp("acknowledged_at", { mode: "date" }),
  },
  (table) => [index("idx_reminder_logs_reminder").on(table.reminderId)],
);

// 텔레그램 대화 히스토리 (맥락 유지)
export const chatHistorySchema = pgTable(
  "telegram_chat_history",
  {
    id: serial("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => [index("idx_chat_history_chat_id").on(table.chatId)],
);
