# 코드 리뷰 정책 (Codex MCP 통합 - 옵션 B: 선택 강화)

`smart_workflow(task_id, 'approve_review', ...)` 호출 전 다음 정책에 따라 리뷰 수행.

## 리뷰 강도 분류 기준

**일반 변경** (단일 리뷰):
- UI 스타일·문구 수정, 단순 버그 수정, 리팩터링(동작 동일)
- 테스트 코드만 변경, 문서/주석 변경

**중요 변경** (다중 모델 교차 검증 필수):
- **P0 우선순위 태스크** (Discovery에서 P0로 분류된 기능)
- **보안 관련**: 인증·인가·세션·암호화·SQL 구성·외부 입력 처리
- **아키텍처 변경**: 모듈 구조, 의존성, 인터페이스 계약 변경
- **DB 마이그레이션**: 스키마 변경, 데이터 백필, 인덱스 변경
- **외부 통합**: MCP 서버 추가/변경, 외부 API 연동, 인프라 설정

## 리뷰 실행 절차

**일반 변경**:
1. `code-reviewer` 에이전트(Opus) 또는 `/code-review` 스킬로 독립 리뷰
2. 통과 시 → `smart_workflow(approve_review, notes='...')`

**중요 변경 (3중 검증)**:
1. **1차 — Claude 리뷰**: `code-reviewer` 에이전트(Opus)로 품질·가독성·패턴 검토
2. **2차 — Codex 리뷰**: `codex:rescue` 스킬 또는 `/codex review`로 독립 diff 리뷰 (pass/fail 게이트)
   - 모델 다양성 확보 (GPT 계열로 편향 보정)
3. **3차 — Codex Challenge**: `/codex` skill의 challenge 모드로 적대적 검증
   - "이 코드를 어떻게 깨뜨릴 수 있나" 관점의 공격 시나리오 도출
   - 엣지케이스·경합 조건·보안 취약점 노출
4. **종합 판단**: 메인 오케스트레이터가 3개 리뷰 결과 교차 검증
   - 1·2차 모두 pass + 3차 challenge 대응 완료 시에만 승인
   - 어느 하나라도 fail/critical 발견 시 → 수정 후 재리뷰

## 산출물

- `docs/03-code-review/{task-id}-review.md`
  - Claude 리뷰 결과, Codex 리뷰 pass/fail, Challenge 발견 항목 및 대응
  - 최종 판정 및 `approve_review` notes 원문 (20자 이상)

## approve_review 호출 규칙

- 일반 변경: notes에 `code-reviewer 통과: <요약>` 명시
- 중요 변경: notes에 `code-reviewer + codex review + challenge 3중 통과: <요약>` 명시
- self-approval 금지 (코드 작성자 본인이 리뷰 결과 작성 금지)
