# Calendar Agent LLM-First Architecture Refactor Plan

## 기존 문제점

### 1. Single tool call only
`parseIntent()` (chat-handler.ts:347)에서 `msg.tool_calls[0]`만 사용.
"내일 할일: 빨래하기, 마트가기, 운동하기" 같은 복수 요청 시 첫 번째만 실행됨.

### 2. No multi-turn tool loop
Tool 실행 결과가 LLM에 피드백되지 않음. 한 번의 LLM 호출 -> 한 번의 tool 실행 -> 하드코딩 응답.
"일정 잡고, 할일도 등록해줘" 같은 혼합 요청 처리 불가.

### 3. Hardcoded response strings
executeCreateEvent() 등이 "일정을 추가했습니다" 같은 고정 문자열 반환.
LLM이 맥락에 맞는 자연어 응답을 생성하지 못함.

### 4. Time handling
LLM이 상대시간을 YYYY-MM-DD로 직접 변환해야 함. Tool 내부 검증/보정 없음.

## 새 아키텍처: LLM-First Multi-Tool Loop

### 핵심 원리
1. 사용자 원문 -> 그대로 LLM 전달 (전처리 없음)
2. LLM이 tool_calls 결정 -> 실행 -> 결과를 LLM에 피드백
3. LLM이 추가 tool_calls 필요하면 반복 (max 10 iterations)
4. 최종 text response를 LLM이 생성

### Flow
```
User message (raw)
  -> OpenAI API (system prompt + history + user message + tools)
  -> Response contains tool_calls?
     YES -> Execute ALL tool_calls -> Feed results back to OpenAI
            -> Loop (check for more tool_calls)
     NO  -> Return text response as final answer
```

### 변경 파일
- `src/libs/chat-handler.ts` - 전면 리팩토링

### 유지 파일 (변경 없음)
- `src/libs/google-calendar.ts` - Calendar API wrapper
- `src/libs/google-tasks.ts` - Tasks API wrapper
- `src/libs/telegram.ts` - Telegram sender
- `src/app/api/telegram/webhook/route.ts` - Webhook entry point
- `src/libs/ai-analyzer.ts` - Daily briefing (별도 기능)
