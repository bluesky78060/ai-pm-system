# APS-1-15 플랜 리뷰 — auto-accept 자동 전환

- **티켓**: APS-1-15 / **분류**: 중요 변경(보안+아키텍처)
- **리뷰어**: `oh-my-claudecode:critic`(Opus, 적대적 모드) + 메인 오케스트레이터 자체 검토
- **대상**: Plan v2 (`docs/01-plan/APS-1-15-auto-accept-plan.md`)
- **일자**: 2026-06-25

## 1. critic 독립 리뷰 결과 (1차)
**판정: REVISE** (적대적 모드로 에스컬레이션 — C1 실증 후)

critic이 실제 파일시스템에서 우회를 시연한 점이 핵심. 발견사항:

| ID | severity | 발견 | 실증/근거 |
|----|----------|------|-----------|
| C1 | CRITICAL | 심링크+lexical 정규화로 민감경로 가드 우회 | `/tmp/aatest`에서 `innocent.tsx→hooks/real.sh` 심링크로 타깃 덮어쓰기 시연 |
| C2 | CRITICAL | "start_work=플랜확정" 불변식이 fast-track에서 거짓 | `plan-review-guard.sh:34-42` fast-track 마커 시 산출물 0개로 통과 |
| M1 | MAJOR | 마커 누수(approve_review에서만 제거) | abandon/branch-switch/request_changes 루프 시 잔존 |
| M2 | MAJOR | 실패 start_work에도 마커 생성 가능 | PostToolUse는 에러 응답에도 발화 |
| M3 | MAJOR | 테스트가 쉬운 케이스만, 보안 케이스 누락 | T1–T9에 심링크/traversal/staleness 없음 |
| m1~m4 | MINOR | substring 오탐 / .gitignore / settings 직접수정 / non-atomic write | — |

## 2. v2 해소 검증 (메인 오케스트레이터 자체 검토)

| ID | 요구 | v2 반영 | 판정 |
|----|------|---------|------|
| **C1** | realpath resolve + out-of-root deny + 심링크 거부 | §2-1: `[ -L ]` 심링크 거부 + `os.path.realpath` + `case "$REAL" in "$PROJECT_ROOT"/*)` 밖 deny + 매칭은 REAL 기준 | ✅ 해소 |
| **C2** | 불변식 정정 또는 fast-track 결정 | §1 불변식 "정식 산출물 OR fast-track(비민감 제한)+민감경로 가드 상시"로 정정. 명시적 결정 기록 | ✅ 해소 |
| **M1** | 만료 + 티켓변경 클리어 | §2-1 12h 만료 체크 + §3-1 set-active-ticket 마커 클리어 | ✅ 해소 |
| **M2** | jq 성공 술어 | §2-2 `.error//empty` + `.task.status test in_progress` 술어 + 구현 시 실측 명시 | ✅ 해소(실측 조건부) |
| **M3** | T10–T14 | §5 심링크/traversal/만료/실패/out-of-root 추가 | ✅ 해소 |
| m1 | anchored | §2-1 세그먼트/확장자 anchored 매칭 | ✅ |
| m2 | .gitignore | §3-3 마커+로그 등록 | ✅ |
| m3 | 백업+검증 | §3-2 .bak + python round-trip | ✅ |
| m4 | atomic | §2-2 temp+mv | ✅ |
| missing | MultiEdit/audit | matcher에 MultiEdit + auto-accept.log append | ✅ |

## 3. 메인 오케스트레이터 자체 검토 의견
- **방향성 일치**: Discovery "안전 > 자동화 편의" 원칙과 v2 정합. 자동화 범위를 최소화하고 fail-safe(의심 시 manual) 유지.
- **잔여 리스크(수용)**: 
  - M2 성공 술어는 **구현 시 start_work 실제 응답 1회 실측**으로 확정해야 함(critic Open Question). 미실측 시 보수적으로 마커 미생성(안전 측).
  - C1의 위협모델은 self-use 단일 개발자(공격자 repo write 필요 + git status로 즉시 탐지)이나, named escalation 컨트롤이므로 realpath 방어를 정식 구현.
  - substring→anchored 전환으로 UX(~95%) 일부 하향 가능하나 안전 우선 수용.
- **구현 게이트**: T10–T14(보안 케이스)가 전부 pass해야 submit_test. realpath 방어가 핵심이므로 T10/T11/T14 실패 시 구현 미완.

## 4. 최종 판정
```
critic 1차: REVISE (C1/C2 CRITICAL + M1/M2/M3 MAJOR)
v2 해소: C1/C2/M1/M2/M3 + minor 전부 반영
메인 오케스트레이터 자체 검토: 해소 확인
→ APPROVED (구현 진행). 단 M2 술어 실측 + T10–T14 pass를 구현 게이트로 강제.
```
구현 후 code-reviewer + codex review + challenge 3중 검증에서 realpath 방어·마커 생명주기를 재확인한다.
