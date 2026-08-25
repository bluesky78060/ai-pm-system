# APS-1-25 구현 플랜 — deny-list → allow-list + 가드 중앙화

**티켓**: APS-1-25 (P1) / **Discovery**: `docs/00-discovery/APS-1-25-direction.md`
**분류**: 사고 재발 방지 + DB 데이터 무결성 → **3중 검증**
**이력**: rev.1 (REVISE, MAJOR 2) → rev.2 (FAIL, 신규 2) → **rev.3** — 전부 2026-08-24

## rev.1이 왜 반려됐는가

두 MAJOR 모두 직접 재현해 확정했다.

### MAJOR-1 — 곁다리 로그 변경이 프로덕션 부팅을 깨뜨릴 수 있다

rev.1의 D4는 `new URL(connectionString).hostname`을 **VITEST 게이트 밖에서 무조건** 실행한다.
그런데 `new URL()`은 `pg` 자신이 이미 회피하고 있는 입력에서 throw한다:

```
비밀번호에 #   -> *** THROWS: Invalid URL ***
비밀번호에 ?   -> *** THROWS: Invalid URL ***
비밀번호에 /   -> *** THROWS: Invalid URL ***
```

`pg`가 쓰는 `pg-connection-string`은 `new URL()` 호출 전에 이스케이프를 정규화하고
실패 시 dummy host로 재시도한다. 즉 **`pg.Pool`이 정상 연결하는 URL이 rev.1의 날것
`new URL()`에서는 죽는다.**

그리고 `getPool()`은 앱 부팅 시 호출된다 — `api-server.ts:27` `await runMigrations()`,
`index.ts:1225`. **로그 한 줄이 프로덕션 전체 부팅을 막는다.**

프로덕션 안전을 위한 티켓이 프로덕션 안정성 리스크를 새로 만들 뻔했다.
리스크표에 없던 위치(곁다리 변경)에서 나왔다는 점이 더 나쁘다.

### MAJOR-2 — 호스트 비교 정규화가 명세되지 않았고, 기본 동작이 직관과 다르다

`postgresql:`은 WHATWG URL 스펙의 **special scheme이 아니다**(http/https/ws/wss/ftp/file만 해당).
따라서 hostname이 **소문자화되지 않는다**. 실측:

```
postgresql:// 대문자 -> hostname= EP-OLD-HAZE-AOL2R7DT...  (보존)
http://       대문자 -> hostname= ep-old-haze...           (소문자화)
트레일링 점          -> hostname= host.neon.tech.          (보존)
```

그 결과 **기존 deny-list의 `.includes()`(대소문자 구분)를 대문자 호스트가 통과한다**:

```
차단        postgresql://u:p@ep-old-haze-aol2r7dt...
*** 통과 *** postgresql://u:p@EP-OLD-HAZE-AOL2R7DT...
```

rev.1은 이 기존 약점을 "그대로 유지"한다고만 적고, 새 allow-list의 비교 규칙
(trim·대소문자·트레일링 점)도 명시하지 않았다 — 구현자 두 명이 다르게 구현할 모호성이다.


## 사전 측정 (실행 확인)

| # | 확인 | 결과 |
|---|---|---|
| M1 | vitest 실행 시 env | `VITEST="true"`, `NODE_ENV="test"` |
| M2 | 프로덕션(plain node) | `VITEST` **undefined** → 가드가 프로덕션에 영향 없음 |
| M3 | 실제 DB 접속 테스트 | **2개**(`context-service.test.ts`, `services.test.ts`), 둘 다 가드 보유. 나머지 8개는 mock 또는 DB 미사용 |
| M4 | `mcp-server` `setupFiles` | **미사용** (web-ui만 사용) |
| M5 | CI가 `.env.test`에 쓰는 키 | **`DATABASE_URL` 하나뿐** (`verify.yml:30-34`) |
| M6 | 현재 deny-list | 하드코딩 호스트 2개, **두 파일에 중복** |

## 설계 결정

### D1. 가드를 `getPool()`에 둔다 — 하네스가 아니라 연결 지점

Discovery §3-1의 네 대안 중 **(d)**를 택한다.

| 위치 | config 우회를 막는가 |
|---|---|
| 각 테스트 파일 (현행) | ✗ |
| `vitest.config.ts` / `setupFiles` | ✗ — `vitest --config other`로 우회 (APS-1-32 codex 지적) |
| **`getPool()`** | **✓ 실제로 풀을 여는 모든 경로** |

**가드는 "테스트를 어떻게 실행했는가"가 아니라 "실제로 어느 DB에 붙는가"를 봐야 한다.**

프로덕션 영향은 없다 — 가드는 `process.env.VITEST`가 있을 때만 동작하고,
M2에서 프로덕션 경로의 `VITEST`가 `undefined`임을 실측했다.

### D2. allow-list는 명시적 opt-in 키로 정의한다 (fail-closed)

Discovery §3-2의 문제 — 가드가 "이 호스트는 테스트용"임을 어떻게 아는가.

**`.env.test`에 `TEST_DB_ALLOWED_HOSTS`(쉼표 구분)를 두고, 그것과 대조한다.**

판정 순서:
0. **호스트 파싱 실패(`safeHostname`이 `null`) → 차단** (D2-c. 확인 불가능하면 통과시킬 수 없다)
1. `VITEST` 미설정 → **통과** (프로덕션 경로. 가드 대상 아님)
2. 알려진 프로덕션 호스트에 매치 → **차단** (기존 deny-list 유지. 아래 D2-a)
3. `TEST_DB_ALLOWED_HOSTS` 미설정 → **차단** ← **모르면 차단. 이것이 이 티켓의 본체**
4. 호스트가 목록에 없음 → **차단**
5. 그 외 → 통과

현재는 3·4가 없어 "모르면 통과"였다. **방향을 뒤집는다.**

### D2-a. 기존 deny-list를 지우지 않고 남긴다

allow-list가 생겨도 프로덕션 호스트 하드 차단은 유지한다.
**allow-list에 프로덕션을 넣어버리는 실수를 막기 위해서다.** 2번이 3·4번보다 먼저 평가된다.

### D2-b0. 알려진 한계 — `?host=` 쿼리 오버라이드

`pg-connection-string`은 `?host=` 쿼리 파라미터로 host를 오버라이드하는 것을 지원한다
(유닉스 소켓 경로 등). `new URL().hostname`은 **쿼리 파라미터를 보지 않으므로**,
그런 커넥션 스트링에서는 **가드가 판정하는 host와 `pg`가 실제로 붙는 host가 달라질 수 있다.**

Neon/Render 표준 커넥션 스트링에서는 발생하지 않는 패턴이라 본 티켓에서 막지 않는다.
다만 **모르고 넘어간 것이 아니라 알고 남긴 것**이므로 여기 적는다.

부수 효과 하나 더: `.includes()`(URL 전체 스캔) → 정확 매치(host 컴포넌트만)로 바꾸면,
쿼리 파라미터나 주석성 값에 프로덕션 호스트 문자열이 우연히 들어간 URL은 **더 이상 차단되지 않는다.**
host를 권위 있는 판정 기준으로 삼는다는 점에서 방향은 옳지만(오탐 감소), 동작 변화이므로 기록한다.

### D2-b. 이 방식의 한계를 정직하게 적는다

`TEST_DB_ALLOWED_HOSTS`는 **자기 인증**이다. `.env.test`를 잘못 쓴 사람이 allow-list도
잘못 쓸 수 있다. 다만 **두 번의 고의적 행동**을 요구한다는 것이 목적이다 —
복붙 한 번으로 프로덕션에 붙는 것을 막는다.

**CI에서는 더 약하다.** 두 값 모두 같은 사람이 설정한 secret에서 오므로
공격자 방어가 아니라 **오타 방어**다. 이 사실을 문서에 적는다.

### D2-c. 호스트 추출은 예외를 던지지 않는다 (MAJOR-1)

```ts
/** URL 파싱 실패가 연결을 막아서는 안 된다. 실패 시 null을 돌려주고 호출자가 판단한다. */
export function safeHostname(connectionString: string): string | null {
	try {
		return normalizeHost(new URL(connectionString).hostname);
	} catch {
		return null;
	}
}
```

- **로그(D4)**: `null`이면 `'(unparsable)'`로 찍고 **계속 진행한다.** 로그는 연결을 막지 않는다
- **가드(D2)**: `null`이면 **차단한다.** 호스트를 확인할 수 없으면 통과시킬 수 없다 (fail-closed)

두 소비자가 같은 실패를 반대로 처리한다 — 의도된 것이므로 코드 주석에 명시한다.

### D2-d. 호스트 비교 정규화를 명시한다 (MAJOR-2)

```ts
/** DNS 호스트명은 대소문자 무관이고 트레일링 점은 같은 이름이다. 비교 전에 정규화한다. */
function normalizeHost(h: string): string {
	return h.trim().toLowerCase().replace(/\.$/, '');
}
```

**적용 범위**: 새 allow-list뿐 아니라 **기존 deny-list에도 소급 적용한다.**
현재 `dbUrl.includes(host)`는 대소문자를 구분해 대문자 프로덕션 호스트를 통과시킨다(실측).
파싱된 hostname 정확 매치로 바꾼다.

**IPv6 한계**: `new URL().hostname`은 IPv6를 대괄호째 반환한다(`[2001:db8::1]`).
`normalizeHost`는 대괄호를 벗기지 않으므로, allow-list 항목에 대괄호가 없으면 매치되지 않는다.
Neon/Render는 IPv6 리터럴을 쓰지 않으므로 본 티켓에서 다루지 않되, 알고 남긴다.
(트레일링 점 제거 정규식은 비-global이라 `host..`는 `host.`로만 줄어든다 — 같은 이유로 방치)

`TEST_DB_ALLOWED_HOSTS` 파싱도 `split(',')` 후 각 항목에 같은 정규화를 적용한다
(공백·개행이 섞여 정상 개발자가 차단당하는 것을 막는다 — Discovery §4의 제약).

### D3. 가드를 공용 모듈로 (중복 제거)

`packages/mcp-server/src/utils/test-db-guard.ts` 신설.
`getPool()`이 호출하고, 두 테스트 파일의 중복 블록은 제거한다.

에러 메시지에 **해결법을 담는다** — Discovery §4의 제약(가드가 개발을 막으면 지워진다).

### D4. `[DB Connection]` 로그 정정

```diff
-		console.error(`[DB Connection] Connected to ${dbType} database`);
+		// APS-1-25: 실제 연결 전에 찍히므로 "Connected"는 거짓이다. 그리고 호스트를 보여주지
+		// 않아 어느 DB에 붙는지 알 수 없었다 — 호스트를 찍었다면 APS-1-32의 결함이
+		// 모든 테스트 실행에서 눈에 보였을 것이다.
+		//
+		// safeHostname()으로 감싸는 이유: new URL()은 비밀번호에 #·?·/ 가 있으면 throw한다.
+		// pg가 쓰는 pg-connection-string은 그것을 정규화해 회피하므로, 날것 new URL()을
+		// 쓰면 pg가 정상 연결하는 URL에서 이 줄이 죽는다. getPool()은 runMigrations()를 통해
+		// 앱 부팅 시 호출되므로(api-server.ts:27) 로그 한 줄이 프로덕션 부팅을 막게 된다.
+		// **로그는 절대 연결을 막아서는 안 된다.**
+		console.error(
+			`[DB Connection] pool for ${dbType} @ ${safeHostname(connectionString) ?? '(unparsable)'}`,
+		);
```

`safeHostname()`은 `test-db-guard.ts`가 제공한다 (D2-c).
**APS-1-33이 같은 파일의 TLS 블록을 대상으로 하므로 그 부분은 손대지 않는다.**

## ⚠️ 사용자 조치 필요 (머지 전)

M5대로 CI는 `.env.test`에 `DATABASE_URL`만 쓴다. D2의 fail-closed를 적용하면
**CI가 막힌다.** 다음이 필요하다:

1. GitHub Actions에 secret **`TEST_DB_ALLOWED_HOSTS`** 추가
   (값: `TEST_DATABASE_URL`의 hostname. 예: `ep-xxxx-pooler.<region>.aws.neon.tech`)
2. `verify.yml`의 `Setup test env`에 그 줄 추가 (본 티켓에서 코드로 반영)

**secret을 넣지 않으면 CI가 실패한다.** 이는 fail-closed의 의도된 결과이며,
"조용히 통과"보다 낫다. 다만 사용자 조치 없이는 머지할 수 없으므로 명시한다.

## 구현 단계

1. `utils/test-db-guard.ts` 신설 (D2·D3)
2. `db/connection.ts` — `getPool()`에서 가드 호출 + 로그 정정 (D1·D4)
3. 두 테스트 파일의 중복 가드 블록 제거
4. `.env.test`에 `TEST_DB_ALLOWED_HOSTS` 추가 (로컬, gitignored)
5. `.env.test.example`·`verify.yml`에 반영
6. 회귀 테스트 신설 — 가드 판정 로직 단위 테스트
7. **`pnpm --filter @ai-pm/mcp-server build`** (V5 계열의 선행 조건)
8. 검증 V1~V8 — **V6(빌드)를 V5보다 먼저 실행한다**

## 검증 계획 (Iron Law)

| # | 검증 | 방법 | 통과 기준 |
|---|---|---|---|
| **V1** | **변이 검증 — 모르는 호스트 차단** | 재생성 Neon 엔드포인트·Render 프로덕션·타 프로젝트 DB를 가정한 호스트로 시도 | 수정 전 **통과** / 수정 후 **차단**을 둘 다 시연 |
| **V2** | **변이 검증 — allow-list 미설정 시 차단** | `TEST_DB_ALLOWED_HOSTS`를 지우고 실행 | 차단. 에러에 해결법 포함 |
| V3 | 프로덕션 하드 차단 유지 | allow-list에 프로덕션 호스트를 넣어도 차단되는가 | 차단 (D2-a) |
| V4 | **정상 경로 무영향** | `ci-test` 브랜치로 전체 테스트 | 통과. 가드가 개발을 막지 않는다 |
| V5 | **프로덕션 경로 무영향** (⚠️ **V6 빌드 후 실행**) | 아래 절차 | 가드 미동작 + 로그 정상 |
| V5a | **로그가 연결을 막지 않는다** (MAJOR-1, **단위 테스트**) | 비밀번호에 `#`·`?`·`/`·공백이 있는 URL로 `safeHostname()` 호출 | throw 없음. `null` 반환 시 로그는 `(unparsable)`로 진행 |
| V5b | **호스트 정규화** (MAJOR-2, **단위 테스트**) | 대문자·트레일링 점·포트·IPv6·공백 포함 케이스 | 프로덕션 호스트가 **대소문자 무관하게 차단**됨 |
| V6 | 빌드 / 린트 | `pnpm -r build` / `pnpm -r lint` | exit 0 / 0 errors |
| V7 | 테스트 회귀 | `pnpm -r test` **5회 연속** | mcp 259+신규 / web-ui 14. 실패 시 `idx_projects_code`(APS-1-19) 대조 |
| V8 | 중복 제거 확인 | `grep -rn "PROD_COMPUTE_HOSTS" packages/mcp-server/src` | 공용 모듈 1곳만 |

### V5 실행 절차 (rev.1은 절차가 없었다)

> ⚠️ **선행 조건: `pnpm --filter @ai-pm/mcp-server build`를 먼저 돌린다.**
> 이 스크립트는 `dist/`를 import하는데 `dist/`는 **gitignored 빌드 산출물**이다.
> 빌드 없이 실행하면 **변경 전 코드를 검증하고 "통과"라고 잘못 보고**하게 된다
> (실측: 현재 `dist/db/connection.js`에 구버전 로그 문구가 그대로 있다).
>
> **검증 표의 V6(빌드)이 V5보다 뒤에 있지만, 실행 순서는 V6 → V5다.**
> 표 순서대로 실행하면 정확히 이 함정에 빠진다.
> APS-1-18에서 mock 미적용으로 테스트가 조용히 통과한 것과 같은 부류다.

`getPool()`을 전체 앱 부팅 없이 호출하는 진입점이 없으므로 스크립트로 만든다:

```bash
# 0) 반드시 먼저
pnpm --filter @ai-pm/mcp-server build

# VITEST 미설정 = 프로덕션 경로. 가드가 동작하지 않아야 한다.
DATABASE_URL="postgresql://fake:fake@sentinel.invalid/db" \
  node --input-type=module -e "
    const { getPool } = await import('./packages/mcp-server/dist/db/connection.js');
    try { getPool(); console.log('POOL CREATED (가드 미동작 = 정상)'); }
    catch (e) { console.log('THREW:', e.message); }
  "
```

`.invalid` 센티널이므로 실제 연결은 일어나지 않는다(`Pool` 생성은 lazy).
**가드가 던지면 실패다** — 프로덕션 경로에 테스트 로직이 샌 것이다.

> ⚠️ **V1·V3에서 실제 접속을 시도하지 않는다.** 가드는 문자열 판정 단계에서 막으므로
> 연결 이전에 결론이 난다. 프로덕션 호스트에는 가짜 자격증명을 쓴다.

**V1·V2가 핵심이다.** 가드를 넣었다고 주장하지 말고 **실제로 차단하는 것을 보인다.**
APS-1-18에서 내가 만든 테스트가 mock 미적용으로 조용히 통과한 전례가 있으므로,
가드가 실제로 발동했는지 확인하는 어서션을 넣는다.

## 산출물

- `packages/mcp-server/src/utils/test-db-guard.ts` (신설 — 가드 + `safeHostname` + `normalizeHost`)
- `packages/mcp-server/src/db/connection.ts` (가드 호출 + 로그)
- `packages/mcp-server/src/__tests__/{services,context-service}.test.ts` (중복 제거)
- `packages/mcp-server/src/__tests__/test-db-guard.test.ts` (신설)
- `.env.test.example`, `.github/workflows/verify.yml`
- `docs/03-code-review/APS-1-25-review.md`

## 범위 밖

| 항목 | 이관 |
|---|---|
| `connection.ts`의 TLS 설정 결함 | **APS-1-33** (같은 파일. 로그 한 줄만 건드린다) |
| pre-commit 훅 버전 관리·정규식·CI | APS-1-21 / 22 / 23 |
| `.env.test` 로드·fail-fast | APS-1-32 (완료) |

## 이 티켓이 닫으면 달라지는 것

APS-1-32 + 본 티켓으로 **격리 3층**이 선다:

1. `.env.test`가 셸 값을 이긴다 (`override: true`) — APS-1-32
2. 파일·키가 없으면 fail-fast — APS-1-32
3. **모르는 호스트면 차단** — 본 티켓

**그때 비로소 "격리 복구 완료"라고 말할 수 있다.** 다만 D2-b의 한계(자기 인증)는 남는다.

## 롤백

`git checkout -- packages/mcp-server/src/db/connection.ts packages/mcp-server/src/__tests__/services.test.ts packages/mcp-server/src/__tests__/context-service.test.ts .github/workflows/verify.yml && rm -f packages/mcp-server/src/utils/test-db-guard.ts packages/mcp-server/src/__tests__/test-db-guard.test.ts`

| 상황 | 조치 |
|---|---|
| V4 실패 (정상 경로가 막힘) | **즉시 롤백.** 가드가 개발을 막으면 지워진다 |
| V5 실패 (프로덕션 영향) | **즉시 롤백.** 프로덕션에 테스트 로직이 새면 안 된다 |
| V7이 `duplicate key`로 실패 | 롤백 안 함. APS-1-19 flaky. 재실행 |
| V1/V2에서 차단이 발동 안 함 | 롤백. 가드가 목적을 달성하지 못한 것 |
| **V5a에서 `safeHostname`이 throw** | **즉시 롤백.** 로그가 프로덕션 부팅을 막는다 |
