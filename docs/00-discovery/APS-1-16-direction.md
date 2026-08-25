# APS-1-16 Discovery — 의존성 CVE 정리

**티켓**: APS-1-16 / **에픽**: MCP 서버 Core / **작성**: 2026-08-24
**분류**: 공급망 보안 → 3중 검증
**Discovery 방식**: 자동 채움. 취약 버전 → 패치 버전이라는 방향이 자명하여 사용자 문답 없이 진행
(`.claude/rules/continuous-execution.md` 원칙 3 예외 2 단서: "fast-track/자동 채움 가능한 케이스는 제외").

## 1. 목표 (Why)

`pnpm audit --audit-level=high`가 critical 1건 + high 16건을 보고한다. 이 중 CRITICAL은
`vitest@3.2.4`로, 저장소의 **직접 devDependency**다. 테스트 하네스가 취약하다는 것은
CI에서 실행되는 코드 자체가 신뢰 경계 밖이라는 뜻이므로 우선 처리한다.

APS-1-7 항목 #8이 2026-05-19에 지적한 원래 6건(hono, @hono/node-server,
express-rate-limit, path-to-regexp×2, picomatch)은 이미 `pnpm.overrides`로 처리되어
있다. 본 티켓은 그 이후 3개월간 재발한 신규 건을 정리하고, **부족하게 고정된 기존
override 1건(`fast-uri: >=3.1.2`, 실제 필요 `>=3.1.5`)을 정정**한다.

## 2. 사용자 (Who)

- 1차: 저장소 유지보수자(단독). 로컬 `pnpm test`/`pnpm build` 및 GitHub Actions `verify.yml`
- 2차: Render 배포 런타임. 단, 취약 항목 대부분이 devDependency 경로라 프로덕션 번들 영향은 제한적

## 3. 범위 (What)

### 포함
- `package.json`(root) `pnpm.overrides` 갱신/추가
- `packages/mcp-server/package.json`, `packages/web-ui/package.json`의 직접 의존성 범위 상향
- `pnpm-lock.yaml` 재생성
- `pnpm audit --audit-level=high` 0건 검증
- `pnpm -r build` / `pnpm lint` / `pnpm -r test` 회귀 없음 검증

### 제외
- moderate/low 등급 23건 (별도 후속). 단, **증가하지 않았음은 검증한다**
- `@modelcontextprotocol/sdk` 자체 메이저 업그레이드 (ajv/express-rate-limit 조상)

### 범위 개정 (2026-08-24, critic 1차 리뷰 반영)
당초 "메이저 업그레이드 전면 제외"였으나 다음 2건을 **명시적으로 포함**하도록 개정한다.

1. **`@vitejs/plugin-react` 4.7.0 → 6.x**: 저장소는 이미 vite 8.0.13에서 동작 중인데
   plugin-react 4.7.0의 peer는 `^4 || ^5 || ^6 || ^7`로 **vite 8을 허용하지 않는다**.
   즉 peer 불충족이 이미 잠복해 있다. vite를 8.0.16+로 올리는 본 티켓이 이 지점을
   건드리므로, 잠복 상태를 그대로 남기지 않고 정리한다. plugin-react 6.1.0의 peer는
   `vite: ^8.0.0`이다.
2. **web-ui `vite` 선언 `^6.4.2` → `^8.x`**: 선언과 실제(8.0.13)가 이미 어긋나 있다.
   이는 새 메이저로의 이동이 아니라 **이미 벌어진 사실을 선언에 반영**하는 것이다.

`@tailwindcss/vite`(4.2.1, peer ≤^7)도 동일하게 불충족이나, 선언이 `^4.0.0`이라
lockfile 재해석만으로 4.3.3(peer `^8` 포함)에 도달하므로 별도 변경이 불필요하다.

## 4. 제약

- **STRICT 모드 프로젝트**: APS는 `STRICT_SUBMIT_TEST_PROJECTS`에 포함되어 있어
  `submit_test`에 build + lint + unit 세 타입 모두 `status: pass`로 제출해야 한다
- ~~**DB 접속 필요 테스트**: `.env.test` 부재로 BLOCKED 가능~~ → **해소됨 (2026-08-24)**.
  Neon `ci-test` 브랜치(`br-raspy-thunder-ao2nzazc`) 연결로 mcp-server 217 tests 통과 확인
- **override 부작용**: pnpm overrides는 전이 의존성을 강제 고정하므로, 상위 패키지가
  요구하는 범위를 벗어나면 런타임 오류 가능. peer 경고를 반드시 확인
- 기존 override `vite: >=7.3.2`가 선언 `^6.4.2`를 8.x로 끌어올린 상태 — 되돌리지 않고
  **`^8.2.2`로 전진**하며 선언과 override를 일치시킨다
- **`>=` override는 최신 메이저를 끌어온다** (rev.1 반려 사유). 모든 override는 `^` 바운드,
  앵커는 **부모가 선언한 메이저**로 잡는다. 현재 해석된 메이저가 이미 위반이면 그것을
  기준으로 삼으면 안 된다 (protobufjs·@hono/node-server가 해당)
- **`pnpm install`은 재해석하지 않는다** (rev.2 반려 사유). `pnpm update -r`가 필요하다

## 5. 우선순위

1. **P0** vitest 3.2.4 → ≥3.2.6 (CRITICAL, 직접 devDep)
2. **P1** fast-uri override 정정 (`>=3.1.2` → `>=3.1.5`) — 잘못 고정된 기존 방어선
3. **P1** react-router 7.18.0 → ≥7.18.2 (직접 dep, 런타임 경로)
4. **P2** vite / postcss / nanoid / undici / ip-address / brace-expansion (전이, 대부분 dev 경로)

## 6. 리스크

| 리스크 | 영향 | 완화 |
|---|---|---|
| vitest 마이너 업그레이드로 기존 테스트 깨짐 | 높음 | 업그레이드 후 전체 test 실행, 실패 시 개별 분석 |
| vite 8.0.16 업그레이드로 web-ui 빌드 깨짐 | 중간 | `pnpm -r build` 확인 |
| override 과고정으로 peer 충돌 | 중간 | `pnpm update -r --strict-peer-dependencies`로 **해석 단계에서** 검사. pnpm은 기본값에서 peer 불충족을 조용히 넘기므로 로그 부재를 근거로 삼지 않는다 |
| 프로덕션 경로 메이저 원복(protobufjs·@hono/node-server)이 런타임을 깨뜨림 | 높음 | 빌드는 이들을 실행하지 않으므로 별도 스모크 테스트(V10) 필수 |
| plugin-react 6.x가 web-ui 빌드를 깨뜨림 | 중간 | V3에서 실제 빌드로 확인. 실패 시 해당 변경만 되돌림 |
| react-router 7.18.2 라우팅 동작 변경 | 낮음 | 패치 릴리스라 breaking 없음. web-ui 테스트로 확인 |

## 7. 검증

핵심 종료 조건은 `pnpm audit --audit-level=high` = 0이다.
다만 rev.1·rev.2 반려를 거치며 이것만으로는 **불충분**함이 드러났다 —
audit을 green으로 만들면서 심사받지 않은 메이저 업그레이드를 끼워 넣을 수 있기 때문이다.
따라서 검증은 V1~V10 10개 항목으로 확장했다. 상세는 플랜 문서를 따른다.

요약: audit high/critical 0 · moderate/low 미증가 · build/lint/test 회귀 없음 ·
peer 실검사(실패 시연 선행) · 메이저 변경 화이트리스트 대조 · Node 20 engines 대조 ·
lockfile diff 전수 리뷰 · **프로덕션 경로 스모크 테스트**.

3중 검증: code-reviewer(Opus) + codex 독립 diff 리뷰 + 적대적 검증.

## 방향 확정

취약 버전 → 패치 버전이라는 단일 해법만 존재하며 트레이드오프가 갈리지 않으므로
자동 확정. 사용자 결정이 필요한 항목 없음.
