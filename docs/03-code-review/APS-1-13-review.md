# APS-1-13 코드 리뷰 — express 4 → 5 업그레이드

- **검증 라운드**: 🔴 3중 (architecture/의존성 메이저 + 지난 prod 크래시 이력). code-reviewer + security-reviewer(CVE/ReDoS) + critic adversarial **병렬 dispatch**
- **리뷰어**: 전원 작성자(executor-high)와 분리된 fresh subagent

## 변경 요약

- `packages/mcp-server/package.json`: express `4.21.2` → `^5.1.0` (resolve 5.2.1)
- 루트 `package.json`: `express>path-to-regexp: 0.1.12` override 삭제 (`path-to-regexp: >=8.4.0` 유지)
- `packages/mcp-server/src/api-server.ts:673`: `app.get('*')` → `app.get('/{*splat}')`
- `pnpm-lock.yaml` 재생성

## 검증 증거 (Iron Law — 메인 실측)

### 의존성 트리 (★MAJOR3 — resolution 단언)
```
pnpm why path-to-regexp:
path-to-regexp@8.4.2
└─┬ router@2.2.0
  └─┬ express@5.2.1
→ express 서브트리는 router@2.2.0 → path-to-regexp@8.4.2만 경유. express→0.1.12 edge 없음. 트리에 path-to-regexp 단일 버전
```

### STRICT submit_test (build+lint+unit+integration)
- build: tsc clean EXIT=0, `dist/api-server.js:368` = `app.get('/{*splat}', ...)`
- lint: 88 files, 0 issues
- unit: **183 passed** (7 files)
- grep `app.(get|all|use)('*')` in src: **0건**

### ★★ 런타임 스모크 (MAJOR1+2 — 지난 prod 부팅 크래시 재발 검증, 메인 직접 실행)
stub STATIC_PATH + 로컬 DATABASE_URL(.env.test)로 `node dist/api-server.js` 기동:
```
부팅 로그: "AI PM API Server running on http://localhost:3999" (크래시 없음 — pathRegexp 에러 미재현)
1_health=200
2_api=200            (mounts + opt-in auth 정상, 404/HTML 아님)
3_spa_path=<!doctype html>...SMOKE-OK  (/{*splat} subpath fallback)
4_bare_root(/)=<!doctype html>...SMOKE-OK  (★결정적: /{*splat} root 매칭 — /*splat 오답과 구분)
```
→ 4단언 전부 PASS. express 5 부팅·라우팅 런타임 확정.

### 블래스트 반경 (read-only 감사)
- express는 `@ai-pm/mcp-server` 단일 패키지에서만 사용. web-ui 미사용
- `auth.ts`는 타입 임포트(`Request/Response/NextFunction`)만 — express 5 타입 호환(이미 `@types/express ^5`로 컴파일 중)

## 3중 검증 결과

| 리뷰어 | 판정 | C/M/Mi/S |
|--------|------|----------|
| code-reviewer | APPROVED | 0 / 0 / 1 / 1 |
| security-reviewer | APPROVED | 0 / 0 / 2 / 2 |
| critic adversarial | APPROVED | 0 / 0 / 2 / 2 |

### code-reviewer 핵심
- `/{*splat}` 정확한 path-to-regexp-8 idiom, dead override 제거가 "express→router 이동" 이해 반영
- **`req.query` 재할당 0건** (express 5 read-only getter break 완전 회피, 18곳 전부 read-only)
- lockfile 0.1.x 흔적 0, express-rate-limit@8.5.2도 express 5 rebind
- 🟡 MINOR: CI/Render `--frozen-lockfile` 보장 권장(ops, 코드 변경 불요)
- 🔵 SUGG: 비-wrapAsync 핸들러용 글로벌 에러 미들웨어(forward-looking)

### security-reviewer 핵심 (의존성 CVE)
- express 5 **신규 CVE 0 도입**, path-to-regexp 0.1.12(CVE-2024-45296 ReDoS) **제거 → 순보안 개선**
- `/{*splat}`가 `/api` 인증 우회·path traversal 불가 (등록 순서 + 고정 sendFile 검증)
- express 5 query parser 기본값 변경으로 prototype-pollution surface **감소**
- 🟡 MINOR-1: `qs@6.15.0` 사전존재 DoS(악화 아님, 4.x도 6.13.0 취약). 선택적 `"qs": ">=6.15.2"` override
- 🟡 MINOR-2(범위 외): react-router HIGH RCE 등 → **별도 티켓 권장**

### critic adversarial 핵심
- build·test·`pnpm why` 트리를 **독립 재현**(위조 아님 확정). 런타임 스모크만 샌드박스 제약으로 재현 불가 → 메인 실측 + 정적 구조 검증으로 대체
- lockfile: express 4 트랜지티브(body-parser@1.20.3, send@0.19.0, qs@6.13.0, path-to-regexp@0.1.12 등) 전부 제거 → express 5 트리로 깨끗이 교체. express-rate-limit peer 만족
- `/api/없는경로` HTML 반환은 express 4 `app.get('*')`에서도 동일하던 **기존 quirk** — 본 업그레이드 회귀 아님
- 🟡 MINOR: 스모크 GET 한정(mutating 라우트는 unchanged `:id` 문법+183 단위테스트 커버, 저위험)
- 🔵 SUGG: CI에 부팅 스모크 게이트 추가(8af5fda류 영구 차단 — 최고가치 harness 보강)

## 최종 판정: 승인

3중 전원 APPROVED, CRITICAL/MAJOR 0. express 5 부팅·라우팅 런타임 확정(bare-root 포함 4단언 PASS), path-to-regexp 0.1.12(ReDoS) 제거로 순보안 개선, lockfile 깨끗이 교체. 모든 발견은 비차단·범위 외·forward-looking.

### 후속 티켓 권장 (범위 외, 비차단)
1. **react-router HIGH RCE** (`react-router-dom >=7.15.1`) — security-reviewer 지목, 전체 트리 최고위험 (별도)
2. CI 부팅 스모크 게이트 추가 — critic SUGG-2 (harness 보강)
3. `/api/*` 미매칭 404 JSON 핸들러 — 기존 quirk 개선 (선택)
4. `"qs": ">=6.15.2"` 루트 override — 사전존재 moderate 정리 (선택)

