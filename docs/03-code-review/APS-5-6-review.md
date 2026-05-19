# APS-5-6 코드 리뷰 (1중)

**대상**: pre-commit hook으로 unscoped DELETE 차단 (mechanical guard)
**리뷰어**: 메인 오케스트레이터 (Claude Opus, in-session)
**일시**: 2026-05-19
**분류**: 1중 (hook 신설)
**작성자**: fresh executor agent (a14f18d8...)

## 변경 요약
- `.git/hooks/pre-commit` (신규): unscoped `DELETE FROM` guard
  - 대상: staged `packages/mcp-server/src/**/__tests__/**/*.ts` 파일
  - 차단 패턴: `DELETE FROM <table>` (with optional `;` `)` `$`) AND no `WHERE`
  - `command grep` 사용으로 alias 우회
  - macOS BSD grep ERE 호환

## 검증
- 5/5 시나리오 통과:
  - scoped DELETE (WHERE 포함) → 허용
  - unscoped DELETE (`;` 포함) → 차단
  - unscoped DELETE (`;` 없음) → 차단
  - 대소문자 혼합 (`delete from`) → 차단
  - 비-test 파일 → 무시
- 기존 test 파일 전체 false positive 없음

## 발견 사항
CRITICAL 0 / MAJOR 0 / MINOR 1 / SUGGESTION 1
- (M1) `.git/hooks/pre-commit`은 git clone 시 자동 설치 안 됨 → husky 또는 setup script 필요 (후속 ticket 권장)
- (S1) hook을 `.claude/hooks/` 또는 husky로 이전 후 자동 등록 가이드

## 최종 판정
**APPROVED** — 즉시 효과 있음. 팀 차원 자동 설치는 후속.
