# APS-1-18 Discovery — 서비스 계층 에러 메시지의 내부 UUID 노출

**티켓**: APS-1-18 (P1, 4→1 상향) / **에픽**: MCP 서버 Core / **작성**: 2026-08-24
**분류**: REST 응답에 내부 식별자 노출 → **2중 검증** (code-reviewer + codex)
**Discovery 방식**: 자동 채움. 수정 방향이 **이미 저장소 안에 확립된 패턴**이라 대안이 갈리지 않는다.
판단이 필요한 지점은 `index.ts` 4곳 하나이며 §3에서 범위로 다룬다.

## 1. 목표 (Why)

`api-server.ts:118-128`의 `wrapAsync`가 내부 에러 메시지를 **무여과로 REST 응답에 넣는다**:

```ts
const msg = error instanceof Error ? error.message : String(error);
res.status(getErrorStatus(msg)).json({ error: msg });
```

따라서 서비스 계층이 던진 문자열이 곧 REST 응답 본문이다.
그 경로로 **호출자가 준 적 없는 내부 UUID가 두 곳에서 나간다.**

### 대상 1 — `services/task-service.ts:328`

```ts
const task = await resolveTask(taskIdOrCode);
const taskId = task.id;              // ← ticket_code를 넘겨도 UUID로 변환됨
const dep = await resolveTask(dependsOnIdOrCode);
const dependsOnId = dep.id;
if (await taskRepo.hasCircularDependency(taskId, dependsOnId)) {
  throw new Error(`순환 의존성이 감지되었습니다: ${taskId} → ${dependsOnId}`);
}
```

`resolveTask`는 `UUID_REGEX` 검사 후 `findById` 또는 `findByTicketCode`로 푼다(`:14-26`).
즉 호출자가 `APS-1-3`을 넘겼어도 **응답에는 UUID가 나간다.**

**같은 함수의 성공 경로는 이미 올바르다** — `:340`이
`` return { message: `의존성 추가: '${task.title}' → '${dep.title}'` } `` 로 **title을 쓴다.**
즉 이 함수 안에서 성공 경로와 에러 경로의 기준이 어긋나 있다.

도달 경로: `POST /api/tasks/:id/dependencies` (`api-server.ts:270-275`)

### 대상 2 — `services/workflow-service.ts:165`

```ts
throw new Error(`작업 시작 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
```

`ticket_code`는 **nullable이다** — 스키마 `migrate.ts:50` `ticket_code TEXT`,
타입 `entities.ts:55` `ticket_code: string | null`. 따라서 `?? found.id` 분기가 실제로 발동한다.

추가로 중첩된 `${(e as Error).message}`가 하위 예외 원문을 그대로 달고 나온다.

**바로 위 12줄(`:152-153`)에서 같은 파일이 올바른 패턴을 쓰고 있다**:
```ts
console.error(`[WorkflowService] Task not found: ${taskId}`);
throw new Error('태스크를 찾을 수 없습니다');
```

도달 경로: `POST /api/workflow/:taskId` (`api-server.ts:439-446`)

## 2. 사용자 (Who)

- **REST API 소비자** — 현재는 web-ui와 `remote-client.ts`. `app.use('/api', apiKeyAuth)`로
  인증 뒤에 있으나, 인증은 **옵트인**이다(`auth.ts:5-11`, `API_KEY` 미설정 시 통과)
- MCP 도구 호출자(AI 에이전트) — `index.ts` 경로

## 3. 범위 (What)

### 포함 — `task-service.ts` 1곳 + `workflow-service.ts` **8곳**

> ⚠️ **초판 정정 (critic CRITICAL-1)**: 초판은 `workflow-service.ts:165` **1곳만**을 대상으로
> 적었고 "전수 확인"이라고 주장했다. **거짓이었다.** 초판의 grep이 이미 알던 리터럴
> (`순환 의존성`, `작업 시작 실패`)만 검색했기 때문이다. 결함 **패턴**으로 다시 검색하니
> `ticket_code ?? …id`가 **8곳**이었다(`:165, 246, 279, 296, 309, 375, 489, 575`).
> 초판대로 진행하면 노출 표면의 **87.5%가 그대로 남는다.**

`task-service.ts:328`과 `workflow-service.ts`의 8곳을 **저장소에 이미 확립된 패턴**으로 정렬한다:
`console.error`로 서버 로그에 전체 식별자를 남기고, throw 메시지는 사람이 준 식별자(ticket_code)
또는 title만 쓰거나 아예 생략한다.

확립된 패턴의 근거:
- `api-server.ts` 6곳 (`:146, 221, 258, 282, 330, 342`)
- `task-service.ts:22-23` `resolveTask`
- `workflow-service.ts:152-153` — 고쳐야 할 `:165`의 바로 위

### 판단 대상 — `index.ts` 4곳
`:835, 899, 1015, 1043` 은 전부 `${args?.project_id}` / `${args?.task_id}` / `${taskId}`,
즉 **호출자가 방금 보낸 값을 되돌려주는 것**이다(문맥 확인 완료).

정보 유출로 보기 어렵고, 오타 난 ID를 즉시 알아채는 진단 가치가 있다.
**'변경 없음'도 유효한 결론**이며, 그렇게 결론 내리면 근거를 문서로 남긴다.

### 제외
- **`wrapAsync` 구조적 방어** → `APS-1-31`. 개별 문자열을 고쳐도 새 throw가 추가되면 재발하므로
  근본 해법이지만, 에러 분류 체계 도입은 범위가 훨씬 크다
- `api-server.ts:571` `${eventType}` → 식별자가 아니라 이벤트 타입명. **대상 아님** (`APS-1-30`)
- `console.error(...${id})` 30여 건 → 서버 로그이므로 정상. 손대지 않는다

## 4. 제약

- **STRICT 모드**: `submit_test`에 build + lint + unit 세 타입 모두 `pass` 필요
- **테스트가 flaky하다** (`APS-1-19`). 실패 시 `idx_projects_code` duplicate key 패턴인지 대조
- **기존 테스트가 에러 문자열을 검증하고 있을 수 있다.** 메시지를 바꾸면 깨진다 → 선행 확인 필요
- 순환 의존성 경로에 테스트가 없을 수 있다 → 있으면 갱신, 없으면 신설 검토

## 5. 우선순위

1. **P1** `task-service.ts:328` — 호출자가 준 적 없는 UUID가 나가는 두 곳 중 하나
2. **P1** `workflow-service.ts:165` — 같은 성격 + 중첩 예외 원문 노출
3. **P4** `index.ts` 4곳 — 판단 후 문서화 (변경 없을 수 있음)

## 6. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| 기존 테스트가 에러 문자열을 assert하고 있어 깨짐 | 중간 | 구현 전 `grep`으로 전수 확인 |
| 진단 정보가 줄어 디버깅이 어려워짐 | 중간 | `console.error`로 전체 식별자를 **서버 로그에 반드시 남긴다**. 정보를 없애는 게 아니라 옮기는 것 |
| 순환 의존성 케이스에 테스트가 없어 회귀를 못 잡음 | 중간 | 테스트 존재 여부 확인 후 없으면 추가 |
| 메시지 변경이 web-ui의 문자열 매칭을 깨뜨림 | 낮음 | web-ui에서 해당 문자열 사용 여부 확인 (0건 확인됨) |
| **자리표시자 문구가 `getErrorStatus` 키워드를 포함해 상태 코드를 오염** | **높음** | 초판의 `'식별자 없음'`이 `'없'` 때문에 404를 냈다(critic CRITICAL-2). 후보를 전부 키워드 대조 후 채택 |
| **`title`이 사용자 자유 입력이라 다른 종류의 노출이 될 수 있음** | 중간 | 성공 경로(`:340`)가 이미 title을 노출 중이므로 새 노출 클래스는 아님. 플랜 D3에 트레이드오프 명시 |
| **`ticket_code`가 null이 되는 실제 경로 미조사** | 중간 | `POST /api/tasks`가 epic_id를 강제하지 않아 REST로 만든 태스크는 null. 플랜 M3 참조 |
| `getErrorStatus(msg)`가 메시지 문자열로 HTTP 상태를 정한다 | **높음** | `api-server.ts`의 `getErrorStatus`는 메시지 내용으로 400/404를 가른다. 메시지를 바꾸면 **상태 코드가 바뀔 수 있다.** 구현 전 반드시 확인 |

## 7. 검증

- 변경한 두 경로가 **실제로 UUID를 내보내지 않음**을 확인 (문자열 검사, 실행 기반)
- `getErrorStatus` 매핑이 바뀌지 않았음을 확인
- `pnpm -r build` / `pnpm -r lint` / `pnpm -r test` 회귀 없음
- 2중 검증: code-reviewer + codex 독립 diff 리뷰

## 방향 확정

수정 방향이 저장소에 이미 확립돼 있어 대안이 갈리지 않는다. 사용자 결정 필요 항목 없음.
`index.ts` 4곳의 판단은 구현 중 근거와 함께 결론 내고 문서로 남긴다.
