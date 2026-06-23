# AI PM System - Project Rules

## Ticket-First Development (필수)

모든 작업은 **AI PM System MCP**를 통해 티켓 발행 후 진행. 새 프로젝트 생성 금지.

- **프로젝트 코드**: `APS` / **ID**: `3bc28444-2e96-4587-be23-4c48e220aa66`

## 워크플로우 10단계 요약

1. **epic_id 확인** — `get_project_status`로 에픽 조회 (null 절대 금지)
2. **티켓 발행** — `create_task(epic_id="...", title="...", ...)`
3. **Discovery Q&A** — 사용자 7개 카테고리 문답 → `docs/00-discovery/` (상세: `.claude/rules/discovery-and-plan.md`)
   - **선택적 리서치** (3→4 사이): `mcp__ai-pm__research_with_gemini` 호출 → `docs/06-research/` (필요 시)
4. **플랜 작성** — `docs/01-plan/` (상세: `.claude/rules/discovery-and-plan.md`)
5. **플랜 리뷰** — critic 독립 리뷰 + 메인 오케스트레이터 자체 검토 후 **즉시 다음 단계 진행** → `docs/02-review/` (사용자 승인 대기 단계 아님. 상세: `.claude/rules/discovery-and-plan.md`)
   - **Fast-track**: 1중 분류 단순 변경은 3~5단계 생략 가능 (`.claude/rules/fast-track.md`)
6. **팀 에이전트 병렬 위임** — 파일 소유권 파티셔닝 (에이전트 매핑: `.claude/rules/agent-mapping.md`)
7. **빌드/테스트 → smart_workflow** — Iron Law 적용 (상세: `.claude/rules/workflow-steps.md`)
8. **PR 생성** — `/ship` (상세: `.claude/rules/deploy-automation.md`)
9. **머지/배포** — `/land-and-deploy`
10. **배포 후 모니터링** — `/canary`

## 정책 및 통합 (상세 규칙)

> **컨텍스트 JIT 로딩 (APS-2-8)**: 상세 규칙은 `paths:` frontmatter로 **해당 작업 맥락에서만 자동 로딩**된다(선적재 토큰 절감). 안전 핵심 3종(`prohibitions`·`continuous-execution`·`fast-track`)은 항상 로딩. **JIT 규칙의 도메인을 다루는데 해당 파일이 자동 로딩되지 않았다면, 결정 전에 그 파일을 직접 `Read`할 것.** PreToolUse 하드게이트(아래 §Hook)는 로딩 여부와 무관하게 항상 강제된다.
>
> `paths:`는 Claude Code 네이티브 `.claude/rules/` 로딩 메커니즘으로, 매칭 경로를 touch하는 세션에서 해당 규칙이 주입된다(검증: paths 없는 규칙은 세션 시작 시 항상 주입, paths 있는 규칙은 경로 진입 전까지 미주입). 네이티브 동작에 의존하되, 위의 on-demand `Read` 지시를 1차 안전장치로 둔다.

| 영역 | 파일 | 로딩 |
|------|------|------|
| 금지 사항 (전체) | `.claude/rules/prohibitions.md` | 항상 |
| 연속 실행 원칙 (silent-stop 금지, 중단 시 보고 의무) | `.claude/rules/continuous-execution.md` | 항상 |
| Fast-track 정책 (1중 분류 단순 변경) | `.claude/rules/fast-track.md` | 항상 |
| Discovery / Plan / Review (3~5단계) | `.claude/rules/discovery-and-plan.md` | JIT: `docs/00·01·02·06-*` |
| 코드 리뷰 (Codex 옵션 B - 3중 검증) | `.claude/rules/code-review.md` | JIT: `packages/**`·`docs/03-code-review/**` |
| Superpowers 통합 (옵션 1) | `.claude/rules/superpowers-integration.md` | JIT: `packages/**`·`docs/01-plan/**` |
| gstack 배포 자동화 (옵션 2) | `.claude/rules/deploy-automation.md` | JIT: `docs/05-deploy/**` |
| 에이전트 매핑 | `.claude/rules/agent-mapping.md` | JIT: `packages/**` |
| smart_workflow 단계 | `.claude/rules/workflow-steps.md` | JIT: `packages/**` |
| 개발 단축 팁 (watch/병렬/self-healing) | `.claude/rules/dev-tips.md` | JIT: `packages/**` |
| OMC 신규 스킬 통합 (wiki/ultragoal/autoresearch · 중복 회피) | `.claude/rules/omc-skills-integration.md` | JIT: `.omc/**` |
| 표준 템플릿 (MCP 도구·외부 API·서비스) | `.claude/templates/` | on-demand |

## 핵심 강제 규칙 (요약)

- **티켓 없이 코드 변경 금지** / **epic_id null 금지**
- **Discovery 산출물 없이 플랜 작성 금지** / **플랜 리뷰 없이 구현 금지**
- **self-approval 금지** (플랜 작성자·코드 작성자 본인이 승인 호출 금지)
- **중요 변경(P0/보안/아키텍처/DB/외부 통합)** → Codex 리뷰 + Challenge 3중 검증 필수
- **Iron Law**: 검증 명령 실제 실행 증거 없이 완료 주장 금지
- **smart_workflow done 이전 PR 생성/push 금지**
- **연속 실행**: 티켓 발행 후 done 전환까지 단계별 사용자 확인 금지, 암묵적 정지 금지, 중단 시 이슈 전체·결정 사항 보고 의무 (`.claude/rules/continuous-execution.md`)

전체 금지 사항: `.claude/rules/prohibitions.md`

## Hook 강제 차단 (PreToolUse)

| Hook | 매처 | 차단 대상 |
|------|------|-----------|
| `epic-id-guard.sh` | create_task | epic_id null/empty |
| `discovery-guard.sh` | Edit/Write (`docs/01-plan/`) | Discovery 산출물 누락 |
| `plan-review-guard.sh` | smart_workflow start_work | Discovery/Plan/Review 산출물 누락 |
| `codex-review-guard.sh` | smart_workflow approve_review | 리뷰 산출물 누락 / 중요 변경 codex 미수행 |

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, PostgreSQL
- **Frontend**: React 19, Vite 6, Tailwind CSS v4
- **Monorepo**: pnpm workspaces (`@ai-pm/mcp-server`, `@ai-pm/web-ui`)
- **Build**: `pnpm -r build` / **Test**: `pnpm --filter @ai-pm/mcp-server test`
- **Deploy**: Render → `https://ai-pm-system.onrender.com`
- **Env vars**: `DATABASE_URL` (필수, Postgres 연결), `GEMINI_API_KEY` (선택, `research_with_gemini` 도구 사용 시 필수)
