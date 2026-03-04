#!/bin/bash
# session-start.sh — SessionStart hook for AI PM System context restoration
# 세션 시작 시 PM 시스템 규칙을 자동으로 리마인드하여 컴팩션 후에도 워크플로우 유지

cat <<'EOF'
{
  "additionalContext": "## 🎯 AI PM System 활성화\n\n**프로젝트**: AI PM System (APS)\n- **ID**: `9fe805f8-15d6-4d67-804f-b14f57e13616`\n- **코드**: `APS`\n\n### 필수 워크플로우 (Ticket-First Development)\n\n모든 작업은 티켓 발행 후 진행:\n\n1. **티켓 생성**: `get_project_status` → epic 확인 → `create_task` (epic_id 필수)\n2. **작업 시작**: `smart_workflow(task_id, 'start_work')` → in_progress\n3. **코드 작성**: executor/designer 에이전트에 위임\n   - 단순: `executor-low` (haiku)\n   - 표준: `executor` (sonnet) \n   - 복잡: `executor-high` (opus)\n4. **테스트**: `pnpm -r build` 실행 → `smart_workflow(task_id, 'submit_test', test_results=[...])`\n   - build 타입 필수, output 10자 이상\n5. **리뷰**: `code-reviewer` 에이전트 → `smart_workflow(task_id, 'approve_review', notes='...')`\n   - notes 20자 이상 리뷰 결과\n6. **완료**: 자동으로 done 전환\n\n### 금지 사항\n\n- ❌ 티켓 없이 코드 변경\n- ❌ `update_task_status`로 testing→review, review→done 직접 전환 (서버 차단)\n- ❌ 빌드 미실행 submit_test\n- ❌ 리뷰 미수행 approve_review\n\n### 상세 가이드\n\n- 프로젝트 규칙: `CLAUDE.md`\n- 워크플로우 가이드: `docs/workflow-guide.md`\n- AI 문서: `AGENTS.md`\n\n### Tech Stack\n\n- Backend: Node.js, TypeScript, Express, PostgreSQL\n- Frontend: React 19, Vite 6, Tailwind CSS v4\n- Monorepo: pnpm workspaces\n- Build: `pnpm -r build` / Test: `pnpm --filter @ai-pm/mcp-server test`"
}
EOF
