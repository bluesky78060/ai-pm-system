# APS-1-3: codex-review-guard.sh 정책 동기화 — 구현 플랜

- **티켓**: APS-1-3
- **선결**: `docs/00-discovery/APS-1-3-direction.md`
- **분류**: 1중 검증

## Discovery 매핑

| 항목 | 반영 |
|------|------|
| IS_CRITICAL 분류 갱신 | F-001 |
| 외부 통합 패턴 약화 | F-001 |
| 결제/권한 패턴 추가 | F-001 |
| 검증 문서 갱신 | F-002 |

## 기능 명세

### F-001 (P0): codex-review-guard.sh 패턴 재정의

**현재 (옛 정책)**:
```bash
# 외부 통합
if echo "$CHANGED_FILES" | grep -qE "(mcp-server|api-server|webhook|external)"; then
  IS_CRITICAL=1
fi
```

**변경 후 (옵션 2)**:
```bash
# 결제 (신규)
if echo "$CHANGED_FILES" | grep -qE "(payment|billing|invoice|stripe)"; then
  IS_CRITICAL=1
  CRITICAL_REASONS+=("결제 시스템 변경")
fi

# 권한 시스템 (신규)
if echo "$CHANGED_FILES" | grep -qE "(permission|rbac|acl|authoriz)"; then
  IS_CRITICAL=1
  CRITICAL_REASONS+=("권한 시스템 변경")
fi
# 외부 통합 패턴 (mcp-server|api-server|webhook|external) 제거됨
# → 단순 외부 통합은 1차+2차 코드리뷰로 충분 (옵션 2 정책)
```

**유지**:
- 보안: `auth|session|crypto|password|token|jwt|oauth`
- DB: `migrate|migration|schema\.(sql|ts|js)|db/migrations`

### F-002 (P1): 검증 문서 갱신

- `docs/04-tests/hook-validation-2026-05-08.md` 신규 작성
- 시나리오:
  1. 단순 mcp-server 변경 → 차단 안 함 (PASS)
  2. auth 파일 변경 → 차단 (PASS)
  3. migration 파일 변경 → 차단 (PASS)
  4. payment 파일 변경 → 차단 (PASS, 신규 패턴)
  5. permission 파일 변경 → 차단 (PASS, 신규 패턴)

## 로드맵

- T1: codex-review-guard.sh 수정 (메인 직접)
- T2: 신규 시나리오 검증 (Bash 직접 실행)
- T3: 검증 문서 작성

## 산출물 체크리스트

- [ ] `.claude/hooks/codex-review-guard.sh` 수정
- [ ] `docs/04-tests/hook-validation-2026-05-08.md` 신규
- [ ] `docs/02-review/APS-1-3-plan-review.md` (이 플랜 리뷰)
- [ ] `docs/03-code-review/APS-1-3-review.md` (1차 검증)

## 단축 정책 적용

- Discovery 메인 직접 작성 (-5분)
- 1중 검증 (단순 hook 수정 분류 정당) (-10분)
- 플랜 리뷰 critic 1회 (간략 검토) (-3분)
- 메인 직접 구현 (위임 불필요, 작은 변경)
- **예상 시간: 10~15분**
