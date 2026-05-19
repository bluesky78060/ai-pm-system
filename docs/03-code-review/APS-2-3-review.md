# APS-2-3 코드 리뷰 산출물

**티켓**: APS-2-3 ("메인 오케스트레이터 승인" 게이트 재정의 — silent-stop 유발 해결)
**분류**: Fast-track 1중 검증 (문서 변경)
**리뷰어**: `oh-my-claudecode:code-reviewer` (Opus)
**리뷰 일자**: 2026-05-13

## 변경 대상

| 파일 | 변경 요약 |
|------|----------|
| `.claude/rules/discovery-and-plan.md` | 5단계 제목/내용 명확화 + silent-stop anti-pattern + line 125 모호 표현 정정 |
| `.claude/rules/prohibitions.md` | "5단계 오해 금지" 항목 신규 + self-approval 표현 강화 |
| `.claude/rules/continuous-execution.md` | anti-pattern 표 2행 추가 (이후 일반화 — "멈추는 행동 자체" 기준) |
| `CLAUDE.md` | 10단계 요약 line 16: 5단계 표현 갱신 |

## 핵심 사용자 피드백 반영

> "실제 '오케스트레이터 승인대기' 라는 문구가 나오는게 아니라 오케스트레이터가 자체로 진행하지 않고 멈추고 있는게 문제야"

- 초기 anti-pattern은 특정 출력 문구("승인 대기 중") 기준 → **행동 기준("그냥 멈춤")으로 일반화**
- `continuous-execution.md` 표 row 6, 7 모두 "문구 출력 여부와 무관, 멈추는 행동 자체가 문제" 명시
- `discovery-and-plan.md` silent-stop 섹션 도입부에 동일 원칙 명문화

## 1차 리뷰 결과 (code-reviewer Opus)

| Severity | 건수 |
|----------|------|
| CRITICAL | 0 |
| HIGH (MAJOR) | 1 |
| MEDIUM | 2 |
| LOW | 1 (선택) |
| INFO | 1 (범위 외) |
| **Recommendation** | **COMMENT → self-healing 적용 후 APPROVE** |

## 발견 사항 + 대응

### [HIGH] discovery-and-plan.md:125 잔존 모호 표현 "승인"

- **이슈**: "승인 없이 start_work 금지"의 단독 "승인"이 사용자 승인으로 오해될 가능성 — 본 변경이 막으려던 그 모호함과 동일 클래스
- **수정**: "플랜 리뷰 산출물(`docs/02-review/`) 및 메인 오케스트레이터 자체 검토(체크리스트 7개 통과) 없이 start_work 및 코드 작성 시작 금지 — 여기서 '승인'은 사용자 승인이 아니라 메인 오케스트레이터의 자체 검토 통과를 의미"
- **자동 수정**: ✅

### [MEDIUM] CLAUDE.md:16 5단계 요약 stale

- **이슈**: 세션 시작 시 가장 먼저 로드되는 CLAUDE.md의 "critic + 오케스트레이터 2단 검증" 표현이 새 정의("자체 검토 후 즉시 진행")와 불일치 → AI가 멈추는 mental model 먼저 학습
- **수정**: "critic 독립 리뷰 + 메인 오케스트레이터 자체 검토 후 **즉시 다음 단계 진행** (사용자 승인 대기 단계 아님)" 로 갱신
- **자동 수정**: ✅

### [MEDIUM] continuous-execution.md anchor 링크 깨짐 가능성

- **이슈**: `#5단계` anchor는 새 제목 슬러그와 불일치. GitHub 같은 strict 렌더러에서 깨짐
- **수정**: anchor 제거하고 텍스트 링크로 변경 ("[discovery-and-plan.md 5단계](./discovery-and-plan.md)")
- **자동 수정**: ✅ (사용자 피드백 반영 일반화 작업과 함께 처리됨)

### [LOW] plan-review-guard.sh 메시지 보강

- **이슈**: hook 차단 시 안내 메시지가 새 워딩 미반영
- **결정**: 선택 사항이고, hook이 호출되는 시점은 5단계 진입 *이전*이라 silent-stop과 직접 관계 없음. 본 라운드 보류
- **자동 수정**: ❌ (의도적 보류)

### [INFO] 무관 파일 삭제

- `docs/.pdca-snapshots/snapshot-*.json` 삭제는 범위 외 cleanup. 무해

## 사용자 메시지 반영 추가 변경

리뷰어가 지적하지 않았지만 사용자 새 피드백에 따라 추가 정정:

- `continuous-execution.md` row 6: "메인 오케스트레이터 승인 대기 중 출력" → "5단계에서 critic 결과 받고 자체 검토 후 진행해야 하는데 멈춤 (문구 출력 여부와 무관, 무언의 turn 종료 포함)"
- `continuous-execution.md` row 7: "사용자 확인 부탁드립니다 출력" → "예외 4가지 조건 아닌데 그냥 turn 종료 (질문/안내 출력 여부와 무관 — 멈추는 행동 자체가 문제)"
- `discovery-and-plan.md` silent-stop 섹션 도입부 강조 추가

## 긍정 평가 (리뷰어 의견)

1. 3-layer reinforcement (discovery-and-plan + prohibitions + continuous-execution) — defense-in-depth
2. 대조 anti-pattern (❌/✅) 명확성
3. CRITICAL 예외 경로 보존 — 과보정 실패 모드 방지
4. 일관된 cross-reference
5. CLAUDE.md 최상위 진입점에 규칙 반영

## 논리 일관성 검증 (리뷰어 분석)

- code-review.md `self-approval 금지` (코드리뷰 단계 7) vs discovery-and-plan.md `self-approval 회피는 critic 1차 분리로 충족` (플랜 단계 5) — 도메인 분리, 충돌 없음
- prohibitions.md 4번 (planner ≠ critic) + 5번 (orchestrator는 즉시 진행) — 함께 성립
- 최종 흐름: critic → orchestrator reads critic result → 7-checklist → 통과 시 즉시 다음 도구 호출

## 최종 판정

**PASS (with auto-applied improvements + user feedback)**

- CRITICAL 0건
- HIGH 1건 + MEDIUM 2건 자동 수정 적용 완료 → 잔존 위험 0
- LOW 1건 의도적 보류 (영향도 낮음)
- 사용자 메시지 반영 일반화 완료 — 특정 문구 추적이 아닌 행동 기반 anti-pattern 확립
- 작성자(메인) ≠ 리뷰어(code-reviewer Opus) 분리 확인
- fast-track 1중 검증 정상 통과
