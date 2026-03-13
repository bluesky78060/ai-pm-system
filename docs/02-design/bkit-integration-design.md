# AI PM System × bkit 통합 설계

> **PDCA Phase**: Design
> **작성일**: 2026-03-12
> **티켓**: APS-5-4

---

## bkit 스킬별 적용 방법

### 1. `/pdca` - PDCA 문서 관리

**적용 방법:**
```
/pdca plan <기능명>    → docs/01-plan/features/<기능명>.plan.md 자동 생성
/pdca design <기능명>  → docs/02-design/features/<기능명>.design.md 생성
/pdca analyze <기능명> → 설계 vs 구현 갭 분석
/pdca report <기능명>  → docs/04-report/ 완료 보고서
```

**AI PM System 연동:**
1. 새 기능 개발 시 → `/pdca plan <기능명>` 먼저 실행
2. `create_task` 호출 시 plan 문서 경로를 description에 포함
3. 구현 완료 후 → `/pdca analyze <기능명>` 실행하여 갭 확인

---

### 2. `/code-review` - 코드 품질 관리

**적용 방법:**
```bash
# 특정 패키지 리뷰
/code-review packages/mcp-server/src
/code-review packages/web-ui/src

# 전체 리뷰
/code-review packages/
```

**워크플로우 연동:**
- `approve_review` 전에 `/code-review` 실행 필수
- 리뷰 결과를 `approve_review notes`에 요약하여 전달
- critical/high 이슈 발견 시 → `request_changes` 처리

---

### 3. `/zero-script-qa` - QA 자동화

**적용 방법:**
- `pnpm -r build` 실행 후 출력을 `test_results` 형식으로 변환
- `smart_workflow submit_test` 호출 시 표준 형식 사용

**표준 `test_results` 형식:**
```json
[
  {
    "test_type": "build",
    "status": "pass",
    "output": "packages/mcp-server build: Done\npackages/web-ui build: ✓ built in 1.06s",
    "duration_ms": 5000
  }
]
```

자세한 내용: `docs/02-design/zero-script-qa-design.md`

---

### 4. `/phase-5-design-system` - 웹 UI 일관성

**적용 방법:**
- 새 컴포넌트 개발 전 → `docs/02-design/web-ui-design-system.md` 참조
- 색상/타이포그래피는 정의된 Tailwind 클래스만 사용
- 컴포넌트 추가 시 카탈로그 업데이트

자세한 내용: `docs/02-design/web-ui-design-system.md`

---

### 5. `/phase-4-api` - MCP API 표준화

**적용 방법:**
- 새 MCP 도구 추가 시 → `docs/02-design/mcp-api-design.md`에 먼저 설계
- 입력 파라미터, 출력 형식, 에러 처리 명세 작성 후 구현

자세한 내용: `docs/02-design/mcp-api-design.md`

---

## 전체 워크플로우 연동도

```
새 기능 요청
    ↓
create_task (epic_id 필수)              ← AI PM System
    ↓
/pdca plan <기능명>                     ← bkit PDCA (planner 에이전트)
    ↓
┌───────────────────────────────────────┐
│  메인 오케스트레이터 플랜 검토 (필수)  │
│  ① 목표 명확성                        │
│  ② 구현 범위 적절성                   │
│  ③ 리스크 식별 여부                   │
│  ④ 예상 산출물 명확성                 │
│  승인 ✓ → 다음 단계                   │
│  반려 ✗ → 플랜 재작성 후 재검토        │
└───────────────────────────────────────┘
    ↓ (승인 후에만)
smart_workflow start_work               ← AI PM System
    ↓
┌─────────────────────────────────────────────────────┐
│  팀 에이전트 병렬 배분 (메인 오케스트레이터 지휘)    │
│                                                      │
│  백엔드 작업          UI/프론트 작업                 │
│  executor(sonnet)  ║  designer(sonnet)               │
│  /phase-4-api      ║  /phase-5-design-system         │
│  mcp-server/ 담당  ║  web-ui/ 담당                   │
│                                                      │
│  [의존성 있는 작업은 순차 실행]                       │
│  [독립 파일은 동시 실행]                             │
│  [동일 파일 동시 수정 금지]                          │
└─────────────────────────────────────────────────────┘
    ↓ (모든 에이전트 완료 후)
pnpm -r build → test_results            ← bkit Zero Script QA
    ↓
smart_workflow submit_test              ← AI PM System
    ↓
code-reviewer(opus) / /code-review     ← bkit Code Review
    ↓
smart_workflow approve_review           ← AI PM System
    ↓
/pdca analyze → 갭 확인                ← bkit PDCA
    ↓
done
```
