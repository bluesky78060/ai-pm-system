# APS-2-1: 표준 템플릿 라이브러리 — 구현 플랜

- **티켓**: APS-2-1
- **분류**: 1중 검증

## 산출물 (3개)

### F-001 (P0): `.claude/templates/mcp-tool-addition.md`
APS-1-1 골격 — 새 MCP 도구 추가 표준 패턴.
**섹션**: 사전 체크 / 도구 등록 (index.ts) / 서비스 클래스 / 입력 스키마 (`confirmed`) / 에러 분류 / 단위 테스트 / 보안 체크리스트 (7개 _security-base 함수 활용)

### F-002 (P0): `.claude/templates/external-api-integration.md`
APS-1-2 골격 — 외부 API 통합 시 `_security-base` 모듈 활용 가이드.
**섹션**: import 패턴 / 4중 마스킹 / nonce 마커 / atomic write / task_id 검증 / URL 필터 / 비용 가드 화이트리스트 / 환경변수 안내

### F-003 (P0): `.claude/templates/service-implementation.md`
ResearchService 패턴 — 백엔드 서비스 클래스 표준 골격.
**섹션**: 클래스 구조 / 옵션 주입 (researchDir 등) / validateInput / 메인 흐름 / 결과 파일 저장 (atomicWrite) / 테스트 mocking 패턴 (vitest)

### F-004 (P1): CLAUDE.md 인덱스 갱신
`.claude/templates/` 신규 디렉터리 안내 1줄 추가.

## 로드맵

- T1: 3개 템플릿 동시 작성 (메인 직접, 약 5분)
- T2: CLAUDE.md 1줄 추가
- T3: 1중 코드 리뷰 (code-reviewer 또는 writer-low)

## 산출물 체크리스트

- [ ] `.claude/templates/mcp-tool-addition.md`
- [ ] `.claude/templates/external-api-integration.md`
- [ ] `.claude/templates/service-implementation.md`
- [ ] `CLAUDE.md` (인덱스 갱신)
- [ ] `docs/02-review/APS-2-1-plan-review.md`
- [ ] `docs/03-code-review/APS-2-1-review.md`

## 단축 정책 적용

- Discovery 메인 직접 (-5분)
- 1중 검증 (-15분)
- 메인 직접 구현 (작은 작업 위임 X) (-3분)
- 플랜 리뷰 critic 빠른 검토 (-3분)
- **예상 시간: ~10분** (APS-1-1 60분 대비 -83%)
