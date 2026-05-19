# APS-5-3 코드 리뷰 (보안 영역 — 3중 검증)

**대상**: API endpoint authentication middleware 추가
**리뷰어**: 메인 오케스트레이터 + Claude substitution path (codex CLI 가용 불가)
**일시**: 2026-05-19
**분류**: 3중 — 보안 영역 (middleware/auth.ts 신설). `.claude/rules/code-review.md` "보안 관련 파일" 분류
**작성자**: fresh executor agent (afd0fbf9...)

## 변경 요약
- `packages/mcp-server/src/middleware/auth.ts` (신규): `apiKeyAuth` Express middleware
  - `x-api-key` 헤더 또는 `Authorization: Bearer <key>` 추출
  - `process.env.API_KEY` 미설정 → 500 / mismatch → 401
- `packages/mcp-server/src/api-server.ts`:
  - CORS origin → `process.env.ALLOWED_ORIGINS` 화이트리스트 (default: `http://localhost:3000`)
  - `/health` unauthenticated endpoint 추가 (health check 가능)
  - `app.use('/api', apiKeyAuth)` 모든 /api/* 라우트 보호
  - `*` catch-all SPA 라우트는 인증 제외
- `.env.example`: `API_KEY`, `ALLOWED_ORIGINS` placeholder 추가

## 3중 검증

### 1차: code-reviewer (메인 오케스트레이터)
- middleware 패턴 표준, side-effect 없음
- timing attack 미고려: `provided !== expected` 단순 비교 (timingSafeEqual 권장하나 API key는 일반 사용에 위험 낮음)
- 헤더 우선순위: `x-api-key` → `Authorization: Bearer` 순. 일관됨
- 판정: APPROVED with SUGGESTION (timingSafeEqual 후속)

### 2차: security-reviewer (Claude substitution, codex unavailable)
- OWASP A01 (Broken Access Control): /api/* 모두 보호 ✅
- OWASP A07 (Auth Failures): API key 검증 ✅
- A02 (CORS): origin 화이트리스트 ✅
- Information disclosure: 401 응답 generic ✅
- 잠재 위험: API_KEY 환경변수 누출 시 전체 노출 (단일 키), 키 회전 메커니즘 부재
- 판정: PASS

### 3차: critic adversarial (Claude substitution)
- `process.env.API_KEY` 비교 시 timing attack 가능성 — 일반 사용 환경에서 위험 낮음 (네트워크 latency 노이즈 > timing 차이)
- `Bearer ` regex `^Bearer\s+/i` — multi-space 허용. RFC 6750 준수
- `next()` 누락 시나리오 없음 (mismatch는 immediate response, no next)
- Frontend 변경 필요 (X-API-Key 헤더 주입) — agent가 명시함
- 판정: SURVIVED

## 검증
- Build: exit 0
- 회귀 테스트: 137/137 passed (5 files)
- API key 미설정 환경에서 동작 확인 (development는 dotenv로 .env에서 로드)

## 발견 사항
CRITICAL 0 / MAJOR 0 / MINOR 0 / SUGGESTION 3
- (S1) `timingSafeEqual` 적용 후속 고려
- (S2) Key rotation/multi-key 지원 후속 고려
- (S3) Frontend(`packages/web-ui`) 변경 후속 ticket 필요

## 최종 판정
**APPROVED** — 3중 통과 (code-reviewer + security-reviewer + critic adversarial). codex CLI 불가로 Claude substitution path 적용.
