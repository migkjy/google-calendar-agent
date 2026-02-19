import { NextResponse } from "next/server";

import {
  createTask,
  getTaskLists,
  getTasks,
} from "@/libs/google-tasks";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get("listId") ?? "@default";
    const showCompleted = searchParams.get("showCompleted") === "true";
    const listsOnly = searchParams.get("listsOnly") === "true";

    if (listsOnly) {
      const taskLists = await getTaskLists();
      return NextResponse.json({ taskLists });
    }

    const tasks = await getTasks(listId, showCompleted);
    return NextResponse.json({ tasks, count: tasks.length, listId });
  } catch (error) {
    console.error("Tasks GET error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch tasks";
    const status = message.includes("not connected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, notes, due, listId } = body;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 },
      );
    }

    const task = await createTask(listId ?? "@default", {
      title,
      notes,
      due: due ? `${due}T00:00:00.000Z` : undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Tasks POST error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create task";
    const status = message.includes("not connected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
