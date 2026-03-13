# AI PM System × bkit 통합 계획

> **PDCA Phase**: Plan
> **작성일**: 2026-03-12
> **티켓**: APS-5-4

---

## 목표

bkit AI Native Development Toolkit의 핵심 스킬을 AI PM System 개발 워크플로우에 통합하여 **코드 품질**, **문서 일관성**, **QA 자동화** 수준을 향상시킨다.

---

## 범위

| 스킬 | 적용 대상 | 기대 효과 |
|------|-----------|-----------|
| `/pdca` | 전체 워크플로우 | 문서 기반 개발 체계화 |
| `/code-review` | mcp-server, web-ui | 코드 품질 기준 확립 |
| `/zero-script-qa` | 빌드/테스트 단계 | submit_test 표준화 |
| `/phase-5-design-system` | web-ui 컴포넌트 | UI 일관성 확보 |
| `/phase-4-api` | MCP 서버 도구 | API 설계 문서화 |

---

## 성공 기준

- [ ] docs/01-plan, docs/02-design, docs/03-analysis, docs/04-report 각 폴더에 bkit 통합 문서 완성
- [ ] code-review 결과 기반 개선 항목 도출 (critical/high 이슈 0건 목표)
- [ ] test_results 표준 형식 정의 및 AGENTS.md 반영
- [ ] 웹 UI 디자인 시스템 문서화 (컴포넌트 카탈로그)
- [ ] MCP 도구 전체 API 설계 문서 완성

---

## 리스크

| 리스크 | 가능성 | 대응 |
|--------|--------|------|
| 기존 워크플로우와 충돌 | 낮음 | CLAUDE.md 우선 적용, bkit는 보조 가이드 역할 |
| 문서와 실제 코드 불일치 | 중간 | gap-analysis 단계로 검증 |
| bkit 스킬 업데이트로 인한 가이드 변경 | 낮음 | 버전 명시 및 주기적 검토 |

---

## 일정

1. **Day 1**: PDCA 문서 구조 수립 (현재)
2. **Day 1**: 코드 리뷰 실행 및 결과 문서화
3. **Day 1**: Zero Script QA 방법론 적용
4. **Day 2**: 디자인 시스템 문서화
5. **Day 2**: MCP API 설계 문서화
6. **Day 2**: 갭 분석 및 리포트 작성
