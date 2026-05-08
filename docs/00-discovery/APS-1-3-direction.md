# APS-1-3: codex-review-guard.sh 정책 동기화 — 방향 확정 문서

- **티켓**: APS-1-3
- **작성**: 메인 직접 (단축 정책)
- **분류**: 1중 검증 (단순 hook 수정, 보안 정책 약화 동시에 진행되는 동기화 작업)

## 1. 목표 (Why)

`.claude/hooks/codex-review-guard.sh`가 옛 정책(모든 외부 통합 = 3중 검증)을 적용하여, 새 옵션 2 정책(단순 외부 통합 = 2중)에 부합하는 작업도 차단함. APS-1-2 작업에서 차단되어 우회 키워드 명시로 통과한 사례 발생. Hook 정책 동기화 필요.

## 2. 사용자 (Who)

- 향후 외부 통합 작업을 수행하는 메인 오케스트레이터
- approve_review 호출 시 hook 차단 우회 부담 제거

## 3. 범위 (What)

### 포함
- `codex-review-guard.sh`의 IS_CRITICAL 분류 로직 갱신
- 진짜 위험 영역(인증/세션/암호화/DB 마이그레이션)만 3중 검증 강제
- 단순 외부 통합(MCP 도구 추가, 일반 API 통합)은 차단 안 함
- 기존 hook 검증 테스트 갱신 (2026-05-06 검증 문서 재실행)

### 제외
- 새 hook 추가
- 다른 hook 수정 (epic-id-guard, discovery-guard, plan-review-guard)
- code-review.md 정책 자체 변경 (이미 옵션 2로 갱신됨)

## 4. 제약 (Constraints)

- bash 스크립트 호환 유지 (jq, grep, basename)
- 기존 hook의 정상 케이스(notes 길이, review 산출물 존재 검증)는 유지
- 회귀 0: 기존 21개 시나리오 검증 그대로 통과

## 5. 우선순위 (Priority)

- **P2** (운영 편의성 향상)

## 6. 리스크 (Risk)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 진짜 위험 변경 차단 누락 | 높음 | 인증/세션/암호화/DB는 그대로 강제, 패턴 보수적 유지 |
| 회귀 (기존 hook 동작 변경) | 중 | 기존 21개 시나리오 + 신규 시나리오 검증 |
| 정규식 오류 | 저 | bash 신택스 직접 검증 |

## 7. 검증 (Verify)

### DoD
- `codex-review-guard.sh` 패턴 재정의
- 신규 시나리오 검증 (외부 통합만 변경 시 차단 안 함)
- 진짜 위험 영역(auth/session/crypto/migration) 변경 시 여전히 차단
- `docs/04-tests/hook-validation-2026-05-08.md` 신규 검증 결과 작성

### 패턴 변경 명세

**제거 (또는 약화)**: `mcp-server|api-server|webhook|external` (단독으로는 CRITICAL 트리거 안 함)

**유지**:
- 보안: `auth|session|crypto|password|token|jwt|oauth`
- DB: `migrate|migration|schema\.(sql|ts|js)|db/migrations`

**신규 추가** (옵션 2 정책의 "진짜 위험 영역"):
- 결제: `payment|billing|invoice|stripe`
- 권한: `permission|rbac|acl|authoriz` (authorize/authorization 매칭)

## 분류 결정

**리뷰 강도**: 1중 검증 (`code-reviewer` 1회만)
- 이유: 단순 정규식 패턴 변경, 보안 약화 의도가 정책 동기화와 일치
- security-reviewer 생략 정당 (보안 모듈 자체 변경 아닌 hook 분류 로직)
