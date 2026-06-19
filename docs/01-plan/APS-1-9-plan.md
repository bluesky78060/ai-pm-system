# APS-1-9 Plan v2 — submit_test 검증 강화

> Discovery: `docs/00-discovery/APS-1-9-direction.md`
> v2: critic 플랜 리뷰(docs/02-review/APS-1-9-plan-review.md) CRITICAL 2 + MAJOR 3 + 누락 반영

## 기능 명세

| ID | 기능 | 우선순위 | 비고 |
|----|------|---------|------|
| F-001 | 환경변수 `STRICT_SUBMIT_TEST_PROJECTS` 파싱 (콤마구분, **대문자 정확 매칭**) | P0 | `.split(',').map(trim).filter(Boolean)`. 코드는 항상 대문자(code-gen.ts) |
| F-002 | task_id → project code **null-safe** 조회 후 플래그 매칭 | P0 | 모든 hop null/miss → `isStrict=false` 폴백 |
| F-003 | strict 시 필수 타입 `build`+`lint`+`unit` 모두 존재 | P0 | typecheck=build 내포. test=`unit` |
| F-004 | strict 시 모든 항목 `status==='pass'` (정확 일치, **skip 포함 비-pass 거부**) | P0 | enum 런타임 미강제 → 서비스에서 직접 판정 |
| F-005 | 거부 에러 메시지에 **정확한 필수 literal(`build`,`lint`,`unit`)** + 누락/fail 항목 명시 | P1 | |
| F-006 | caller-facing 안내 갱신 (MCP `instructions` 문자열, `workflow-steps.md`) | P1 | strict 요구사항 사전 고지 |

## 핵심 설계 — 순수 함수 추출 (critic CRITICAL #1 대응)

이 패키지는 **DB-mock 관례가 없고** 모든 테스트가 real Postgres(.env.test)에 실행됨(services.test.ts, connection.ts:13-17은 DATABASE_URL 없으면 throw). 따라서 strict 검증 로직을 **DB 비의존 순수 함수**로 분리:

```ts
// workflow-service.ts (또는 별도 util)
export function validateStrictResults(
  results: TestResult[],
  isStrict: boolean,
): void {
  if (!isStrict) return; // 비-strict: 추가 검증 없음 (기존 동작)
  const REQUIRED = ['build', 'lint', 'unit'] as const;
  const present = new Set(results.map((r) => r.test_type));
  const missing = REQUIRED.filter((t) => !present.has(t));
  if (missing.length) {
    throw new Error(`STRICT: 필수 검증 타입 누락: ${missing.join(', ')} (build·lint·unit 모두 제출 필요)`);
  }
  const notPassed = results.filter((r) => r.status !== 'pass');
  if (notPassed.length) {
    throw new Error(
      `STRICT: 통과하지 않은 검증: ${notPassed.map((r) => `${r.test_type}(${r.status})`).join(', ')}`,
    );
  }
}
```

- **순수 함수**라 DB 없이 단위 테스트 가능 (4+ 케이스). DB 조회 경로(task→project)는 별도 thin integration 1건으로만 커버.
- `isStrict` 산정은 submitTest 내부에서 수행 후 이 함수에 주입.

## 구현 위치 / 로드맵

### Phase 1 — 플래그 + null-safe 프로젝트 조회 (F-001, F-002)
- `workflow-service.ts` 상단: `import { ProjectRepository } from '../db/repositories/project-repo.js'` 추가(현재 미import), 필드 인스턴스화 (context-service.ts:2,6 패턴 미러)
- 플래그는 **`submitTest` 호출 시점에 `process.env` 읽기**(모듈 로드 시 X) — 테스트의 env 조작이 반영되도록
- null-safe 조회 (critic CRITICAL #2):
  ```ts
  const task = await taskService.getById(taskId);          // 기존 조회 재사용
  const epicId = task?.epic_id ?? null;
  let code: string | null = null;
  if (epicId) {
    const epic = await epicRepo.findById(epicId);
    if (epic?.project_id) code = (await projectRepo.findById(epic.project_id))?.code ?? null;
  }
  const strictProjects = (process.env.STRICT_SUBMIT_TEST_PROJECTS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const isStrict = !!code && strictProjects.includes(code);
  ```
- 어느 hop이든 null/miss → `isStrict=false` (설계된 폴백, 우연 아님)

### Phase 2 — 강화 검증 가드 (F-003, F-004, F-005)
- 기존 가드(빈 배열, build 존재, output 10자)는 **모든 경우 유지**
- 그 뒤에 `validateStrictResults(results, isStrict)` 호출
- 추가 제출 타입(`integration` 등)도 strict 시 pass 규칙 적용됨(REQUIRED 외도 `status!=='pass'`면 거부) — 의도된 동작, 테스트로 명시
- **두 진입점 모두 커버**: MCP(index.ts) + HTTP(api-server.ts:446) 둘 다 `submitTest` 서비스 경유 → 서비스에 넣으면 양쪽 적용 (강점)

### Phase 3 — 테스트 (critic CRITICAL #1 해소)
- **순수 함수 단위 테스트** (DB 불요, 새 파일 또는 기존 __tests__):
  - strict + build/lint/unit 모두 pass → 통과(throw 없음)
  - strict + lint 누락 → throw (메시지에 `lint`)
  - strict + unit status=`fail` → throw
  - strict + integration status=`skip` → throw (skip 거부 확인)
  - `isStrict=false` → 어떤 입력이든 통과 (기존 동작)
- **thin integration 1건** (real DB, beforeAll에서 project(code 지정)+epic+task seed, `process.env.STRICT_SUBMIT_TEST_PROJECTS` 설정/복원): taskId→code 조회 후 strict 적용 경로 1회 확인. 기존 services.test.ts 컨벤션(seed+cleanup) 따름
- coverage 게이트(vitest.config.ts lines 80/branches 70): strict 브랜치를 순수함수 테스트가 커버 → 임계 충족

## 배포/롤아웃 순서 (critic MAJOR #3)

공유 Render 서버 env 변경이므로 **자기 차단·타 티켓 영향 방지**:
1. 코드 머지/배포 시 `STRICT_SUBMIT_TEST_PROJECTS` **UNSET** (모든 프로젝트 기존 동작)
2. 이 티켓(APS-1-9) `done` + 검증 완료 **이후에만** Render에 `STRICT_SUBMIT_TEST_PROJECTS=APS` 설정
3. → 이 티켓 자체 submit_test는 비-strict로 통과, 진행 중 타 APS 티켓도 영향 없음

## Discovery 결과 반영

- 플래그 점진(제약#4) → F-001/F-002 + 롤아웃 순서
- pass 판정(목표) → F-004 (skip 포함 비-pass 거부 명시)
- 4종 필수, typecheck=build(범위#3) → F-003
- 조회 실패 폴백(리스크) → F-002 null-safe 전 hop

## 예외 처리

- task/epic/project 조회 실패·null → 비-strict 폴백 (워크플로우 막지 않음)
- 환경변수 미설정 → strictProjects 빈 배열 → 전 프로젝트 비-strict
- case 불일치(소문자 입력) → 매칭 실패 = 비-strict. **대문자 정확 매칭** 문서화

## 한계 (정직한 명시 — critic Skeptic)

- self-reported `status`/`output`은 실제 실행을 증명하지 못함. 본 강화는 **구조**(4종 존재 + 전 pass 라벨)를 강제하나 output이 진짜 실행 결과인지는 검증 불가 — 자기신고의 본질적 한계. 게이트를 과신하지 말 것. (해소는 범위 외)

## DoD

- 순수함수 단위 테스트 5케이스 + thin integration 1건 통과
- pnpm lint 0, tsc build 성공(null-safe로 strict 빌드 통과), vitest 전체 + coverage 게이트 통과
- 하위호환: 플래그 미설정 시 기존 submit_test 동작 불변
- F-006: MCP instructions + workflow-steps.md에 strict 요구 고지

## 신참 엔지니어 가이드

- TestResult: `{ test_type, status, output?, failures?, duration_ms? }` (workflow-service.ts:11-17)
- `TestType` enum: `unit|type|lint|integration|build` (entities.ts:11). test=`unit`.
- `Project.code: string|null`, `Task.epic_id: string|null` (entities.ts) → null 처리 필수
- task→epic→project 패턴 참고: context-service.ts:26-32, project-repo.ts findById→code
- DRY: REQUIRED·플래그 파싱 상수화. YAGNI: 'type' 별도 요구 안 함. TDD: 순수함수 테스트 먼저.
