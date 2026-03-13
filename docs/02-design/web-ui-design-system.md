# AI PM System Web UI Design System

> **PDCA Phase**: Design
> **작성일**: 2026-03-12
> **티켓**: APS-5-7
> **기반**: `packages/web-ui/src/` 실제 코드 분석

---

## 1. 색상 시스템

### 배경 레이어 (깊이 순)

| 레이어 | 값 | 사용처 |
|--------|-----|--------|
| 최외곽 (앱 배경) | `bg-gray-950` (`#030712`) | `App.tsx` 루트 |
| 패널/카드 배경 | `bg-gray-900` (`#111827`) | Dashboard 프로젝트 카드, TaskDetail, 차트 컨테이너 |
| TaskCard 배경 | `#1A1D2E` | TaskCard raw hex |
| 인라인 코드 배경 | `bg-[#252a3a]` | TaskModal 코드 블록 |
| 입력 필드 | `bg-slate-900` | SearchBar input |

> **핵심 불일치**: `Dashboard`/`TaskDetail`/`App`은 `gray-` 접두사, `KanbanBoard`/`TaskCard`/`TaskModal`/`SearchBar`는 `slate-` 접두사 또는 raw hex 사용. 두 팔레트는 색조가 달라 페이지 전환 시 미세한 색차 발생.

### 상태(Status) 공식 색상 — KanbanBoard 기준

| 상태 | 공식 색상 | Dashboard (불일치) | 권장 |
|------|-----------|-------------------|------|
| `todo` | `#6366f1` indigo | `bg-gray-600` | KanbanBoard 기준 통일 |
| `in_progress` | `#f59e0b` amber | `bg-blue-500` | KanbanBoard 기준 통일 |
| `review` | `#06b6d4` cyan | `bg-purple-500` | KanbanBoard 기준 통일 |
| `done` | `#22c55e` green | `bg-green-500` | KanbanBoard 기준 통일 |

### 에픽 색상 팔레트 (TaskCard.tsx 기준)

8색 순환: blue(`#60a5fa`), violet(`#a78bfa`), emerald(`#34d399`), rose(`#fb7185`), amber(`#fbbf24`), cyan(`#22d3ee`), pink(`#f472b6`), lime(`#a3e635`)

### 우선순위 색상

| P | 배경 | 텍스트 |
|---|------|--------|
| P1 | `bg-red-900/60` | `text-red-300` |
| P2 | `bg-amber-900/60` | `text-amber-300` |
| P3 | `bg-blue-900/40` | `text-blue-300` |
| P4 | `bg-slate-700/60` | `text-slate-300` |
| P5 | `bg-slate-800/60` | `text-slate-400` |

---

## 2. 타이포그래피

폰트: Tailwind 기본 시스템 UI 스택. `font-mono`는 티켓코드, 상태 뱃지, 활동 로그에 사용.

| 역할 | 클래스 |
|------|--------|
| 페이지 타이틀 | `text-3xl font-bold` |
| 섹션 타이틀 | `text-xl font-bold` / `text-lg font-semibold` |
| 차트 제목 | `text-sm font-bold uppercase tracking-wider text-gray-400` |
| 태스크 제목 | `text-[13px] font-medium` |
| 뱃지/메타 | `text-[11px]` / `text-[10px] font-mono font-semibold` |
| AI 분석 레이블 | `text-[9px] font-bold uppercase tracking-wider` |

---

## 3. 컴포넌트 카탈로그

### TaskCard

**Props**: `task`, `epicTitle?`, `epicColor?` (`{bg, text, dot}`), `subtaskInfo?`, `onClick?`

**Variants**:
- 기본: 배경 `#1A1D2E`, 좌측 4px 상태 컬러 스트라이프
- 에픽 있음: 에픽 색상 틴트 배경 (alpha 0.06), 에픽 색상 테두리 (alpha 0.20)
- `done`: opacity 65%, 제목 취소선, 우선순위 뱃지 숨김
- `blocked`: 빨간 경고 배너 + `blocked_by` 텍스트
- `in_progress` + 서브태스크: amber 진행률 바
- 드래그 중: opacity 50%, `scale-105`, `shadow-2xl`

### KanbanBoard

**Props**: `tasks: Task[]`, `epics: Epic[]`

5개 컬럼: Todo(indigo) → In Progress(amber) → Verifying(violet) → Review(cyan) → Done(green)

그룹 레이블: BACKLOG / ACTIVE / REVIEW / COMPLETE

DnD: `@dnd-kit`, PointerSensor 임계값 8px, 낙관적 업데이트 + 실패 시 롤백.

### TaskModal

우측 슬라이드인 패널 (`w-[520px]`, `bg-[#0F1117]`). 읽기 전용.

핵심 서브컴포넌트:
- `StatusBadge`: `text-[10px] font-mono`, 상태별 bg/text 클래스 쌍
- `Pill`: `pass`(green) / `fail`(red) / `fix`(orange) / `done`(green) variants

### SearchBar

**Props**: `onSearchResults?`, `epics?`

상태 / 우선순위(P1~P5) / 담당자(ai/human) / 에픽 / 날짜범위 멀티 필터. 검색 저장 기능.

토글 버튼: 선택 시 `bg-blue-600 text-white`, 미선택 시 `bg-slate-700 text-slate-300`.

### Charts (recharts 기반)

공통 Tooltip: `backgroundColor: '#111827'`, `border: '1px solid #374151'`, `borderRadius: '8px'`

| 차트 | 타입 | 용도 | 특이사항 |
|------|------|------|----------|
| BottleneckChart | Donut PieChart | 상태별 분포 | 독립 EPIC_COLORS 사용 (불일치) |
| EpicProgressChart | BarChart (%) | 에픽별 완료율 | 최대 8개, 상단 모서리 radius |
| VelocityChart | AreaChart + Line | 14일 완료 속도 | 30초 자동 갱신, 누적+일별 2라인 |

---

## 4. 일관성 개선 필요 사항

| 우선순위 | 문제 | 권장 해결책 |
|----------|------|------------|
| 높음 | `gray-` vs `slate-` 혼재 | 앱 전체 `slate-`로 통일 |
| 높음 | 상태 색상 컴포넌트별 불일치 | `src/constants/statusColors.ts` 단일 소스 생성 |
| 중간 | 에픽 팔레트 이중 정의 | `src/constants/epicColors.ts` 통합 |
| 중간 | `alert()` 사용 | 토스트 컴포넌트 도입 |
| 낮음 | 호버 인라인 스타일 | CSS 변수 주입 패턴으로 전환 |
| 낮음 | 픽셀 리터럴 폰트 크기 | `@theme` 커스텀 스케일 정의 |

---

## 5. Tailwind CSS v4 적용 가이드

현재 `index.css`는 `@import "tailwindcss"` 한 줄만 있어 v4 기능 미활용.

**권장 `index.css` 확장:**

```css
@import "tailwindcss";

@theme {
  /* 상태 색상 */
  --color-status-todo:        #6366f1;
  --color-status-in-progress: #f59e0b;
  --color-status-testing:     #8b5cf6;
  --color-status-fixing:      #f97316;
  --color-status-review:      #06b6d4;
  --color-status-done:        #22c55e;
  --color-status-blocked:     #ef4444;

  /* 배경 레이어 */
  --color-surface-root:       #030712;
  --color-surface-panel:      #111827;
  --color-surface-card:       #1A1D2E;
  --color-surface-card-hover: #1E2135;
  --color-surface-code:       #252a3a;

  /* 테두리 */
  --color-border-card:    #2e3348;
  --color-border-default: #374151;

  /* 폰트 크기 (픽셀 리터럴 대체) */
  --font-size-2xs: 0.5625rem;  /* 9px */
  --font-size-xxs: 0.625rem;   /* 10px */
  --font-size-xs-: 0.6875rem;  /* 11px */
  --font-size-sm-: 0.8125rem;  /* 13px */
}
```

**마이그레이션 우선순위:**
1. `@theme` 블록으로 상태 색상 + 배경 토큰 정의
2. `src/constants/statusColors.ts` 공통 상수 파일 생성
3. TaskCard hover 효과를 CSS 변수 주입 패턴으로 전환
4. 차트 Tooltip 스타일 CSS 변수로 통일
5. 픽셀 폰트 사이즈 `@theme` 스케일로 교체
