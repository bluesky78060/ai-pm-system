# APS-1-14 구현 플랜 — 하네스 개선 ② MCP Progressive Disclosure

> 작성: planner (Opus) · 2026-06-23 · 분류: **아키텍처 변경(3중 검증)** · 선행: `docs/00-discovery/APS-1-14-direction.md`, `docs/harness-improvements-2026.html` §②
>
> ⚠ **선결 스파이크 결과가 Discovery 추천을 보정함.** Claude Code MCP 클라이언트의 런타임 동적 도구 노출이 사실상 미작동임이 확인되어, 경로 A의 핵심 메커니즘(`load_tool` 런타임 노출)이 **현재 효과 없음**. 추천안을 **하이브리드(도구 통합 + description 슬림화)**로 변경. §2 방향 분기 참조.

---

## 0. 선결 스파이크 결과 요약 (플랜의 전제)

이 플랜은 두 가지 선결 조사를 먼저 수행한 결과 위에 세워졌다. 결과가 설계 방향을 결정하므로 가장 먼저 명시한다.

### 0-1. 현 ai-pm MCP 서버 구조 (코드 실측)

| 항목 | 실측값 | 출처 |
|------|--------|------|
| 도구 총 개수 | **40개** (Discovery의 "60+"는 과대; 실제 40) | `packages/mcp-server/src/index.ts:107-801` |
| 등록 방식 | `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...정적 배열...] }))` | `index.ts:106-802` |
| SDK | `@modelcontextprotocol/sdk@^1.12.0`, 저수준 `new Server()` API | `package.json`, `index.ts:70` |
| 도구 스키마 | 전부 `index.ts` 인라인 (`tools/` 디렉토리 없음) | `index.ts:107-801` |
| transport | **stdio** (`StdioServerTransport`) + 별도 REST(`api-server.ts`, remote mode) | `index.ts:2,1227` / `remote-client.ts` |
| capabilities | `{ tools: {} }` — **`listChanged` 미선언** | `index.ts:73` |
| 호출 디스패치 | `CallToolRequestSchema` 핸들러가 name으로 분기 | `index.ts:805` |
| 핵심 8종 존재 여부 | create_task / smart_workflow / get_project_status / get_task / list_tasks / get_session_context / update_task_status / add_dependency 모두 존재 ✔ | `index.ts` 각 라인 |

40개 전체 도구 목록(라인): create_project(110), list_projects(123), get_project(128), create_epic(139), create_task(154), decompose_task(176), update_task_status(200), set_priority(217), add_dependency(230), get_task(242), list_tasks(253), get_session_context(267), get_project_status(279), get_blocking_analysis(291), export_project(304), import_project(321), run_tests(338), report_test_result(372), create_fix_task(398), get_fix_history(422), escalate_to_human(433), link_pr_to_task(446), get_pr_status(458), create_github_issue(470), sync_commit_progress(488), get_task_activities(506), get_project_activities(519), get_task_time_summary(531), smart_workflow(544), auto_analyze(602), manage_automation(619), analyze_task_priority(650), get_priority_suggestions(662), get_workload_analysis(674), suggest_assignee(687), get_assignment_recommendations(699), create_task_template(712), list_task_templates(742), apply_task_template(753), research_with_gemini(774).

### 0-2. Claude Code 클라이언트의 동적 도구 노출 지원 (문서 실측)

| 질문 | 결론 | 근거 |
|------|------|------|
| `notifications/tools/list_changed`로 서버가 런타임에 도구를 노출/숨김 가능한가? | **현재 NO (Claude Code 클라이언트 미작동)** | 클라이언트가 `capabilities: {}` 빈 객체로 초기화 + notification 핸들러 미등록 + 최초 `tools/list`만 사용. GitHub #50339, #13646, #4118 |
| ToolSearch / deferred tools는 서버가 제어 가능한가? | **NO. 클라이언트 자동 기능** (도구 정의 토큰이 컨텍스트 ~10% 초과 시 Claude Code가 자동 발동) | platform.claude.com Tool search tool 문서, GitHub #31002 |
| "Code execution with MCP"는 서버측만 바꾸면 되는가? | **NO. 서버 전면 재설계(파일시스템 노출) + 클라이언트 sandbox 필요** | anthropic.com/engineering/code-execution-with-mcp |
| 서버측만으로 실효 절감하는 길은? | **도구 수 축소/통합 + description 슬림화** (Claude Code 자동 deferred 임계치를 낮추거나 도구 섹션 토큰 자체를 줄이는 직접 절감) | 위 종합 |

**결론(설계 전제)**: ai-pm는 stdio MCP 서버이고 호출자는 Claude Code다. 따라서 (1) 런타임 동적 노출(경로 A의 메타 도구 `load_tool`)은 **지금은 작동하지 않음**, (2) Messages API `defer_loading`은 Claude Code 비대상, (3) 경로 B(code execution)는 전면 재설계. → **서버측에서 지금 확실히 먹히는 절감은 "도구 통합으로 개수↓ + description 슬림화로 토큰↓"뿐.** 이 사실이 §2 추천을 결정한다.

---

## 1. 기능 명세

| ID | 기능 | 우선순위 | 설명 / 엣지케이스 |
|----|------|---------|------------------|
| F-001 | 도구 사용 빈도 계측 | **P0** | `get_project_activities` / DB 활동 로그로 40개 도구별 호출 빈도 집계. 데이터 부족 시(P3 프로젝트라 표본 적음) "워크플로우 필수 경로 기반 휴리스틱"으로 폴백. 엣지: 로그에 도구명 미기록 시 코드 기반 분류로 대체. |
| F-002 | 핵심 세트 확정 + 안전망 | **P0** | 워크플로우 필수 경로(create_task→smart_workflow→get_project_status→approve_review) 도구는 **항상 노출**. 통합/지연 대상에서 제외하는 화이트리스트. 엣지: 통합 후에도 핵심 8종 시그니처 불변. |
| F-003 | 토큰 베이스라인 측정 하네스 | **P0** | 변경 전/후 도구 섹션 토큰을 동일 방법으로 측정. 측정 스크립트를 `scripts/`에 두어 재현 가능. 엣지: 측정 방법이 before/after 동일해야 유효(같은 tokenizer). |
| F-004 | 저빈도 도구 통합 (action 디스패치) | **P1** | 유사 저빈도 도구를 `action` 파라미터 단일 도구로 병합(예: `task_admin(action: export\|import\|...)`). 호출 시그니처 호환 래퍼 또는 deprecation 경로 제공. 엣지: 기존 도구명 직접 호출하던 워크플로우 규칙/hook 깨지지 않도록. |
| F-005 | description / inputSchema 슬림화 | **P1** | 장황한 도구 description·파라미터 설명을 핵심만 남겨 토큰 절감. 핵심 8종은 명확성 우선(과도 축약 금지). 엣지: 한국어 설명 축약 시 의미 손실 방지. |
| F-006 | (조건부) 메타 도구 `list_capabilities` | **P2** | 통합 후에도 숨긴 도구가 있으면 이름+1줄 카탈로그 반환 도구 1종. **런타임 `load_tool` 동적 노출은 클라이언트 미지원이라 보류**(스파이크 결과). 엣지: 이 도구가 오히려 토큰을 늘리면 미채택. |
| F-007 | 60+(실측 40) 도구 회귀 스모크 + E2E | **P0** | 통합/슬림화 후 전 도구 호출 무결 + create→done E2E. 엣지: action 디스패치 도구는 모든 action 경로 테스트. |

---

## 2. 방향 분기 결정표 (사용자 확정 필요 — 본 플랜의 핵심 의사결정)

선결 스파이크(§0-2)가 **Discovery의 추천(경로 A MVP)을 보정**했다. 경로 A의 동적 노출 메커니즘이 Claude Code에서 미작동이기 때문이다.

| 경로 | 핵심 메커니즘 | 현 Claude Code에서 효과 | 노력 | 장점 | 단점 / 리스크 | 호환성 |
|------|--------------|------------------------|------|------|--------------|--------|
| **A. Progressive Disclosure (런타임 동적 노출)** | `list_capabilities` + `load_tool`로 호출 시점에 스키마 노출, `tools/list_changed`로 도구 목록 갱신 | ❌ **현재 효과 없음** — 클라이언트가 list_changed 미수신, 최초 tools/list 고정 | 중 | MCP 표준 내, 변경 적음(이론상) | **핵심 메커니즘이 클라이언트 버그로 무력화**. 구현해도 토큰 절감 0. 클라 수정 전까지 사장 | Claude Code 미지원 |
| **B. Code Execution with MCP** | 도구를 파일시스템/코드 API로 노출, sandbox에서 조합 호출 | △ 부분(Bash sandbox 존재하나 서버가 FS 노출 재설계 필요) | **높음** | 절감 최대(보고상 ~98%) | 서버 전면 재설계, 40개 도구 전부 API화, 3중 검증 + 회귀 대규모. P3 작업 대비 과투자 | 서버 재설계 필요 |
| **C. 하이브리드 — 도구 통합 + description 슬림화 (★추천)** | 저빈도 도구를 `action` 디스패치로 병합해 **도구 개수 자체를 줄이고**, description을 슬림화해 도구 섹션 토큰 직접 절감 | ✅ **지금 바로 효과** (Claude Code 자동 deferred 임계치·도구 섹션 토큰을 직접 낮춤) | 중 | 클라 버그와 무관하게 확실히 작동. 핵심 8종 불변 안전망. 단계적 롤아웃 가능 | 도구명 변경 시 워크플로우 규칙/hook 동기화 필요. 통합 도구 디스패치 복잡도 소폭↑ | Claude Code 호환 ✔ |

### 추천: **경로 C (하이브리드)** — 근거

1. **선결 검증이 경로 A를 무력화**: 경로 A는 "런타임 동적 노출"이 본질인데 Claude Code가 이를 미지원(미작동). 구현해도 토큰 절감 0이므로 MVP로 부적합.
2. **경로 B는 P3 대비 과투자**: 절감 최대지만 서버 전면 재설계 + 3중 검증 대규모. P3 우선순위에 비해 ROI 낮음. 효과 측정 후 후속 티켓으로 검토.
3. **경로 C는 지금 확실히 먹힘**: 도구 개수↓ + description↓는 클라이언트 버그와 무관하게 도구 섹션 토큰을 직접 줄인다. Claude Code의 자동 deferred(10% 임계) 발동 가능성도 높인다. 핵심 8종 상시 노출 안전망과 양립.

> **단일 viable 옵션이 아님**: A·B·C 모두 viable하나, 선결 검증 결과 A는 "현재 효과 0"으로 **사실상 무효화**되고 B는 P3 ROI 미달로 후순위. 따라서 C가 추천. **사용자가 B(전면 재설계)를 선택하면 별도 대형 티켓으로 승격**해야 함(P3→재분류).

### 사용자 결정 사항 (분기점)

- [ ] **D-1**: 경로 C(하이브리드) 채택 승인? (추천) / 아니면 경로 B(전면 재설계, 별도 대형 티켓 승격)?
- [ ] **D-2**: 도구 통합 시 **기존 도구명 호환 래퍼 유지**(안전, 토큰 절감폭↓) vs **deprecation 후 제거**(절감폭↑, 워크플로우 규칙 동시 수정 필요) — 어느 쪽?
- [ ] **D-3**: 메타 도구 `list_capabilities`(F-006)를 포함할지 — 측정상 순절감일 때만 채택(스파이크 P-2에서 결정). 기본은 보류.

---

## 3. 구현 로드맵 (Phase 1~5)

각 Phase는 독립 검증 가능. 신참 엔지니어 가정으로 파일 경로·명령 명시. **Phase 1(스파이크)·Phase 2(측정) 결과가 Phase 3 설계를 확정**하므로 순서 엄수.

### Phase 0 — 사전 준비 (티켓·워크트리)
- 작업 단위: active-ticket 갱신, watch 모드 백그라운드 기동(`dev-tips.md`).
- 파일: `.claude/active-ticket`
- 명령: `pnpm --filter @ai-pm/mcp-server dev` (tsc --watch, `run_in_background: true`)

### Phase 1 — 선결 스파이크 (클라이언트 지원 재확인 + 결정 고정) 【P0, §4 상세】
- 작업 단위:
  1. (이미 완료) Claude Code list_changed/ToolSearch 지원 조사 → 본 플랜 §0-2에 반영됨.
  2. 실증 확인: ai-pm `capabilities`에 `tools.listChanged: true`를 시험 추가 후 런타임 도구 추가가 Claude Code에 반영되는지 1회 검증(부정 결과 예상 — 경로 A 폐기 근거 확정).
- 파일(읽기): `packages/mcp-server/src/index.ts:70-73`
- 검증 명령: 시험 브랜치에서 `pnpm --filter @ai-pm/mcp-server build` 후 Claude Code 재연결하여 `tools/list` 변화 관찰.
- 산출물: §2 분기 결정표의 A 무효화 근거 확정. **이 Phase는 코드 변경 없이 검증만**(시험 코드는 폐기).
- 게이트: 경로 A가 (예상대로) 미작동이면 경로 C로 확정. 만약 작동하면 경로 A를 C와 병행 검토.

### Phase 2 — 빈도 계측 + 토큰 베이스라인 (F-001, F-003) 【P0】
- 작업 단위:
  1. 도구별 호출 빈도 집계 스크립트 작성. 데이터원: `get_project_activities` / 활동 로그 DB. 표본 부족 시 워크플로우 필수 경로 휴리스틱 폴백.
  2. 토큰 베이스라인 측정 스크립트: 현재 40개 도구 정의(name+description+inputSchema)의 직렬화 후 토큰 수 측정.
- 파일(신규): `packages/mcp-server/scripts/measure-tool-tokens.ts`, `packages/mcp-server/scripts/tool-frequency.ts`
- 검증 명령:
  - `pnpm --filter @ai-pm/mcp-server exec tsx scripts/measure-tool-tokens.ts` → `before` 토큰 기록
  - 측정 방법: ListTools 응답 JSON을 tokenizer(예: `@anthropic-ai/tokenizer` 또는 tiktoken cl100k 근사)로 카운트. **before/after 동일 tokenizer 필수.**
- 산출물: `docs/06-research/APS-1-14-token-baseline.md` (before 수치, 도구별 토큰 기여도 표).
- 게이트: 도구별 토큰 기여도 상위 N개 식별 → 슬림화 우선순위 확정.

### Phase 3 — 핵심 세트 확정 + 도구 통합 설계 (F-002, F-004) 【P0/P1】
- 작업 단위:
  1. 핵심 8종 화이트리스트 확정(절대 통합/제거 금지): create_task, smart_workflow, get_project_status, get_task, list_tasks, get_session_context, update_task_status, add_dependency.
  2. 저빈도 통합 그룹 설계(예시, Phase 2 데이터로 확정):
     - `project_io` ← export_project + import_project
     - `task_template_admin` ← create_task_template + list_task_templates + apply_task_template
     - `assignment_advisor` ← suggest_assignee + get_assignment_recommendations + get_workload_analysis
     - `priority_advisor` ← analyze_task_priority + get_priority_suggestions + set_priority(set는 신중)
     - `activity_query` ← get_task_activities + get_project_activities + get_task_time_summary
  3. 호환 전략(D-2): 래퍼 유지 vs deprecation. **래퍼 유지가 기본 권장**(워크플로우/hook 안전).
- 파일(설계 문서): `docs/01-plan/APS-1-14-tool-consolidation-map.md` (그룹↔원본 매핑표)
- 검증: 통합 후 도구 개수 목표(예: 40 → ~18-22) 설정.
- 게이트: 핵심 8종 시그니처 불변 + 통합 매핑이 워크플로우 규칙(`smart_workflow` 등) 미파괴 확인.

### Phase 4 — 구현: 도구 통합 + description 슬림화 (F-004, F-005, F-006) 【P1】
- 작업 단위:
  1. `index.ts` ListTools 배열을 통합 도구 정의로 재구성. action 디스패치는 `CallToolRequestSchema` 핸들러(805행)에서 분기.
  2. description/inputSchema 슬림화(핵심 8종 제외 우선).
  3. (조건부 D-3) `list_capabilities` 메타 도구 — 순절감일 때만.
  4. 호환 래퍼(D-2 선택 시): 기존 도구명 → 통합 도구로 내부 위임.
- 파일(수정): `packages/mcp-server/src/index.ts`. 통합 규모가 크면 `packages/mcp-server/src/tools/` 디렉토리로 분리 추출 권장(인라인 41976 bytes 단일 파일 부담 완화).
- 검증 명령:
  - `pnpm --filter @ai-pm/mcp-server build` (tsc)
  - `pnpm --filter @ai-pm/mcp-server lint`
- 게이트: 빌드/린트 green + 핵심 8종 호출 시그니처 회귀 0.

### Phase 5 — 검증 + 측정 + 문서 동기화 (F-007, F-003) 【P0】
- 작업 단위:
  1. 전 도구 호출 스모크 테스트(action 디스패치 전 경로 포함).
  2. create→start_work→submit_test→approve_review→done E2E.
  3. after 토큰 측정 → before/after 비교, 절감률 산출.
  4. 도구명 변경 시 워크플로우 규칙(`.claude/rules/*`)·hook(`.claude/hooks/*`)·CLAUDE.md 동기화.
- 파일: `packages/mcp-server/src/__tests__/tool-registry.smoke.test.ts`(신규), 규칙 파일 동기화.
- 검증 명령:
  - `pnpm --filter @ai-pm/mcp-server test`
  - `pnpm --filter @ai-pm/mcp-server exec tsx scripts/measure-tool-tokens.ts` → after 비교
- 게이트: 스모크/E2E green + 절감률 측정치 확보 + hook/규칙 동기화 완료.

---

## 4. 선결 스파이크 단계 (클라이언트 지원 검증) — 상세

> Phase 1의 확장. **이 플랜에서 가장 중요한 위험 차단 장치.**

| 스파이크 | 질문 | 방법 | 통과 기준 | 결과(현재) |
|----------|------|------|----------|-----------|
| SP-1 | Claude Code가 `tools/list_changed`로 런타임 도구 갱신을 반영하는가 | 문서 조사(완료) + 시험 코드로 `listChanged: true` 후 도구 동적 추가 관찰 | 도구 목록이 재연결 없이 갱신되면 PASS | **FAIL 예상**(문서상 미작동) → 경로 A 폐기 |
| SP-2 | description 슬림화/도구 통합이 실제 토큰을 줄이는가 | Phase 2 측정 하네스로 before/after | 측정상 순절감 > 0 | 미측정(Phase 2에서) |
| SP-3 | 통합 도구(action 디스패치)가 Claude Code에서 정상 호출되는가 | 통합 도구 1종 프로토타입 후 실제 호출 | 모든 action 경로 호출 성공 | 미검증(Phase 4 전 프로토타입) |

**스파이크 실패 시 대응**: SP-1 FAIL은 이미 예상(경로 C로 확정). SP-2가 순절감 ≤ 0이면 **통합 범위를 축소**하고 description 슬림화에 집중. SP-3 실패 시 해당 통합 그룹을 원복(개별 도구 유지).

---

## 5. 리스크 대응

| ID | 리스크 | 영향 | 완화책 |
|----|--------|------|--------|
| R-1 | **클라이언트가 동적 노출 미지원** → 경로 A 효과 0 | 설계 무력화 | **이미 선결 검증으로 차단**(§0-2). 경로 C 채택으로 회피. |
| R-2 | 통합으로 도구명 변경 → 워크플로우 규칙/hook 깨짐 | 워크플로우 중단 | 핵심 8종 시그니처 **불변**. 저빈도만 통합. D-2 래퍼 유지 기본. Phase 5에서 규칙/hook 동기화 강제. |
| R-3 | 지연/통합 버그로 도구 호출 실패 | 작업 불가 | **핵심 세트 항상 노출(안전망)** — F-002. 단계적 롤아웃(저빈도 5종부터). 스모크 테스트 게이트. |
| R-4 | 도구 빈도 데이터 부정확(P3 표본 부족) | 잘못된 통합 분류 | 휴리스틱 폴백(워크플로우 필수 경로 우선). 통합은 "명백 저빈도"만 보수적 적용. |
| R-5 | description 과축약으로 도구 선택 정확도↓ | 오호출 | 핵심 8종은 명확성 우선. 통합 도구는 action 설명 충실히. 회귀 스모크로 검증. |
| R-6 | (보안) action 디스패치 도구가 권한 경계 흐림 | 권한 우회 | 통합 후에도 각 action이 기존 도구와 동일 검증 경로 통과. epic_id null 가드 등 기존 hook 불변. security-reviewer 필수. |
| R-7 | 단일 파일(index.ts 42KB) 비대 | 유지보수성 | Phase 4에서 `tools/` 디렉토리 추출 권장(동작 보존 리팩터). |

---

## 6. 테스트 전략

### 6-1. 토큰 측정 방법 (before/after)
- 스크립트: `packages/mcp-server/scripts/measure-tool-tokens.ts`
- 절차: ListTools 응답(`{ tools: [...] }`)을 JSON 직렬화 → tokenizer로 카운트. **동일 tokenizer로 before/after** (cl100k 근사 또는 `@anthropic-ai/tokenizer`).
- 산출: 도구별 토큰 기여도 표 + 총합 + 절감률(%).
- 재현성: 스크립트 커밋, CI에서도 실행 가능하게.

### 6-2. 60+(실측 40) 도구 회귀 스모크
- 파일: `packages/mcp-server/src/__tests__/tool-registry.smoke.test.ts`
- 내용: ListTools가 반환하는 모든 도구명에 대해 CallTool 디스패치가 존재(미정의 도구명 0). action 디스패치 도구는 **모든 action 값**을 파라미터화 테스트.
- 명령: `pnpm --filter @ai-pm/mcp-server test`

### 6-3. 핵심 경로 E2E
- create_task → smart_workflow(start_work) → submit_test → approve_review → done 전 경로가 통합 후에도 동작.
- 핵심 8종 inputSchema 스냅샷 테스트(시그니처 불변 보장).

### 6-4. 3중 검증(아키텍처) 분류 대응
- code-reviewer(Opus) + security-reviewer(또는 codex review) + critic adversarial challenge.
- 보안 포커스: action 디스패치 권한 경계(R-6), 기존 hook(epic-id-guard 등) 미파괴, 호환 래퍼의 인증 경로.

---

## 7. Discovery 7개 카테고리 매핑

| 카테고리 | Discovery 내용 | 플랜 반영 |
|----------|---------------|----------|
| **목표(Why)** | 60+(실측 40) 풀스키마 상주 토큰 절감, before/after 측정 + 회귀 무결 | F-003 측정 하네스, F-007 회귀. §6 측정 방법. |
| **사용자(Who)** | ai-pm 호출하는 모든 Claude Code 세션 메인 오케스트레이터 | 호출자=Claude Code 전제로 §0-2 클라이언트 제약 반영(경로 A 무효화). |
| **범위(What)** | MVP=핵심 ~8종 상시+저빈도 지연. 제외=code-execution 재작성, 도구 삭제 | F-002 핵심 8종 화이트리스트. 경로 B(code execution) 후속. 통합은 삭제 아닌 병합(래퍼). |
| **제약(Constraints)** | MCP 준수, ToolSearch 충돌 금지, 시그니처 불변, TS 모노레포 | ToolSearch=클라 자동 기능(§0-2)이라 충돌 없음. 핵심 8종 시그니처 불변(R-2). |
| **우선순위(Priority)** | P3. 핵심 세트 항상 노출(안전망) | F-002 안전망. 경로 B는 P3 ROI 미달로 후순위(§2). |
| **리스크(Risk)** | (a)클라 미지원→효과 0, (b)지연 버그→호출 실패, (c)빈도 부정확 | R-1(선검증 차단), R-3(안전망), R-4(휴리스틱 폴백). |
| **검증(Verify)** | 토큰 측정, 전수 스모크, create→done E2E | §6 전체. Phase 2(before)·Phase 5(after+E2E). |

**미해결 이슈(Discovery §미해결) 처리**: "Claude Code 동적 도구 노출 지원 여부" → **선결 조사로 해소**(미지원 확정, §0-2). open-questions에 잔여 항목 기록.

---

## 8. DoD (Definition of Done)

- [ ] 선결 스파이크(SP-1~3) 결과 문서화, 경로 결정 확정(§2 D-1~3 사용자 승인)
- [ ] 토큰 before 베이스라인 측정(`docs/06-research/APS-1-14-token-baseline.md`)
- [ ] 핵심 8종 시그니처 불변(스냅샷 테스트 통과)
- [ ] 저빈도 도구 통합 구현(도구 개수 목표 달성, 예: 40→~18-22)
- [ ] description 슬림화 적용
- [ ] 토큰 after 측정 + 절감률 산출(순절감 > 0)
- [ ] 40개 도구 전수 스모크 테스트 green
- [ ] create→done E2E green
- [ ] `pnpm --filter @ai-pm/mcp-server build / lint / test` 전부 green (Iron Law: 실제 실행 증거)
- [ ] 도구명 변경 시 `.claude/rules/*`·hook·CLAUDE.md 동기화 완료
- [ ] 3중 검증(code-reviewer + security-reviewer/codex + critic challenge) 통과
- [ ] 보안: action 디스패치 권한 경계·기존 hook 미파괴 확인

---

## 부록: 신참 엔지니어용 핵심 명령 요약

```bash
# watch 빌드 (백그라운드)
pnpm --filter @ai-pm/mcp-server dev

# 빌드 / 린트 / 테스트
pnpm --filter @ai-pm/mcp-server build
pnpm --filter @ai-pm/mcp-server lint
pnpm --filter @ai-pm/mcp-server test

# 토큰 측정 (신규 스크립트)
pnpm --filter @ai-pm/mcp-server exec tsx scripts/measure-tool-tokens.ts
```

**핵심 파일 위치**:
- 도구 등록: `packages/mcp-server/src/index.ts:106-802` (ListTools), `:805` (CallTool 디스패치)
- capabilities: `packages/mcp-server/src/index.ts:70-73`
- 통합 추출 권장 위치: `packages/mcp-server/src/tools/` (신규)
- 측정 스크립트: `packages/mcp-server/scripts/measure-tool-tokens.ts` (신규)
