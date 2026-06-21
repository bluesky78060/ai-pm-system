# APS-1-12 코드 리뷰 — remote-client x-api-key 인증 완성

- **검증 라운드**: 🔴 3중 (보안 영역 = 인증). code-reviewer + security-reviewer + critic adversarial **병렬 dispatch** (codex 미가용 → Claude 대체 3중, code-review.md 규정)
- **리뷰어**: 전원 작성자(executor-high)와 분리된 fresh subagent

## 검증 증거 (Iron Law — submit_test + self-healing 재검증 실측)

- STRICT submit_test: build tsc clean · lint 0 · test 171 passed → review 전환 (overall pass)
- self-healing 후 재검증: build pass · `pnpm lint` 88 files 0 errors · **test 183 passed** (remote-client.test.ts 19→31, +12)

## 3중 검증 결과 (전원 APPROVED, CRITICAL/MAJOR 0)

| 리뷰어 | 판정 | C/M/Mi/S |
|--------|------|----------|
| code-reviewer (품질·패턴) | APPROVED | 0 / 0 / 2 / 3 |
| security-reviewer (OWASP·시크릿·인증) | APPROVED | 0 / 0 / 1 / 3 |
| critic (adversarial 3차) | APPROVED | 0 / 0 / 3 / 2 |

### 핵심 검증 (3인 공통 확인)
- **라운드1 outage 벡터 구조적 차단**: `/health`(`api-server.ts:91`)가 `apiKeyAuth`(`:96`) 이전 마운트 → healthCheck/keep-alive 무인증 200. 서버 `API_KEY` enforce해도 배포 안 깨짐
- **하위호환 byte-identical**: `API_KEY` 미설정 시 `{}` spread no-op. get/del wire no-op을 fetch mock 2번째 인자 headers 실측 단언
- **키 노출 0**: authWarnings/console.warn/에러 경로 어디에도 키값 미포함(전용 테스트). CRLF 헤더 인젝션 undici 런타임 차단 확인
- **`/health` 민감정보 없음**: `{status:'ok'}`만 반환 → 무인증화가 새 노출 안 만듦 (오히려 보안 개선)
- **executor 보정 타당**: `rawSet = apiKey!==undefined`로 `''`/`' '` 경고, `undefined` 무경고 — silent-fail 더 정확히 방지

## Self-healing 1라운드 (MAJOR 0 → 사용자 개입 없이 수렴 MINOR 처리)

2 리뷰어 수렴 MINOR(경고 정규식 host-경계 우회) + 테스트 품질 nit 처리:
1. **http 경고 정규식 → `new URL().hostname` 파싱** (`isHttpInsecure`): `localhost.evil.com`(host=localhost.evil.com)·`localhost@evil.com`(host=evil.com) 이제 정확히 경고. `localhost`/`127.0.0.1`/`[::1]` 면제. 파싱 실패 → 무경고
2. **once-guard 테스트**: `emitAuthWarningsOnce` export + `resetAuthWarningGuard()` 추가, 2회 호출 → console.warn 1회 단언
3. **dead `API_URL` stub 정리**: `vi.resetModules()`+동적 import로 stub 유효화 + URL host 단언
4. **render.yaml 운영 문서 2줄**: trim/공백 401 함정, web-ui SPA 401 경고

재검증: build/lint/test 183 passed 전부 green.

## 미처리(후속 티켓 권장, 비차단)

- 🔵 `middleware/auth.ts:14` 비-constant-time 비교(`!==`) → `crypto.timingSafeEqual` (이 diff 범위 외, 악화 없음)
- 🔵 서버측 `API_KEY=''` empty silent-disable (클라 경고와 대칭되는 서버 가드 부재)
- 🔵 클라 trim ↔ 서버 raw 비교 비대칭 → render.yaml 문서로 완화(코드 수정은 보안 미들웨어 확대 회피)

## 최종 판정: 승인

3중 전원 APPROVED, CRITICAL/MAJOR 0. 라운드1 배포 outage 벡터를 구조적으로 차단한 핵심 변경. self-healing으로 수렴 보안 MINOR까지 종결, 재검증 183 passed. 활성화(양쪽 env 설정)는 운영 핸드오프 — 코드 머지는 무인증 동작 불변(안전).
