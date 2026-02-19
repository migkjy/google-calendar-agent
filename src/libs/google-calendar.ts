import { getValidToken } from "@/libs/google-auth";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  htmlLink: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  organizer?: { email: string; displayName?: string };
}

interface EventsResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
  summary: string;
  timeZone: string;
}

async function calendarFetch<T>(
  path: string,
  options?: { params?: Record<string, string>; method?: string; body?: unknown },
): Promise<T> {
  const token = await getValidToken();
  if (!token) {
    throw new Error("Google Calendar not connected. Connect via /api/auth/google");
  }

  const url = new URL(`${CALENDAR_API}${path}`);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions: RequestInit = {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOptions);

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${error}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** 기간 내 일정 목록 조회 */
export async function getEvents(
  timeMin: string,
  timeMax: string,
  maxResults = 50,
): Promise<CalendarEvent[]> {
  const data = await calendarFetch<EventsResponse>("/calendars/primary/events", {
    params: {
      timeMin,
      timeMax,
      maxResults: String(maxResults),
      singleEvents: "true",
      orderBy: "startTime",
    },
  });
  return data.items ?? [];
}

/** 단일 일정 상세 조회 */
export async function getEvent(eventId: string): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(`/calendars/primary/events/${encodeURIComponent(eventId)}`);
}

/** 앞으로 N분 내 시작하는 일정 조회 */
export async function getUpcomingEvents(minutes: number): Promise<CalendarEvent[]> {
  const now = new Date();
  const future = new Date(now.getTime() + minutes * 60 * 1000);
  return getEvents(now.toISOString(), future.toISOString());
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

/** 일정 생성 */
export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>("/calendars/primary/events", {
    method: "POST",
    body: input,
  });
}

/** 일정 수정 */
export async function updateEvent(
  eventId: string,
  input: Partial<CreateEventInput>,
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(
    `/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: input },
  );
}

/** 일정 삭제 */
export async function deleteEvent(eventId: string): Promise<void> {
  await calendarFetch<void>(
    `/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}
