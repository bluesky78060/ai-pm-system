# APS-4-1: Discovery 자동 채움 — 구현 플랜

- **티켓**: APS-4-1
- **분류**: 1중 검증

## 산출물

### F-001 (P0): `.claude/templates/discovery-auto-fill.md`

analyst 호출 표준 prompt 템플릿. 메인 오케스트레이터가 이 템플릿을 사용하여 analyst에 위임.

**섹션**:
- 자동 채움 가능 조건
- analyst 호출 표준 prompt (코드베이스 분석 + 과거 티켓 검색 + docs 인용)
- 7개 카테고리별 자동 채움 가이드 (Why/Who/What/Constraints/Priority/Risk/Verify)
- 출력 형식 (마크다운 7섹션 + "미해결 이슈" 섹션)
- 사용자 검토 체크리스트

### F-002 (P0): `.claude/rules/discovery-and-plan.md` 보강

3단계(Discovery) 섹션에 자동 채움 워크플로우 추가:
- 호출 순서: 티켓 발행 → analyst 자동 채움 → 사용자 검토 → 방향 확정
- 자동 채움 권장 조건 (P0/P1, 외부 통합, 신규 기능)
- 자동 채움 생략 케이스 (단순 버그 수정, 문서 변경, 1중 검증 분류)

### F-003 (P1): CLAUDE.md 인덱스 (이미 templates 추가됨, 추가 변경 불필요)

## 로드맵

- T1: discovery-auto-fill.md 작성 (메인 직접, 5분)
- T2: discovery-and-plan.md 보강 (3분)
- T3: 1중 코드 리뷰 (writer/code-reviewer, 2분)

## 산출물 체크리스트

- [ ] `.claude/templates/discovery-auto-fill.md`
- [ ] `.claude/rules/discovery-and-plan.md` (보강)
- [ ] `docs/02-review/APS-4-1-plan-review.md`
- [ ] `docs/03-code-review/APS-4-1-review.md`

## 단축 정책 효과

- Discovery 메인 직접 작성 (-5분)
- 1중 검증 (-15분)
- 메인 직접 구현 (-3분)
- 자체 plan-review (단순 가이드, critic 생략) (-3분)
- **예상 시간: ~10분**
