# APS-1-7 종료 검증 closure — APS-2-7 사고 회고 후속

**티켓**: APS-1-7 (2026-05-19 발행) / **종료 검증**: 2026-08-24 / **rev.2**: 독립 verifier FAIL 반영
**성격**: 코드 변경이 아닌 **메타 티켓**. 11개 항목의 실제 처리 여부를 전수 검증하고
미처리분을 분해한 뒤 종료한다. 티켓 설명 자체가 "본 티켓을 epic 또는 sub-task로
분해하여 진행 권장"이라고 적고 있었다.

## 전수 검증 결과

| # | 항목 | 판정 | 근거 (2026-08-24 실측) |
|---|---|---|---|
| 1 | services.test.ts scoped cleanup | ✅ 완료 | `packages/mcp-server/src/__tests__/services.test.ts:78-99` — `afterEach`에서 project id 배열로 스코프된 `DELETE`. activity_log→tasks→epics→projects 순서까지 구현됨 |
| 2 | CI `.env.test` secrets 주입 문서화 | ⚠️ **부분 (재평가)** | CI 주입 절차 자체는 완료 (`docs/ci-test-isolation.md`, `verify.yml:30-34`). 그러나 **로컬에서 `.env.test`가 기존 `DATABASE_URL`을 덮지 못한다** — `vitest.config.ts:9`의 dotenv `config()`가 기본 `override: false`. 셸에 프로덕션 URL이 export돼 있으면 `.env.test`가 무시되고 사고 경로가 그대로 열린다. **APS-1-32로 분해** |
| 3 | unscoped `DELETE FROM` 기계적 가드 | ⚠️ 부분 | **가드는 이미 존재한다.** `$(git rev-parse --git-common-dir)/hooks/pre-commit` (2026-05-19 생성, 헤더 `Unscoped DELETE FROM guard (APS-2-7 사고 방지)`). 격리 저장소 실행으로 실제 차단 확인. 결함은 **버전 관리 부재** — `git ls-files` 0건, `core.hooksPath` 미설정 → 이 머신에만 존재. **APS-1-17로 분해** |
| 4 | codex-review-guard false positive | ✅ 완료 | `.claude/hooks/codex-review-guard.sh` — APS-5-2에서 파일명 grep을 경로 기반 정확 매칭으로 교체. 주석에 변경 전/후 근거 기록됨 |
| 5 | REST endpoint 인증 부재 | ✅ 완료 (단서) | `api-server.ts:99` `app.use('/api', apiKeyAuth)`로 `/api/*` 고유 경로 47개 전부 커버. `remote-client.ts:14,77,89,103,117` x-api-key 전송. **단 옵트인 구조** — `auth.ts:5-11`이 `API_KEY` 미설정 시 `next()`로 통과시킨다. Render에 `API_KEY`가 설정돼 있어야 실효 |
| 6 | TLS `rejectUnauthorized: false` | ⚠️ **부분 (재평가)** | `connection.ts:31`이 `{ rejectUnauthorized: true }`인 것은 맞으나 **그 값이 pg에 도달하지 않는다.** 연결 문자열의 `sslmode`가 명시 `ssl` 옵션을 덮는다 — 명시값을 `true`로 주든 `false`로 주든 결과가 똑같이 `{}`. 또한 else 분기(`undefined`)는 최종적으로 `ssl: false`(평문)다. **APS-1-33으로 분해** |
| 7 | 에러 메시지 ID leak | ⚠️ 부분 (**심각도 재평가**) | `api-server.ts` 직접 throw는 정리됨. 그러나 **서비스 계층 2곳이 내부 UUID를 REST로 노출**: `task-service.ts:328`, `workflow-service.ts:165`. `api-server.ts:118-128` `wrapAsync`가 `error.message`를 그대로 응답에 넣는다. `index.ts` 4곳보다 이쪽이 나쁘다. **APS-1-18로 분해** |
| 8 | Transitive HIGH CVE 6건 | ⚠️ 재발 | 원 6건(hono·@hono/node-server·express-rate-limit·path-to-regexp·picomatch)은 `package.json` `pnpm.overrides`로 처리 완료. 그러나 재감사에서 critical 1 + high 16 신규 발생. **APS-1-16으로 분해** |
| 9 | TS entity type ↔ pg Date 불일치 | ✅ 완료 | `db/connection.ts:6-7` `pg.types.setTypeParser(1184/1114, val => val)` — timestamptz/timestamp를 문자열로 반환시켜 `entities.ts`의 `created_at: string` 선언과 일치시킴 |
| 10 | Neon PITR retention 확장 | ✅ 종결 | `history_retention_seconds: 21600`(6h) 유지 확정. Neon Free 플랜 상한이며, 2026-07-02 Launch→Free 전환은 의도된 선택이었음. 사용자 결정으로 **현행 유지 + 항목 종료** |
| 11 | TMSL/CFM/ALP 프로젝트 손실 확인 | ✅ 확인 완료 | `list_projects` 결과 7개 프로젝트 중 해당 코드 없음. 사고(2026-05-18) 이후 3개월간 재생성 요구가 제기된 바 없어 **재생성 불필요**로 종결 |

**요약**: 11개 중 6개 종결(완료 4 = #1·#4·#5·#9 + 정책 종결 1 = #10 + 확인 종결 1 = #11),
5개 분해 이관(#2·#3·#6·#7·#8). 이 중 #2·#3·#6·#7은 부분 완료 상태다.

> **판정 정정 이력** (독립 verifier 2라운드):
> - 1차 정정: #3 "미처리"(X) → 부분, #7 "REST/서비스 계층 모두 완료"(X) → 서비스 계층 2곳 잔존
> - 2차 정정: **#2 "완료"(X) → 부분**. `.env.test`가 실제로는 override하지 않음
> - 3차 정정: **#6 "완료"(X) → 부분**. `rejectUnauthorized: true`가 pg에 도달하지 않음
>
> 네 판정 모두 "없다/끝났다" 방향의 오류였다. 회고는 문서 말미 참조.

## 분해된 후속 티켓

| 티켓 | 원 항목 | 제목 | 우선순위 |
|---|---|---|---|
| APS-1-16 | #8 | 의존성 CVE 정리 — vitest CRITICAL + high 16건 | 2 |
| APS-1-17 | #3 | 테스트 unscoped DELETE FROM 기계적 가드 (+ 서브 APS-1-20~25) | 2 |
| APS-1-18 | #7 | MCP/서비스 계층 에러 메시지 내부 UUID 노출 정리 (+ 서브 APS-1-26~31) | **1** (4→1 상향 완료) |
| APS-1-19 | 신규 | 테스트 flaky — ProjectRepository.create TOCTOU | 2 |
| **APS-1-32** | **#2 (신규)** | **[P0] `.env.test`가 기존 `DATABASE_URL`을 덮지 못함** | **1** |
| **APS-1-33** | **#6 (재평가)** | **DB TLS 설정이 pg에 도달하지 못함 + else 분기 평문** | **2** |
| **APS-1-34** | **#4 (별개 결함)** | **codex-review-guard 티켓 매칭 substring false pass** | **2** |

> ✅ **부모 티켓 본문 정정 완료**. APS-1-17·18의 설명에 반증된 문장이 남아 있었고, 모두 고쳤다.
> - APS-1-17 설명: "기계적 장치가 현재 전무" → "가드는 이미 존재하며 동작함. 목표는 버전 관리 편입 + 결함 수정 + CI 이중화"
> - APS-1-18 제목: "(index.ts 4곳)" 제거 → "MCP/서비스 계층 에러 메시지 내부 UUID 노출 정리"
> - APS-1-18 설명: "REST 경계와 서비스 계층은 이미 정리되어" → 심각도 역전 사실로 교체
> - APS-1-18 우선순위: `set_priority`로 4 → 1
>
> **정정 경로**: `mcp__ai-pm__set_priority`(MCP 도구) + `PATCH /api/tasks/:id`(REST).
> 후자는 `api-server.ts:253-263` → `taskService.update` → `taskRepo.update`의 allowlist에
> `title`·`description`이 포함돼 있다(`task-repo.ts:180-190`).
>
> ⚠️ **초판에서 이것을 "도구 한계로 불가"라고 보고했는데 사실이 아니었다.**
> MCP 도구 목록에서 `update_task`를 못 찾은 것을 능력 부재로 결론짓고, 배포된 REST 표면을
> 확인하지 않았다. 아래 회고의 **네 번째 사례**다.

**두 티켓 모두 발행 시점의 범위 서술이 잘못됐다.** 정정된 범위를 서브태스크로 부착했다.

- **APS-1-17**: "가드 신규 구축"(X) → **"이미 동작하는 pre-commit 훅을 저장소에 커밋하고
  (`husky` 또는 `core.hooksPath`) CI 검사를 추가"**(O). 지금 범위대로 진행하면 이미 있는 것을
  다시 만든다. 부수 결함으로 훅 정규식이 라인 단위라 `DELETE FROM x` 다음 줄의 `WHERE`를
  놓치고(false positive) `WHERE 1=1`은 통과시킨다.
- **APS-1-18**: "index.ts 4곳"(X) → **서비스 계층 2곳(`task-service.ts:328`,
  `workflow-service.ts:165`)을 우선 처리**(O). 이쪽이 호출자가 준 적 없는 내부 UUID를
  노출하므로 더 나쁘다. index.ts 4곳은 자기가 보낸 ID를 되돌려받는 것이라 후순위.

## 검증 과정에서 별도로 드러난 사실

1. **`.env.test` 부재로 DB 테스트 2개 스위트가 죽어 있었다.**
   `services.test.ts`·`context-service.test.ts`가 수집 단계에서 throw하여
   `pnpm -r test`가 실패 상태였다. Neon `ci-test` 브랜치(`br-raspy-thunder-ao2nzazc`,
   compute `ep-red-queen-ao7svrsd`) 연결로 해소. 프로덕션 compute(`ep-old-haze-aol2r7dt`)가
   아님을 값 단위로 검증했고, 파일은 `.gitignore:9`로 추적 제외된다.
   해소 후 mcp-server 217 tests / web-ui 14 tests 전부 통과.

2. **항목 #3의 현재 방어선은 전부 "사람이 지키는" 층이다.**
   `PROD_COMPUTE_HOSTS`(services.test.ts:12-22)는 프로덕션 compute 호스트를
   **하드코딩**하므로 Neon 엔드포인트가 바뀌면 조용히 무력화된다. APS-1-17에 기록함.

3. **#8 재발의 구조적 원인은 두 층이다** — 탐지와 처방 양쪽이 낡았다.

   (a) **탐지 부재**: `verify.yml`에 `pnpm audit` 단계가 없다.

   (b) **처방 자체가 낡는 구조** (독립 verifier 보강): 기존 override floor가 전부
   당시의 패치 버전에 박혀 있고, 지금은 현재 advisory가 요구하는 선 **아래**에 있다.

   | 패키지 | override floor | 설치 | 현재 요구 |
   |---|---|---|---|
   | `fast-uri` | `>=3.1.2` | 3.1.2 | `>=3.1.5` (HIGH 3건) |
   | `hono` | `>=4.12.25` | 4.12.26 | `>=4.12.34` |
   | `@hono/node-server` | `>=1.19.10` | 2.0.3 | `>=2.0.10` |

   floor를 한 번 박고 lockfile이 그것을 얼리며 CI의 `--frozen-lockfile`이 유지시킨다.
   **audit을 넣어도 floor 갱신 절차가 없으면 같은 일이 반복된다.**

   → APS-1-16의 rev.5가 **override를 전부 제거**하는 방향으로 확정되어 이 패턴 자체가 사라진다
   (샌드박스 실측: override 0건에서 audit이 info/low/moderate/high/critical 전부 0).
   탐지 게이트(CI audit)는 여전히 별도로 필요하다.

4. **`.env.test`가 기존 `DATABASE_URL`을 덮지 못한다 — 사고 메커니즘이 살아 있다.** (독립 verifier 발견)
   `vitest.config.ts:9`의 dotenv `config()`는 기본 `override: false`다. 실측:
   셸에 `DATABASE_URL`이 있으면 `injected env (0)`으로 `.env.test`가 통째로 무시되고,
   테스트는 그 URL에 붙는다. **APS-2-7 사고와 정확히 같은 경로다.**
   `context-service.test.ts:4-7` 주석은 "`.env.test` which **overrides** DATABASE_URL"이라고
   사실과 반대로 적혀 있어, 읽는 사람이 격리를 2중으로 오인하게 만든다.
   실제 격리는 1중이며 그 1중이 하드코딩 deny-list(`PROD_COMPUTE_HOSTS`)다.
   CI는 러너에 `DATABASE_URL`이 미설정이라 안전하고, 위험한 곳은 **로컬 — 사고가 실제로 난 환경**이다.
   → **APS-1-32(P0)로 분해**.

5. **테스트 스위트가 flaky하다 — CI가 간헐적으로 붉어진다.** (독립 verifier 발견)
   `db/repositories/project-repo.ts:31-42`가 `SELECT 1 FROM projects WHERE code = $1` 루프로
   빈 코드를 찾은 뒤 **별도의 비원자적 INSERT**를 한다. 트랜잭션도 `ON CONFLICT` 재시도도 없다.
   `code`에는 unique 인덱스(`migrate.ts:15` `idx_projects_code`)가 있고 vitest는 테스트 파일을
   **병렬 워커**로 돌린다(`vitest.config.ts`에 `fileParallelism` 미설정 = 기본 병렬).
   여러 테스트 파일이 같은 ci-test DB에 동시에 프로젝트를 만들면 TOCTOU 경합이 난다.
   실제로 verifier 1회차에서 `duplicate key value violates unique constraint "idx_projects_code"`로
   실패했고 재실행에서는 통과했다. `verify.yml`이 `pnpm -r test`를 돌리므로 **CI 간헐 실패**로 이어진다.
   → **APS-1-19로 분해**.

6. **`codex-review-guard.sh`에 false pass가 있다 — 티켓 매칭이 substring이다.** (독립 verifier 발견)
   `codex-review-guard.sh:48` `grep "$TICKET"`이 substring 매칭이라, 해당 티켓의 리뷰 산출물이
   없어도 **접두사가 같은 다른 티켓의 파일로 게이트가 열린다**. 시뮬레이션에서
   `APS-1-1`(자기 파일 부재)이 `APS-1-10-review.md`로 통과했다.
   이번 세션에 APS-1-20~34를 발행했으므로 `APS-1-2`·`APS-1-3`도 곧 같은 상태가 된다.
   → **APS-1-34로 분해**.

7. **`codex-review-guard.sh`의 false negative도 실재한다.** false positive는 해소됐으나
   `api-server.ts`(auth 미들웨어가 마운트되는 파일 — 99행을 지우면 API 인증이 통째로 사라진다),
   `db/connection.ts`(TLS 설정 본체), `services/_security-base.ts`가 전부 non-critical로 분류된다.
   훅 71행이 이 한계를 스스로 적어두고 있다. 추가로 `CHANGED_FILES`가 `git diff HEAD` 기반이라
   `approve_review` 시점에 이미 커밋돼 있으면 분류기가 아무것도 보지 못한다.

## 종료 판정

메타 티켓으로서의 역할(사고 회고 항목 추적)을 완수했다. 잔여 작업은 모두 추적 가능한
후속 티켓(APS-1-16 · 17 · 18 · 19 · 32 · 33 · 34)으로 이관되었으므로 **done 전환**한다.

**이 검증에서 배운 것**: 판정 4건이 틀렸고 넷 다 "없다/끝났다"는 방향의 오류였다.
- #3은 워크트리에서 `.git`이 **파일**(gitdir 포인터)이라 `ls .git/hooks/`가 실패하는 것을
  "훅이 없다"로 오독했다. 올바른 방법은 `git rev-parse --git-common-dir`이다.
- #7은 `api-server.ts`만 grep하고 "REST 계층 정리 완료"로 단정했다. 실제로는 서비스 계층이
  던진 메시지가 `wrapAsync`를 타고 그대로 REST 응답이 된다. **에러 문자열이 어디서
  만들어지는지가 아니라 어디로 나가는지**를 봤어야 했다.
- #2는 **주석이 "overrides"라고 적혀 있으니 override한다**고 믿었다. dotenv의 실제 기본값은
  `override: false`이며, 한 줄 실행해 보면 `injected env (0)`이 바로 나온다.

- #6은 `connection.ts:31`의 **리터럴을 읽고** `rejectUnauthorized: true`니까 안전하다고 판정했다.
  그 값이 드라이버까지 가는지 실행해 보지 않았다. 실행해 보면 명시값을 `false`로 줘도
  결과가 같다 — 값이 애초에 무시되고 있었다.

여기에 다섯 번째가 하나 더 있다. 판정은 아니지만 같은 유형이다:
- **"도구 한계로 부모 티켓 수정 불가"**라고 사용자에게 보고했으나 사실이 아니었다.
  MCP 도구 목록에서 `update_task`를 못 찾은 것을 능력 부재로 결론짓고,
  `set_priority`가 이미 있다는 것과 `PATCH /api/tasks/:id`가 `title`·`description`을
  허용한다는 것을 확인하지 않았다. **사용자를 불필요한 수작업으로 보낼 뻔했다.**

다섯 사례의 공통점: **도구·API의 실제 동작을 실행해 확인하지 않고 텍스트만 읽었다.**
`ls`가 실패한 것을 부재로, grep이 안 걸린 것을 부재로, 주석에 적힌 것을 사실로,
소스의 리터럴을 실효값으로, 도구 목록에 없는 것을 능력 부재로 받아들였다.

**부재 증명과 동작 주장에는 실행 근거가 필요하다.** 이 티켓에서 독립 검증을
세 라운드 돌리지 않았다면 다섯 건 모두 "완료"로 종결됐을 것이다.

검증 방식: 코드 변경 없이 항목별 정적 검증 + 실측(`pnpm audit`, `pnpm -r test`,
`list_projects`, Neon `describe_project`). APS-3-1 closure와 동일한 처리 패턴.
