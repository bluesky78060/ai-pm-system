# APS-1-2: 보안 공유 모듈 추출 — 구현 플랜

- **티켓**: APS-1-2
- **선결**: `docs/00-discovery/APS-1-2-direction.md`
- **분류**: 2중 검증 (보안 추출, 신규 보안 추가 없음)
- **단축 적용**: 메인 직접 작성, 1차/2차 리뷰 병렬

## Discovery 결과 매핑

| 항목 | 반영 |
|------|------|
| 7개 보안 함수 추출 + carve-out | F-001 (7 exports) |
| research-service 마이그레이션 | F-006 |
| 회귀 0 (43/43 그대로) | F-007 |

## 기능 명세

### F-001 (P0): `_security-base.ts` 신규 파일 — 7개 export

**중요**: 3개 함수(`maskApiKey`, `sanitizeErrorMessage`, `sanitizeUserInput`)는 이미 named function으로 존재하므로 단순 이동. 나머지 4개(`buildPromptInjectionMarkers`, `atomicWrite`, `validateTaskId`, `filterSafeUrls`)는 inline 로직(`research-service.ts` L173-175 / L473-485 / L506-514 / L321-348)에서 **carve-out**. 특히 `filterSafeUrls`는 스킴+길이 필터만 담당하며, `parseSources`의 dedupe/cap 로직은 호출부에 유지.

```typescript
// packages/mcp-server/src/services/_security-base.ts

// 1. API 키 마스킹
export function maskApiKey(key: string | null | undefined): string;

// 2. 에러 메시지 4중 마스킹 (raw + AIza + ?key= + Bearer/Basic)
export function sanitizeErrorMessage(rawMessage: string, apiKey?: string): string;

// 3. 프롬프트 인젝션 nonce 마커 생성
export function buildPromptInjectionMarkers(): {
  nonce: string;
  startMarker: string;
  endMarker: string;
};

// 4. 백틱 → zero-width space + backtick
export function sanitizeUserInput(input: string): string;

// 5. atomic write (임시 파일 + rename + mode 0o600)
export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
}
export function atomicWrite(filePath: string, content: string, opts?: AtomicWriteOptions): Promise<void>;

// 6. task_id 검증 (정규식 + 길이 캡)
export interface ValidateTaskIdResult {
  valid: boolean;
  error?: string;
}
export function validateTaskId(taskId: unknown, maxLen?: number): ValidateTaskIdResult;

// 7. 안전 URL 필터 (위험 스킴 + cap)
export interface FilterSafeUrlsOptions {
  maxUrlLen?: number;  // default 2048
  maxCount?: number;   // default 50
}
export function filterSafeUrls(urls: string[], opts?: FilterSafeUrlsOptions): string[];
```

### F-002 (P0): 단위 테스트 (`_security-base.test.ts`)

- maskApiKey: 짧은 키 / 정상 키 / null/undefined
- sanitizeErrorMessage: raw key / AIza pattern / ?key= query / Bearer/Basic / 키 없음
- buildPromptInjectionMarkers: nonce 16자 hex / 두 번 호출 시 다름
- sanitizeUserInput: 백틱 치환 / 공백 보존
- atomicWrite: 정상 / 임시 파일 cleanup / 권한 0600
- validateTaskId: 정규식 통과 / 정규식 위반 / 길이 초과 / non-string
- filterSafeUrls: javascript:/data:/file:// 차단 / 길이 cap / 개수 cap / 중복 제거

목표: 라인 커버리지 80%+

### F-003 (P0): research-service 마이그레이션

- 기존 함수들을 `_security-base`에서 import
- ResearchService 내부 로직 유지 (API 시그니처 변경 X)
- 기존 43개 테스트 그대로 통과 검증

### F-004 (P1): 문서

- `_security-base.ts` JSDoc 주석 (각 함수의 사용 사례)
- `.claude/rules/dev-tips.md`에 외부 API 통합 시 import 가이드 추가

## 로드맵

### Phase 1: 추출 + 테스트 (병렬 가능)
- T1: `_security-base.ts` 신규 작성 (메인 직접, 함수 추출)
- T2: `_security-base.test.ts` 작성 (메인 직접 또는 executor-low 위임)

### Phase 2: 마이그레이션
- T3: `research-service.ts` import 변경 + 내부 함수 호출 → 신규 모듈 호출
- T4: 빌드/테스트 회귀 검증 (43/43 GREEN)

### Phase 3: 코드 리뷰 (2중 병렬)
- T5: code-reviewer + security-reviewer **단일 메시지 병렬 dispatch**
- T6: 발견 사항 self-healing 또는 사용자 확인

### Phase 4: 문서 + approve
- T7: dev-tips.md 보강
- T8: approve_review (`code-reviewer + security-reviewer 2중 통과`)

## 파일 소유권 매트릭스

| 파일 | 담당 | 위치 |
|------|------|------|
| `_security-base.ts` | T1 (메인) | services/ |
| `_security-base.test.ts` | T2 (메인 또는 executor-low) | __tests__/ |
| `research-service.ts` | T3 (메인) | services/ |
| `dev-tips.md` | T7 (writer 또는 메인) | .claude/rules/ |

## 회귀 보호

- T3 마이그레이션 후 즉시 `pnpm --filter @ai-pm/mcp-server test research-service` 실행
- 43/43 GREEN 미달 시 즉시 롤백

## 산출물 체크리스트

- [ ] `packages/mcp-server/src/services/_security-base.ts`
- [ ] `packages/mcp-server/src/__tests__/_security-base.test.ts`
- [ ] `packages/mcp-server/src/services/research-service.ts` (마이그레이션)
- [ ] `.claude/rules/dev-tips.md` (외부 API 통합 가이드)
- [ ] `docs/02-review/APS-1-2-plan-review.md` (이 플랜 리뷰)
- [ ] `docs/03-code-review/APS-1-2-review.md` (2중 검증 결과)

## 단축 정책 적용 검증

- [x] Discovery 메인 직접 작성 (사용자 응답 대기 우회) → -5분
- [x] 분류: 2중 (3중 challenge 생략) → -5분
- [x] 1차 + 2차 리뷰 병렬 dispatch (단일 메시지) → -5분
- [x] Self-healing 자동 루프 (MAJOR 발견 시) → -5분
- 예상 총 시간: 15~20분 (APS-1-1 60분 대비 -67%)
