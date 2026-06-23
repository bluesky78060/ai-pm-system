# APS-2-9 플랜 리뷰 — 개선 ④ 자동 compaction

- **리뷰어**: `critic` 에이전트 (Opus, READ-ONLY) — 플랜 작성자와 분리된 독립 패스
- **메인 오케스트레이터 자체 검토**: 통과 (체크리스트 7항목)
- **일자**: 2026-06-23
- **판정**: **APPROVED** (CRITICAL 0 / MAJOR 1 / MINOR 4 / SUGGESTION 3)

## 체크리스트 7항목 — 전부 통과
1. 목표 명확성 ✅ — Discovery 7카테고리 전부 매핑
2. 구현 범위 적절성 ✅ — MVP=문서/정책, 네이티브 엔진 구현 제외
3. 리스크 식별 ✅ — 맥락손실→field④ 필수화로 대응
4. 예상 산출물 ✅ — Phase별 검증·DoD 구체 (T2/T3 객관성은 보강 권장)
5. Discovery 방향성 일치 ✅ — 추천 분기(.omc 저장 + Phase 경계)와 정확 일치
6. 기술 검증 ✅ — 네이티브 compaction 불안정성 대응(파일 핸드오프 1차) 타당
7. 테스트 전략 ✅ — 모의 2라운드 복원 + 음성 케이스

## 특별 점검 결론
- **ultragoal↔ai-pm 이중관리 금지**: 준수 (다층 방어 확인)
- **2중 검증 분류**: 적정 (코드 변경 0줄, 전부 .md)
- **opt-in ceremony**: 대체로 방어 (Phase=라운드 등치 문구만 보강 권장)

## 🟠 MAJOR (구현 시 필수 반영)
**M-1. 기존 `agent-mapping.md` 핸드오프/조정 장치와 정합화**
- 같은 파일에 이미 존재: 원칙 1(CROSS-REGION 블록), 원칙 2(`coord:` 키 — field④와 거의 동일 페이로드), 적용 경계(중복 회피, SSOT 명문화), 원칙 4 fast-track 면제.
- **구현 지시**: (a) 라운드 핸드오프 섹션을 기존 "적용 경계(중복 회피)" 아래/인접에 **통합**(신규 중복 경계 블록 금지). (b) field④(세션/라운드 경계 fresh 인스턴스 승계 파일) vs `coord:` 키(동시·순차 sibling 계약 공유 shared_memory)의 **역할·채널·수명 구분**을 한 문장으로 명시. (c) opt-in 면제를 기존 fast-track 면제와 단일 규칙으로 참조 연결(중복 서술 금지).

## 🟡 MINOR (반영 권장)
- m-1: T2 합격 기준에 기계 검증 보조(handoff 고유 토큰 재언급 문자열 매칭) 추가
- m-2: §1 네이티브 compaction 외부 사실을 `docs/06-research/`로 영속화 또는 각주 "2026-06 기준" 명시
- m-3: "라운드 = 대형작업의 fresh 인스턴스 경계, 일반 Phase와 다름" 1줄 disambiguation
- m-4: P6(네이티브 compaction 보조)을 "MVP 제외·후속 티켓"으로 명시

## SUGGESTION
- s-1: field④ 누적 정책(델타 vs 스냅샷) 명시
- s-2: T2 모의 시나리오를 재사용 골든 픽스처로 보존
- s-3: PreCompact hook 후속 티켓 placeholder

## 처리
- APPROVED — 구현 진행. M-1은 구현 단계 작업 지시에 반영(중복 방지 통합). MINOR/SUGGESTION은 구현 시 가능한 범위 반영.
- 사용자가 "분기 추천대로 진행" 승인 → 추천 분기(.omc 저장 + Phase 경계) 채택 확정.
