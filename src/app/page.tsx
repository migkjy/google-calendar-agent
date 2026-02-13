"use client";

import { useEffect, useState } from "react";

interface AuthStatus {
  connected: boolean;
  expired?: boolean;
  message?: string;
}

interface Reminder {
  id: string;
  title: string;
  type: string;
  active: boolean;
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ connected: false });
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [authRes, remindersRes] = await Promise.all([
          fetch("/api/auth/status").catch(() => null),
          fetch("/api/reminders").catch(() => null),
        ]);

        if (authRes?.ok) {
          setAuthStatus(await authRes.json());
        }
        if (remindersRes?.ok) {
          const data = await remindersRes.json();
          setReminders(data.reminders ?? []);
        }
      } catch {
        // Fetch may fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 font-sans dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Google Calendar AI Agent
        </h1>
        <p className="mb-8 text-zinc-500 dark:text-zinc-400">
          Status Dashboard
        </p>

        {/* OAuth Status */}
        <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Google Calendar Connection
          </h2>
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                loading
                  ? "bg-zinc-300"
                  : authStatus.connected && !authStatus.expired
                    ? "bg-green-500"
                    : "bg-red-500"
              }`}
            />
            <span className="text-zinc-700 dark:text-zinc-300">
              {loading
                ? "Checking..."
                : authStatus.connected
                  ? authStatus.expired
                    ? "Token expired - needs refresh"
                    : "Connected"
                  : "Not connected"}
            </span>
          </div>
          <button
            disabled
            className="mt-4 cursor-not-allowed rounded-md bg-zinc-300 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
            title="OAuth implementation pending"
          >
            Connect Google Calendar (Coming Soon)
          </button>
        </section>

        {/* Active Reminders */}
        <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Active Reminders ({loading ? "..." : reminders.length})
          </h2>
          {loading ? (
            <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
          ) : reminders.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              No active reminders.
            </p>
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-zinc-100 px-4 py-3 dark:border-zinc-800"
                >
                  <div>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {r.title}
                    </span>
                    <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {r.type}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${r.active ? "text-green-600" : "text-zinc-400"}`}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* API Endpoints */}
        <section className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            API Endpoints
          </h2>
          <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                GET /api/auth/status
              </code>{" "}
              - OAuth connection status
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                GET /api/reminders
              </code>{" "}
              - List active reminders
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                POST /api/reminders
              </code>{" "}
              - Create a reminder
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                GET /api/reminders/[id]
              </code>{" "}
              - Get reminder detail
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                PUT /api/reminders/[id]
              </code>{" "}
              - Update reminder
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                DELETE /api/reminders/[id]
              </code>{" "}
              - Deactivate reminder
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                GET /api/reminders/check
              </code>{" "}
              - Check triggered reminders
            </li>
            <li>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
                POST /api/scheduler/tick
              </code>{" "}
              - Scheduler tick (process reminders)
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
