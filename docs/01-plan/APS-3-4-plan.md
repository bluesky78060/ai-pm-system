# APS-3-4 구현 플랜 — web-ui 테스트 인프라 (vitest + RTL)

- **분류**: 2중 검증 (신규 dev 의존성)
- **우선순위**: P3
- **선행**: `docs/00-discovery/APS-3-4-direction.md`

## 기능 명세
| ID | 기능 | P | 설명 |
|----|------|---|------|
| F-001 | dev 의존성 추가 | P0 | `vitest`, `@vitest/coverage-v8`(선택), `jsdom`, `@testing-library/react`(v16, React19), `@testing-library/jest-dom`, `@testing-library/dom`. `pnpm --filter @ai-pm/web-ui add -D ...` (lockfile 고정) |
| F-002 | vitest 설정 | P0 | `packages/web-ui/vitest.config.ts` — `environment: 'jsdom'`, `globals: true`, `setupFiles`, `@vitejs/plugin-react` 재사용. tsconfig가 vitest globals 인식하도록 types 추가 |
| F-003 | 셋업 파일 | P0 | `src/test/setup.ts` — `@testing-library/jest-dom` matchers import |
| F-004 | test 스크립트 | P0 | package.json `"test": "vitest run"`, `"test:watch": "vitest"`, `"lint": "biome check src"`(STRICT 호환, mcp-server와 정합) |
| F-005 | api.ts 테스트 | P0 | `src/__tests__/api.test.ts` — fetch mock으로: status 부착, **keyed-401만 이벤트+clear**, keyless 401 이벤트 없음, 키 trim/빈값 미전송, **빈바디 200→{} (갇힘 방지)**, 비-2xx throw |
| F-006 | 게이트 테스트 | P0 | `src/__tests__/ApiKeyGate.test.tsx` — RTL: 프로브 401→키폼, 성공→children, 비-401(500)→에러+재시도, 빈바디200→children(authed), 잘못된키 제출→"키가 올바르지 않습니다", 로그아웃 이벤트→게이트 복귀, **루프 없음(프로브 1회)** |

## 구현 로드맵
- P1: 의존성 설치 + vitest.config + setup (executor)
- P2: api.test.ts (request 로직)
- P3: ApiKeyGate.test.tsx (상태머신 — APS-3-3 MAJOR 회귀)
- P4: `vitest run` 통과 확인 + 2중 리뷰

## 보안 (2중 — supply-chain)
- 신규 dev 의존성은 잘 알려진 공식 패키지(vitest/testing-library/jsdom). 버전 핀 + lockfile 고정.
- dev-only(`devDependencies`) → 프로덕션 번들·트리 무영향. `pnpm audit --prod` 불변 확인.
- security-reviewer가 의존성 출처·범위 점검.

## 테스트 전략 / DoD
1. `pnpm --filter @ai-pm/web-ui test`(vitest run) green.
2. api.test.ts가 APS-3-3 MAJOR(빈바디·keyed/keyless 401·status) 직접 커버.
3. ApiKeyGate.test.tsx가 상태머신 + 루프 없음 검증.
4. `pnpm -r build`(tsc -b 포함) 무영향, `biome check src` clean, `pnpm audit --prod` 불변.
5. 2중 리뷰(code-reviewer + security-reviewer) 통과.

## rev2 — critic 플랜 리뷰 반영 (MAJOR 2 + MINOR 4)

**MAJOR-1 (테스트 파일이 build tsc -b + biome에 들어감)**:
- 모든 테스트 파일은 **명시적 import** 사용: `import { describe, it, expect, vi, beforeEach } from 'vitest'` (mcp-server 패턴 정합 — globals/types 배열 의존 제거).
- `tsconfig.app.json`에 `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/__tests__", "src/test"]` 추가 → `tsc -b` 빌드가 테스트 파일을 타입체크하지 않음(빌드 무영향). vitest는 자체 transpile로 실행.
- `biome check src`는 테스트도 린트 → idiomatic 테스트 코드로 clean 유지(repo는 noExplicitAny off라 mock에 관대). DoD #4에 `biome` clean 명시.

**MAJOR-2 (vitest.config.ts 타입체크 위치)**:
- `tsconfig.node.json`의 `include`에 `"vitest.config.ts"` 추가(`vite.config.ts`와 나란히, node-side 도구 config 의도).

**MINOR 반영**:
- (m1) RTL `@testing-library/react@^16.3.0`(React19 peer `^18||^19` 확인됨), 필수 peer `@testing-library/dom@^10` 포함. **vitest는 `^3`(모노레포 mcp-server 정합, 최신 4.x 아님)**.
- (m2) 본 티켓 submit_test의 `unit` 카테고리 = **web-ui vitest run**(신규 테스트)로 충족. `pnpm -r test`가 web-ui도 자동 포함(side effect).
- (m3) setup은 `src/test/setup.ts`, 스펙은 `src/__tests__/` — **의도된 2디렉토리**(setupFiles 참조 유지). exclude에 둘 다 포함.
- (m4) fetch mock = `vi.stubGlobal('fetch', vi.fn())`. jsdom localStorage는 `beforeEach`에서 `localStorage.clear()` 시딩. keyed-401 이벤트는 `addEventListener` 스파이/`vi.fn()` 리스너로 단언, 비동기 probe는 RTL `waitFor`/`findBy`로 act() 처리.
