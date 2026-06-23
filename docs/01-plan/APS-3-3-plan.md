# APS-3-3 구현 플랜 — web-ui API 키 입력 인증

- **분류**: 3중 검증 (인증/세션)
- **우선순위**: P1 (대시보드 회귀 차단)
- **선행**: `docs/00-discovery/APS-3-3-direction.md`

## 설계 핵심
`api.ts`의 중앙 `request()` 헬퍼 1곳에 x-api-key 주입 → 모든 호출 자동 커버. enforce ON/OFF 양쪽을 우아하게: **프로브 호출이 401일 때만** 키 게이트 표시(enforce OFF면 키 없이도 통과 → 게이트 안 뜸).

## 기능 명세
| ID | 기능 | P | 설명 |
|----|------|---|------|
| F-001 | api.ts 키 주입 | P0 | `getApiKey/setApiKey/clearApiKey`(localStorage `aipm_api_key`). `request()` 헤더에 키 있으면 `x-api-key` 추가. **401 응답 시 clearApiKey() + `window.dispatchEvent('apikey-unauthorized')`** |
| F-002 | ApiKeyGate 컴포넌트 | P0 | `components/ApiKeyGate.tsx`. 마운트 시 프로브(`api.listProjects()`): 성공→children 렌더(enforce OFF or 유효키). 401→키 입력폼(password 마스킹) 표시. 입력 후 저장+재프로브. `apikey-unauthorized` 이벤트 수신 시 게이트로 복귀 |
| F-003 | App 래핑 | P0 | `App.tsx` 본문(또는 main.tsx)을 `<ApiKeyGate>`로 감싸 게이트 통과 전 라우트 미렌더 |
| F-004 | 로그아웃 | P1 | 헤더에 "로그아웃"(clearApiKey + 게이트 복귀) 버튼 |

## 구현 로드맵
- **P1**: `api.ts` — 키 헬퍼 + request() 주입 + 401 인터셉트 (executor)
- **P2**: `ApiKeyGate.tsx` — 프로브/입력폼/이벤트 (designer)
- **P3**: `App.tsx` wiring + 로그아웃 버튼 (designer)
- **P4**: 빌드 + 3중 리뷰 (code-reviewer + security-reviewer + critic)

## 보안 (3중 점검 대상)
- localStorage 키 = 서버 API_KEY(전체 접근). 단일사용자·HTTPS·비공개 URL 전제로 수용. XSS 시 노출 가능 → 입력 마스킹 + 로그아웃 제공.
- 키를 URL/쿼리/로그에 절대 노출 금지(헤더로만).
- 프로브는 무해 GET(listProjects). 키 검증 = 서버가 함(클라이언트 비교 금지).

## 테스트 전략
- enforce ON: 키 없음→게이트, 올바른 키→데이터 로딩, 틀린 키→401→재입력, 로그아웃→게이트.
- enforce OFF: 프로브 성공→게이트 없이 바로 대시보드(회귀 없음).
- 빌드: `pnpm --filter @ai-pm/web-ui build` 통과.

## DoD
1. enforce ON 상태에서 키 입력 후 대시보드 정상 작동.
2. 401 시 자동으로 키 재입력 유도.
3. enforce OFF에서 게이트 없이 작동(하위호환).
4. 500/네트워크 오류는 키 폼을 띄우지 않음(재시도 에러 상태).
5. keyless 401(키 없음)이 프로브 루프를 만들지 않음(프로브 1회, 폼 표시, 제출 전까지 추가 요청 0).
6. 3중 리뷰(인증) 통과.

## rev2 — critic 플랜 리뷰 반영 (MAJOR 2 + MINOR 4)

**MAJOR-1 (프로브 루프 차단)** — F-001/F-002 정밀화:
- `request()`의 401 처리: **키가 실제로 있었고(keyed) 거부된 경우에만** `clearApiKey()` + `dispatchEvent('apikey-unauthorized')` (= 세션 만료). **키 없는(keyless) 401은 이벤트 발화 안 함** — 이는 게이트 진입 정상 상태이지 만료가 아님.
- `ApiKeyGate`: 마운트 프로브가 401이면 **폼 표시만** 하고, **폼 표시 중에는 자동 재프로브 금지**(사용자 제출 시에만 재프로브). 이벤트 핸들러는 idempotent(다중 in-flight 401 중복 이벤트 무시).

**MAJOR-2 (401 vs 비-401 구분)** — F-001 에러 형태:
- `request()`는 throw 시 HTTP status 부착: `throw Object.assign(new Error(err.error ?? res.statusText), { status: res.status })`. 네트워크 실패(fetch reject)는 status undefined.
- 프로브는 **`status === 401`일 때만** 키 폼 표시. 403/500/네트워크/CORS는 **재시도 가능 에러 상태**(에러 메시지 + 재시도 버튼), 키 폼 안 띄움.

**MINOR 반영**:
- (m1) 키 trim: `aipm_api_key`는 trim 후 저장, `request()`는 `key.trim()` 비어있지 않을 때만 `x-api-key` 첨부(`remote-client.ts:14` 관례). 빈/공백 제출 거부.
- (m2) StrictMode dev 이중 프로브는 무해(GET) — executor가 phantom 버그로 오인 말 것.
- (m3) **게이트는 `App.tsx`의 `<Routes>`만 감쌈**(헤더/로그아웃 버튼은 항상 보이게). main.tsx 전체 래핑 금지.
- (m4) 두 MAJOR 시나리오 자동 테스트 추가(web-ui 테스트 인프라 존재 시 RTL, 없으면 프로브/status 분기 로직을 순수 함수로 추출해 단위 테스트).
- (보안 정정) localStorage 키는 XSS "완화"가 아니라 **accepted residual risk**(단일사용자+비공개 URL+HTTPS 전제). 마스킹은 shoulder-surfing만, 로그아웃은 의심 시에만 유효 — 정직하게 표기.
- (UX) 키 제출 후 keyed 401이면 "키가 올바르지 않습니다" 명시 메시지.

**선결 확인**: 배포된 Render에 `API_KEY`가 실제 설정됨(enforce ON) — 본 세션에서 확인됨(/api 401). 동일 출처(SPA가 api-server에서 static 서빙, `api-server.ts:675`)라 CORS preflight 무관.
