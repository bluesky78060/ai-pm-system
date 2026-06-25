# APS-1-15 Plan v2 — 플랜 확정 후 코드 구현 단계 auto-accept 자동 전환

- **티켓**: APS-1-15 / **분류**: 중요 변경(보안+아키텍처) → codex 3중 검증
- **Discovery**: `docs/00-discovery/APS-1-15-direction.md`
- **개정**: v2 (critic 리뷰 REVISE 반영 — C1/C2/M1/M2/M3 + minor 전부 해소)
- **일자**: 2026-06-25

## 0. critic 리뷰 반영 요약 (v1→v2)
| ID | 지적 | v2 해소 |
|----|------|---------|
| **C1** | 심링크+lexical 정규화로 민감경로 가드 우회 | **realpath 기반**(python `os.path.realpath`) resolve → PROJECT_ROOT 밖 deny + 심링크 타깃 거부. 매칭은 resolved 경로 기준 |
| **C2** | "start_work=플랜확정" 불변식이 fast-track에서 거짓 | **명시적 결정**: fast-track도 auto-accept 켠다(fast-track.md가 비민감 단순변경으로 제한 + 민감경로 가드 상시 작동). §1 불변식 텍스트 정정 |
| **M1** | 마커 누수(abandon/branch-switch) | 마커에 **타임스탬프 임베드 + 만료(12h)** + set-active-ticket.sh에서 active-ticket 변경 시 마커 클리어 |
| **M2** | 실패 start_work에도 마커 생성 | **jq 성공 술어**: tool_response의 status가 in_progress류 且 .error 없음일 때만 생성 |
| **M3** | 테스트 부족 | T10–T14(심링크/traversal/staleness/실패/out-of-root) 추가 |
| **m1** | substring false positive | 주요 토큰 anchored(세그먼트/확장자) 매칭 |
| **m2** | .gitignore 미등록 | 추가(확인됨, load-bearing) |
| **m3** | settings.json 직접수정 위험 | 백업 + python round-trip 검증 |
| **m4** | 마커 non-atomic write | temp+mv atomic |
| missing | MultiEdit/audit로그 | matcher에 MultiEdit 추가 + auto-approve append 로그 |

## 1. 아키텍처 개요

```
[구현 단계 진입] start_work 호출 성공
   (plan-review-guard 통과 = 정식 산출물 검증 OR fast-track 마커)   ← §1 불변식 정정(C2)
     │
     ▼  PostToolUse: auto-accept-marker.sh  (성공 술어 통과 시에만, M2)
.claude/active-ticket-autoaccept  ← "TICKET|EPOCH" 기록 (마커 ON, 12h 만료, M1)
     │
     ▼  [구현 단계] Edit/Write/MultiEdit 호출마다
PreToolUse: auto-accept-guard.sh
   ├─ 마커 없음/만료/티켓불일치 → exit 0 (무동작)
   ├─ realpath resolve 후 PROJECT_ROOT 밖 → exit 0 (manual)           ★C1
   ├─ file_path가 심링크 → exit 0 (manual)                            ★C1
   ├─ resolved 경로가 민감경로 → exit 0 (manual)                      ★권한 에스컬레이션 차단
   └─ 그 외 → permissionDecision:"allow" + auto-accept.log append    ★audit
     │
     ▼  approve_review(done) 또는 새 티켓 create_task → 마커 제거 (OFF)
```

**§1 불변식 (C2 정정)**: 마커는 `start_work` **성공** 시 켜진다. start_work는 plan-review-guard가 ①정식 산출물(Discovery/Plan/Review) **또는** ②fast-track 마커(=비민감 단순변경, `fast-track.md`로 범위 제한)를 검증한 뒤에만 성공한다. 따라서 auto-accept는 "검증된 구현 단계"에서만 켜지며, fast-track 케이스에서도 **민감경로 가드가 상시 작동**하므로 권한 에스컬레이션은 차단된다. (v1의 "정식 산출물만"이라는 서술은 부정확 → 정정)

## 2. 신규 파일

### 2-1. `~/.claude/hooks/auto-accept-guard.sh` (PreToolUse, matcher `Edit|Write|MultiEdit`)
```bash
INPUT=$(cat); TOOL=$(jq -r .tool_name); FP=$(jq -r .tool_input.file_path)
[ Edit|Write|MultiEdit 아니면 ] exit 0
PROJECT_ROOT=$(git rev-parse --show-toplevel) || exit 0
MARKER=$PROJECT_ROOT/.claude/active-ticket-autoaccept
TICKET=$(cat $PROJECT_ROOT/.claude/active-ticket | tr -d space)
[ -f $MARKER ] || exit 0
M_TICKET=마커 첫 필드(| 앞); M_EPOCH=마커 둘째 필드
[ -z $M_TICKET || $M_TICKET != $TICKET ] && exit 0          # 티켓 불일치
NOW=$(date +%s); [ $((NOW-M_EPOCH)) -gt 43200 ] && exit 0    # 12h 만료(M1)
# --- C1: realpath 기반 경로 안전 ---
[ -L "$FP" ] && { echo "심링크 타깃 수동승인" >&2; exit 0; }  # 심링크 거부
REAL=$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$FP")
case "$REAL" in "$PROJECT_ROOT"/*) ;; *) exit 0 ;; esac       # 밖이면 manual
# --- 민감경로 매칭 (REAL 기준, anchored, case-insensitive) ---
LOW=$(echo "$REAL" | tr A-Z a-z)
민감 매칭되면 { echo "민감경로 수동승인" >&2; exit 0; }
# --- 자동 승인 ---
echo "$(date)|allow|$TICKET|$REAL" >> $PROJECT_ROOT/.claude/state/auto-accept.log
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"auto-accept 활성(%s): 구현 단계 자동 승인"}}\n' "$TICKET"
exit 0
```

**민감경로 매칭(anchored, `$LOW` 대상)** — 하나라도 매칭 시 자동승인 안 함:
- 인증/암호: `*/auth/*`, `*-auth.`(ext), `*/middleware/*`, `*/crypto/*`, `*auth.ts`/`*auth.js`/`*auth.sh`
- 시크릿: `*/.env`, `*.env`, `*.env.*`, `*secret*`, `*credential*`, `*.pem`, `*.key`, `*token.*`
- DB: `*migrat*`, `*/db/migrate*`, `*schema.sql`, `*schema.ts`
- 결제: `*payment*`, `*billing*`, `*invoice*`, `*stripe*`
- 권한설정 자기수정 ★최우선: `*/.claude/hooks/*`, `*/.claude/settings*`, `*/.claude/active-ticket*`
- `*/.git/*`

> codex-review-guard.sh의 anchored 정규식 선례 차용(m1). substring보다 정교하나 여전히 fail-safe(의심 시 manual).

### 2-2. `~/.claude/hooks/auto-accept-marker.sh` (PostToolUse, matcher `*smart_workflow`)
```bash
INPUT=$(cat); TOOL=$(jq -r .tool_name); ACTION=$(jq -r .tool_input.action)
[ *smart_workflow 아니면 ] exit 0
PROJECT_ROOT=$(git rev-parse --show-toplevel) || exit 0
TICKET=$(cat active-ticket); [ 형식 ^[A-Z][A-Z0-9]+-[0-9]+(-[0-9]+)?$ 아니면 ] exit 0
MARKER=$PROJECT_ROOT/.claude/active-ticket-autoaccept
if ACTION==start_work:
    # M2: 성공 술어 — tool_response에 error 없고 status가 in_progress
    OK=$(echo "$INPUT" | jq -r '.tool_response | (.error//empty) as $e | if $e=="" or $e==null then ((.task.status//.status//"")|test("in_progress|in-progress")) else false end' 2>/dev/null)
    [ "$OK" == "true" ] || exit 0
    mkdir -p .claude/state
    printf '%s|%s' "$TICKET" "$(date +%s)" > $MARKER.tmp && mv $MARKER.tmp $MARKER   # atomic(m4)
elif ACTION==approve_review:
    rm -f $MARKER
exit 0   # PostToolUse 항상 0
```
> M2 주의: 실제 start_work 성공 응답의 정확한 JSON 형태를 **구현 시 1회 실측**하여 술어 확정(critic Open Question). status 경로 폴백(.task.status/.status) 포함.

## 3. 수정 파일

### 3-1. `~/.claude/hooks/set-active-ticket.sh` (M1 — 티켓 변경 시 마커 클리어)
- 새 티켓 코드 기록 직전, 기존 `active-ticket`과 다르면 `rm -f .claude/active-ticket-autoaccept` (이전 auto-accept 무효화). fast-track.md "다음 티켓 발행 시 갱신" 원칙과 일관.

### 3-2. `~/.claude/settings.json` (글로벌 hook 등록) — m3 안전수정
- **백업**: `cp settings.json settings.json.bak.<epoch>` 먼저.
- `PreToolUse[]`에 `{matcher:"Edit|Write|MultiEdit", hooks:[auto-accept-guard.sh]}` 추가.
- `PostToolUse[]`에 `{matcher:"mcp__ai-pm__smart_workflow|mcp__ai-pm-system__smart_workflow", hooks:[auto-accept-marker.sh]}` 추가.
- python3 round-trip(`json.load`→`json.dump`)으로 머지 + 검증. 기존 4종 등록 보존 확인.

### 3-3. `.gitignore` (m2 — 확인됨 load-bearing)
- `.claude/active-ticket-autoaccept` + `.claude/state/auto-accept.log` 추가.

### 3-4. `.claude/rules/auto-accept-mode.md` (신규) + `CLAUDE.md` 라우터 1행
- 메커니즘·마커 수동 on/off(`echo "TICKET|$(date +%s)" > marker`)·12h 만료·민감경로·비활성화(`rm marker`)·audit 로그 위치 문서화.
- 이미 acceptEdits/bypassPermissions 모드면 hook allow는 redundant·무해(한 줄 명시).

## 4. 작업 순서
1. `auto-accept-guard.sh` 작성 + chmod +x
2. `auto-accept-marker.sh` 작성 + chmod +x (start_work 응답 실측 후 술어 확정)
3. `set-active-ticket.sh` 마커 클리어 1블록 추가
4. settings.json 백업 → python 머지 → 검증
5. .gitignore 2줄
6. auto-accept-mode.md + CLAUDE.md 행
7. 검증: bash -n, T1–T14, 마커 hook 시뮬, pnpm -r build/lint/test 회귀

## 5. 테스트 전략 (Iron Law) — T10–T14 추가(M3)
| # | 시나리오 | 기대 |
|---|----------|------|
| T1 | 마커 OFF | 출력없음 → manual |
| T2 | 마커 ON + 일반경로(App.tsx) | allow |
| T3 | 마커 ON + auth.ts | 출력없음 |
| T4 | 마커 ON + .env.production | 출력없음 |
| T5 | 마커 ON + .claude/hooks/x.sh | 출력없음 ★ |
| T6 | 마커 ≠ active-ticket | 출력없음 |
| T7 | start_work 성공 | 마커=TICKET\|EPOCH |
| T8 | approve_review | 마커 삭제 |
| **T10** | **심링크 innocent.tsx→hooks/real.sh** | **출력없음(심링크 거부)** ★C1 |
| **T11** | **`../` traversal로 PROJECT_ROOT 밖** | **출력없음(out-of-root)** ★C1 |
| **T12** | **마커 EPOCH 13h 전(만료)** | **출력없음** ★M1 |
| **T13** | **start_work 실패 응답(error/todo)** | **마커 미생성** ★M2 |
| **T14** | **realpath가 /tmp 등 밖** | **출력없음** ★C1 |
| T9 | pnpm -r build/lint/test | 기존 green(코드 0 변경) |

## 6. 롤백 (가역성)
완전 가역: settings.json.bak 복원 + hook 2파일 삭제 + set-active-ticket 블록 제거 + 마커/로그 삭제. 마커 없으면 기본 OFF.

## 7. do-not-touch
- 기존 hook 4종 **동작** 변경 금지(set-active-ticket은 마커클리어 1블록만 추가).
- packages/ 코드 0 변경.
- plan-review-guard의 fast-track 우회 로직 불변.
