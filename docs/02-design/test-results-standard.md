# test_results 표준 형식

> **작성일**: 2026-03-12
> **티켓**: APS-5-6

---

## 형식 명세

```typescript
interface TestResult {
  test_type: "build" | "unit" | "type" | "lint" | "integration";
  status: "pass" | "fail" | "skip";
  output: string;        // 실제 명령 출력 (10자 이상 필수)
  duration_ms?: number;  // 선택
  failures?: string;     // 실패 시 원인 요약
}
```

**규칙:**
- `build` 타입은 항상 필수
- `output`은 실제 명령 출력을 그대로 붙여넣기 (요약 금지)
- `output`은 최소 10자 이상

---

## 타입별 예시

### build (필수)

```json
{
  "test_type": "build",
  "status": "pass",
  "output": "packages/mcp-server build: Done\npackages/web-ui build: ✓ built in 1.06s\ndist/assets/index-FJqIcPPO.js 742.11 kB",
  "duration_ms": 5200
}
```

### unit (MCP 서버 테스트)

```bash
pnpm --filter @ai-pm/mcp-server test 2>&1
```

```json
{
  "test_type": "unit",
  "status": "pass",
  "output": "Test Suites: 3 passed, 3 total\nTests: 24 passed, 24 total\nTime: 2.341s",
  "duration_ms": 2341
}
```

### type (TypeScript 타입 체크)

```bash
cd packages/mcp-server && npx tsc --noEmit 2>&1
```

```json
{
  "test_type": "type",
  "status": "pass",
  "output": "npx tsc --noEmit: 0 errors found",
  "duration_ms": 3000
}
```

### lint

```bash
pnpm biome check packages/ 2>&1 | tail -5
```

```json
{
  "test_type": "lint",
  "status": "pass",
  "output": "Checked 45 files. No diagnostic found.",
  "duration_ms": 800
}
```

### integration

```json
{
  "test_type": "integration",
  "status": "pass",
  "output": "MCP 서버 연결 테스트 성공\ncreate_task: OK\nsmart_workflow: OK\nget_project_status: OK",
  "duration_ms": 1500
}
```

---

## 실패 예시

```json
[
  {
    "test_type": "build",
    "status": "fail",
    "output": "packages/mcp-server build: error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.\n  src/tools/task.ts:123:5",
    "failures": "TypeScript 타입 오류 - task.ts:123, epic_id undefined 처리 필요"
  }
]
```

**실패 시 대응:** `build-fixer(sonnet)` 투입 또는 `/oh-my-claudecode:build-fix` 스킬 사용
