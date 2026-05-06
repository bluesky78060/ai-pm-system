# Hook 검증 테스트 결과

- **일자**: 2026-05-06
- **대상 커밋**: `fb11f0e` — Discovery Q&A → 플랜 리뷰 → Codex 3중 검증 워크플로우 도입
- **검증 범위**: 신규 PreToolUse hook 4종

## 테스트 매트릭스

| Hook | 시나리오 | 기대 | 결과 |
|------|----------|------|------|
| **epic-id-guard** | epic_id=null | 차단(exit 2) | ✅ |
| | epic_id 키 누락 | 차단(exit 2) | ✅ |
| | epic_id="" (빈 문자열) | 차단(exit 2) | ✅ |
| | 유효한 UUID | 통과(exit 0) | ✅ |
| | 다른 도구 호출(Edit 등) | no-op(exit 0) | ✅ |
| **discovery-guard** | 비-plan 경로 Edit | 통과(exit 0) | ✅ |
| | docs/01-plan/ 경로 + Discovery 디렉터리 없음 | 차단(exit 2) | ✅ |
| | Discovery 존재 + 활성 티켓 매칭 | 통과(exit 0) | ✅ |
| | Discovery 존재하나 활성 티켓 미매칭 | 차단(exit 2) | ✅ |
| **plan-review-guard** | submit_test action | 통과(exit 0) | ✅ |
| | start_work + 산출물 전무 | 차단(exit 2) | ✅ |
| | Plan만 존재(Discovery/Review 누락) | 차단(exit 2) | ✅ |
| | 모든 산출물 + 활성 티켓 매칭 | 통과(exit 0) | ✅ |
| | 산출물 있으나 활성 티켓 미매칭 | 차단(exit 2) | ✅ |
| **codex-review-guard** | start_work action | 통과(exit 0) | ✅ |
| | approve_review + 리뷰 산출물 없음 | 차단(exit 2) | ✅ |
| | 리뷰 산출물 있으나 활성 티켓 미매칭 | 차단(exit 2) | ✅ |
| | notes < 20자 | 차단(exit 2) | ✅ |
| | 일반 변경(코드 미변경) + notes 충분 | 통과(exit 0) | ✅ |
| | 보안 파일 변경 + codex 흔적 없음 | 차단(exit 2) | ✅ |
| | 보안 파일 변경 + notes에 "codex" 포함 | 통과(exit 0) | ✅ |

**총 21개 시나리오 / 21개 의도대로 동작**

## 중요 변경 자동 감지 검증 (codex-review-guard)

`git diff --name-only HEAD` 결과를 정규식으로 분류:

| 카테고리 | 정규식 | 검증 |
|----------|--------|------|
| 보안 | `auth\|session\|crypto\|password\|token\|jwt\|oauth` | ✅ |
| DB 마이그레이션 | `migrate\|migration\|schema\.(sql\|ts\|js)\|db/migrations` | ✅ |
| MCP/외부 통합 | `mcp-server\|api-server\|webhook\|external` | ✅ |

테스트 시 `packages/mcp-server/src/auth-test-token.ts` 임시 추가 →
"보안 관련 파일 변경" + "MCP/외부 통합 변경" 두 카테고리 동시 감지됨.

## 운영 시 주의 사항

### codex-review-guard 정규식 엄격성

리뷰 파일(`docs/03-code-review/{ticket}-review.md`) 본문 매칭 규칙:
- **codex review 인정**: `codex.{0,10}review` (정규식, 대소문자 무시)
- **codex challenge 인정**: `codex.{0,10}challenge` 또는 `adversarial` 또는 `challenge mode`

→ "codex"와 "review/challenge" 사이 거리가 10자 이내여야 매칭됨.

**우회 가능 경로**: `notes` 필드에 "codex" 키워드만 포함되어도 통과.

**권장 표기 (중요 변경 시)**:
```
notes="code-reviewer + codex review + challenge 3중 통과: <요약>"
```

### 활성 티켓 동기화

- `.claude/active-ticket` 파일 기준으로 산출물 매칭 검증
- 티켓 전환 시 `set-ticket.sh` 또는 직접 갱신 필요

## 결론

신규 hook 4종 모두 의도대로 동작.
강제 사항 위반 시 PreToolUse 단계에서 차단되어 잘못된 워크플로우 진입 자체가 봉쇄됨.
