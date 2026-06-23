# APS-5-13 코드 리뷰 — 개선 ③ 서버측 독립 검증 (CI 게이트)

- **분류**: 3중 검증 (신규 인프라 + 권한/게이트) — Claude 3중 대체안 적용
- **리뷰어**: `code-reviewer`(품질) + `security-reviewer`(보안) + `critic` adversarial(적대적) — 작성자(executor)와 분리, 병렬 dispatch
- **작성자**: executor-high(opus) / self-healing executor-high(opus)
- **승인 호출자**: 메인 오케스트레이터 (self-approval 회피)
- **일자**: 2026-06-23

## 변경 요약
서버측 CI 독립 검증 게이트. enrolled 프로젝트(`CI_GATE_PROJECTS`, default 빈값)의 done 전환 시 연결 PR head SHA의 CI 상태가 `success`가 아니면 fail-closed 차단. **default-OFF 출하 — 회귀 0.**
- `github-service.ts`: `getOctokit` 10s timeout, `aggregateCiStatus`(UNION, 빈소스=중립), `getCommitCiStatus`(paginate), `getCiStatusForPrUrl`(PR-URL 파생 owner/repo)
- `workflow-service.ts`: approveReview 게이트(fail-closed, audit-before-throw, success allow-list), `shouldEnforceCiGate`, `resolveCiStatus`, API_KEY 필수화
- `api-server.ts:37` 시드 정정, `package.json` biome lint 스크립트, `.github/workflows/verify.yml`(신규), `ci-gate-guard.sh`(신규 hook)
- 테스트: `ci-gate.test.ts` + `done-chokepoint.test.ts` (총 **217 passed**, 신규 34)

## 검증 (Iron Law — 메인 오케스트레이터 직접 실행)
| 항목 | 결과 |
|------|------|
| build (`pnpm -r build`) | PASS (양 패키지 Done) |
| lint (`biome check src`) | PASS (47 files, no errors) |
| typecheck (`tsc --noEmit`) | PASS (EXIT 0) |
| unit (`vitest`) | PASS (**217 / 9 files**) |
| 회귀 0 불변식 | PASS (CI_GATE_PROJECTS 미설정 → CI red여도 done 통과, GitHubService 미호출) |
| `pnpm audit --prod` | No known vulnerabilities |

## 3중 리뷰 판정 (라운드 1)
- **1차 code-reviewer**: APPROVED (CRIT 0/MAJOR 0/MINOR 3/SUG 4). 스펙 전수 통과(CRITICAL-1·MAJOR-1~4·gap-1/2/3 해소), fail-closed 규율 우수, 단일 done 게이트 지점 확인.
- **2차 security-reviewer**: CHANGES_REQUESTED (MAJOR 1/MINOR 3/SUG 2). MAJOR-1 = 게이트 chokepoint 심층방어 + API_KEY 전제. → self-healing.
- **3차 critic adversarial**: APPROVED (MINOR 3). 회귀 0·fail-closed를 깨려 시도했으나 **둘 다 진짜**로 입증(견고함 확인).

## Self-healing 라운드 (11건 수정)
보안 MAJOR-1 + fail-closed 하드닝 일괄 수정:
1. done chokepoint 불변식 — `done-chokepoint.test.ts` 회귀 테스트 + bypassGuard 단일경로 단언 + 주석
2. enrolled 시 API_KEY 미설정 → fail-closed throw
3. 게이트 최종 분기 `if (ci.state !== 'success') throw` 화이트리스트
4. aggregateCiStatus unknown combined-state → 보수적 pending
5. check-runs `octokit.paginate` (100+ 누락 방지)
6. getPrStatus 에러 `sanitizeErrorMessage` 마스킹
7. verify.yml actions SHA 핀 + `permissions: contents: read`
8. hook deny-list → allow-list({pass,skipping}만 통과)
+ 테스트 env `delete`, epic_id:null 폴백 테스트, union count 주석

## 재리뷰 (라운드 2)
- **security-reviewer 재리뷰**: **APPROVED** (CRIT 0/MAJOR 0/MINOR 0/SUG 0). 직전 5개 발견 전부 코드·테스트로 해소 확인, 수정이 default-OFF·error 처리·hook 정상경로에 회귀 미생성, pnpm audit clean.

## 최종 판정: APPROVED (3중 통과)
- code-reviewer + security-reviewer(재리뷰) + critic adversarial 모두 APPROVED. CRITICAL/MAJOR 0.
- 회귀 0 불변식 + fail-closed가 적대적 검증으로 입증됨.

## 출하 조건 / 캐비엇
- **default-OFF 출하**: `CI_GATE_PROJECTS` 미설정 → approveReview 기존 동작 100% 보존. **enable(=APS 추가)은 사용자 명시 단계** — enable 시 "enrolled 프로젝트의 모든 done이 CI-green 연결 PR + API_KEY 필요(fast-track 포함)" 트레이드오프 확인 필요.
- **캐비엇(비차단)**: `verify.yml` actions SHA 값이 샌드박스 네트워크 차단으로 태그와 대조 미검증. push 전 `gh api repos/<action>/git/refs/tags/<tag>`로 SHA 확인 권장. verify.yml은 default-OFF 게이트 로직과 무관하므로 ticket done 차단 사유 아님.
