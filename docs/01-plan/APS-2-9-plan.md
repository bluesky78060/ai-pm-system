# APS-2-9: 라운드 간 자동 Compaction (장시간·다세션 작업) — 구현 플랜

- **티켓**: APS-2-9 (하네스 개선 ④)
- **분류**: 2중 검증 (워크플로우·정책 + ultragoal 통합)
- **우선순위**: P3 (대형 작업 한정 opt-in, 일반 작업 강제 금지)
- **선행 문서**: `docs/00-discovery/APS-2-9-direction.md`, `docs/harness-improvements-2026.html` §④
- **작성일**: 2026-06-21

> 신참 엔지니어 가정으로 작성. 모든 파일 경로·테스트 방법·DRY/YAGNI/TDD 명시.
> **본 플랜은 코드 변경을 거의 수반하지 않는다** — 산출물의 95%가 템플릿(`.claude/templates/`)·규칙 문서(`.claude/rules/`) 추가. 따라서 정식 워크플로우는 거치되 fast-track에 준하는 가벼운 사이클로 진행한다. 코드 변경 분량 판단은 §10 참조.

---

## 0. 한눈에 보기 (TL;DR)

장시간·다세션 작업(DB 마이그레이션, 대규모 리팩터링)에서 전체 대화 히스토리가 누적되면 context rot + 실패 시도 오염이 발생한다. 이를 막기 위해 **작업을 라운드(= Phase) 단위로 끊고**, 각 라운드 끝에 **구조화된 handoff artifact를 남긴 뒤**, 다음 라운드는 **fresh 인스턴스가 그 요약만 승계**하도록 한다.

- **저장 위치**: `.omc/ultragoal/<mission>/round-N-handoff.md` (로컬 전용, gitignore) — §2 결정표 권장안
- **트리거**: Phase/라운드 경계(명시적·결정론적) — §2 결정표 권장안
- **핵심 산출물**: round-handoff 템플릿 4필드(완료 / 진행 / 진입점 / 승계계약) — §3
- **네이티브 compaction**: `/compact`로 명시 호출 **가능**하나 보조 수단으로만. 상태 승계의 1차 메커니즘은 **파일 핸드오프** — §1, §5
- **불변 경계**: 상태/승인 SSOT = ai-pm MCP. ultragoal = 진행 메모 한정. **이중관리 금지** — §5

---

## 1. 핵심 설계 근거 — 네이티브 compaction 조사 결과

document-specialist가 context7 + 공식 문서로 조사한 결과(§참조), 네이티브 compaction의 명시 호출 가능 여부는 다음과 같다.

| 메커니즘 | 명시 호출 가능? | 근거 / 주의 |
|---------|:---:|------------|
| Claude Code `/compact [지시문]` | ✅ YES | 커스텀 요약 지시 인라인 가능. `CLAUDE.md`의 `## Compact instructions` 섹션도 인식 |
| `CLAUDE.md` 내 `## Compact instructions` | ✅ YES | manual + auto 양쪽이 픽업. **우리 핸드오프 4필드를 여기에 명시 가능** |
| `PreCompact` hook | ✅ YES (반응형) | `{trigger: manual\|auto, custom_instructions}`. 요약 직전 transcript 아카이브 용 |
| Agent SDK `query("/compact ...")` + `compact_boundary` 메시지 | ✅ YES | `compact_metadata.pre_tokens`로 완료 확인 |
| 서버측 `compact_20260112` + `pause_after_compaction` | ✅ YES (beta) | 요약 후 핸드오프 상태 주입 가능. **beta 헤더 필요** |
| 임계값 조건부 자동 트리거 (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) | ⚠️ PARTIAL | `settings.json` env 블록에서 **무시됨**(GitHub #63186). 셸 export만 동작 |
| auto-compaction 완전 비활성화 | ❌ NO | 공식 문서화된 경로 없음 (GitHub #42817, #24589) |
| SDK `compaction_control` 파라미터 | ⚠️ DEPRECATED | 서버측 compaction으로 대체 권장 |

### 설계 결론 (CRITICAL)

> **네이티브 compaction은 명시 호출 가능하지만, 상태 승계의 1차 메커니즘으로 의존하면 안 된다.**
>
> 이유: (a) auto-compaction이 라운드 중간에 예측 불가하게 발화할 수 있고, (b) `PreCompact` hook은 차단(blocking)이 아니라 반응형이며, (c) 임계값 조건부 트리거가 `settings.json`에서 신뢰 불가하고, (d) 완전 비활성화 경로가 없다.
>
> **따라서 본 플랜의 1차 상태 전달 메커니즘 = 파일 기반 round-handoff artifact + fresh subagent dispatch.** 네이티브 `/compact`는 **보조적 비용 절감 수단**으로만 워크플로우에 배선한다(요약 지시를 우리 4필드와 정렬). 이 분리가 §6 리스크 (a)를 구조적으로 막는다.

이 결론은 Discovery "미해결 이슈"(네이티브 compaction 명시 호출 가능 여부)를 해소한다 → **답: 가능하나 보조 수단으로만**.

---

## 2. 방향 분기 결정표 (사용자 확정 필요)

Discovery §방향 분기 2개 축. 각 옵션의 트레이드오프와 **추천안**을 제시한다.

### 결정 ① — handoff 저장 위치

| 옵션 | 경로 | 장점 | 단점 | 적합 상황 |
|------|------|------|------|----------|
| **(a) `.omc` 로컬** ⭐ | `.omc/ultragoal/<mission>/round-N-handoff.md` | ultragoal과 자연 통합. gitignore라 저장소 오염 없음. 로컬 대형 작업의 진행 메모 성격과 정합 | 팀원이 못 봄(로컬 전용) | ultragoal 통합 대형 작업 (대부분) |
| (b) `docs/` 공유 | `docs/07-handoff/<ticket>-round-N.md` | 팀 공유·PR에 포함 가능. 산출물 추적 | 라운드마다 커밋 노이즈. 임시 진행 메모를 영구 산출물로 승격하는 부담 | 팀 검토가 필요한 마일스톤급 핸드오프 |

> **추천: (a) `.omc/ultragoal/<mission>/`**. 근거: handoff는 "어디까지 했나" 진행 메모 성격(영구 산출물 아님)이고, `.omc/`는 이미 gitignore(검증: `.gitignore` 22행 `.omc/`)이며 ultragoal 저장소와 동일 위치라 통합이 자연스럽다. 단, **팀 공유가 필요한 핵심 결정**(아키텍처·DB 스키마)은 `docs/`의 정식 산출물(plan/review)에 별도 기록 → handoff는 진행 메모, `docs/`는 공식 결정. 두 경로를 혼동하지 않는다.

### 결정 ② — compaction 트리거

| 옵션 | 방식 | 장점 | 단점 | 적합 상황 |
|------|------|------|------|----------|
| **(b) Phase/라운드 경계** ⭐ | 한 Phase 완료 = 명시적 라운드 종료 시점 | 결정론적·단순. 작업 흐름의 자연 경계와 일치. 테스트·재현 쉬움 | 한 Phase가 비정상적으로 길면 그 안에서 context rot 발생 가능 | 대부분의 구조화된 워크플로우 |
| (a) 토큰 임계 도달 | 컨텍스트 N% 도달 시 자동 | context 상황에 반응적 | §1대로 `settings.json` 신뢰 불가. 비결정론적이라 테스트·재현 어려움. 라운드 중간 발화 위험 | (비권장) |

> **추천: (b) Phase/라운드 경계**. 근거: §1 조사에서 토큰 임계 조건부 트리거가 신뢰 불가(`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` settings.json 무시)로 확인됨. Phase 경계는 결정론적이라 §7 테스트(모의 대형 작업 라운드 복원)가 재현 가능하다. 네이티브 auto-compaction은 "혹시 모를 안전망"으로 켜두되, **우리 워크플로우가 의존하는 트리거는 Phase 경계**다.

### 결정 ③ — 강제 범위 (분기 아님, 불변 제약 재확인)

- 코드 변경을 수반하는 라운드는 **여전히 ai-pm 티켓 필수**. 본 compaction 메커니즘은 워크플로우를 우회하지 않는다(`omc-skills-integration.md` 경계).
- 일반 단일 티켓 작업에는 **강제 금지**. 대형·다세션 작업 한정 opt-in.

---

## 3. round-handoff 템플릿 설계

**위치**: `.claude/templates/round-handoff.md`
**형식 기준**: 기존 `.claude/templates/mcp-tool-addition.md`와 동일한 마크다운 스타일(섹션 + 체크리스트 + 예시).

### 4필드 정의 (모두 필수)

| 필드 | 의미 | 필수 여부 | 누락 시 리스크 |
|------|------|:---:|------|
| **① 완료(Done)** | 이 라운드에서 끝낸 것 (검증 통과한 산출물) | 필수 | 다음 라운드가 중복 작업 |
| **② 진행 중 상태(In-Progress)** | 현재 위치·미완 작업·열린 루프 | 필수 | 다음 라운드가 어디서 이어야 할지 모름 |
| **③ 다음 라운드 진입점(Entry Point)** | 무엇부터 시작할지 (구체적 파일·함수·명령) | 필수 | fresh 인스턴스가 방향 상실 |
| **④ 승계 계약(Inheritance Contract)** | 다음 라운드가 반드시 알아야 할 **불변 계약**: 타입 시그니처·API 계약·DB 스키마·결정된 네이밍·환경 가정 | **필수 (가장 중요)** | **§6 리스크 (a) 핵심 맥락 손실 — 가장 치명적** |

> **YAGNI**: 필드는 4개로 고정. "이번 라운드 잡담·시도했다 버린 접근" 같은 오염 정보는 **의도적으로 제외**(승계하면 안 됨). 실패 시도를 다음 라운드에 넘기지 않는 것이 이 메커니즘의 핵심 목적.

### 템플릿 본문 (작성될 파일 내용 예시)

```markdown
# Round Handoff — <mission> / Round <N>

> 다음 fresh 인스턴스는 전체 히스토리 대신 이 파일만 주입받아 복원한다.
> 상태/승인의 SSOT는 ai-pm 티켓이다. 이 파일은 진행 메모일 뿐이다.

- **티켓**: APS-X-Y  (← ai-pm가 SSOT. 이 파일은 상태를 재정의하지 않음)
- **미션**: <mission slug>
- **라운드**: N / 예상 총 라운드 (선택)
- **생성 시각**: <ISO8601>

## ① 완료 (Done)
- [x] <검증 통과한 산출물 1 — 무엇을, 어디에>
- [x] <산출물 2>

## ② 진행 중 상태 (In-Progress)
- <현재 정확한 위치: 파일:라인 / 함수 / 미완 작업>
- <열린 루프 / 미해결 결정>

## ③ 다음 라운드 진입점 (Entry Point)
- 시작점: <구체적 파일·함수·명령>
- 첫 액션: <fresh 인스턴스가 즉시 할 일>

## ④ 승계 계약 (Inheritance Contract) — 필수
> 다음 라운드가 반드시 보존해야 할 불변 계약. 누락 = 맥락 손실.
- 타입/시그니처: <예: `executeAction(input: YourInput): Promise<YourResult>`>
- API 계약: <엔드포인트·요청/응답 형태>
- DB 스키마/마이그레이션 상태: <변경된 테이블·인덱스>
- 결정된 네이밍·규칙: <합의된 이름·패턴>
- 환경 가정: <env 변수·외부 의존>

## 참조 (필요 시 추가 회수)
- 직전 라운드 handoff: round-<N-1>-handoff.md
- 관련 docs 산출물: docs/01-plan/APS-X-Y-plan.md
```

### 작성 예시 (모의 — DB 마이그레이션 라운드 1 → 2)

```markdown
# Round Handoff — db-migration-tasks-v2 / Round 1
- 티켓: APS-9-3
## ① 완료
- [x] `migrations/0007_add_status_index.sql` 작성 + 로컬 적용 검증
- [x] `task` 테이블 `status` 컬럼 enum 제약 추가
## ② 진행 중 상태
- `services/task-service.ts:142` — 새 status 값 처리 분기 미완 (TODO 주석)
## ③ 다음 라운드 진입점
- 시작점: `services/task-service.ts` `updateStatus()`
- 첫 액션: enum 신규 값 `archived` 분기 구현 + 회귀 테스트
## ④ 승계 계약
- 타입: `TaskStatus = 'todo'|'in_progress'|'review'|'done'|'archived'` (archived 신규)
- DB: `0007` 마이그레이션 적용됨. 롤백 스크립트 `0007_down.sql` 존재
- 네이밍: 신규 상태는 'archived' (us 스펠링 확정)
```

---

## 4. 기능 명세

| ID | 기능 | 우선순위 | 설명 | 엣지케이스 |
|----|------|:---:|------|----------|
| **F-001** | round-handoff 템플릿 | **P0** | `.claude/templates/round-handoff.md` 4필드 표준 (§3) | 4필드 중 ④ 누락 방지 안내 명시 |
| **F-002** | 라운드 경계 요약 생성 규칙 | **P0** | `agent-mapping.md`에 "라운드 종료 시 handoff 생성 → fresh dispatch 시 handoff만 주입" 명문화 (§5) | 작은 작업엔 적용 안 함(opt-in 경계 명시) |
| **F-003** | ultragoal 통합 + 경계 준수 | **P1** | handoff 저장 위치를 `.omc/ultragoal/<mission>/`로, 진행 메모로만. ai-pm SSOT 불변 (§5) | 상태 이중관리 금지 가드 문구 |
| **F-004** | 네이티브 compaction 보조 배선 | **P1** | `/compact` 명시 호출을 보조 비용 절감으로 배선. `## Compact instructions` 정렬 (§1) | auto-compaction 예측불가 발화 시에도 파일 핸드오프가 권위 |
| **F-005** | opt-in 적용 조건 명문화 | **P2** | 대형·다세션 작업 한정. 일반 티켓·fast-track 면제 | 단일 영역 작업에 ceremony 강제 금지 |
| **F-006** | (선택) CLAUDE.md 인덱스 1줄 | **P2** | 신규 규칙/템플릿 색인 갱신 | — |

---

## 5. ultragoal 통합 + 경계 준수 방안

`omc-skills-integration.md` §2(ultragoal)와 `prohibitions.md`의 **이중관리 금지**를 설계 전반에 반영.

### 역할 분담 (불변)

| 항목 | 담당 | 비고 |
|------|------|------|
| **상태 전이 / 승인** (start_work→submit_test→approve_review→done) | **ai-pm MCP (SSOT)** | handoff 파일은 이를 **재정의하지 않음** |
| **진행 메모** ("어디까지 했나") | ultragoal `.omc/ultragoal/<mission>/` | round-handoff 파일 = 진행 메모 |
| **공식 산출물** (plan/review/decision) | `docs/` | 팀 공유 필요한 핵심 결정 |
| **개인 선호** | `memory/` | 본 작업과 무관 |

### 경계 준수 체크리스트 (규칙 문서에 명시될 항목)

- [ ] handoff 파일에 **티켓 상태를 기록하지 않는다** (ai-pm가 SSOT). 티켓 코드는 참조만.
- [ ] ultragoal 자체 완료 게이트(ai-slop-cleaner + verification + code-review)를 **중복 적용하지 않는다** → ai-pm `approve_review`로 일원화 (`omc-skills-integration.md` §2).
- [ ] 코드 변경 수반 라운드는 **여전히 ai-pm 티켓 발행** (스킬이 워크플로우 우회 금지).
- [ ] handoff는 `.omc/`(gitignore)라 저장소에 커밋되지 않음. 팀 공유 필요한 지식은 `docs/`로 승격.

### 재시작 주입 규칙 (`agent-mapping.md` 추가 핵심)

```
## 라운드 핸드오프 (대형·다세션 작업 한정 opt-in)

대형 작업(DB 마이그레이션·대규모 리팩터링·멀티세션 기능 구축)에서만 적용.
일반 티켓·fast-track 면제.

1. 라운드(= Phase) 종료 시 → `.claude/templates/round-handoff.md` 4필드로
   `.omc/ultragoal/<mission>/round-N-handoff.md` 작성.
2. 다음 라운드 fresh subagent dispatch 시:
   - "전체 히스토리 대신 round-(N-1)-handoff.md만 주입" 지시.
   - 승계 계약(④) 필드를 프롬프트에 반드시 포함.
   - 모호하면 직전 라운드 handoff 또는 docs/ 산출물을 추가 회수.
3. (보조) 네이티브 /compact를 비용 절감으로 호출 가능. 단 상태 권위는 파일 핸드오프.
4. 상태/승인은 항상 ai-pm MCP. handoff는 진행 메모일 뿐(이중관리 금지).
```

---

## 6. 리스크 대응

| # | 리스크 | 영향 | 대응 |
|---|--------|------|------|
| **(a)** | 요약이 핵심(타입·API 계약) 누락 → 다음 라운드 맥락 손실 | **높음 (가장 치명적)** | **승계 계약(④) 필드 필수화** (§3). 템플릿에 "④ 누락 = 맥락 손실" 경고 명시. 모호 시 직전 artifact 추가 회수 규칙 (§5). |
| **(b)** | ultragoal ↔ ai-pm 역할 혼선 / 상태 이중관리 | 중 | §5 역할 분담표 + 경계 체크리스트. handoff에 티켓 상태 기록 금지 명문화. |
| **(c)** | 작은 작업에 과한 ceremony | 중 | F-005 opt-in 경계. 일반 티켓·fast-track 면제 명시. |
| **(d)** | 네이티브 auto-compaction이 라운드 중간 예측불가 발화 | 중 | §1 결론대로 파일 핸드오프를 1차 권위로. compaction은 보조. auto 비활성화 불가를 전제로 설계. |
| **(e)** | 네이티브 compaction beta API 변경 (`compact_20260112` 등) | 낮 | 우리 메커니즘은 파일 기반이라 beta API에 비의존. compaction은 optional 배선. |

---

## 7. 테스트 전략 (모의 대형 작업 라운드 복원 검증)

본 작업은 코드가 거의 없으므로(템플릿+규칙 문서) **빌드/단위 테스트보다 "모의 시나리오 복원 검증"이 핵심**.

### T1: 템플릿 구조 검증 (정적)
- `.claude/templates/round-handoff.md`가 4필드(완료/진행/진입점/승계계약)를 모두 포함하는지 확인.
- **방법**: `grep -E "완료|진행 중|진입점|승계 계약" .claude/templates/round-handoff.md` 4개 매칭.

### T2: 모의 라운드 복원 (시나리오 — 핵심 DoD)
- **시나리오**: 모의 DB 마이그레이션 미션을 2라운드로 분할.
  - 라운드 1: 마이그레이션 작성(§3 예시) → handoff 작성.
  - 라운드 2: **fresh subagent에게 round-1-handoff.md만 주입** → 라운드 2 진입점(③)에서 이어서 작업 가능한지 확인.
- **합격 기준**: fresh 인스턴스가 (1) 전체 히스토리 없이도 (2) 승계 계약(④)의 타입·스키마를 정확히 인지하고 (3) ③ 진입점에서 중복 없이 이어감.
- **방법**: 모의 handoff 작성 → 새 subagent dispatch(handoff만 프롬프트 주입) → 결과가 ④ 계약을 보존하는지 점검.

### T3: 승계 계약 보존 검증 (리스크 (a) 직접 검증)
- handoff에서 ④ 필드를 의도적으로 비운 음성 케이스 → fresh 인스턴스가 맥락 손실 발생하는지 확인 → ④ 필수화 정당성 입증.

### T4: 경계 준수 검증 (정책)
- handoff 파일에 티켓 상태가 기록되지 않는지, ai-pm SSOT가 유지되는지 규칙 문서 정합성 점검.
- ultragoal 완료 게이트가 ai-pm approve_review와 중복되지 않는지 확인.

### T5: opt-in 면제 검증
- 일반 단일 티켓/fast-track 작업에서 handoff ceremony가 강제되지 않는지(규칙 문구) 확인.

> **빌드/린트**: 코드 변경이 없으면 빌드 불필요(`dev-tips.md` "매번 빌드 안 해도 되는 경우" — 문서/.md 수정). 만약 §10에서 통합 코드(예: PreCompact hook 스크립트)가 추가되면 그 부분만 `pnpm --filter @ai-pm/mcp-server build` + 해당 테스트 실행.

---

## 8. 구현 로드맵 (Phase별)

| Phase | 작업 | 파일 | 담당(agent) | 검증 |
|-------|------|------|------------|------|
| **P1** | round-handoff 템플릿 작성 (4필드 + 예시) | `.claude/templates/round-handoff.md` | `writer` (haiku) 또는 메인 직접 | T1 |
| **P2** | 라운드 경계 요약 규칙 명문화 + 재시작 주입 규칙 | `.claude/rules/agent-mapping.md` (섹션 추가) | 메인 직접 / `writer` | T4 |
| **P3** | ultragoal 통합 경계 보강 (역할 분담·이중관리 금지) | `.claude/rules/omc-skills-integration.md` (§2 보강) 또는 agent-mapping 내 통합 | 메인 직접 | T4 |
| **P4** | opt-in 적용 조건 + (선택) CLAUDE.md 인덱스 | `CLAUDE.md` 1줄, `agent-mapping.md` | 메인 직접 | T5 |
| **P5** | 모의 라운드 복원 검증 (핵심) | (산출물 없음 — 검증 절차) | 메인 + fresh subagent | **T2·T3 (DoD)** |
| **P6** | (조건부) 네이티브 compaction 보조 배선 안내 | `agent-mapping.md` 또는 `CLAUDE.md` `## Compact instructions` | 메인 직접 | T2 |
| **P7** | 2중 코드 리뷰 (문서/정책) | `docs/03-code-review/APS-2-9-review.md` | `code-reviewer` + (`critic` 또는 정책 리뷰) 병렬 | — |

> **DRY**: P2·P3·P4는 모두 규칙 문서 수정이라 가능하면 **단일 라운드에서 묶어 작성**(파일 충돌 없으면). agent-mapping.md를 여러 Phase가 건드리므로 **순차 처리**(동일 파일 동시 수정 금지 — `agent-mapping.md` §순차 필수 패턴).
>
> **병렬 가능**: P1(템플릿, 별도 파일)은 P2~P4(규칙 문서)와 동시 dispatch 가능.

### 산출물 체크리스트

- [ ] `.claude/templates/round-handoff.md` (F-001, 4필드)
- [ ] `.claude/rules/agent-mapping.md` 라운드 핸드오프 섹션 추가 (F-002, F-005)
- [ ] `.claude/rules/omc-skills-integration.md` 또는 agent-mapping 경계 보강 (F-003)
- [ ] (선택) `CLAUDE.md` 인덱스/Compact instructions (F-004, F-006)
- [ ] `docs/02-review/APS-2-9-plan-review.md` (플랜 리뷰 — critic)
- [ ] `docs/03-code-review/APS-2-9-review.md` (2중 코드 리뷰)
- [ ] 모의 라운드 복원 검증 기록 (T2·T3 결과)

---

## 9. Discovery 7개 카테고리 매핑 + DoD

| 카테고리 | Discovery 답변 | 플랜 반영 |
|---------|---------------|----------|
| **목표(Why)** | 라운드 경계 요약 handoff 자동 생성 → fresh가 요약만 승계. 토큰↓ + 완료율 유지 | §0, F-001~F-002, §7 T2 |
| **사용자(Who)** | 대형·다세션 작업 오케스트레이터. 일반 티켓 제외 | F-005 opt-in (§5, §6-c) |
| **범위(What)** | MVP = 템플릿 + 규칙 명문화 + ultragoal 연결. 네이티브 엔진 구현 제외 | §3, §5, §8. 네이티브는 보조 배선만(F-004) |
| **제약(Constraints)** | ultragoal↔ai-pm 이중관리 금지. `.omc` gitignore. 경계 준수 | §5 (불변), §2-결정③ |
| **우선순위(Priority)** | P3. 일반 작업 강제 금지 | 헤더, F-005 |
| **리스크(Risk)** | (a)요약 누락 (b)역할 혼선 (c)과한 ceremony | §6 (a)(b)(c) + (d)(e) 추가 |
| **검증(Verify)** | 모의 대형 작업 handoff만으로 복원 가능, 승계 계약 보존 | §7 T2·T3 |

### 미해결 이슈 해소

| Discovery 미해결 이슈 | 본 플랜의 답 |
|---------------------|-------------|
| 네이티브 compaction 명시 호출 가능 여부 | **§1 — 가능하나 보조 수단으로만**. 1차 메커니즘은 파일 핸드오프 |
| 코드 변경 최소 → 2중 검증 충분한지 | **§10 — 충분**. 95% 문서/정책. 조건부 통합 코드도 2중 범위 |

### DoD (Definition of Done)

1. `.claude/templates/round-handoff.md`가 4필드(완료/진행/진입점/승계계약)를 포함하고 ④ 필수화 경고 명시.
2. `agent-mapping.md`에 라운드 경계 요약 생성 + 재시작 주입 규칙이 명문화되고, **opt-in 경계**(대형 작업 한정)가 명시됨.
3. ultragoal↔ai-pm **이중관리 금지** 경계가 규칙 문서에 명시(상태=ai-pm SSOT, handoff=진행 메모).
4. **모의 2라운드 시나리오에서 fresh 인스턴스가 round-1-handoff.md만으로 ④ 계약을 보존하고 ③ 진입점에서 이어감**(T2 통과).
5. ④ 누락 음성 케이스가 맥락 손실을 유발함을 확인(T3 — ④ 필수화 정당성).
6. 2중 코드 리뷰(`code-reviewer` + 정책 리뷰) 통과 → `docs/03-code-review/APS-2-9-review.md`.

---

## 10. 코드 변경 분량 판단 + 2중 검증 적정성

### 변경 분량

| 산출물 | 유형 | 코드? |
|--------|------|:---:|
| `round-handoff.md` 템플릿 | 마크다운 | ❌ 문서 |
| `agent-mapping.md` 규칙 추가 | 마크다운 | ❌ 정책 |
| `omc-skills-integration.md` 보강 | 마크다운 | ❌ 정책 |
| `CLAUDE.md` 인덱스 | 마크다운 | ❌ 문서 |
| (조건부) `## Compact instructions` 배선 | 마크다운 설정 | ❌ 설정 |
| (선택·비권장) PreCompact hook 스크립트 | 셸 | ⚠️ 소량 코드 |

> **MVP 범위(권장)는 통합 코드 0줄** — 전부 템플릿/규칙 문서. PreCompact hook 자동화는 **YAGNI로 MVP 제외**(네이티브 compaction이 보조 수단이라 hook 자동 배선 불필요. 필요해지면 후속 티켓).

### 2중 검증 적정성 — 결론: 충분

- 본 작업은 **워크플로우·정책 변경 + ultragoal 통합**(harness-improvements ④의 "2중" 분류와 일치).
- 보안/DB/결제/권한/인증 영역 **아님** → 3중 검증 불필요.
- 외부 API 신규 통합 **아님**, 새 서비스 클래스 **아님**.
- 단, ultragoal↔ai-pm 경계가 잘못되면 SSOT 혼선 위험 → **2중 검증의 2차를 "정책/경계 리뷰"(critic 또는 정책 관점 code-reviewer)로** 배정해 경계 준수를 집중 점검.
- **2중 검증 구성**: `code-reviewer`(문서 품질·일관성) + `critic`/정책 리뷰(경계·이중관리 금지·opt-in 정합) **병렬 dispatch**.

---

## 11. 참조

- Discovery: `docs/00-discovery/APS-2-9-direction.md`
- 개선안 원본: `docs/harness-improvements-2026.html` §④
- 네이티브 compaction 조사: document-specialist 보고 (context7 + 공식 docs — `/compact`, PreCompact hook, `compact_boundary`, `compact_20260112`, context-management beta)
- 경계 규칙: `.claude/rules/omc-skills-integration.md` §2 (ultragoal)
- 재시작 주입 대상: `.claude/rules/agent-mapping.md`
- 템플릿 형식 기준: `.claude/templates/mcp-tool-addition.md`
- 이중관리 금지: `.claude/rules/prohibitions.md`
- gitignore 검증: `.gitignore` 22행 (`.omc/`)
