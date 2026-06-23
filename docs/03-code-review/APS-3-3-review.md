# APS-3-3 코드 리뷰 — web-ui API 키 입력 인증 (대시보드 회귀 복구)

- **분류**: 3중 검증 (인증/세션) — Claude 3중 대체
- **리뷰어**: `code-reviewer` + `security-reviewer` + `critic` adversarial (병렬, 작성자와 분리)
- **승인 호출자**: 메인 오케스트레이터 (self-approval 회피)
- **일자**: 2026-06-23

## 변경
API_KEY enforce 활성화로 web 대시보드가 /api 401에 막힌 회귀 복구. `api.ts` 중앙 request()에 x-api-key 주입 + 프로브 게이트(`ApiKeyGate.tsx`) + App 래핑/로그아웃.

## 검증 (Iron Law — 직접 실행)
| 항목 | 결과 |
|------|------|
| build (`tsc -b && vite build`) | PASS (타입체크 포함, 203ms) |
| lint (biome 3파일) | PASS (clean) |
| unit (mcp-server vitest) | PASS (217, 백엔드 회귀 0) |

## 3중 리뷰 판정 (라운드 1)
- **1차 code-reviewer**: APPROVED (CRIT 0/MAJOR 0/MINOR 1/SUG 3). rev2 명세(MAJOR-1 루프가드·MAJOR-2 status 구분) 코드레벨 충족, 서버 계약(auth.ts 401 단일)과 정합 확인.
- **2차 security-reviewer**: APPROVED (CRIT 0/MAJOR 0/MINOR 1/SUG 3). 키 노출·우회 0건, CSRF 내성(커스텀 헤더), enforce-OFF 회귀 보존, localStorage accepted-risk 정직 처리. MINOR-1=서버 비상수시간 키 비교(범위 밖).
- **3차 critic adversarial**: CHANGES_REQUESTED (CRIT 0/**MAJOR 1**/MINOR 2/SUG 2). 게이트 깨기·루프·먹통 시도 **전부 실패**(설계 견고 입증). MAJOR 1건 발견.

## Self-healing (MAJOR-1 + 수렴 항목)
**MAJOR-1 (빈/비-JSON 200 → 인증 사용자 갇힘)**: success 경로 `res.json()`이 빈 바디에서 reject → "연결 실패"로 오분류. **수정**: `const text = await res.text(); return (text ? JSON.parse(text) : {}) as T;` (error 경로와 대칭 가드). → 빈 200에서도 프로브 authed 유지.

추가 반영:
- (SUG) `UNAUTHORIZED_EVENT` 상수 추출 — 3곳 stringly-typed 오타 리스크 제거.
- (MINOR) `keyInput`을 unauthorized 이벤트 시 정리.
- (방어) localStorage 접근 try/catch — 프라이빗 모드 throw 방지.

재검증: biome clean, build ✓, mcp-server 217 회귀 0.

## 최종 판정: APPROVED (3중 통과)
- 2/3 직접 APPROVED + 3차 MAJOR 1건 self-healing 후 정확한 처방대로 해소·재검증.
- adversarial이 루프/먹통/우회를 못 깸 = 게이트 견고성 입증.

## 후속 과제 (비차단)
- **web-ui 테스트 인프라**: vitest+RTL 부재 → 게이트 상태머신/빈바디 회귀 테스트 미작성(3 리뷰어 공통 지적, 사전조건부). 별도 티켓 권장 — 프로브/status 분기 순수함수 추출 + 최소 vitest.
- 서버 `auth.ts` 비상수시간 키 비교 → `timingSafeEqual` (저위험, 후속).
- 서버 CSP/helmet 헤더(방어심층, 후속).
