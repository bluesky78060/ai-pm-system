# APS-1-16 플랜 리뷰 기록

**티켓**: APS-1-16 (의존성 CVE 정리) / **리뷰어**: critic (Opus, 독립 서브에이전트)
**작성자**: 메인 오케스트레이터 — self-approval 금지 규칙에 따라 리뷰는 전량 별도 레인에서 수행
**라운드**: 최대 3회 (`.claude/rules/discovery-and-plan.md`)

## 요약

| 라운드 | 판정 | 핵심 지적 | 대응 |
|---|---|---|---|
| 1차 | **FAIL** | CRITICAL 1 · MAJOR 4 · MINOR 4 | rev.2 전면 재작성 |
| 2차 | **FAIL** | CRITICAL 1 · MAJOR 4 · MINOR 4 | rev.3 |
| 3차 | **FAIL** | CRITICAL 1 · MAJOR 3 · MINOR 4 | rev.4 |
| — | 사용자 판단 | 3회 반려 = Discovery 회귀 임계점 | **rev.4 진행 승인** |

리뷰가 두 번 연속 FAIL이 났고 **두 번 다 실질적 결함**이었다. 형식적 반려가 아니었다는
점을 기록해 둔다 — 지적 없이 통과했다면 잘못된 변경이 그대로 나갔을 것이다.

---

## 1차 리뷰 (rev.1 대상)

### CRITICAL — pnpm override의 `>=X`는 최신 메이저로 해석된다

rev.1은 전이 CVE 7건을 `">=패치버전"` 형태의 override로 막으려 했다.
리뷰어가 격리 샌드박스에서 재현했고, **메인 오케스트레이터도 독립 재현하여 확정**했다.

| override | rev.1 기대 | 실제 |
|---|---|---|
| `"nanoid": ">=3.3.18"` | 3.3.18 | **6.0.1** |
| `"undici": ">=7.29.0"` | 7.29.0 | **8.10.0** |
| `"fast-uri": ">=3.1.5"` | 3.1.5 | **4.1.3** |
| `"brace-expansion@2": ">=2.1.4"` | 2.1.4 | **5.0.9** |

저장소 내부 증거: 기존 override `"protobufjs": ">=7.6.1"`이 lockfile에서 **8.6.4**로
해석되어 있었다. 메이저 7을 요구했는데 8이 들어와 있었다.

부수 영향으로 CI Node 20에서 깨졌을 것이다 — `nanoid@6.0.1`은 `^22 || ^24 || >=26`,
`undici@8.10.0`은 `>=22.19.0`을 요구한다.

### MAJOR
- **M2** D2-fallback(`@vitest/coverage-v8` 최신화)이 실행 불가. 최신 4.1.11의 vitest peer가
  **정확 일치** 문자열이라 vitest 4로 동반 점프를 강제 → Discovery가 제외한 메이저 업그레이드
- **M3** `@vitejs/plugin-react@4.7.0`의 peer가 `^4||^5||^6||^7`로 **vite 8 미허용**.
  저장소는 이미 vite 8.0.13이므로 peer 불충족이 잠복 중이었음
- **M4** 검증 항목 "install 로그에 peer 경고 없음"은 no-op. pnpm은 기본값에서 peer 불충족을
  **조용히 넘긴다** (현 저장소가 그 상태)
- **M5** CI(Node 20) ↔ 로컬(Node 25.2.1) 드리프트를 플랜이 전혀 다루지 않음

### 반영
rev.2에서 override 접근을 통째로 폐기했다. **override 없는 대조군에서 전이 CVE 6종이
전부 자가 해소**됨을 확인했기 때문이다 — 취약 버전은 부모 범위 제약이 아니라
**낡은 lockfile** 때문에 고착돼 있었다.

---

## 2차 리뷰 (rev.2 대상)

### CRITICAL — `pnpm install`은 재해석하지 않는다

리뷰어가 저장소를 복제해 rev.2를 **그대로 적용하고 실행**했다.

```
pnpm install → audit: {low:3, moderate:15, high:8, critical:0}   ← V1 실패
pnpm update -r → audit: {low:1, moderate:0, high:0, critical:0}  ← 통과
```

`pnpm install`은 specifier나 부모 버전이 바뀐 subtree만 재해석한다.
vite가 바뀐 덕에 postcss·nanoid는 움직였지만 `jsdom@29.1.1`이 그대로라 undici는
7.28.0에 얼어붙었고, ip-address·brace-expansion도 남았다.

rev.2는 D2에 `pnpm update`, 구현 단계 5에 `pnpm install`이라 써서 **내부 모순**이었다.
실행자가 단계를 따르면 high 8건을 만나고, 직관적 복구책(override 재추가)은
곧장 1차의 CRITICAL로 되돌아간다.

### MAJOR — 사실 오류 2건 (둘 다 프로덕션 경로)

메인 오케스트레이터가 직접 재확인했고 **둘 다 리뷰어가 옳았다**.

| 항목 | rev.2 서술 | 실제 |
|---|---|---|
| `@hono/node-server` | "(미설치)" | **2.0.3 설치됨** (lockfile 563행). `@modelcontextprotocol/sdk@1.27.1`이 `^1.19.9` 선언 → 2.0.3은 범위 위반 |
| `protobufjs` 앵커 | `^8.6.4` (현재 해석 메이저) | `@google/genai@1.52.0`이 `^7.5.4` 선언 → 8.6.4는 위반. `^8`로 굳히면 **위반을 추인** |

이 지적의 본질은 rev.2가 세운 "현재 해석된 메이저에 `^`를 건다"는 **규칙 자체가 틀렸다**는
것이다. 현재 메이저가 고치려던 버그의 산물이면 그것을 기준으로 삼을 수 없다.
앵커는 **부모가 선언한 메이저**여야 한다.

- **M3** V6(`--strict-peer-dependencies`)가 여전히 no-op. 이 플래그는 **해석 단계에서만**
  평가되는데, V6는 install 이후에 돌도록 배치돼 있어 "Lockfile is up to date, resolution
  step is skipped"로 항상 통과한다. 한 no-op를 다른 no-op로 교체한 셈
- **M2** `@tailwindcss/vite` 4.3.3 도달 주장이 `pnpm install` 전제에서는 거짓 (4.2.1 잔존)

### 리뷰어가 확인해 준 것 (지적 아님)
- 기존 override 10건의 `^` 전환이 원래 CVE 6건을 되살리지 않음 — path-to-regexp 8.4.2,
  picomatch 4.0.4, qs 6.15.2, ws 8.21.0 전부 유지
- `@vitejs/plugin-react@6.1.0`의 추가 peer 3종은 전부 `optional: true` — 설치 안 깨짐
- vite 선언 `^8.2.2` + override `^8.2.2` 이중 지정은 충돌하지 않음
- M5(CI/Node) 대응은 충분. "CI green을 done 근거로 삼지 않는다"는 명시가 올바른 태도

### 반영 (rev.3)
1. 구현 단계 5 → `pnpm update -r --strict-peer-dependencies` (C1 + M3 동시 해소)
2. protobufjs `^7.6.1`(→7.6.5), @hono/node-server `^1.19.10`(→1.19.17) — **부모 선언 범위로 원복**
3. D3에 "앵커는 부모 선언 메이저" 원칙 명문화 + 위반 2건 표
4. D3-a 신설 — 남길 override를 정하는 규칙 (전부 제거 후 audit → 0이면 제거)
5. V6에 **"불량 상태에서 실제 실패를 먼저 시연"** 절차 추가. 실패를 시연하지 못한 게이트는 게이트가 아니다
6. V7 메이저 변경 화이트리스트 4건 명시
7. V10 신설 — 프로덕션 경로 스모크 테스트. `tsc`는 protobufjs·@hono/node-server를
   실행하지 않으므로 빌드 통과가 증거가 되지 못한다
8. V5 강화 — passed 카운트 + skipped 동일 + 실행 파일 목록 동일
9. `engine-strict`는 **켜지 않기로 결정**하고 이유를 명시. root `engines`가 선언용임을 못박고,
   V8은 기계적 대조 검사로 수행
10. Discovery §4/§6/§7 전면 정합화 (rev.1 잔재 제거)

---

## 3차 리뷰 (rev.3 대상)

**판정 FAIL.** 다만 성격이 1·2차와 다르다 — 리뷰어가 rev.3을 샌드박스에 **그대로 적용해
실행한 결과 목표를 달성**했다(`high 0 / critical 0 / moderate 0 / low 1`, 11개 대상 패키지
전부 의도한 버전). 설계 결론에서는 틀린 곳을 찾지 못했다고 명시했다.
FAIL 사유는 전부 **검증 장치와 명령 문법**이다.

### CRITICAL — 구현 단계 5의 명령이 유효하지 않다

```
$ pnpm update -r --strict-peer-dependencies
 ERROR  Unknown option: 'strict-peer-dependencies'
```

메인 오케스트레이터가 직접 재현 확인했다. `pnpm help update`에 peer 옵션이 없고
`pnpm help install`에만 있다. **install 계열 전용 플래그**다.
플랜이 스스로 "이 단계가 V1의 성패를 가른다"고 적은 명령이 실행조차 되지 않는다.
→ `--config.strict-peer-dependencies=true` 형태로 정정.

### MAJOR

- **M2 — V6의 실패 시연 사례가 실패하지 못한다.** rev.3은 시연 대상으로
  `vite 8.2.2 + @tailwindcss/vite@4.2.1`(peer ≤^7)을 지정했으나, 이 워크스페이스는
  `autoInstallPeers: true`라 pnpm이 **vite를 하나 더 해석해** peer를 만족시킨다.
  불량 조합인데 exit 0이 난다. 플랜 자신의 기준("실패를 시연 못 한 게이트는 게이트가 아니다")에
  스스로 걸린 셈. → 시연 사례를 `@vitejs/plugin-react@6.1.0 + vite@6.4.2`로 교체
  (리뷰어가 실제 `ERR_PNPM_PEER_DEP_ISSUES` 발생을 확인함)
- **M3 — V7 화이트리스트 4건 vs 실제 메이저 변경 10건.**
  누락: `@octokit/openapi-types`·`@octokit/plugin-paginate-rest`·`@octokit/types`·
  `content-type`·`immer`·`lru-cache`·`semver`. 수정 없는 저장소에 `pnpm update -r`만 돌린
  대조군에서도 재현되므로 **rev.3의 편집 탓이 아니라 `pnpm update -r` 자체의 churn**이다.
  → "메이저 변경 0"은 옳은 변경을 막는 기준이므로, V7을
  **"부모 선언 범위를 벗어난 패키지 0"**으로 재정의
- **M4 — D3-a 규칙이 D3를 되돌린다.** override를 전부 지우면 `pnpm audit`은 오히려
  **완전한 0**(low까지 0)을 낸다. 그래서 audit만 기준 삼으면 "전부 제거"가 결론이 되는데,
  그 상태에서 `@hono/node-server`가 **2.1.1**로 되돌아가 SDK 선언 `^1.19.9`를 다시 위반한다.
  D3가 고친 바로 그 위반이다. **`pnpm audit`은 부모 선언 범위 위반을 구조적으로 보지 못한다.**
  → D3-a에 조건 (b) "제거해도 부모 선언 범위 위반이 되살아나지 않을 것" 추가

### 리뷰어가 확인해 준 것 (지적 아님)
- `pnpm update -r` 한 번으로 D1·D3가 **동시에** 반영된다. 순서 의존성 없음
- `protobufjs` 8.6.4 → 7.6.5 원복이 `@google/genai`를 깨뜨리지 않음 —
  실제로 로드하고 `GoogleGenAI` 생성까지 확인. 7.6.5가 선언된 `^7.5.4` 범위이므로
  오히려 **8.6.4가 미검증 상태였다**
- D3 앵커 원칙과 위반 2건 표가 정확. 부모 선언 둘 다 registry 재확인
- `engine-strict`를 켜지 않기로 한 결정과 그 근거 표기가 타당

### 3회 반려 처리 — 사용자 판단

프로젝트 규칙은 3회 반려 시 **Discovery 회귀**를 규정한다.
리뷰어는 "4건 모두 플래그 1줄·시연 사례 교체·기준 재정의·조건절 추가로,
Discovery 수준 질문(범위·방향·의도된 메이저 2건)은 rev.2에서 이미 옳게 정리됐다"며
회귀 불필요를 주장했다.

메인 오케스트레이터가 임의로 판단하지 않고 **사용자에게 보고 후 결정**을 받았다:
- **rev.4로 진행** (Discovery 회귀 없음)
- 부수 변동(메이저 7건 churn)은 **허용하되 명시적으로 검증** —
  V7을 "부모 선언 범위 위반 0"으로 재정의하고, 트레이드오프를 문서에 먼저 명시

### rev.4 반영 내역
1. 단계 5 → `pnpm update -r --config.strict-peer-dependencies=true`
2. V6 시연 사례 → `@vitejs/plugin-react@6.1.0 + vite@6.4.2`
3. V7 → "부모 선언 범위 위반 0"으로 재정의. 의도된 메이저 4건은 참고 표로 격하
4. D3-a → 조건 (b) 추가 + **예상 결과 명시**(8~9건은 죽은 무게, `@hono/node-server`만 필수 존치)
5. §부수 변동 신설 — 38 제거 / 10 추가 / 메이저 7 이동을 의도된 트레이드오프로 선언
6. V10 → cwd를 `packages/mcp-server`로 명시, `require` → `import()`
7. nanoid engines 전체 문자열 표기, hono 예상 해석값 4.13.3 표기, 헤더 rev 표기 정정

---

## 리뷰 3라운드의 성과 (기록)

코드는 아직 한 줄도 바뀌지 않았지만, 리뷰가 **잘못된 변경 네 가지를 사전에 차단**했다.

1. `>=` override로 nanoid를 6.x까지 끌어올려 **CI Node 20을 깨뜨릴 뻔했다**
2. `pnpm install`만 돌려 **high 8건이 남은 채 "완료"로 보고할 뻔했다**
3. `protobufjs`를 `^8`로 굳혀 `@google/genai`의 선언 범위 위반을 **영구화할 뻔했다**
4. D3-a를 문자 그대로 따라 override를 전부 지워 **방금 고친 위반을 되살릴 뻔했다**

네 가지 모두 `pnpm audit`은 green으로 보였을 변경이다.
**종료 조건 하나만 보고 통과시키면 안 된다**는 것이 이 티켓의 교훈이다.
