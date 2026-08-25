# APS-1-25 플랜 리뷰 기록

**티켓**: APS-1-25 (P1) / **리뷰어**: critic (독립 서브에이전트, 플랜 작성자와 분리)
**작성자**: 메인 오케스트레이터 (self-approval 금지 규칙 적용)

## 요약

| 라운드 | 판정 | 지적 |
|---|---|---|
| 1차 | **REVISE** | MAJOR 2 · MINOR 2 |
| 2차 | **FAIL** | MAJOR 2건 해결 확인, **신규 2건** (검증 절차 결함 + 문서·코드 불일치) |
| 3차 | ✅ **PASS / ACCEPT** | 신규 결함 없음. 비차단 제안 2건 |

세 라운드 모두 실질 결함이었다.

---

## 1차 리뷰 (rev.1) — REVISE

### MAJOR-1 — 곁다리 로그 변경이 프로덕션 부팅을 깨뜨릴 수 있었다

rev.1의 D4는 `new URL(connectionString).hostname`을 **VITEST 게이트 밖에서 무조건** 실행했다.
`new URL()`은 `pg`가 이미 회피하고 있는 입력에서 throw한다 (직접 재현):

```
비밀번호에 #   -> *** THROWS: Invalid URL ***
비밀번호에 ?   -> *** THROWS: Invalid URL ***
비밀번호에 /   -> *** THROWS: Invalid URL ***
비밀번호에 공백 -> 통과
```

`pg`가 쓰는 `pg-connection-string`은 `new URL()` 호출 전에 이스케이프를 정규화하고
실패 시 dummy host로 재시도한다. 즉 **`pg.Pool`이 정상 연결하는 URL이 날것 `new URL()`에서는 죽는다.**

그리고 `getPool()`은 앱 부팅 시 호출된다 — `api-server.ts:27` `await runMigrations()`,
`index.ts:1225`. **로그 한 줄이 프로덕션 전체 부팅을 막는다.**

> **프로덕션 안전을 위한 티켓이 프로덕션 안정성 리스크를 새로 만들 뻔했고,
> 리스크표에 없던 위치(곁다리 변경)에서 나왔다.**

### MAJOR-2 — 호스트 비교 정규화가 명세되지 않았다

`postgresql:`은 WHATWG URL 스펙의 **special scheme이 아니므로** hostname이 소문자화되지 않는다
(special: http/https/ws/wss/ftp/file). 직접 재현:

```
postgresql:// 대문자 -> hostname= EP-OLD-HAZE-AOL2R7DT...  (보존)
http://       대문자 -> hostname= ep-old-haze...           (소문자화)
```

그 결과 **기존 deny-list의 `.includes()`(대소문자 구분)를 대문자 호스트가 통과한다**:

```
차단        postgresql://u:p@ep-old-haze-aol2r7dt...
*** 통과 *** postgresql://u:p@EP-OLD-HAZE-AOL2R7DT...
```

rev.1은 이 기존 약점을 "그대로 유지"한다고만 적고, 새 allow-list의 비교 규칙도 명시하지 않았다.

### 리뷰어가 확인해 준 것 (설계 골격은 튼튼)
- **`getPool()`이 유일한 pg 연결 지점**임을 grep으로 확인 (`from 'pg'`가 `connection.ts`에만 존재)
  → D1(가드를 연결 지점에 두기)의 핵심 논리는 탄탄
- M1~M6 측정값 전부 실행으로 재확인, 정확

---

## 2차 리뷰 (rev.2) — FAIL (신규 2건)

**MAJOR-1·MAJOR-2는 정확히 고쳐졌음을 리뷰어가 재현 확인했다.** 다만 그 고침 자체에서 2건이 나왔다.

### 신규-1 — 검증 절차가 stale 빌드를 검증할 구조였다

V5 스크립트는 `dist/db/connection.js`를 import하는데:

```
$ ls dist/db/connection.js          -> 존재 (Aug 24 16:46)
$ grep "DB Connection" dist/...     -> "Connected to ${dbType} database"  ← 구버전 문구
$ git check-ignore -v dist/...      -> .gitignore:2  dist/
```

`dist/`는 **gitignored 빌드 산출물**이고 지금도 변경 전 코드를 담고 있다.
게다가 rev.2의 검증 표는 **V5를 V6(빌드)보다 먼저** 나열했다 —
순서대로 실행하면 **변경 전 코드를 검증하고 "통과"라고 보고**하게 된다.

> 리뷰어의 지적이 아프다: 이 플랜 문서 스스로가
> *"APS-1-18에서 내가 만든 테스트가 mock 미적용으로 조용히 통과한 전례가 있다"*고 적어놓고,
> **가드를 검증하는 절차 자체에 같은 방식으로 조용히 통과할 구멍**을 만들었다.

### 신규-2 — 문서가 약속한 동작과 보여준 코드가 달랐다

D2-c 산문: *"`null`이면 `'(unparsable)'`로 찍고 계속 진행한다"*
D4 diff: `${safeHostname(connectionString)}` — **폴백이 없다.**

실측:
```
내 diff 그대로 :  "[DB Connection] pool for Neon @ null"
?? 폴백 있으면 :  "[DB Connection] pool for Neon @ (unparsable)"
```

크래시는 나지 않지만(템플릿 리터럴이 `null`을 안전하게 문자열화)
**구현자가 diff를 그대로 옮기면 문서의 주장이 거짓이 된다.**

### 리뷰어가 확인해 준 것
- `safeHostname` 비대칭(로그=진행, 가드=차단)은 **fail-closed 철학과 일치. 반대 케이스 없음**
- `pg-connection-string` 직접 재사용은 **pnpm 엄격 격리로 불가** (명시 의존성 추가 없이는)
  → 현재의 "null 반환 + 소비자별 처리" 설계가 이 환경에서 실현 가능한 선택임을 확인
- 포트는 `.hostname`이 애초에 제외 — 우려 근거 없음
- **pooler 접미사 회귀 없음** — direct/pooler/대문자 셋 다 차단됨을 실행 확인
- 정확 매치 전환의 부수 효과: 쿼리 파라미터에 프로덕션 호스트 문자열이 우연히 있는 URL은
  더 이상 차단되지 않음. **방향은 옳으나(오탐 감소) 동작 변화**

---

## rev.3 반영 내역

| # | 지적 | 반영 |
|---|---|---|
| 1차 MAJOR-1 | `new URL` throw로 부팅 중단 | **D2-c 신설** — `safeHostname()` try/catch. 로그는 `(unparsable)`로 진행, 가드는 차단(fail-closed). 비대칭이 의도임을 코드 주석에 명시. **V5a 신설** + 롤백 트리거 추가 |
| 1차 MAJOR-2 | 정규화 미명세 | **D2-d 신설** — `normalizeHost()` = trim + 소문자 + 트레일링 점 제거. **기존 deny-list에 소급 적용**해 `.includes()`를 정확 매치로. **V5b 신설** |
| 1차 What's Missing | V5 절차 부재 | 구체 스크립트 명시 (`.invalid` 센티널 + dist 직접 호출) |
| 2차 신규-1 | stale dist 검증 | **V5 앞에 빌드 선행 조건**을 실측 근거와 함께 명시. "표 순서와 실행 순서가 다르다"는 경고. V5 행 제목·구현 단계에도 반영 |
| 2차 신규-2 | 문서-코드 불일치 | D4 diff에 `?? '(unparsable)'` 반영 |
| 2차 MINOR | `?host=` 다이버전스 | **D2-b0 신설** — 알고 남긴 한계로 기록. `.includes()` → 정확 매치의 부수 효과도 동작 변화로 기록 |
| 2차 MINOR | IPv6·트레일링 점 | D2-d에 한계 명시 (대괄호 미제거, 정규식 비-global) |

### 채택하지 않은 제안 (근거 기록)

| 제안 | 판단 |
|---|---|
| CI에서 `TEST_DB_ALLOWED_HOSTS`를 `TEST_DATABASE_URL`에서 자동 유도 | **미채택.** 한 값에서 두 값을 만들면 대조할 대상이 없어져 오타 방어마저 사라진다. 리뷰어도 "설계 선호 영역, 반박 타당"으로 인정 |
| `pg-connection-string`을 명시 의존성으로 추가 | **미채택.** APS-1-16이 방금 override를 전부 제거해 의존성을 정리한 직후라 시점이 나쁘다. null 폴백은 로그에서만 열화되고 가드는 fail-closed로 안전. 다만 정당한 비밀번호에 `#`·`?`·`/`가 있으면 가드가 차단하므로 **그 증상을 에러 메시지에 담는다** |

---

## 3차 리뷰 (rev.3) — **PASS / ACCEPT**

rev.2의 2건이 모두 검증 가능하게 반영됐음을 리뷰어가 실행으로 확인했다.

### 확인된 것

| 항목 | 결과 |
|---|---|
| 빌드 선행 조건 | **충분.** 표 행 제목·경고 박스·스크립트 주석 3중 명시 |
| 다른 stale 의존 | **없음.** V1~V4·V7·V8은 vitest가 TS를 즉석 트랜스파일해 dist 불필요. **V5만** dist 필요하며, 그 이유도 구조적임을 확인 — VITEST 미설정을 재현하려면 vitest 밖 plain `node`여야 하는데 `tsx`/`ts-node`가 이 프로젝트에 없다(`node_modules/.bin/tsx` 부재 확인). 회피 불가능한 제약이므로 선행 조건 명시가 올바른 대응 |
| `(unparsable)` 일치 | **일치.** 실행 확인: `"[DB Connection] pool for X @ (unparsable)"` |
| `?host=` 서술 정확성 | **정확.** 소스 대조에 그치지 않고 실행 재현: `parse(...?host=override-host.example.com)` → pg 판정 host는 `override-host.example.com`, `new URL().hostname`은 `authority-host.neon.tech`. 서로 다름 |
| 신규 거짓 문장 | **없음.** D2-b0 전체·D2-d 추가분·구현 단계·경고 박스·`(unparsable)` 코드 전부 실행/소스 대조 확인 |

### 비차단 제안 2건 (구현에 반영)

1. **V5a/V5b를 dist 기반이 아니라 vitest 단위 테스트로** — `safeHostname`/`normalizeHost`는
   VITEST 상태와 무관한 순수 함수이므로 `test-db-guard.test.ts`로 검증하는 편이 간단하다.
   → 반영. V5만 dist를 쓰고 V5a/V5b는 단위 테스트로 분리
2. **판정 목록에 "0. 호스트 파싱 실패 → 차단" 명시** — D2-c 산문에 이미 있는 내용을
   D2의 단계 목록에도 끼워 넣어 완전 정합화
   → 반영

### 최종 판정

> 3라운드에 걸쳐 발견된 결함(rev.1 MAJOR 2건: 프로덕션 부팅 크래시 위험, 대소문자 deny-list 우회 /
> rev.2 FAIL 2건: V5 stale dist, 문서-코드 불일치)이 모두 재현 가능한 증거와 함께 정확히 수정됐다.
> rev.3의 adversarial 검증에서도 새 blocking 결함 없음. **6단계(구현)로 진행해도 좋다.**

---

## 이 리뷰가 지금까지 막은 것

1. **로그 한 줄이 프로덕션 부팅을 막을 뻔했다** — 프로덕션 안전 티켓이 프로덕션을 깨뜨릴 뻔
2. **대문자 프로덕션 호스트가 가드를 통과할 뻔했다** — `postgresql:`이 special scheme이 아니라는 것을 몰랐다
3. **검증 절차가 변경 전 코드를 검증하고 "통과"라고 보고할 뻔했다**

셋 다 **실행해서 확인하지 않으면 드러나지 않는** 것이었다.
텍스트만 읽었다면 "new URL로 hostname 뽑으면 된다"는 문장이 합리적으로 보였을 것이다.
