# 금지 사항 (전체 워크플로우 강제 규칙)

## 티켓 / 워크플로우

- **epic_id: null로 티켓 발행 절대 금지** - 대시보드에 표시되지 않음
- 티켓 없이 코드 변경 금지
- `update_task_status`로 testing→review, review→done 직접 전환 금지 (서버 차단됨)
- 빌드 미실행 submit_test / 리뷰 미수행 approve_review 금지
- project_id만 지정하고 epic_id 누락 금지

## Discovery → 플랜 → 플랜 리뷰

- **Discovery Q&A 산출물(`docs/00-discovery/`) 없이 플랜 작성 시작 금지**
- **사용자의 "방향 확정" 승인 없이 플랜 작성 단계 진행 금지**
- **플랜 리뷰(`docs/02-review/`) 산출물 없이 구현 시작 금지**
- **플랜 작성자 본인이 플랜을 자체 승인(self-approval) 금지** - 반드시 별도 리뷰어(critic 에이전트 — planner와 분리된 fresh subagent)가 1차 통과
- **5단계 "메인 오케스트레이터 승인"을 사용자 승인 게이트로 오해 금지** - 메인 오케스트레이터 = Claude 본인. critic 1차 리뷰 결과 종합 후 즉시 6단계로 진행. "오케스트레이터 확인 대기" 같은 자체 표현으로 턴 종료 금지 (`.claude/rules/continuous-execution.md` silent-stop 규정 적용)
- **플랜 리뷰 산출물(`docs/02-review/`) 부재 상태에서 start_work 호출 금지** - hook(`plan-review-guard.sh`)으로 강제 차단됨

## 코드 리뷰 (옵션 B)

- **중요 변경(P0/보안/아키텍처/DB 마이그레이션/외부 통합)에서 Codex 리뷰 + Challenge 생략 금지**
- **코드 작성자 본인의 리뷰 결과로 `approve_review` 호출 금지**

## Superpowers 통합

- **`superpowers:verification-before-completion` Iron Law 위반 금지** - 검증 명령 미실행 상태로 완료/통과 주장 금지
- **태스크 위임 시 fresh subagent 원칙 위반 금지** - 메인 세션 히스토리 상속한 채로 위임 금지

## 연속 실행 (Continuous Execution)

상세: `.claude/rules/continuous-execution.md`

- **단계 사이 명시적 확인 질문 금지** - "다음 단계로 진행할까요?" 등 워크플로우 진행 동의 재확인 금지
- **암묵적 정지(silent stop) 금지** - 도구 결과 받고 요약만 출력하고 턴 종료 금지. 예외 조건이 아니면 같은 응답에 다음 도구 호출까지 포함
- **중단 시 무내용 보고 금지** - BLOCKED/CRITICAL/self-healing 실패로 중단할 때 "문제 발생함" 같은 한 줄 메시지로 끝내기 금지. 이슈 전체 목록·영향 범위·결정 사항을 모두 보고
- **CRITICAL 이슈 일부만 보고 금지** - 발견된 모든 항목을 severity·파일:라인과 함께 나열 (1-2개만 추리지 말 것)
- **사용자가 "그래서 뭐가 문제야?" 다시 묻게 만드는 보고 금지** - 첫 보고에 필요한 모든 정보 포함

## gstack 배포 자동화

- **smart_workflow done 이전 PR 생성/push 금지** - `/ship` 호출은 done 상태 확인 후에만
- **CI 실패 상태에서 `/land-and-deploy` 머지 강행 금지** - 헬스 체크 통과 후 진행
- **`/canary` 모니터링 결과 이상 징후 무시 금지** - 즉시 롤백 또는 핫픽스 티켓 발행
