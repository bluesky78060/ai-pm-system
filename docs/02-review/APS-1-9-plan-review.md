# APS-1-9 플랜 리뷰 — submit_test 검증 강화

- **리뷰어**: critic (Opus), 작성자(메인 오케스트레이터)와 분리된 독립 패스
- **대상**: `docs/01-plan/APS-1-9-plan.md`, Discovery `docs/00-discovery/APS-1-9-direction.md`

## 1차 리뷰 — CHANGES_REQUESTED

critic이 코드를 직접 읽고(Explore 병행) 검증. 체크리스트 7개 중 기술검증(6)·테스트전략(7)에서 실제 결함 발견.

### CRITICAL (2)

1. **테스트 전략 비실행 가능** — 이 패키지는 DB-mock 관례가 없고 모든 테스트가 real Postgres(.env.test)에 실행. `submitTest`는 ~6 DB 호출. 플랜 v1의 "단위 테스트"는 `DATABASE_URL` 없이 throw → 실행 불가. DoD("4 케이스 통과") 도달 불가.
2. **null 미처리** — `Project.code`·`Task.epic_id`가 `string | null`. `STRICT_PROJECTS.includes(projectCode)`가 null 미처리 → tsc strict 빌드 에러(프로젝트 자체 게이트).

### MAJOR (3)

1. `status==='pass'` 정확 일치(skip 포함 비-pass 거부)를 명시 안 함 + skip 테스트 누락
2. caller-facing 안내(MCP instructions, workflow-steps.md) 미갱신 → strict 켜지면 첫 APS submit_test가 라벨 문제로 실패
3. self-verification 롤아웃 순서 미정의 → 플래그를 Render에 언제 설정하느냐에 따라 자기/타 티켓 차단 위험

### MINOR / 누락

- projectRepo 미import, ticket_code prefix 파싱 대안 미언급, coverage 게이트, case 정규화, integration 타입 처리, HTTP+MCP 양쪽 진입점, 플래그 per-call 읽기, 자기신고 한계

### 기술 검증 결과 (긍정)

- task→project code 조회는 **실제 가능** (context-service.ts:26-32가 동일 패턴, project-repo findById→code 존재)
- `status !== 'pass'` 판정은 기존 `=== 'fail'`보다 더 안전 (skip/오타 거부)
- 범위는 적절히 최소(플래그 게이트, 서비스 한정)

## 플랜 v2 수정 (1차 지적 반영)

| 1차 지적 | v2 반영 |
|---------|---------|
| CRITICAL 1 (테스트 비실행) | **순수 함수 `validateStrictResults(results, isStrict)` 추출** → DB 없이 단위 테스트 5케이스 + thin integration 1건 |
| CRITICAL 2 (null) | **null-safe 체인** 명시 (전 hop null/miss → isStrict=false), tsc strict 통과 |
| MAJOR 1 (skip) | F-004에 정확 일치·skip 거부 명시 + skip 테스트 케이스 |
| MAJOR 2 (caller docs) | **F-006 신규** (MCP instructions + workflow-steps.md 갱신) + F-005 정확 literal |
| MAJOR 3 (롤아웃) | **배포/롤아웃 순서 섹션** (UNSET 머지 → done 후 설정) |
| 누락 | case 대문자 매칭, integration pass 규칙, HTTP+MCP 양쪽 커버, projectRepo import, coverage, per-call 읽기, 자기신고 한계 모두 명시 |

## 2차(v2) 재리뷰 — ACCEPT-WITH-RESERVATIONS

- **판정: ACCEPT** (CRITICAL 0 / MAJOR 0). v1의 CRITICAL 2 + MAJOR 3 + 누락 전부 codebase 증거와 함께 닫힘 확인
- 닫힘 검증:
  - CRITICAL #1 → `validateStrictResults` 순수 함수 추출로 DB 없이 단위 테스트 (closed)
  - CRITICAL #2 → null-safe 체인 `?.`+`?? null` 전 hop, tsc strict 통과 (closed)
  - MAJOR 1/2/3 → skip 거부 명시·F-006 caller docs·롤아웃 순서 모두 closed
- **남은 MINOR 3 (구현 시 반영 — 재리뷰 불필요, critic 명시)**:
  1. F-001 "항상 대문자" 문구 정정 (auto-gen만 대문자, operator가 실제 stored code에 맞춰 설정)
  2. integration 테스트 env 복원을 `try/finally`로 leak-safe하게
  3. `isStrict=false` 폴백 경로 assertion 1개 추가
  4. `validateStrictResults` 삽입 위치를 기존 task lookup(line~109) 이후로 명시
- critic Skeptic 평: 자기신고 한계를 플랜이 정직하게 명시(과신 금지)한 것은 v2의 올바른 자세

## 최종 판정

- critic 1차: CHANGES_REQUESTED (CRITICAL 2 + MAJOR 3)
- 플랜 v2 수정 → critic 2차: **ACCEPT** (MINOR 4건 구현 시 반영)
- **메인 오케스트레이터 자체 검토**: 체크리스트 7개 통과 — 목표/범위/리스크/산출물/Discovery일치/기술검증/테스트전략 모두 충족. 구현 진행 가능.

