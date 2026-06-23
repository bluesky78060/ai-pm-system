# APS-3-3 플랜 리뷰 — web-ui API 키 입력 인증

- **리뷰어**: `critic`(Opus) — 작성자와 분리된 독립 패스
- **메인 오케스트레이터 자체 검토**: 통과 (rev2 반영 확인)
- **일자**: 2026-06-23
- **판정**: CHANGES_REQUESTED → **rev2 반영 후 해소** → 구현 진입

## critic 1차 판정
CRITICAL 0 / MAJOR 2 / MINOR 4 / SUGGESTION 3. 아키텍처(중앙 request() 주입 + 프로브 게이트)는 서버 동작과 대조해 건전 확인. 단 인증 경계 설계 갭 2건이 구현 전 명세 필요.

## MAJOR 해소 (rev2)
- **MAJOR-1 (프로브 루프)**: keyed 401만 이벤트 발화(세션 만료), keyless 401은 게이트 정상 진입(이벤트 X). 폼 표시 중 자동 재프로브 금지, 이벤트 핸들러 idempotent. → 루프 차단. DoD #5 추가.
- **MAJOR-2 (401 vs 비-401)**: request() throw에 HTTP status 부착. 프로브는 status===401만 키 폼, 403/500/네트워크는 재시도 에러 상태. → 정상 키 보유자가 서버 장애 시 키 재입력 강요당하지 않음. DoD #4 추가.

## MINOR 해소 (rev2)
- 키 trim + 빈/공백 거부(remote-client.ts:14 관례)
- StrictMode dev 이중 프로브 무해 명시
- 게이트는 App.tsx `<Routes>`만 감싸 헤더/로그아웃 항상 노출
- 두 MAJOR 시나리오 자동 테스트(웹 인프라 존재 시 RTL, 없으면 순수함수 추출 단위테스트)
- localStorage 키 = accepted residual risk로 정직 표기(완화 아님)
- keyed 401 후 "키가 올바르지 않습니다" UX

## 체크리스트 7항목
1 목표명확성 ✅ / 2 범위적절성 ✅ / 3 리스크식별 ✅(rev2 정정) / 4 산출물·DoD ✅(rev2 보강) / 5 Discovery일치 ✅ / 6 기술검증 ✅(rev2로 루프·status 해소) / 7 테스트전략 ✅(rev2 자동테스트)

## 처리
critic이 제시한 정확한 수정안을 rev2에 verbatim 반영. 모든 MAJOR/MINOR 해소. 구현은 rev2 명세를 따르며, 실제 코드는 **3중 리뷰(code-reviewer + security-reviewer + critic)**가 독립 검증. → 구현 진입.
