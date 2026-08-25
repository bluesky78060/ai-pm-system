# APS-1-32 플랜 리뷰 기록

**티켓**: APS-1-32 (P0) / **리뷰어**: critic (Opus, fresh subagent — 플랜 작성자와 분리)
**작성자**: 메인 오케스트레이터 (self-approval 금지 규칙 적용)

## 요약

| 라운드 | 판정 | 핵심 지적 |
|---|---|---|
| 1차 | **REJECT (FAIL)** | CRITICAL 1 · MAJOR 2 · MINOR 5 |
| 2차 | **FAIL** | MAJOR 1 (검증 절차가 증거를 버림) + 거짓 서술 2 + MINOR 5 |
| 3차 | ✅ **PASS (7/7)** | 착수 전 4줄 편집만 남음 |

---

## 1차 리뷰 (rev.1 대상)

리뷰어가 `THOROUGH` → `ADVERSARIAL`로 승격했다. CRITICAL 확인 시점이 계기였다.

### CRITICAL — `override: true` 단독으로는 사고 경로가 닫히지 않는다

rev.1은 `loadDotenv({ path, override: true })`의 **반환값을 버렸다.**
dotenv는 파일이 없으면 `{ error: ENOENT }`를 반환하고 `process.env`를 **전혀 건드리지 않는다.**
즉 셸의 프로덕션 URL이 그대로 살아남는다. 메인 오케스트레이터 독립 재현:

```
.env.test 부재 + override:true
  error: ENOENT
  parsed keys: []
  결과 host: ep-old-haze-aol2r7dt.c-2.ap-southeast-1.aws.neon.tech
  셸의 프로덕션 값이 살아남았는가: YES — fail-open
```

**이것은 엣지 케이스가 아니라 fresh clone의 기본 상태다** (실측):

| 항목 | 상태 |
|---|---|
| `.env.test` | `.gitignore:9` — 추적 안 됨 |
| `README.md` | **없음** |
| `.env.test.example` | **없음** |
| `.env.example`의 `DATABASE_URL` | **없음** (SQLite 시절 `DB_PATH` 잔존) |

새 머신·새 clone·새 worktree는 항상 `.env.test` 없이 시작한다.
셸에 `DATABASE_URL`이 있으면 그것이 테스트 DB가 되고, **테스트는 초록으로 통과한다**
(리뷰어의 RUN 4: `Test Files 1 passed (1)`).

리뷰어의 Realist Check 기록: 오늘의 현실적 최악은 전면 wipe가 아니라 **스키마 오염 +
scoped 쓰기**다 (사고 원인이던 unscoped DELETE는 이미 제거됨). 그럼에도 CRITICAL을 유지한 이유는
프로덕션 쓰기·데이터 무결성 건이고, **탐지가 조용하며**, 수정 비용이 2줄이기 때문이다.

### MAJOR-1 — "거짓 주석은 한 곳"이라는 rev.1의 단언 자체가 거짓

실제로는 **최소 3곳**이고, 하나는 **rev.1이 편집하는 바로 그 파일 안**에 있다.

`vitest.config.ts:5-8`
> "Falls back silently when the file is absent (**CI sets DATABASE_URL directly via secrets**),
> but the guard in context-service.test.ts still refuses to run against a production URL."

- 괄호 안은 **거짓**. `verify.yml`에 `env:` 블록이 없다 (전수 확인). CI는
  `secrets.TEST_DATABASE_URL`로 **`.env.test` 파일을 생성**한다 (`verify.yml:30-34`)
- "Falls back silently"는 바로 CRITICAL의 그 동작이다
- rev.1의 diff는 이 4줄을 남기므로, 수정 후 **4줄 간격으로 모순되는 두 주장**이 공존한다

세 번째 위치는 `docs/ci-test-isolation.md` — 격리가 동작한다고 단언하는 **공식 가이드**인데
rev.1의 산출물 목록에 없었다. 특히 `:224`의 예시 출력이 `✓ injected env from ...`으로,
실제 형식 `◇ injected env (N) from ...`과 다르고 **`(N)` 카운트가 빠져 있다** —
결함의 결정적 단서(`(0)`)를 가려온 문서다.

> rev.1 스스로 "틀린 주석은 결함보다 오래 산다", "판정 오류 중 하나가 정확히 주석을 믿은 것"이라고
> 써 놓고 3곳 중 2곳을 빠뜨렸다. 자기모순이다.

### MAJOR-2 — V1 변이 검증이 실제 `pnpm test` 경로를 우회한다

rev.1의 `node -e` 절차가 증명하는 것은 **dotenv 라이브러리의 속성**(문서를 읽으면 아는 것)이고,
증명하지 못하는 것은 **시스템의 속성** — vitest config 프로세스의 `process.env` 변형이
워커 프로세스로 전파되는가다. 이건 실제로 불확실했다(APS-1-19가 "병렬 워커"를 명시).

리뷰어가 실제 vitest 파이프라인(forks/threads 양쪽)으로 확인한 결과 전파는 **정상**이었다.
그러나 rev.1은 **운 좋게** 맞은 것이고, 절차 자체는 그것을 검증할 능력이 없었다.
판정 오류가 "실행해 확인하지 않은" 유형으로 반복된 이 프로젝트에서,
검증 절차가 실제 경로를 우회하는 것은 MAJOR다.

### MINOR (5건)
행번호 오기(4-7 → 5-7) / C2에 교체 문안 없음 / V2 grep 과소 범위 /
`ci-test-isolation.md` stale 브랜치 정보 / 가드가 DB 참조 테스트 4개 중 2개에만 존재
(후자 2개는 `vi.mock`으로 `getPool()` 미호출이라 현재 위험 없음 — MAJOR→MINOR 강등 기록)

### 리뷰어의 사전 예측 vs 실제 (기록)

| 예측 | 결과 |
|---|---|
| `.env.test` 부재 시 fail-open이 남는다 | **적중 (CRITICAL)** |
| worker 간 env 전파가 안 될 수 있다 | 반증 — forks/threads 모두 전파 |
| CI에 `DATABASE_URL`이 있어 override:true가 CI를 깰 수 있다 | 반증 — `env:` 없음 |
| dotenv 로드 지점이 더 있다 | 반증 — `vitest.config.ts` 단일 |
| V1이 실제 경로를 대표하지 못한다 | **적중 (MAJOR-2)** |
| (예측 못 함) "거짓 주석 1곳" 주장 자체가 거짓 | **MAJOR-1** |

---

## rev.2 반영 내역

| # | 지적 | 반영 |
|---|---|---|
| CRITICAL | fail-open | C1을 5-9행 통째 교체로 확대. `loaded.error \|\| !loaded.parsed?.DATABASE_URL` fail-fast |
| MAJOR-1 | 거짓 주석 3곳 | C2를 3곳으로 확대 + 각각 교체 문안 diff 명시. `docs/ci-test-isolation.md`를 산출물에 추가 |
| MAJOR-2 | V1 우회 | `.invalid` 센티널 + 실제 `pnpm --filter @ai-pm/mcp-server test`로 교체. `node -e` 폐기 |
| — | 부재 분기 DoD 없음 | **V1b 신설** — 파일 부재 fail-fast 시연을 CRITICAL의 수용 기준으로 |
| — | 리스크표 누락 | "`.env.test` 부재/키 누락 시 fail-open" 행을 최상단에 추가 |
| SUGGESTION-1 | CI 논거 | "러너에 없다"는 검증 불가 전제 → **"override:true는 CI에서 단조적으로 안전"**으로 교체 |
| SUGGESTION-2 | 온보딩 부재 | **C3 신설** — `.env.test.example` + `.env.example`의 `DATABASE_URL` |
| SUGGESTION-3 | APS-1-25 우선순위 | **P3 → P1 상향 완료**, 사유를 티켓에 기록 |
| SUGGESTION-4 | 실행 횟수 | V5를 3회 → 5회 (APS-1-19 기준과 정합) |
| MINOR-1 | 행번호 | 4-7 → 5-7 정정 |
| MINOR-3 | V2 grep | 저장소 전체(루트·`scripts/`·`.github/`, yml/json 포함)로 확대 |
| MINOR-5 | 가드 커버리지 | APS-1-25 사유에 "가드 중앙화" 포함 |
| Ambiguity | 해석 B 위험 | **§"이 티켓이 닫아도 남는 구멍" 신설** — done 후에도 "격리 복구 완료"라 말하지 않겠다고 명시 |
| What's Missing | 롤백 트리거 | **§롤백 트리거 신설** — flaky(APS-1-19 패턴)면 롤백 안 함 등 조건 명시 |

### 성공 기준을 수단에서 목표로 교체

rev.1은 `injected env (1)` 출력을 통과 기준으로 삼았다. 그것은 **수단의 지표**다.
목표 지표는 **"어떤 로컬 환경에서도 테스트가 의도치 않은 DB에 붙지 않는다"**이며,
그 기준으로 보면 rev.1은 목표를 달성하지 못했다.

---

## 2차 리뷰 (rev.2 대상) — FAIL

rev.1의 ACCEPT 조건 4개는 전부 충족됐으나, 그 4번(V1 절차)을 **플랜에 적힌 명령 그대로
실제 저장소에서 돌려본 결과 증거가 캡처 창 밖으로 잘려나갔다.**

### MAJOR — `| tail -20`이 증거를 버린다

```
총 라인수: 95
'sentinel.invalid' 등장: 60행, 74행
tail -20 내 증거 라인 수: 0          ← tail -20은 76~95행만 잡는다
```

남는 신호는 `Test Files 2 failed`뿐인데, 이는 APS-1-19의 `duplicate key` flaky·네트워크 오류·
잘못된 비밀번호와 **구분되지 않는다.** 실행자가 "실패했으니 셸 값이 이긴 것"으로 오독한 채
리뷰 문서에 "변이 검증 통과"라고 적을 수 있다 — 글로벌 규칙이 명시적으로 금지하는 상황이다.

> **이것은 rev.1에서 MAJOR-2로 반려당한 것("검증 절차가 실제 경로를 우회한다")과
> 정확히 같은 부류다.** 절차를 실제로 돌려보지 않고 썼기 때문에 반복됐다.
> 이 티켓의 존재 이유 자체가 "실행해 확인하지 않고 텍스트만 읽은" 오류인데
> 검증 절차에서 또 그랬다는 점이 이번 라운드의 가장 아픈 교훈이다.

### 거짓 서술 2건
- `"테스트는 초록으로 통과한다"` — 과일반화. 하드코딩된 그 엔드포인트면 가드가 잡아 빨갛게 죽는다.
  초록으로 지나가는 것은 **재생성된 Neon 엔드포인트·Render 프로덕션·다른 프로젝트 DB**일 때다
- `"(N) 카운트가 빠져 있던 것이 결함의 단서를 가렸다"` — 검증 불가능한 인과를 단정형으로 적었다.
  거짓 서술 제거가 목적인 문서에 새 미검증 단정을 넣는 것은 자기모순

### 확인해 준 것 (지적 아님)
- fail-fast 조건 `!loaded.parsed?.DATABASE_URL`이 **빈 문자열·공백·빈따옴표 세 형태를 모두 잡는다**
  (빈 문자열은 falsy). 조건식 수정 불필요
- C2-b 교체 문안은 모호하지 않고 새 문장에 거짓이 없다
- `.invalid` 센티널의 **안전성은 확인됨** (`ENOTFOUND`, search 접미사 없음)

---

## 3차 리뷰 (rev.3 대상) — **PASS 7/7**

리뷰어가 rev.3의 V1/V1b 명령을 **플랜 그대로 실제 저장소에서 실행**해 해소를 확인했다:

```
$ DATABASE_URL="postgresql://fake:fake@sentinel.invalid/db" \
    pnpm --filter @ai-pm/mcp-server test 2>&1 | tee ... | grep -E "ENOTFOUND sentinel\.invalid|Test Files"

Error: getaddrinfo ENOTFOUND sentinel.invalid     ← 양성 증거가 화면에 남는다
Error: getaddrinfo ENOTFOUND sentinel.invalid
 Test Files  2 failed | 7 passed (9)

>>> V1b FAIL          ← 수정 전 기대값과 정확히 일치
```

| 체크리스트 | rev.1 | rev.2 | rev.3 |
|---|---|---|---|
| 목표 명확성 | ⚠️ | ✅ | ✅ |
| 범위 적절성 | ❌ | ✅ | ✅ |
| 리스크 식별 | ❌ | ✅ | ✅ |
| 산출물 구체성 | ⚠️ | ✅ | ✅ |
| Discovery 일치도 | ✅ | ✅ | ✅ |
| 기술 검증 | ⚠️ | ✅ | ✅ |
| 테스트 전략 | ❌ | ❌ | ✅ |

### 착수 전 4줄 (rev.4로 반영 완료)

| # | 지적 | 반영 |
|---|---|---|
| 1 | **C1이 심는 주석에 과일반화 문장이 그대로 남는다** — 본문에서만 고치고 코드에는 심는다. 이 티켓의 논지("틀린 주석은 결함보다 오래 산다")와 정면 충돌 | 주석을 가드 발동 조건으로 한정 |
| 2 | C2-c가 CI 브랜치를 확정 서술로 갱신 — `TEST_DATABASE_URL` secret이라 확인 불가 | "로컬 기준, CI는 별도 확인 필요" 한정 부기 |
| 3 | **N-1: V1b가 만드는 `.env.test.bak`이 gitignore되지 않는다** — `.env.bak*`는 `.env.bak1`만 잡는다(실측). 실제 Neon 자격증명이 추적 후보로 노출 | 백업을 `/tmp`로 이전 + `.gitignore`에 추가(이중 방어) |
| 4 | N-2: `.invalid`를 "DNS가 절대 해석하지 않으므로"라고 단정 — 47행 뒤에서는 하이재킹 가능성을 전제. 자기 문서에 모순 공존 | "이 환경에서 해석되지 않음을 확인했고"로 완화 |

추가 반영: N-3(V2 범위 서술을 "주요 확장자 전수"로 한정), N-4(시제 정정).

### 리뷰어가 확인한 것
- APS-1-25·APS-1-33 description 반영이 `get_task`로 실제 확인됨 —
  2차의 "보고-실제 불일치"(내가 "기록했다"고 보고했으나 `set_priority`의 reason은
  description에 반영되지 않음) 해소
- rev.3의 신규 문장 중 거짓은 C1 주석 1건뿐

### 미확인으로 남는 것 (리뷰어 명시)
mcp-server 217개의 **실제 통과**는 3라운드 통틀어 확인되지 않았다.
리뷰어의 모든 실행이 `sentinel.invalid` 강제 상태(`186 passed | 31 skipped`)였기 때문이다.
**V5(5회 연속)는 구현자가 수행해야 하며, 이 리뷰가 대체하지 않는다.**
