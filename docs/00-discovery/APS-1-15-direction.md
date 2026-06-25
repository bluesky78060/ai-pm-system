# APS-1-15 Discovery — 플랜 확정 후 코드 구현 단계 auto-accept 자동 전환

- **티켓**: APS-1-15 (epic: MCP 서버 Core)
- **분류**: 중요 변경 (보안 — 권한 자동 승인 / 아키텍처 — hook 시스템 확장) → codex 3중 검증 의무
- **일자**: 2026-06-25
- **방향 확정**: 사용자 명시 요청 ("플랜 확정되고 코드 작성 시작할 때 auto mode on 자동 전환", "확인되면 티켓 발행해서 구현해줘")

## 사전 확인 (claude-code-guide 에이전트, 공식 문서 기반)
- **세션 중 글로벌 permission mode 프로그램적 전환**: ❌ 불가. `hookSpecificOutput`에 `updatedPermissionMode` 같은 필드 없음. settings `defaultMode`·`--permission-mode`는 시작 시점에만 적용.
- **ExitPlanMode → "auto mode로 진행" 옵션**: ✅ 네이티브 제공, 단 **사용자 클릭 1회 필수**(완전 자동 아님).
- **PreToolUse hook 조건부 `permissionDecision: "allow"`**: ✅ 가능. 글로벌 모드는 안 바뀌지만 개별 Edit/Write 호출이 자동 승인됨 → **시각적으로 auto-accept와 동일 효과(~95%)**.
- **한계**: hook `allow`는 settings.json의 `deny`/`ask` 규칙을 못 이김(규칙 우선).

→ **결론**: 방안 A(마커 + PreToolUse 조건부 allow)로 구현. 글로벌 모드 전환이 아니라 "구현 단계 한정 자동 승인".

## 7개 카테고리

### 1. 목표 (Why)
플랜이 확정되어 구현에 진입하면, 매 Edit/Write마다 사용자가 수동 승인하는 마찰을 제거한다. 연속 실행 원칙(`continuous-execution.md`)과 정합 — 플랜 확정 후 done까지 흐름이 끊기지 않게.

### 2. 사용자 (Who)
- 1차: 본인(개발자) — AI PM 워크플로우로 ai-pm-system을 개발하는 세션.
- 2차: 동일 하네스를 쓰는 타 프로젝트(다이어트, sample-log 등) — 마커 opt-in이므로 자동 적용 안 됨(명시적 활성화 시에만).

### 3. 범위 (What)
**포함**:
- PreToolUse hook `auto-accept-guard.sh` (matcher: `Edit|Write`) — 마커 + 민감경로 가드 후 조건부 `permissionDecision: "allow"`.
- PostToolUse hook `auto-accept-marker.sh` (matcher: smart_workflow) — `start_work` 성공 시 마커 자동 생성, `approve_review`(done 전환) 시 자동 제거.
- 글로벌 `~/.claude/settings.json`에 두 hook 등록.
- 프로젝트 `.gitignore`에 `.claude/active-ticket-autoaccept` 추가.
- 규칙 문서 `.claude/rules/auto-accept-mode.md` + `CLAUDE.md` 라우터 테이블 1행.

**제외**:
- 글로벌 permission mode 전환(불가 — 위 확인).
- Bash 자동 승인(1차 범위는 Edit/Write만 — Bash는 파괴적 명령 위험이 커 별도 판단 유보).
- ExitPlanMode 네이티브 흐름 개조(클릭 1회는 Claude Code UX, 손댈 수 없음).

### 4. 제약
- Claude Code 세션 중 모드 전환 미지원 → hook 조건부 승인이 유일한 자동화 경로.
- hook `allow`는 settings `deny`/`ask`를 못 이김 → 민감 영역은 settings 규칙으로도 이중 차단 가능.
- 글로벌 hook은 모든 프로젝트에서 spawn되나, 마커가 프로젝트 로컬이라 마커 없으면 즉시 no-op(stat 1회 후 exit).

### 5. 우선순위
**안전 > 자동화 편의.** 자동 승인 범위를 최소화하고, 권한 에스컬레이션 경로를 원천 차단하는 것이 1순위.

### 6. 리스크
| 리스크 | 영향 | 완화 |
|--------|------|------|
| **권한 에스컬레이션** — auto-accept가 hook/settings/auth 파일을 자동 수정 | CRITICAL: 자기 권한 확대 | 민감경로 제외 목록에 `.claude/hooks/*`·`.claude/settings*`·`~/.claude/*`·`*auth*`·`.env*` 포함. 이 경로는 마커 무관 항상 수동 승인 |
| **민감 코드 자동 수정** — auth/db migration/payment | HIGH: 보안·데이터 무결성 | 민감경로 패턴(`*auth*`,`*migrat*`,`*payment*`,`*billing*`,`*secret*`,`*credential*`) 제외 |
| **타 프로젝트 오염** | MED | 마커 opt-in + 프로젝트 로컬 + git rev-parse 게이트 |
| **마커 누수**(done 후 잔존) | MED | approve_review 시 자동 제거 + active-ticket 불일치 시 무효 |
| **마커 위조/인젝션** | MED | 티켓 형식 정규식 검증 + active-ticket 정확 일치 |

### 7. 검증
- hook 단위 시뮬레이션: ①마커 OFF→승인 안 함, ②마커 ON+일반경로→allow, ③마커 ON+민감경로→승인 안 함, ④마커 ON+티켓 불일치→승인 안 함.
- `bash -n` 문법 검사 + (가능 시) shellcheck.
- 마커 생성/제거 hook 시뮬레이션(start_work/approve_review JSON 입력).
- monorepo 회귀: `pnpm -r build/lint/test` (코드 변경 없음 증명, 기존 hook 무영향).

## 종료 조건
사용자 방향 명확(명시 요청) → 즉시 Plan 단계 진행.
