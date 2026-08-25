# APS-1-18 코드 리뷰 — 서비스 계층 내부 UUID 노출 정리

**티켓**: APS-1-18 (P1) / **분류**: REST 응답 내부 식별자 노출 → **2중 검증**
**리뷰 일자**: 2026-08-24 / **플랜**: rev.4 (플랜 리뷰 3라운드)

## 변경 요약

| 파일 | 변경 |
|---|---|
| `utils/error-status.ts` | **신설** — `getErrorStatus`를 `api-server.ts`에서 추출(순수 이동) |
| `api-server.ts` | 추출된 함수 import로 교체 |
| `services/workflow-service.ts` | `workflowFailure(action, task, e): never` 헬퍼 신설, **8곳** 교체 |
| `services/task-service.ts` | 순환 의존성 메시지에서 **식별자 제거**, 전체 정보는 서버 로그로 |
| `__tests__/error-message-leak.test.ts` | **신설** — 42 tests |

## 핵심 결함과 수정

`api-server.ts`의 `wrapAsync`가 내부 에러 메시지를 **무여과로 REST 응답에 넣는다**.
그 경로로 서비스 계층이 **호출자가 준 적 없는 내부 UUID**를 노출했다.

- `workflow-service.ts` **8곳**: `${task.ticket_code ?? task.id}` — `ticket_code`는 nullable
  (`migrate.ts:50` `TEXT`, `entities.ts:55` `string | null`). `POST /api/tasks`가 `epic_id`를
  강제하지 않고 epic-id-guard hook은 MCP 도구 전용이라, **REST로 만든 epic 없는 태스크는
  영구히 null**이다. 이론적 케이스가 아니다
- `task-service.ts:328`: `resolveTask`로 UUID로 변환된 값을 던져, 호출자가 `APS-1-3`을 넘겨도
  응답에는 UUID가 나갔다

---

## 1번 레인 — code-reviewer

**판정: REQUEST CHANGES → MAJOR 1건 반영 후 해소.** MINOR 1 / SUGGESTION 1은 비차단.

### MAJOR: JSDoc의 422 분기 주장이 사실이 아니었다 → 반영 완료

내가 `error-status.ts` JSDoc에 *"409 분기와 422 분기는 영어 키워드만 보므로 사실상 도달하지 않는다"*
라고 썼는데, 리뷰어가 `throw new Error` **87곳 전수 검사**로 반증했다.

| 분기 | 내 주장 | 실제 |
|---|---|---|
| 409 (`circular`/`already`/`duplicate`) | 도달 안 함 | **맞음** — 0곳 (직접 재확인) |
| 422 (`invalid`/`must`/…) | 도달 안 함 | **거짓** — `notification-settings-service.ts:84`의 `Invalid event type: ...`이 `PATCH /api/notification-settings/:eventType`로 실제 422를 낸다 (직접 재확인) |

**이 티켓이 막으려는 바로 그 유형의 오류를 내 주석이 저질렀다.**
"safe to ignore"로 잘못 표시된 분기의 문자열을 누군가 고치면 그 엔드포인트의 상태 코드가 조용히 바뀐다.
→ 409만 "도달하지 않음"으로 좁히고, **422는 살아 있음을 명시**했다.

### MINOR (비차단): `action` 인자가 `string`
7개 한국어 리터럴이 8개 호출 지점에 흩어진다. 유니온 타입이면 오타를 컴파일 타임에 잡는다.
다만 오타가 바꾸는 것은 에러 메시지 텍스트뿐이고 동작·보안이 아니므로 현행 유지.

### SUGGESTION (비차단): 주석 밀도
`error-status.ts`가 56%(18/32)로 저장소 최고치(`_security-base.ts` 32%)를 넘는다.
사고 서사가 이미 플랜·리뷰 문서에 있으므로 축약 가능. 다만 **실제 회귀를 막으려는 내용**이므로 유지.

### 1번 레인이 독립 확인한 것
`tsc --noEmit` 0 errors · `grep -c "^export " api-server.ts` = 0 (D0 근거 확인) ·
추출 경계에 잔여 주석·빈 줄 없음 · `never` 반환형이 "throw 누락" 버그를 구조적으로 차단 ·
로깅 접두사(`[WorkflowService]`)가 기존 관례와 일치 · **D5 4개 항목 전부 존재** ·
`vi` 정리가 형제 테스트에 영향 없음

---

## 2번 레인 — codex 독립 diff 리뷰

**판정: CRITICAL 0 / MAJOR 1 / MINOR 1 / SUGGESTION 1.** MAJOR 반영 완료.

### MAJOR: 자유 입력 `title`이 HTTP 상태 분류를 오염시킨다 → **내가 만든 결함**

플랜 D3은 "성공 경로(`:340`)가 이미 title을 노출하므로 새 노출 클래스가 아니다"를 근거로
title 사용을 채택했다. **그 근거가 틀렸다.** 성공 경로의 메시지는 정상 응답이라
`getErrorStatus`를 거치지 않지만, **에러 경로의 텍스트는 HTTP 상태를 결정한다.**

실측 — 내 변경이 상태 코드를 **사용자 조종 가능**하게 만들었다:

| 메시지 | 상태 |
|---|---|
| 변경 전 (UUID — 16진수라 키워드 없음) | **400** (항상) |
| `title = 'not found 처리'` | **404** |
| `title = 'invalid 입력 검증'` | **422** |
| `title = 'duplicate 제거'` | **409** |
| `ticket_code = 'MUST-1-2'` | **422** ← 프로젝트 코드도 안전하지 않다 |
| **식별자 제거** | **400** ✓ |

`ticket_code`로 바꾸는 것도 해결이 아니다 — 프로젝트 코드는 사용자가 정하므로 `MUST`가 가능하다.

**유일하게 안전한 해법은 식별자를 아예 빼는 것**이고, 근거도 강하다:
`addDependency(a, b)`는 **호출자가 두 식별자를 방금 인자로 보냈다.** 되돌려줄 정보 가치가 없다
— `index.ts` 4곳을 손대지 않기로 한 것과 같은 논리다.

→ 응답은 `'순환 의존성이 감지되었습니다'`, 전체 UUID와 title은 `console.error`로.
왜 title도 ticket_code도 쓰면 안 되는지를 실측값과 함께 코드 주석에 남겼다.

### MINOR: MCP와 REST의 에러 정책 불일치
`index.ts` 4곳은 여전히 호출자 입력 ID를 반사한다. codex도 "서버가 몰래 내부 UUID를 새는
CRITICAL급 경로는 아니다"라고 판단했다. **의도된 결정**(D4)이며 근거를 아래 §D4에 남긴다.

### SUGGESTION: 로그에 `e.message`가 함께 남는다
현재 8개 경로의 상태 전환 오류에 자격증명이 포함될 근거는 없으나, `e`가 DB/외부 예외이거나
향후 사용자 입력을 포함하면 민감정보가 로그로 이동할 수 있다. 로그 접근 통제가 전제다.
→ `APS-1-31`(wrapAsync 구조적 방어)에서 함께 다룰 사항으로 기록.

### codex가 확인한 것
`never` 반환형이 8곳에서 타입·definite-assignment 문제를 만들지 않음 (빌드 통과) ·
`getErrorStatus` 추출이 로직 변경 없는 순수 이동, 순환 import 없음 ·
`'미상'`이 9개 키워드와 충돌하지 않음 · 신규 테스트가 로직 복사가 아니라 실제 함수 import

---

## 내가 만든 flaky 테스트 (자체 발견 → 수정)

전체 스위트 5회 실행 중 **RUN 1에서 2건 실패**했다. `duplicate key` 패턴이 아니어서
APS-1-19의 알려진 flaky가 아니었고, **추측으로 넘기지 않고 실패 내용을 확인**했다.

```
AssertionError: expected 404 to be 400
```

404는 `태스크를 찾을 수 없습니다`(`없` 포함)에서 나온다. 즉 **mock이 적용되지 않아
실제 DB 경로를 탄 것**이다. 초판이 `it.each` 반복마다 `vi.doMock` + `vi.resetModules` +
동적 import를 써서 경합이 났다.

**flaky 테스트는 없는 것보다 나쁘다** — "빨간 건 무시해도 된다"는 습관을 만든다.
→ 파일 상단 **호이스팅 `vi.mock`** + 가변 픽스처로 재구성하고,
**스텁이 실제로 쓰였는지 확인하는 어서션**(`findByCodeCalls > 0`)을 넣어
mock 미적용이 조용히 통과하지 못하게 했다.

검증: 신규 테스트 단독 **10회 연속 42/42**, 전체 스위트 **5회 연속 통과**.

---

## D4 판단 기록 — `index.ts` 4곳은 변경하지 않는다

`:835, 899, 1015, 1043`은 전부 `${args?.project_id}` / `${args?.task_id}` / `${taskId}`다.

| 기준 | 판정 |
|---|---|
| 호출자가 모르는 정보를 알려주는가 | **아니다** — 자기가 방금 보낸 값이다 |
| 유출 가치 | 없다 |
| 제거 시 잃는 것 | 오타 난 ID를 즉시 알아채는 진단 가치 |

**변경 없음도 유효한 결론**이며, 서브태스크 `APS-1-29`의 목표("무조건 마스킹이 아니라 판단")를 충족한다.

---

## 검증 실행 증거

| # | 검증 | 결과 |
|---|---|---|
| V0 | 테스트가 로직 재구현 없이 import만 사용 | ✅ 재구현 0건 |
| V1 | `ticket_code ?? *.id` 패턴 잔존 | ✅ **0건** |
| V2 | 헬퍼 메시지에 UUID 없음 (null/non-null 양쪽) | ✅ |
| V3 | 상태 코드 보존 (7 action × 내부예외 3종, `ticket_code=null` 포함) | ✅ 400/400/404 유지 |
| V3a | `getErrorStatus` 순수 이동 | ✅ 18케이스(9키워드 개별 + 우선순위 교차 + default), 불일치 0, **4개 분기 전부 커버** |
| V4 | `pnpm -r build` | ✅ exit 0 |
| V5 | `pnpm -r lint` | ✅ 0 errors (49 + 19 files) |
| V6 | `pnpm -r test` **5회 연속** | ✅ 5/5 — mcp-server **259** + web-ui **14**, duplicate-key 0건 |
| V6a | D5 4번 항목(addDependency) 존재 | ✅ |
| V7 | **변이 검증** | ✅ 자리표시자를 `'식별자 없음'`으로 되돌리면 **14건 실패**, title을 메시지에 되돌리면 **6건 실패** |
| — | 신규 테스트 단독 10회 | ✅ 10/10 (flaky 해소 확인) |

**V7이 핵심이다.** 테스트를 넣었다고 주장하지 않고 **그 테스트가 실제로 결함을 잡는 것을 보였다.**

---

## 이 티켓이 닫아도 남는 것

`wrapAsync`가 **모든** 내부 에러 메시지를 무여과로 REST 응답에 넣는 구조는 그대로다.
V1의 grep 게이트는 `ticket_code ?? id` 패턴만 잡으므로 **새 throw가 추가되면 재발한다.**

따라서 이 티켓 done이 **"에러 메시지 노출 정리 완료"를 뜻하지 않는다.**

| 남은 것 | 티켓 |
|---|---|
| `wrapAsync` 구조적 방어 (에러 분류 체계) | `APS-1-31` |
| `getErrorStatus`의 죽은 409 분기 + 문자열 기반 상태 결정 설계 자체 | `APS-1-35` |
| 로그에 남는 `e.message`의 민감정보 위험 | `APS-1-31` |
| 중첩 예외 원문 제거 (제거 시 상태 코드가 바뀜) | `APS-1-31` |

## CI에 대한 정직한 한계

`verify.yml`이 권위 게이트지만 로컬에서 CI를 실행할 수 없다.
CI green은 PR 단계에서 확인하며 **본 티켓의 done 전환 근거로 삼지 않았다.**
