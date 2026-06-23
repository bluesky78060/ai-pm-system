# APS-5-14 코드 리뷰 — verify.yml pnpm 버전 충돌 수정

- **분류**: 1중 검증 (fast-track, CI 설정 1줄)
- **리뷰어**: `code-reviewer` (작성자와 분리)
- **일자**: 2026-06-23

## 변경
`.github/workflows/verify.yml`: `pnpm/action-setup`의 `version: 9` 키 제거 → `package.json` `packageManager: pnpm@10.30.3`에서 자동 해석. 설명 주석 추가.

## 배경
APS-5-13 verify.yml 첫 GitHub Actions run이 `ERR_PNPM_BAD_PM_VERSION`(version 9 ↔ packageManager 10.30.3 충돌)으로 9초만에 실패. (참고: 보안 SUG-5의 actions SHA 핀은 정확했음 — checkout/action-setup 로딩 통과.)

## 검증
- build: PASS (Done) / lint(biome): PASS (47 files) / unit: PASS (217)
- verify.yml 구조: `version: 9` 0건, 탭 없음(space), step 정합

## 판정
```
🔴 CRITICAL: 0  🟠 MAJOR: 0  🟡 MINOR: 0  🔵 SUGGESTION: 1
→ APPROVED
```
충돌 해소 정확(packageManager 단일소스 일원화 → 버전 드리프트 구조적 제거), YAML 유효(dangling mapping 없음), 타 step 부작용 없음. 주석에 에러코드·원인 명시(self-documenting).

SUGGESTION(비차단): Dependabot/Renovate가 packageManager 변경 시 lockfile 정합 검증하도록 — 범위 밖.

**최종: APPROVED.** 실제 green 여부는 push 후 GitHub run으로 확정.
