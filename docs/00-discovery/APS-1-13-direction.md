# APS-1-13 Discovery — express 4 → 5 업그레이드

- **분류**: architecture/의존성 메이저 업그레이드 → 3중 검증 (최근 배포 크래시가 express/path-to-regexp 불일치였던 이력)
- **방향 확정**: 사용자 명시 선택("express 5 업그레이드 진행해줘", 2026-06-21)

## 코드 감사 결과 (마이그레이션 범위 — 매우 좁음)

- **유일한 breaking**: `api-server.ts:673` `app.get('*', ...)` SPA fallback → express 5는 named wildcard 필수
- `wrapAsync`(`:115`)는 자체 try/catch로 `res.json` 직접 전송, `next(err)` 미사용 → express 5 async 에러 자동 forward 변경 **무영향**
- optional/regex 파라미터(`:x?`, `(.*)`)·4-arg 에러 핸들러·removed 시그니처(`app.del`/`req.param`/`res.send(status)`/`res.json(obj,status)`) **전무**
- `cors`/`express.json()`/`express.static()` — express 5 호환
- **잠복 불일치**: `@types/express`가 이미 `^5.0.0`, 런타임만 `4.21.2`. 코드는 이미 v5 타입으로 컴파일 중 → 런타임 정렬이 위험 **감소**

## 공식 마이그레이션 가이드 (expressjs.com/en/guide/migrating-5)

- SPA catch-all: `app.get('/{*splat}', ...)` (중괄호가 root `/`까지 매칭)
- path-to-regexp 예약문자 `()[]?+!` 이스케이프 필요 (우리 라우트엔 해당 없음)
- async 에러 자동 forward (wrapAsync 무영향)

## 7개 카테고리

1. **목표(Why)**: 잠복 위험(express 4 + `express>path-to-regexp 0.1.12` override) 제거. express 5 네이티브 path-to-regexp 8.x로 정렬. 성공 = 빌드/테스트/런타임 라우팅 정상, override 삭제
2. **사용자(Who)**: API 서버 운영자 + web-ui SPA 사용자(catch-all fallback 의존)
3. **범위(What)**:
   - 포함: `express` 4.21.2 → `^5.1.0`, `app.get('*')` → `/{*splat}`, 루트 `express>path-to-regexp` override 삭제
   - 제외: 라우트 구조 변경, 에러 핸들링 리팩터(불필요), 다른 의존성 업그레이드
4. **제약(Constraints)**: 기존 라우트 동작·응답 형식 보존. web-ui SPA fallback이 모든 비-API 경로에서 index.html 서빙 유지. `@types/express ^5` 이미 존재
5. **우선순위(Priority)**: P1. 잠복 위험 제거이나 현재 정상 작동 중
6. **리스크(Risk)**:
   - **SPA fallback 회귀**: `/{*splat}`가 `/api/*` 401 케이스나 정적파일과 충돌? → `express.static`·`/api` 라우트가 먼저 등록되어 fallback은 마지막 → 순서상 안전. 검증 필요
   - path-to-regexp 8.x override 제거가 다른 패키지(hono 등 `>=8.4.0`)에 영향? → 루트 `path-to-regexp: >=8.4.0` 유지, express 전용 핀만 제거 → 무영향
   - 배포 회귀: 지난 크래시 재현 방지 → 빌드 후 실제 라우팅 스모크 테스트
7. **검증(Verify)**: DoD = ① build tsc clean(이미 v5 타입) ② test 전체 pass ③ `app.get('*')` 잔존 0 grep ④ override 삭제 확인 ⑤ 로컬 서버 기동 + `/health`·`/api/projects`·임의 SPA 경로 응답 스모크 ⑥ 3중 리뷰

## 미해결 이슈

- express 5.1.x 정확 버전 → 플랜에서 `^5.1.0` 최신 stable 사용
- 로컬 런타임 스모크 테스트 자동화 여부 → 수동 curl로 충분(단일 fallback 라우트)

## 종료 조건

방향 확정("express 5 업그레이드"). 플랜 진행.
