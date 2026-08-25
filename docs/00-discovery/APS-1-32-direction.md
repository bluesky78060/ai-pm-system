# APS-1-32 Discovery — `.env.test`가 기존 `DATABASE_URL`을 덮지 못함

**티켓**: APS-1-32 (priority 1, P0) / **에픽**: MCP 서버 Core / **작성**: 2026-08-24
**분류**: DB 데이터 무결성 + 사고 재발 경로 → **3중 검증**. fast-track 금지
**Discovery 방식**: 자동 채움. 결함과 수정이 모두 단일하고 트레이드오프가 갈리지 않는다.
방향이 갈리는 지점은 "어디까지 고칠 것인가" 하나이며, 아래 §3에서 범위로 확정한다.

## 1. 목표 (Why)

2026-05-18 20:42 KST production Neon DB wipe 사고의 회고(APS-2-7 → APS-1-7)가
"테스트 격리 완료"로 종결됐으나, **격리의 본체가 실제로는 동작하지 않는다.**

`packages/mcp-server/vitest.config.ts:9`
```ts
loadDotenv({ path: resolve(__dirname, '../../.env.test') });
```

dotenv 17.4.2의 `config()`는 기본값이 `override: false`다. `process.env`에 이미 있는 키는
건드리지 않는다. 실측:

```
$ DATABASE_URL="postgresql://…@ep-old-haze-aol2r7dt…/neondb" node -e "config({path:'.env.test'}); …"
◇ injected env (0) from ../../.env.test
덮어썼는가: NO — .env.test 무시됨
프로덕션 compute를 가리키는가: true
```

즉 개발자 셸에 `DATABASE_URL`이 export돼 있으면 `pnpm test`가 그 URL에 붙는다.
**사고와 정확히 같은 경로다.**

## 2. 사용자 (Who)

- **로컬 개발자** — 유일한 위험 대상이자, 사고가 실제로 발생했던 환경
- CI는 영향 없음: `verify.yml`에 `env:` 블록이 없어 러너 프로세스에 `DATABASE_URL`이
  미설정이므로 dotenv 주입이 성공한다. 이 사실이 위험을 **가려왔다** —
  CI가 계속 초록이라 아무도 로컬 경로를 의심하지 않았다

## 3. 범위 (What)

### 포함
1. `vitest.config.ts`의 `loadDotenv`에 `override: true` 추가
2. 사실과 반대로 적힌 주석 정정 — `context-service.test.ts:4-7`의
   *"vitest.config.ts now loads .env.test which **overrides** DATABASE_URL"*.
   **이 주석이 결함보다 위험하다.** 코드는 고치면 되지만, 틀린 주석은 다음 사람에게
   "격리는 2중이다"라고 계속 거짓말한다. `services.test.ts`의 대응 주석도 함께 점검
3. 변이 검증 — 수정 전에는 프로덕션을 가리키고 수정 후에는 test 브랜치를 가리키는 것을
   **실제로 실행해 보인다**

### 제외
- `PROD_COMPUTE_HOSTS`를 deny-list → allow-list로 뒤집는 것 → **APS-1-25**
- pre-commit 훅 버전 관리 편입 → **APS-1-17 계열**
- 테스트 flaky(TOCTOU) → **APS-1-19**

경계를 이렇게 긋는 이유: 이 셋은 각각 독립적으로 검증 가능하고, 한 티켓에 묶으면
어느 방어선이 실제로 동작하는지 개별 확인이 흐려진다. 사고 재발 방지 장치는
**하나씩 실패를 시연해 가며** 넣어야 한다.

## 4. 제약

- **STRICT 모드**: APS는 `STRICT_SUBMIT_TEST_PROJECTS` 대상. `submit_test`에
  build + lint + unit 세 타입 모두 `pass` 필요
- **테스트가 flaky하다** (APS-1-19). `pnpm -r test` 1회 통과로는 부족하며,
  실패 시 본 변경 때문인지 TOCTOU 때문인지 구분해야 한다
- **변이 검증이 위험을 다룬다**: 검증하려면 셸에 프로덕션 URL을 넣고 테스트를 돌려야 한다.
  **실제 프로덕션 DB에 쓰기가 발생해서는 절대 안 된다.** 가짜 자격증명을 쓰거나,
  가드가 던지는 것만 확인하고 쿼리 단계까지 가지 않도록 설계한다
- `.env.test`는 gitignored라 CI에서 재현 불가. 로컬 증거만 남는다

## 5. 우선순위

1. **P0** `override: true` — 한 줄, 사고 경로 차단
2. **P0** 거짓 주석 정정 — 코드 수정과 분리 불가. 틀린 주석을 남기면 다음 사람이 또 속는다
3. **P1** 변이 검증 — 이것 없이는 "고쳤다"는 주장이 근거 없음

## 6. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| **변이 검증 중 실제 프로덕션 접속** | 치명 | 가짜 자격증명 사용. 가드 throw 지점까지만 확인하고 쿼리 미실행 |
| `override: true`가 CI 동작을 바꿈 | 낮음 | CI는 `DATABASE_URL` 미설정이라 override 여부와 무관하게 동일 |
| `override: true`가 다른 env 키를 의도치 않게 덮음 | 낮음 | `.env.test`는 `DATABASE_URL` 한 줄만 담는다. 파일 내용 확인 후 진행 |
| flaky 테스트로 회귀 판정이 흐려짐 | 중간 | 연속 3회 실행. 실패 시 APS-1-19의 duplicate key 패턴인지 대조 |
| 고쳤다고 믿었는데 다른 경로가 또 있음 | 중간 | dotenv 로드 지점이 `vitest.config.ts` 하나뿐인지 전수 확인 |

## 7. 검증

- **변이 검증(핵심)**: 셸에 프로덕션 호스트 URL을 넣고
  - 수정 전 → `injected env (0)`, `process.env.DATABASE_URL`이 프로덕션을 가리킴
  - 수정 후 → `injected env (1)`, test 브랜치를 가리킴
  두 상태를 모두 실행 출력으로 남긴다
- `pnpm -r build` / `pnpm -r lint` / `pnpm -r test` 회귀 없음 (테스트는 3회)
- dotenv 로드 지점 전수 확인 (`grep -rn "dotenv\|loadDotenv"`)
- 3중 검증: code-reviewer + codex 독립 리뷰 + 적대적 검증

## 방향 확정

결함·수정·검증이 모두 단일하고 대안이 없다. 사용자 결정이 필요한 항목 없음.
유일한 판단 지점이었던 "어디까지 고칠 것인가"는 §3에서 인접 3개 티켓과의 경계로 확정했다.
