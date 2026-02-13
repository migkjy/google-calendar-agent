import { and, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@/libs/db";
import { reminderLogsSchema, remindersSchema } from "@/models/schema";

// 활성 리마인더 목록 조회
export async function getActiveReminders() {
  return db
    .select()
    .from(remindersSchema)
    .where(eq(remindersSchema.active, true));
}

// 리마인더 생성
export async function createReminder(input: {
  title: string;
  description?: string;
  type: string;
  googleEventId?: string;
  minutesBefore?: number;
  cronExpression?: string;
  deadlineAt?: Date;
}) {
  const [reminder] = await db
    .insert(remindersSchema)
    .values(input)
    .returning();
  return reminder;
}

// 리마인더 수정
export async function updateReminder(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    active: boolean;
    minutesBefore: number;
    cronExpression: string;
    deadlineAt: Date;
  }>,
) {
  const [reminder] = await db
    .update(remindersSchema)
    .set(data)
    .where(eq(remindersSchema.id, id))
    .returning();
  return reminder;
}

// 리마인더 삭제
export async function deleteReminder(id: string) {
  await db.delete(remindersSchema).where(eq(remindersSchema.id, id));
}

// 트리거 대상 리마인더 조회 (스케줄러용)
export async function getTriggeredReminders(now: Date) {
  // event_before, deadline 타입: 아직 트리거 안 된 것 중 시간이 된 것
  return db
    .select()
    .from(remindersSchema)
    .where(
      and(
        eq(remindersSchema.active, true),
        or(
          // deadline 타입: 마감 시각이 지남
          and(
            eq(remindersSchema.type, "deadline"),
            lt(remindersSchema.deadlineAt, now),
          ),
          // daily_briefing, recurring: cron 기반 (별도 로직 필요)
          eq(remindersSchema.type, "daily_briefing"),
          eq(remindersSchema.type, "recurring"),
        ),
        // 아직 트리거 안 됐거나, 마지막 트리거가 오래 전
        or(
          isNull(remindersSchema.lastTriggeredAt),
          lt(
            remindersSchema.lastTriggeredAt,
            new Date(now.getTime() - 30 * 60 * 1000),
          ), // 30분 전
        ),
      ),
    );
}

// 리마인더 트리거 기록
export async function logReminderTrigger(
  reminderId: string,
  message: string,
  now: Date,
) {
  // 로그 기록
  await db.insert(reminderLogsSchema).values({
    reminderId,
    message,
    status: "sent",
  });

  // lastTriggeredAt 업데이트
  await db
    .update(remindersSchema)
    .set({ lastTriggeredAt: now })
    .where(eq(remindersSchema.id, reminderId));
}

// 리마인더 로그 조회
export async function getReminderLogs(reminderId: string, limit = 10) {
  return db
    .select()
    .from(reminderLogsSchema)
    .where(eq(reminderLogsSchema.reminderId, reminderId))
    .orderBy(reminderLogsSchema.triggeredAt)
    .limit(limit);
}
