# APS-5-2 코드 리뷰 (1중)

**대상**: codex-review-guard hook 파일명 grep false positive 정정
**리뷰어**: 메인 오케스트레이터 (Claude Opus, in-session)
**일시**: 2026-05-19
**분류**: 1중 (hook 1줄 수정)
**작성자**: fresh executor agent (a50e0f05...)

## 변경 요약
- `.claude/hooks/codex-review-guard.sh:67`
  - 변경 전: `grep -qE "(auth|session|crypto|password|token|jwt|oauth)"` (파일명 단순 grep)
  - 변경 후: `grep -qE "(packages/mcp-server/src/(auth|middleware|crypto)/|/(auth|crypto)-[^/]+\.(ts|js|sh)$)"` (정확한 경로 기반)
- 변경 의도 + 알려진 한계(false negative) 코멘트 추가

## 검증
- bash syntax check: OK
- 시뮬레이션 4 케이스:
  - `.claude/hooks/session-start.sh` → PASS (false positive 제거 확인)
  - `packages/mcp-server/src/auth/login.ts` → BLOCKED (정상)
  - `.claude/hooks/discovery-guard.sh` → PASS
  - `packages/mcp-server/src/crypto/hash.ts` → BLOCKED

## 발견 사항
CRITICAL 0 / MAJOR 0 / MINOR 0
- SUGGESTION 1: 다른 디렉토리에 auth 코드 추가 시 미감지 (코멘트로 명시됨, 후속 audit 필요)

## 최종 판정
**APPROVED** — false positive 해결, false negative는 의식적 trade-off 명시.
