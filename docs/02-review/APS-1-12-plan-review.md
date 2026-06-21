# APS-1-12 플랜 리뷰 — remote-client x-api-key 인증 완성

보안 영역(인증) → critic 적대적(ADVERSARIAL) 모드 리뷰. 작성자(메인)와 분리.

## 라운드 1 — critic: REJECT (반려)

critic이 첫 CRITICAL 발견 후 ADVERSARIAL로 격상, 모든 `/api` 호출자 + Render 설정으로 범위 확장.

### 🔴 CRITICAL 1건 (실측 검증 완료)
- **Render 헬스체크 401 → 배포 outage**: `render.yaml:13` `healthCheckPath: /api/projects`가 인증 라우트(`api-server.ts:96` `app.use('/api', apiKeyAuth)`). 서버 `API_KEY` 설정(플랜 Phase 4 ②) 즉시 Render 프로브가 401 → unhealthy → 배포 실패/재시작 루프. **플랜이 "안전하다"고 주장한 바로 그 동작(서버 키 설정)이 전면 outage를 유발** → fail-safe 주장 무효
  - 검증: `grep` 결과 `render.yaml:13` = `/api/projects`, `/health`(`:91`)는 `apiKeyAuth`(`:96`) 이전 마운트 확인

### 🟠 MAJOR 3건
1. **keep-alive 자기-핑 silent 401**: `api-server.ts:687` `fetch(\`${RENDER_URL}/api/projects\`).catch(()=>{})` — 인증 라우트 무헤더. 서버 키 설정 시 매 핑 401 silent → free-tier dyno sleep 회귀(에러 swallow로 진단 곤란)
2. **빈/공백 키 silent-fail**: `buildAuthHeaders`가 `{}` 반환 시 운영자는 "인증 켰다" 오인하나 실제 무인증 전송. 서버 키도 설정됐으면 전 호출 401 (원인 힌트 없음)
3. **평문 HTTP 키 노출**: `API_URL`이 `http://`면 x-api-key 평문 전송. 플랜이 HTTPS 강제/경고 없음

### 체크리스트 게이팅 (critic)
C1 PARTIAL / C2 FAIL / C3 FAIL / C4 PARTIAL / C5 FAIL / C6 PARTIAL / C7 PARTIAL → **REJECT**

### 필수 수정 요구 (ACCEPT 조건)
- (a) `healthCheckPath`를 무인증 `/health`로 — P0 태스크
- (b) keep-alive 핑을 `/health`로 돌리거나 auth 스코프 편입
- (c) 빈 키 경고(console.warn, 키값 미노출) + 테스트
- (d) HTTP vs HTTPS 전송 가드/경고
- (e) 활성화 rollback 노트(서버 `API_KEY` unset 복구)

## 메인 오케스트레이터 처리

반려 수용. CRITICAL/MAJOR 전부 실측 검증됨(허위 양성 아님). 플랜을 (a)~(e) 전부 반영해 수정 → 라운드 2 재리뷰 진행.

---

## 라운드 2 — critic: ACCEPT-WITH-RESERVATIONS (승인)

ADVERSARIAL 유지. 모든 load-bearing 주장을 소스로 독립 재검증.

### 라운드1 필수수정 a~e — 전부 RESOLVED (코드 검증)
- (a) healthCheckPath→`/health`: F-004. `/health`(`:91`)가 `apiKeyAuth`(`:96`) **이전** 마운트 확인 → 키 무관 200 ✅
- (b) keep-alive→`/health`: F-005. `:687`이 유일한 서버측 `/api` fetch 확인 ✅
- (c) 빈 키 경고(키값 미노출): F-006 `authWarnings` `rawSet && trimmed===''` 분기 ✅
- (d) HTTP/HTTPS 가드: F-007 (MINOR 잔여) ✅
- (e) rollback: Phase5. `auth.ts:5` `!expected→next()`라 unset=no-op 복구 유효 ✅

### 신규 CRITICAL/MAJOR: 0건. 서버측 `/api` 호출자는 정확히 2개(둘 다 처리)

### MINOR 3건 (구현 시 반영, 비차단)
1. 정규식 `/^http:\/\/(?!localhost|127\.0\.0\.1)/`이 대문자 스킴·leading-space 미탐 → `(apiUrl??'').trim().toLowerCase()`로 정규화 후 판정 + 테스트 케이스 추가
2. `localhost.evil.com` false-negative — 위협모델상 무시 가능(note만)
3. `get`/`del` 빈 헤더 wire no-op을 **실제 테스트로 단언**(현재는 open question 문구) — fetch mock으로 headers 검증

### Phase 5 문서 보강 2줄 (구현 시 추가)
- web-ui SPA도 `/api` 호출 → 서버 키 enforce 시 대시보드 401 (SPA 키 전송 별도 필요) 경고
- `/health`는 DB 미점검 → 기존 `/api/projects` 헬스체크의 DB 연결성 확인 상실(모니터링 fidelity 트레이드오프, 의도된 수용)

### 체크리스트 7개 (라운드2)
C1 PASS / C2 PASS / C3 PASS / C4 PASS / C5 PASS / C6 PASS(정규식 MINOR) / C7 PASS(wire 단언 MINOR) → **ACCEPT**

## 메인 오케스트레이터 자체 검토 (5단계 2차)

- 체크리스트 7개 critic PASS 확인. CRITICAL/MAJOR 0 → 구현 진행 가능
- MINOR 3건 + Phase5 2줄은 executor 브리프에 명시 접합 (재리뷰 불요 — 비차단)
- 라운드1 CRITICAL이 실제 outage를 막은 핵심 가치. rev2가 구조적으로(pre-auth 마운트) 해소 → 승인
- **판정: 승인. start_work 진행.** (2회차 ACCEPT, max 3회 내)

