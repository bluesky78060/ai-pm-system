# 연속 실행 원칙 (Continuous Execution)

티켓 발행 후 `done` 전환까지 단계별 사용자 확인 없이 자율 진행하는 핵심 원칙. 본 문서는 `superpowers:subagent-driven-development`의 "Continuous execution" 원칙을 AI PM System 워크플로우에 맞게 **확장 및 구체화**한다. 원본은 태스크 간 중단만 다루지만, 본 문서는 워크플로우 단계 간 중단과 중단 시 보고 의무까지 포함한다.

## 원칙 1: 단계 사이 명시적 확인 질문 금지

- "다음 단계로 진행할까요?" / "approve_review 호출해도 될까요?" 같은 확인 질문 금지
- 사용자가 처음에 "이거 진행해줘" 한 번 승인했으면 done 전환까지 그 승인이 유효
- 단계별 결과 보고는 **다음 도구 호출과 같은 응답 안에서** 1-2문장으로

## 원칙 2: 암묵적 정지(silent stop) 금지

질문 없이 그냥 멈추는 것도 명시적 질문만큼 나쁘다. 다음 패턴 모두 금지.

| ❌ 잘못된 패턴 | ✅ 올바른 패턴 |
|--------------|--------------|
| 서브에이전트 결과 받고 요약만 출력하고 턴 종료 | 결과 요약 + **즉시 다음 도구 호출**까지 한 응답에 포함 |
| 빌드 성공 → 거기서 멈춤 | 빌드 성공 보고 + 즉시 `code-reviewer` dispatch |
| code-reviewer가 PASS 반환 → "PASS입니다" 보고만 하고 종료 | PASS 보고 + 즉시 `approve_review` 호출 |
| `submit_test` 성공 → "테스트 통과" 보고만 하고 종료 | 통과 보고 + 즉시 code-reviewer 위임 |
| 단계 완료 후 "다음은 X 단계입니다" 안내만 하고 종료 | 안내 + 즉시 X 단계 도구 호출 |
| **5단계에서 critic 결과 받고 자체 검토 후 진행해야 하는데 멈춤** (문구 출력 여부와 무관, 무언의 turn 종료 포함) | critic 결과 + 본인 자체 검토 판정 + 즉시 다음 도구 호출. "메인 오케스트레이터 = Claude 본인"이므로 사용자 응답을 기다릴 대상이 없음 ([discovery-and-plan.md 5단계](./discovery-and-plan.md) 참조) |
| **예외 4가지 조건 아닌데 그냥 turn 종료** (질문/안내 출력 여부와 무관 — 멈추는 행동 자체가 문제) | 예외 4가지 외에는 같은 응답 안에 반드시 다음 도구 호출 포함. 모호하다면 추천안 1개 선택 후 진행 |

**턴 종료 판단 기준**: 워크플로우 `done` 전환 완료 OR 아래 예외 진입 시에만 턴 종료.

## 원칙 3: 중단 허용 예외 (4가지만)

다음 4개 조건일 때만 사용자에게 넘긴다. 그 외에는 같은 응답 안에서 다음 도구 호출로 이어간다.

1. **BLOCKED 상태** — 외부 의존성·권한 부족·환경 미설정으로 진행 불가
2. **진짜 모호한 의사결정** — 방향성이 갈리는 상황 (Discovery 7개 카테고리 답변이 갈리는 경우 등). 단, fast-track/자동 채움 가능한 케이스는 제외
3. **CRITICAL 발견** — 보안/결제/DB 마이그레이션 등 [code-review.md](./code-review.md) 기준 CRITICAL severity
4. **self-healing 루프 3회 실패** — 같은 라운드에서 자동 수정 3회 시도가 모두 실패

## 원칙 4: 중단 시 필수 보고 사항 (silent stop 금지)

예외 조건으로 중단할 때 다음을 반드시 명시. 사용자가 "그래서 뭐가 문제야?" 다시 묻는 상황 = 실패.

### BLOCKED 보고 필수 항목

1. 어느 도구/단계에서 막혔는지 (예: `submit_test` 호출 단계)
2. 부족한 의존성·권한·환경변수 정확히 (예: `GEMINI_API_KEY` 미설정)
3. 사용자가 무엇을 해야 풀리는지 (실행 명령·발급 링크 포함)

### 모호한 의사결정 보고 필수 항목

1. 어느 시점에서 갈렸는지 (예: Discovery "범위" 카테고리)
2. 후보 옵션 2~3개 (각각의 트레이드오프 명시)
3. 추천 옵션과 근거
4. **`AskUserQuestion` 도구로 선택지 구조화 제시** (Claude Code 내장 도구. 미지원 환경이면 자연어 번호 매김 선택지로 대체)

### CRITICAL 발견 보고 필수 항목

1. **발견된 이슈 전체 목록** (severity · 파일:라인 · 한 줄 요약). 1-2개만 추리지 말 것
2. 영향 범위 (보안/데이터 무결성/사용자 영향)
3. 수정 방향 후보 (자동 fix 가능 여부 포함)
4. 사용자 확인 받을 결정 사항 (선택지 형태로)

### self-healing 3회 실패 보고 필수 항목

1. 3회 시도 각각의 패치 내용 요약
2. 매번 다시 실패한 원인
3. 설계 결함 의심 여부
4. 사람이 결정해야 할 핵심 질문

## 보고 형식 원칙

- 한 줄짜리 "CRITICAL 발견됨", "BLOCKED" 같은 무의미 메시지 금지
- 발견 사항이 여러 개면 마크다운 리스트로 모두 나열
- 가능하면 `AskUserQuestion` 도구로 의사결정 선택지 구조화 (자유 입력 옵션 함께). 미지원 환경이면 자연어 번호 매김으로 대체
- 보고 후 사용자 응답 받으면 즉시 후속 도구 호출로 이어감

## Fast-track 케이스 ([fast-track.md](./fast-track.md))

Fast-track 1중 분류는 더 강하게 적용:

- 마커 생성 → start_work → 구현 → 빌드 → 1중 코드 리뷰 → approve_review를 **한 흐름**으로 처리
- 단계 사이 사용자 확인 절대 금지
- 정식 워크플로우보다 중단 임계치를 더 높게 (사실상 BLOCKED와 CRITICAL만)

## 참조

- 메모리: `feedback_continuous_execution.md` (로컬 개인 메모리 경로 `~/.claude/projects/-Users-leechanhee-ai-pm-system/memory/`, 저장소에 포함되지 않음 — 원칙의 원형)
- 관련 원칙: [superpowers-integration.md](./superpowers-integration.md) - subagent-driven-development "Continuous execution"
- 워크플로우 단계: [workflow-steps.md](./workflow-steps.md)
- 금지 사항: [prohibitions.md](./prohibitions.md)
