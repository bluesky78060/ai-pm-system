# APS-1-13 플랜 리뷰 — express 4 → 5 업그레이드

architecture/의존성 메이저 → critic ADVERSARIAL. 작성자(메인)와 분리.

## 라운드 1 — critic: ACCEPT-WITH-RESERVATIONS (MAJOR 3 → rev2 반영 조건부)

### 정확성 검증 (critic이 오히려 입증 — PASS)
- `app.get('/{*splat}')` express 5/path-to-regexp 8.4.2 유효, 중괄호가 optional이라 root `/`+subpath 매칭 ✅
- override 전파: express 5.2.1 → router@2.2.0 → path-to-regexp@^8.0.0. `express>path-to-regexp:0.1.12` 무효(삭제 정답), `>=8.4.0`가 커버 ✅
- 코드 감사: src에 `app.get('*')` 단 1건, `req.query=` 재할당·removed 시그니처 없음 ✅

### 🟠 MAJOR 3건 (검증 규율 — rev2에서 해소)
1. **런타임 스모크 "가능하면" = 유일한 회귀 검출 수단이 옵셔널**: 지난 prod 크래시(`8af5fda`, 부팅 시 `TypeError: pathRegexp is not a function`)는 build/lint/unit 전부 통과하고도 발생(어떤 테스트도 api-server.ts import 안 함). → 스모크 **필수화** + 3단언(`/health`→200, `/api/projects`→401|JSON, `/spa/path`→index.html HTML) + 부팅 무예외
2. **부팅 side effect**: `api-server.ts:25 runMigrations()` `:60 seedIfEmpty()`가 import 시 실행 → DATABASE_URL 필수. 스모크 DB 소스 미명시 시 "불가"로 silent 강등 → DB 소스 명시
3. **resolved 트리 미검증**: override 텍스트 삭제만 확인, 실제 resolution 미확인. 지난 크래시가 resolution 버그. → `pnpm why path-to-regexp`로 express 서브트리에 0.1.12 edge 없고 8.x만임을 단언

### 🟡 MINOR
- grep DoD는 `src/`만 대상(dist는 빌드 전 stale `app.get('*')` 잔존 → false positive). 패턴을 `app.(get|all|use)` + `*`로 확장
- `^5.1.0` resolve = 5.2.1 (caret 허용, staleness만)

### What's Missing
- **rollback 단계 부재**: Render auto-deploy라 부팅 크래시 = prod down. `git revert` 3파일 + 로컬 스모크 선행 명시
- body-parser 1→2, qs ^6.14 동작 변화 note (검증됨: JSON 표준 페이로드라 무영향, 근거 명시)

### 체크리스트 (라운드1)
C1 PASS / C2 PASS / C3 PASS / C4 PARTIAL(스모크 옵셔널) / C5 PASS / C6 PASS / C7 FAIL(스모크 옵셔널+자동 라우트 테스트 0) → ACCEPT-WITH-RESERVATIONS

### ACCEPT 조건 (critic 명시)
(1) 스모크 필수+3단언 (2) 부팅 DB 소스 명시 (3) post-install 트리 검증

## 메인 오케스트레이터 처리

MAJOR 3건 전부 additive 검증 강화(설계 변경 아님). rev2에 (1)(2)(3) + MINOR + rollback + body-parser note 반영 → 라운드2 자체 검토.

---

## 라운드 2 — rev2 메인 자체 검토

- rev2가 critic ACCEPT 조건 (1)(2)(3) 전부 반영 확인:
  - Phase 3 스모크 **필수화** + 3단언 명시(`/health` 200 / `/api/projects` 401|JSON / `/{spa}` index.html HTML) + 부팅 무예외
  - DB 소스: 로컬 `.env`/`.env.test`의 `DATABASE_URL` 사용(테스트 스위트가 이미 실 Postgres 연결) 명시
  - Phase 1에 `pnpm why path-to-regexp` express 서브트리 단언 추가
  - grep src 한정 + `app.(get|all|use)('*')` 확장, rollback(git revert 3파일+로컬 선행), body-parser note 추가
- 검증 강화는 구현 시 **실제 스모크 실행이 핵심** — executor 브리프에 필수 명시
- **판정: 승인. start_work 진행.** (additive 검증 강화라 critic 재투입 불요 — 정확성은 라운드1에서 입증됨)

### 독립 2차 critic 수렴 (방어적 재투입 결과 — 우연히 도착)
원 critic 지연(190s)으로 방어 재투입한 2차 critic도 **독립적으로 동일 verdict**(ACCEPT-WITH-RESERVATIONS, 유일 MAJOR=옵셔널 스모크). 두 가지 값진 구체화 추가 반영:
1. **bare root `/` → index.html 독립 단언**: `/{*splat}`(정답) vs `/*splat`(root 누락 오답) 구분하는 결정적 체크 (rev2 4단언 #4)
2. **throwaway STATIC_PATH + stub index.html**: web-ui/dist 부재 시 sendFile 404가 라우트와 무관하게 발생 → 임시 STATIC_PATH로 라우트 자체 검증
2차 critic이 lockfile에 이미 `express@5.2.1/router@2.2.0/path-to-regexp@8.4.2` 존재(express-rate-limit 경유) 확인 — override 제거 안전 재입증. 두 리뷰어 수렴으로 신뢰도 강화.
