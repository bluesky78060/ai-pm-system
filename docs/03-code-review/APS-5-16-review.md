# APS-5-16 코드 리뷰 — web-ui biome config 정합 + pnpm -r lint 전환

- **분류**: 1중 검증 (fast-track, config — 동작 보존)
- **리뷰어**: `code-reviewer` (작성자와 분리)
- **일자**: 2026-06-23

## 변경
- 신규: `packages/web-ui/biome.json` (root extends + web-ui 5개 규칙 disable)
- 수정: `.github/workflows/verify.yml` (Lint → `pnpm -r lint`)
- root `biome.json`: 순변경 0 (override 제거→복원 원복, git status 확인)

## 핵심 진단 (reviewer가 재현 검증)
web-ui "29건 에러"는 **실제 코드 부채 아님**. root override(`include: packages/web-ui/**`)가 web-ui cwd `biome check src` 실행 시 글롭이 cwd-상대 경로(`src/...`)와 불일치 → disable된 5개 규칙(useButtonType 10·useKeyWithClickEvents 4·noSvgWithoutTitle 2·noLabelWithoutControl 1·noArrayIndexKey 3 = 29)이 재활성. web-ui/biome.json(root extends + 동일 5규칙 disable)로 cwd 무관 일관 적용. **컴포넌트 코드 변경 0**.

## 검증 (reviewer 재현 + 직접 실행)
- 신규 config 없을 때 29건 = 정확히 5개 disable 규칙(숨은 부채 0) 재현
- web-ui cwd lint(신규 config): 0건(19) / root `biome check .`: 0건(96)
- `pnpm -r lint`(verify.yml): EXIT 0, 양 패키지 clean
- test 217+14, build Done (회귀 0)

## 판정
```
🔴 CRITICAL: 0  🟠 MAJOR: 0  🟡 MINOR: 1  🔵 SUGGESTION: 1
→ APPROVED
```
config-over-code 결정 정당(기존 disable 정책을 cwd context에 일관 적용, array index key 등 정적 리스트 허용은 의도적). 양 lint context 모두 clean, pnpm -r lint 통과.

## MINOR (비차단) + 처리
**DRY: 5개 disable 규칙이 root override + web-ui/biome.json 2곳 중복.** 둘 다 load-bearing(root `biome check .`는 override만, web-ui cwd `biome check src`는 web-ui/biome.json만 참조 — biome가 context별로 다른 config 사용). reviewer는 각 파일에 sync 코멘트를 권했으나 **biome strict JSON이 코멘트/미지원 키(`"//"`)를 거부**(실측 확인)하여 파일 내 코멘트 불가. → **본 문서에 sync 요구 명시**: `packages/web-ui/biome.json`의 5규칙과 root `biome.json` overrides의 5규칙은 **동기화 유지 필수**(한쪽 수정 시 다른 쪽도). 후속 단일소스화(예: root에서 `biome check packages/web-ui/src` 호출) 검토 가능.

## SUGGESTION
- 후속: web-ui lint 단일소스화 또는 mcp-server/web-ui lint 경로 정규화.

**최종: APPROVED.** 실제 green은 push 후 CI run으로 확정.
