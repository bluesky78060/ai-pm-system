# CI 환경 테스트 격리 가이드

**상태**: APS-2-7 사고 회고 기반 (2026-05-18)
**목적**: GitHub Actions/Render preview deploy에서 로컬 vitest 격리 인프라를 자동 적용하여 production 데이터 사고 재발 방지

## 개요

### 사고 회고 (APS-2-7)

2026-05-18 20:42 KST, 로컬 테스트 실행 중 production database (`ep-old-haze-aol2r7dt`) 초기화 사고 발생.

**원인**: CI 환경(GitHub Actions)에서 `.env.test` 격리가 없었고, test 코드가 `process.env.DATABASE_URL`를 직접 읽어 production 주소를 사용함.

**로컬 격리 인프라** (APS-2-7에서 구축):
- `.env.test` 파일 → Neon test branch (`br-purple-fog-aoyuc8lg`) 연결 정보
- `vitest.config.ts` → dotenv envFile로 `.env.test` 우선 로드
- `context-service.test.ts` → `PROD_COMPUTE_HOSTS` guard로 production compute 차단

**과제**: CI 환경에서 동일 격리가 자동 적용되지 않음 → 본 가이드

## 로컬 vs CI 격리 모델 비교

### 로컬 환경 격리

| 단계 | 구현 | 결과 |
|------|------|------|
| **1. .env.test 파일** | `.env.test` (gitignored) | test DATABASE_URL 정의 |
| **2. 설정 로드** | `vitest.config.ts` dotenv envFile | 테스트 시 우선 로드 |
| **3. Guard 검증** | `PROD_COMPUTE_HOSTS` 배열 + context-service.test.ts 검증 | production 주소 거부 |
| **4. 격리된 실행** | `pnpm test` | test branch에만 쓰기 |

**결과**: ✅ production 데이터 보호

### CI 환경 격리 (본 가이드)

| 단계 | 구현 | 결과 |
|------|------|------|
| **1. Secrets 등록** | GitHub Actions Secrets: `TEST_DATABASE_URL` | 환경변수로 보관 |
| **2. .env.test 동적 생성** | workflow yml `cat > .env.test <<EOF` | 런타임 파일 생성 |
| **3. 설정 로드** | 동일 `vitest.config.ts` | 테스트 시 우선 로드 |
| **4. Guard 검증** | 동일 `PROD_COMPUTE_HOSTS` guard | production 주소 거부 |
| **5. 격리된 실행** | `pnpm test` (CI 에이전트 내) | test branch에만 쓰기 |

**결과**: ✅ production 데이터 보호 (동일 메커니즘, CI 환경 적응)

## 단계 1: GitHub Actions Secrets 등록

### 1-1. 대시상황 이동

1. GitHub 저장소 → **Settings** 메뉴
2. 좌측 사이드바 **Secrets and variables** → **Actions**

### 1-2. 새 Secret 생성

1. **New repository secret** 클릭
2. **Name**: `TEST_DATABASE_URL`
3. **Secret**: Neon test branch 연결 문자열

```
postgresql://neondb_owner:<password>@ep-falling-glitter-aoxepm0z-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
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
  ✓ injected env from ../../.env.test
  ✓ DATABASE_URL contains test branch ep-falling-glitter-aoxepm0z
```

### 체크: 올바른 DB 사용 중인가?

```bash
# 테스트 시작 전 확인
cat .env.test | grep DATABASE_URL

# 또는 test 파일에서 PROD_COMPUTE_HOSTS guard로 검증됨
```

## 관련 문서

- **사고 회고**: `docs/03-code-review/APS-2-7-review.md`
- **로컬 테스트 인프라**: `packages/mcp-server/vitest.config.ts`, `packages/mcp-server/src/__tests__/context-service.test.ts`
- **Neon test branch**: Branch ID `br-purple-fog-aoyuc8lg`, Compute ID `ep-falling-glitter-aoxepm0z`

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| CI 테스트 실패: `Cannot connect to database` | `TEST_DATABASE_URL` secret 미설정 | GitHub Actions Secrets에 등록 (단계 1) |
| CI 테스트가 production DB 수정 | workflow에 `.env.test` 생성 스텝 없음 | workflow YAML에 "Setup test env" 스텝 추가 (단계 2) |
| 로컬 테스트는 성공, CI 테스트만 실패 | 로컬 `.env.test` ≠ CI `TEST_DATABASE_URL` | 두 값이 동일한 test branch 주소인지 확인 |
| `PROD_COMPUTE_HOSTS` guard 실패 | test branch 주소가 production compute 포함 | Neon test branch compute ID 재확인 (`ep-falling-glitter-aoxepm0z`는 테스트용) |

---

**마지막 확인** (2026-05-18 이후)

- [ ] 본 가이드가 모든 CI 환경(GitHub Actions, Render)에 적용되었는가?
- [ ] 새 팀 멤버가 로컬 `.env.test` 설정 시 본 가이드를 참고하는가?
- [ ] production 데이터 보호 4중 메커니즘이 정상 작동하는가?
  1. `.env.test` 파일 격리
  2. vitest.config.ts dotenv 우선 로드
  3. PROD_COMPUTE_HOSTS guard
  4. CI workflow에서의 동적 `.env.test` 생성
