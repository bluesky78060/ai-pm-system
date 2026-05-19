# APS-5-8 코드 리뷰 (1중)

**대상**: 에러 메시지 user-supplied ID 마스킹
**리뷰어**: 메인 오케스트레이터 (Claude Opus, in-session)
**일시**: 2026-05-19
**분류**: 1중 (다중 파일 단순 정정, 동작 의도 동일)
**작성자**: fresh executor agent (a29aa604...)

## 변경 요약
- 13개 service + api-server.ts에서 총 33개 위치 정정
  - context-service / analysis-service / search-service / export-service / auto-assignment-service / workflow-service / priority-recommendation-service / task-service / template-service / test-service / github-service / api-server (route handlers)
- 패턴: `throw new Error(\`...: ${id}\`)` → `console.error(...with id); throw new Error('...(no id)')`
- 예외 유지: enum/format validation, 내부 state-transition, project_id 외 비-식별자 — agent가 명시 적시

## 검증
- Build: exit 0
- 회귀: 137/137 passed (5 files)
- context-service 회귀 테스트 3/3 (에러 message 검증 없음, 기존 호환)

## 발견 사항
CRITICAL 0 / MAJOR 0 / MINOR 0 / SUGGESTION 1
- (S1) Frontend가 에러 메시지에 ID 표시 의존 시 UX 영향 가능. 별도 ticket으로 audit 권장.

## 최종 판정
**APPROVED** — IDOR/enumeration 보조 위험 제거. 정보는 서버 로그에 보존.
