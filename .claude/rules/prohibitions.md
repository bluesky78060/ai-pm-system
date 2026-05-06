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
- **플랜 작성자 본인이 플랜을 자체 승인(self-approval) 금지** - 반드시 별도 리뷰어(critic/오케스트레이터) 통과
- **메인 오케스트레이터 플랜 승인 없이 구현(start_work) 시작 금지**

## 코드 리뷰 (옵션 B)

- **중요 변경(P0/보안/아키텍처/DB 마이그레이션/외부 통합)에서 Codex 리뷰 + Challenge 생략 금지**
- **코드 작성자 본인의 리뷰 결과로 `approve_review` 호출 금지**

## Superpowers 통합

- **`superpowers:verification-before-completion` Iron Law 위반 금지** - 검증 명령 미실행 상태로 완료/통과 주장 금지
- **태스크 위임 시 fresh subagent 원칙 위반 금지** - 메인 세션 히스토리 상속한 채로 위임 금지

## gstack 배포 자동화

- **smart_workflow done 이전 PR 생성/push 금지** - `/ship` 호출은 done 상태 확인 후에만
- **CI 실패 상태에서 `/land-and-deploy` 머지 강행 금지** - 헬스 체크 통과 후 진행
- **`/canary` 모니터링 결과 이상 징후 무시 금지** - 즉시 롤백 또는 핫픽스 티켓 발행
