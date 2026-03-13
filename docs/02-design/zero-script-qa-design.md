# Zero Script QA 설계

> **PDCA Phase**: Design
> **작성일**: 2026-03-12
> **티켓**: APS-5-6

---

## Zero Script QA란?

테스트 스크립트를 별도로 작성하지 않고, **구조화된 빌드 로그와 런타임 로그 모니터링**으로 QA를 수행하는 방법론입니다.

AI PM System에서는:
- `pnpm -r build` 출력 → `test_results` 배열로 변환
- `smart_workflow submit_test` 표준 형식으로 전달
- 실패 시 `build-fixer` 에이전트로 자동 수정

---

## AI PM System 적용 방법

### Step 1: 빌드 실행

```bash
cd /Users/leechanhee/ai-pm-system
pnpm -r build 2>&1
```

**실제 출력 예시:**
```
Scope: 2 of 3 workspace projects
packages/mcp-server build$ tsc
packages/web-ui build$ tsc -b && vite build
packages/mcp-server build: Done
packages/web-ui build: ✓ built in 1.06s
packages/web-ui build: dist/assets/index-DEQ5HR2w.css   42.11 kB │ gzip:   8.12 kB
packages/web-ui build: dist/assets/index-FJqIcPPO.js   742.11 kB │ gzip: 222.06 kB
packages/web-ui build: Done
```

### Step 2: test_results 변환

빌드 성공 시:
```json
[
  {
    "test_type": "build",
    "status": "pass",
    "output": "packages/mcp-server build: Done\npackages/web-ui build: ✓ built in 1.06s\ndist/assets/index.js 742.11 kB",
    "duration_ms": 5000
  }
]
```

빌드 실패 시:
```json
[
  {
    "test_type": "build",
    "status": "fail",
    "output": "packages/mcp-server build: error TS2345: Argument of type...",
    "failures": "TypeScript 타입 오류 - packages/mcp-server/src/tools/task.ts:123"
  }
]
```

### Step 3: smart_workflow submit_test 호출

```
smart_workflow(
  task_id="APS-X-Y",
  action="submit_test",
  test_results=[
    {
      "test_type": "build",
      "status": "pass",
      "output": "..실제 빌드 출력..",
      "duration_ms": 5000
    }
  ]
)
```

---

## 모니터링 포인트

| 단계 | 확인 항목 | 성공 기준 |
|------|-----------|-----------|
| TypeScript 컴파일 | tsc 에러 없음 | `Done` 출력 |
| Vite 빌드 | 번들 생성 | `✓ built in Xs` |
| 번들 크기 | 경고 확인 | JS < 1MB 권장 |
| MCP 서버 테스트 | `pnpm --filter @ai-pm/mcp-server test` | 모든 테스트 통과 |

---

## 빌드 실패 대응

```
빌드 실패
    ↓
build-fixer(sonnet) 에이전트 투입
    /oh-my-claudecode:build-fix
    ↓
수정 완료 후 pnpm -r build 재실행
    ↓
smart_workflow submit_test (pass)
```
