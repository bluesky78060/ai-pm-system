# 표준 템플릿: 새 MCP 도구 추가

ai-pm MCP 서버에 새 도구를 추가할 때 따르는 표준 패턴. APS-1-1(`research_with_gemini`) 사례를 기반으로 작성.

## 사전 체크리스트

- [ ] 티켓 발행 (`epic_id` 필수)
- [ ] Discovery Q&A 7개 카테고리 (단순 도구는 메인이 직접 작성 가능)
- [ ] 외부 통합인 경우 → `external-api-integration.md` 함께 적용
- [ ] 분류 결정 (1중 / 2중 / 3중) — `.claude/rules/code-review.md` 참조

## Phase 1: 의존성 추가

```bash
# 외부 SDK가 필요한 경우
pnpm --filter @ai-pm/mcp-server add <package-name>

# 테스트 커버리지 도구 (이미 설치됨)
# @vitest/coverage-v8 (vitest 호환 버전)
```

## Phase 2: 서비스 클래스 (T5 GREEN)

**위치**: `packages/mcp-server/src/services/{your-service}.ts`

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
// 외부 API 통합 시 — _security-base 활용 (필수)
import {
  maskApiKey,
  sanitizeErrorMessage,
  buildPromptInjectionMarkers,
  sanitizeUserInput,
  atomicWrite,
  validateTaskId,
  filterSafeUrls,
  TASK_ID_MAX_LEN_DEFAULT,
} from './_security-base.js';

export interface YourInput {
  task_id: string;
  // 외부 API 호출이 비용 발생 시 confirmed 필수
  confirmed: boolean;
  // ... 도메인별 필드
}

export type YourErrorCode =
  | 'NOT_CONFIRMED'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export interface YourResultSuccess { success: true; /* ... */ }
export interface YourResultFailure {
  success: false;
  error_code: YourErrorCode;
  message: string;
}
export type YourResult = YourResultSuccess | YourResultFailure;

export class YourService {
  constructor(opts?: { /* DI 옵션 */ }) { /* ... */ }

  async executeYourAction(input: YourInput): Promise<YourResult> {
    // 1. 승인 검증 (가장 우선 — API 키 누락보다 먼저)
    if (input.confirmed !== true) {
      return { success: false, error_code: 'NOT_CONFIRMED', message: '...' };
    }

    // 2. 입력 검증 (validateTaskId 등)
    const taskCheck = validateTaskId(input.task_id);
    if (!taskCheck.valid) {
      return { success: false, error_code: 'VALIDATION_ERROR', message: taskCheck.error! };
    }

    // 3. API 호출 + 에러 분류
    try {
      // ... API 호출
    } catch (err) {
      // sanitizeErrorMessage / classifyError로 변환
    }

    // 4. 결과 파일 저장 (atomicWrite)
    await atomicWrite(filePath, content);

    return { success: true /* ... */ };
  }
}
```

## Phase 3: 도구 등록 (T6)

**위치**: `packages/mcp-server/src/index.ts`

### 3-1. import + 인스턴스
```typescript
import { YourService, type YourInput } from './services/your-service.js';
// ...
const yourService = remote ? null! : new YourService();
```

### 3-2. ListToolsRequestSchema 추가
```typescript
{
  name: 'your_tool_name',
  description: 'CALLER RESPONSIBILITY: ... confirmed=true로 호출. ...',
  inputSchema: {
    type: 'object' as const,
    properties: {
      task_id: { type: 'string', description: '...' },
      confirmed: { type: 'boolean', description: 'REQUIRED: ...' },
      // ...
    },
    required: ['task_id', 'confirmed'],
  },
},
```

### 3-3. CallToolRequestSchema case
```typescript
case 'your_tool_name': {
  const input: YourInput = {
    task_id: args?.task_id as string,
    confirmed: args?.confirmed as boolean,
    // ...
  };
  result = await yourService.executeYourAction(input);
  break;
}
```

## Phase 4: 단위 테스트 (T4 RED → T5 GREEN)

**위치**: `packages/mcp-server/src/__tests__/{your-service}.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 외부 SDK mock (필요시)
vi.mock('your-sdk', () => ({ /* ... */ }));

describe('YourService', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'your-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('confirmed !== true → NOT_CONFIRMED', async () => { /* ... */ });
  it('정상 호출 → success', async () => { /* ... */ });
  it('VALIDATION_ERROR 케이스들', async () => { /* ... */ });
  it('에러 분류 6개 코드', async () => { /* ... */ });
  it('파일 시스템 격리 (tmpDir)', async () => { /* ... */ });
});
```

**커버리지 목표**: 80%+ (lines, functions). `vitest.config.ts` 임계값 참조.

## Phase 5: 빌드/테스트

```bash
pnpm --filter @ai-pm/mcp-server build
pnpm --filter @ai-pm/mcp-server test {your-service}
```

## Phase 6: 코드 리뷰 (분류별)

- **1중**: code-reviewer (단순 도구, 외부 통합 없음)
- **2중**: code-reviewer + security-reviewer 단일 메시지 병렬 (외부 통합·신규 기능)
- **3중**: + critic adversarial (보안/DB/결제/권한 영역)

## 보안 체크리스트 (외부 통합 시)

- [ ] `_security-base` 7개 함수 import
- [ ] API 키 4중 마스킹 (`sanitizeErrorMessage`)
- [ ] 프롬프트 인젝션 nonce 마커 (`buildPromptInjectionMarkers`)
- [ ] 사용자 입력 sanitize (`sanitizeUserInput`)
- [ ] 파일 atomic write (`atomicWrite`)
- [ ] task_id 검증 (`validateTaskId`)
- [ ] URL 안전 필터 (`filterSafeUrls`)
- [ ] 모델/엔드포인트 화이트리스트 (caller 임의 지정 차단)

## 참조

- APS-1-1 구현: `packages/mcp-server/src/services/research-service.ts`
- 보안 모듈: `packages/mcp-server/src/services/_security-base.ts`
- 테스트 패턴: `packages/mcp-server/src/__tests__/research-service.test.ts`
