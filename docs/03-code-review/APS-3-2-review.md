# APS-3-2 코드 리뷰 — react-router-dom 보안 범프 (7.13.1 → 7.18.0)

- **검증 라운드**: 2중 (보안 advisory dep 범프). fast-track 1중 워크플로우(Discovery/Plan 생략)이나 보안 영역이라 리뷰는 2중. codex-review-guard: security-reviewer로 충족
- **리뷰어**: code-reviewer + security-reviewer, 작성자(메인)와 분리

## 변경
- `packages/web-ui/package.json`: `react-router-dom: ^7.0.0` → `^7.18.0`
- `pnpm-lock.yaml`: react-router-dom + react-router 7.13.1 → 7.18.0 (코드 변경 없음)

## 검증 증거 (메인 실측)
- `pnpm -r build`: web-ui vite 584 modules built (react-router 7.18.0), mcp-server tsc clean
- `pnpm lint`: 88 files 0 issues
- `pnpm --filter @ai-pm/mcp-server test`: 183 passed
- `pnpm audit --prod`: react-router advisory 0건

## 2중 결과 (전원 APPROVED, CRITICAL/MAJOR 0)

| 리뷰어 | 판정 | C/M/Mi/S |
|--------|------|----------|
| code-reviewer | APPROVED | 0 / 0 / 0 / 1 |
| security-reviewer | APPROVED | 0 / 0 / 0 / 2 |

### code-reviewer 핵심
- v7 내 minor라 breaking 없음. 실사용 API(BrowserRouter/Link/Route/Routes/useLocation/useParams)는 안정 core, 7.13→7.18 불변
- lockfile 일관(react-router/dom 둘 다 7.18.0, 7.13.1 잔존 0), caret `^7.18.0`이 v8 차단
- build end-to-end 검증(tsc -b && vite build 성공)

### security-reviewer 핵심
- **GHSA-49rj-9fvp-4h2h(turbo-stream RCE, HIGH) CLEARED**: 7.18.0 ≥ fix floor 7.15.1. turbo-stream standalone dep 부재. audit 0 react-router advisory
- **실제 노출 nil 재확인**: client-only Vite SPA, data-router/loader/action/SSR 전무 → RCE 미노출. 본 범프는 defense-in-depth
- 신규 CVE 0 도입. 잔존 HIGH 3건(ws/protobufjs/hono)은 전부 mcp-server 트리 (범위 외)

### SUGGESTION (범위 외, 비차단)
- 🔵 web-ui 번들 726kB(>500kB 경고) — 코드 스플리팅 별도 티켓 (사전존재)
- 🔵 mcp-server HIGH 3건 별도 티켓 (특히 hono CORS-credentials 서버 trust-boundary)

## 최종 판정: 승인

2중 전원 APPROVED, CRITICAL/MAJOR 0. turbo-stream RCE advisory를 공급망 레벨에서 해소(실노출은 원래 nil), 코드 변경 없는 surgical diff, 신규 advisory 0. build/lint/test 전부 green.
