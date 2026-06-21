# APS-1-12 플랜 (rev2) — remote-client x-api-key 인증 완성

Discovery: `docs/00-discovery/APS-1-12-direction.md` (보안 영역, fail-safe 활성화)
리뷰: `docs/02-review/APS-1-12-plan-review.md` (라운드 1 REJECT → 본 rev2가 critic 필수 수정 a~e 반영)

## ⚠ rev2 핵심 교정 (라운드 1 CRITICAL/MAJOR 대응)

라운드 1에서 "클라이언트/서버 독립 옵트인 = 서버 키 설정 안전"이 거짓으로 판명. **서버 자신도 `/api`의 클라이언트**(Render 헬스체크 + keep-alive 자기-핑)이기 때문. 따라서 서버 키 enforce 전에 **모든 서버측 `/api` 프로브를 무인증 `/health`로 이전**하는 것이 진짜 fail-safe.

## 기능 명세

| ID | 기능 | 우선순위 | 엣지케이스 |
|----|------|----------|-----------|
| F-001 | `buildAuthHeaders(apiKey)` 순수헬퍼 — 키 있으면 `{'x-api-key': key}`, 없으면 `{}` | P0 | 빈/공백 키 → `{}` |
| F-002 | get/post/patch/del 4헬퍼가 auth 헤더 병합 | P0 | `Content-Type`와 spread 병합, 미설정 시 byte-identical |
| F-003 | `API_KEY` 미설정 시 기존 동작 보존 | P0 | `{}` spread = no-op |
| **F-004** | **`render.yaml` healthCheckPath `/api/projects` → `/health`** (무인증) | **P0 (CRITICAL fix)** | 서버 키 설정 시 배포 outage 방지 |
| **F-005** | **keep-alive 자기-핑(`api-server.ts:687`)을 `/health`로 이전** | **P0 (MAJOR fix)** | 서버 키 설정 시 silent 401 → dyno sleep 방지 |
| **F-006** | **빈/공백 `API_KEY` 1회성 경고**(`console.warn` to stderr, 키값 미노출) | **P1 (MAJOR fix)** | "키 설정했으나 무인증 전송" silent-fail 방지 |
| **F-007** | **`API_URL`이 `http://`(non-localhost) + `API_KEY` 설정 시 평문 전송 경고** | **P1 (MAJOR fix)** | 키 평문 노출 경고 |
| F-008 | env 설정 가이드 + 안전 활성화 순서 + rollback 노트 | P1 | 서버 선설정 금지·복구 절차 |

## 기술 스택

- 기존 `fetch`(Node 내장) 유지 — 외부 의존성 없음
- 순수 헬퍼 분리 → DB 비의존 단위 테스트(matchesStrictFlag/validateStrictResults 패턴)
- 키·경고 상태는 호출/모듈 로드 시점 `process.env` 읽기. 경고는 1회성(module-scope `let warned` 플래그)

## 구현 로드맵

### Phase 1 — buildAuthHeaders + 경고 헬퍼 (F-001, F-006, F-007)
```ts
export function buildAuthHeaders(apiKey: string | undefined): Record<string, string> {
  const key = (apiKey ?? '').trim();
  return key ? { 'x-api-key': key } : {};
}
// 순수 판정 헬퍼(테스트 가능) — 실제 console.warn은 호출부에서 1회성 가드
export function authWarnings(apiUrl: string | undefined, apiKey: string | undefined): string[] {
  const warns: string[] = [];
  const rawSet = apiKey !== undefined && apiKey !== '';
  const trimmed = (apiKey ?? '').trim();
  if (rawSet && trimmed === '') warns.push('API_KEY is set but empty after trim — requests sent UNAUTHENTICATED.');
  if (trimmed && /^http:\/\/(?!localhost|127\.0\.0\.1)/.test(apiUrl ?? ''))
    warns.push('API_URL is http:// (non-localhost) — x-api-key will be sent over an INSECURE channel. Use https://.');
  return warns; // 키값 자체는 절대 미포함
}
```
- `isRemoteMode()` 진입 시 `authWarnings(...)` 결과를 module-scope 1회성 가드로 `console.warn`(stderr). 키값 미출력

### Phase 2 — 4개 헬퍼 병합 (F-002, F-003)
- 각 `fetch`의 `headers`에 `...buildAuthHeaders(process.env.API_KEY)` spread
- `get`/`del`: `headers: buildAuthHeaders(...)` / `post`/`patch`: `{ 'Content-Type': ..., ...buildAuthHeaders(...) }`
- 미설정 시 `{}` spread → byte-identical (open question: `get`/`del`에 `headers:{}` 추가가 wire no-op임을 테스트로 단언)

### Phase 3 — 서버측 프로브 무인증화 (F-004, F-005) ★CRITICAL/MAJOR
- `render.yaml:13` `healthCheckPath: /api/projects` → `/health`
- `api-server.ts:687` `fetch(\`${RENDER_URL}/api/projects\`)` → `fetch(\`${RENDER_URL}/health\`)`
- 근거: `/health`(`:91`)는 `apiKeyAuth`(`:96`) 이전 마운트 → 키 enforce와 무관하게 200

### Phase 4 — 테스트 (F-001, F-006, F-007)
- 신규 `remote-client.test.ts`: `buildAuthHeaders`(키 유/무/공백/trim) + `authWarnings`(빈 키 경고/http 경고/https 무경고/localhost 무경고/정상 무경고)
- `get`/`del` 빈 헤더 wire no-op 단언(open question 해소)

### Phase 5 — env 가이드 + rollback (F-008)
- 활성화 순서: ① Phase 3 머지·배포(프로브 `/health`화, 무인증 동작 불변) → ② 로컬 클라이언트 `API_KEY` 설정 → ③ Render `API_KEY` 동일 값 설정
- **서버 선설정 절대 금지** (③ 전에 ①이 배포돼 있어야 함)
- **Rollback**: 활성화 후 이상 시 Render `API_KEY` env 삭제 → 즉시 무인증 복구(서버 옵트인이라 unset = skip)
- `render.yaml` `API_KEY`는 `sync: false` 주석 가이드(Blueprint 재제거 방지)
- **web-ui SPA 영향**: web-ui SPA도 `/api`를 호출하므로 서버 `API_KEY` enforce 시 대시보드가 401 (SPA가 별도로 키를 전송해야 함 — 본 티켓 범위 외, 운영자 인지용)
- **`/health` 헬스체크 트레이드오프**: `/health`는 DB를 점검하지 않으므로 기존 `/api/projects` 헬스체크가 제공하던 DB 연결성 확인을 상실 (의도된 모니터링 fidelity 트레이드오프, 수용)

## Discovery + 라운드1 리뷰 반영 매핑

- 배포 순서 위험(§6) → **F-004/F-005로 서버측 프로브 무인증화**가 진짜 fail-safe (라운드1 CRITICAL 해소)
- silent-fail → F-006 경고 (라운드1 MAJOR2)
- 평문 전송 → F-007 경고 + Phase5 HTTPS 가이드 (라운드1 MAJOR3)
- 하위호환 → F-003 `{}` no-op
- 키 노출 금지 → 경고 문자열에 키값 미포함, 에러 경로 키 미포함
- YAGNI → OAuth/JWT/로테이션 제외

## 예외 처리

- 키 불일치 → 서버 401 → 기존 `!res.ok` 경로가 `{error}` throw(키 미포함)
- 빈 키/http → throw 아님, 경고만(동작 지속)

## 테스트 전략 (DoD)

1. `buildAuthHeaders` + `authWarnings` 단위 테스트(전 분기)
2. `get`/`del` 빈 헤더 wire no-op 단언
3. build tsc clean / lint 0 / test 전체 pass (STRICT)
4. 3중 리뷰: code-reviewer + security-reviewer + critic adversarial (보안 영역)
5. **F-004/F-005 회귀 확인**: render.yaml·keep-alive가 `/health` 가리킴을 grep 검증
6. (활성화 시 수동) 배포 후 `/health` 200 / 키 없는 `/api` 401 / 키 있는 호출 200

## 파일 소유권 (단일 영역, cross-region 불요)

- `packages/mcp-server/src/remote-client.ts` — buildAuthHeaders + authWarnings + 4헬퍼
- `packages/mcp-server/src/api-server.ts` — keep-alive 핑 `/health`화 (L687)
- `render.yaml` — healthCheckPath `/health` + API_KEY 가이드 주석
- `packages/mcp-server/src/__tests__/remote-client.test.ts` (신규) — 단위 테스트
