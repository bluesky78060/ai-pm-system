# APS-1-11 코드 리뷰 — parseStrictProjects 헬퍼 추출 (정규화 DRY)

- **검증 라운드**: 1중 (fast-track, 동작 보존 리팩터). codex-review-guard IS_CRITICAL 0
- **리뷰어**: code-reviewer(Opus), 작성자(메인)와 분리

## 검증 증거 (메인 오케스트레이터 직접 실행 — submit_test에 제출)

- `pnpm lint` → Checked 87 files, No fixes applied (0 errors)
- `pnpm --filter @ai-pm/mcp-server build` → tsc clean (exit 0)
- `pnpm --filter @ai-pm/mcp-server test` → **152 passed** (workflow-strict 15: validateStrictResults 6 + matchesStrictFlag 6 + parseStrictProjects 3)
- STRICT 모드(build+lint+unit 3종 pass) submit_test 통과 → review 전환

> 리뷰어 lane은 Bash allowlist 차단으로 검증 명령 미실행. Iron Law에 따라 실제 build/test 증거는 위 submit_test 단계에서 메인이 확보(overall: pass).

## code-reviewer — APPROVED (CRITICAL 0 / MAJOR 0 / MINOR 0 / SUGGESTION 2)

- **동작 보존 PASS (HIGH)**: `matchesStrictFlag`가 `!!code && parseStrictProjects(envValue).includes(code)`로 위임 — 추출 전 인라인 표현식과 byte-identical. `!!code &&` short-circuit 순서 유지로 null/빈 code는 여전히 배열 인덱싱 없이 false
- **MINOR 실제 해소 PASS (HIGH)**: 기존 `if (!(envValue??'').trim())`는 `","`를 truthy로 통과시켜 DB 2 hop(epic+project) 낭비 후에야 false. 신규 `if (parseStrictProjects(envValue).length === 0)`는 `","`·`" , , "`·`",,"`·공백을 빈 목록으로 정규화 → DB 0 hop. early-return과 match path가 동일 정규화 공유(divergence 위험 제거)
- **회귀 커버리지 PASS (HIGH)**: 기존 12케이스 불변 + parseStrictProjects 3케이스(정상/빈값·undefined·공백/comma-only·빈항목) 추가. comma-only 케이스가 MINOR fix를 직접 잠금
- **DRY 완결 (참조 검색 확인)**: `STRICT_SUBMIT_TEST_PROJECTS`의 유일 파서. 다른 `.split(',')`는 api-server.ts의 `ALLOWED_ORIGINS`(무관). export 확대는 테스트 목적 — 기존 matchesStrictFlag/validateStrictResults 패턴과 일관

### SUGGESTION 2건 (non-blocking, 후속 선택)

- 🔵 resolveStrict(private·DB-bound) 통합 테스트 추가 시 `STRICT_SUBMIT_TEST_PROJECTS=","`에서 repo 호출 0회 단언 — 현재 mock 하니스 부재로 범위 외
- 🔵 parseStrictProjects JSDoc에 "case 보존(매칭은 downstream case-exact)" 한 줄 명시 — export된 헬퍼 오용 예방

## 최종 판정: 승인

1중 통과 (code-reviewer APPROVED), CRITICAL/MAJOR/MINOR 0. SUGGESTION 2 non-blocking 후속. 동작 보존·MINOR 실제 해소·DRY 완결 확인. APS-1-10 리뷰의 MINOR/SUGGESTION이 본 티켓으로 종결.
