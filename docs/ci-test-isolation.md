# CI 환경 테스트 격리 가이드

**상태**: APS-2-7 사고 회고 기반 (2026-05-18)
**목적**: GitHub Actions/Render preview deploy에서 로컬 vitest 격리 인프라를 자동 적용하여 production 데이터 사고 재발 방지

## 개요

### 사고 회고 (APS-2-7)

2026-05-18 20:42 KST, 로컬 테스트 실행 중 production database (`ep-old-haze-aol2r7dt`) 초기화 사고 발생.

**원인**: CI 환경(GitHub Actions)에서 `.env.test` 격리가 없었고, test 코드가 `process.env.DATABASE_URL`를 직접 읽어 production 주소를 사용함.

**로컬 격리 인프라** (APS-2-7에서 구축):
- `.env.test` 파일 → Neon test branch 연결 정보 (브랜치 값은 §브랜치 정보 참조)
- `vitest.config.ts` → dotenv로 `.env.test` 로드 (**`override: true` 필수** — APS-1-32)
- `utils/test-db-guard.ts` → `getPool()` 안에서 allow-list 검증 (APS-1-25). 프로덕션 deny-list는 그 앞의 추가 층

**과제**: CI 환경에서 동일 격리가 자동 적용되지 않음 → 본 가이드

## ⚠️ 알려진 한계 (2026-08-24, APS-1-32 갱신)

이 문서는 2026-05-19 작성 당시 "격리 완료"로 서술했으나, **그 서술이 사실이 아니었다.**
정확한 현재 상태는 다음과 같다 — **격리는 3층이다.**

### 고쳐진 것 — 1단계 (APS-1-32)

| 결함 | 상태 |
|---|---|
| `.env.test`가 셸의 기존 `DATABASE_URL`을 **덮지 못함** (dotenv 기본 `override: false`) | ✅ `override: true`로 수정 |
| 파일·키 부재 시 **조용히 셸 값으로 폴백** (fresh clone의 기본 상태) | ✅ 반환값 검사 후 fail-fast |

### 고쳐진 것 — 2단계 (APS-1-25)

`.env.test`가 **존재하지만 프로덕션을 가리키는** 경우를 막는다.
이전에는 `PROD_COMPUTE_HOSTS` deny-list가 하드코딩 엔드포인트 2개만 잡았고,
**모르는 호스트는 전부 통과**시켰다. 방향을 뒤집어 **모르면 차단**한다.

| `DATABASE_URL`이 가리키는 곳 | 이전 | 현재 |
|---|---|---|
| 하드코딩된 그 production compute | 차단 | 차단 |
| 대문자로 쓴 같은 호스트 | **통과** | **차단** |
| 재생성된 Neon 엔드포인트 | **통과** | **차단** |
| Render 프로덕션 / 다른 프로젝트 DB | **통과** | **차단** |
| `TEST_DB_ALLOWED_HOSTS`에 있는 호스트 | — | 통과 |

구현: `packages/mcp-server/src/utils/test-db-guard.ts`.
가드는 `getPool()` 안에서 동작한다 — 테스트 하네스가 아니라 **실제로 풀을 여는 지점**이라야
`vitest --config <다른파일>` 같은 우회를 막을 수 있다.
`?host=` 쿼리 파라미터로 host를 오버라이드하는 경우도 검사한다.

**필수 설정**: `.env.test`(로컬)와 GitHub Actions secret(CI) 양쪽에
`TEST_DB_ALLOWED_HOSTS`가 필요하다. **없으면 테스트가 차단된다** — 의도된 fail-closed다.

### 남는 한계

- `TEST_DB_ALLOWED_HOSTS`는 **자기 인증**이다. `.env.test`를 잘못 쓴 사람이 allow-list도
  잘못 쓸 수 있다. 목적은 **두 번의 고의적 행동**을 요구해 복붙 한 번으로 프로덕션에
  붙는 것을 막는 것이다. CI에서는 두 값이 같은 secret 설정자에게서 오므로
  **공격자 방어가 아니라 오타 방어**다
- IPv6 리터럴은 대괄호가 포함된 형태로 비교된다 (Neon/Render는 쓰지 않음)

### fork PR에서는 테스트가 실패한다 (의도된 동작)

`verify.yml`은 모든 `pull_request`에서 테스트를 돌리지만, **fork PR에는 repository secret이
전달되지 않는다.** 그러면 `.env.test`가 `DATABASE_URL=`(빈 값)으로 생성되고,
APS-1-32의 fail-fast가 발동해 테스트가 실패한다.

이것은 **fail-closed이므로 보안상 올바른 동작**이다 — secret 없이 조용히 다른 DB에 붙는 것보다
명확히 실패하는 편이 낫다. 다만 외부 기여 PR을 정상 검증할 수 없다는 운영상 제약이 생긴다.
DB 접촉 테스트를 별도 job으로 분리하거나 secret 부재 시 명시적으로 skip하는 정책이 필요하다.
→ 후속 과제 (본 문서 작성 시점에 티켓 미발행)

### 브랜치 정보에 대한 주의

이 문서에 적힌 test 브랜치·compute ID는 **작성 시점 값**이며 갱신이 늦을 수 있다.
로컬 값은 저장소 루트 `.env.test`(gitignored)에서 확인한다 —
2026-08-24 기준 `ci-test` / `br-raspy-thunder-ao2nzazc`.
**CI가 실제로 어느 브랜치를 쓰는지는 `TEST_DATABASE_URL` secret 값이므로 이 문서로 확인할 수 없다.**
Neon 콘솔 또는 저장소 secret 설정에서 직접 확인할 것.

## 로컬 vs CI 격리 모델 비교

### 로컬 환경 격리

| 단계 | 구현 | 결과 |
|------|------|------|
| **1. .env.test 파일** | `.env.test` (gitignored) | test DATABASE_URL 정의 |
| **2. 설정 로드** | `vitest.config.ts` dotenv (`override: true`) | 셸의 기존 `DATABASE_URL`을 **덮어씀** |
| **2b. 로드 실패 시** | 반환값 검사 후 throw | 파일·키 부재 시 **fail-fast** (셸 값 폴백 금지) |
| **3. Guard 검증** | `utils/test-db-guard.ts` (`getPool()` 경유) | allow-list 외 호스트 전부 거부 |
| **4. 격리된 실행** | `pnpm test` | test branch에만 쓰기 |

**결과**: 격리 3층 (아래 §알려진 한계 참조). 단, 자기 인증의 한계는 남는다.

### CI 환경 격리 (본 가이드)

| 단계 | 구현 | 결과 |
|------|------|------|
| **1. Secrets 등록** | GitHub Actions Secrets: `TEST_DATABASE_URL` | 환경변수로 보관 |
| **2. .env.test 동적 생성** | workflow yml `cat > .env.test <<EOF` | 런타임 파일 생성 |
| **3. 설정 로드** | 동일 `vitest.config.ts` (`override: true`) | 셸 값을 덮어씀 |
| **4. Guard 검증** | 동일 `test-db-guard.ts` | allow-list 외 호스트 전부 거부 |
| **5. 격리된 실행** | `pnpm test` (CI 에이전트 내) | test branch에만 쓰기 |

**결과**: 격리 3층 (동일 메커니즘, CI 환경 적응). 아래 §알려진 한계 참조.

## 단계 1: GitHub Actions Secrets 등록

### 1-1. 대시상황 이동

1. GitHub 저장소 → **Settings** 메뉴
2. 좌측 사이드바 **Secrets and variables** → **Actions**

### 1-2. 새 Secret 생성

1. **New repository secret** 클릭
2. **Name**: `TEST_DATABASE_URL`
3. **Secret**: Neon test branch 연결 문자열

```
postgresql://neondb_owner:<password>@<TEST-BRANCH-COMPUTE>-pooler.<region>.aws.neon.tech/neondb?channel_binding=require&sslmode=require

# ⚠️ <TEST-BRANCH-COMPUTE>는 예시 자리표시자다. 실제 값을 이 문서에 적지 말 것 —
# 문서가 낡으면 잘못된 DB를 테스트 대상으로 오인하게 된다(§알려진 한계 참조).
```

**주의**: 
- 로컬 `.env.test`와 **동일한 값** 사용
- 절대 production 주소 사용 금지
- password는 Neon 대시보드에서 확인 (또는 로컬 `.env.test`에서 복사)

### 1-3. 확인

Settings → Secrets and variables → Actions에서 `TEST_DATABASE_URL` 목록에 표시되는지 확인 (값은 마스킹됨).

## 단계 2: GitHub Actions Workflow 설정

### 2-1. workflow 파일 위치

`.github/workflows/` 디렉토리에 YAML 파일 생성 (예: `test.yml` 또는 기존 CI workflow).

### 2-2. 최소 구성 예시

```yaml
name: Test

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      # ⭐ CRITICAL: Setup test env (격리 키 스텝)
      - name: Setup test env
        run: |
          cat > .env.test <<EOF
          DATABASE_URL=${{ secrets.TEST_DATABASE_URL }}
          EOF

      # 기존 build/test 스텝
      - name: Build
        run: pnpm --filter @ai-pm/mcp-server build

      - name: Test
        run: pnpm --filter @ai-pm/mcp-server test
```

### 2-3. 핵심 포인트

- **Setup test env 스텝 위치**: `pnpm install` 다음, build 전
- **파일 생성 방식**: `cat > .env.test <<EOF`
- **Secret 참조**: `${{ secrets.TEST_DATABASE_URL }}`
- **절대 금지**: `${{ secrets.DATABASE_URL }}` (production secret) 사용

## 단계 3: Render Preview Deploy 설정

### 3-1. Render 환경변수 추가

Render 대시보드 → 해당 서비스 → **Environment**

| Key | Value | 설명 |
|-----|-------|------|
| `DATABASE_URL` | production Neon 주소 | 프로덕션 환경 |
| `TEST_DATABASE_URL` | test branch Neon 주소 | preview/PR 테스트용 |

### 3-2. Build/Test 커맨드 설정

Render 서비스 → **Settings** → **Build & Deploy**

```bash
# Build Command
pnpm install && \
  echo "DATABASE_URL=$TEST_DATABASE_URL" > .env.test && \
  pnpm --filter @ai-pm/mcp-server build

# Start Command
node packages/mcp-server/dist/index.js
```

## 단계 4: 체크리스트 (PR 머지 전 확인)

- [ ] `TEST_DATABASE_URL` secret이 GitHub Actions에 등록되어 있는가?
- [ ] Secret 값이 **test branch** 주소인가? (production 주소 아닌가?)
- [ ] Workflow YAML의 "Setup test env" 스텝에 `.env.test` 생성이 포함되어 있는가?
- [ ] Build 전 `.env.test`가 생성되는가? (순서 확인)
- [ ] 로컬에서 `pnpm test` 실행 시 test branch에만 영향을 주는가? (`DATABASE_URL` 조회로 확인)
- [ ] `.env.test`가 `.gitignore`에 등록되어 있는가?

## 단계 5: PR별 격리 (선택, 고급)

GitHub Actions에서 PR open/close 시 자동으로 Neon test branch를 생성/삭제할 수 있습니다.

### 5-1. Neon CLI 설치

```yaml
- name: Install Neon CLI
  run: npm install -g neonctl
```

### 5-2. Branch 자동 생성 (PR open)

```yaml
- name: Create test branch (PR)
  if: github.event_name == 'pull_request' && github.event.action == 'opened'
  env:
    NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
  run: |
    BRANCH_ID=$(neonctl branches create \
      --project-id ${{ secrets.NEON_PROJECT_ID }} \
      --name "test-pr-${{ github.event.pull_request.number }}" \
      --parent main \
      --json | jq -r '.id')
    echo "TEST_BRANCH_ID=$BRANCH_ID" >> $GITHUB_ENV
```

### 5-3. Branch 삭제 (PR close/merge)

```yaml
- name: Delete test branch (PR closed/merged)
  if: github.event_name == 'pull_request' && github.event.action == 'closed'
  env:
    NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
  run: |
    neonctl branches delete \
      --project-id ${{ secrets.NEON_PROJECT_ID }} \
      --branch "test-pr-${{ github.event.pull_request.number }}"
```

**필수 Secrets 추가**:
- `NEON_API_KEY`: Neon 대시보드 → Account Settings → API keys
- `NEON_PROJECT_ID`: Neon 프로젝트 ID

**주의**: 이 단계는 선택 사항입니다. 단일 shared test branch 사용이 충분하면 생략 가능합니다.

## 참고: 로컬 테스트 격리 재확인

본 가이드는 CI 환경 설정입니다. 로컬 환경에서는 기존 설정이 유효합니다.

### 로컬 테스트 실행

```bash
# 자동으로 .env.test 로드됨 (vitest.config.ts 설정)
pnpm --filter @ai-pm/mcp-server test

# 결과
✓ tests/context-service.test.ts (3 passed)
  ◇ injected env (1) from ../../.env.test
  ✓ DATABASE_URL contains the test branch compute (not a production compute)
```

### 체크: 올바른 DB 사용 중인가?

```bash
# 테스트 시작 전 확인
cat .env.test | grep DATABASE_URL

# 또는 getPool() 의 test-db-guard 가 검증한다
```

## 관련 문서

- **사고 회고**: `docs/03-code-review/APS-2-7-review.md`
- **로컬 테스트 인프라**: `packages/mcp-server/vitest.config.ts`, `packages/mcp-server/src/utils/test-db-guard.ts`
- **Neon test branch**: 구체 ID는 이 문서에 고정하지 않는다. §알려진 한계 §브랜치 정보 참조
  (2026-05-19 작성 당시 값은 `br-purple-fog-aoyuc8lg` / `ep-falling-glitter-aoxepm0z`였으나 **현재와 다르다**)

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| CI 테스트 실패: `Cannot connect to database` | `TEST_DATABASE_URL` secret 미설정 | GitHub Actions Secrets에 등록 (단계 1) |
| CI 테스트가 production DB 수정 | workflow에 `.env.test` 생성 스텝 없음 | workflow YAML에 "Setup test env" 스텝 추가 (단계 2) |
| 로컬 테스트는 성공, CI 테스트만 실패 | 로컬 `.env.test` ≠ CI `TEST_DATABASE_URL` | 두 값이 동일한 test branch 주소인지 확인 |
| `APS-1-25 SAFETY` 로 테스트 중단 | 호스트가 `TEST_DB_ALLOWED_HOSTS` 에 없거나, 프로덕션 compute 이거나, URL 에서 호스트를 확정할 수 없음 | 메시지가 어느 경우인지 알려준다. Neon 콘솔에서 test branch compute ID를 직접 재확인 (문서의 값을 믿지 말 것) |

---

**마지막 확인** (2026-05-18 이후)

- [ ] 본 가이드가 모든 CI 환경(GitHub Actions, Render)에 적용되었는가?
- [ ] 새 팀 멤버가 로컬 `.env.test` 설정 시 본 가이드를 참고하는가?
- [ ] production 데이터 보호 메커니즘이 정상 작동하는가? (**"4중"이 아니다** — §알려진 한계 참조)
  1. `.env.test` 파일 격리
  2. vitest.config.ts dotenv `override: true` 로드 + 파일·키 부재 시 fail-fast (APS-1-32)
  3. test-db-guard (allow-list + 프로덕션 deny-list)
  4. CI workflow에서의 동적 `.env.test` 생성
