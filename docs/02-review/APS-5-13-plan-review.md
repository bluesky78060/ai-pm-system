# APS-5-13 플랜 리뷰 — 개선 ③ 서버측 독립 검증 (CI 역연동)

- **리뷰어**: `critic` 에이전트(Opus) — 작성자와 분리된 독립 패스 (rev1 CHANGES_REQUESTED → rev2 재리뷰)
- **메인 오케스트레이터 자체 검토**: 통과 + enrollment 기준 확정
- **일자**: 2026-06-23
- **판정**: **ACCEPT-WITH-RESERVATIONS** (구현 진입 허용, enable 전 enrollment 기준 확정 조건)

## 리뷰 이력
- **rev1**: CHANGES_REQUESTED — CRITICAL 1 + MAJOR 4 (owner/repo SSOT, fail모드, 분기B 구현불가, PR순서 역전, union 로직)
- **rev2**: 위 5건 + gap 3건 **전부 코드대조로 해소 확인**. B→C 스코프 변경이 §상단 NOTE·§2·§6·DoD에 일관 반영(rev1 잔재 모순 없음).

## rev2에서 새로 노출된 MAJOR (1건) — 해소 결정

**MAJOR: `ci_gate_required`의 `priority<=2` proxy가 스키마 default=3과 충돌**
- 근거: `migrate.ts:24` priority DEFAULT 3, scale 1(high)-5(low). priority는 코드베이스에서 "실행 순서/긴급도"로 운용(중요도 아님). `priority<=2`면 default-3 티켓(이 P3 인프라 티켓 포함) 전부 게이트 면제 → "위조 submit_test→미검증 done"이 다수 티켓에서 통과(기능 목적 훼손).
- 완화: 전체 opt-in default-off라 enable 전 무피해. plan O-1에 미해결로 인지됨.
- **해소 결정 (메인 오케스트레이터 확정)**: **priority proxy 폐기.** 서버 enforcement = **enrolled 프로젝트(`CI_GATE_PROJECTS`)의 비-fast-track 티켓 전체**(coarse, 프로젝트 단위) + **hook(changed-files 접근)이 fast-track/1중 면제**(fine). priority 의미 충돌이 구조적으로 제거됨. `ci_gate_required` per-task 플래그 대신 프로젝트 enroll + hook 면제 2층으로 단순화. plan O-1을 이 결정으로 갱신하여 구현.

## MINOR (구현 시 반영)
1. `workflow-service.ts`에 `activityRepo` 주입 여부를 Phase 3 구현 전 확인(없으면 추가).
2. 신규 `getCommitCiStatus`의 `error`와 기존 `getPrStatus` catch의 `state:'error'`(mergeable_state 경로) 관계를 1줄 구분.

## 체크리스트 7항목 — 통과
목표·범위·리스크·산출물·Discovery일치·기술검증·테스트전략 전부 통과(rev2 기준). CRITICAL-path(approveReview done) 회귀 안전성은 opt-in default-off로 보장(`resolveStrict` 패턴 재사용, env 미설정 시 bypass) — 코드 확인됨.

## 처리
- **ACCEPT-WITH-RESERVATIONS → 구현 진입 허용.**
- **출하 조건**: default-OFF (`CI_GATE_PROJECTS` 미설정 시 회귀 0). 구현 후 3중 검증(code-reviewer + security-reviewer/codex + adversarial) 필수.
- **enable 조건 (별도·사용자 명시 단계)**: `CI_GATE_PROJECTS`에 APS 추가 전 enrollment 기준(위 해소 결정)·PR-before-done 강제 범위 최종 확인. 본 구현은 enable하지 않는다.
