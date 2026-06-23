# APS-3-4 Discovery — web-ui 테스트 인프라 (vitest + RTL)

> 자동채움. 사용자가 "web-ui 테스트 인프라 추가" 명시 요청.

## 배경
web-ui는 테스트 러너가 전혀 없음(package.json scripts에 test 부재). APS-3-3 인증 게이트의 상태머신·api.ts 로직이 무테스트라 3중 리뷰어 공통으로 후속 과제 지적. 리팩터가 게이트 회귀(루프/먹통/빈바디)를 조용히 깰 위험.

## 7개 카테고리
1. **목표(Why)**: web-ui에 vitest+RTL 인프라 구축 + APS-3-3 게이트 회귀 테스트로 인증 진입점 보호. 성공 = `vitest run` 통과 + MAJOR 시나리오(빈바디·keyed/keyless 401·status 분기) 커버.
2. **사용자(Who)**: web-ui 유지보수자 + 워크플로우 STRICT submit_test(web-ui unit 카테고리 충족 가능해짐).
3. **범위(What)**: MVP = vitest + jsdom + @testing-library/react + 셋업 + test 스크립트 + `api.ts`/`ApiKeyGate` 테스트. **제외**: e2e(Playwright), 전 컴포넌트 커버리지, 커버리지 게이트.
4. **제약(Constraints)**: React 19 + Vite 6 + @vitejs/plugin-react(기존). @testing-library/react v16(React 19 호환). vitest가 vite config 재사용. dev 의존성만(프로덕션 무영향).
5. **우선순위(Priority)**: P3 (품질 후속, 비긴급).
6. **리스크(Risk)**: 신규 dev 의존성 supply-chain → 버전 핀 + lockfile 고정 + `pnpm audit`. React 19 RTL 호환 버전 주의.
7. **검증(Verify)**: `vitest run` green, APS-3-3 MAJOR 시나리오 테스트 포함, 빌드 무영향, `pnpm audit --prod` 깨끗(dev-only라 prod 트리 무변).

## 방향 (확정)
vitest(jsdom env) + RTL 추가, vite config 재사용, api.ts·ApiKeyGate 회귀 테스트. dev-only.

## 미해결 이슈
- 없음. 2중 검증(신규 의존성) supply-chain은 security-reviewer가 점검.
