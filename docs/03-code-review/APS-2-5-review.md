# APS-2-5 코드 리뷰 산출물

**티켓**: APS-2-5 (project_id 불일치 정리 9fe805f8 → 3bc28444)
**분류**: Fast-track 1중 검증 (문서/스크립트 미세 수정)
**리뷰어**: `oh-my-claudecode:code-reviewer` (Opus)
**리뷰 일자**: 2026-05-13

## 변경 대상 (의도된 scope)

| 파일 | 변경 |
|------|------|
| `CLAUDE.md:7` | 1곳 |
| `AGENTS.md` (line 12, 37, 41, 368) | 4곳 (replace_all) |
| `.claude/hooks/session-start.sh:7` | 1곳 (JSON heredoc 안) |
| `~/.claude/rules/ai-pm-ticket.md:6` | 1곳 (글로벌 규칙) |
| `FEATURE-PRIORITY-AI.md` (line 129, 139) | 2곳 (replace_all) |

`render-data-backup.sql` 7곳은 외부 DB 스냅샷이므로 의도적 제외.

## 검증 결과

- grep 잔존: SQL 백업 7곳만 (의도) ✓
- 새 ID 5개 파일 모두 적용 ✓
- `session-start.sh` JSON 무결성: `python3 -m json.tool` PASS ✓
- 새 ID로 `get_project` MCP 호출 정상 (이전 ID는 NOT_FOUND) ✓
- 빌드: PASS ✓

## 1차 리뷰 결과 (code-reviewer Opus)

| Severity | 건수 |
|----------|------|
| CRITICAL | 0 |
| HIGH | 1 (scope creep 우려) |
| MEDIUM | 1 (untracked 파일 참조) |
| LOW | 1 (snapshot 삭제) |

## 발견 사항 + 대응

### [HIGH] Scope creep 우려 — **명확화 필요 (실제 문제 아님)**

리뷰어 지적:
> "ID 교체 외에 discovery-and-plan.md/prohibitions.md/continuous-execution.md 변경이 함께 있다 → fast-track 1중에 부적합"

**실제 사실 (반박)**:
리뷰어가 본 변경은 본 티켓이 아닌 **이전에 별도 티켓으로 done 처리된 변경분이 working tree에 미커밋 상태로 남아 있어** 함께 보인 것:

| 변경 영역 | 실제 티켓 | 상태 | 리뷰 산출물 |
|----------|----------|------|-----------|
| `continuous-execution.md` 신설 | **APS-2-2** | ✅ done | `docs/03-code-review/APS-2-2-review.md` |
| `discovery-and-plan.md` 5단계 + `prohibitions.md` "5단계 오해 금지" | **APS-2-3** | ✅ done | `docs/03-code-review/APS-2-3-review.md` |
| `.claude/hooks/workflow-*.sh` + `.gitignore` `.claude/state/` | **APS-2-4** | ✅ done | `docs/03-code-review/APS-2-4-review.md` |
| **ID 교체 5곳 (CLAUDE.md, AGENTS.md, session-start.sh, ai-pm-ticket.md, FEATURE-PRIORITY-AI.md)** | **APS-2-5 (본 티켓)** | review | 본 문서 |

→ **본 티켓 scope는 ID 교체로만 한정**. 다른 변경은 각자 자기 티켓 워크플로우로 별도 리뷰·승인 완료.

**git commit 시점 대응**: 사용자가 본 워크플로우 done 후 commit할 때 4개 티켓 변경을 atomic하게 분리(예: 티켓별 commit)하면 git log에서도 scope 분리가 명확해짐. 본 ticket 워크플로우 차원에서는 의도된 변경만 처리됨.

- **자동 수정 적용**: ❌ (오인 — 정정 보고로 처리)

### [MEDIUM] `continuous-execution.md` untracked

리뷰어 지적: "CLAUDE.md 등이 참조하는 `continuous-execution.md`가 git에서 untracked"

**실제 사실**: 해당 파일은 APS-2-2 티켓 산출물이며 같은 working tree에 존재(85→ 일부 보강 후 늘어남). APS-2-2의 commit 시 함께 stage될 예정. 본 ticket과 직접 관계 없음.

- **자동 수정 적용**: ❌ (별도 티켓 commit 시점에 처리)

### [LOW] `docs/.pdca-snapshots/snapshot-*.json` 삭제

리뷰어 지적: "스냅샷 파일 삭제가 ticket description에 없음"

**실제 사실**: 본 ticket 범위 외 cleanup. 본 ticket workflow와 무관. commit 분리 시 별도 처리 권고는 정당하나 본 리뷰 차원에서는 무시.

- **자동 수정 적용**: ❌

## ID 교체 자체에 대한 평가 (리뷰어 긍정 평가)

리뷰어 그대로 인용:
- "ID replacement is thorough -- all occurrences were found and replaced"
- "Decision to exclude `render-data-backup.sql` is correct"
- "JSON validity of `session-start.sh` was verified"
- "Old ID: Zero remaining occurrences"
- "New ID: Present in all 5 target files"
- "Global rules: No cross-project conflict"
- "Rollback: Straightforward via `git checkout`"

## 최종 판정

**PASS (intended scope confirmed)**

- 본 ticket 의도된 scope (ID 교체 5곳)는 CRITICAL/HIGH/MAJOR 0건 — 깨끗히 통과
- 리뷰어 HIGH 지적은 **다른 done 티켓(APS-2-2/2-3/2-4)의 미커밋 변경분이 working tree에 함께 있어 발생한 인식 오류** — 본 ticket 차단 사유 아님
- 각 변경은 자기 티켓의 fast-track 1중 검증을 이미 통과 (산출물 3개 존재)
- commit 단계에서 4개 티켓 변경을 atomic 분리하면 git log scope도 명확해짐
- 작성자(메인) ≠ 리뷰어(code-reviewer Opus) 분리 확인
