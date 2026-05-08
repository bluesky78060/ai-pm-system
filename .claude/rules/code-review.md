# 코드 리뷰 정책 (Codex 통합 - 옵션 B + 강도 재분류 + Self-healing)

`smart_workflow(task_id, 'approve_review', ...)` 호출 전 다음 정책에 따라 리뷰 수행.

## 리뷰 강도 3단계 분류 (재분류됨)

### 🟢 1중 검증 (단일 리뷰) — 일반 변경
- UI 스타일·문구·아이콘·색상 수정
- 단순 버그 수정 (단일 함수 내, 동작 의도 동일)
- 리팩터링(동작 보존)
- 테스트 코드만 변경
- 문서/주석/CHANGELOG/README 변경

→ `code-reviewer` 1회만 통과

### 🟡 2중 검증 — 외부 통합·일반 신규 기능
- 외부 API 통합 (인증·암호화 영역 제외)
- 새 MCP 도구 추가
- 새 React 컴포넌트·페이지
- 백엔드 서비스 클래스 신규
- 신규 라이브러리 의존성 추가

→ `code-reviewer` (1차) + `security-reviewer` (2차) 통과
→ Codex challenge 생략 가능 (challenge 모드는 진짜 위험 영역에만)

### 🔴 3중 검증 — 진짜 위험 영역
- **인증/세션/암호화**: JWT, OAuth, 비밀번호, 키 관리
- **DB 마이그레이션**: 스키마 변경, 데이터 백필, 인덱스
- **신규 인프라**: 새 외부 서비스 도입, 네트워크 보안 설정
- **결제/금전**: 빌링, 환불, 결제 연동
- **권한 시스템**: RBAC, ACL, 권한 검증 로직

→ `code-reviewer` + `security-reviewer` (또는 `codex review`) + adversarial challenge (`critic` 또는 `codex challenge`) 모두 통과

## Self-healing 자동 루프 (신규)

1차 리뷰에서 **MAJOR 이하만** 발견된 경우:

- 메인 오케스트레이터가 즉시 `executor-high`에 "이 MAJOR 항목 + 회귀 테스트 추가" 위임
- 사용자 개입 없이 1라운드 내 자동 수정·재검증
- 재검증 통과 시 다음 라운드 진행

**예외 (사용자 확인 필수)**:
- CRITICAL 발견 → 즉시 사용자 보고
- 같은 라운드에서 3건 이상 MAJOR → 설계 결함 가능성, 사용자 확인
- 정책·범위 변경 (예: model 화이트리스트 추가) → 사용자 확인

## 리뷰 실행 절차

**1중 (일반 변경)**:
1. `code-reviewer`(Opus) 또는 `/code-review` 스킬로 독립 리뷰
2. CRITICAL/MAJOR 0 → 즉시 `approve_review`
3. CRITICAL/MAJOR 발견 → request_changes → self-healing 루프

**2중 (외부 통합·신규 기능)**:
1. `code-reviewer` + `security-reviewer` **병렬 dispatch** (단일 메시지 multi tool_use)
2. 둘 다 PASS → `approve_review`
3. 어느 한 쪽이라도 CRITICAL/MAJOR → self-healing 루프

**3중 (진짜 위험)**:
1. `code-reviewer` + `security-reviewer` (또는 `codex review`) + `critic` (adversarial 또는 `codex challenge`) **병렬 dispatch**
2. 모두 PASS → `approve_review`
3. CRITICAL 발견 → 사용자 확인 후 수정
4. MAJOR만 발견 → self-healing 루프

## 산출물

- `docs/03-code-review/{task-id}-review.md`
  - 적용된 검증 라운드, 발견 사항 + 대응, 최종 판정

## approve_review 호출 규칙

- 1중: `code-reviewer 통과: <요약>` (20자+)
- 2중: `code-reviewer + security-reviewer 2중 통과: <요약>`
- 3중: `code-reviewer + codex review + challenge 3중 통과: <요약>` (또는 Claude 대체 시 `+ security-reviewer + critic adversarial 3중`)
- self-approval 금지 (작성자 ≠ 리뷰어)
