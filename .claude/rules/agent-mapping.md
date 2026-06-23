---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "packages/**/*.css"
---

# 에이전트 유형 × bkit 스킬 매핑 (필수 준수)

| 작업 유형 | 에이전트 | 모델 | bkit 스킬 |
|-----------|----------|------|-----------|
| 백엔드 API/로직 | `executor` | sonnet | `/phase-4-api` |
| 복잡한 백엔드 | `executor-high` | opus | `/phase-4-api` |
| UI 컴포넌트 | `designer` | sonnet | `/phase-5-design-system` |
| 복잡한 UI 시스템 | `designer-high` | opus | `/phase-5-design-system` |
| 간단한 수정 | `executor-low` | haiku | — |
| 문서 작성 | `writer` | haiku | `/pdca` |
| 코드 탐색 | `explore-medium` | sonnet | — |
| 보안 검토 | `security-reviewer` | opus | `/security-review` |
| 빌드 에러 | `build-fixer` | sonnet | `/build-fix` |

## 병렬 실행 원칙 (강화)

### 기본 원칙
- 독립 파일/기능은 동시 실행, 의존성 있는 작업은 순차 실행
- **파일 충돌 방지**: 동일 파일을 여러 에이전트가 동시 수정 금지
- 각 에이전트는 자신의 작업 완료 후 결과를 메인 오케스트레이터에 보고

### 병렬화 가능 패턴 (적극 적용)

| 시나리오 | 권장 |
|---------|------|
| **코드 리뷰 다중 라운드** | 1차/2차/3차를 **단일 메시지에서 병렬 dispatch** (1차 통과 대기 X) |
| **TDD 단순 패턴** | T4(테스트) + T5(구현) 동시 위임 가능 (구현 후 테스트로 검증) |
| **Phase 4 문서 작업** | CLAUDE.md / rules / README 동시 dispatch (각각 다른 파일) |
| **레이어별 풀스택** | DB + API + UI 각 레이어 다른 파일 → 동시 위임 |
| **빌드 + 테스트 + 린트** | 같은 코드에 대해 동시 실행 (각각 독립적) |

### 순차 필수 패턴 (병렬 금지)

- 동일 파일 수정 (예: `index.ts`에 도구 등록 + 다른 도구 추가)
- 의존성 있는 작업 (T5 서비스 → T6 도구 등록)
- request_changes → submit_test (상태 전환 의존)

### 단일 메시지 다중 dispatch 예시

```
# 코드 리뷰 2중 검증 — 병렬
[Agent 1: code-reviewer]
[Agent 2: security-reviewer]
→ 두 결과를 동시 수신 후 종합 판단

# 풀스택 위임 — 병렬
[Agent 1: executor-high → DB 마이그레이션]
[Agent 2: executor → API 라우트]
[Agent 3: designer → React 컴포넌트]
→ 3개 결과 수신 후 메인이 통합
```

**효과**: 리뷰 라운드 60% 단축, T4+T5 병렬 시 50% 단축.

## 에이전트 협력 프로토콜 (적극 교류)

에이전트는 격리되어 서로 직접 통신할 수 없다(실시간 P2P 불가). 따라서 보완·협력이 필요한 경우, **무제한 대화가 아니라 "구조화된 핸드오프를 더 자주·더 명시적으로"** 하는 방식으로 적극 교류한다. 모든 cross-region 교류는 메인 오케스트레이터를 중재로 거친다.

> 개념 상세·다이어그램: `docs/orchestration-overview.html` §11 (조정·교정 메커니즘)
>
> **도구 권한 전제**: MCP 도구(`shared_memory_*` 등)는 메인 오케스트레이터 컨텍스트에서만 호출 가능(`~/.claude/rules/design-stitch.md` 운영 가정). 서브에이전트는 발견을 final message로 **반환**하고, 영속화·전달은 오케스트레이터가 수행한다.

### 원칙 1: 핸드오프 권고 블록 (종료 시 반환)

에이전트가 작업 중 **다른 영역(다른 에이전트 담당)에 영향을 주거나 보완이 필요한 사항**을 발견하면, final message 끝에 아래 블록을 포함하도록 **권장**한다(발견이 없으면 생략 또는 "없음"). 이 블록은 §11 "권고 반환 → 재dispatch" 경로를 구조화한 **신규 템플릿**이다 — 실제 적용하려면 에이전트 프롬프트/Workflow 스키마에 이 필드를 명시해야 한다(선결 조건).

```
### 🔁 CROSS-REGION 권고
- 대상 영역/에이전트: <예: executor(백엔드) / designer(UI)>
- 권고 내용: <무엇을 어떻게>
- 사유/근거: <왜 필요한가>
- 시급도: BLOCKING(이게 안 되면 내 결과 무효) / RECOMMENDED / FYI
```

- 오케스트레이터는 이 블록을 라우팅 큐로 처리 → 대상 에이전트 (재)dispatch 시 프롬프트에 주입
- BLOCKING이면 해당 영역 먼저 처리 후 본 에이전트 재투입 — **이때부터 원칙 4의 핑퐁 카운터가 1라운드로 시작**
- **강제 한계**: 현재 PreToolUse hook은 에이전트 final message를 파싱하지 않으므로 이 블록은 hook으로 차단 강제되지 않는다. 오케스트레이터가 결과 수신 시 누락·모호 여부를 점검하고 필요 시 재요청한다(절차적 검증)

### 원칙 2: shared_memory 협력 게시판 (오케스트레이터 pre-seed)

병렬 fan-out에서 **동시 실행 중인 sibling 에이전트는 서로의 mid-run 결과를 볼 수 없다**(격리 + MCP 도구 오케스트레이터 전용). 따라서 공유가 필요한 정보는 아래 경로로만 전달된다.

- **선행 → 후속 (순차)**: 오케스트레이터가 선행 에이전트의 반환 결과에서 공유 계약을 추출해 `coord:<ticket-id>:<영역>` 키로 **pre-seed**한 뒤 후속 에이전트를 dispatch. 후속 에이전트 프롬프트에 "작업 시작 전 `coord:<ticket-id>:*` 조회" 지시 포함 (예: `coord:APS-7-3:api-contract`)
- **동시 fan-out**: sibling 간 실시간 공유 **불가** — 공유 계약이 필요하면 그 부분은 병렬화하지 말고 순차로 분해(원칙 4 예방). 이미 pre-seed된 키만 읽힌다
- **기록 대상 / value 형식**: 공유 계약(타입·API 시그니처·DB 스키마)·변경된 전제·충돌 위험 경고를 `{출처 task_id, 영역, 계약 요약, 타임스탬프}` 형태로
- **충돌 중재**: 두 에이전트 반환이 같은 계약을 다르게 제안하면 오케스트레이터가 fan-in 시점에 중재(에이전트끼리 해결 불가)
- **수명·정리**: `shared_memory`는 세션 횡단이라 stale `coord:` 키가 남는다. 오케스트레이터는 티켓 `done` 전환 시 `coord:<ticket-id>:*`를 `shared_memory_delete`로 정리
- **한계·구분**: 비동기 블랙보드이지 실시간 협상이 아니다(§11 "이미 써둔 것만 봄. 실시간 협상 불가"). 진행 메모·중간 로그는 `notepad`(세션 한정), 영역 간 공유 계약은 `coord:` 키로 구분

### 원칙 3: 강결합은 파이프라인 또는 경계 재설정

두 영역이 핸드오프 1~2회로 끝나지 않고 계속 얽히면, 개별 dispatch 대신:

- **team / Workflow 파이프라인**: 단계 간 핸드오프를 결정론적으로 내장 (OMC `/team`, Workflow `pipeline()` — 프로젝트에 셋업된 범위에서)
- **경계 재설정**: 한 에이전트가 두 영역을 함께 담당하거나, `architect`/`critic`이 양쪽 컨텍스트를 받아 통합 판단

### 원칙 4: 핑퐁 상한 (재투입 라운드 캡)

A↔B 상호 의존으로 재투입(핑퐁)이 반복되면 무한 루프 위험. **같은 A↔B 쌍의 재투입은 최대 3라운드** (기존 self-healing "3회 실패" 임계값과 정합 — `continuous-execution.md` 원칙 3-④, `code-review.md` self-healing).

- 초과 시 → 설계 결함(경계 분해 실패) 신호로 간주 → 원칙 3(경계 재설정) 적용
- 그래도 수렴 안 하면 → 사용자 에스컬레이션. 이는 **self-healing 3회 실패 예외**(`continuous-execution.md` 원칙 3-④)에 해당하므로 그 보고 체크리스트(3회 시도별 패치 요약·매번 실패 원인·설계 결함 의심·핵심 질문)를 적용한다 (모호한 의사결정 예외가 아님)
- **예방이 최선**: 애초에 의존 방향을 한쪽으로 정리(B→A 순차)하면 핑퐁이 0이 된다 → "순차 필수 패턴(병렬 금지)"의 본래 목적

### 적용 경계 (중복 회피)

- 워크플로우 **상태/승인**은 여전히 ai-pm MCP가 SSOT — 협력 프로토콜은 상태 전이를 대체하지 않음
- 협력 권고는 **에이전트 결과 보고**의 일부일 뿐, 티켓 상태에 이중 기록 금지
- **self-healing과의 관계**: 원칙 1의 CROSS-REGION 블록은 §11 "권고 반환 → 재dispatch" 경로를 구조화한 것이고, self-healing 루프(`code-review.md`)는 그 경로의 **한 인스턴스**(code-reviewer 판정으로 트리거)다. 채널은 신규가 아니지만 **블록 형식 자체는 신규 의무**이므로 에이전트 프롬프트/스키마 업데이트가 선결
- **fast-track과의 관계**: fast-track(1중·단일 영역·단일 에이전트)은 cross-region 대상이 없으므로 본 프로토콜 면제("없음" 트리비얼). 단일 영역 작업에 협력 ceremony 강제 금지

## 라운드 핸드오프 (대형·다세션 작업 한정 opt-in) — APS-2-9

장시간 작업(DB 마이그레이션·대규모 리팩터링·멀티세션 기능 구축)에서 전체 히스토리 누적으로 인한 context rot·실패 시도 오염을 막기 위해, 작업을 **라운드 단위로 끊고** 각 라운드 끝에 승계 메모를 남긴 뒤 **fresh 인스턴스가 요약만 승계**한다. 템플릿: `.claude/templates/round-handoff.md`.

> **여기서 "라운드"는 대형 작업에서 fresh 인스턴스 교체가 일어나는 세션/컨텍스트 경계**를 뜻하며, 일반 티켓의 Phase 진행과 다르다. 일반 단일 티켓·fast-track 작업에는 적용하지 않는다(위 "fast-track과의 관계" 면제 규칙을 그대로 따른다 — 별도 면제 규칙을 신설하지 않음).

### 재시작 주입 규칙

1. 라운드 종료 시 → `.claude/templates/round-handoff.md` 4필드(완료/진행/진입점/**승계 계약**)로 `.omc/ultragoal/<mission>/round-N-handoff.md` 작성.
2. 다음 라운드 fresh subagent dispatch 시:
   - "전체 히스토리 대신 `round-(N-1)-handoff.md`만 주입" 지시.
   - 승계 계약(④) 필드를 프롬프트에 반드시 포함. 모호하면 직전 handoff 또는 `docs/` 산출물 추가 회수.
3. (보조) 네이티브 `/compact`를 비용 절감으로 호출 가능. 단 **상태 승계의 권위는 파일 핸드오프**다(auto-compaction이 라운드 중간 예측불가 발화해도 파일이 1차 근거). 네이티브 auto-compaction 자동 배선(PreCompact hook 등)은 MVP 제외 — 별도 후속 티켓 (네이티브 compaction 동작은 2026-06 기준).

### 적용 경계 (중복 회피 — 위 §"적용 경계 (중복 회피)"를 그대로 상속)

- **SSOT·이중관리 금지**: 위 적용 경계 규칙대로 상태/승인은 ai-pm MCP가 SSOT. handoff 파일은 진행 메모이며 **티켓 상태를 기록하지 않는다**(티켓 코드는 참조만). 별도 경계 규칙을 신설하지 않고 기존 규칙을 상속한다.
- **④ 승계 계약 vs 원칙 2 `coord:` 키 (혼동 금지)**: 페이로드(타입·API·DB 스키마)는 유사하나 **채널·수명·용도가 다르다** — ④는 *세션/라운드 경계*의 fresh 인스턴스 승계용 **파일**(미션 종료까지), `coord:`는 *동시·순차 sibling* 계약 공유용 **shared_memory**(티켓 `done` 시 정리). **같은 계약을 두 채널에 이중 기록 금지**(상세 비교표: `round-handoff.md`).
- **ultragoal 완료 게이트 비중복**: ultragoal 자체 게이트(ai-slop-cleaner+verification+code-review)를 중복 적용하지 않고 ai-pm `approve_review`로 일원화(`omc-skills-integration.md` §2).
- **워크플로우 우회 금지**: 코드 변경 수반 라운드는 여전히 ai-pm 티켓 필수.
