# APS-2-9 Discovery — 개선 ④ 라운드 간 자동 compaction

> 플랜 우선 모드. Discovery 자동채움. **핵심 설계 분기는 §방향 분기에서 사용자 확정 필요.**

## 7개 카테고리

1. **목표(Why)**: 장시간·다세션 작업에서 전체 대화 히스토리 누적 → context rot + 실패 시도 오염. 라운드 경계에서 요약 handoff를 자동 생성해 fresh 인스턴스가 **요약만 승계**하도록. 성공 기준: 대형 작업 세션당 토큰↓ + 완료율 유지/개선.
2. **사용자(Who)**: 대형 작업(DB 마이그레이션, 대규모 리팩터링, 멀티세션 기능 구축) 수행 시의 오케스트레이터. 일반 단일 티켓 작업은 대상 아님.
3. **범위(What)**: MVP = round-handoff 템플릿(`.claude/templates/`) + 라운드 경계 요약 생성 규칙(`agent-mapping.md` 명문화) + ultragoal 연결. **제외**: 네이티브 compaction 엔진 자체 구현(Claude Code/SDK 제공 기능 활용).
4. **제약(Constraints)**: **ultragoal ↔ ai-pm 이중관리 금지**(상태/승인 SSOT = ai-pm). `.omc/`는 gitignore 로컬 전용. `omc-skills-integration.md` 경계 준수.
5. **우선순위(Priority)**: P3. 일반 작업에 강제 금지(대형 작업 한정 opt-in).
6. **리스크(Risk)**: (a) 요약이 핵심(타입·API 계약) 누락 → 다음 라운드 맥락 손실. (b) ultragoal/ai-pm 역할 혼선. (c) 작은 작업에 과한 ceremony.
7. **검증(Verify)**: 모의 대형 작업에서 handoff만으로 다음 라운드 복원 가능한지, 승계 계약 필드 보존 확인.

## 방향 분기 (플랜에서 사용자 확정)

- **handoff 저장 위치**: (a) `.omc/ultragoal/<mission>/round-N-handoff.md`(로컬) vs (b) `docs/`(공유). → ultragoal 통합이면 (a), 팀 공유 필요하면 (b).
- **트리거**: (a) 토큰 임계 도달 vs (b) Phase/라운드 경계(명시적). → 경계 방식이 결정론적이고 단순.
- **강제 범위**: 코드 변경 수반 시 여전히 ai-pm 티켓 필수(스킬이 워크플로우 우회 금지).
- **추천**: `.omc/ultragoal` 저장 + Phase 경계 트리거 + 템플릿 4필드(완료/진행/진입점/승계계약).

## 미해결 이슈
- Claude Code/Agent SDK의 네이티브 compaction을 워크플로우에서 명시 호출할 수 있는지(문서 확인).
- 본 변경 자체는 코드 변경 최소(템플릿+규칙 문서) → 2중 검증으로 충분한지 플랜 리뷰에서 재확인.
