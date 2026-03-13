# AI PM System × bkit 갭 분석

> **PDCA Phase**: Analysis (Check)
> **작성일**: 2026-03-12
> **티켓**: APS-5-4

---

## 현재 개발 프로세스 현황

### 강점

| 항목 | 현황 |
|------|------|
| 티켓 기반 개발 | CLAUDE.md로 엄격히 강제됨 |
| 상태 전환 제어 | smart_workflow로 단계별 검증 |
| 에픽 구조 | 5개 에픽으로 기능 분류됨 |
| 빌드 파이프라인 | pnpm -r build 표준화 |

### 개선 필요 영역

| 영역 | 현황 | bkit 적용 후 |
|------|------|-------------|
| 문서화 | docs/ 폴더 있으나 비정형적 | PDCA 단계별 표준 문서 |
| 코드 리뷰 | approve_review 필수이나 가이드라인 없음 | /code-review 결과를 notes로 활용 |
| QA | test_results 형식이 명세되지 않음 | 표준 형식 정의 및 문서화 |
| UI 일관성 | 컴포넌트별 독립 스타일링 | 디자인 시스템 문서 기반 개발 |
| API 설계 | 구현 후 문서 없음 | 선설계 후 구현 패턴 적용 |

---

## 갭 분석 결과

### Gap 1: 문서화 프로세스 부재
- **현재**: 티켓 description에 간략 설명만 존재
- **목표**: PDCA 단계별 문서 (plan → design → analysis → report)
- **개선**: `/pdca plan` 실행을 create_task 전에 필수화

### Gap 2: 코드 리뷰 기준 불명확
- **현재**: approve_review notes에 20자 이상만 요구
- **목표**: 심각도별 분류, 파일:라인 기준 소견
- **개선**: `/code-review` 실행 후 결과를 notes로 구조화

### Gap 3: test_results 형식 비표준화
- **현재**: build output을 자유 형식으로 작성
- **목표**: test_type, status, output, duration_ms 표준 형식
- **개선**: `docs/02-design/test-results-standard.md` 기준 적용

### Gap 4: UI 컴포넌트 설계 기준 없음
- **현재**: 컴포넌트별 개별 개발
- **목표**: 디자인 시스템 기반 일관된 UI
- **개선**: `docs/02-design/web-ui-design-system.md` 참조 필수화

### Gap 5: MCP 도구 설계 문서 없음
- **현재**: 코드가 곧 명세
- **목표**: 도구 추가 전 API 설계 문서 작성
- **개선**: `docs/02-design/mcp-api-design.md` 선설계 후 구현

---

## 개선 기대 효과

| 지표 | 현재 | 목표 |
|------|------|------|
| 기능당 문서 완성도 | ~20% | >80% |
| 코드 리뷰 통과율 | 미측정 | critical 이슈 0건 목표 |
| 빌드 실패율 | 미측정 | <5% |
| UI 일관성 점수 | 미측정 | 디자인 시스템 준수율 >90% |
