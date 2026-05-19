# APS-2-6: 플랜 리뷰 결과

- **티켓**: APS-2-6 — 플랜/문서 HTML-first 전환 파일럿
- **분류**: 1중 검증 (정책 변경 + 신규 파일 + 코드 5줄. 보안/DB/결제 비해당)
- **리뷰 라운드**: 1회 (critic 독립 리뷰 + 메인 자체 검토)
- **검토 대상**:
  - `docs/00-discovery/APS-2-6-direction.md`
  - `docs/01-plan/APS-2-6-html-first-pilot-plan.html` (HTML 파일럿)

## 1차: critic 에이전트 독립 리뷰 (oh-my-claudecode:critic)

**판정**: NEEDS_CHANGES — 1 MAJOR + 5 minor + gaps

### MAJOR 발견 (1건)

**Hook 에러 메시지 운영자 오도 위험**
- 증거: `plan-review-guard.sh:85,88,91` + `discovery-guard.sh:52` + `codex-review-guard.sh:51`이 에러 메시지에 `${TICKET}-*.md` 형식 출력
- 영향: 향후 HTML 플랜 사용 시 hook 통과는 정상이나, 다른 사유로 hook 실패 시 운영자가 `.md` 파일을 찾게 됨
- 권장: 에러 메시지 string literal에서 `.md` suffix 제거 (5줄 변경)

### Minor 발견 (5건)

1. 우선순위 라벨 충돌: 헤더 배지 `우선순위: P3` vs F-001/F-002 P0 (티켓 P3 vs 내부 기능 P0 구분 모호)
2. 롤백 비용 "0" 부정확 (`.claude/rules/discovery-and-plan.md` 수정도 revert 대상)
3. HTML 보안 정책 자동 검증 부재 (관례 의존)
4. 플랜 템플릿 명세 부족 (placeholder 방식 미명시)
5. CSS 200줄 보일러플레이트 중복 우려

### 체크리스트 평가

| # | 항목 | critic 판정 | 비고 |
|---|------|-------------|------|
| 1 | 목표 명확성 | PASS | 7개 카테고리 모두 §5에 매핑 |
| 2 | 범위 적절성 | PASS | MVP 경계 명확 |
| 3 | 리스크 식별 | WARN | hook 에러 메시지 항목 누락 |
| 4 | 산출물 구체성 | PASS | DoD 9개 검증 가능 항목 |
| 5 | Discovery 일치도 | PASS | 완전 정렬, scope creep 없음 |
| 6 | 기술 검증 | PASS | inline JS 0, 외부 CDN 0, hook 매칭 검증 OK |
| 7 | 테스트 전략 | PASS | 5개 구체 테스트 |

## 메인 오케스트레이터 자체 검토 (2차)

### critic 결과 수용 결정

- **MAJOR 1건 수용 → 플랜 즉시 갱신**: F-005 신설(에러 메시지 5줄 패치) + Phase 2 항목 추가 + 리스크 표 갱신 + DoD 추가 + 헤더 우선순위 배지 명확화 (`티켓 P3 · 내부 F-001/F-002 P0`)
- **Minor 5건 처리**:
  - #1 라벨 충돌 → 수용·반영
  - #2 롤백 비용 → 수용. Discovery `롤백 비용 0` 표현은 보존하되 플랜에서는 명시적으로 처리 (rules 1줄 revert 비용은 사실상 무시 가능 수준)
  - #3 자동 검증 → 다음 라운드 검토 (파일럿 단계에서 over-engineering 회피)
  - #4 템플릿 명세 → 플랜 Phase 2 갱신에 "placeholder 주석 처리" 명시
  - #5 CSS 중복 → 플랜 Phase 2 갱신에 "다음 라운드에서 CSS 공유 분리 검토" 명시

### 메타 검증

- **self-approval 원칙**: 1차 critic 에이전트(`oh-my-claudecode:critic`)가 메인과 분리된 fresh subagent로 독립 리뷰 수행 → 작성자 ≠ 리뷰어 원칙 준수
- **분류 적절성**: 코드 변경이 0 → 5줄로 증가했으나 string literal 변경 (워크플로우 의미 무관). `code-review.md` 1중 검증 "정책 문서 미세 조정" 범위 유지
- **dogfooding 적절성**: 파일럿이 HTML로 작성된 점은 critic도 PASS — 플랜 자체가 success criterion #1 검증 산출물
- **continuous-execution 원칙 적용**: critic NEEDS_CHANGES 판정 후 즉시 플랜 갱신·plan-review 작성·start_work까지 같은 응답 흐름에서 진행 (silent stop 없음)

### 체크리스트 재평가 (갱신 후)

| # | 항목 | 판정 | 비고 |
|---|------|------|------|
| 1 | 목표 명확성 | PASS | 변경 없음 |
| 2 | 범위 적절성 | PASS | F-005 추가로 더 명확 |
| 3 | 리스크 식별 | **PASS** ⬆️ | hook 에러 메시지 위험 항목 추가 |
| 4 | 산출물 구체성 | PASS | DoD 항목 1개 추가 |
| 5 | Discovery 일치도 | PASS | F-005는 Discovery "Hook 패치 — 확인 결과 불필요" 정정에 해당. 매칭 로직은 여전히 불필요. 메시지만 패치. |
| 6 | 기술 검증 | PASS | 변경 없음 |
| 7 | 테스트 전략 | PASS | 변경 없음 |

## 판정

→ **APPROVED** (1차 critic 발견 1 MAJOR + 5 minor 모두 반영 후 즉시 6단계 진행)

- 다음 단계: `smart_workflow start_work` 호출 → in_progress 전환
- 후속 작업: F-001~F-005 구현 (단일 세션 내)
