# APS-1-13 플랜 (rev2) — express 4 → 5 업그레이드

Discovery: `docs/00-discovery/APS-1-13-direction.md`
리뷰: `docs/02-review/APS-1-13-plan-review.md` (라운드1 ACCEPT-WITH-RESERVATIONS → rev2가 MAJOR 3 반영)
공식 가이드: expressjs.com/en/guide/migrating-5

## ⚠ rev2 핵심 강화 (검증 규율 — 지난 prod 크래시 재발 방지)

지난 배포 크래시(`8af5fda`, 부팅 시 `TypeError: pathRegexp is not a function`)는 build/lint/unit 전부 통과하고도 발생했다 — **어떤 자동 테스트도 api-server.ts를 import/실행하지 않기 때문**. 따라서 rev2는 ① 런타임 스모크 **필수화**(옵셔널 금지) ② 부팅 DB 소스 명시 ③ post-install resolved 트리 단언을 추가한다.

## 기능 명세

| ID | 기능 | 우선순위 | 엣지케이스 |
|----|------|----------|-----------|
| F-001 | `express` 4.21.2 → `^5.1.0` (packages/mcp-server) | P0 | `@types/express ^5` 이미 존재 → 타입 정렬됨 |
| F-002 | 루트 `express>path-to-regexp: 0.1.12` override 삭제 | P0 | 루트 `path-to-regexp: >=8.4.0`는 유지(hono 등) |
| F-003 | `api-server.ts:673` `app.get('*')` → `app.get('/{*splat}')` | P0 | root `/`+모든 subpath 매칭, `/api`·static 뒤 등록 순서 유지 |
| F-004 | 라우팅 스모크 검증 (build+test+런타임) | P0 | SPA fallback·/health·/api 응답 보존 |

## 기술 스택

- express `^5.1.0` (최신 stable), path-to-regexp 8.x (express 5 번들)
- 기존 `cors`/`express.json()`/`express.static()`/`wrapAsync` 유지 — 변경 불필요

## 구현 로드맵

### Phase 1 — 의존성 (F-001, F-002)
- `packages/mcp-server/package.json`: `"express": "4.21.2"` → `"express": "^5.1.0"` (install 시 5.2.1 resolve)
- 루트 `package.json` overrides에서 `"express>path-to-regexp": "0.1.12"` **라인 삭제**. `"path-to-regexp": ">=8.4.0"`는 **유지**
- `pnpm install` 재실행 → lockfile 갱신
- **★MAJOR3 post-install 트리 단언 (필수)**: `pnpm why path-to-regexp` 실행 → express 서브트리가 `router@2.x → path-to-regexp@8.x`만 거치고 **express에서 0.1.12로 가는 edge가 없음**을 확인. (0.1.12가 다른 소비자 때문에 store에 남는 건 무방 — express 서브트리만 단언)

### Phase 2 — 와일드카드 라우트 (F-003)
- `api-server.ts:673`:
  ```ts
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
  ```
- 등록 순서 불변: `express.static`(`:672`) → fallback(`:673`). `/api`(`:96~`)·`/health`(`:91`)는 앞 → fallback은 비매칭 경로만 처리

### Phase 3 — 검증 (F-004)
- `pnpm --filter @ai-pm/mcp-server build` (tsc, 이미 v5 타입이라 clean 기대)
- `pnpm lint` 0
- `pnpm --filter @ai-pm/mcp-server test` 전체 pass (STRICT)
- **★MINOR grep (src 한정 + 확장)**: `grep -rnE "app\.(get|all|use)\((['\"\`])\*\2" packages/mcp-server/src` → 0건 (dist 제외 — 빌드 전 stale)
- 루트 package.json override 삭제 확인

#### ★MAJOR1+2 런타임 스모크 (필수 — 옵셔널 아님)
지난 prod 크래시가 부팅 시점이었고 자동 테스트가 api-server.ts를 실행하지 않으므로, **부팅 스모크 없이 완료 주장 금지**.
- **DB 소스 (MAJOR2)**: 로컬 `.env`/`.env.test`의 `DATABASE_URL` 사용 (테스트 스위트가 이미 실 Postgres에 연결 — `runMigrations()`/`seedIfEmpty()` import-time side effect 통과 가능). DB 없으면 BLOCKED 보고
- **★throwaway STATIC_PATH (2nd critic)**: web-ui/dist가 로컬에 없으면 sendFile이 라우트와 무관하게 404 → 임시 디렉터리에 stub `index.html`(예: `<!doctype html><title>smoke</title>`) 생성 후 `STATIC_PATH=<tmpdir>`로 기동. 이러면 fallback 라우트 자체를 검증
- **부팅 무예외**: `STATIC_PATH=<tmpdir> DATABASE_URL=... node packages/mcp-server/dist/api-server.js` 백그라운드 기동 → 로그 `running on http://localhost` 출력 + 크래시 없음 확인 (스모크 후 종료)
- **4단언 (curl, Iron Law 증거 캡처)**:
  1. `curl -s -o /dev/null -w "%{http_code}" localhost:${PORT}/health` → `200`
  2. `curl -s -o /dev/null -w "%{http_code}" localhost:${PORT}/api/projects` → `401`(API_KEY 설정 시) 또는 `200`/JSON, **404/HTML 아님** (mounts + auth 정상 증명)
  3. `curl -s localhost:${PORT}/some/spa/path` → stub `index.html` HTML 본문 (`/{*splat}` subpath fallback 증명)
  4. **★bare root (2nd critic — 최고가치)**: `curl -s localhost:${PORT}/` → stub `index.html` HTML 본문. **이게 `/*splat`(오답, root 누락)과 `/{*splat}`(정답)을 구분하는 결정적 단언** — 독립 DoD 라인으로 반드시 포함

#### ★Rollback (Missing 보강)
부팅 크래시 시(Render auto-deploy = prod down 위험): `git revert`로 3파일(package.json×2 + api-server.ts) 되돌리고 재배포. **머지 전 로컬 스모크 통과 필수**라 prod 도달 방지가 1차 방어.

## Discovery 반영 매핑

- 잠복 위험 제거 → F-001/F-002 (override 삭제 + 런타임 정렬)
- SPA fallback 회귀 방지 → F-003 등록 순서 보존 + 스모크 검증
- path-to-regexp 8.x 영향 격리 → 루트 `>=8.4.0` 유지, express 핀만 제거
- 배포 회귀 방지 → 런타임 라우팅 스모크

## 예외 처리

- express 5 async 에러 자동 forward → wrapAsync 자체 catch라 무영향(글로벌 에러 핸들러 추가 불필요)
- `/{*splat}`가 정적 자산과 충돌 시 → static이 먼저라 실제 파일은 static이 처리, 없는 경로만 fallback
- **body-parser 1→2 / qs ^6.14 (express 5)**: `express.json()`만 사용, `req.query` 재할당·커스텀 query parser 없음 → 표준 JSON 페이로드라 무영향 (감사로 확인, 스모크의 `/api` POST 경로가 간접 검증)

## 테스트 전략 (DoD)

1. build tsc clean / lint 0 / test 전체 pass (STRICT)
2. `app.get('*')` 잔존 0 grep
3. override 삭제 확인
4. 런타임 스모크(서버 기동 + 3경로 curl) — 가능하면
5. 3중 리뷰: code-reviewer + security-reviewer(또는 codex) + critic adversarial

## 파일 소유권 (단일 영역)

- `packages/mcp-server/package.json` — express 버전
- `package.json` (루트) — override 삭제
- `packages/mcp-server/src/api-server.ts` — 와일드카드 라우트
- `pnpm-lock.yaml` — 자동 갱신
