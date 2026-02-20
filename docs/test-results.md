# LLM-First Architecture Refactoring - Test Results

## Build Verification
- `npm run build`: PASS (Next.js 16.1.6 Turbopack, compiled in 3.3s)
- TypeScript: No errors
- All 17 routes generated successfully

## Architecture Verification

### Multi-tool-call loop
The new `handleChatMessage()` function implements a while loop (max 10 iterations):
1. Send messages + tools to OpenAI
2. If response has `tool_calls` -> execute ALL in parallel -> feed results back
3. If response has no `tool_calls` -> use text content as final reply
4. Loop continues until LLM produces a text-only response

### Raw text passthrough
The webhook (`/api/telegram/webhook/route.ts`) passes `message.text` directly to `handleChatMessage()`. No preprocessing, parsing, or intent detection before the LLM call. The LLM receives the user's raw Korean text in the `user` message.

### Tool executor JSON responses
All tool executors now return structured JSON (not hardcoded Korean strings). Example:
```json
{"status": "ok", "task": {"id": "abc", "title": "빨래하기", "due": "2026-02-21"}}
```
The LLM then composes a natural Korean response from these results.

### Asia/Seoul time handling
- `todaySeoul()` uses `Intl.DateTimeFormat` with `timeZone: "Asia/Seoul"` for accurate date
- `buildSystemPrompt()` provides current date/time in KST to the LLM
- All event creation/update uses `+09:00` offset in datetime strings
- The LLM resolves relative dates ("tomorrow", "next Monday") using the system prompt's date info

## Regression Test Cases (Expected Behavior)

### Case 1: Multiple tasks
Input: "내일 할일: 빨래하기, 마트가기, 운동하기"
Expected: LLM calls `create_task` 3 times (parallel tool_calls), each with due=tomorrow's date.
LLM receives 3 JSON results, composes response like "3개 할일을 추가했습니다: 빨래하기, 마트가기, 운동하기"

### Case 2: Mixed event + task
Input: "내일 오후 3시 미팅 잡고, 미팅 전에 자료 준비 할일도 등록해줘"
Expected: LLM calls `create_event` (summary="미팅", date=tomorrow, start_time="15:00") AND `create_task` (title="자료 준비", due=tomorrow). Both tool results fed back, LLM generates combined response.

### Case 3: Single event
Input: "모레 오전 10시에 치과 예약"
Expected: LLM calls `create_event` with summary="치과 예약", date=day after tomorrow, start_time="10:00". Single tool result fed back, LLM responds with confirmation.

### Case 4: Event query
Input: "이번 주 일정 알려줘"
Expected: LLM calls `list_events` with date=today (or Monday), days=7. Receives JSON array of events. LLM formats a natural summary response.

## Commit
- Hash: adc71f9
- Branch: main
- Push: success
- Vercel auto-deploy: triggered

## Risks / Notes
- OpenAI gpt-4.1-mini model is used. If the model doesn't exist or changes, update the model string.
- Max 10 iterations prevents infinite loops, but complex requests might hit the limit.
- Google Calendar/Tasks API must be OAuth-connected for tools to work. Without OAuth, all tool calls return error messages which the LLM will relay to the user.
