# APS-2-7 코드 리뷰 (1중)

**대상**: getSessionContext Date→localeCompare 런타임 에러 수정 (재발행)
**리뷰어**: code-reviewer (Opus)
**일시**: 2026-05-18
**분류**: fast-track 1중 (단일 함수 내 1줄 수정 + 회귀 테스트)
**작성자/리뷰어 분리**: 작성자 = 메인 오케스트레이터, 리뷰어 = code-reviewer agent (self-approval 회피 충족)

## 변경 요약

| 파일 | 변경 |
|------|------|
| `packages/mcp-server/src/services/context-service.ts` (line 38~48) | `bTime.localeCompare(aTime)` → `new Date(bTime).getTime() - new Date(aTime).getTime()` (Date/string 양쪽 안전). WHY 코멘트 추가. |
| `packages/mcp-server/src/__tests__/context-service.test.ts` (신규) | 회귀 테스트 3건 + scoped cleanup(`createdProjectIds` 추적, `afterEach`에서 tasks→epics→projects 3단계 명시적 DELETE). SAFETY 코멘트로 APS-2-7 사고 명시. |

## 발견 사항

| Severity | 건수 | 비고 |
|----------|-----|------|
| 🔴 CRITICAL | 0 | |
| 🟠 MAJOR | 0 | |
| 🟡 MINOR | 1 | Dead `DB_PATH = ':memory:'` (pre-existing, out of scope) |
| 🔵 LOW | 1 | SAFETY 코멘트가 사후 분석 문서 링크 미포함 |
| 💡 SUGGESTION | 2 | (1) entity type 통일 후속 티켓 권장 (2) `splice(0)` 동시 실행 환경 가드 (현재 무위험) |

## 항목별 평가

### 1. 버그 수정 정확성: PASS

- `new Date(dateObj)`는 pg가 반환하는 Date 객체에서 안전한 복사본 반환
- `new Date(isoString)`은 ISO 8601 문자열 정상 파싱
- `??` null-coalescing: `completed_at` (nullable) → `created_at` (`NOT NULL DEFAULT NOW()`) fallback 정확
- `getTime()` 숫자 차이로 정렬 (negative/zero/positive) — JS 정렬 비교자로 정상 동작
- NaN 위험 없음: `created_at`은 DB 레벨 NOT NULL 제약

### 2. 회귀 테스트 적정성: PASS

3개 테스트 케이스 — 원본 버그 직접 재현 + fallback 경로 + 5건 cap 경계.
- Test 1: Date 객체 정렬 (원본 버그 직접 트리거)
- Test 2: `created_at` fallback (NULL completed_at)
- Test 3: 7건 → 5건 cap 검증

Gap: mixed completed_at(일부 null, 일부 값) 테스트 없음 — 다만 Test 1+2가 각 경로 독립 커버하여 minor.

### 3. Scoped cleanup 안전성: PASS

- FK 순서: `tasks` → `epics` → `projects` — schema의 `tasks.epic_id ON DELETE SET NULL`이라 epics만 삭제 시 task 행이 orphan(epic_id=NULL)로 남는 문제 회피
- Parameterized: `ANY($1::text[])` + 배열 바인딩 — SQL injection 안전
- `splice(0)`: vitest는 파일 내 sequential 실행 default → atomic 비움. race 무위험
- 스코핑: `seedProjectWithEpic()`에서 push된 id만 cleanup → 다른 데이터 안전

### 4. 후속 권장 사항

**Priority(권장)**: TypeScript entity types(`Task.created_at: string`)와 pg runtime(`Date`) 불일치를 repository 레이어에서 통일하는 별도 티켓.
- Option A: pg type parsers를 ISO 문자열 반환으로 설정
- Option B: entity type을 `Date | string`으로 바꾸고 repository에서 정규화
- 다른 timestamp 사용처 audit 동반 (현재 codebase에 `localeCompare` 잔재는 없으나, string 연산 잠재 위험)

**Lower priority**: `DB_PATH = ':memory:'` dead code를 모든 test 파일에서 정리 + test/prod DATABASE_URL 분리(setupFiles guard or 별도 test DB).

### 5. 코멘트 품질: PASS

- `context-service.ts:39-40` WHY 코멘트: pg driver Date vs string declaration 명시 + 방어 코드 의도 설명
- `context-service.test.ts:37-43` SAFETY 코멘트: 사고 명시, ON DELETE SET NULL 제약 설명, unscoped DELETE 경고 — "scar tissue" 코멘트 모범 사례

## Positive Observations

- 사고 기반 안전 엔지니어링: scoped cleanup 패턴과 SAFETY 코멘트가 모범적
- 방어 코딩: `new Date(x).getTime()`이 현재 runtime(Date)과 미래 string 회귀 모두 안전
- WHY 코멘트가 코드의 what이 아닌 reason 설명
- 다른 timestamp 필드 grep 결과 `localeCompare` 잔재 없음 — 이번이 유일 버그

## 빌드/테스트 증거

- `pnpm --filter @ai-pm/mcp-server build` → exit 0
- `vitest run src/__tests__/context-service.test.ts` → 3 passed (11.92s)
- production DB 검증 post-test: APS/SAMPL/SLS 3건만 보존, garbage 0건

## 최종 판정 (1중 단일 리뷰)

**APPROVED** — code-reviewer (Opus) 1차

CRITICAL 0 + MAJOR 0. 발견된 MINOR(MEDIUM) 1건은 pre-existing 인프라 이슈로 본 티켓 범위 밖, 후속 별도 티켓에서 처리 권장. SUGGESTION 2건도 후속 권장 사항.

---

## 3중 검증 추가 라운드 (codex-review-guard hook 발동에 따른 확장)

`.claude/hooks/codex-review-guard.sh`가 변경 파일 중 `.claude/hooks/session-start.sh`(파일명에 "session" 포함, 본 티켓과 무관한 pre-existing modified) 때문에 **false positive로 보안 변경 분류 → 3중 검증 요구**. 정책 준수를 위해 codex review + challenge 시도.

### codex 시도 결과 (실패)

`codex:codex-rescue` agent를 2회 dispatch (review + challenge 병렬):
- 모든 모델(`gpt-5.1-codex-max`, `gpt-5.3-codex-spark`, `gpt-5-codex`) → `400 invalid_request_error: model not supported when using Codex with a ChatGPT account`
- ChatGPT 구독 계정으로는 Codex API 모델 호출 불가, API key 기반 계정 필요

`.claude/rules/code-review.md` 명시된 **Claude substitution path** (`code-reviewer + security-reviewer + critic adversarial`) 적용.

### 2차: security-reviewer (Opus)

**판정**: PASS with 2 HIGH (HIGH 모두 본 티켓에서 해결됨)

| Severity | 내용 | 옵션 A 처리 |
|----------|------|--------------|
| HIGH #1 | `DB_PATH = ':memory:'` dead code → tests hit production | ✅ DATABASE_URL guard 추가 + .env.test/vitest.config dotenv 분리 |
| HIGH #2 | SQL 백업 파일(`*.sql`, `backup-*`) `.gitignore` 미등록 | ✅ `.gitignore`에 `*.sql`, `backup-render-*`, `render-data-backup*`, `.env.test`, `.env.test.local` 등록 |
| MEDIUM 3 | pre-existing: API auth 없음 / TLS `rejectUnauthorized: false` / module-level mutable race | 후속 티켓 권장 (auth 인프라, TLS CA 설정) |
| LOW 2 | error message ID leak / transitive CVEs | 후속 티켓 권장 |

전체: `parameterized queries`(`ANY($1::text[])`) SQL injection 안전, 코드 fix `new Date().getTime()` 안전성 확인.

### 3차: critic adversarial / challenge mode

**판정 변천**: 초기 BROKEN (2 CRITICAL) → 옵션 A 적용 후 SURVIVED

| ID | Severity | 가설 | 옵션 A 처리 |
|----|----------|------|--------------|
| C1 | CRITICAL | `DB_PATH = ':memory:'` 죽은 변수, SAFETY 코멘트가 false confidence | ✅ guard로 실제 검증, dotenv envFile로 .env.test 우선 적용 |
| C2 | CRITICAL | clean env에서 항상 fail, CI 보호 illusory | ✅ vitest.config.ts가 `.env.test` 로드, 없을 때 명확한 에러로 인지 가능 |
| M1 | MAJOR | 3개 DELETE non-atomic, partial failure 시 orphan 영구 | ✅ `client.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK` transaction wrap |
| M2 | MAJOR | `activity_log.task_id ON DELETE SET NULL` orphan 누적 | ✅ tasks 삭제 전 activity_log row 명시 cleanup 추가 |
| m1 | Minor | 동일 timestamp sort stability 미테스트 | 별도 후속 권장 |
| m2 | Minor | unscoped DELETE 재추가 차단 mechanical guard 없음 (ESLint rule 등) | 별도 후속 권장 |
| m3 | Minor | services.test.ts cleanup 부재 (pre-existing) | Task #6 후속 티켓에서 처리 |

핵심: **code fix는 SURVIVED 유지** (Date 객체 + ISO string 모두 안전, PostgreSQL NOT NULL 제약으로 NaN 위험 무, JS sort stable 보장).

## 옵션 A 강화 내역 (본 티켓 내 추가 변경)

| 파일 | 변경 | 해결 항목 |
|------|------|-----------|
| `.gitignore` | `.env.test`, `*.sql`, `backup-render-*`, `render-data-backup*` 추가 | security HIGH #2 |
| `.env.test` (신규, gitignored) | 별도 Neon test branch 연결 정보 (`br-purple-fog-aoyuc8lg` / `ep-falling-glitter-aoxepm0z`) | C1/C2 해결 |
| `packages/mcp-server/vitest.config.ts` | `dotenv` import + `.env.test` 우선 로드 | C2 해결 |
| `packages/mcp-server/src/__tests__/context-service.test.ts` | (1) DB_PATH 죽은 변수 제거 (2) `PROD_COMPUTE_HOSTS` guard로 `ep-old-haze-aol2r7dt`(real prod) 차단 (3) `BEGIN/COMMIT/ROLLBACK` transaction wrap (4) `activity_log` cleanup 명시 추가 | C1/M1/M2/HIGH #1 해결 |
| `packages/mcp-server/package.json` | `dotenv` devDep 추가 | infra |

## 옵션 A 검증 (Iron Law 충족)

```
build: pnpm --filter @ai-pm/mcp-server build → exit 0
test: vitest run src/__tests__/context-service.test.ts
  ✓ injected env (1) from ../../.env.test
  ✓ 3 tests passed (16.95s)
post-test verification (mcp__Neon__run_sql):
  test branch: projects=3, epics=7, tasks=88, activity_log orphans=0
  production branch: projects=3, epics=7, tasks=88, activity_log=773 (무영향)
```

## 최종 판정 (3중 통과)

**APPROVED** — code-reviewer + security-reviewer + critic adversarial (codex unavailable, Claude substitution path 적용)

모든 CRITICAL/MAJOR 해결 완료. Code fix 자체는 1중 충분 수준이었으나 hook false positive로 3중 확장된 결과 test infrastructure 전반 강화로 이어짐. 이전 사고(20:42 KST production wipe)의 재발 차단 mechanism 4중 구축: (1) `.env.test` 격리 (2) vitest dotenv envFile (3) DATABASE_URL guard with prod compute hostname (4) scoped + transactional cleanup. 
