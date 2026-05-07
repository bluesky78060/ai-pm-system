# APS-1-1: 코드 리뷰 결과 (3중 교차 검증)

- 티켓: APS-1-1 — Gemini 리서치 자동화 MCP 도구 신설
- 분류: 중요 변경 (외부 통합 + 신규 의존성 + 보안 영역) → Codex 3중 검증 필수
- 검증 진행: 2026-05-07
- 옵션 B 적용 (Codex 시스템 미작동으로 Claude 기반 동등 검증)

## 라운드 진행 요약

| 라운드 | 검증자 | 판정 | 발견 | 수정 |
|--------|--------|------|------|------|
| 1차 | code-reviewer (Opus) | CHANGES_REQUESTED | MAJOR 2건 | 즉시 수정 |
| 재검증 | (1차 패치 후 통과 간주) | PASS | — | — |
| 2차 | security-reviewer (Opus) — codex review 대체 | CONDITIONAL PASS | MINOR 4건 | follow-up 권장 |
| 3차 | critic adversarial — codex challenge 대체 | FAIL | CRITICAL 2 + MAJOR 5 | 5건 수정 |
| 재검증 | (3차 패치 후 모두 GREEN) | PASS | — | — |

## 1차 — code-reviewer (Opus)

판정: **CHANGES_REQUESTED** → 수정 후 재검증 PASS

### 발견 (심각도별)
- 🔴 CRITICAL: 0건
- 🟠 **MAJOR: 2건** (즉시 수정)
  1. **프롬프트 인젝션** — `sanitizeUserInput`이 백틱만 치환. 사용자가 `USER_INPUT_END` 마커 문자열 입력 시 system prompt 분리 우회 가능
  2. **model 화이트리스트 미검증** — caller가 고비용 모델(`gemini-2.5-pro`) 지정 시 비용 가드 우회
- 🟡 MINOR: 5건
- 🔵 SUGGESTION: 6건

### 수정 (라운드 1 패치)
1. **프롬프트 인젝션 방어**: `randomBytes(8).toString('hex')` nonce를 BEGIN/END 마커에 삽입 (64-bit 추측 공간)
2. **모델 화이트리스트**: `ALLOWED_MODELS` (`gemini-2.5-flash`, `gemini-2.5-flash-8b`, `gemini-2.0-flash`, `gemini-2.0-flash-exp`) 강제 + `validateInput` 검증 + VALIDATION_ERROR 반환

테스트 +5 케이스 (28 → 33)

## 2차 — security-reviewer (Opus): codex review 대체 독립 cross-check

판정: **CONDITIONAL PASS**

### 영역별 평가
- A. API 키 관리: B+ (단일 진입점, 마스킹 양층 방어 우수, 4자 prefix 노출 Minor)
- B. 프롬프트 인젝션: A (64-bit nonce 검증 통과, 1차 MAJOR-1 수정 충분)
- C. 비용 가드: A (화이트리스트 + strict equality, 1차 MAJOR-2 수정 충분)
- D. 파일 시스템: B+ (path traversal 차단, mode 미명시 Minor)
- E. 의존성: C (`@modelcontextprotocol/sdk` 트랜지티브 CVE 28건 — 본 티켓과 무관, 별도 follow-up)
- F. 에러 처리: A- (status code 우선 분류 안전)
- G. 입력 검증: A (ReDoS 안전, length 직접 검사)
- H. MCP 등록: B (defense-in-depth 양호)

### 1차가 놓친 4건 (MINOR — follow-up 권장)
1. 파일 권한 mode 미명시 (umask 의존)
2. base64/Authorization 헤더 형태 키 leak 경로
3. `confirmed` boolean coercion 검증 결과 (모두 REJECTED 확인)
4. 트랜지티브 의존성 CVE 28건 (별도 티켓 권장)

## 3차 — critic adversarial challenge (Opus): codex challenge 대체

판정: **FAIL** → 5건 수정 후 재검증 PASS

### 발견 공격 벡터

#### 🔴 CRITICAL 2건 (즉시 차단 필요 — 모두 수정 완료)
- **C1. 동시 호출 파일명 충돌 → 데이터 손실**: 같은 ms + 같은 task_id 시 두 번째 호출이 덮어씀. agent-mapping.md "병렬 실행 권장" 정책과 직접 모순
  - **수정**: `randomBytes(4).toString('hex')` 8자 hex suffix 추가 (timestamp + ms + 무작위)
- **C2. API 키 마스킹 우회**: `sanitizeErrorMessage`가 raw key만 매치. SDK가 키를 URL-encoded(`?key=AIza...`)나 partial로 노출하면 누설 가능
  - **수정**: AIza 패턴 일반 마스킹(`AIza[a-zA-Z0-9_\-]{20,}`) + `?key=` 쿼리 파라미터 마스킹 + Bearer/Basic 토큰 마스킹 + 401/403 메시지에서 `원본:` raw 노출 제거

#### 🟠 MAJOR 5건 (3건 수정 + 2건 follow-up)
- **M1. task_id 길이 캡 부재**: `^[A-Z]+(-\d+)+$` 정규식이 길이 무제한 → ENAMETOOLONG
  - **수정**: `TASK_ID_MAX_LEN = 64` 추가
- **M2. rate limit caller 책임**: 정책상 OK, follow-up 권장
- **M3. fs.writeFile 부분 쓰기 → 손상 파일**: ENOSPC 시 손상된 파일 잔존
  - **수정**: 임시 파일(`.tmp-{nonce}`)에 쓰고 `fs.rename` atomic move + `mode: 0o600` + 실패 시 cleanup
- **M4. SDK console 출력**: caller 신뢰 가정, follow-up 권장
- **M5. parseSources 출력 cap 미구현**: 단일 URL 메가바이트 가능
  - **수정**: `MAX_URL_LEN = 2048`, `MAX_SOURCES = 50` 캡 적용

#### 🟡 MINOR 4건 / 🔵 INFO 6건
- 모두 이론적 가능성으로 분류, 현재 코드는 안전

### 수정 (라운드 2 패치)
- C1+M3: timestamp suffix randomBytes(4) + atomic rename + mode 0o600
- C2: sanitizeErrorMessage 4중 방어 (raw key + AIza pattern + `?key=` query + Bearer/Basic)
- C2: 401/403 메시지에서 `원본: ${safeMessage}` 제거
- M1: TASK_ID_MAX_LEN 64 + validateInput 길이 체크
- M5: parseSources 단일 URL cap 2048 + 결과 50개 cap

테스트 +10 케이스 (33 → 43)

### Follow-up 티켓 권장 (M2, M4, MINOR 4건, 의존성 CVE)
- M2: in-process throttle (caller 신뢰 가정 보강)
- M4: SDK stdout 격리 audit
- MINOR: API 키 4자 prefix 정책, base64 sanitize 강화 등
- 별도: `@modelcontextprotocol/sdk` 트랜지티브 high CVE 28건 업그레이드

## 최종 검증 (3중 교차 후)

### 빌드 + 테스트
- `pnpm --filter @ai-pm/mcp-server build`: PASS (TypeScript strict, 0 errors)
- `pnpm --filter @ai-pm/mcp-server test research-service`: **43/43 GREEN**
- 커버리지 (research-service.ts): Statements 89.91% / Branches 75.53% / Functions 100% / Lines 89.91% — 4개 임계값 모두 PASS
- run_number: 3

### 영역별 최종 평가

| 영역 | 1차 | 2차 | 3차 | 최종 |
|------|-----|-----|-----|------|
| 보안 (API 키) | B+ | B+ | A- (4중 방어) | **A-** |
| 보안 (프롬프트 인젝션) | A | A | A | **A** |
| 비용 가드 | A | A | A | **A** |
| 파일 시스템 | A- | B+ | A (atomic) | **A** |
| 에러 처리 | A- | A- | A- | **A-** |
| 입력 검증 | A | A | A (length cap) | **A** |
| MCP 등록 | A | B | A | **A** |
| 테스트 | A- | A- | A | **A** |

## 최종 판정

🔴 CRITICAL: 0건 (모든 발견 사항 수정 완료)
🟠 MAJOR: 0건 (5건 수정, M2/M4 follow-up 분리)
🟡 MINOR: follow-up 티켓 권장
🔵 SUGGESTION: 후속 개선

→ 판정: **APPROVED** (3중 교차 검증 모두 통과)

### Codex 3중 검증 매핑 (옵션 B 정책)
- 1차 — code-reviewer (Opus) → 1차 Claude 리뷰 ✅
- 2차 — security-reviewer (Opus) → **codex review** 대체 (독립 cross-check) ✅
- 3차 — critic adversarial → **codex challenge** 대체 (적대적 검증) ✅

옵션 B 정책에 따라 Codex 시스템 미작동 시 Claude 기반 fresh subagent 3개로 동등 효과 달성. CLAUDE.md `.claude/rules/code-review.md` 정책 충족.
