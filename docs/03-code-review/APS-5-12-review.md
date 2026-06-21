# APS-5-12 코드 리뷰 — mcp-server transitive HIGH advisory 일괄 해소

- **검증 라운드**: 2중 (보안 advisory dep 범프). fast-track 1중 워크플로우 + 보안 2중 리뷰. codex-review-guard: security-reviewer 충족
- **리뷰어**: code-reviewer + security-reviewer, 작성자(메인)와 분리

## 변경
- `package.json`(루트) pnpm.overrides: `hono >=4.12.4`→`>=4.12.25`, 신규 `ws >=8.21.0` / `protobufjs >=7.6.1` / `qs >=6.15.2`
- `pnpm-lock.yaml`: ws 8.20.0→8.21.0, hono 4.12.19→4.12.26, qs→6.15.2, protobufjs→7.6.1
- 코드 변경 없음 (override만)

## 대상 advisory (전부 transitive)
| 패키지 | advisory | fix | 경로 | resolved |
|--------|----------|-----|------|----------|
| ws | HIGH memory DoS + moderate | ≥8.21.0 | @google/genai | 8.21.0 ✅ |
| protobufjs | HIGH unbounded Any + moderate | ≥7.6.1 | @google/genai | **8.6.4** (genai가 ^8 의존, floor 상회) ✅ |
| hono | HIGH CORS-credentials reflect + 4 moderate | ≥4.12.25 | @modelcontextprotocol/sdk | 4.12.26 ✅ |
| qs | moderate stringify DoS | ≥6.15.2 | express | 6.15.2 ✅ |

## 검증 증거 (메인 실측)
- `pnpm install`: peer 경고 없음 (Packages +5 -15)
- `pnpm audit --prod`: **"No known vulnerabilities found"** (이전 15~22건 → 0)
- `pnpm -r build`: mcp-server tsc Done, web-ui vite built. 양 패키지 clean
- `pnpm lint`: 88 files 0 issues
- `pnpm --filter @ai-pm/mcp-server test`: 183 passed
- boot 스모크(새 dep 트리): 서버 기동 무크래시, /health=200, /api=200

## 2중 결과

| 리뷰어 | 판정 | C/M/Mi/S |
|--------|------|----------|
| code-reviewer | APPROVED | 0 / 0 / 2 / 1 |
| security-reviewer | APPROVED | 0 / 0 / 1 / 2 |

### code-reviewer 핵심
- peer 무결성 PASS: ws/protobufjs(@google/genai), hono(@hono/node-server peer `>=4.12.25` 만족), qs(express) — same-major, peer 미파손
- lockfile 단일 resolution, 구버전 잔존 0
- 🟡 MINOR-1: **protobufjs는 8.6.4로 resolve**(7.6.1 아님) — genai가 `^8` 의존, floor `>=7.6.1`을 8.6.4가 상회(fix 포함). 보안 결과 정확, ledger 표기만 정정
- 🟡 MINOR-2: unbounded `>=` (advisory floor엔 정상 idiom, lockfile이 exact pin) / 🔵 override↔advisory 매핑 기록 권장

### security-reviewer 핵심
- 4개 advisory 전부 fix floor 이상 해소(ws 8.21.0≥8.21.0, protobufjs 8.6.4≥7.6.1, hono 4.12.26≥4.12.25, qs 6.15.2≥6.15.2), `audit --prod` clean 독립 재확인
- **hono CORS-credentials HIGH 노출 = NIL**: MCP 서버는 `StdioServerTransport`만(hono CORS 경로 `StreamableHTTP/SSE` 미import), api-server는 express cors + `ALLOWED_ORIGINS` allowlist + credentials 미설정. 취약 hono 패턴 미도달 → 범프는 defense-in-depth
- 신규 CVE 0
- 🟡 MINOR-1: 로컬 `node_modules/.pnpm/hono@4.12.19` orphan(미참조, 비노출 — node_modules라 커밋·Render fresh install 무관). `pnpm prune` 시 정리
- 🔵 SUGG: dev 전용 advisory(vitest UI/vite 등) 잔존 — prod 미배포, Vitest UI를 CI/공유 환경서 쓰면 별도 티켓

## 최종 판정: 승인

2중 전원 APPROVED, CRITICAL/MAJOR 0. prod 트리 advisory **15~22건 → 0**("No known vulnerabilities found"). hono CORS HIGH는 실노출 nil이었으나 공급망 레벨 해소(defense-in-depth). 코드 변경 없는 override-only diff, build/lint/test/boot 스모크 green.

### 정정 사항 (ledger 정확도)
- protobufjs는 **8.6.4**로 resolve (티켓 설명의 "7.6.1"은 fix floor일 뿐, 실 resolved는 8.6.4 — genai `^8` 의존). 보안 목표 충족, 표기만 정정.

### 후속 (범위 외, 비차단)
1. dev-tooling advisory(vitest UI critical 등) — prod 미배포, 별도 티켓 (Vitest UI를 CI서 쓸 때만)
2. 로컬 stale hono@4.12.19 orphan — `pnpm prune`(선택, 비노출)
3. override↔advisory 매핑 주석/CHANGELOG 기록 (선택)
