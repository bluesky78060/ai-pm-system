# APS-1-32 코드 리뷰 — `.env.test` 격리 복구

**티켓**: APS-1-32 (P0) / **분류**: DB 데이터 무결성 + 사고 재발 경로 → **3중 검증**
**리뷰 일자**: 2026-08-24

## 변경 요약

| 파일 | 변경 |
|---|---|
| `packages/mcp-server/vitest.config.ts` | `override: true` 추가 + **반환값 fail-fast** + 주석 교체 |
| `packages/mcp-server/src/__tests__/context-service.test.ts` | 거짓 주석 정정 (이 가드가 1차 방어가 아님을 명시) |
| `docs/ci-test-isolation.md` | "✅ production 데이터 보호" → "⚠️ 부분 보호" + 「알려진 한계」 절 신설 + 브랜치 식별자 자리표시자화 |
| `.env.test.example` | 신설 (자격증명 없는 형식) |
| `.env.example` | `DATABASE_URL` 추가, SQLite 시절 `DB_PATH` 잔재 주석 처리 |
| `.gitignore` | `.env.test*bak` — 검증 절차가 만드는 백업 파일 노출 차단 |

## 핵심 결함과 수정

`dotenv` `config()`의 기본값은 `override: false`다. `process.env`에 이미 있는 키는 건드리지 않는다.
따라서 개발자 셸에 `DATABASE_URL`이 export돼 있으면 `.env.test`가 **통째로 무시**되고
(`injected env (0)`) 테스트는 그 URL에 붙는다. **2026-05-18 production Neon DB wipe 사고와
정확히 같은 경로다.**

추가로, 파일이 없거나 `DATABASE_URL` 키가 없으면 dotenv는 `{ error: ENOENT }`를
**반환값으로만** 알리고 `process.env`를 건드리지 않는다. `.env.test`는 gitignored이고
이 저장소에는 README도 `.env.test.example`도 없었으므로 **fresh clone의 기본 상태가 곧 그 구멍**이었다.

수정은 두 가지를 함께 해야 성립한다 — `override: true` **와** 반환값 검사.
하나만으로는 사고 경로가 닫히지 않는다.

---

## 1번 레인 — code-reviewer (Claude)

**판정: APPROVE.** MEDIUM 1 / LOW 1, 둘 다 반영 완료.
(Opus 서브에이전트가 API 529 Overloaded로 3회 연속 중단되어 Sonnet으로 수행.
품질·가독성·패턴 검토 범위이므로 적합하다고 판단했으며, 그 사실을 여기 명시한다.)

### MEDIUM: `.env.example`의 `DB_PATH` 주석이 중복·모순되게 읽힌다 → 반영 완료

```
# SQLite database path (default: ./data/pm.db)      ← 원본 주석을 남겨둠
# DB_PATH — SQLite 시절 잔재. 현재는 Postgres만 사용한다.   ← 새로 붙인 줄
```

위에서부터 읽으면 첫 줄이 여전히 유효한 기본값 설명처럼 보이고 다음 줄이 그것을 부정한다.
**이 티켓의 취지("오해 소지 있는 주석 제거")와 정확히 반대 방향의 결과**다.

→ 한 줄로 통합: `# DB_PATH는 SQLite 시절 잔재로 제거됨. 현재는 Postgres(DATABASE_URL)만 사용한다.`

### LOW → **코드 수정으로 승격**: 공백 값 차단 주장이 과장이었다

리뷰어가 실측으로 반증했다. codex 2번 레인이 "공백만 있는 값도 차단된다"고 했고
내가 그것을 이 문서에 그대로 적었는데, **따옴표가 있으면 통과한다.**

| 입력 | dotenv 결과 | 원래 조건의 fail-fast |
|---|---|---|
| `DATABASE_URL=   ` (따옴표 없음) | `""` (dotenv가 trim) | ✅ 차단 |
| `DATABASE_URL="   "` | `"   "` (보존) | ❌ **통과** |
| `DATABASE_URL="\t"` | `"\t"` | ❌ **통과** |

리뷰어는 "보안상 사고 경로가 재열리지는 않으므로(`"   "`는 유효한 연결 문자열이 아니라
pg 단계에서 실패) **문서의 커버리지 주장이 과장된 것**이며 코드 변경은 불필요"로 분류했다.

**나는 문서를 약화시키는 대신 가드를 조이는 쪽을 택했다.** 이 티켓의 주제 자체가
"가드가 주석에 적힌 대로 실제로 동작하는가"이고, 수정 비용이 7글자이기 때문이다.

```diff
-if (loaded.error || !loaded.parsed?.DATABASE_URL) {
+if (loaded.error || !loaded.parsed?.DATABASE_URL?.trim()) {
```

재검증 실측:

| 입력 | `.trim()` 전 | `.trim()` 후 |
|---|---|---|
| `DATABASE_URL="   "` | 통과 | ✅ **차단** |
| `DATABASE_URL="\t"` | 통과 | ✅ **차단** |
| 정상 URL | 통과 | 통과 (회귀 없음) |

`.trim()`이 필요한 이유를 코드 주석에도 남겼다 — 다음 사람이 "불필요한 호출"로 보고 지우지 않도록.

### 1번 레인이 확인해 준 것 (지적 아님)

- `vitest.config.ts`와 `context-service.test.ts`의 주석을 실제 코드와 **한 줄씩 대조**해
  거짓 서술 0건. `start`/`start:api`/`dev:api`가 vitest 경로를 안 탄다는 주석도
  `package.json` scripts + `api-server.ts:25`로 직접 확인
- 주석 분량(11줄)은 같은 저장소 `done-chokepoint.test.ts`의 8줄 블록과 비슷한 밀도이고
  각 문장이 서로 다른 정보를 담아 중복이 없으므로 과하지 않음
- 에러 메시지 4줄이 원인/정책/로컬 대응/CI 대응을 각각 한 문장으로 분리해 실행 가능
- `.env.test.example`이 `context-service.test.ts`뿐 아니라 **`services.test.ts`의 동일 가드까지**
  언급한 점이 정확 (놓치기 쉬운 디테일)
- `.gitignore`의 `.env.test*bak`가 `.env.test.example`을 건드리지 않으면서 백업 변형만 잡음
- 플랜 산출물 6개 전부 반영, 누락·범위 이탈 없음
- `DB_PATH`가 코드 어디서도 참조되지 않음을 grep으로 확인 (주석 처리가 안전)

---

## 2번 레인 — codex 독립 diff 리뷰

**판정: CRITICAL 0 / MAJOR 0 / MINOR 2 / SUGGESTION 1** — 전부 반영 완료.

### MINOR-1: fork PR에서 CI가 항상 실패한다

`verify.yml`은 모든 `pull_request`에서 테스트를 돌리지만 fork PR에는 repository secret이
전달되지 않는다. `.env.test`가 `DATABASE_URL=`(빈 값)으로 생성되고 fail-fast가 발동한다.

**fail-closed이므로 보안상 올바른 동작**이다 — secret 없이 조용히 다른 DB에 붙는 것보다
명확히 실패하는 편이 낫다. 다만 외부 기여 PR을 정상 검증할 수 없는 운영 제약이 생긴다.
→ `docs/ci-test-isolation.md`에 절을 신설해 명시하고 후속 과제로 기록.

### MINOR-2: 문서의 테스트 브랜치 식별자가 서로 모순

내가 「알려진 한계」 절에 `ci-test / br-raspy-thunder-ao2nzazc`를 적었으나,
같은 문서의 Secret 등록 예시와 트러블슈팅 절은 여전히
`ep-falling-glitter-aoxepm0z` / `br-purple-fog-aoyuc8lg`를 쓰고 있었다.

운영자가 두 값 사이에서 **잘못된 DB를 테스트 대상으로 오인**할 수 있다.
거짓 서술을 지우는 편집에서 새 모순을 만든 셈이다.

→ 구체값을 전부 자리표시자(`<TEST-BRANCH-COMPUTE>`)로 강등하고,
"실제 값을 이 문서에 적지 말 것 — 문서가 낡으면 잘못된 DB를 테스트 대상으로 오인하게 된다"는
이유를 함께 넣었다. 이력 표기 한 곳만 "2026-05-19 작성 당시 값이며 현재와 다르다"로 남겼다.

### SUGGESTION: 중복 ignore 패턴

`.env.test.bak`이 `.env.test.*bak`에 포함되어 중복. → `.env.test*bak` 하나로 통합.
백업 변형 4종(`.bak`, `.criticbak`, `testbak`, `.foo.bak`)을 잡으면서
`.env.test.example`은 통과함을 실측 확인.

### codex가 확인해 준 것 (지적 아님)

fail-fast 조건이 차단하는 범위: **파일 없음 / 키 없음 / 빈 값 / 따옴표 없는 공백 /
`DATABASE_URL=""` / BOM으로 키가 파싱되지 않는 경우.**
따옴표로 감싼 정상 URL과 개행으로 끝나는 정상 URL은 정상 처리된다.

> ⚠️ **정정**: codex는 "공백만 있는 값"도 차단된다고 했고 내가 이 문서에 그대로 적었으나,
> **따옴표로 감싼 공백(`DATABASE_URL="   "`)은 통과**한다. 1번 레인이 실측으로 반증했다.
> → `.trim()` 추가로 코드를 조여 해결했다 (1번 레인 절 참조).
> **다른 계열 모델의 리뷰도 검증 없이 인용하면 거짓이 전파된다**는 사례로 남긴다.

`.env.test.example`에 실제 자격증명 없음. `context-service.test.ts` 주석이 실제 동작과 일치.

---

## 3번 레인 — 적대적 검증

Claude critic 레인이 API 529 Overloaded로 2회 연속 중단되어 **codex challenge**로 수행.
(프로젝트 규칙은 3번 레인으로 critic 적대적 검증·challenge 프롬프트·변이 검증을 모두 인정한다.)

**codex 판정: MAJOR 2 / MINOR 1.** 다만 MAJOR 2건 중 1건은 **의도된 동작을 결함으로 본 것**으로
판단해 수용하지 않았다. 근거를 아래에 남긴다 — 리뷰 결과를 무조건 수용하는 것도,
근거 없이 기각하는 것도 옳지 않다.

### codex MAJOR-1: "vitest config를 안 타는 실행 경로가 있다" → **기각 (의도된 동작)**

codex 주장: `start` / `start:api` / `dev:api`는 `vitest.config.ts`를 로드하지 않고,
`api-server.ts:25`가 시작 즉시 `runMigrations()`를 호출한다. 따라서 셸에 프로덕션
`DATABASE_URL`이 있고 `.env.test`가 없어도 fail-fast가 발동하지 않으며 실제 DB에 연결된다.

**사실 확인 결과 전제는 모두 맞다.** 그러나 이것은 결함이 아니다:

| 스크립트 | 실체 |
|---|---|
| `start:api` | `node packages/mcp-server/dist/api-server.js` — **Render 배포 진입점** |
| `start` | `node dist/index.js` — MCP 서버 본체 |
| `dev:api` | `node --watch dist/api-server.js` — 위의 개발용 |

**프로덕션 서버가 프로덕션 `DATABASE_URL`에 붙어 `CREATE TABLE IF NOT EXISTS`
마이그레이션을 돌리는 것은 이 앱의 정상 배포 경로다.** 그것을 막으면 앱이 뜨지 않는다.

APS-1-32가 반증 대상으로 내세운 주장은 **테스트 격리**에 관한 것이고
(Discovery §3이 범위를 `vitest.config.ts`로 명시), 서버 실행 경로는 애초에 대상이 아니다.
codex는 "프로덕션 DB에 닿을 수 있는 모든 경로"를 위반으로 셌다.

**다만 지적이 무용하지는 않다.** 가드의 적용 경계가 코드에 적혀 있지 않았다는 것은 맞다.
→ `vitest.config.ts`에 "이 가드는 Vitest 경로만 커버하며, 서버 실행은 의도적으로
ambient `DATABASE_URL`을 쓴다"는 주석을 추가했다.

### codex MAJOR-2: "`vitest --config <다른파일>`로 우회 가능" → **수용, 단 MINOR로 재평가**

주장은 사실이다. Vitest 설정은 전역 정책이 아니라 프로젝트별이므로
`--config`를 명시하면 이 가드를 타지 않는다.

그러나 실제 노출은 없다 (실측):
- `packages/web-ui/vitest.config.ts`에는 **dotenv 로드도 DB 참조도 없다** (jsdom + RTL 전용)
- web-ui `src`에 DB 참조 0건

즉 우회 자체는 실재하나, 우회해서 도달할 DB 접촉 경로가 현재 없다.
**구조적 해법은 가드 중앙화**(공용 모듈 또는 `setupFiles`)이며 이는 이미 **APS-1-25** 범위다
(해당 티켓에 "DB 참조 테스트 4개 중 2개에만 가드가 있다"로 기재됨).

→ MINOR로 재평가하고 APS-1-25로 이관. 본 티켓에서 config를 전역 정책으로 만드는 것은
범위를 넘고, 방어선을 하나씩 검증하며 넣는다는 플랜 원칙에도 어긋난다.

### codex MINOR: "`override: true`가 DATABASE_URL만 덮는 것이 아니다" → **수용, 반영 완료**

`override: true`는 `.env.test`가 정의한 **모든 키**를 덮는다. 현재 그 파일에는
`DATABASE_URL` 한 줄만 있어 즉시 발생하는 회귀는 없으나, 영향 범위가 `DATABASE_URL`보다 넓다.

→ `vitest.config.ts` 주석에 명시: *"`override: true` also applies to every other key
.env.test defines, not just DATABASE_URL — keep that file to test-only values."*

### codex가 반증 실패한 각도 (기록)

- `pnpm --filter` 실행 vs 저장소 루트 실행: `resolve(__dirname, '../../.env.test')`가
  **동일한 루트 파일**을 가리킴 확인
- 셸 `DATABASE_URL` 우선 문제: `override: true`로 해결됨 확인 (`injected env (1)`)
- 파일 부재: 실제 제거 후 APS-1-32 오류 확인, 복구 후 권한 `600` 확인
- web-ui DB 접근: 테스트/설정에 DB import 없음, 14개 통과
- `verify.yml` fork PR 서술: **정확함** 확인
- `PROD_COMPUTE_HOSTS` 표: 현재 코드의 하드코딩 두 호스트와 **일치**하며,
  재생성 endpoint·Render DB·다른 프로젝트 DB를 잡지 못한다는 한계 서술도 **정확함** 확인

즉 「알려진 한계」 절과 「fork PR」 절에 새 거짓 서술은 없다.

### 변이 검증 (독립 수행, 3번 레인 요건에 포함)

`.claude/rules` 및 글로벌 규칙이 3번 레인의 한 형태로 인정하는 **변이 검증**을
수정 전/후 양쪽 상태로 실제 실행했다. 안전 규칙: 프로덕션 호스트명을 쓰지 않고
RFC 2606 `.invalid` TLD 센티널을 사용 — DNS가 해석하지 않으므로 실재 호스트로 연결될 수 없다.

| 케이스 | 수정 전 | 수정 후 |
|---|---|---|
| 셸에 `DATABASE_URL` 존재 | `getaddrinfo ENOTFOUND sentinel.invalid` **×2** → 셸 값이 이김 | `sentinel.invalid` **0건**, `injected env (1)`, 217 tests 통과 |
| `.env.test` 부재 | 조용히 셸 값으로 진행 (`sentinel.invalid` ×2), `V1b FAIL` | `APS-1-32: .env.test could not be read…` **fail-fast**, `V1b PASS` |
| `DATABASE_URL` 키 누락 | — | **fail-fast** |
| `DATABASE_URL=` 빈 값 | — | **fail-fast** |

**수정 전 상태를 먼저 찍어 결함을 재현했으므로, "고쳤다"는 주장이 아니라 대조 결과다.**

통과 기준을 "테스트가 실패했다"가 아니라 **`sentinel.invalid` 문자열의 등장(수정 전 양성) /
부재(수정 후 음성)**로 잡았다. 플랜 리뷰 2차에서 `| tail -20`이 증거를 잘라버려
APS-1-19의 flaky와 구분되지 않는다는 MAJOR를 받고 교체한 결과다.

---

## 검증 실행 증거

| # | 검증 | 결과 |
|---|---|---|
| V1 | 변이 검증 (셸 값 무시) | ✅ 위 표 |
| V1b | 변이 검증 (파일 부재 fail-fast) | ✅ 위 표 |
| V2 | dotenv 로드 지점 전수 | ✅ `vitest.config.ts:2,18` 한 곳뿐 (ts/yml/json/js/mjs/cjs 전수) |
| V3 | `pnpm -r build` | ✅ exit 0 |
| V4 | `pnpm -r lint` | ✅ 0 errors (mcp-server 47 files, web-ui 19 files) |
| V5 | `pnpm -r test` **5회 연속** | ✅ 5/5 전부 mcp-server 217 + web-ui 14 통과, `duplicate key` 0건 |
| V6 | 키 누락 / 빈 값 분기 | ✅ 둘 다 fail-fast |
| V6b | **따옴표 공백 / 탭 값** (`.trim()` 추가 후 신설) | ✅ 차단. 추가 전에는 통과했음을 대조 확인 |
| — | `.trim()` 변경 후 전체 재검증 | ✅ build / lint 0 errors / 217 tests / `sentinel.invalid` 0건 |

`.env.test`는 매 실험 후 원복했고 최종 권한은 `-rw-------`다. diff에 자격증명 유입 0건 확인.

---

## 이 티켓이 닫아도 남는 구멍 (명시)

`.env.test`가 **존재하지만 프로덕션을 가리키도록 잘못 작성된** 경우는 막지 못한다.
유일한 방어는 `PROD_COMPUTE_HOSTS` deny-list이고 그것은 하드코딩된 엔드포인트만 잡는다.

| `DATABASE_URL`이 가리키는 곳 | 결과 |
|---|---|
| 하드코딩된 그 production compute | 가드가 잡아 실패 |
| **재생성된 Neon 엔드포인트** | 가드 통과 → **초록으로 지나감** |
| **Render 프로덕션 / 다른 프로젝트 DB** | 가드 통과 → **초록으로 지나감** |

**따라서 이 티켓이 done이 되어도 "격리 복구 완료"라고 말해서는 안 된다.**
allow-list 전환(**APS-1-25**, P3→P1 상향 완료)까지 끝나야 그 말을 할 수 있다.
2026-05-18 회고가 저지른 오류가 정확히 이것이었다 — 한 층을 고치고 전체가 닫혔다고 선언한 것.

## CI에 대한 정직한 한계

`verify.yml`이 권위 게이트지만 로컬에서 CI를 실행할 수 없다.
CI green은 PR 단계에서 확인하며 **본 티켓의 done 전환 근거로 삼지 않는다.**
