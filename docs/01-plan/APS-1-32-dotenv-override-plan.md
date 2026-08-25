# APS-1-32 구현 플랜 — `.env.test` 격리 복구 (rev.4)

**티켓**: APS-1-32 (P0) / **Discovery**: `docs/00-discovery/APS-1-32-direction.md`
**분류**: DB 데이터 무결성 + 사고 재발 경로 → 3중 검증
**이력**: rev.1 (REJECT) → rev.2 (FAIL, MAJOR 1) → rev.3 (PASS 7/7) → **rev.4** (착수 전 4줄) — 전부 2026-08-24

## rev.1이 왜 반려됐는가

`override: true` **단독으로는 사고 경로가 닫히지 않는다.**
`.env.test`가 없으면 dotenv는 `{ error: ENOENT }`를 **반환값으로만** 알리고
`process.env`를 건드리지 않는다. rev.1의 코드는 그 반환값을 버렸다.

```
.env.test 부재 + override:true
  error: ENOENT / parsed keys: [] / 결과 host: ep-old-haze-aol2r7dt…
  셸의 프로덕션 값이 살아남았는가: YES — fail-open
```

그리고 **이것은 예외가 아니라 fresh clone의 기본 상태다** (실측):

| 항목 | 상태 |
|---|---|
| `.env.test` | `.gitignore:9` — 추적 안 됨 |
| `README.md` | **없음** |
| `.env.test.example` | **없음** |
| `.env.example`의 `DATABASE_URL` | **없음** (SQLite 시절 `DB_PATH`가 남아 있음) |

새 머신·새 clone·새 worktree는 **항상** `.env.test` 없이 시작한다.
셸에 `DATABASE_URL`이 export돼 있으면 그것이 그대로 테스트 DB가 된다.

**얼마나 조용한가는 셸 값이 무엇이냐에 달렸다** (rev.2는 이를 과일반화했다):

| 셸의 `DATABASE_URL` | 결과 |
|---|---|
| 하드코딩된 그 엔드포인트(`ep-old-haze-aol2r7dt`) | `PROD_COMPUTE_HOSTS` 가드가 잡아 **빨갛게 죽는다** |
| **재생성된 Neon 엔드포인트** | 가드 통과 → **초록으로 지나간다** |
| **Render 프로덕션 / 다른 프로젝트 DB** | 가드 통과 → **초록으로 지나간다** |

즉 오늘의 방어는 **문자열 두 개를 아는 경우에만** 작동한다.
이것이 APS-1-25(deny-list → allow-list)가 유일한 2차 방어선인 이유이며,
아래 §"이 티켓이 닫아도 남는 구멍"과 이어진다.

## 사전 조사 결과 (실측)

| 확인 항목 | 결과 | 의미 |
|---|---|---|
| dotenv 로드 지점 | **`vitest.config.ts:9` 한 곳뿐** | 고칠 곳이 하나. 누락 위험 없음 |
| `.env.test` 키 개수 | **1개 (`DATABASE_URL`)** | `override: true`가 다른 키를 덮을 여지 없음 |
| 거짓 주석 위치 | ~~한 곳~~ → **최소 3곳** (rev.1 오류) | 아래 C2 참조. 하나는 **수정 대상 파일 안**에 있다 |
| web-ui의 dotenv 사용 | **없음** | DB를 쓰지 않으므로 영향 없음 |
| dotenv 버전 | 17.4.2 | `config()` 기본 `override: false` 확정 |

## 변경 내용

### C1. `packages/mcp-server/vitest.config.ts:5-9` — 로드 + **fail-fast**

**5-9행을 통째로 교체한다.** 기존 주석 5-8행을 남기면 안 된다 — 아래 C2 참조.

```diff
-// APS-2-7: load test-only DATABASE_URL from the repo-root .env.test BEFORE any
-// test file imports trigger getPool(). Falls back silently when the file is
-// absent (CI sets DATABASE_URL directly via secrets), but the guard in
-// context-service.test.ts still refuses to run against a production URL.
-loadDotenv({ path: resolve(__dirname, '../../.env.test') });
+// APS-2-7 / APS-1-32: 테스트 전용 DATABASE_URL을 저장소 루트 .env.test에서 읽는다.
+// 어떤 테스트 파일 import가 getPool()을 트리거하기 전에 실행되어야 한다.
+//
+// override: true가 필수다. dotenv config()의 기본값은 override: false라서, 셸에
+// DATABASE_URL이 이미 export돼 있으면 .env.test가 통째로 무시된다("injected env (0)").
+//
+// 반환값 검사도 필수다. 파일이 없거나 DATABASE_URL 키가 없으면 dotenv는 조용히
+// no-op이고 셸 값이 살아남는다. .env.test는 gitignored이므로 fresh clone의 기본
+// 상태가 곧 그 구멍이다. 여기서 fail-fast 하지 않으면 2026-05-18 사고 경로가
+// 그대로 재현된다. 셸 값이 하드코딩된 그 엔드포인트라면 아래 가드가 잡아 빨갛게
+// 죽지만, 재생성된 Neon 엔드포인트·Render·다른 프로젝트 DB라면 초록으로 지나간다.
+const loaded = loadDotenv({ path: resolve(__dirname, '../../.env.test'), override: true });
+if (loaded.error || !loaded.parsed?.DATABASE_URL) {
+	throw new Error(
+		'APS-1-32: .env.test를 읽지 못했거나 DATABASE_URL 키가 없습니다. ' +
+			'셸의 DATABASE_URL로 폴백하지 않고 중단합니다. ' +
+			'저장소 루트에 .env.test를 만드십시오 (.env.test.example 참조). ' +
+			'CI라면 TEST_DATABASE_URL secret 주입 여부를 확인하십시오(fork PR에는 주입되지 않습니다).',
+	);
+}
```

**CI 안전성**: `verify.yml:30-34`가 Build **이전에** `.env.test`를 생성하므로 CI는 throw하지 않는다.
secret 미주입(fork PR)이면 `DATABASE_URL=` 빈 값이 되어 실패하는데, 지금도 실패하되
**원인이 명확한** 실패로 바뀐다.

**`override: true`는 CI에서 단조적으로 안전하다.** 러너에 `DATABASE_URL`이 없으면 결과가 동일하고,
혹시 있더라도 `.env.test`(= `TEST_DATABASE_URL`)가 이기므로 그것이 곧 의도된 동작이다.
어느 경우에도 CI가 나빠지지 않는다 — 러너 환경을 검증할 필요가 없는 논거다.

### C2. 거짓 주석 **3곳** 정정 (rev.1은 1곳으로 잘못 셌다)

#### C2-a. `packages/mcp-server/vitest.config.ts:5-8` — **수정 대상 파일 안에 있다**

```
// test file imports trigger getPool(). Falls back silently when the file is
// absent (CI sets DATABASE_URL directly via secrets), but the guard in
```

- `"CI sets DATABASE_URL directly via secrets"` — **거짓.** `verify.yml`에 `env:` 블록이 없다.
  CI는 `secrets.TEST_DATABASE_URL`로 **`.env.test` 파일을 생성**한다 (`verify.yml:30-34`).
- `"Falls back silently when the file is absent"` — 이것이 바로 C-1의 그 동작이다.
  rev.1의 diff는 이 4줄을 남겼으므로, 수정 후 파일에 **4줄 간격으로 모순되는 두 주장**이
  공존하게 된다. C1의 교체 diff가 이를 해소한다.

#### C2-b. `packages/mcp-server/src/__tests__/context-service.test.ts:4-7`

(diff는 4행을 문맥으로 포함한다. 실제로 거짓인 것은 5-7행이고 4행은 사실 진술이다.)

```diff
-// The 20:42 KST incident (5 projects wiped) happened because tests connected
-// to the production Neon branch. vitest.config.ts now loads .env.test which
-// overrides DATABASE_URL to a dedicated test branch; this guard is the
-// defense-in-depth check that catches misconfiguration before any query runs.
+// The 20:42 KST incident (5 projects wiped) happened because tests connected
+// to the production Neon branch. vitest.config.ts loads .env.test with
+// `override: true` and fails fast if the file or the DATABASE_URL key is
+// missing (APS-1-32) — without both, a DATABASE_URL already exported in the
+// shell silently wins and this suite would run against it. This guard is the
+// second layer, not the first: it only catches the one hardcoded production
+// compute below. See APS-1-25 for turning that deny-list into an allow-list.
```

핵심은 "override한다"를 참으로 만드는 것이 아니라, **왜 그 옵션과 반환값 검사가 필수인지**와
**이 가드가 1차 방어가 아니라는 사실**을 남기는 것이다.

#### C2-c. `docs/ci-test-isolation.md`

`:16` "dotenv envFile로 `.env.test` **우선 로드**", `:28` "테스트 시 **우선 로드**",
`:32`/`:44` "결과: ✅ production 데이터 보호" — 격리가 동작한다고 단언하는 **공식 가이드**인데
rev.1의 산출물 목록에 없었다.

정정할 것: (1) "우선 로드"는 `override: true`가 있어야 참임을 명시,
(2) `.env.test` 부재 시 fail-fast 한다는 사실 추가,
(3) `:224`의 예시 출력 `✓ injected env from ...`을 실제 형식 `◇ injected env (N) from ...`으로 교체.
`(N)` 카운트가 빠져 있어 **결함의 결정적 단서(`(0)`)를 알아볼 수 없는 형태였다.**
(문서 때문에 못 봤다고 단정하지는 않는다 — 그 인과는 확인되지 않았고,
거짓 서술 제거가 목적인 문서에 새 미검증 단정을 넣는 것은 자기모순이다.)
(4) `:15`/`:60`의 stale 브랜치·엔드포인트 정보(`br-purple-fog-aoyuc8lg`, `ep-falling-glitter-aoxepm0z`)를 갱신.
갱신 값은 **로컬 `.env.test` 기준(2026-08-24)**이며, CI가 실제로 어느 브랜치를 쓰는지는
`TEST_DATABASE_URL` secret 값이라 **확인 불가**다. 그 사실을 문서에 함께 적는다 —
거짓 서술을 지우는 편집에서 검증 불가한 값을 확정 서술로 넣으면 새 거짓이 생긴다.

### C3. `.env.test.example` 신설 + `.env.example`에 `DATABASE_URL` 추가

C-1의 **발생 확률을 좌우하는 근본 원인**이다. fail-fast만 넣으면 새 개발자는
"왜 테스트가 안 도나"에 부딪히고, 그 좌절이 `override`/검사를 지우는 동기가 된다.

- `.env.test.example` 신설 (자격증명 없이 형식만)
- `.env.example`의 SQLite 시절 잔재 `DB_PATH` 정리 + `DATABASE_URL` 추가
- **`.gitignore`에 `.env.test.bak` 추가** — 검증 절차가 만드는 백업 파일이
  기존 `.env.bak*` 패턴에 걸리지 않는다(실측 확인). V1b가 백업을 `/tmp`로 옮기므로
  이중 방어이지만, 누군가 습관적으로 저장소 안에 백업할 때를 대비한다

## 왜 주석 정정이 코드 수정만큼 중요한가

결함 자체는 한 줄이다. 그러나 **틀린 주석은 결함보다 오래 산다.**
이번 APS-1-7 검증에서 판정 오류 3건이 났고, 그중 하나가 정확히
"주석에 overrides라고 적혀 있으니 override한다고 믿은 것"이었다.
코드만 고치고 주석을 두면 같은 오독이 반복된다.

## 검증 계획 (Iron Law)

| # | 검증 | 방법 | 통과 기준 |
|---|---|---|---|
| **V1** | **변이 검증 — 셸 값 무시** | 아래 절차 ① | 수정 전 셸 값 사용 / 수정 후 `.env.test` 사용을 **실제 `pnpm test` 경로로** 시연 |
| **V1b** | **변이 검증 — 파일 부재 fail-fast** | 아래 절차 ② | 수정 전 조용히 진행 / 수정 후 즉시 중단을 시연. **C-1의 수용 기준** |
| V2 | 로드 지점 전수 | 아래 명령 (zsh에서 글로브 따옴표 필수) | `vitest.config.ts` 외 로드 지점 0 |
| V3 | 빌드 | `pnpm -r build` | exit 0 |
| V4 | 린트 | `pnpm -r lint` | 0 errors |
| V5 | 테스트 | `pnpm -r test` **5회 연속** | mcp-server 217 / web-ui 14 통과. 실패 시 APS-1-19의 `duplicate key` 패턴인지 대조 (APS-1-19가 자기 검증에 5회를 요구하므로 기준을 맞춤) |
| V6 | 부재/키누락 분기 | 절차 ②의 두 케이스 (파일 없음 / 키 없음) | 둘 다 명확한 에러로 중단 |

### V2 명령 (zsh 글로브 주의)

```bash
grep -rnE "loadDotenv|require\('dotenv'\)|from ['\"]dotenv|dotenv/config|--env-file" \
  --include='*.ts' --include='*.yml' --include='*.json' . 2>/dev/null | grep -v node_modules
```

**따옴표가 없으면 zsh에서 `no matches found: --include=*.ts`로 실행조차 되지 않는다.**
rev.2는 범위만 넓히고 이 문제를 그대로 뒀다. 통과 기준은 `vitest.config.ts:2,9` 외 0건.

### V1 변이 검증 절차 — `.invalid` 센티널 + **양성 증거 캡처**

> ⚠️ **프로덕션 호스트명을 셸에 export하지 않는다.** RFC 2606의 `.invalid` TLD는
> 이 환경에서 해석되지 않음을 확인했고(`dns.lookup`/`resolve4` 모두 `ENOTFOUND`,
> `/etc/resolv.conf`에 search 접미사 없음), 어느 망에서든 **실재 호스트로 연결될 수 없다.**
> 실제 `pnpm test` 경로를 그대로 타면서 접속 위험은 0이다.

> ⚠️ **`| tail -N`으로 캡처하지 않는다** (rev.2의 MAJOR). 실제로 돌려보면 증거는
> 60·74행에 나오는데 `tail -20`은 76~95행만 잡아 **매칭 0건**이 된다.
> 그러면 남는 신호가 `Test Files 2 failed`뿐인데, 이는 APS-1-19의
> `duplicate key value violates unique constraint "idx_projects_code"` flaky·네트워크 오류·
> 잘못된 비밀번호와 **구분되지 않는다.** 실행자가 "실패했으니 셸 값이 이긴 것"으로 오독한 채
> 리뷰 문서에 "변이 검증 통과"라고 적을 수 있다 — 글로벌 규칙이 금지하는 바로 그 상황이다.

**통과 기준을 "실패했다"가 아니라 `sentinel.invalid` 문자열의 등장/부재로 잡는다.**

**① 셸 값 무시 시연**

```bash
# 수정 전 — 셸 값이 이기므로 sentinel.invalid로 붙으려 한 흔적이 남아야 한다 (양성 증거)
DATABASE_URL="postgresql://fake:fake@sentinel.invalid/db" \
  pnpm --filter @ai-pm/mcp-server test 2>&1 | tee /tmp/aps-1-32-v1a-before.log | \
  grep -E "ENOTFOUND sentinel\.invalid|Test Files"
# 통과 기준: "sentinel.invalid"가 출력에 나타날 것.
# 나타나지 않은 채 그냥 실패했다면 그것은 다른 원인이며 증거가 아니다.

# 수정 후 — .env.test가 이기므로 sentinel.invalid가 어디에도 없어야 한다 (음성 증거)
DATABASE_URL="postgresql://fake:fake@sentinel.invalid/db" \
  pnpm --filter @ai-pm/mcp-server test 2>&1 | tee /tmp/aps-1-32-v1a-after.log | tail -5
grep -c "sentinel.invalid" /tmp/aps-1-32-v1a-after.log   # 통과 기준: 0
```

**② 파일 부재 fail-fast 시연 (C-1 수용 기준)**

```bash
# 백업은 저장소 밖으로. .env.test.bak은 .gitignore의 .env.bak* 패턴에 걸리지 않아
# 실제 Neon 자격증명이 추적 후보로 노출된다(실측: git check-ignore → NOT ignored).
mv .env.test /tmp/aps-1-32-env.test.bak
DATABASE_URL="postgresql://fake:fake@sentinel.invalid/db" \
  pnpm --filter @ai-pm/mcp-server test 2>&1 | tee /tmp/aps-1-32-v1b.log
mv /tmp/aps-1-32-env.test.bak .env.test
grep -q "APS-1-32: .env.test" /tmp/aps-1-32-v1b.log && echo "V1b PASS" || echo "V1b FAIL"
```

- 수정 전: 조용히 `sentinel.invalid`로 진행 (= 프로덕션이었다면 **붙었을 것**). `V1b FAIL` 출력
- 수정 후: `APS-1-32: .env.test를 읽지 못했거나…`로 즉시 중단. `V1b PASS` 출력

> **①과 ②의 "수정 전" 출력은 동일하다** (둘 다 셸 값이 이기므로). 당연한 결과이니
> 실행자는 여기서 멈추지 말 것. 두 절차의 판별력은 **수정 후에만** 갈린다.

**③ 키 누락 케이스**: `.env.test`를 `SOMETHING_ELSE=1` 한 줄로 바꿔 ②와 동일 확인.
`DATABASE_URL=` (빈 값)·`DATABASE_URL="   "`·`DATABASE_URL=""` 세 형태도 fail-fast에 걸린다
(리뷰어 실측: 빈 문자열은 falsy이므로 `!loaded.parsed?.DATABASE_URL`이 참).

> **`.invalid`가 NXDOMAIN 하이재킹되는 망**(일부 ISP·기업망)에서는 에러가 `ECONNREFUSED`/
> `ETIMEDOUT`으로 바뀔 수 있다. 그래서 통과 기준을 `ENOTFOUND`가 아니라 **호스트명 문자열**로
> 잡는다 — 어느 경우에도 pg 메시지에 호스트명은 남는다. 프로덕션 접속 위험은 어느 쪽이든 0이다.

`rev.1의 node -e 절차는 폐기한다.` 그것이 증명하는 것은 **dotenv 라이브러리의 속성**이지
**시스템의 속성**(vitest config 프로세스의 `process.env` 변형이 워커로 전파되는가)이 아니다.

### 성공 기준은 수단이 아니라 목표로 잡는다

rev.1은 `injected env (1)`이 출력되면 통과로 봤다. 그것은 **수단의 지표**다.
목표 지표는 **"어떤 로컬 환경에서도 테스트가 의도치 않은 DB에 붙지 않는다"**이며,
그 기준으로 보면 rev.1은 목표를 달성하지 못했다(파일 부재 경로가 열려 있었다).

## 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **`.env.test` 부재/키 누락 시 fail-open** | **치명 — rev.1의 CRITICAL** | C1의 반환값 fail-fast. V1b로 시연 |
| 변이 검증 중 실제 접속 | 치명 | `.invalid` 센티널 — DNS가 해석하지 않음 |
| fail-fast가 새 개발자를 막음 | 중간 | C3(`.env.test.example`) + 에러 메시지에 생성법 명시 |
| `.env.test`가 존재하지만 프로덕션을 가리킴 | 높음 | 본 티켓 범위 밖. deny-list만이 막으며 그것은 APS-1-25 |
| flaky 테스트로 회귀 판정이 흐려짐 | 중간 | 5회 연속 실행. 실패 시 APS-1-19 패턴 대조 |
| 고쳤다고 믿었는데 다른 경로가 또 있음 | 중간 | V2를 주요 확장자 전수로 확대 |

## 이 티켓이 닫아도 남는 구멍 (정직하게 명시)

`.env.test`가 **존재하지만 프로덕션을 가리키도록 잘못 작성된** 경우, `override: true`는
그것을 충실히 주입한다. 이때 막는 것은 `PROD_COMPUTE_HOSTS` deny-list 하나이고,
그것은 하드코딩된 엔드포인트 **하나만** 잡는다 (해당 파일 **14-15행**이 한계를 자인).

**따라서 본 티켓이 done이 되어도 "격리 복구 완료"라고 말해서는 안 된다.**
allow-list 전환(APS-1-25)까지 끝나야 그 말을 할 수 있다.
2026-05-18 회고가 저지른 오류가 정확히 이것이었다 — 한 층을 고치고 전체가 닫혔다고 선언한 것.

→ **APS-1-25의 우선순위를 3에서 1로 상향했다**(완료). C-1 수정 이후 그것이 유일한 2차 방어선이다.

## 롤백 트리거 (rev.2 신설)

| 상황 | 조치 |
|---|---|
| V3/V4 실패 | 즉시 롤백. 본 변경과 무관한 실패일 수 없다 |
| V5가 `duplicate key value violates unique constraint "idx_projects_code"`로 실패 | **롤백하지 않는다.** APS-1-19의 기존 flaky. 재실행 |
| V5가 그 외 사유로 2회 이상 실패 | 롤백 후 원인 분석 |
| V1b에서 fail-fast가 발동하지 않음 | 롤백. 수정이 목적을 달성하지 못한 것 |

## 산출물

- `packages/mcp-server/vitest.config.ts` (로드 + fail-fast + 주석 교체)
- `packages/mcp-server/src/__tests__/context-service.test.ts` (주석)
- `docs/ci-test-isolation.md` (거짓 서술 3곳 + stale 브랜치 정보 정정)
- `.env.test.example` (신설)
- `.env.example` (`DATABASE_URL` 추가, `DB_PATH` 잔재 정리)
- `docs/03-code-review/APS-1-32-review.md` (3중 검증 결과)

## 범위 밖 (인접 티켓과의 경계)

| 항목 | 티켓 |
|---|---|
| `PROD_COMPUTE_HOSTS` deny-list → allow-list | APS-1-25 |
| pre-commit 훅 버전 관리 편입 | APS-1-21 |
| 테스트 flaky (TOCTOU) | APS-1-19 |

방어선은 하나씩, **각각 실패를 시연해 가며** 넣는다. 한 티켓에 묶으면
어느 층이 실제로 동작하는지 개별 확인이 흐려진다.

## 롤백

`git checkout -- packages/mcp-server/vitest.config.ts packages/mcp-server/src/__tests__/context-service.test.ts docs/ci-test-isolation.md .env.example && rm -f .env.test.example`

트리거 조건은 위 §롤백 트리거 참조.
