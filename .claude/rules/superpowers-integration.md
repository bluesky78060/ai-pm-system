# Superpowers 통합 (옵션 1: 보강 통합)

기존 워크플로우 골격은 유지하되, 5개 Superpowers 스킬을 자동 트리거로 활성화하여 각 단계의 디테일을 보강.

## 워크플로우 단계별 자동 트리거 매핑

| 단계 | Superpowers 스킬 | 역할 |
|------|------------------|------|
| 3단계 Discovery | `superpowers:brainstorming` | 스펙 추출 + 청크 단위 사용자 검토 |
| 4단계 플랜 작성 | `superpowers:writing-plans` | 파일별/태스크별 분해, TDD/YAGNI/DRY 강제 |
| 5단계 플랜 리뷰 | `superpowers:requesting-code-review` (플랜 대상) | 리뷰어 컨텍스트 격리 패턴 |
| 6단계 팀 위임 | `superpowers:subagent-driven-development` | 태스크별 fresh subagent + spec/품질 2단 리뷰 |
| 6단계 병렬 위임 | `superpowers:dispatching-parallel-agents` | 독립 태스크 2개+ 시 단일 메시지 병렬 발사 |
| 7단계 빌드/테스트 | `superpowers:verification-before-completion` | Iron Law: 검증 명령 실행 증거 없이 완료 주장 금지 |
| 7단계 코드 리뷰 | `superpowers:requesting-code-review` | 리뷰어 컨텍스트 격리, 작업 산출물 중심 평가 |
| 디버깅 작업 시 | `superpowers:systematic-debugging` | investigate → analyze → hypothesize → implement |

## 핵심 원칙 (Superpowers 차용)

- **Fresh subagent per task**: 매 태스크마다 컨텍스트 격리된 새 에이전트 호출, 세션 히스토리 상속 금지
- **Two-stage review**: spec 준수 리뷰 → 코드 품질 리뷰 순차 진행
- **Continuous execution**: 태스크 사이에 사용자 확인 요청 금지 (BLOCKED 또는 모호함 발생 시에만 중단)
- **Iron Law**: 검증 명령(`pnpm build`, `pnpm test` 등)을 실제 실행한 출력 없이 완료 주장 금지
- **Evidence before claims**: 모든 완료 주장은 즉시 실행한 검증 증거를 동반

## 충돌 없음 검증

- 우리 hook(epic-id-guard, discovery-guard, plan-review-guard, codex-review-guard)은 **강제 차단** 역할
- Superpowers 스킬은 **품질 가이드** 역할
- 두 시스템은 직교(orthogonal): hook이 통과시킨 호출에 대해 Superpowers가 품질을 보강
