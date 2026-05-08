# 표준 템플릿: Discovery 자동 채움 (analyst 호출)

Discovery 단계에서 사용자 응답 대기 시간을 줄이기 위해, analyst 에이전트가 코드베이스 + 과거 티켓 + 외부 docs를 자동 분석하여 7개 카테고리 답변 초안을 작성하는 표준 패턴.

## 적용 조건

### 자동 채움 권장 (메인이 적극 사용)
- P0 / P1 우선순위 티켓
- 외부 API 통합 / 신규 기능
- 풀스택 변경 (DB + API + UI)
- 보안·인증·DB 마이그레이션 영역

### 자동 채움 생략 가능 (메인이 직접 간략 작성)
- 1중 검증 분류 작업
- 단순 버그 수정 (단일 파일)
- 문서/주석/CHANGELOG 변경
- 정책 미세 조정 (rules 파일 1줄 수정 등)

## 표준 호출 절차

### Step 1: 티켓 발행 후 analyst 호출

```
Agent({
  description: "Discovery 자동 채움 — APS-X-Y",
  subagent_type: "oh-my-claudecode:analyst",
  prompt: <아래 표준 prompt>
})
```

### Step 2: 표준 prompt 템플릿

```
당신은 ai-pm-system 프로젝트 Discovery 전문가입니다. 티켓 APS-X-Y의 Discovery 7개 카테고리 답변 초안을 자동 작성하세요.

## 티켓 정보
- 제목: {title}
- 설명: {description}
- 에픽: {epic_name}
- 우선순위: P{priority}

## 분석 대상
1. **코드베이스**: `packages/mcp-server/src/`, `packages/web-ui/src/`
2. **과거 유사 티켓**: `docs/00-discovery/APS-*-direction.md` 파일들
3. **정책**: `.claude/rules/code-review.md`, `.claude/rules/discovery-and-plan.md`
4. **표준 템플릿**: `.claude/templates/{관련 템플릿}.md`

## 작성할 7개 카테고리 (각 3~5줄)

### 1. 목표 (Why)
- 해결하려는 문제, 성공 기준, 측정 지표
- 코드베이스에서 유사 패턴 인용 권장

### 2. 사용자 (Who)
- 주 사용자, 시나리오, 페인 포인트

### 3. 범위 (What)
- 포함 / 제외, MVP 경계
- 과거 유사 티켓의 범위 결정 인용

### 4. 제약 (Constraints)
- 기술 스택 (현재 프로젝트 의존성 확인)
- 호환성 요구사항

### 5. 우선순위 (Priority)
- P0/P1/P2 분류 근거
- 트레이드오프 시 우선 가치

### 6. 리스크 (Risk)
- 알려진 위험 (과거 티켓에서 발견된 패턴 인용)
- 외부 의존, 실패 영향도

### 7. 검증 (Verify)
- DoD (완료 정의)
- 테스트 방식, 배포 전 체크리스트
- 분류 결정 (1중/2중/3중 검증)

## 출력 형식 (마크다운)

`docs/00-discovery/APS-X-Y-direction.md` 파일로 작성:

```markdown
# APS-X-Y: {title} — 방향 확정 문서

- 티켓: APS-X-Y
- 분류: {1중/2중/3중 검증}
- 작성: analyst 자동 채움 (사용자 검토 대기)

## 1. 목표 (Why)
{...}

(... 7개 섹션 ...)

## 미해결 이슈 (사용자 결정 필요)
- 이슈 1: ...
- 이슈 2: ...

## 사용자 검토 체크리스트

- [ ] 7개 카테고리 답변 정확성 확인
- [ ] 미해결 이슈 결정
- [ ] "방향 확정" 명시적 승인
```

## 분석 시 주의사항

- 외부 통합·보안 영역 → 반드시 `_security-base.ts` 활용 명시
- 코드 예시는 실제 파일 경로 인용
- 추측보다 확실한 사실 우선, 불확실하면 "미해결 이슈"에 명시
- 한국어로 작성
- 분량: 전체 80~150줄 (과도한 추상화 자제)
```

### Step 3: 사용자 검토

analyst 결과를 사용자에게 제시:
- 7개 카테고리 답변 검토
- 미해결 이슈 결정
- "방향 확정" 명시적 승인

### Step 4: 4단계 플랜 작성으로 진행

승인 후 4단계 진입.

## 사용자 검토 체크리스트 (제출 시 필수)

- [ ] 7개 카테고리 모두 답변되었는가
- [ ] "미해결 이슈" 모두 결정 또는 추가 분석 요청
- [ ] 분류(1중/2중/3중)가 적절한가
- [ ] 측정 지표가 검증 가능한가
- [ ] 제약 조건이 현재 프로젝트 상태와 일치하는가

## 단축 효과

- 사용자 응답 대기 -50% (수동 7개 답변 → 1회 검토)
- 과거 티켓 패턴 자동 인용 → 일관성 향상
- 코드베이스 컨텍스트 자동 반영

## 참조

- analyst 에이전트: `oh-my-claudecode:analyst` (Opus, READ-ONLY)
- 정책: `.claude/rules/discovery-and-plan.md`
- 과거 사례: `docs/00-discovery/APS-1-1-direction.md` 등
