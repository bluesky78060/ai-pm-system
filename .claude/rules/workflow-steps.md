---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
---

# 워크플로우 상세 단계

## 빌드/테스트 → 리뷰 → 완료

1. `smart_workflow(task_id, 'start_work')` → in_progress (배분과 동시에 실행)

2. 빌드/테스트 실행 후 `smart_workflow(task_id, 'submit_test', test_results=[...])` (build 필수, output 10자+)
   - **STRICT 모드 (APS-1-9)**: 환경변수 `STRICT_SUBMIT_TEST_PROJECTS`에 프로젝트 코드(예: `APS`)가 포함되면 `build`+`lint`+`unit` 3종을 모두 제출하고 전 항목 `status: 'pass'`여야 통과. 누락/fail/skip 시 거부됨. 미설정 프로젝트는 기존 동작(build만 필수). 테스트는 `test_type: 'unit'`으로 라벨링.

3. **code-reviewer 에이전트** (`/code-review` 스킬)로 리뷰 후 `smart_workflow(task_id, 'approve_review', notes='...')` (20자+)
   - **리뷰 notes 필수 형식**:
     ```
     🔴 CRITICAL: N건 - [내용]
     🟠 MAJOR: N건 - [내용]
     🟡 MINOR: N건 - [내용]
     🔵 SUGGESTION: N건 - [내용]
     → 판정: APPROVED / CHANGES_REQUESTED
     ```
   - CRITICAL/MAJOR 0건 → `approve_review` 진행
   - CRITICAL/MAJOR 1건 이상 → `request_changes` (issues 필드에 수정 요청 내용 작성)
   - **최대 반복 3회**: `request_changes` → 수정 → 리뷰 사이클은 최대 3회까지. 초과 시 사용자에게 보고

4. 자동으로 done 전환

**상세 에이전트/스킬 가이드**: `docs/workflow-guide.md` 참조
