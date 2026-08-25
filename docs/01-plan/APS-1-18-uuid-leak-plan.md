# APS-1-18 구현 플랜 — 서비스 계층 내부 UUID 노출 정리 (rev.4)

**티켓**: APS-1-18 (P1) / **Discovery**: `docs/00-discovery/APS-1-18-direction.md`
**분류**: REST 응답에 내부 식별자 노출 → **2중 검증**
**이력**: rev.1 (REJECT, CRITICAL 2) → rev.2 (FAIL, 신규 MAJOR 1) → rev.3 (FAIL, 기계적) → **rev.4** — 전부 2026-08-24

## rev.2가 왜 반려됐는가 — 안전장치 자체가 검증 불가능했다

rev.2는 CRITICAL 2건을 실제로 고쳤다(리뷰어 확인). 그러나 **그 재발을 막으려고 만든
안전장치(D5 테스트, V7 변이 검증)가 스스로 실행 불가능**했다.

```
$ grep -c "^export " packages/mcp-server/src/api-server.ts
0
$ grep -n "^function getErrorStatus" packages/mcp-server/src/api-server.ts
102:function getErrorStatus(msg: string): number {
```

`api-server.ts`는 **export 문이 0개**인 Express 부트스트랩 스크립트다.
`getErrorStatus`를 테스트에서 import할 수 없다. 그러면 실행자는 둘 중 하나를 하게 되는데
rev.2는 어느 쪽도 지정하지 않았다:

| 선택 | 결과 |
|---|---|
| 테스트에 키워드 목록을 **재구현** | 진짜 함수가 아니라 **자기 사본**을 검사한다. `api-server.ts`가 바뀌어도 테스트는 모른다 — **"검증했다고 주장했지만 실제로는 검증 안 됨"** 패턴 |
| Express 앱을 띄워 HTTP 레벨 검증 | DB가 필요해져 D5가 명시한 "DB 불필요·flaky 회피" 목표와 충돌하고 `APS-1-19`에 재노출 |

즉 "V7이 핵심이다... 그 테스트가 실제로 결함을 잡는 것을 보인다"는 rev.2의 주장이
현재 명세로는 **자기 완결적으로만 참**이었다.

## rev.1이 왜 반려됐는가

두 CRITICAL 모두 **이 프로젝트가 반복 지적한 실패 유형과 정확히 같은 것**이었다.
직접 재현해 확정했다.

### CRITICAL-1 — "전수 확인" 주장이 거짓. 8곳 중 1곳만 다뤘다

rev.1의 M2 grep은 `"순환 의존성\|작업 시작 실패"`였다.
**이미 고치기로 정한 두 리터럴만 검색했다.** 결함 **패턴**을 검색하지 않았다.

패턴 기반으로 다시 돌린 결과 (`grep -rnE "ticket_code \?\? [a-zA-Z]+\.id"`):

| 파일:행 | 함수 |
|---|---|
| workflow-service.ts:165 | `startWork` ← rev.1이 다룬 유일한 곳 |
| workflow-service.ts:246 | `submitTest` |
| workflow-service.ts:279 | `submitTest` |
| workflow-service.ts:296 | `submitTest` |
| workflow-service.ts:309 | `submitTest` |
| workflow-service.ts:375 | `completeFix` |
| workflow-service.ts:489 | `approveReview` |
| workflow-service.ts:575 | `requestChanges` |

**8곳 전부 `POST /api/workflow/:taskId`를 통해 `wrapAsync`로 REST 응답에 나간다.**
rev.1대로 구현하고 done 처리하면 **노출 표면의 87.5%가 그대로 남는다.**

> 아는 것만 재확인하고 모르는 것을 놓친 것이다.
> **부재/완전성을 주장할 때는 리터럴이 아니라 패턴으로 검색해야 한다.**

### CRITICAL-2 — 대체 리터럴이 스스로 상태 코드를 오염시켰다

rev.1은 `found.ticket_code ?? found.id`를 `?? '식별자 없음'`으로 바꾸려 했다.
그런데 `'식별자 없음'`에 **`없`이 들어 있다.** `getErrorStatus`는 `'없'`을 보면 404를 낸다.

실측 (`잘못된 상태 전환: todo → testing...`을 내부 예외로):

| 메시지 | 상태 |
|---|---|
| `작업 시작 실패 (a1b2c3d4-uuid): {inner}` (현재) | **400** |
| `작업 시작 실패 (식별자 없음): {inner}` (rev.1 대체안) | **404** ← 오염 |

**상태 코드를 지키겠다고 명시한 티켓의 수정이 바로 그 불변식을 깼다.**
게다가 rev.1의 M1 표와 V2 절차는 `ticket_code`가 **non-null인 예시만** 써서
이 회귀를 구조적으로 잡지 못했다.

## 사전 측정 (rev.2, 전부 실행 확인)

### M1. `getErrorStatus`는 메시지 문자열로 HTTP 상태를 정한다

키워드: `'not found'`/`'없'`→404, `'circular'`/`'already'`/`'duplicate'`→409,
`'invalid'`/`'must'`/`'required'`/`'cannot'`→422, 그 외 400.

**자리표시자 후보 검사** (내부 예외 = 실제 원문 `잘못된 상태 전환: ...`, `task-service.ts:156-158`에서 복사):

| 후보 | 키워드 충돌 | 상태 |
|---|---|---|
| `식별자 없음` | **`없`** | 404 ✗ |
| **`미상`** | 없음 | **400 ✓** |
| `unknown` | 없음 | 400 ✓ |
| `미발급` | 없음 | 400 ✓ |

→ **`미상`을 채택한다.**

### M2. `ticket_code = null` 조합에서 상태 코드가 보존되는가 (rev.1 누락 항목)

내부 예외 원문 3종 × 자리표시자:

| 내부 예외 (실제 원문) | 현재 (`?? found.id`) | `?? '미상'` |
|---|---|---|
| `잘못된 상태 전환: todo → testing. 가능한 전환: ...` (`task-service.ts:157`) | 400 | **400** ✓ |
| `testing → review 전환은 smart_workflow를 통해서만...` (`task-service.ts:172`) | 400 | **400** ✓ |
| `태스크를 찾을 수 없습니다` (`task-service.ts:23`) | 404 | **404** ✓ |

**세 경로 모두 보존.**

### M3. `ticket_code`는 왜/언제 null이 되는가 (rev.1 누락)

타입이 nullable인 것만 알고 **발생 경로를 조사하지 않았다.** 확인 결과:
`POST /api/tasks`(`api-server.ts:203-204`)가 `req.body`를 그대로 `taskService.create`에 넘기며
`epic_id`를 강제하지 않는다. `task-repo.ts`의 `create()`는 `epic_id`가 없으면
`ticket_code`를 null로 남긴다. epic-id-guard hook은 **MCP `create_task` 도구 전용**이고
REST 경로에는 적용되지 않는다.

→ **REST로 만든 epic 없는 태스크는 영구히 `ticket_code = null`이다.** 이론적 케이스가 아니다.

### M4. 이 문자열에 의존하는 코드

`grep -rn "상태 전환 실패\|작업 시작 실패\|순환 의존성" packages` → 소스 본체뿐.
테스트 assert 0건, `packages/web-ui/src` 참조 0건. 문자열 변경은 안전하다.

### M5. `hasCircularDependency` / `addDependency` 테스트가 **전무하다** (rev.1 누락)

> ⚠️ **rev.4 정정 (critic 3차 MAJOR)**: rev.1~rev.3이 이 항목에서 "추가한다"고 적었으나
> **D5의 3개 항목이 전부 `workflowFailure`/`getErrorStatus` 대상이어서 실제로는 세 번 모두
> 이행되지 않았다.** 약속과 산출물이 어긋난 상태였다.
> rev.4에서 **D5에 4번째 항목을 신설**해 실제로 이행한다.

`grep -rn "hasCircularDependency\|addDependency" packages/mcp-server/src/__tests__/` → 0건.
Discovery §6이 "테스트 존재 여부 확인 후 없으면 추가"를 완화책으로 요구했으나
rev.1의 구현 단계에 그 항목이 없었다. rev.2에서 추가한다.

### M6. 부수 발견 — `getErrorStatus`의 `'circular'` 매핑은 죽은 코드

409 매핑이 영어 `'circular'`만 보는데 실제 메시지는 한국어 `순환 의존성`이다.
순환 의존성 오류가 409가 아니라 400으로 나간다. **범위 밖** (§범위 밖).

## 설계 결정

### D0. `getErrorStatus`를 별도 모듈로 추출한다 (rev.2 MAJOR)

테스트가 **실제 프로덕션 함수**를 검증하려면 import가 가능해야 한다.
`api-server.ts`에 `export`만 붙이는 것보다 순수 함수를 모듈로 빼는 것이 깨끗하다.

**신규** `packages/mcp-server/src/utils/error-status.ts`:
```ts
/**
 * 에러 메시지 문자열로 HTTP 상태 코드를 정한다. api-server.ts의 wrapAsync가 사용한다.
 *
 * APS-1-18: 이 함수가 **메시지 내용**으로 상태를 가르기 때문에, 에러 문구를 바꾸면
 * API 계약이 바뀐다. 서비스 계층의 에러 문구나 자리표시자를 수정할 때는 반드시
 * 아래 키워드 목록을 먼저 확인할 것. (rev.1에서 자리표시자에 '없'이 들어가
 * 400이어야 할 오류가 404가 된 사고가 있었다.)
 */
export function getErrorStatus(msg: string): number { /* 기존 로직 그대로 이동 */ }
```

`api-server.ts`는 이를 import해 쓴다. **로직은 한 글자도 바꾸지 않는다** —
순수 이동이므로 V3에서 이동 전/후 출력이 동일함을 대조한다.

### D1. 8곳을 헬퍼로 일원화한다 (개별 수정 8회가 아니라)

같은 형태가 8곳이므로 인라인 수정 8회는 다음 사람이 또 한 곳을 놓치게 만든다.
`getErrorStatus` 제약을 **한 곳에서만** 설명하면 되도록 헬퍼를 만든다.

`workflow-service.ts` 파일 상단:

```ts
/**
 * APS-1-18: 워크플로 전환 실패 에러를 만든다.
 *
 * 내부 UUID를 응답에 담지 않는다 — api-server.ts:118-128의 wrapAsync가 이 메시지를
 * 그대로 REST 응답 본문에 넣기 때문이다. 전체 식별자는 서버 로그에만 남긴다.
 *
 * 자리표시자가 '미상'인 이유: api-server.ts의 getErrorStatus가 메시지 문자열로
 * HTTP 상태를 정하며 '없'이 들어가면 404가 된다. '식별자 없음' 같은 문구를 쓰면
 * 400이어야 할 상태 전환 오류가 404로 둔갑한다(APS-1-18 rev.1의 실제 결함).
 * 이 문구를 바꿀 때는 getErrorStatus의 키워드 목록을 먼저 확인할 것.
 */
export function workflowFailure(
	action: string,
	task: { id: string; ticket_code: string | null },
	e: unknown,
): never {
	const detail = (e as Error).message;
	console.error(`[WorkflowService] ${action} failed for ${task.id}: ${detail}`);
	throw new Error(`${action} 실패 (${task.ticket_code ?? '미상'}): ${detail}`);
}
```

### D1-a. 반환이 아니라 `never`로 직접 던진다 (rev.2 MINOR)

rev.2는 `Error`를 **반환**해 호출부가 `throw workflowFailure(...)`로 감싸게 했다.
그러면 함수 시그니처가 "값을 만드는 순수 함수"처럼 보이는데 내부에 `console.error`
side effect가 숨는다. 누군가 `workflowFailure(...)`만 쓰고 `throw`를 빠뜨리면
**로그는 찍히는데 예외는 안 던져지는 조용한 버그**가 생기고 TS가 잡아주지 않는다.

`: never`로 선언하고 내부에서 던지면 **"항상 던진다"는 계약이 타입 시스템에 강제**되고
호출부 뒤 코드가 unreachable로 인식된다. `export`도 붙여 테스트에서 import 가능하게 한다.

**8곳의 `action` 인자 전수** (원본에서 복사, `실패` 접미사는 헬퍼가 붙인다):

| 행 | 함수 | `action` 인자 | 대상 변수 |
|---|---|---|---|
| :165 | `startWork` | `'작업 시작'` | `found` |
| :246 | `submitTest` | `'testing 상태 전환'` | `task` |
| :279 | `submitTest` | `'review 상태 전환'` | `task` |
| :296 | `submitTest` | `'fixing 상태 전환'` | `task` |
| :309 | `submitTest` | `'blocked 상태 전환'` | `task` |
| :375 | `completeFix` | `'testing 상태 전환'` | `found` |
| :489 | `approveReview` | `'done 상태 전환'` | `found` |
| :575 | `requestChanges` | `'in_progress 상태 전환'` | `found` |

(`testing 상태 전환`이 `:246`·`:375` 두 곳에 있다 — 문자열이 같아도 서로 다른 함수다.)

교체 형태:
```diff
-throw new Error(`작업 시작 실패 (${found.ticket_code ?? found.id}): ${(e as Error).message}`);
+workflowFailure('작업 시작', found, e);
```

**`throw` 키워드가 없다** — 헬퍼가 `never`를 반환하며 직접 던진다. D1-a 참조.

메시지 형식(`{action} 실패 ({식별자}): {detail}`)은 **그대로 유지**되므로
`ticket_code`가 non-null인 경우 출력이 바이트 단위로 동일하다.

### D2. 중첩 예외 원문은 유지한다 (rev.1 결정 유지, 근거 보강)

제거하면 더 깨끗하지만 M2 실측대로 `태스크를 찾을 수 없습니다` 경로의 404가 400으로 바뀐다.
이 티켓은 "식별자 노출 정리"이고 **HTTP 상태 코드 변경은 범위가 아니다.**
중첩 원문 제거는 `APS-1-31`(에러 분류 체계)의 몫이다.

리뷰어 지적("`:165`에서 내부 예외가 실제로 '찾을 수 없습니다'가 되는 경로는 경합뿐인데
404 보존의 실익이 있는가")은 타당하다. 그러나 **8곳 중 다른 곳들은 사정이 다르고**
(예: `:489` `approveReview`는 `found` 재조회 시점이 더 멀다), 한 티켓에서
식별자 정리와 상태 코드 재설계를 동시에 하면 회귀 원인 추적이 어려워진다.

### D3. `task-service.ts:328` — title 사용, 트레이드오프 인정

```diff
 		if (await taskRepo.hasCircularDependency(taskId, dependsOnId)) {
-			throw new Error(`순환 의존성이 감지되었습니다: ${taskId} → ${dependsOnId}`);
+			// APS-1-18: 내부 UUID는 서버 로그로. 응답은 성공 경로(:340)와 같은 기준(title)을 쓴다.
+			console.error(`[TaskService] Circular dependency: ${taskId} -> ${dependsOnId}`);
+			throw new Error(`순환 의존성이 감지되었습니다: '${task.title}' → '${dep.title}'`);
 		}
```

`title`은 `NOT NULL`이다 (`migrate.ts:36` 확인). 상태 코드 400 유지 (M1).

**트레이드오프를 명시한다** (rev.1은 "유일한 트레이드오프는 D2"라고 잘못 적었다):
`title`은 사용자 자유 입력이므로 고객명·내부 URL·시스템명을 담을 수 있다.
UUID를 지우고 title을 넣는 것은 **다른 종류의 노출로 바꾸는 것**이기도 하다.

**그럼에도 채택하는 근거**: 같은 함수의 성공 경로(`:340`)가 **이미** title을
`POST /api/tasks/:id/dependencies` 응답으로 내보내고 있다. 즉 새 노출 클래스를
만드는 것이 아니라 기존 관행을 에러 경로로 확장하는 것이다.
title 자체의 민감도는 별개 주제이며 이 티켓이 판단할 범위가 아니다.

### D4. `index.ts` 4곳 — **변경 없음**

`:835, 899, 1015, 1043`은 전부 `${args?.project_id}` / `${args?.task_id}` / `${taskId}`,
즉 호출자가 방금 보낸 값을 되돌려주는 것이다. 유출로 보기 어렵고 오타 진단 가치가 있다.
근거를 리뷰 문서에 남긴다 (`APS-1-29`의 목표는 "무조건 마스킹이 아니라 판단"이었다).

### D5. 회귀 테스트 신설 (rev.1 누락, Discovery 요구사항)

수동 일회성 확인은 회귀를 막지 못한다. **불변식 자체를 테스트로 고정한다.**
DB가 필요 없는 순수 단위 테스트로 만든다 (flaky 회피 + 빠름):

1. `workflowFailure`가 만든 메시지에 **UUID 패턴이 없음** (`ticket_code` null/non-null 양쪽)
2. `getErrorStatus`가 8개 action × 내부 예외 3종에서 **기대 상태 코드를 낸다**
3. `ticket_code = null`일 때 자리표시자가 `getErrorStatus` 키워드를 **포함하지 않음**

4. **`addDependency`의 순환 의존성 메시지에 UUID가 없고 두 title을 포함한다** (D3 검증)
   `taskRepo.hasCircularDependency`를 `vi.mock`으로 스텁해 true를 반환시킨다.
   저장소에 이미 같은 방식이 있다 (`ci-gate.test.ts`, `done-chokepoint.test.ts`가
   `vi.mock`으로 repo를 스텁해 `getPool()`을 호출하지 않는다). DB 불필요.

3번이 CRITICAL-2를 잡는 테스트다. 누군가 `'미상'`을 `'없음'`으로 바꾸면 즉시 깨진다.

> ⚠️ **반드시 실제 함수를 import해 호출한다. 로직 재구현 금지.**
> `import { getErrorStatus } from '../utils/error-status.js'`
> `import { workflowFailure } from '../services/workflow-service.js'`
>
> 키워드 목록이나 상태 매핑을 테스트 파일에 복사하면, `error-status.ts`가 바뀌어도
> 테스트는 모른다. 그것은 검증이 아니라 **검증했다는 착각**이다.
> rev.2가 이 지점을 지정하지 않아 반려됐다.

## 구현 단계

1. `getErrorStatus`를 `utils/error-status.ts`로 추출하고 `api-server.ts`에서 import (D0)
2. `workflowFailure` 헬퍼 추가 (D1, `export ... : never`)
3. 8곳을 헬퍼 호출로 교체 (D1의 action 표대로)
4. `task-service.ts:328` 수정 (D3)
5. 회귀 테스트 신설 (D5) — **실제 함수 import**
6. 검증 V0~V7

## 검증 계획 (Iron Law)

| # | 검증 | 방법 | 통과 기준 |
|---|---|---|---|
| V0 | **테스트가 실제 함수를 import하는가** | 신규 테스트 파일에서 키워드 목록·상태 매핑 재구현이 없는지 확인 | 재구현 0. `import`로만 접근 |
| V1 | **패턴 잔존 0** | `grep -rnE "ticket_code \?\? [a-zA-Z]+\.id" packages/mcp-server/src` | **0건** (rev.1이 놓친 것을 잡는 게이트) |
| V2 | **UUID 미노출 실측** | 헬퍼로 메시지를 실제 생성해 UUID_REGEX 검사 | 매치 0. `ticket_code` null/non-null 양쪽 |
| V3 | **상태 코드 보존** | `getErrorStatus`에 변경 전/후 메시지 대조. **`ticket_code = null` 조합 필수 포함** | M2 표대로 400/400/404 유지 |
| V3a | **`getErrorStatus` 추출이 순수 이동인가** | 이동 전/후 함수에 동일 입력 집합을 먹여 출력 대조 | 전 케이스 동일 |
| V4 | 빌드 | `pnpm -r build` | exit 0 |
| V5 | 린트 | `pnpm -r lint` | 0 errors |
| V6 | 테스트 | `pnpm -r test` | mcp-server **217 + 신규** / web-ui 14. 실패 시 `idx_projects_code` duplicate key(APS-1-19 flaky) 대조 |
| V6a | **D5 4번 항목 존재 확인** | 신규 테스트 파일에 `addDependency`/순환 의존성 케이스가 있는지 | 존재. rev.1~3이 세 번 빠뜨린 항목이다 |
| V7 | **변이 검증** | 자리표시자를 `'식별자 없음'`으로 되돌려 **신규 테스트가 실제로 깨지는지** 확인 | 깨져야 통과. 깨지지 않으면 테스트가 무의미 |

**V7이 핵심이다.** rev.1의 검증 절차는 CRITICAL-2를 구조적으로 못 잡았다.
테스트를 넣었다고 주장하지 말고 **그 테스트가 실제로 결함을 잡는 것을 보인다.**

## 산출물

- `packages/mcp-server/src/utils/error-status.ts` (**신설** — `getErrorStatus` 추출)
- `packages/mcp-server/src/api-server.ts` (추출된 함수 import로 교체)
- `packages/mcp-server/src/services/workflow-service.ts` (헬퍼 + 8곳 교체)
- `packages/mcp-server/src/services/task-service.ts` (1곳)
- `packages/mcp-server/src/__tests__/error-message-leak.test.ts` (**신설** — D5의 4개 항목 전부)
- `docs/03-code-review/APS-1-18-review.md`

## 범위 밖 (근거와 함께)

| 항목 | 이관 | 근거 |
|---|---|---|
| `wrapAsync` 구조적 방어 | `APS-1-31` | 개별 문자열을 고쳐도 새 throw가 추가되면 재발. 근본 해법이나 에러 분류 체계 도입은 범위가 크다 |
| `getErrorStatus`의 `'circular'` 죽은 매핑 (M6) | **신규 티켓 필요** | 고치면 400→409. **API 동작 변경**이라 섞을 수 없다 |
| 중첩 예외 원문 제거 | `APS-1-31` | 제거 시 상태 코드가 바뀐다 (D2) |
| `title` 자체의 민감도 | 별개 주제 | 성공 경로가 이미 노출 중. 이 티켓이 판단할 범위 아님 (D3) |
| `api-server.ts:571` `${eventType}` | `APS-1-30` | 식별자가 아니라 이벤트 타입명 |

## 이 티켓이 닫아도 남는 것

`wrapAsync`가 **모든** 내부 에러 메시지를 무여과로 REST 응답에 넣는 구조는 그대로다.
**새 throw가 추가되면 같은 문제가 재발한다.** V1의 grep 게이트는 `ticket_code ?? id` 패턴만 잡는다.
따라서 이 티켓 done이 "에러 메시지 노출 정리 완료"를 뜻하지 않는다 — `APS-1-31`이 남는다.

## 롤백

`git checkout -- packages/mcp-server/src/services/workflow-service.ts packages/mcp-server/src/services/task-service.ts packages/mcp-server/src/api-server.ts && rm -f packages/mcp-server/src/__tests__/error-message-leak.test.ts packages/mcp-server/src/utils/error-status.ts`

| 상황 | 조치 |
|---|---|
| V4/V5 실패 | 즉시 롤백 |
| V6가 `duplicate key ... idx_projects_code`로 실패 | 롤백하지 않음. APS-1-19 flaky. 재실행 |
| V3에서 상태 코드가 바뀜 | 롤백. 이 티켓은 API 계약을 바꾸지 않는다 |
| V7에서 테스트가 깨지지 않음 | 테스트를 다시 설계. 무의미한 게이트를 남기지 않는다 |
