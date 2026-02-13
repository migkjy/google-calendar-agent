# Google Calendar AI 에이전트

## 프로젝트 개요

CEO의 Google Calendar를 기반으로 일정을 자동 분석, 요약, 추천, 리마인드하는 AI 에이전트 시스템.
자비스 VP의 스케줄러 틱(30분)과 연동하여 무인으로 일정을 모니터링하고, CEO에게 텔레그램으로 리마인더를 전송한다.

**핵심 목표**: CEO가 캘린더에 일정을 넣기만 하면, 나머지(리마인더, 일정 요약, 충돌 감지, 빈 시간 추천)는 모두 AI가 자동 처리.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js (App Router, TypeScript) |
| 캘린더 API | Google Calendar API v3 |
| 인증 | OAuth 2.0 (server-side, refresh token 자동 갱신) |
| DB | NeonDB PostgreSQL (기존 인프라 — 토큰, 리마인더, 일정 캐시 저장) |
| AI | Gemini Flash Lite API (일정 분석/요약) |
| 알림 | 텔레그램 봇 API (기존 MacJarvisBot 활용) |
| 배포 | Vercel |
| ORM | Drizzle ORM |

## OAuth 2.0 토큰 관리

### 흐름

```
1. CEO가 최초 1회 Google OAuth 인증 (브라우저)
2. 서버가 authorization_code → access_token + refresh_token 교환
3. refresh_token을 NeonDB에 암호화 저장
4. access_token 만료 시 refresh_token으로 자동 갱신
5. 갱신된 토큰을 DB에 업데이트
```

### 토큰 갱신 로직

```
요청 전 → access_token 만료 체크 (expires_at < now + 5분 버퍼)
  → 만료됨: refresh_token으로 갱신 → DB 업데이트 → 갱신된 토큰으로 요청
  → 유효함: 기존 토큰으로 요청
```

### 환경변수 (CEO 제공 필요)

```env
# Google OAuth 2.0
GOOGLE_CLIENT_ID=               # Google Cloud Console에서 생성
GOOGLE_CLIENT_SECRET=           # Google Cloud Console에서 생성
GOOGLE_REDIRECT_URI=https://{domain}/api/auth/callback

# 기존 인프라
DATABASE_URL=postgresql://neondb_owner:npg_OWVKrmC21gNk@ep-divine-darkness-a1gvyg6j-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
GOOGLE_AI_API_KEY=              # Gemini API (기존 키 재활용 가능)
TELEGRAM_BOT_TOKEN=             # MacJarvisBot 토큰 (기존 인프라)
TELEGRAM_CHAT_ID=               # CEO 텔레그램 chat_id
```

## 핵심 기능 설계

### 1. Calendar 이벤트 CRUD

| 기능 | 메서드 | Google API 엔드포인트 |
|------|--------|----------------------|
| 일정 목록 조회 | GET | `calendars/{calendarId}/events` |
| 일정 상세 조회 | GET | `calendars/{calendarId}/events/{eventId}` |
| 일정 생성 | POST | `calendars/{calendarId}/events` |
| 일정 수정 | PUT | `calendars/{calendarId}/events/{eventId}` |
| 일정 삭제 | DELETE | `calendars/{calendarId}/events/{eventId}` |
| 빈 시간 조회 | POST | `freeBusy/query` |

- `calendarId`는 기본적으로 `primary` (CEO의 기본 캘린더)
- `timeMin`, `timeMax`로 조회 범위 지정
- `singleEvents=true`, `orderBy=startTime`으로 반복 일정 펼치기

### 2. AI 일정 분석

#### 하루 일정 요약 (Daily Briefing)
- 매일 아침 (스케줄러 틱) 오늘 일정을 조회
- AI가 자연어로 요약: "오늘 3건의 미팅이 있습니다. 10시 팀 미팅, 14시 고객 미팅, 17시 1:1"
- 텔레그램으로 CEO에게 전송

#### 충돌 감지 (Conflict Detection)
- 새 일정 생성/수정 시 기존 일정과 시간 겹침 자동 감지
- 겹치는 일정이 있으면 경고 + 대안 시간 제안

#### 빈 시간 추천 (Free Time Suggestion)
- CEO가 "1시간짜리 미팅 잡아줘" 요청 시
- freeBusy API로 빈 시간 조회 → 최적 시간대 3개 제안
- 업무 시간(09:00-18:00) 내에서만 추천

### 3. 리마인더 시스템

#### 커스텀 리마인더
- Google Calendar 기본 알림 외에 추가 리마인더 설정
- DB에 리마인더 규칙 저장 (일정 N분 전, 반복 주기 등)
- 스케줄러 틱마다 체크 → 텔레그램 알림

#### 반복 리마인더 (습관/의무)
- "경찰벌금내기" 같은 반복 의무 리마인더
- cron 표현식 또는 간단한 규칙(매일/매주/매월) 기반
- 완료 확인 기능 (CEO가 텔레그램에서 "완료" 응답)

#### 리마인더 유형

| 유형 | 트리거 | 예시 |
|------|--------|------|
| `event_before` | 일정 시작 N분 전 | "10분 후 팀 미팅입니다" |
| `daily_briefing` | 매일 지정 시각 | "오늘 일정 요약" |
| `recurring` | cron 규칙 | "교통 벌금 확인" |
| `deadline` | 특정 날짜/시각 | "프로젝트 마감 D-3" |

### 4. 스케줄러 연동

```
[30분 틱 수신]
  → calendar-agent API 호출
  → 응답:
    1. 다음 30분 내 시작하는 일정 리마인더
    2. 트리거된 커스텀 리마인더
    3. 일정 변경 감지 (마지막 체크 이후 변경사항)
  → VP가 CEO에게 텔레그램 전달
```

## API 라우트 설계

### 인증

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/auth/google` | GET | OAuth 인증 URL 생성 → 리다이렉트 |
| `/api/auth/callback` | GET | OAuth 콜백, code → token 교환 → DB 저장 |
| `/api/auth/status` | GET | 현재 토큰 상태 확인 (유효/만료/미설정) |

### 캘린더

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/calendar/events` | GET | 일정 목록 조회 (`?from=&to=&limit=`) |
| `/api/calendar/events` | POST | 일정 생성 |
| `/api/calendar/events/[id]` | GET | 일정 상세 조회 |
| `/api/calendar/events/[id]` | PUT | 일정 수정 |
| `/api/calendar/events/[id]` | DELETE | 일정 삭제 |
| `/api/calendar/freebusy` | POST | 빈 시간 조회 |

### AI 분석

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/ai/daily-briefing` | GET | 오늘 일정 AI 요약 |
| `/api/ai/conflict-check` | POST | 일정 충돌 감지 |
| `/api/ai/suggest-time` | POST | 빈 시간 추천 (duration, preferences) |

### 리마인더

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/reminders` | GET | 리마인더 목록 |
| `/api/reminders` | POST | 리마인더 생성 |
| `/api/reminders/[id]` | PUT | 리마인더 수정 |
| `/api/reminders/[id]` | DELETE | 리마인더 삭제 |
| `/api/reminders/check` | GET | 현재 트리거 대상 리마인더 조회 (스케줄러용) |

### 스케줄러 연동

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/scheduler/tick` | POST | 30분 틱 처리 (리마인더 체크 + 변경 감지 + 다음 일정 알림) |

## DB 스키마

### calendar_tokens

OAuth 토큰 저장. CEO 1명이므로 단일 행.

```sql
CREATE TABLE IF NOT EXISTS calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_label text NOT NULL DEFAULT 'ceo',          -- 사용자 식별 (확장 대비)
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamp NOT NULL,                     -- access_token 만료 시각
  scope text,                                        -- 부여된 OAuth scope
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

### calendar_cache

Google Calendar 이벤트 로컬 캐시. API 호출 최소화 + 변경 감지용.

```sql
CREATE TABLE IF NOT EXISTS calendar_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id text UNIQUE NOT NULL,              -- Google Calendar event ID
  summary text,                                       -- 일정 제목
  description text,                                   -- 일정 설명
  location text,                                      -- 장소
  start_time timestamp NOT NULL,
  end_time timestamp NOT NULL,
  all_day boolean DEFAULT false,
  status text DEFAULT 'confirmed',                    -- confirmed | tentative | cancelled
  attendees jsonb DEFAULT '[]',                       -- 참석자 목록
  raw_data jsonb DEFAULT '{}',                        -- Google API 원본 응답
  synced_at timestamp DEFAULT now(),                  -- 마지막 동기화 시각
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_calendar_cache_start ON calendar_cache(start_time);
CREATE INDEX idx_calendar_cache_google_id ON calendar_cache(google_event_id);
```

### reminders

커스텀 리마인더 규칙 저장.

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('event_before', 'daily_briefing', 'recurring', 'deadline')),

  -- event_before 타입
  google_event_id text,                               -- 연결된 Google Calendar 이벤트
  minutes_before integer,                              -- 일정 시작 N분 전

  -- recurring 타입
  cron_expression text,                                -- cron 표현식 (예: "0 9 * * *")

  -- deadline 타입
  deadline_at timestamp,                               -- 마감 시각

  -- 공통
  active boolean DEFAULT true,
  last_triggered_at timestamp,                         -- 마지막 트리거 시각 (중복 방지)
  notify_via text DEFAULT 'telegram',                  -- telegram | push (확장 대비)
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_reminders_active ON reminders(active) WHERE active = true;
CREATE INDEX idx_reminders_type ON reminders(type);
```

### reminder_logs

리마인더 발송 이력. 디버깅 + CEO 확인 추적.

```sql
CREATE TABLE IF NOT EXISTS reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid REFERENCES reminders(id),
  triggered_at timestamp DEFAULT now(),
  message text NOT NULL,                               -- 발송된 메시지 내용
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged', 'failed')),
  acknowledged_at timestamp                            -- CEO 확인 시각
);

CREATE INDEX idx_reminder_logs_reminder ON reminder_logs(reminder_id);
```

## MVP 스코프 (Phase 1)

### 포함 (Must Have)

| 기능 | 설명 | CEO 개입 |
|------|------|---------|
| OAuth 연결 | 최초 1회 브라우저 인증 | 1회 |
| 일정 조회 | 오늘/이번 주/특정 기간 일정 읽기 | 없음 |
| Daily Briefing | 매일 아침 오늘 일정 AI 요약 → 텔레그램 | 없음 |
| 다음 일정 알림 | 30분 내 시작하는 일정 텔레그램 알림 | 없음 |
| 커스텀 리마인더 | 반복 리마인더 설정/관리 | 최초 설정만 |
| 스케줄러 연동 | `/api/scheduler/tick` 엔드포인트 | 없음 |

### 제외 (Phase 2+)

| 기능 | 이유 |
|------|------|
| 일정 생성/수정/삭제 | MVP에서는 읽기 전용으로 시작 |
| 충돌 감지 | 일정 쓰기 기능과 연동 필요 |
| 빈 시간 추천 | 쓰기 기능 이후 |
| AI 이미지 생성 | 불필요 |
| 대시보드 UI | 스케줄러+텔레그램으로 충분 |
| 멀티 유저 | CEO 1명 전용 |

### CEO 개입 최소화 (automation_goal: high)

```json
{
  "ceo_initial": ["Google OAuth 인증 1회", "반복 리마인더 초기 설정"],
  "ai_initial": ["토큰 저장/갱신 자동화", "스케줄러 연동 설정"],
  "ceo_ongoing": [],
  "ai_ongoing": ["일정 모니터링", "리마인더 발송", "Daily Briefing", "토큰 자동 갱신"],
  "automation_goal": "high"
}
```

## 비용 산출

### Google Calendar API
- **비용**: 무료 (Google Workspace 또는 개인 Gmail 계정)
- **일일 한도**: 1,000,000 쿼리/일 (프로젝트 기준)
- **분당 한도**: Cloud Console에서 확인 가능 (기본 충분)
- **예상 사용량**: 30분 틱 x 48회/일 x 2~3 API 호출 = ~144 호출/일 (한도의 0.014%)

### Gemini Flash Lite API (AI 일정 분석)
- Daily Briefing: 1회/일 x ~500 토큰 = ~500 토큰/일
- 월간: ~15,000 토큰/월
- **비용**: ~$0.001/월 (사실상 무료)

### NeonDB
- 기존 인프라 활용 (추가 비용 없음)
- calendar_cache 테이블: 일정 수백 건 수준 (무시할 수 있는 용량)

### Vercel
- 기존 무료 플랜 내 (30분 틱 API 호출 수준)

### 총 예상 비용: 월 $0 (모두 무료 한도 내)

## 프로젝트 구조

```
src/
├── app/
│   ├── page.tsx                          # 간단한 상태 페이지 (OAuth 연결 상태)
│   ├── layout.tsx
│   └── api/
│       ├── auth/
│       │   ├── google/route.ts           # OAuth 인증 URL 생성
│       │   ├── callback/route.ts         # OAuth 콜백 처리
│       │   └── status/route.ts           # 토큰 상태 확인
│       ├── calendar/
│       │   ├── events/route.ts           # 일정 목록 조회 + 생성
│       │   ├── events/[id]/route.ts      # 일정 상세/수정/삭제
│       │   └── freebusy/route.ts         # 빈 시간 조회
│       ├── ai/
│       │   ├── daily-briefing/route.ts   # AI 일정 요약
│       │   ├── conflict-check/route.ts   # 충돌 감지
│       │   └── suggest-time/route.ts     # 빈 시간 추천
│       ├── reminders/
│       │   ├── route.ts                  # 리마인더 CRUD
│       │   ├── [id]/route.ts             # 개별 리마인더
│       │   └── check/route.ts            # 트리거 체크 (스케줄러용)
│       └── scheduler/
│           └── tick/route.ts             # 30분 틱 처리
├── libs/
│   ├── google-auth.ts                    # OAuth 토큰 관리 (갱신, 저장, 조회)
│   ├── google-calendar.ts                # Google Calendar API 래퍼
│   ├── ai-analyzer.ts                    # Gemini API 일정 분석
│   ├── reminder-engine.ts                # 리마인더 체크/트리거 로직
│   ├── telegram.ts                       # 텔레그램 메시지 발송
│   └── db.ts                             # Drizzle ORM 연결
├── models/
│   └── schema.ts                         # Drizzle ORM 스키마
└── types/
    └── calendar.ts                       # Google Calendar API 타입 정의
```

## 빌드 & 배포

```bash
npm install
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run db:push      # Drizzle 스키마 적용
vercel               # Vercel 배포
```

## 워크플로우

### 초기 설정 (CEO 1회)

```
1. CEO: Google Cloud Console에서 OAuth 자격증명 생성 → client_id, client_secret 제공
2. 시스템: .env에 자격증명 설정 → Vercel 배포
3. CEO: /api/auth/google 접속 → Google 로그인 → 권한 승인
4. 시스템: refresh_token 저장 → 이후 자동 갱신
```

### 일상 운영 (무인)

```
[30분 틱]
  → /api/scheduler/tick 호출
  → Google Calendar API로 다음 30분 일정 조회
  → 트리거 대상 리마인더 체크
  → 일정 변경 감지 (캐시 비교)
  → 결과를 VP에게 반환
  → VP가 CEO에게 텔레그램 전송 (필요 시)

[매일 아침 틱 (09:00)]
  → /api/ai/daily-briefing 호출
  → 오늘 전체 일정 조회
  → Gemini AI로 자연어 요약 생성
  → CEO에게 텔레그램 전송
```

## 중요 규칙

- OAuth refresh_token은 DB에 저장하되, 로그에 절대 노출하지 않는다
- Google Calendar API 호출 실패 시 graceful fallback (캐시 데이터 사용)
- 빌드 실패 상태로 커밋하지 않는다
- .env는 gitignore, .env.example만 커밋
- 서브태스크를 done으로 전환할 때 반드시 description에 수행 결과 기입
- 작업 단위로 커밋, 빌드 성공 후 push
