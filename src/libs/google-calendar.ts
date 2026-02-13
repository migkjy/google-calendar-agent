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

async function calendarFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getValidToken();
  if (!token) {
    throw new Error("Google Calendar not connected. Connect via /api/auth/google");
  }

  const url = new URL(`${CALENDAR_API}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${error}`);
  }

  return res.json() as Promise<T>;
}

/** 기간 내 일정 목록 조회 */
export async function getEvents(
  timeMin: string,
  timeMax: string,
  maxResults = 50,
): Promise<CalendarEvent[]> {
  const data = await calendarFetch<EventsResponse>("/calendars/primary/events", {
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
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
