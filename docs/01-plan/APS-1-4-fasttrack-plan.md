# APS-1-4: Fast-track 정책 — 구현 플랜

- 티켓: APS-1-4
- 분류: 1중 검증

## 산출물

### F-001 (P0): plan-review-guard.sh fast-track 우회 로직

`.claude/active-ticket-fasttrack` 파일이 존재하고 active-ticket과 일치하면 산출물 검증 생략:

```bash
# 활성 티켓 확인 후
TICKET_FILE="$PROJECT_ROOT/.claude/active-ticket"
FASTTRACK_FILE="$PROJECT_ROOT/.claude/active-ticket-fasttrack"
if [[ -f "$FASTTRACK_FILE" ]]; then
  FT_TICKET=$(cat "$FASTTRACK_FILE" | tr -d '[:space:]')
  TICKET=$(cat "$TICKET_FILE" | tr -d '[:space:]')
  if [[ -n "$FT_TICKET" && "$FT_TICKET" == "$TICKET" ]]; then
    echo "[Plan-Review Guard] fast-track 모드 — 산출물 검증 우회 ($TICKET)" >&2
    exit 0
  fi
fi
```

### F-002 (P0): `.claude/rules/fast-track.md` 신규

Fast-track 분류 기준 + 활성화 절차 + 비활성화 가이드 명시.

### F-003 (P1): CLAUDE.md 인덱스 + 워크플로우 요약 갱신

워크플로우 10단계에 fast-track 옵션 1줄 추가.

### F-004 (P1): 시나리오 검증

- 마커 있고 매칭 → 통과
- 마커 있으나 다른 티켓 → 차단
- 마커 없음 → 기존 검증 그대로
- `docs/04-tests/hook-validation-2026-05-08.md` 추가 시나리오 추가

## 로드맵

- T1: plan-review-guard.sh 수정 (~3분)
- T2: fast-track.md 신규 작성 (~3분)
- T3: CLAUDE.md 1~2줄 갱신
- T4: 검증 + 검증 문서 추가
- T5: 1중 코드 리뷰

## 산출물 체크리스트

- [ ] `.claude/hooks/plan-review-guard.sh` 수정
- [ ] `.claude/rules/fast-track.md` 신규
- [ ] `CLAUDE.md` 갱신
- [ ] `docs/04-tests/hook-validation-2026-05-08.md` 시나리오 추가
- [ ] `docs/02-review/APS-1-4-plan-review.md`
- [ ] `docs/03-code-review/APS-1-4-review.md`

## 단축 효과

- 1중 검증 (-15분)
- 메인 직접 (-3분)
- 자체 plan-review (-3분)
- 예상 시간: ~10분
