---
paths:
  - "docs/00-discovery/**"
  - "docs/01-plan/**"
  - "docs/02-review/**"
  - "docs/06-research/**"
---

# Discovery Q&A → 플랜 작성 → 플랜 리뷰 (3~5단계 상세)

## 3단계: Discovery Q&A → 프로젝트 방향 확정

- **Superpowers 스킬**: `superpowers:brainstorming` 자동 트리거 (스펙 추출 + 청크 단위 검토)
- **목적**: 플랜 작성 전 사용자와 자세한 문답으로 프로젝트 방향을 확정
- **수행 주체** (단축 정책 — 분류별 차등 적용):
  - **자동 채움 (P0/P1, 외부 통합, 신규 기능)**: `analyst` 에이전트가 코드베이스·과거 티켓·docs 분석 후 7개 카테고리 답변 초안 자동 작성 → 사용자 검토. **표준 호출 prompt**: `.claude/templates/discovery-auto-fill.md`
  - **메인 직접 (1중 분류, 단순 변경)**: 메인 오케스트레이터가 직접 간략 작성 (사용자 응답 대기 우회). 적용 케이스: 단순 버그 수정, 문서 변경, 정책 미세 조정
  - **사용자 수동 답변**: 가장 엄격한 케이스 (보안·결제·DB 마이그레이션 신규 도입)

### 필수 질문 카테고리 (모두 답변 확보 전 플랜 작성 금지)

1. **목표(Why)**: 해결하려는 문제, 성공 기준, 측정 지표
2. **사용자(Who)**: 주 사용자, 사용 시나리오, 페인 포인트
3. **범위(What)**: 포함/제외 기능, MVP 경계, 향후 확장 여부
4. **제약(Constraints)**: 기술 스택 고정 여부, 기한, 리소스, 호환성 요구사항
5. **우선순위(Priority)**: P0/P1/P2 기준, 트레이드오프 시 우선 가치
6. **리스크(Risk)**: 알려진 위험, 의존 외부 시스템, 실패 시 영향도
7. **검증(Verify)**: 완료 정의(DoD), 테스트 방식, 배포 전 체크리스트

### 산출물·종료 조건

- **산출물**: `docs/00-discovery/{ticket-id}-direction.md`
  - 질문/답변 기록, 확정된 방향성, 미해결 이슈 명시
- **종료 조건**: 사용자가 "방향 확정" 명시적으로 승인
- **승인 없이 플랜 작성 단계로 진행 금지**

## 선택적 리서치 단계 (3→4 사이)

Discovery에서 외부 정보 조사가 필요하다고 판단된 경우(라이브러리 비교, 보안 취약점, 모범 사례, 디버깅) 플랜 작성 전 Gemini 자동 리서치를 실행할 수 있습니다.

### 호출 규약 (CRITICAL)

`research_with_gemini` MCP 도구는 stateless이므로 **도구 자체가 사용자 승인을 받을 수 없습니다**. 메인 오케스트레이터가 다음 절차를 따릅니다:

1. 사용자에게 비용/필요성을 명시적으로 확인 ("Gemini API 호출 1회당 약 $0.05 예상, 진행할까요?")
2. 사용자 승인 후 `confirmed: true`로 도구 호출
3. `confirmed !== true` 시 도구가 즉시 `NOT_CONFIRMED` 반환

### 호출 예시

```typescript
mcp__ai-pm__research_with_gemini({
  task_id: "APS-1-1",                       // ticket code 형식 강제
  topic: "Node.js 환경변수 안전 관리 모범 사례",  // 1~500자
  purpose: "best_practice",                  // library_compare | security_audit | best_practice | debugging
  context: "TypeScript 모노레포 프로젝트",       // 0~2000자 (선택)
  confirmed: true                            // 사용자 승인 후 true
})
```

### 산출물

- **경로**: `docs/06-research/{ticket_id}-research-{ISO8601 압축형}-{ms}.md`
- **형식**: 마크다운 (티켓/목적/모델/생성일/메트릭 + 요약 + 참고 자료)
- **메트릭**: input_tokens, output_tokens, duration_ms

### 환경변수

`GEMINI_API_KEY` 환경변수 필수. 발급: https://aistudio.google.com/apikey

### 강제성

선택 사항입니다 (hook으로 강제 차단 안 함). 다만 다음 상황에서 강력 권장:
- P0 기능 + 새 라이브러리 도입
- 보안/인증/암호화 영역 변경
- 디버깅이 30분 이상 진행되는 막힘 상태

### 보안

- API 키는 `~/.zshrc` 또는 `.env`로 관리 (코드/로그에 절대 노출 금지)
- 도구 내부에서 에러 메시지의 API 키 자동 마스킹
- 사용자 입력(`topic`, `context`)은 prompt 인젝션 방어 후 Gemini로 전달

## 4단계: 플랜 작성

- **Superpowers 스킬**: `superpowers:writing-plans` 자동 트리거 (파일별/태스크별 분해 + TDD/YAGNI/DRY 강제)
- **선결 조건**: 3단계 Discovery 산출물(`docs/00-discovery/`) 존재 필수
- planner/executor 에이전트로 플랜 작성 (`docs/01-plan/` 저장)

### 플랜 문서 형식 (MD 기본 · HTML 선택)

- **기본**: 마크다운(`.md`) — 모든 기존 플랜 형식
- **선택**: HTML(`.html`) — Thariq Shihipar (Anthropic) "Unreasonable Effectiveness of HTML" + Karpathy 진화 경로 노선. 시각 자산(표·배지·진행률·반응형) 필요한 플랜에 권장 (APS-2-6 파일럿 결과 참고)
- **선택 기준**:
  - MD → 텍스트 위주 단순 플랜, fast-track, 짧은 정책 변경
  - HTML → 복잡 다중 Phase, 비교표 다수, 외부 디바이스(iPad 등)에서도 검토 필요한 경우
- **HTML 작성 보안 정책** (필수 준수):
  - `<script>` 태그·`on*` 이벤트 핸들러·`javascript:` URL 금지 (inline JS 금지)
  - 외부 CDN 금지 (스타일·폰트·이미지 inline 또는 system font만)
  - 외부 이미지 금지 (필요 시 SVG inline)
  - 한 줄당 1 요소 원칙 (git diff 가독성 보존)
- **템플릿**: `.claude/templates/plan-template.html`
- Hook 호환: `discovery-guard.sh`·`plan-review-guard.sh`·`codex-review-guard.sh`는 확장자 무관 ticket-id 매칭이라 `.md`/`.html` 모두 통과 (APS-2-6에서 검증)

### 플랜 문서 필수 포함 항목

- 기능 명세: `F-001`, 우선순위 `P0(필수)/P1(중요)/P2(선택)`, 엣지케이스
- 기술 스택, 구현 로드맵 (Phase 1~N), 예외 처리 계획
- **Discovery 결과 반영 섹션**: 3단계에서 확정된 방향성을 어떻게 충족하는지 매핑
- **Superpowers 가이드 적용**: 신참 엔지니어 가정으로 작성 (파일 경로·테스트 방법·DRY/YAGNI/TDD 명시)

## 5단계: 플랜 리뷰 → 메인 오케스트레이터 자체 검토 후 즉시 다음 단계 진행

- **목적**: 작성된 플랜의 품질·실현가능성·방향성 일치도를 다각도로 검증
- **수행 주체** (작성자와 분리된 별도 패스로 진행):
  - 1차: `critic` 에이전트(Opus) 또는 `/oh-my-claudecode:review` 스킬로 **독립 리뷰** (self-approval 회피는 이 1차 분리로 충족)
  - 2차: **메인 오케스트레이터(Claude 본인) 자체 검토 후 즉시 6단계로 진행** — 사용자 승인 대기 단계가 아님
  - 선택: `plan-eng-review`(아키텍처) / `plan-design-review`(UI) / `plan-ceo-review`(스코프) / `plan-devex-review`(DX) 추가 적용

### ⚠ 자주 발생하는 silent-stop 패턴 (금지)

`continuous-execution.md` 위반 사례. **특정 문구를 출력했는지 여부가 아니라 "멈추는 행동 자체"가 문제**임에 유의:

- ❌ critic 1차 리뷰 결과 받고 **그냥 turn 종료** (질문도 안 했지만 다음 도구 호출 없음)
- ❌ critic 결과만 요약 보고하고 "다음 단계 진행할까요?" 묻고 종료
- ❌ "메인 오케스트레이터 승인 대기" 같은 표현으로 멈춤 (자기 자신이 오케스트레이터인데 누구를 기다리는가)
- ❌ 5단계 = 사용자 승인 게이트로 오해 (사용자 승인은 3단계 Discovery '방향 확정' 한 번으로 충분)
- ✅ critic 결과 종합 + 체크리스트 통과 판정 + **같은 응답 안에 6단계 도구 호출까지 포함**

5단계는 사용자 인터랙션 없는 내부 검증 단계. critic 결과 보고 후 멈추면 **문구 출력 여부와 무관하게 silent-stop**. **단, CRITICAL 결함 발견 시는 `continuous-execution.md`의 4가지 예외 보고 절차 적용**.

### 리뷰 체크리스트 (모든 항목 통과 시에만 승인)

1. **목표 명확성**: Discovery 7개 카테고리 답변이 플랜에 모두 반영되었는가
2. **구현 범위 적절성**: MVP 경계가 명확하고 P0/P1/P2 우선순위가 합리적인가
3. **리스크 식별**: Discovery에서 도출된 리스크에 대한 대응 방안이 있는가
4. **예상 산출물**: 각 Phase별 결과물·검증 방법·DoD가 구체적인가
5. **Discovery 방향성 일치도**: 사용자가 확정한 방향과 어긋남이 없는가
6. **기술 검증**: 선택한 스택·아키텍처가 제약 조건과 호환되는가
7. **테스트 전략**: 검증 가능한 테스트 계획이 포함되었는가

### 산출물·결과 처리

- **산출물**: `docs/02-review/{ticket-id}-plan-review.md`
  - 리뷰어별 코멘트, 체크리스트 통과 여부, 수정 요구사항, 최종 판정(승인/반려)
- 승인 시 → 다음 단계 진행
- 반려 시 → 플랜 수정 후 재리뷰 (구현 절대 불가), **최대 3회**
- 3회 반려 시 → Discovery 단계로 회귀하여 방향 재확인
- **플랜 리뷰 산출물(`docs/02-review/`) 및 메인 오케스트레이터 자체 검토(체크리스트 7개 통과) 없이 start_work 및 코드 작성 시작 금지** — 여기서 "승인"은 사용자 승인이 아니라 메인 오케스트레이터의 자체 검토 통과를 의미
