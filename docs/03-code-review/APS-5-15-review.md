# APS-5-15 코드 리뷰 — verify.yml web-ui 테스트 CI 연동

- **분류**: 1중 검증 (fast-track, CI 설정)
- **리뷰어**: `code-reviewer` (작성자와 분리)
- **일자**: 2026-06-23

## 변경
`.github/workflows/verify.yml` Test step: `pnpm --filter @ai-pm/mcp-server test` → **`pnpm -r test`**. web-ui 테스트(APS-3-4 14개)가 push마다 CI에서 실행됨. Lint는 mcp-server 유지(web-ui src 사전 biome 부채 29건 회피, 주석 명시).

## 검증
- 로컬 `pnpm -r test`: mcp-server 217 + web-ui 14 전부 통과
- `pnpm -r build`: ✓ / mcp-server lint(CI Lint step): clean(47)
- YAML: 탭 0, 구조 유효

## 판정
```
🔴 CRITICAL: 0  🟠 MAJOR: 0  🟡 MINOR: 0  🔵 SUGGESTION: 1
→ APPROVED
```
`pnpm -r test`가 양 패키지(mcp-server DB필요 + web-ui jsdom 무DB) 실행 확인. web-ui standalone 14/14 통과(DB secret 불요). Lint 제외 결정·사유·후속이 주석에 명시(부채 추적성 우수). 타 step 무영향.

SUGGESTION(비차단): web-ui biome 부채 29건 정리 후 `pnpm -r lint` 전환 → web-ui 품질 게이트 완성(별도 후속 티켓).

**최종: APPROVED.** 실제 green은 push 후 CI run으로 확정.
