# APS-3-3 Discovery — web-ui API 키 입력 인증 (대시보드 회귀 복구)

> 자동채움(메인 오케스트레이터). 방향은 사용자가 "제대로 고치기" 명시 승인.

## 배경 (회귀)
세션 초 API_KEY enforce 활성화 후 `app.use('/api', apiKeyAuth)`가 모든 `/api/*`에 x-api-key 요구. web-ui `api.ts`는 헤더 미전송 → 대시보드 데이터 401. 정적 파일(HTML/JS)·/health는 무인증이라 화면은 뜨나 데이터 로딩 실패.

## 7개 카테고리
1. **목표(Why)**: API_KEY enforce 보안을 유지하면서 web 대시보드 복구. 성공 = enforce ON 상태에서 키 입력 후 대시보드 정상 작동.
2. **사용자(Who)**: 단일 사용자(대시보드 소유자). 본인의 API_KEY를 브라우저에 1회 입력.
3. **범위(What)**: MVP = 키 입력 화면 + localStorage 저장 + 모든 /api 호출에 x-api-key 첨부 + 401 시 재입력 유도. **제외**: OAuth/세션쿠키/다중사용자/서버측 세션, 별도 dashboard 토큰.
4. **제약(Constraints)**: 브라우저 SPA는 비밀키를 번들에 못 박음 → 사용자 입력 + localStorage. React 19 + Vite. 키 = 서버 API_KEY와 동일(전체 접근, 단일사용자라 허용).
5. **우선순위(Priority)**: P1 — 회귀, 대시보드 차단 중.
6. **리스크(Risk)**: localStorage는 XSS에 노출 가능(단일사용자·비공개 URL이라 수용). 키가 클라이언트 보관. → 완화: HTTPS 전제, 키 마스킹 입력, 로그아웃(키 삭제) 제공.
7. **검증(Verify)**: enforce ON에서 (a) 키 없으면 입력화면, (b) 올바른 키 입력 후 데이터 로딩, (c) 틀린 키 → 401 → 재입력, (d) 로그아웃 → 키 삭제 후 입력화면.

## 방향 (확정)
키 입력 게이트 + localStorage + `request()` 헬퍼에 x-api-key 주입 (중앙 1곳). 401 인터셉트로 키 무효화 + 게이트 표시.

## 미해결 이슈
- 없음 (설계 명확). 3중 검증(인증)으로 보안 점검.
