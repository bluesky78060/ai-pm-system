# APS-1-25 코드 리뷰 — 테스트 DB 가드 deny-list → allow-list

**대상 커밋**: `33a75c2` → `99cb368` → `44e5222`
**분류**: 3중 검증 필수 (보안 — 2026-05-18 production wipe 사고의 방어선)
**결론**: **통과**

---

## 검증 3레인

| 레인 | 수행자 | 결과 |
|---|---|---|
| 1. 품질·정합성 | `code-reviewer` (Claude Opus) | REQUEST CHANGES → 반영 후 해소 |
| 2. 다른 계열 모델 독립 리뷰 | `codex` | MAJOR 1 / MINOR 1 → 반영 |
| 3. 적대적 검증 | `critic` (Opus, 반증 지시) | 1R: CRITICAL 1 + MAJOR 3 → 2R: **우회 미발견** |

세 레인 모두 프로덕션 DB `ep-old-haze-aol2r7dt`에 연결하지 않았다. 모든 실험은 RFC 2606 `.invalid` 도메인과 가짜 자격증명으로만 수행했다.

---

## 1라운드 — CRITICAL 1건, 실행으로 증명됨

적대적 검증이 저장소의 `getPool()`을 **그대로 통과시켜 엉뚱한 호스트로 dial**하는 것을 증명했다.

```
DATABASE_URL          = postgresql:///neondb?hostaddr=<허용호스트>
TEST_DB_ALLOWED_HOSTS = <허용호스트>
PGHOST                = ep-someone-elses-db...neon.invalid

>>> assertTestDatabase: PASSED (no throw) — pool created
>>> pg dial error: ENOTFOUND hostname= ep-someone-elses-db...neon.invalid
```

동작하는 페이로드 3종이 확인됐고, **allow-list와 프로덕션 deny-list가 동시에 무력화**됐다.

### 인과 사슬

1. authority가 비면 `pg-connection-string`이 `config.host = ''`를 낸다
2. pg의 `val()`이 빈 문자열을 falsy로 보아 `PGHOST`(없으면 `localhost`)로 폴백한다
3. 그런데 가드가 `hostaddr`를 후보에 넣어 **배열이 비지 않으므로** `hosts === null` fail-closed 분기가 발화하지 않는다

**보수적으로 넣은 값이 방어를 없앴다.** 그리고 `hostaddr`는 우회를 막는 효과가 0이다 — 실측 결과 pg는 이 값을 연결 대상으로 쓰지 않고 authority를 덮지도 않는다.

### 그 외 1라운드 지적

| 심각도 | 내용 | 상태 |
|---|---|---|
| MAJOR | authority를 percent-decode하지 않아 deny-list 층 무력화 (`%65p-old-haze...` → pg는 `ep-old-haze...`로 연결) | 해소 |
| MAJOR | `socket://` 스킴이 authority를 버리고 pathname을 소켓 경로로 씀 | 해소 |
| MAJOR | 빈 문자열로 정규화되는 `?host=`를 조용히 버림 | 해소 |
| MAJOR | 삭제·이동된 가드를 문서 8곳이 현행으로 안내 | 해소 |
| MINOR | 에러 메시지가 원인을 오진 / CI heredoc unquoted / 실제 인프라 호스트명 커밋 | 해소 |

---

## 근본 수정 — 파서를 근사하지 않는다

두 리뷰 레인이 독립적으로 같은 결론에 도달했다: **소비자와 다른 파서로 신뢰 경계 입력을 검사하면, 두 해석이 갈리는 순간 방어가 무너진다.**

- `effectiveHost()`가 pg가 쓰는 `pg-connection-string.parse()`를 **직접 호출**하고, pg의 `val('host', config)` 폴백 규칙(`config.host || PGHOST || 'localhost'`)을 재현
- `hostaddr` 제거 (우회 방지 효과 0, 오탐 유발, fail-open 초래)
- 스킴 화이트리스트 (`postgres:` / `postgresql:`만)
- `pg-connection-string`을 직접 의존성으로 선언(pg와 동일 범위 `^2.11.0`). phantom dependency 제거이자, **두 사본이 갈리면 근사 문제가 재발**하므로 동일 사본 로드를 테스트로 고정

---

## 2라운드 적대적 검증 — 우회 미발견

29개 페이로드 매트릭스. **가드가 PASS를 낸 모든 입력에서 pg는 allow-list 호스트로 갔다.**

```
baseline allowed          guard=PASS   -> pg dialed: ENOTFOUND:allowed-test.invalid
hostaddr + PGHOST decoy   guard=BLOCK  -> pg dialed: ENOTFOUND:decoy-attacker.invalid
?host= decoy              guard=BLOCK  -> pg dialed: ENOTFOUND:decoy-attacker.invalid
empty auth + PGHOST       guard=BLOCK  -> pg dialed: ENOTFOUND:decoy-attacker.invalid
```

시도하고 막힌 각도: `hostaddr` 3종, percent 인코딩 authority, 대문자 스킴·호스트, `encodeURI` 재작성 트리거, `socket:`·유닉스 경로·중복 `host=`·fragment·백슬래시·IPv6·NUL 바이트, 두 파서 사본 분기, `getPool()` 외 Pool 생성 경로(`new Pool` 1곳·`new Client` 0곳), 부팅 경로 throw.

**오탐 검사**: 현실적 연결 문자열 12종 중 10종 통과. 차단된 2종은 이색적 형식뿐으로, 기존 CI/로컬 설정을 깨뜨리지 않는다.

---

## 변이 검증 — 3개 생존 → 2개 수정, 1개는 tsc가 고정

2라운드가 회귀 스위트 자체를 변이로 검사해 **10개 중 3개가 살아남는 것**을 찾았다. 테스트가 `/APS-1-25 SAFETY/`만 봐서, 방어를 제거해도 다른 층이 대신 차단해 **맞는 이유 없이** 통과했다.

| 변이 | 이전 | 수정 후 |
|---|---|---|
| `effectiveHost` PGHOST 폴백 제거 | KILLED | KILLED |
| `effectiveHost`를 `new URL()` 근사로 되돌림 | KILLED | KILLED |
| 스킴 화이트리스트 제거 | **생존** | **2 failed** |
| 빈 `?host=` fail-closed 제거 | **생존** | **1 failed** |
| `eff === null` fail-closed 제거 | **생존** | 생존 — **`tsc`가 잡음** |
| `normalizeHost` 소문자화 제거 | KILLED | KILLED |
| `normalizeHost` 트레일링 점 제거 삭제 | KILLED | KILLED |
| allow-list 미설정 fail-closed 제거 | KILLED | KILLED |
| deny-list 층 제거 | KILLED | KILLED |
| `?host=` 쿼리 수집 제거 | KILLED | KILLED |

마지막 항목은 `error TS2322: Type 'string | null' is not assignable to type 'string'`로 빌드가 깨진다. `effectiveHost`가 null을 내는 것은 `parse()`가 던질 때뿐이고 그때는 pg도 똑같이 던지므로, 이 줄이 단독으로 막은 우회는 없다. **없는 방어를 있어 보이게 하는 테스트를 만들지 않고**, 무엇이 그 줄을 지키는지 주석에 적었다.

---

## 정직하게 남긴 것

- **빈 `?host=` 차단은 미탐 방어가 아니다.** 초안 주석이 그렇게 적었으나, 실측하면 값이 비면 pg는 authority로 폴백하므로 `effectiveHost()`가 이미 정답을 낸다. 추가 보수성일 뿐이고 오탐 비용도 있다(`postgresql://<허용>/db?host=` 는 pg가 정상 연결하는데 차단된다). 주석을 사실대로 고쳤다.
- **스킴 화이트리스트가 구체적으로 무엇을 막는지 리뷰어는 재현하지 못했다.** `https:`·`redis:` 모두 `parse()`가 authority를 host로 주므로 제거해도 판정이 같았다. 다만 `socket:`는 실증된 우회이므로 화이트리스트를 유지하고 그 케이스를 테스트로 고정했다.
- **`VITEST` 미설정 시 가드는 통째로 비활성이다.** 프로덕션 부팅을 막지 않기 위한 설계이며, codex가 이를 MAJOR로 지적했다. 의도된 정책이나 문서화가 부족했던 것은 사실이라 `.env.test.example`과 `ci-test-isolation.md`에 명시했다.

---

## 분리 발행

**APS-1-37 (P1)** — 인접 범위에서 발견된 별개 보안 결함. `connection.ts`의 `rejectUnauthorized: true`가 `?sslmode=no-verify`로 뒤집히고(pg가 `Object.assign({}, config, parse(connectionString))`로 파싱 결과를 나중에 덮는다), `includes('neon.tech')`가 호스트가 아니라 URL 전체를 본다. `getPool()`이 앱 부팅 경로라 프로덕션 `sslmode` 확인이 선행돼야 하므로 이 티켓에 포함하지 않았다.

---

## 최종 검증 증거

```
tsc                                    무오류
biome check src                        Checked 51 files. No fixes applied.
vitest run                             Test Files 11 passed (11)
                                       Tests 311 passed (311)
```

우회 페이로드 전부 차단·정상 호스트 통과를 `dist` 빌드로 실증했다.

---

## 머지 전 필수 조치

GitHub Actions에 secret **`TEST_DB_ALLOWED_HOSTS`** 등록. 값은 `TEST_DATABASE_URL`의 호스트명과 같아야 한다. 설정하지 않으면 가드가 fail-closed로 CI를 차단한다 — **의도된 동작이다.**
