# APS-1-2: 보안 공유 모듈 추출 — 방향 확정 문서

- **티켓**: APS-1-2
- **에픽**: MCP 서버 Core
- **작성일**: 2026-05-08
- **작성 방식**: 메인 오케스트레이터 직접 작성 (APS-1-1 컨텍스트 활용, 사용자 응답 대기 우회 — 단축 정책)

## 1. 목표 (Why)

APS-1-1에서 발견·검증된 보안 패턴 7종을 공유 모듈로 추출하여 향후 외부 API 통합 작업의 보안 결함 사전 차단.

**성공 기준**:
- `_security-base.ts` 신규 파일 + 단위 테스트 80%+
- `research-service.ts`가 새 모듈을 사용하도록 마이그레이션
- 기존 43/43 테스트 그대로 통과 (회귀 0)

**측정 지표**: 다음 외부 API 통합 작업에서 3차 adversarial 발견 사항 0건 목표.

## 2. 사용자 (Who)

- **주 사용자**: 향후 외부 API 통합 작업을 담당할 메인 오케스트레이터 + executor-high 에이전트
- **시나리오**: 새 외부 API 통합 시 `import { withApiKeyMasking, ... } from './_security-base.js'` 한 줄로 보안 패턴 적용

## 3. 범위 (What)

### 포함 (7개 함수 추출 + carve-out)
- `maskApiKey(key)` — API 키 마스킹
- `sanitizeErrorMessage(rawMessage, apiKey)` — 4중 마스킹 (raw key + AIza + ?key= + Bearer/Basic)
- `buildPromptInjectionMarkers()` — 64-bit nonce 마커 생성 (`{startMarker, endMarker, nonce}`)
- `sanitizeUserInput(input)` — 백틱 zero-width space 치환
- `atomicWrite(filePath, content, opts?)` — 임시 파일 + rename 패턴
- `validateTaskId(taskId, maxLen?)` — 정규식 + 길이 검증
- `filterSafeUrls(urls, opts?)` — 위험 스킴 필터 + 길이/개수 cap

### 제외
- `research-service.ts`의 ResearchService 클래스 자체 (API 호출 로직은 도메인 코드)
- 새 보안 기능 추가 (이번 작업은 추출만)

## 4. 제약 (Constraints)

- **타입 안전**: TypeScript strict
- **회귀 0**: 기존 research-service 43/43 테스트 그대로 통과
- **호환**: ES module 형식 (`.js` 확장자 import)
- **위치**: `packages/mcp-server/src/services/_security-base.ts` (밑줄 prefix는 internal/shared 표시)

## 5. 우선순위 (Priority)

- **P2** (워크플로우 단축 인프라 — 즉시 효과는 다음 외부 API 통합부터)
- 트레이드오프: 회귀 0 > 신규 기능 (이번엔 신규 없음)

## 6. 리스크 (Risk)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| research-service 회귀 | 큼 | 기존 43개 테스트 모두 통과 확인 후 commit |
| API 시그니처 변경 | 중 | export 함수만 추출, ResearchService API 변경 없음 |
| 의존성 사이클 | 저 | _security-base는 다른 service에 의존 안 함 (순수 함수) |

## 7. 검증 (Verify)

### DoD
- `_security-base.ts` 신규 작성 + 단위 테스트 80%+
- `research-service.ts`가 신규 모듈 사용하도록 마이그레이션
- 기존 43/43 테스트 그대로 통과
- 빌드 0 errors

### 테스트 방식
- `_security-base.test.ts` 단위 테스트 (mocking 최소)
- `research-service.test.ts` 회귀 검증 (변경 없이 그대로 통과)

## 분류

- **리뷰 강도**: 2중 검증 (외부 통합·신규 코드 패턴 분류)
  - 1차: code-reviewer (Opus)
  - 2차: security-reviewer (Opus) — 보안 모듈 자체이므로 적합
  - 3차 challenge 생략 (신규 보안 추가 없음, 추출만)

## 사용자 승인 (단축 정책)

이 작업은 **APS-1-1 컨텍스트 기반 단순 추출**이므로 사용자 사전 답변 없이 메인이 직접 방향 작성. 사용자가 본 문서 검토 후 명시적 승인 시 진행. 또는 즉시 진행 가속 모드로 사용자 사후 검토 가능.
