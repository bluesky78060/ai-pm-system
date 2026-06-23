---
paths:
  - ".omc/**"
---

# OMC 신규 스킬 통합 정책 (4.14.7)

OMC 4.14.7에서 추가된 신규 스킬 중 본 프로젝트에 채택한 **3종**의 사용 정책.
**핵심 원칙: 기존 메커니즘(ai-pm MCP ledger · `docs/` 산출물 · `memory/` 선호)과의 역할 중복을 피한다.**

> 제외: `local-build-reminder` — OMC 로컬 포크 개발 전용(HUD `L` 접미사 트리거)이라 본 프로젝트와 무관. 미채택.

## 채택 스킬별 역할 경계와 주의사항

### 1) wiki — 프로젝트 기술 지식 축적 🟢

- **용도**: 세션을 넘어 축적되는 **기술 지식** — 아키텍처 근거, 설계 결정의 "왜", 반복 디버깅 패턴, 환경 특이사항
- **저장소**: `.omc/wiki/*.md` (gitignore, 로컬 전용) · 카테고리: `architecture` / `decision` / `pattern` / `debugging` / `environment` / `session-log`
- **트리거**: "wiki", "wiki this", "wiki add", "wiki query", "wiki lint"

#### ⚠ 중복 회피 — 역할 분담 (가장 중요)

| 저장소 | 담는 것 | 담지 않는 것 |
|--------|---------|-------------|
| `docs/` (00-discovery ~ 06-research) | 워크플로우 **산출물** (티켓별 discovery/plan/review/research) | 일반 기술 지식 |
| `~/.claude/projects/.../memory/` | **개인 선호·피드백** (작업 방식, 사용자 스타일) | 프로젝트 기술 상세 |
| `.omc/wiki/` | **프로젝트 기술 지식** (결정 근거·패턴·디버깅 경험) | 티켓 산출물, 개인 선호 |

- **금지**: 티켓 산출물을 wiki에 중복 기록(→ `docs/`), 개인 선호를 wiki에 기록(→ `memory/`)
- **권장**: `_security-base.ts` 보안 패턴, 워크플로우 규칙 변천사, 반복되는 빌드/배포 트러블슈팅을 wiki `pattern`/`debugging`으로 축적
- **위생**: 주기적으로 `wiki lint` 실행 — orphan/stale/모순 페이지 탐지

### 2) ultragoal — 대규모 다단계 작업의 세션 연속성 보조 🟡

- **용도**: DB 마이그레이션·대규모 리팩터링 등 **여러 세션/워크트리에 걸친 대형 작업**의 진행 보존 + Claude `/goal` Stop hook 연동(세션 집중 유지)
- **저장소**: `.omc/ultragoal/` (gitignore)

#### ⚠ 중복 회피 — ai-pm MCP가 주(主), ultragoal은 보조

- **ai-pm 티켓 = 공식 ledger**: 상태 전이(start_work→submit_test→approve_review→done)·리뷰 게이트·활동 로그의 **단일 진실 공급원(SSOT)**
- **ultragoal = 보조 도구**: 큰 작업을 세션이 멈추지 않게(`/goal`) + 세션 재시작 후 진행 복원하는 용도로만
- **금지**: ultragoal ledger를 ai-pm 티켓 상태와 **이중 관리** 금지. 공식 상태/승인은 **언제나 ai-pm MCP** 기준. ultragoal은 "어디까지 했나" 진행 메모로만
- **적용 조건**: 단일 티켓으로 다루기엔 너무 크고 여러 세션이 필요한 작업에 한정. 일반 티켓은 기존 워크플로우 그대로
- **완료 게이트**: ultragoal 자체 게이트(ai-slop-cleaner + verification + code-review)는 본 프로젝트 코드리뷰 정책([code-review.md](./code-review.md))과 **중복 적용하지 말고** ai-pm `approve_review`로 일원화

### 3) autoresearch — 측정 기반 AI 품질 개선 🟡

- **용도**: 평가자(evaluator) 점수로 측정 가능한 **AI 추론 품질 개선** — 예: `priority-recommendation-service`·`analysis-service`의 추천/분석 정확도 반복 튜닝
- **저장소**: `.omc/autoresearch/<mission-slug>/` (gitignore)
- **선행**: `/deep-interview --autoresearch`로 미션·평가자(JSON `pass`/`score`) 먼저 생성

#### ⚠ 중복 회피 — ralph와 성격 구분

| 스킬 | 루프 성격 | 종료 조건 |
|------|----------|----------|
| `ralph` | 기능 구현 PRD 루프 (story별 pass/fail) | 전 story passes:true + 리뷰 |
| `autoresearch` | **단일 지표 최적화** (evaluator score 반복 개선) | max-runtime 등 명시적 ceiling |

- **금지**: 일상 기능 구현/버그 수정에 autoresearch 사용 금지(→ ralph 또는 일반 워크플로우)
- **적용 조건**: "측정 가능한 단일 지표를 반복 개선"하는 작업에 한정. 코드 변경이 수반되면 **여전히 ai-pm 티켓 발행 필수**

## 공통 주의사항

- `.omc/**` 영속 아티팩트는 모두 **gitignore**(로컬 전용) — 저장소에 커밋되지 않음. 팀 공유가 필요한 지식은 `docs/`로 승격
- 세 스킬 모두 **코드 변경을 수반하면 티켓-우선 워크플로우([CLAUDE.md](../../CLAUDE.md)) 적용 필수** — 스킬이 워크플로우를 우회하지 않음
- 기존 SSOT 존중: **상태/승인 = ai-pm MCP**, **산출물 = `docs/`**, **개인 선호 = `memory/`**. 신규 스킬은 이 경계를 침범하지 않는 범위에서만 보조

## 참조

- 워크플로우 단계: [workflow-steps.md](./workflow-steps.md)
- 코드 리뷰 정책: [code-review.md](./code-review.md)
- 연속 실행 원칙: [continuous-execution.md](./continuous-execution.md)
