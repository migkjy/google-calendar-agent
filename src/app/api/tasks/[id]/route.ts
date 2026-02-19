import { NextResponse } from "next/server";

import {
  completeTask,
  deleteTask,
  updateTask,
} from "@/libs/google-tasks";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { title, notes, due, status, listId } = body;

    const data: Record<string, string> = {};
    if (title !== undefined) data.title = title;
    if (notes !== undefined) data.notes = notes;
    if (due !== undefined) data.due = due;
    if (status !== undefined) data.status = status;

    const task = await updateTask(listId ?? "@default", id, data);
    return NextResponse.json({ task });
  } catch (error) {
    console.error("Task PUT error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const listId = body.listId ?? "@default";

    if (body.action === "complete") {
      const task = await completeTask(listId, id);
      return NextResponse.json({ task, message: "Task completed" });
    }

    return NextResponse.json(
      { error: "Unknown action. Use { action: 'complete' }" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Task PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(_request.url);
    const listId = url.searchParams.get("listId") ?? "@default";

    await deleteTask(listId, id);
    return NextResponse.json({ message: "Task deleted" });
  } catch (error) {
    console.error("Task DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
