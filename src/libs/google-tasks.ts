import { getValidToken } from "@/libs/google-auth";

const TASKS_API = "https://www.googleapis.com/tasks/v1";

export interface TaskList {
  id: string;
  title: string;
  updated: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  parent?: string;
  position: string;
  updated: string;
}

interface TaskListsResponse {
  items: TaskList[];
}

interface TasksResponse {
  items?: GoogleTask[];
  nextPageToken?: string;
}

async function tasksFetch<T>(
  path: string,
  options?: { params?: Record<string, string>; method?: string; body?: unknown },
): Promise<T> {
  const token = await getValidToken();
  if (!token) {
    throw new Error("Google not connected. Connect via /api/auth/google");
  }

  const url = new URL(`${TASKS_API}${path}`);
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
    throw new Error(`Google Tasks API error (${res.status}): ${error}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** 태스크 리스트 목록 조회 */
export async function getTaskLists(): Promise<TaskList[]> {
  const data = await tasksFetch<TaskListsResponse>("/users/@me/lists");
  return data.items ?? [];
}

/** 특정 리스트의 태스크 목록 조회 */
export async function getTasks(
  taskListId: string = "@default",
  showCompleted = false,
): Promise<GoogleTask[]> {
  const data = await tasksFetch<TasksResponse>(`/lists/${taskListId}/tasks`, {
    params: {
      showCompleted: String(showCompleted),
      showHidden: String(showCompleted),
      maxResults: "100",
    },
  });
  return data.items ?? [];
}

/** 태스크 생성 */
export async function createTask(
  taskListId: string = "@default",
  input: { title: string; notes?: string; due?: string },
): Promise<GoogleTask> {
  return tasksFetch<GoogleTask>(`/lists/${taskListId}/tasks`, {
    method: "POST",
    body: input,
  });
}

/** 태스크 수정 */
export async function updateTask(
  taskListId: string = "@default",
  taskId: string,
  input: Partial<{ title: string; notes: string; due: string; status: string }>,
): Promise<GoogleTask> {
  return tasksFetch<GoogleTask>(`/lists/${taskListId}/tasks/${taskId}`, {
    method: "PATCH",
    body: input,
  });
}

/** 태스크 완료 처리 */
export async function completeTask(
  taskListId: string = "@default",
  taskId: string,
): Promise<GoogleTask> {
  return updateTask(taskListId, taskId, { status: "completed" });
}

/** 태스크 삭제 */
export async function deleteTask(
  taskListId: string = "@default",
  taskId: string,
): Promise<void> {
  await tasksFetch<void>(`/lists/${taskListId}/tasks/${taskId}`, {
    method: "DELETE",
  });
}
