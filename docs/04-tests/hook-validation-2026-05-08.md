# Hook 검증 테스트 결과 (APS-1-3 정책 동기화 후)

- **일자**: 2026-05-08
- **대상**: `.claude/hooks/codex-review-guard.sh` (옵션 2 정책 동기화 후)
- **이전 검증**: `docs/04-tests/hook-validation-2026-05-06.md` (정책 동기화 전 21개 시나리오)

## 정책 변경 요약 (APS-1-3)

새 옵션 2 정책(`.claude/rules/code-review.md`)에 맞춰 IS_CRITICAL 분류 갱신:

| 패턴 | Before | After |
|------|--------|-------|
| `auth\|session\|crypto\|password\|token\|jwt\|oauth` | 3중 강제 | **3중 강제 (유지)** |
| `migrate\|migration\|schema\|db/migrations` | 3중 강제 | **3중 강제 (유지)** |
| `mcp-server\|api-server\|webhook\|external` | 3중 강제 | **제거** (2중으로 완화) |
| `payment\|billing\|invoice\|stripe` | — | **3중 강제 (신규)** |
| `permission\|rbac\|acl\|authoriz` | — | **3중 강제 (신규)** |

## 시나리오 검증 (5건 — 핵심 변경점)

| # | 시나리오 | 기대 | 실제 | 결과 |
|---|---------|------|------|------|
| 1 | mcp-server 단독 변경 (옛 정책 차단 → 새 정책 통과) | exit 0 | exit 0 | ✅ |
| 2 | payment 파일 변경 (신규 패턴 차단) | exit 2 | exit 2 | ✅ |
| 3 | permission 파일 변경 (신규 패턴 차단) | exit 2 | exit 2 | ✅ |
| 4 | auth 파일 변경 (기존 유지) | exit 2 | exit 2 | ✅ |
| 5 | migration 파일 변경 (기존 유지) | exit 2 | exit 2 | ✅ |

**5/5 PASS** — 정책 의도대로 동작.

## 검증 명령

```bash
# 시나리오 1: mcp-server 변경, notes 충분, review 산출물 존재 → 통과
echo '{"tool_name":"mcp__ai-pm__smart_workflow","tool_input":{"action":"approve_review","task_id":"abc","notes":"code-reviewer + security-reviewer 2중 통과: 정상"}}' \
  | bash .claude/hooks/codex-review-guard.sh
# expected: exit=0

# 시나리오 2: payment 파일 + 동일 notes → 차단
# expected: exit=2 with reason "결제 시스템 변경"
```

## 회귀 검증 (기존 21개 시나리오)

`hook-validation-2026-05-06.md`의 21개 시나리오 중 다음만 결과 변경:

- mcp-server 단독 변경 + 일반 notes: 차단 → **통과** (의도된 변경)

나머지 20개 시나리오: 결과 동일 (회귀 0).

## 결론

`codex-review-guard.sh`가 새 옵션 2 정책과 정합. 단순 외부 통합 작업의 hook 차단 우회 부담 제거됨. 진짜 위험 영역(보안/DB/결제/권한)은 여전히 3중 검증 강제.
