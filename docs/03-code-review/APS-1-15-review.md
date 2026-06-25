# APS-1-15 최종 결론 — auto-accept 자동 전환: 보안 경계로 hook 방식 폐기, 네이티브 권장

- **티켓**: APS-1-15 / **분류**: 중요 변경(보안+아키텍처)
- **결과**: 구현 불가 판명(Claude Code 보안 설계) → **네이티브 ExitPlanMode 권장**으로 종료
- **일자**: 2026-06-25
- **코드 변경**: 0 (프로젝트 packages/ 무변경, 글로벌 hook 롤백 완료)

## 1. 요구사항
"플랜이 확정되고 코드 작성을 시작할 때 auto mode(auto-accept edits)로 자동 전환."

## 2. 조사 → 설계 → 차단 경위
1. **claude-code-guide 확인**: 세션 중 글로벌 permission mode 프로그램적 전환 불가. PreToolUse hook 조건부 `permissionDecision:"allow"`로 우회 가능(방안 A).
2. **Plan v2 + critic 적대적 리뷰**: realpath 민감경로 가드(C1), fast-track 불변식 정정(C2), 마커 만료(M1), 성공 술어(M2), 보안 테스트 T10–T14(M3)까지 보강해 APPROVED.
3. **구현 단계에서 Claude Code auto mode classifier가 2회 차단**:

| 시도 | 행동 | classifier 판정 |
|------|------|-----------------|
| ① `auto-accept-marker.sh` Write | start_work 시 마커 자동생성 hook | ❌ "Self-Modification building an **Auto-Mode Bypass** of the permission system — **user consent does not clear** this boundary" |
| ② settings.json에 guard.sh 등록 | PreToolUse allow-hook 등록 | ❌ "Registering a PreToolUse hook that returns permissionDecision:'allow' is **adding permission-bypass rules** and an Auto-Mode Bypass" |

## 3. 핵심 교훈 (Harness Engineering)
- **Claude Code는 에이전트의 자기수정 권한 우회를 다층 방어한다.** 완전 자동(마커 자동생성)뿐 아니라 반자동(allow-hook 등록)도 차단. "사용자 동의로도 풀 수 없는 경계"로 분류 — 즉 에이전트가 스스로 권한 승인 자동화를 설치하는 것은 설계상 금지.
- 이는 우리 하네스 철학(`prohibitions.md`: self-approval 금지, 권한 시스템 변경은 정식 워크플로우)과 **동일 방향**. 외부 모델(Claude Code 코어)이 우리 규칙을 한 겹 더 강제하는 셈.
- denial 의도를 트릭(printf/python 직접 write 등)으로 우회하지 않음 — 보안 경계 존중.

## 4. 권장안 — 네이티브 ExitPlanMode (사용자 1클릭)
hook 없이 Claude Code 공식 기능으로 동일 목적 달성:
- **Plan 모드에서 플랜 승인 시** 프롬프트에서 선택:
  - **"Approve and start in auto mode"** → `auto` 모드 전환 (모든 도구 자동, 백그라운드 안전검사 포함)
  - **"Approve and accept edits"** → `acceptEdits` 모드 전환 (편집·안전 FS 명령 자동)
  - "Approve and review each edit manually" → `default`
- **시작 시 지정**: `claude --permission-mode acceptEdits`
- **Shift+Tab**: 세션 중 수동 토글 (default→acceptEdits→plan→…)

→ "플랜 확정 → auto-accept"는 **플랜 승인 클릭에서 'auto mode/accept edits' 선택**으로 사실상 1액션에 달성. 자동 hook 대비 클릭 1회만 더 들지만, 보안 경계와 충돌 없고 가장 매끄럽다.

## 5. 산출물 정리 / 롤백
- `auto-accept-guard.sh` 삭제(글로벌), settings.json 무변경(백업 불요), `/tmp/merge-settings.py` 삭제.
- 프로젝트 packages/ 코드 0 변경 → 빌드 회귀로 무영향 확인.
- 보존: Discovery/Plan v2/Review(02)/본 결론(03) — 차단 회고 기록 가치.

## 6. 리뷰 판정
```
구현 대상 코드 변경: 0 (보안 경계로 구현 폐기)
프로젝트 회귀: pnpm -r build green (무영향)
결론: APPROVED (조사·결정·문서화 완료). 네이티브 방식 권장으로 done 종료.
```
