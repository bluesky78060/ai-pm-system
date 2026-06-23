# APS-2-8 코드 리뷰 — 컨텍스트 JIT 로딩

- **티켓**: APS-2-8 (하네스 개선 ① 컨텍스트 JIT 로딩)
- **분류**: 1중 검증 (정책/문서 변경, fast-track)
- **리뷰어**: `code-reviewer` 에이전트 (작성자와 분리된 독립 패스)
- **작성자**: 메인 오케스트레이터 (self-approval 회피 — 리뷰 판정은 별도 에이전트가 수행)
- **일자**: 2026-06-23

## 변경 요약

매 세션 항상 로딩되던 `.claude/rules/*.md` 규칙 중 상황별 6종에 네이티브 `paths:` frontmatter를 추가해 조건부(JIT) 로딩으로 전환. CLAUDE.md 라우터 표에 "로딩" 컬럼 + JIT 안내 문단 추가.

- **항상 로딩 유지(안전 핵심)**: `prohibitions.md`(44) · `continuous-execution.md`(87) · `fast-track.md`(103) = **234줄**
- **JIT 전환(8종)**: `code-review`, `discovery-and-plan`, `dev-tips`, `deploy-automation`, `omc-skills-integration`, `superpowers-integration` (신규) + `agent-mapping`, `workflow-steps` (기존)
- **효과**: 항상 로딩 701줄 → 234줄 (**67% 절감**)

## 검증 (Iron Law)

| 항목 | 명령 | 결과 |
|------|------|------|
| build | `pnpm -r build` | PASS (mcp-server·web-ui 둘 다 Done) |
| lint | `npx tsc --noEmit` (eslint 부재 → tsc 정적 타입체크) | PASS (EXIT 0, 타입 에러 0) |
| unit | `pnpm --filter @ai-pm/mcp-server test` | PASS (7 files / 183 tests) |
| YAML | frontmatter 8종 정식 파싱 | ALL_OK |

## 리뷰 판정

```
🔴 CRITICAL: 0건
🟠 MAJOR: 0건
🟡 MINOR: 3건
🔵 SUGGESTION: 4건
→ 판정: APPROVED
```

### MINOR (모두 하드게이트가 보전 — 비차단)
1. `discovery-and-plan.md` paths의 선행-결정 공백 — Discovery 필요성 판단이 `docs/00-discovery/` 파일 생성 전에 일어날 수 있으나, 첫 Write 시 매칭 + `plan-review-guard.sh` 하드게이트가 보전.
2. `code-review.md` JIT 트리거(`packages/**`)와 분류 결정 시점 불일치 — docs 전용 fast-track의 approve_review 시 미로딩 가능하나 `codex-review-guard.sh`가 보전.
3. `omc-skills-integration.md`의 `.omc/**`는 gitignored 저빈도 경로 — 보조 규칙이라 미로딩 리스크 낮음.

### SUGGESTION
1. CLAUDE.md에 "티켓 발행 직후 Discovery 분류 판단 시 discovery-and-plan.md 먼저 Read" 명시 (권장).
2. `code-review.md` paths에 `docs/02-review/**` 추가 고려 (선택).
3. 라우터 "로딩" 컬럼에 code-review가 사실상 상시 로딩에 가깝다는 주석 (친절).
4. **`paths:`의 네이티브 동작 한계를 CLAUDE.md에 1줄 명시** (가장 권장) → **반영 완료**: CLAUDE.md JIT 안내에 메커니즘 검증 문구 추가.

## 안전성/회귀 핵심 결론

- 안전 핵심 3종(금지사항·연속실행·fast-track)이 **올바르게 항상 로딩 유지**. JIT로 잘못 빠진 안전 규칙 **없음**.
- 4개 하드게이트 훅은 `jq` + `docs/` 파일시스템 검사만 사용 → 룰 로딩 상태와 **완전 직교**. JIT 전환이 하드게이트를 약화시킬 경로 없음.

## 후속 (별도 티켓 후보)
- **STRICT lint ↔ eslint 부재 정합**: STRICT 모드가 `lint` 결과를 요구하나 프로젝트에 eslint 스크립트 없음. 현재 `tsc --noEmit`로 충족. lint 스크립트 정식화 또는 STRICT 검증 로직에 tsc 허용 명시 필요.

**최종**: APPROVED — 차단 사유 없음. SUG-4 반영 완료.
