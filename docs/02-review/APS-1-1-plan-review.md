# APS-1-1: 플랜 리뷰 결과

- **티켓**: APS-1-1
- **리뷰 라운드**: 2 (1차 반려 → v2 작성 → 2차 조건부 승인 → v2-patched)
- **리뷰일**: 2026-05-07
- **리뷰 대상**: `docs/01-plan/APS-1-1-research-plan.md` (v2-patched)

## 라운드 1 결과 (요약)

- 판정: **반려**
- Critical 4건 + Major 8건 + 엣지케이스 9건 미반영
- 반려 카운트: 1/3

## 라운드 2 결과 (critic Opus 독립 리뷰)

### Critical 4건 해결 여부 (모두 ✅)

| # | 지적 | v2 해결 |
|---|------|---------|
| 1 | `confirmed` 입력 스키마 누락 | F-001에 `confirmed: boolean` 명시 + 호출자 책임 규약 |
| 2 | SDK 미검증 | `@google/genai` v1.52.0 + 공식 문서 URL 3개 첨부 (v2-patched) |
| 3 | 커버리지 도구 누락 | T1에 `@vitest/coverage-v8`, T3에 임계값 80% 설정 |
| 4 | TDD 순서 모순 | T4(테스트 RED) → T5(서비스 GREEN) → T6(도구 등록) |

### Major 8건 해결 여부 (모두 ✅)

| # | 지적 | v2 해결 |
|---|------|---------|
| 1 | DRY classifyError 거짓 | `classifyGeminiError` 신규 작성으로 정직 표현 |
| 2 | e2e 게이트 모호 | T10 고정 토픽 + 비용 한도 $0.05 명시 |
| 3 | API 키 보안 누락 | F-008 보안 위험 섹션 신설 |
| 4 | 프롬프트 인젝션 미고려 | F-002 sanitization·길이 제한·구분자 |
| 5 | 경로 정당화 | 04(tests)/05(deploy) 다음 슬롯 06 사용 |
| 6 | 도구 내 승인 모순 | 호출자 책임으로 재정의 |
| 7 | "3.5단계" 명명 | "선택적 리서치 단계 (3→4 사이)" |
| 8 | task_id 검증 | 정규식 `^[A-Z]+(-\d+)+$` 강제 |

### 엣지케이스 9건 해결 여부 (7 ✅, 2 ⚠️ Minor 보완)

✅ 빈 응답 / race condition / 긴 입력 / 디렉터리 자동 생성 / streaming / 테스트 격리 / 모델 deprecation
⚠️ non-UTF8 (얕은 처리, 향후 보강 가능) / 프록시 (HTTPS_PROXY 미언급, Minor)

### 라운드 2 → v2-patched 필수 수정 4건 (즉시 반영 완료)

| # | 필수 수정 | 반영 위치 |
|---|----------|----------|
| 1 | `.env.example` 신규 생성 → 기존 파일에 append로 정정 | F-007, T2, 산출물 체크리스트 |
| 2 | SDK 검증 근거 URL 추가 | v1→v2 변경 요약 표 |
| 3 | 태스크 번호 일관성 | v1→v2 변경 요약에 정확한 T4→T5→T6 명시 |
| 4 | 변수명 통일 (confirmed) | "변수명 통일" 명문 추가 |

### 새로 발견된 이슈 (Minor — 구현 중/후 보완 권장)

- `docs/05-deploy/` 슬롯 컨벤션 정립 또는 경로 재검토
- F-006 CLAUDE.md 10단계 표 통합 방식 구체화
- `parseSources` 악성 URL 필터링 (javascript:, data:, file://)
- timestamp suffix에 pid/uuid 추가 (같은 ms 충돌 방지)
- non-UTF8/invalid surrogate 처리 보강
- 모델 deprecation fallback 정책 작성 위치
- MAX_OUTPUT_TOKENS 비용 추정 기준일

→ 모두 Minor이므로 구현 단계에서 코드 리뷰와 함께 처리 가능.

## 강점 Top 3 (라운드 2)

1. v1 지적의 **본질적 수용** (표면적 패치가 아님 확인)
2. 보안·엣지케이스 섹션의 **구조적 보강**
3. SDK 변경 결정의 **외부 검증 추가** (WebSearch + 공식 docs URL)

## 최종 판정 (v2-patched)

- [x] **승인** (필수 수정 4건 모두 반영 완료)
- [ ] 조건부 승인
- [ ] 반려

### 메타 검증

- **작성자 ≠ 리뷰어**: ✅ 메인 오케스트레이터 작성, critic 에이전트 독립 리뷰
- **self-approval 금지**: ✅ 통과
- **반려 카운트**: 1/3 (라운드 2는 조건부 승인 → 카운트 미증가 → v2-patched로 즉시 승인)

## 다음 단계

6단계 팀 에이전트 병렬 위임 → 7단계 빌드/테스트 → 코드 리뷰 (Codex 3중 검증, 중요 변경 분류).
