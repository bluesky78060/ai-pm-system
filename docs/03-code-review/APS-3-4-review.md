# APS-3-4 코드 리뷰 — web-ui 테스트 인프라 (vitest + RTL)

- **분류**: 2중 검증 (신규 dev 의존성)
- **리뷰어**: `code-reviewer`(품질) + `security-reviewer`(supply-chain) — 병렬, 작성자와 분리
- **승인 호출자**: 메인 오케스트레이터 (self-approval 회피)
- **일자**: 2026-06-23

## 변경
web-ui에 vitest^3 + jsdom + @testing-library/react v16 추가. config(vitest.config.ts)·setup(in-memory localStorage)·tsconfig(app exclude / node include)·package.json(deps+scripts). 테스트: api.test.ts(7) + ApiKeyGate.test.tsx(7) = **14**, APS-3-3 게이트 회귀 커버.

## 검증 (Iron Law — 직접 실행)
| 항목 | 결과 |
|------|------|
| unit (web-ui vitest run) | PASS (14, api 7 + ApiKeyGate 7) |
| build (tsc -b && vite build) | PASS (테스트 exclude로 빌드 무영향) |
| lint (biome web-ui src) | PASS (clean) |
| 회귀 (mcp-server) | PASS (217) |
| `pnpm audit --prod` | No known vulnerabilities |

## 2중 리뷰 판정
- **1차 code-reviewer**: APPROVED (CRIT 0/MAJOR 0/MINOR 1/SUG 4). **변이 테스트로 검증력 실증**(keyless-401 가드 제거→테스트 실패, 401 라우팅 변조→실패 = 가짜 통과 아님). rev2 MAJOR-1/2 빌드 증거로 충족(`tsc --listFiles`로 test 제외·vitest.config 포함 확인). 버전 정합 확인.
- **2차 security-reviewer**: APPROVED (CRIT 0/MAJOR 0/MINOR 1/SUG 2). supply-chain clean(공식 패키지·typosquat 0·dev-only·prod audit clean·tsconfig+devDeps 이중 격리·테스트 hermetic).

## MINOR 반영 (self-healing)
- (code-reviewer) F-006 "세션만료 이벤트→게이트 복귀" 컴포넌트 테스트 누락 → **추가**(authed에서 UNAUTHORIZED_EVENT 발화→키 폼 복귀 단언). 14 테스트로 증가, 전부 green.

## 후속 과제 (비차단)
- **vitest ^3.2.6 범프**: vitest@3.2.4 UI advisory(`<3.2.6`, UI 서버 listening 시만 — 본 구성 UI 미사용이라 비exploitable). web-ui+mcp-server 공통 해소 별도 티켓.
- vite@8 high advisory(기존 override 기인, Windows dev-server 한정) override 범프.
- `tsconfig.node.tsbuildinfo` git-tracked → `.gitignore` 등록.
- okResp/errResp 헬퍼 `src/test/` 공유 추출(DRY, 선택).

## 최종: APPROVED (2중 통과)
code-reviewer + security-reviewer 모두 APPROVED, CRITICAL/MAJOR 0. 변이 테스트로 검증력 입증, supply-chain 무위험(dev-only). MINOR self-healing 반영.
