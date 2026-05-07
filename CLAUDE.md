# AI PM System - Project Rules

## Ticket-First Development (필수)

모든 작업은 **AI PM System MCP**를 통해 티켓 발행 후 진행. 새 프로젝트 생성 금지.

- **프로젝트 코드**: `APS` / **ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`

## 워크플로우 10단계 요약

1. **epic_id 확인** — `get_project_status`로 에픽 조회 (null 절대 금지)
2. **티켓 발행** — `create_task(epic_id="...", title="...", ...)`
3. **Discovery Q&A** — 사용자 7개 카테고리 문답 → `docs/00-discovery/` (상세: `.claude/rules/discovery-and-plan.md`)
   - **선택적 리서치** (3→4 사이): `mcp__ai-pm__research_with_gemini` 호출 → `docs/06-research/` (필요 시)
4. **플랜 작성** — `docs/01-plan/` (상세: `.claude/rules/discovery-and-plan.md`)
5. **플랜 리뷰** — critic + 오케스트레이터 2단 검증 → `docs/02-review/` (상세: `.claude/rules/discovery-and-plan.md`)
6. **팀 에이전트 병렬 위임** — 파일 소유권 파티셔닝 (에이전트 매핑: `.claude/rules/agent-mapping.md`)
7. **빌드/테스트 → smart_workflow** — Iron Law 적용 (상세: `.claude/rules/workflow-steps.md`)
8. **PR 생성** — `/ship` (상세: `.claude/rules/deploy-automation.md`)
9. **머지/배포** — `/land-and-deploy`
10. **배포 후 모니터링** — `/canary`

## 정책 및 통합 (상세 규칙)

| 영역 | 파일 |
|------|------|
| Discovery / Plan / Review (3~5단계) | `.claude/rules/discovery-and-plan.md` |
| 코드 리뷰 (Codex 옵션 B - 3중 검증) | `.claude/rules/code-review.md` |
| Superpowers 통합 (옵션 1) | `.claude/rules/superpowers-integration.md` |
| gstack 배포 자동화 (옵션 2) | `.claude/rules/deploy-automation.md` |
| 에이전트 매핑 | `.claude/rules/agent-mapping.md` |
| smart_workflow 단계 | `.claude/rules/workflow-steps.md` |
| 금지 사항 (전체) | `.claude/rules/prohibitions.md` |

## 핵심 강제 규칙 (요약)

- **티켓 없이 코드 변경 금지** / **epic_id null 금지**
- **Discovery 산출물 없이 플랜 작성 금지** / **플랜 리뷰 없이 구현 금지**
- **self-approval 금지** (플랜 작성자·코드 작성자 본인이 승인 호출 금지)
- **중요 변경(P0/보안/아키텍처/DB/외부 통합)** → Codex 리뷰 + Challenge 3중 검증 필수
- **Iron Law**: 검증 명령 실제 실행 증거 없이 완료 주장 금지
- **smart_workflow done 이전 PR 생성/push 금지**

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
