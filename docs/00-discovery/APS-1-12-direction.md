# APS-1-12 Discovery — remote-client x-api-key 인증 완성

- **분류**: 🔴 보안 영역 (인증) → 3중 검증. fast-track 차단
- **성격**: 신규 도입 아님 — APS-5-9에서 `auth.ts`(서버 옵트인 검증)가 이미 존재. 빠진 클라이언트 키 전송 + 양쪽 env 설정을 **완성**
- **방향 확정**: 사용자 명시 선택("인증 완성 (보안)", 2026-06-21)

## 현황 (코드 근거)

- `middleware/auth.ts`: `API_KEY` 미설정 시 `next()` skip(옵트인), 설정 시 `x-api-key` 또는 `Bearer`로 검증. **서버는 준비됨**
- `remote-client.ts`: `get/post/patch/del` 4개 헬퍼가 인증 헤더 **없이** `fetch` 호출. `API_URL` 설정 시 원격 모드(`isRemoteMode`)
- Render `render.yaml`: `API_KEY` **미등록** (Blueprint sync로 제거된 이력 → "Server misconfigured" 사고 원인). 현재 사실상 무인증 공개 URL

## 7개 카테고리 (auto-fill, 사용자 방향 확정 반영)

1. **목표(Why)**: 비공개 Render URL의 ai-pm REST API를 무인증 노출 상태에서 벗어나 키 기반 인증으로 보호. 성공 기준 = API_KEY 설정 시 키 없는 요청 401, 키 있는 클라이언트 정상 동작
2. **사용자(Who)**: 단일 운영자(로컬 MCP 클라이언트 = stdio 프록시). 페인포인트 = 현재 누구나 URL만 알면 DB 변조 가능
3. **범위(What)**:
   - 포함: `remote-client.ts`가 `API_KEY` env 있으면 모든 요청에 `x-api-key` 헤더 전송. 순수 헬퍼 `buildAuthHeaders` 추출 + 단위 테스트
   - 포함: env 설정 가이드(로컬 + Render) 및 안전 활성화 순서
   - 제외: OAuth/JWT/다중 키/키 로테이션(YAGNI — 단일 운영자). Bearer 토큰 발급 체계 미도입
4. **제약(Constraints)**: 기존 `fetch` 기반 유지(외부 의존성 추가 금지). 하위호환 필수 — `API_KEY` 미설정 시 헤더 없이 기존 동작 byte-identical. 키는 코드/로그 노출 금지(`_security-base.ts` maskApiKey 활용 가능)
5. **우선순위(Priority)**: P1(중요). 보안 강화이나 비공개 URL이라 즉시 P0는 아님
6. **리스크(Risk)**:
   - **배포 순서 위험(핵심)**: 서버 `API_KEY`를 클라이언트보다 먼저 설정하면 모든 MCP 호출 401 → 운영 마비. 서버는 자기 `API_KEY` 설정 시에만 enforce, 클라이언트는 자기 `API_KEY` 설정 시에만 전송 → **클라이언트 키 선설정(서버는 무시) → 서버 키 설정** 순서가 fail-safe
   - 키 불일치 시 401 → 명확한 에러 메시지 필요
   - 키 평문 보관(env) — 단일 운영자 환경 허용 범위
7. **검증(Verify)**: DoD = ① `buildAuthHeaders` 단위 테스트(키 유/무) ② build/lint/test pass ③ 3중 리뷰(code-reviewer+security-reviewer+critic) ④ 양쪽 env 설정 후 키 없는 curl 401 / 키 있는 호출 200 수동 확인. 활성화 전까지는 코드만 머지(무인증 상태 불변)

## 미해결 이슈

- 로컬 클라이언트 env 주입 위치: `~/.zshrc` vs MCP 설정 `env` 블록 → 플랜에서 권장안 제시(MCP 설정 권장: 프로세스 격리)
- Render `API_KEY` 재등록 시 Blueprint sync 재제거 방지 → `render.yaml`에 `sync: false`로 명시 검토

## 종료 조건

사용자 방향 확정 완료("인증 완성"). 플랜 단계 진행.
