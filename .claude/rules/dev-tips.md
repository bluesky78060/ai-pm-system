# 개발 단축 팁 (dev-tips)

워크플로우 시간 절감을 위한 권장 패턴.

## Watch 모드 (백그라운드 실행)

매 수정마다 빌드/테스트 풀 실행은 비효율. 백그라운드 watch로 자동 재실행.

### TypeScript 빌드 watch
```bash
pnpm --filter @ai-pm/mcp-server dev
# = tsc --watch
```
저장 시 자동 재컴파일. `run_in_background: true`로 시작.

### Vitest watch
```bash
pnpm --filter @ai-pm/mcp-server test:watch
# = vitest (watch 모드 default)
```
파일 변경 시 영향받는 테스트만 재실행 (수 초 내).

### 메인 오케스트레이터 활용 패턴

```
1. 작업 시작 시 watch 모드 백그라운드 dispatch (run_in_background)
2. 코드 수정 → 자동 재컴파일/재테스트
3. 수정마다 풀 실행 안 함 → 라운드당 30초 절약
```

## Submit_test 캐시 활용

submit_test 호출 직전에 빌드/테스트 결과를 그대로 첨부 (재실행 X).
단, **Iron Law 준수**: 실제 실행 출력만 사용 (이전 라운드 출력 재사용 금지).

## 의존성 설치 최적화

```bash
# 🟢 OK: 한 번에 묶어서
pnpm --filter @ai-pm/mcp-server add foo bar -D baz

# 🔴 비효율: 매번 별도 명령
pnpm --filter @ai-pm/mcp-server add foo
pnpm --filter @ai-pm/mcp-server add bar
pnpm --filter @ai-pm/mcp-server add -D baz
```

## 매번 빌드 안 해도 되는 경우

- 문서/주석/CLAUDE.md/.md 수정 → 빌드 불필요
- 테스트 코드만 변경 → 테스트만 실행
- 타입 변경 → tsc만 실행 (`pnpm --filter ... run build` 대신 `npx tsc --noEmit`)

## 자주 쓰는 명령 단축 (zsh alias 권장)

```bash
# ~/.zshrc 추가
alias apm-build='pnpm --filter @ai-pm/mcp-server build'
alias apm-test='pnpm --filter @ai-pm/mcp-server test'
alias apm-dev='pnpm --filter @ai-pm/mcp-server dev'
alias apm-watch='pnpm --filter @ai-pm/mcp-server test:watch'
```

## 외부 API 통합 보안 표준 (APS-1-2 도입)

새 외부 API 통합 시 `_security-base.ts` 모듈을 import하여 표준 보안 패턴을 적용. 이를 통해 3차 adversarial 발견 사항(API 키 leak, 프롬프트 인젝션, 파일 충돌, ENAMETOOLONG, 위험 URL)을 사전 차단.

### 사용 예시

```typescript
import {
  maskApiKey,
  sanitizeErrorMessage,
  buildPromptInjectionMarkers,
  sanitizeUserInput,
  atomicWrite,
  validateTaskId,
  filterSafeUrls,
} from './_security-base.js';

// 1. API 키 에러 메시지 마스킹 (4중 방어)
const safeMsg = sanitizeErrorMessage(rawError, process.env.API_KEY);

// 2. 프롬프트 인젝션 nonce 마커
const { nonce, startMarker, endMarker } = buildPromptInjectionMarkers();
const userPrompt = `${startMarker}\n${sanitizeUserInput(input)}\n${endMarker}`;

// 3. atomic 파일 쓰기 (race + 부분 쓰기 방어)
await atomicWrite('docs/output.md', content);  // mode 0o600 default

// 4. task_id 검증 (정규식 + 길이 캡)
const validation = validateTaskId(input.task_id);
if (!validation.valid) return { error: validation.error };

// 5. URL 안전 필터 (위험 스킴 + 길이/개수 cap)
const safeUrls = filterSafeUrls(extractedUrls);
```

### 도입 효과

- 신규 외부 API 통합 작업의 보안 라운드 생략 (-15%)
- adversarial challenge에서 발견될 7가지 위험 패턴 사전 차단

## 효과

- Watch 모드: 라운드당 ~30초 절약 × N 라운드
- Self-healing 자동 루프 (`code-review.md` 참조): MAJOR 발견 시 사용자 개입 없이 1라운드 단축
- 병렬 dispatch (`agent-mapping.md` 참조): 리뷰 라운드 60% 단축
- 보안 공유 모듈 (`_security-base.ts`): 외부 API 통합 시 보안 라운드 -15%
