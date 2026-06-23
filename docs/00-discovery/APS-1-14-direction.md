# APS-1-14 Discovery — 개선 ② MCP Progressive Disclosure

> 플랜 우선 모드. Discovery는 분석 자동채움(메인 오케스트레이터). **핵심 설계 분기는 §방향 분기에서 사용자 확정 필요.**

## 7개 카테고리

1. **목표(Why)**: ai-pm MCP의 60+ 도구가 전부 풀스키마로 시스템 프롬프트에 상주 → 매 세션 토큰 부담. 핵심 소수만 상시 노출하고 나머지는 지연 로딩하여 도구 섹션 토큰을 대폭 절감. 성공 기준: 도구 섹션 토큰 before/after 측정 + 전 도구 호출 회귀 무결.
2. **사용자(Who)**: ai-pm를 호출하는 모든 Claude Code 세션의 메인 오케스트레이터. 페인 포인트 = 거의 안 쓰는 도구들의 스키마가 컨텍스트를 잠식.
3. **범위(What)**: MVP = 핵심 도구(create_task·smart_workflow·get_project_status·get_task·list_tasks 등 ~8종) 상시 노출 + 저빈도 도구 지연 로딩. **제외**: code-execution 전면 재작성(후속), 도구 자체 삭제/통합.
4. **제약(Constraints)**: MCP 프로토콜 준수. **Claude Code 클라이언트의 deferred-tool/ToolSearch와 충돌 금지**(현 세션도 ToolSearch로 지연 로딩 중). 기존 도구 호출 시그니처 불변. `packages/mcp-server` TypeScript.
5. **우선순위(Priority)**: P3. 핵심 세트는 **항상 노출(안전망)** — 지연 로딩 실패해도 워크플로우 필수 경로는 동작.
6. **리스크(Risk)**: (a) 클라이언트가 서버측 progressive disclosure를 미지원하면 효과 없음 → **선검증 필수**. (b) 지연 로딩 버그 시 도구 호출 실패. (c) 도구 빈도 데이터 부정확.
7. **검증(Verify)**: 도구 섹션 토큰 측정, 60+ 도구 전수 호출 스모크 테스트, 핵심 경로(create→done) E2E.

## 방향 분기 (플랜에서 사용자 확정)

- **경로 A — Progressive Disclosure**: 핵심 ~8종 상시 + `list_capabilities`/`load_tool` 메타 도구. 변경 적음, MCP 표준 내.
- **경로 B — Code Execution with MCP**: 도구를 코드 API로 노출, 호출 시 스키마 로드. 절감 최대(97~98% 사례)이나 재작성 큼.
- **선결 검증**: Claude Code MCP 클라이언트가 per-tool 지연 로딩을 실제 지원하는지. 미지원이면 서버측 도구 수 축소/통합으로 대체.
- **추천**: 경로 A(MVP) → 효과 측정 후 경로 B 검토. 단 선결 검증 결과에 종속.

## 미해결 이슈
- Claude Code가 MCP 서버의 동적 도구 노출(런타임 도구 목록 변경)을 지원하는지 문서 확인 필요(document-specialist/context7).
