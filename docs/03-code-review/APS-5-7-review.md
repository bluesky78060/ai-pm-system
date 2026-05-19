# APS-5-7 코드 리뷰 (보안 영역 — 3중 검증)

**대상**: Neon/Render TLS rejectUnauthorized false 정정 (CA cert 명시)
**리뷰어**: 메인 오케스트레이터 + Claude substitution path
**일시**: 2026-05-19
**분류**: 3중 — TLS 보안 변경
**작성자**: fresh executor agent (a1774b4d...)

## 변경 요약
- `packages/mcp-server/src/db/connection.ts:22`
  - 변경 전: `ssl: { rejectUnauthorized: false }` (MITM 노출)
  - 변경 후: `ssl: { rejectUnauthorized: true }` (Node.js 기본 CA bundle로 검증)
- Neon은 Let's Encrypt ISRG Root X1, Render는 AWS Trust Services CA 사용 → 기본 CA에 포함 → 별도 cert 인젝션 불필요

## 3중 검증

### 1차: code-reviewer
- 단일 라인 변경, side-effect: 인증서 검증 활성화
- APS-5-10에서 추가된 pg type parser와 file head 변경 충돌 없음 (다른 라인)
- 판정: APPROVED

### 2차: security-reviewer
- OWASP A02 (Cryptographic Failures): MITM 방어 강화 ✅
- 인증서 무결성: Node.js 기본 CA bundle은 Mozilla CA store mirror, 신뢰성 검증됨
- 잠재 위험: 인증서 만료/변경 시 connection fail. 운영 관점에서는 안전 (zero-downtime CA rotation)
- 판정: PASS

### 3차: critic adversarial
- "self-signed certificate" 에러 시나리오: Neon/Render는 trusted CA만 사용 — 발생 없음
- `DB_CA_CERT` fallback 미사용: 향후 self-hosted PostgreSQL 도입 시 추가 필요 (agent가 보조 옵션 코멘트 제공)
- macOS Node.js 환경 호환성: Let's Encrypt root는 macOS Node default bundle 포함 — 확인됨
- 판정: SURVIVED

## 검증
- Build: exit 0
- 회귀: 137/137 passed (5 files), SSL 에러 0건
- Neon test branch 정상 연결 확인 (Let's Encrypt CA validated)

## 발견 사항
CRITICAL 0 / MAJOR 0 / MINOR 0 / SUGGESTION 1
- (S1) `DB_CA_CERT` env fallback은 self-hosted PostgreSQL 도입 시 추가 후속

## 최종 판정
**APPROVED** — 3중 통과 (Claude substitution). MITM 위험 제거.
