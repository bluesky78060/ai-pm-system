# APS-5-13 Discovery — 개선 ③ 서버측 독립 검증 (CI 역연동)

> 플랜 우선 모드. Discovery 자동채움. **핵심 설계 분기는 §방향 분기에서 사용자 확정 필요.**

## 7개 카테고리

1. **목표(Why)**: `submit_test`가 에이전트가 제출한 출력 문자열을 신뢰(STRICT는 형식·pass 강제하나 재실행 아님) → 이론상 위조 가능. CI가 동일 커밋에서 build/lint/test를 **독립 재실행**하고 green을 done 게이트로 삼아 "verifier re-runs actual suite" 원칙 충족. 성공 기준: CI green 없이는 done 불가.
2. **사용자(Who)**: 워크플로우 검증 단계 전체. 영향 = 모든 코드 변경 티켓의 done 전환.
3. **범위(What)**: MVP = GitHub Actions로 build/lint/test 재실행 + `get_pr_status`로 checks 조회 → green 아니면 done 거부. **제외**: 자체 CI 러너 인프라, 배포 자동화(별도 gstack).
4. **제약(Constraints)**: GitHub repo `leechanhee/ai-pm-system`. Render 배포 파이프라인과 정합. 기존 도구 `get_pr_status`·`link_pr_to_task`·`sync_commit_progress` 재활용. lint은 eslint 부재 → tsc(개선 ①에서 확인된 papercut과 연계).
5. **우선순위(Priority)**: P3. **submit_test 1차 게이트 유지**(즉시 피드백) + CI 2차(권위). 이중 검증.
6. **리스크(Risk)**: (a) CI 지연이 done 속도 저하 → done 직전에만 차단. (b) PR 없는 로컬 작업 처리 → opt-in 환경변수(API_KEY enforce와 동일 패턴). (c) GitHub 토큰/권한.
7. **검증(Verify)**: 위조된 submit_test로 done 시도 → CI red면 차단 확인. green 커밋은 통과.

## 방향 분기 (플랜에서 사용자 확정)

- **게이트 위치**: (a) 서버측 `smart_workflow` done 로직에 CI 확인 내장 vs (b) 신규 PreToolUse hook(`ci-gate-guard.sh`)로 approve_review/done 차단. → hook 방식이 기존 가드(epic-id/discovery/plan-review/codex-review-guard)와 일관.
- **PR 필수화 범위**: 모든 티켓 vs 중요변경(2중/3중)만. → 단순 fast-track까지 CI 강제는 과할 수 있음.
- **lint 정합**: 개선 ① papercut(STRICT lint ↔ eslint 부재)을 본 티켓에서 같이 해소할지(tsc를 lint로 공식화 or eslint 도입).
- **추천**: hook 방식 + 중요변경 PR 필수 + tsc를 lint로 공식 인정(경량).

## 미해결 이슈
- Render 자동배포가 GitHub push 트리거인지, CI와 배포 순서 정합 확인.
- ai-pm 서버가 GitHub checks API를 조회할 인증 수단(토큰) 보유 여부.
