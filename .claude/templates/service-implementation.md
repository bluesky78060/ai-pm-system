# 표준 템플릿: 백엔드 서비스 클래스 골격

`@ai-pm/mcp-server`에 새 서비스 클래스를 추가할 때 따르는 표준 골격. APS-1-1(`ResearchService`) 사례 기반.

## 디렉터리 구조

```
packages/mcp-server/src/
├── services/
│   ├── _security-base.ts          # 공유 보안 모듈 (외부 API 통합 시 import)
│   ├── your-service.ts            # 도메인 서비스 (이번 작업)
│   └── ...
└── __tests__/
    └── your-service.test.ts       # 단위 테스트
```

## 클래스 골격

```typescript
/**
 * YourService — {도메인 책임 1줄}
 *
 * 책임:
 *   - {핵심 동작 1}
 *   - {핵심 동작 2}
 *
 * 보안:
 *   - {보안 패턴 — 외부 통합 시 _security-base 활용}
 *
 * 모든 실패는 워크플로우를 차단하지 않는 `{ success: false, error_code, message }` 형태로 반환.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { /* _security-base 함수 */ } from './_security-base.js';

// ───────────────────────────────────────────
// 상수 (도메인 고유 값)
// ───────────────────────────────────────────
const YOUR_DEFAULT_DIR = 'docs/XX-your-output';
const YOUR_TIMEOUT_MS = 30000;

// ───────────────────────────────────────────
// 공개 타입 (discriminated union)
// ───────────────────────────────────────────
export interface YourInput {
  task_id: string;
  confirmed: boolean; // 비용 발생 시 필수
  // ... 도메인 필드
}

export type YourErrorCode =
  | 'NOT_CONFIRMED'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'UNKNOWN';

export interface YourResultSuccess {
  success: true;
  // ... 결과 필드
}
export interface YourResultFailure {
  success: false;
  error_code: YourErrorCode;
  message: string;
}
export type YourResult = YourResultSuccess | YourResultFailure;

// ───────────────────────────────────────────
// 옵션 (DI — 테스트 격리용)
// ───────────────────────────────────────────
export interface YourServiceOptions {
  /** 출력 디렉터리 (기본: YOUR_DEFAULT_DIR) — 테스트에서 tmpdir 주입 */
  outputDir?: string;
  // ... 다른 의존성 주입 옵션
}

// ───────────────────────────────────────────
// YourService 클래스
// ───────────────────────────────────────────
export class YourService {
  private readonly outputDir: string;

  constructor(opts?: YourServiceOptions) {
    this.outputDir = opts?.outputDir ?? YOUR_DEFAULT_DIR;
  }

  /**
   * 메인 진입점.
   */
  async execute(input: YourInput): Promise<YourResult> {
    // 1) 승인 검증 (가장 우선)
    if (input.confirmed !== true) {
      return {
        success: false,
        error_code: 'NOT_CONFIRMED',
        message: '...',
      };
    }

    // 2) 입력 검증
    const validationError = this.validateInput(input);
    if (validationError) {
      return { success: false, error_code: 'VALIDATION_ERROR', message: validationError };
    }

    // 3) 디렉터리 자동 생성
    await fs.mkdir(this.outputDir, { recursive: true });

    // 4) 도메인 로직 실행 (try/catch로 에러 분류)
    try {
      // ...
    } catch (err) {
      return this.classifyError(err);
    }

    // 5) 결과 파일 저장 (atomic)
    // await atomicWrite(filePath, content);

    return { success: true /* ... */ };
  }

  /**
   * 입력 검증 — 통과 시 null, 실패 시 사유 문자열 반환.
   */
  private validateInput(input: YourInput): string | null {
    // task_id 검증 (외부 통합 시 _security-base의 validateTaskId 사용)
    // 기타 도메인 검증
    return null;
  }

  /**
   * 에러 분류 — Network / 외부 API 응답 / 알 수 없음.
   */
  private classifyError(err: unknown): YourResultFailure {
    const errObj = err as { message?: string; code?: string; status?: number };
    const message = errObj?.message ?? String(err ?? 'Unknown error');
    // ...
    return { success: false, error_code: 'UNKNOWN', message };
  }
}
```

## 테스트 골격 (vitest)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 외부 SDK mock
const mockExternal = vi.fn();
vi.mock('your-sdk', () => ({
  YourSdkClass: vi.fn().mockImplementation(() => ({
    method: mockExternal,
  })),
}));

// 동적 import (mock 적용 후)
let YourService: typeof import('../services/your-service.js').YourService;
type YourInput = import('../services/your-service.js').YourInput;

let tmpDir: string;

beforeEach(async () => {
  mockExternal.mockReset();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'your-test-'));
  if (!YourService) {
    const mod = await import('../services/your-service.js');
    YourService = mod.YourService;
  }
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function buildInput(over?: Partial<YourInput>): YourInput {
  return {
    task_id: 'APS-X-Y',
    confirmed: true,
    ...over,
  };
}

describe('YourService.execute', () => {
  it('정상 호출', async () => {
    mockExternal.mockResolvedValue({ /* ... */ });
    const svc = new YourService({ outputDir: tmpDir });
    const r = await svc.execute(buildInput());
    expect(r.success).toBe(true);
  });

  it('confirmed !== true → NOT_CONFIRMED', async () => {
    const svc = new YourService({ outputDir: tmpDir });
    const r = await svc.execute(buildInput({ confirmed: false }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error_code).toBe('NOT_CONFIRMED');
    expect(mockExternal).not.toHaveBeenCalled();
  });

  // ... 더 많은 케이스
});
```

## 핵심 원칙

1. **Discriminated Union**: `success: true/false` 분기로 caller가 narrowing 강제
2. **DI**: 테스트 격리 위해 핵심 경로(파일 시스템, 네트워크)는 옵션 주입
3. **승인 게이트 우선**: API 호출 전 `confirmed` 검증으로 비용 차단
4. **에러 분류**: 워크플로우 차단 안 함 — 결과 객체로 반환
5. **공유 모듈 활용**: 외부 통합 시 반드시 `_security-base` import
6. **테스트 격리**: `os.tmpdir()` + mock + env restore

## 참조

- ResearchService 구현: `packages/mcp-server/src/services/research-service.ts`
- 테스트 패턴: `packages/mcp-server/src/__tests__/research-service.test.ts`
- 보안 모듈: `packages/mcp-server/src/services/_security-base.ts`
- 외부 API 통합 시 추가 가이드: `external-api-integration.md`
- MCP 도구 등록 시 추가 가이드: `mcp-tool-addition.md`
