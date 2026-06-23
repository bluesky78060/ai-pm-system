# APS-5-13 구현 플랜 — 하네스 개선 ③ 서버측 독립 검증 (CI 역연동)

> **rev2 — critic 반영** (2026-06-23). 1차 critic 리뷰가 CHANGES_REQUESTED 판정한 결함 5건(CRITICAL-1, MAJOR-1~4) + 추가 gap 3건을 모두 해소한 개정판.
>
> **rev1 → rev2 변경 요약**:
> | # | 결함 | rev2 해소 |
> |---|------|-----------|
> | CRITICAL-1 | owner/repo SSOT 모순 + 잘못된 시드 | owner/repo 단일 소스를 **PR URL 파생**으로 확정. `github_repo`-as-SSOT 주장 삭제. 시드 오타(`leechanhee/ai-pm-system`→`bluesky78060/ai-pm-system`) 수정을 DoD에 추가하되 empty-DB dead-code임을 명시 |
> | MAJOR-1 | fail 모드(error/timeout) 미정의 | 5번째 상태 `error` 추가. enforce=fail-closed, non-enforce=bypass. octokit request timeout. error 경로 단위테스트 추가 |
> | MAJOR-2 | 추천 분기 B 서버측 구현 불가 | 서버 enforcement를 **C(프로젝트 단위)**로 확정. fast-track/1중 면제는 **hook(changed-files 접근)**이 담당하는 2층 구조. 사용자 승인범위(B)와 달라지는 점을 상단 NOTE로 명시 |
> | MAJOR-3 | PR-before-done 의존성 역전 | F-008(enforce 티켓 PR-before-done)을 F-002의 **P0 선행 의존**으로 승격. 로드맵 순서 F-008→F-002로 정렬 |
> | MAJOR-4 | 이중소스 union 로직 오류 | 두 소스를 **UNION**(0개=중립)으로 변경. Actions-only repo의 combined-status 빈 경우 pending 강제 금지 테스트 추가. 구현 전 GitHub 동작 context7/docs 확인 명시 |
> | gap-1 | freshly-pushed sha checks 미생성 | `none` 아닌 **`pending`(N초 유예)** 취급 |
> | gap-2 | 차단 이벤트 audit 유실 | `ci_gate_check` 활동로그를 throw **이전**에 기록 |
> | gap-3 | done 우회 경로 | `approveReview` 외 `updateStatus(...,'done')` 우회 경로 없음을 코드 근거와 함께 단언 |

> **상태**: 플랜 (구현 전) · **분류**: 신규 인프라 → **3중 검증 필수** (code-reviewer + security-reviewer/codex review + adversarial challenge)
> **우선순위**: P3 · **노력**: 높음 · **리스크**: 중~높음
> **선행 산출물**: Discovery `docs/00-discovery/APS-5-13-direction.md`, 개선안 원본 `docs/harness-improvements-2026.html` §③, 기존 자산 `docs/ci-test-isolation.md`
> **작성 가정**: 신참 엔지니어가 이 문서만으로 구현 가능하도록 파일 경로·명령·라인 위치를 구체화.

---

## ⚠ rev2 핵심 NOTE — 사용자 승인 범위(분기 ② B)와의 차이

Discovery에서 사용자가 확정한 방향은 분기 ② **B(중요변경만 enforce)**였다. 그러나 1차 critic 리뷰가 **MAJOR-2**로 지적한 대로, **서버는 git diff(changed-files)에 접근할 수 없어** "중요변경만"을 서버 단독으로 판정할 수 없다. (codex-review-guard.sh는 hook이라 changed-files를 보지만, `approveReview()`는 DB·env만 본다.)

따라서 rev2는 **enforcement를 2층으로 분리**한다 (사용자 승인 범위 B를 폐기하지 않고 **2층 합성으로 동등 달성**):

| 층 | 위치 | 입도(granularity) | 판정 근거 |
|----|------|-------------------|-----------|
| **Coarse (권위)** | 서버 `approveReview()` (Phase 3) | **프로젝트 단위** (C) | `CI_GATE_PROJECTS` env + `ci_gate_required` task 메타 플래그 |
| **Fine (1차 UX·면제)** | hook `ci-gate-guard.sh` (Phase 4) | **티켓 단위** (changed-files 접근) | fast-track 마커 + 1중 분류면 면제(통과) |

- **합성 결과**: enforce 프로젝트(APS)에서 **`ci_gate_required` 플래그가 켜진 티켓만** 서버 게이트 적용. 플래그는 `create_task` 시 중요변경(2중/3중) 분류면 세팅(아래 F-008-bis). 단순/fast-track 티켓은 플래그 미세팅 → 서버 게이트 자동 면제. **이로써 사용자 승인 범위 B("중요변경만")를 서버 단독 git-diff 없이 달성.**
- **사용자 확인 필요 사항(§8 Open Question O-1)**: `ci_gate_required` 플래그를 (a) task 스키마 신규 컬럼으로 둘지, (b) 기존 `priority<=2`를 proxy로 쓸지. rev2는 (b) proxy를 MVP 기본값으로 제안하되, 오판 시 (a) 마이그레이션을 후속 티켓으로 분리.

---

## 0. 한 줄 요약

`submit_test`는 에이전트가 제출한 **출력 문자열**을 신뢰한다(STRICT 모드도 형식·pass만 강제, 재실행 아님). GitHub Actions가 **동일 커밋에서 build/lint/test를 독립 재실행**하고, 그 CI green을 `done` 전환의 게이트로 역연동하여 "검증자는 에이전트와 독립적이며 실제 테스트 스위트를 재실행한다"는 2026 검증 원칙을 완성한다.

---

## 1. 기능 명세 (Feature Spec)

| ID | 기능 | 우선순위 | 설명 | 엣지케이스 |
|----|------|----------|------|-----------|
| **F-001** | CI 워크플로 `verify.yml` | **P0** | GitHub Actions가 push/PR마다 `pnpm -r build` + biome lint + `vitest run`을 동일 커밋에서 독립 재실행 | fork PR(secret 미접근), 동시 push, monorepo 캐시 |
| **F-008** | enforce 티켓 **PR-before-done** 의무화 | **P0 (F-002 선행 의존)** | enforce(`ci_gate_required`) 티켓은 approve_review **이전**에 PR 연결(`link_pr_to_task`)이 되어 있어야 함. 게이트가 CI를 조회하려면 ref(PR head sha)가 필요하므로 **F-002의 선결 조건** | PR 미연결 → 명확한 "PR 먼저 연결" 에러. 비-enforce 티켓 면제 |
| **F-002** | CI green 게이트 (done 차단) | **P0** | `done` 전환 직전, enforce 티켓이면 해당 커밋의 GitHub **check-runs ∪ commit-status**가 green(success)이 아니면 거부 | PR 없음, CI 미완(pending), CI red, **CI 조회 실패(error)** |
| **F-003** | 정확한 CI 상태 조회 보강 | **P0** | 현재 `get_pr_status`는 `pr.mergeable_state`(coarse proxy)만 반환 → 실제 **check-runs ∪ commit-status** UNION 집계 함수 신설 (`getCommitCiStatus`) | check 0개(=미설정), 일부 pending, neutral/skipped, **freshly-pushed(checks 미생성)**, **네트워크/403 error** |
| **F-004** | opt-in enforce 환경변수 | **P0** | `CI_GATE_PROJECTS`(STRICT_SUBMIT_TEST_PROJECTS와 동일 패턴) 미포함 프로젝트는 기존 동작 유지. APS는 enforce | env 미설정 → 전체 bypass(회귀 0) |
| **F-008-bis** | `ci_gate_required` 티켓 메타 분류 | **P0** | enforce 프로젝트 내에서 **어떤 티켓이 게이트 대상인지** 판정(중요변경=2중/3중). MVP: `priority<=2` proxy (§8 O-1) | 분류 오판 시 후속 마이그레이션으로 정밀화 |
| **F-005** | `ci-gate-guard.sh` PreToolUse hook | **P1** | 기존 가드와 일관된 hook으로 approve_review를 사전 차단(서버 게이트의 1차 방어선 + **fast-track/1중 면제 fine-grained 층**) | hook 미등록 환경, git repo 아님, 토큰 부재 |
| **F-006** | lint papercut 해소 | **P1** | 개선 ①에서 발견: STRICT는 `lint` pass를 요구하나 `pnpm --filter @ai-pm/mcp-server lint` 스크립트 부재. 루트 `biome check .`만 존재 → mcp-server 패키지에 `lint` 스크립트 공식화 | CI와 로컬 lint 명령 정합 |
| **F-007** | submit_test 역할 재정의 문서화 | **P1** | 에이전트 제출 = 1차(즉시 피드백), CI = 2차(권위) 이중 검증을 CLAUDE.md/rules에 명문화 | — |
| **F-009** | CI 게이트 판정 활동 로그 | **P2** | CI 게이트 판정 결과를 activity 로그에 기록(감사 추적). **차단 시 throw 이전에 기록**(gap-2) | 차단 이벤트 audit 보존 |

> rev1의 F-008(`link_pr_to_task` 의무화 P2)은 **MAJOR-3** 반영으로 **P0 선행 의존으로 승격**됨(위 표).

---

## 2. 방향 분기 결정표 (rev2 확정 상태)

> Discovery §방향 분기. rev2는 critic 리뷰를 반영해 **분기 ①·③는 추천안 그대로 확정**, **분기 ②는 MAJOR-2로 인해 "C(서버) + hook fine-grained 면제"의 2층 구조로 재확정**(상단 NOTE 참조).

### 분기 ①: 게이트 위치 — 서버 로직 vs 신규 hook → **확정: C(양쪽, 심층 방어)**

| 옵션 | 설명 | 장점 | 단점 |
|------|------|------|------|
| A. 서버측만 | `workflow-service.ts` `approveReview()` line 367(getById) 다음, line 374(updateStatus 'done') 직전에 CI 확인 내장 | 우회 불가(서버가 SSOT). 원격 클라이언트에서도 강제 | hook 패턴과 불일치 |
| B. hook만 | `ci-gate-guard.sh` PreToolUse(approve_review 매처) | 기존 가드 일관. 로컬 빠른 차단 | hook은 **로컬 Claude Code 전용** — 서버 직접 호출 우회 가능 |
| **C. 양쪽(심층 방어)** ⭐ | 서버 게이트(F-002, 권위·coarse) + hook(F-005, 1차 차단·fine-grained 면제) | hook=즉시 UX + fast-track 면제, 서버=위조 불가 최종 판정 | 구현 2곳(판정 규칙 공유로 DRY) |

> **확정 C**. 근거: hook만으로는 서버 직접 호출 우회가 가능해 위조 차단 불완전. 서버 게이트가 권위(coarse, 프로젝트+플래그)를 보장하고, hook은 기존 가드 일관 즉시 UX **+ changed-files 기반 fast-track/1중 면제**(서버가 못 하는 fine-grained 면제). 판정 규칙(green/pending/failure/none/**error**)은 동일 사양 공유.

### 분기 ②: PR 필수화 범위 — **확정: 2층 구조 (서버=C 프로젝트단위 + 플래그 / hook=B fine-grained 면제)**

| 옵션 | 설명 | rev2 판정 |
|------|------|-----------|
| A. 모든 티켓 | 전 티켓 PR+CI 강제 | ❌ fast-track 60% 단축 무력화. 과함 |
| B. 중요변경(2중/3중)만 | 서버 단독 changed-files 판정 | ❌ **서버 git diff 미접근(MAJOR-2)** → 서버 단독 불가 |
| **C. 프로젝트 전체 + `ci_gate_required` 플래그** ⭐ | enforce 프로젝트 내 플래그 켜진 티켓만 서버 게이트. fast-track/1중 면제는 hook이 changed-files로 처리 | ✅ **B의 의도(중요변경만)를 2층 합성으로 달성**. 서버는 coarse, hook은 fine |

> **확정: C(2층 합성)**. 근거(MAJOR-2): 서버는 `approveReview()`에서 DB·env만 보고 git diff를 못 보므로 "중요변경만"을 단독 판정 불가. 대신 (1) 서버는 `CI_GATE_PROJECTS` ∩ `ci_gate_required` 플래그로 **coarse** 강제, (2) hook은 `.claude/active-ticket-fasttrack` 마커 + changed-files로 **fine-grained 면제**. **합성 결과 = 사용자 승인 B("중요변경만")와 동등**. 플래그 결정은 §8 O-1.

### 분기 ③: lint 정합 — **확정: C(biome 공식화)**

| 옵션 | 설명 | rev2 판정 |
|------|------|-----------|
| A. tsc를 lint로 | `lint` = `tsc --noEmit` | ❌ lint ≠ type-check 의미 혼동 |
| B. eslint 신규 도입 | eslint + config | ❌ biome 중복. YAGNI |
| **C. biome 공식화(경량)** ⭐ | mcp-server 패키지에 `"lint": "biome check src"` 1줄 추가 | ✅ biome 이미 설정됨(`biome.json`, 루트 `lint: biome check .`). 의존성 0 |

> **확정 C**. 근거: biome가 이미 설정됨(`/Users/leechanhee/ai-pm-system/biome.json`). mcp-server **패키지에 `lint` 스크립트 부재**(`build`/`dev`/`test`만)라 STRICT submit_test의 lint pass 요구와 CI의 `pnpm --filter @ai-pm/mcp-server lint`가 **현재 깨진다**. 1줄 추가로 papercut 해소.

---

## 2.5 owner/repo SSOT 확정 (CRITICAL-1 해소)

> rev1은 line 66에서 "`project.github_repo`를 SSOT로 사용"이라 했으나, line 144에서는 `task.github_pr` URL 파싱(올바름)을 썼다 → **자기모순**. 게다가 시드(`api-server.ts:37`)는 잘못된 owner `leechanhee/ai-pm-system`을 박아넣는다. rev2는 이 모순을 **PR URL 파생 단일화**로 종결한다.

### 확정 규칙 (self-healing single source)

- **owner/repo의 단일 소스 = `task.github_pr` URL 파싱** (기존 `github-service.ts:82` 정규식 `github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)`).
  - 근거: PR URL은 실제 PR이 존재하는 repo를 가리키므로 항상 정확(self-healing). DB `github_repo` 설정값(오염 가능)에 의존하지 않음.
  - **`project.github_repo`-as-SSOT 주장은 삭제**. `github_repo`는 `create_github_issue` 등 **PR이 없는 경로에서만** 보조적으로 사용(현행 유지). CI 게이트(F-002/F-003)는 **오직 PR URL 파생** owner/repo만 사용.
- **검증된 실제 remote**: `https://github.com/bluesky78060/ai-pm-system.git` (git remote -v 확인). 정상 워크플로에서 `link_pr_to_task`로 연결되는 PR URL은 이 repo를 가리키므로 자동 정합.

### 시드 오타 수정 (DoD 항목, 단 dead-code 명시)

- **`api-server.ts:37`의 `github_repo: 'leechanhee/ai-pm-system'` → `'bluesky78060/ai-pm-system'`로 정정**한다.
- **단, 이 시드는 `seedIfEmpty()`(api-server.ts:28~58) 내부로, `existing.length > 0`이면 즉시 return**(line 31)한다. 운영 DB는 이미 시드되어 있으므로 **이 코드 경로는 empty-DB(신규 배포)에서만 실행되는 dead-code fallback**이다. 따라서:
  - CI 게이트 동작에 **직접 영향 없음**(게이트는 PR URL 파생 사용, github_repo 미사용).
  - 그럼에도 정정하는 이유: 미래 신규 배포 시 잘못된 owner가 박히면 `create_github_issue` 등 github_repo 의존 경로가 깨짐. **위생(hygiene) 차원의 1줄 수정**.
  - 운영 DB의 기존 `project.github_repo` 값이 오염되어 있다면 별도 데이터 수정(SQL `UPDATE`)이 필요할 수 있음 → §8 O-4.

---

## 3. 구현 로드맵 (Phase별 — MAJOR-3 반영 순서)

> **권장 진행 순서**: Phase 1(CI 구축, 독립) → **Phase 2a(F-008 PR-before-done 선행)** → Phase 2b(F-003 상태 조회 UNION) → Phase 3(서버 게이트 F-002/F-004/F-008-bis) → Phase 4(hook) → Phase 5(문서/정합).
>
> **의존 방향 확정(MAJOR-3)**: F-002 게이트는 PR head sha(ref)를 필요로 하는데, 정상 워크플로는 /ship(PR 생성)을 **done 이후**에 한다 → 게이트가 막힘. 해소: **enforce 티켓에 한해 PR-before-done(F-008)을 F-002의 P0 선행 의존으로 승격**. 로드맵 순서를 **F-008 → F-002**로 정렬. (대안: ref를 sync_commit_progress 최신 commit sha로 — 단 현재 sha는 activity 로그에만 있고 전용 컬럼 없음 → §8 O-3. rev2는 PR-before-done을 채택.)

### Phase 1 — CI 워크플로 구축 (F-001, F-006)

**산출물**: `/Users/leechanhee/ai-pm-system/.github/workflows/verify.yml` (신규 — `.github/` 디렉토리 자체가 현재 부재, 신규 생성)

**선행 작업 (F-006 lint papercut)**:
- `/Users/leechanhee/ai-pm-system/packages/mcp-server/package.json`의 `scripts`에 추가:
  ```json
  "lint": "biome check src"
  ```
  (현재 build/dev/test만 존재. `pnpm --filter @ai-pm/mcp-server lint` 호출이 현재 실패하므로 CI·STRICT 정합 위해 필수)

**verify.yml 구성** (기존 `docs/ci-test-isolation.md`의 `.env.test` 격리 인프라 확장):
```yaml
name: verify
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      # ⭐ CRITICAL: test DB 격리 (docs/ci-test-isolation.md 단계 2 — APS-2-7 사고 회고 준수)
      - name: Setup test env
        run: |
          cat > .env.test <<EOF
          DATABASE_URL=${{ secrets.TEST_DATABASE_URL }}
          EOF
      - name: Build
        run: pnpm -r build
      - name: Lint
        run: pnpm --filter @ai-pm/mcp-server lint   # = biome check src
      - name: Test
        run: pnpm --filter @ai-pm/mcp-server test    # = vitest run
```

**검증**: PR 생성 → Actions 탭에서 verify 잡 green 확인. `.env.test`가 test branch 주소인지 확인(production 금지 — APS-2-7 사고 회고).

**필수 GitHub Secrets**: `TEST_DATABASE_URL` (Neon test branch — ci-test-isolation.md 단계 1)

---

### Phase 2a — enforce 티켓 PR-before-done 의무화 (F-008) ⭐ F-002 선행

**문제(MAJOR-3)**: F-002 게이트는 `task.github_pr`(→ PR head sha)가 있어야 CI를 조회할 수 있다. 그러나 워크플로 8단계 `/ship`은 done 이후에 PR을 만든다 → enforce 티켓이 approve_review 시점에 PR이 없어 게이트가 무조건 막힘(데드락).

**해소**: **enforce 티켓(`ci_gate_required`)에 한해 PR 연결을 done의 선행 조건으로 강제**한다. 즉 enforce 티켓은 워크플로 순서를 **submit_test → /ship(PR 생성) → link_pr_to_task → approve_review(CI green 확인) → done**으로 조정.

**구현**:
- `approveReview()` CI 게이트 진입 직전(Phase 3 삽입 블록 맨 앞)에서 `found.github_pr` 부재 시:
  ```typescript
  if (!found.github_pr) {
    throw new Error(
      'enforce 티켓은 done 이전에 PR 연결이 필요합니다(CI 조회용). /ship으로 PR 생성 후 link_pr_to_task로 연결하세요.',
    );
  }
  ```
- **문서 갱신**: `.claude/rules/deploy-automation.md`에 "enforce 프로젝트(CI_GATE)는 /ship을 approve_review **이전**에 호출"하는 예외 순서 명시. 비-enforce 티켓은 기존 순서(done 후 /ship) 유지.

**검증**: enforce 티켓에 PR 미연결로 approve_review → throw 확인. 비-enforce 티켓은 PR 없어도 통과(회귀 0).

---

### Phase 2b — 정확한 CI 상태 조회 보강 (F-003) — UNION 집계 (MAJOR-4 해소)

**문제**: 현재 `get_pr_status`(`github-service.ts` line 59~143)는 `checks: pr.mergeable_state ?? 'unknown'`(line 124)만 반환. `mergeable_state`는 coarse proxy(브랜치 보호·리뷰 상태에도 영향). CI green 게이트는 **실제 check-runs conclusion**이 필요. (현재 `octokit.rest.checks.listForRef` **미호출** 확인.)

**산출물**: `github-service.ts`에 신규 메서드
```typescript
type CiState = 'success' | 'pending' | 'failure' | 'none' | 'error';
interface CiStatus { state: CiState; checks: unknown[]; total: number; passed: number; failedChecks: string[]; }

/**
 * getCommitCiStatus: 특정 ref(PR head sha)의 GitHub CI 상태를 UNION 집계.
 * checks.listForRef ∪ getCombinedStatusForRef — "해당 소스 항목 0개"는 중립(무시).
 * 둘 중 어느 소스든 ≥1 항목의 failure/pending만 카운트.
 */
async getCommitCiStatus(owner: string, repo: string, ref: string): Promise<CiStatus>
```

**UNION 집계 규칙 (MAJOR-4 핵심 — "둘 다 green" → UNION으로 교체)**:
- 두 소스: `octokit.rest.checks.listForRef`(check_runs[].conclusion) **∪** `octokit.rest.repos.getCombinedStatusForRef`(legacy commit statuses).
- **"해당 소스에 항목이 0개"는 무시/중립** — 빈 소스가 전체를 pending/failure로 끌어내리지 않는다.
  - 근거(MAJOR-4): Actions-only repo는 legacy combined-status가 비어 `state: 'pending'`을 반환할 수 있다. rev1의 "둘 다 green이어야 통과" AND 규칙은 이 빈 combined-status를 pending으로 **오판**해 green CI를 막는다. UNION으로 바꿔 빈 소스를 중립 처리.
- **집계 우선순위** (UNION 후):
  1. 두 소스 통틀어 **항목 0개** → `none` (CI 미설정).
     - **단 예외(gap-1)**: ref가 **freshly-pushed**(checks 아직 미생성)일 수 있다. ref의 commit pushed_at이 **N초(권장 90초) 이내**면 `none` 아닌 **`pending`**으로 취급(N초 유예). pushed_at은 `octokit.rest.repos.getCommit`의 `commit.committer.date` 또는 head sha 조회로 획득.
  2. ≥1 항목이 `failure`/`cancelled`/`timed_out` (또는 combined `failure`) → `failure`.
  3. ≥1 항목이 미완(`queued`/`in_progress`/`null` conclusion, 또는 combined `pending`) → `pending`.
  4. 그 외(전부 `success`/`neutral`/`skipped`) → `success`.
- **error 상태(MAJOR-1)**: 아래 "fail 모드" 참조 — 네트워크/403/토큰 부재는 throw가 아닌 **`error` 반환**(메서드 내부 try/catch). 정책 매핑은 Phase 3.

**fail 모드 정의 (MAJOR-1 해소)**:
- `getOctokit()`는 `GITHUB_TOKEN` 부재 시 throw, `checks.listForRef`는 네트워크/403에 throw. `getCommitCiStatus`는 **이 throw를 try/catch로 잡아 `state:'error'` 반환**(5번째 상태).
- **octokit request timeout 추가**: `getOctokit()`에 `request: { timeout: 10_000 }`(10초) 설정. 타임아웃도 `error`로 매핑.
- 정책(Phase 3): **enforce 티켓**은 `error`/timeout → **fail-closed**(throw "CI 조회 실패"). **비-enforce**는 애초 게이트 진입 안 함(bypass).

**`get_pr_status` 확장**: 반환에 `ciStatus` 필드 신설(`mergeable_state`는 하위호환 위해 `checks`에 유지, CI 판정은 `ciStatus` 사용).

**ref 결정**: `task.github_pr`(PR URL) 파싱(line 82 정규식) → owner/repo/prNumber 획득 → `octokit.rest.pulls.get`로 `pr.head.sha` → 그 sha를 ref. **owner/repo도 이 PR URL에서 파생**(§2.5 CRITICAL-1 확정).

**검증**: vitest 단위 테스트로 집계 규칙 커버 — success/pending/failure/none/**error**/**freshly-pushed→pending**/**Actions-only(combined 빈)→pending 금지** 경계. octokit 응답·throw는 mock.

**⚠ 구현 전 필수(MAJOR-4)**: GitHub의 checks-API vs combined-status-API 동작(Actions-only repo에서 combined-status가 비는지, conclusion 값 enum)을 **context7(`/octokit/rest.js` 또는 GitHub REST docs)로 확인** 후 집계 규칙 확정. 추측 금지.

---

### Phase 3 — 서버측 done 게이트 (F-002, F-004, F-008-bis) ⭐ 핵심

**삽입 지점**: `workflow-service.ts` `approveReview()` line 351~386. 현재 흐름:
```
notes 검증(361) → getById(367) → updateStatus(found.id,'done',{bypassGuard:true})(375) → done
```
**변경**: line 367(getById) 다음, line 374~380(updateStatus 'done') **직전**에 게이트 삽입:
```typescript
// CI 게이트 (APS-5-13): enforce 프로젝트 + ci_gate_required 티켓이면 CI green 필수
if (await this.shouldEnforceCiGate(found)) {
  // F-008(MAJOR-3): PR 선행 필수
  if (!found.github_pr) {
    throw new Error('enforce 티켓은 done 이전 PR 연결 필요(CI 조회용). /ship + link_pr_to_task 후 재시도');
  }
  const ci = await this.resolveCiStatus(found);  // PR URL→owner/repo/head sha→getCommitCiStatus

  // gap-2: 차단/통과 무관하게 판정 결과를 throw '이전'에 audit 기록
  await this.activityRepo.create({
    task_id: found.id, actor: 'ai', action: 'ci_gate_check',
    payload: { state: ci.state, total: ci.total, failedChecks: ci.failedChecks },
  });

  if (ci.state === 'error')    throw new Error('CI 조회 실패(error/timeout) — done 차단(fail-closed). 토큰·네트워크 확인 후 재시도');
  if (ci.state === 'pending')  throw new Error('CI 미완료 — done 차단. CI green 후 재시도(CI 진행 중)');
  if (ci.state === 'failure')  throw new Error(`CI 실패 — done 차단. 실패 체크: ${ci.failedChecks.join(', ')}`);
  if (ci.state === 'none')     throw new Error('CI 결과 없음 — PR/CI 미설정. verify.yml 동작 확인 필요');
  // ci.state === 'success' → 통과, 계속 진행
}
```

> **gap-2 주의**: audit 로그를 throw **이전**에 기록해 차단 이벤트도 보존. 단 동일 키 중복 기록 방지를 위해 통과/차단 1회만 기록(위 위치가 유일 기록 지점). F-009의 통과 케이스 기록과 통합(중복 기록 금지).

**`shouldEnforceCiGate(task)` 로직 (F-004 + F-008-bis, 분기 ② C 확정)**:
1. `CI_GATE_PROJECTS` env 파싱 — `parseStrictProjects()`(line 50, 기존 헬퍼) **재사용**. 비면 `false`(회귀 0).
2. task→epic→project로 project.code 조회 — `resolveStrict()`(line 83~94) 패턴 **재사용**(DRY). project.code가 `CI_GATE_PROJECTS` 미매칭 → `false`. (헬퍼 `matchesStrictFlag` line 62 재사용 가능.)
3. **`ci_gate_required` 판정(F-008-bis, MVP)**: `task.priority <= 2`(P0/P1=중요변경 proxy)면 `true`, 아니면 `false`(1중/fast-track 면제). §8 O-1에서 전용 플래그 컬럼으로 정밀화 여부 결정.

**리스크 완화 내장**: CI 지연→`pending` 차단 + 명확한 재시도 메시지(Discovery 리스크 a). PR 없는 로컬→`CI_GATE_PROJECTS` 미포함 시 전체 bypass(opt-in, Discovery 리스크 b).

**검증**: 위조 submit_test로 approve_review 시도 → CI red/pending/error면 throw 확인(§5-2).

#### done 우회 경로 부재 단언 (gap-3)

> **단언: `approveReview()` 외에 `review → done` 전환을 수행하는 경로는 존재하지 않는다.** 근거(코드 확인):
> - `task-service.ts:154~159` `VALID_TRANSITIONS`는 `review: ['done','in_progress']`로 done 전환을 허용하나,
> - `task-service.ts:164~176`의 `WORKFLOW_ONLY` 가드가 `review→done`을 **`bypassGuard:true` 없이는 차단**("smart_workflow를 통해서만 가능" throw).
> - 코드베이스 전체에서 `updateStatus(..., 'done', ..., { bypassGuard: true })`를 호출하는 곳은 **`workflow-service.ts:375`(approveReview)가 유일**(grep 확인: 다른 done 전환은 모두 테스트 코드이거나 bypassGuard 없음).
> - 특히 raw REST 엔드포인트 `api-server.ts:229` `taskService.updateStatus(req.params.id, req.body.status, req.body.notes)`는 **`bypassGuard` 미전달** → `review→done` 시도 시 WORKFLOW_ONLY 가드에 막힘. **REST 경유 우회 불가.**
> - **결론**: CI 게이트를 `approveReview()` 단일 지점에 삽입하면 모든 정상 `done` 경로를 커버한다.
> - **유지보수 가드(권장)**: 향후 `bypassGuard:true`로 done 전환하는 신규 코드가 추가되면 게이트 우회가 생긴다. `task-service.ts` `updateStatus`의 done 분기 또는 `bypassGuard` 사용처에 "CI 게이트는 approveReview에만 존재" 주석 + (선택) 단위 테스트로 "approveReview 외 done bypass 호출 부재"를 grep 기반 메타 테스트로 고정 → §8 O-5.

---

### Phase 4 — `ci-gate-guard.sh` PreToolUse hook (F-005, fine-grained 면제 층)

**산출물**: `/Users/leechanhee/ai-pm-system/.claude/hooks/ci-gate-guard.sh` (신규)

**역할(분기 ② C 2층 구조)**: 서버 게이트가 못 하는 **fast-track/1중 changed-files 면제**를 hook이 담당 + 1차 빠른 차단.

**설계** (기존 `codex-review-guard.sh`·`plan-review-guard.sh` 패턴과 일관 — 동일 jq 파싱·exit 2 차단):
```bash
#!/bin/bash
# ci-gate-guard.sh — PreToolUse hook for smart_workflow approve_review
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
[[ "$TOOL_NAME" != "mcp__ai-pm__smart_workflow" && "$TOOL_NAME" != "mcp__ai-pm-system__smart_workflow" ]] && exit 0
ACTION=$(echo "$INPUT" | jq -r '.tool_input.action // empty')
[[ "$ACTION" != "approve_review" ]] && exit 0
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); [[ -z "$PROJECT_ROOT" ]] && exit 0

# opt-in: .claude/ci-gate-enabled 마커 부재 시 통과 (회귀 0, 점진 도입)
[[ ! -f "$PROJECT_ROOT/.claude/ci-gate-enabled" ]] && exit 0

# fine-grained 면제: fast-track 마커 (plan-review-guard.sh line 34~42 패턴 재사용)
TICKET=$(cat "$PROJECT_ROOT/.claude/active-ticket" 2>/dev/null | tr -d '[:space:]')
FT=$(cat "$PROJECT_ROOT/.claude/active-ticket-fasttrack" 2>/dev/null | tr -d '[:space:]')
[[ -n "$FT" && "$FT" == "$TICKET" ]] && exit 0

# gh CLI로 현재 브랜치 PR checks 조회 (토큰: gh auth 우선, GITHUB_TOKEN 폴백)
command -v gh >/dev/null 2>&1 || { echo "[CI-Gate Guard] gh CLI 미설치 — 건너뜀(서버 게이트가 백업)" >&2; exit 0; }
BRANCH=$(git rev-parse --abbrev-ref HEAD)
BUCKETS=$(gh pr checks "$BRANCH" --json bucket 2>/dev/null | jq -r '[.[].bucket] | join(",")')
# fail/cancel/pending 포함 → exit 2(차단) + 메시지. 전부 pass/skip → exit 0.
# 실 PR 없음·gh 실패 시 통과 — 서버 게이트가 최종 권위.
```

**핵심 한계 명시** (코드 주석):
- hook은 **로컬 1차 방어선 + fine-grained 면제** — 서버 직접 호출은 우회 가능 → **Phase 3 서버 게이트가 최종 권위**.
- opt-in: `.claude/ci-gate-enabled` 마커 부재 시 전체 통과. **`.gitignore` 등록 필수**(fast-track 마커 선례).
- `gh` CLI 부재/미인증 → 경고 후 통과(BLOCKED 회피, 서버 게이트 백업).

**등록**: `.claude/settings.local.json`의 PreToolUse `smart_workflow` 매처 블록에 `ci-gate-guard.sh` 추가.

---

### Phase 5 — submit_test 역할 재정의 + 정합 (F-007, F-009)

- **CLAUDE.md / `.claude/rules/workflow-steps.md`**: submit_test=1차(즉시 피드백), CI green=2차(권위) 이중 검증 명문화. done 게이트 + enforce 티켓 PR-before-done 예외 순서 설명.
- **`.claude/rules/prohibitions.md`**: "enforce 티켓에서 CI red/pending/error 상태로 approve_review 강행 금지" 추가.
- **`.claude/rules/deploy-automation.md`**: enforce 프로젝트는 `/ship`을 approve_review **이전** 호출(Phase 2a) 명시.
- **`docs/ci-test-isolation.md`**: verify.yml 참조 + CI 게이트 역연동 섹션 추가.
- **Render 정합**: Render 자동배포는 push 트리거. CI(verify.yml)와 Render는 **둘 다 push 반응하나 독립** — CI green ≠ 배포. done 게이트는 **CI green만** 요구(배포는 done 이후 `/land-and-deploy`). 순서: **push → CI 재실행 → CI green → (enforce는 PR 선연결) → done 가능 → PR 머지 → Render 배포**.
- **F-009**: CI 게이트 판정을 `ci_gate_check` activity로 기록 — **Phase 3 삽입 블록에서 throw 이전 1회 기록(gap-2)**. 별도 중복 기록 금지.

---

## 4. 리스크 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **(a) CI 지연 → done 속도 저하** | CI 수 분 소요 시 정지 | submit_test 1차 유지. CI 게이트는 **done 직전만** 차단. `pending`은 재시도 메시지 |
| **(b) PR 없는 로컬** | 로컬 작업 마비 | **opt-in env** `CI_GATE_PROJECTS`. 미포함 bypass. hook은 `.claude/ci-gate-enabled` 부재 시 통과. fast-track fine-grained 면제(Phase 4) |
| **(c) GitHub 토큰/권한** | 토큰 부재 시 조회 실패 | 기존 `GITHUB_TOKEN`(getOctokit) **재사용**. 부재/네트워크/403 → `getCommitCiStatus`가 **`error` 반환**(MAJOR-1). enforce면 **fail-closed**(throw), 비-enforce면 게이트 미진입 |
| **fail 모드 미정의(MAJOR-1)** | error/timeout 미처리로 우회 | 5번째 상태 `error` + octokit 10초 timeout + enforce fail-closed. error 경로 단위테스트 |
| **이중소스 오판(MAJOR-4)** | Actions-only repo green→pending 오판 | 두 소스 **UNION**(0개=중립). 빈 combined-status pending 강제 금지 테스트. 구현 전 context7 확인 |
| **서버 git diff 미접근(MAJOR-2)** | 중요변경만 서버 단독 판정 불가 | **2층 구조**: 서버=프로젝트+`ci_gate_required` coarse, hook=changed-files fine 면제 |
| **PR-before-done 역전(MAJOR-3)** | enforce 티켓 데드락 | F-008을 F-002 **P0 선행**으로 승격, /ship→link_pr→approve_review 순서 조정 |
| **freshly-pushed checks 미생성(gap-1)** | 방금 push한 green을 none 오판 | pushed_at N초(90s) 이내 → `none` 아닌 `pending` 유예 |
| **차단 audit 유실(gap-2)** | 차단 이벤트 추적 불가 | `ci_gate_check` 로그를 throw **이전** 기록 |
| **done 우회 경로(gap-3)** | approveReview 외 done bypass | 코드 단언(§Phase 3): bypassGuard done은 approveReview 단독. REST 우회 불가 |
| **시드 owner 오타(CRITICAL-1)** | 신규 배포 시 잘못된 repo | 시드 정정 + dead-code(empty-DB only) 명시. CI 게이트는 PR URL 파생이라 무영향 |
| **신규 인프라 회귀** | CI 미설정 레포 동작 변경 | opt-in 기본 OFF(env/마커 부재 시 100% 보존). 회귀 0 |

---

## 5. 테스트 전략

> **3중 검증(신규 인프라)** — code-reviewer + security-reviewer(또는 codex review) + adversarial challenge 필수.

### 5-1. 단위 테스트 (vitest, `packages/mcp-server/src/__tests__/`)
- `getCommitCiStatus` UNION 집계: success / pending / failure / none / **error** — octokit 응답·throw mock으로 경계 커버
- **MAJOR-4 회귀 테스트**: checks=green + combined-status=**빈 배열** → 결과 `success`(빈 소스 중립, pending 강제 금지)
- **MAJOR-1 error 경로**: `getOctokit` throw(토큰 부재) / `listForRef` 403 throw / timeout → `state:'error'` 반환 확인
- **gap-1 freshly-pushed**: checks 0개 + pushed_at 30초 전 → `pending`(none 아님). pushed_at 5분 전 + checks 0개 → `none`
- `shouldEnforceCiGate`: `CI_GATE_PROJECTS` 미설정→false / 포함+priority<=2→true / 포함+priority>2→false(1중 면제) / 비포함→false
- `parseStrictProjects`/`matchesStrictFlag` 재사용 검증(comma-only "," → 빈 목록 → bypass)

### 5-2. 통합 테스트 — **위조 submit_test로 done 시도 → CI red/error 차단 (핵심)**
1. 에이전트가 STRICT 형식 충족 **위조 출력**으로 submit_test 통과 → review 진입
2. enforce 티켓 + PR 연결됨. PR head 커밋 CI를 **red(failure)** mock → `approveReview` 호출
3. **기대**: throw("CI 실패 — done 차단"). task review 유지(line 375 updateStatus 미도달). **`ci_gate_check` audit 로그는 기록됨(gap-2)**
4. **green**: CI `success` mock → 정상 done 전환
5. **pending**: CI `in_progress` → throw("CI 미완료")
6. **error(MAJOR-1)**: 토큰 부재/네트워크 → throw("CI 조회 실패 fail-closed")
7. **PR 미연결(MAJOR-3)**: enforce 티켓 PR 없이 approve_review → throw("PR 연결 필요")
8. **opt-in OFF**: `CI_GATE_PROJECTS` 미설정 → CI red여도 done 통과(회귀 0)
9. **1중 면제(분기 ② C)**: enforce 프로젝트 + priority>2 → CI red여도 통과(서버 coarse 면제)

### 5-3. e2e (수동, 실 GitHub)
- 실 PR 생성 → verify.yml 의도적 실패 → `getCommitCiStatus` failure → approve_review 차단 → 수정 push → CI green → approve_review 통과

### 5-4. 관측성(observability)
- F-009 `ci_gate_check` activity(throw 이전 기록)로 차단·통과 모두 추적
- 차단 에러 메시지에 실패 체크명 포함(디버깅)

### 5-5. hook 테스트
- `ci-gate-guard.sh`: 마커 부재 exit 0 / fast-track 매칭 exit 0 / gh 부재 경고+통과 / approve_review 아닌 액션 exit 0 (jq fixture)

---

## 6. Discovery 7개 카테고리 매핑

| 카테고리 | Discovery | 플랜 반영(rev2) |
|----------|-----------|-----------------|
| **1. 목표(Why)** | submit_test 출력 신뢰 → 위조 가능. CI 독립 재실행으로 검증자 독립성. green 없이 done 불가 | F-001 + F-002. 성공 기준: §5-2 위조 차단 |
| **2. 사용자(Who)** | 워크플로 검증 단계. 모든 코드 변경 티켓 done | Phase 3 approveReview 게이트(done 단일 경로 — gap-3 단언) |
| **3. 범위(What)** | MVP=CI 재실행 + checks 조회 → green 아니면 done 거부. 제외=자체 러너·배포 | F-001~F-008 = MVP. Render 정합으로 배포 경계 명시(Phase 5) |
| **4. 제약(Constraints)** | repo, Render 정합, 도구 재활용, lint 부재 | repo=PR URL 파생(§2.5, 시드 `bluesky78060` 정정). 기존 get_pr_status/link_pr 재활용. 분기 ③ C=biome |
| **5. 우선순위(Priority)** | P3. submit_test 1차 + CI 2차. 이중 검증 | F-007 명문화. submit_test 게이트 보존 |
| **6. 리스크(Risk)** | (a)CI 지연 (b)PR 없는 로컬 (c)토큰/권한 | §4 표 + MAJOR-1 error fail-closed |
| **7. 검증(Verify)** | 위조 submit_test → CI red 차단. green 통과 | §5-2 핵심 + §5-3 e2e |

---

## 7. 완료 정의 (DoD)

- [ ] **F-001**: `.github/workflows/verify.yml`이 push/PR마다 build+lint+test 재실행, green/red 정확 반영
- [ ] **F-006**: mcp-server 패키지 `lint` 스크립트 추가, `pnpm --filter @ai-pm/mcp-server lint` 정상(papercut 해소)
- [ ] **F-008(MAJOR-3)**: enforce 티켓 PR-before-done 강제(approveReview에서 PR 부재 시 throw), deploy-automation.md 순서 갱신
- [ ] **F-003(MAJOR-4)**: `getCommitCiStatus`가 두 소스 **UNION**(0개 중립) 집계. Actions-only(combined 빈)→pending 강제 금지 테스트 통과. **구현 전 context7로 GitHub 동작 확인**
- [ ] **F-003(MAJOR-1)**: `error` 상태 + octokit 10초 timeout. error 경로 단위테스트 통과
- [ ] **F-003(gap-1)**: freshly-pushed(checks 미생성) → `pending`(none 아님) 유예. 테스트 통과
- [ ] **F-002 + F-004 + F-008-bis**: `approveReview` CI 게이트 삽입. `CI_GATE_PROJECTS` opt-in(미설정 회귀 0) + `ci_gate_required`(priority<=2 proxy) coarse 판정
- [ ] **gap-2**: `ci_gate_check` audit 로그를 throw **이전** 기록(차단 이벤트 보존). 중복 기록 없음
- [ ] **gap-3**: done 우회 경로 부재 단언 검증(approveReview 외 bypassGuard done 부재). 유지보수 주석 추가
- [ ] **CRITICAL-1**: `api-server.ts:37` 시드 owner `leechanhee`→`bluesky78060` 정정(dead-code 명시). `github_repo`-as-SSOT 주장 제거, CI 게이트는 PR URL 파생만 사용
- [ ] **F-005**: `ci-gate-guard.sh` 작성 + settings.local.json 등록 + `.gitignore`에 `.claude/ci-gate-enabled` 추가. fast-track fine-grained 면제·opt-in 마커 동작
- [ ] **핵심 검증(§5-2)**: 위조 submit_test → CI red/pending/error 차단, green/면제 통과 — 통합 테스트 통과
- [ ] STRICT submit_test build+lint+unit 모두 status:pass 제출 (CI 결과 첨부)
- [ ] **3중 검증**: code-reviewer + security-reviewer/codex review + adversarial challenge 통과, `docs/03-code-review/APS-5-13-review.md` 산출
- [ ] **F-007**: CLAUDE.md/rules에 이중 검증(submit_test 1차 / CI 2차) + enforce PR-before-done 순서 명문화
- [ ] GitHub Secret `TEST_DATABASE_URL` 등록(test branch, production 금지 — APS-2-7 회고)
- [ ] Render 배포 정합 확인: CI=done 선행, 배포=done 후행 (Phase 5)

---

## 8. 미해결/Open Questions (구현 중 결정)

- **O-1 `ci_gate_required` 플래그 구현(F-008-bis / 분기 ② C)**: MVP는 `priority<=2` proxy. 정밀화 필요 시 task 스키마에 전용 `ci_gate_required` boolean 컬럼 추가(별도 마이그레이션 후속 티켓). 사용자 확인: proxy로 충분한가, 컬럼이 필요한가.
- **O-2 fork PR 처리**: 현재 단독 개발이라 보류. 추후 외부 기여 발생 시 `pull_request_target` 보안 검토 필요(secret 노출 주의).
- **O-3 ref 소스 대안**: rev2는 PR head sha(PR-before-done) 채택. 대안인 sync_commit_progress 최신 commit sha는 현재 activity 로그에만 있고 전용 컬럼 없음 → 채택 시 스키마 결정 필요. PR-before-done 채택으로 일단 종결.
- **O-4 운영 DB github_repo 정합**: 운영 DB의 기존 `project.github_repo` 값이 오염(`leechanhee/...`)되어 있으면 `create_github_issue` 등 보조 경로용 데이터 수정(SQL UPDATE) 필요. CI 게이트엔 무영향(PR URL 파생). 구현 시 실 DB 값 확인.
- **O-5 done bypass 유지보수 가드**: 향후 `bypassGuard:true` done 전환 신규 추가 시 게이트 우회. grep 기반 메타 테스트로 "approveReview 외 done bypass 부재"를 고정할지 결정.
- **O-6 hook 토큰 출처**: `ci-gate-guard.sh`가 `gh` CLI auth vs `GITHUB_TOKEN` env(둘 다 가능, gh 우선 권장).

---

**작성**: planner (APS-5-13) · **rev2(critic 5건 + gap 3건 반영)** · 다음 단계 → 5단계 플랜 재리뷰(critic 독립 리뷰 + 오케스트레이터 자체 검토)
