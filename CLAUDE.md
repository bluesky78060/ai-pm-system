# AI PM System - Project Rules

## Ticket-First Development (필수)

모든 작업은 **AI PM System MCP**를 통해 티켓 발행 후 진행. 새 프로젝트 생성 금지.

- **프로젝트 코드**: `APS` / **ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

## 워크플로우 (필수)

1. **CRITICAL: epic_id 필수 확인**
   - `get_project_status`로 프로젝트의 에픽 목록 조회
   - 적절한 에픽 선택 (없으면 "General" 에픽 사용)
   - **절대로 epic_id: null 금지** - 대시보드에 표시되지 않음

2. `create_task`로 티켓 발행
   - **epic_id 필수 파라미터** - 반드시 지정
   - project_id만으로는 불충분 - epic_id 명시 필요
   - 예: `create_task(epic_id="...", title="...", ...)`

3. **Discovery Q&A → 프로젝트 방향 확정 (CRITICAL - 플랜 작성 전 필수)**
   - **목적**: 플랜 작성 전 사용자와 자세한 문답으로 프로젝트 방향을 확정
   - **수행 주체**: `analyst` 에이전트 (Opus, READ-ONLY) 또는 메인 오케스트레이터 직접 진행
   - **필수 질문 카테고리** (모두 답변 확보 전 플랜 작성 금지):
     1. **목표(Why)**: 해결하려는 문제, 성공 기준, 측정 지표
     2. **사용자(Who)**: 주 사용자, 사용 시나리오, 페인 포인트
     3. **범위(What)**: 포함/제외 기능, MVP 경계, 향후 확장 여부
     4. **제약(Constraints)**: 기술 스택 고정 여부, 기한, 리소스, 호환성 요구사항
     5. **우선순위(Priority)**: P0/P1/P2 기준, 트레이드오프 시 우선 가치
     6. **리스크(Risk)**: 알려진 위험, 의존 외부 시스템, 실패 시 영향도
     7. **검증(Verify)**: 완료 정의(DoD), 테스트 방식, 배포 전 체크리스트
   - **산출물**: `docs/00-discovery/{ticket-id}-direction.md`
     - 질문/답변 기록, 확정된 방향성, 미해결 이슈 명시
   - **종료 조건**: 사용자가 "방향 확정" 명시적으로 승인
   - **승인 없이 플랜 작성 단계로 진행 금지**

4. **플랜 작성 (CRITICAL - 구현 전 필수)**
   - **선결 조건**: 3단계 Discovery 산출물(`docs/00-discovery/`) 존재 필수
   - planner/executor 에이전트로 플랜 작성 (`docs/01-plan/` 저장)
   - **플랜 문서 필수 포함 항목** (agent-team Planner Agent 기준):
     - 기능 명세: `F-001`, 우선순위 `P0(필수)/P1(중요)/P2(선택)`, 엣지케이스
     - 기술 스택, 구현 로드맵 (Phase 1~N), 예외 처리 계획
     - **Discovery 결과 반영 섹션**: 3단계에서 확정된 방향성을 어떻게 충족하는지 매핑

5. **플랜 리뷰 → 메인 오케스트레이터 승인 (CRITICAL - 구현 전 필수)**
   - **목적**: 작성된 플랜의 품질·실현가능성·방향성 일치도를 다각도로 검증
   - **수행 주체** (작성자와 분리된 별도 패스로 진행, self-approval 금지):
     - 1차: `critic` 에이전트(Opus) 또는 `/oh-my-claudecode:review` 스킬로 독립 리뷰
     - 2차: 메인 오케스트레이터(Claude) 직접 검토 및 최종 승인
     - 선택: `plan-eng-review`(아키텍처) / `plan-design-review`(UI) / `plan-ceo-review`(스코프) / `plan-devex-review`(DX) 추가 적용
   - **리뷰 체크리스트** (모든 항목 통과 시에만 승인):
     1. **목표 명확성**: Discovery 7개 카테고리 답변이 플랜에 모두 반영되었는가
     2. **구현 범위 적절성**: MVP 경계가 명확하고 P0/P1/P2 우선순위가 합리적인가
     3. **리스크 식별**: Discovery에서 도출된 리스크에 대한 대응 방안이 있는가
     4. **예상 산출물**: 각 Phase별 결과물·검증 방법·DoD가 구체적인가
     5. **Discovery 방향성 일치도**: 사용자가 확정한 방향과 어긋남이 없는가
     6. **기술 검증**: 선택한 스택·아키텍처가 제약 조건과 호환되는가
     7. **테스트 전략**: 검증 가능한 테스트 계획이 포함되었는가
   - **산출물**: `docs/02-review/{ticket-id}-plan-review.md`
     - 리뷰어별 코멘트, 체크리스트 통과 여부, 수정 요구사항, 최종 판정(승인/반려)
   - **결과 처리**:
     - 승인 시 → 다음 단계 진행
     - 반려 시 → 플랜 수정 후 재리뷰 (구현 절대 불가), **최대 3회**
     - 3회 반려 시 → Discovery 단계로 회귀하여 방향 재확인
   - **승인 없이 start_work 및 코드 작성 시작 금지**

6. 플랜을 기능 단위로 분해 → 팀 에이전트에 병렬 위임 (에이전트 매핑: `.claude/rules/agent-mapping.md`)

7. `smart_workflow` 워크플로우 단계 실행 (상세: `.claude/rules/workflow-steps.md`)

## 코드 리뷰 정책 (Codex MCP 통합 - 옵션 B: 선택 강화)

`smart_workflow(task_id, 'approve_review', ...)` 호출 전 다음 정책에 따라 리뷰 수행.

### 리뷰 강도 분류 기준

**일반 변경** (단일 리뷰):
- UI 스타일·문구 수정, 단순 버그 수정, 리팩터링(동작 동일)
- 테스트 코드만 변경, 문서/주석 변경

**중요 변경** (다중 모델 교차 검증 필수):
- **P0 우선순위 태스크** (Discovery에서 P0로 분류된 기능)
- **보안 관련**: 인증·인가·세션·암호화·SQL 구성·외부 입력 처리
- **아키텍처 변경**: 모듈 구조, 의존성, 인터페이스 계약 변경
- **DB 마이그레이션**: 스키마 변경, 데이터 백필, 인덱스 변경
- **외부 통합**: MCP 서버 추가/변경, 외부 API 연동, 인프라 설정

### 리뷰 실행 절차

**일반 변경**:
1. `code-reviewer` 에이전트(Opus) 또는 `/code-review` 스킬로 독립 리뷰
2. 통과 시 → `smart_workflow(approve_review, notes='...')`

**중요 변경 (3중 검증)**:
1. **1차 — Claude 리뷰**: `code-reviewer` 에이전트(Opus)로 품질·가독성·패턴 검토
2. **2차 — Codex 리뷰**: `codex:rescue` 스킬 또는 `/codex review`로 독립 diff 리뷰 (pass/fail 게이트)
   - 모델 다양성 확보 (GPT 계열로 편향 보정)
3. **3차 — Codex Challenge**: `/codex` skill의 challenge 모드로 적대적 검증
   - "이 코드를 어떻게 깨뜨릴 수 있나" 관점의 공격 시나리오 도출
   - 엣지케이스·경합 조건·보안 취약점 노출
4. **종합 판단**: 메인 오케스트레이터가 3개 리뷰 결과 교차 검증
   - 1·2차 모두 pass + 3차 challenge 대응 완료 시에만 승인
   - 어느 하나라도 fail/critical 발견 시 → 수정 후 재리뷰

### 산출물

- `docs/03-code-review/{task-id}-review.md`
  - Claude 리뷰 결과, Codex 리뷰 pass/fail, Challenge 발견 항목 및 대응
  - 최종 판정 및 `approve_review` notes 원문 (20자 이상)

### approve_review 호출 규칙

- 일반 변경: notes에 `code-reviewer 통과: <요약>` 명시
- 중요 변경: notes에 `code-reviewer + codex review + challenge 3중 통과: <요약>` 명시
- self-approval 금지 (코드 작성자 본인이 리뷰 결과 작성 금지)

## 금지 사항

- **epic_id: null로 티켓 발행 절대 금지** - 대시보드에 표시되지 않음
- 티켓 없이 코드 변경 금지
- `update_task_status`로 testing→review, review→done 직접 전환 금지 (서버 차단됨)
- 빌드 미실행 submit_test / 리뷰 미수행 approve_review 금지
- project_id만 지정하고 epic_id 누락 금지
- **Discovery Q&A 산출물(`docs/00-discovery/`) 없이 플랜 작성 시작 금지**
- **사용자의 "방향 확정" 승인 없이 플랜 작성 단계 진행 금지**
- **플랜 리뷰(`docs/02-review/`) 산출물 없이 구현 시작 금지**
- **플랜 작성자 본인이 플랜을 자체 승인(self-approval) 금지** - 반드시 별도 리뷰어(critic/오케스트레이터) 통과
- **메인 오케스트레이터 플랜 승인 없이 구현(start_work) 시작 금지**
- **중요 변경(P0/보안/아키텍처/DB 마이그레이션/외부 통합)에서 Codex 리뷰 + Challenge 생략 금지**
- **코드 작성자 본인의 리뷰 결과로 `approve_review` 호출 금지**

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **Build**: `pnpm -r build` / **Test**: `pnpm --filter @ai-pm/mcp-server test`
