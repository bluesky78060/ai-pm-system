# APS-3-4 플랜 리뷰 — web-ui 테스트 인프라

- **리뷰어**: `critic`(Opus) — 작성자와 분리
- **메인 오케스트레이터 자체 검토**: 통과 (rev2 반영 확인)
- **일자**: 2026-06-23
- **판정**: CHANGES_REQUESTED → **rev2 반영 후 해소** → 구현 진입

## critic 1차 판정
CRITICAL 0 / MAJOR 2 / MINOR 4 / SUGGESTION 3. 저위험·잘 스코프된 인프라 플랜, 핵심 결정(vitest+jsdom+RTL v16, dev-only, private request() 공개 API 경유 테스트) 건전. 단 build/lint 통합 갭 2건.

## MAJOR 해소 (rev2)
- **MAJOR-1 (테스트가 tsc -b/biome에 들어감)**: 명시적 `import from 'vitest'` + `tsconfig.app.json` exclude(테스트/setup) → 빌드 무영향. biome clean + tsc -b pass를 DoD에 추가.
- **MAJOR-2 (vitest.config.ts 타입체크 위치)**: `tsconfig.node.json` include에 추가.

## MINOR 해소 (rev2)
- RTL `^16.3.0` + dom `^10` 핀, **vitest `^3`(모노레포 정합)**
- 본 티켓 unit = web-ui vitest run, `pnpm -r test` 자동 포함
- setup(`src/test/`) + spec(`src/__tests__/`) 2디렉토리 의도 명시
- fetch=`vi.stubGlobal`, localStorage `beforeEach` clear, 이벤트 리스너 스파이, `waitFor`

## 체크리스트 7항목
1 목표 ✅ / 2 범위 ✅ / 3 리스크 ✅(supply-chain) / 4 산출물·DoD ✅(rev2 보강) / 5 Discovery일치 ✅ / 6 기술검증 ✅(rev2로 build/tsconfig 해소) / 7 테스트전략 ✅(APS-3-3 MAJOR 커버)

## 처리
critic 처방을 rev2에 verbatim 반영. 모든 MAJOR/MINOR 해소. 구현은 rev2 따르고, 실제는 2중 리뷰(code-reviewer + security-reviewer)가 검증. → 구현 진입.
