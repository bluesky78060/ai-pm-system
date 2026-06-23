# Round Handoff 템플릿 (대형·다세션 작업 한정)

장시간·다세션 작업의 라운드 경계에서 작성하는 승계 메모. 다음 fresh 인스턴스는 **전체 히스토리 대신 이 파일만 주입받아** 복원한다. 실패 시도·잡담 등 오염 정보는 **의도적으로 제외**한다(승계 금지).

- **저장 위치**: `.omc/ultragoal/<mission>/round-N-handoff.md` (로컬 전용, gitignore)
- **적용 조건**: 대형·다세션 작업만 (일반 티켓·fast-track 면제 — `agent-mapping.md` "라운드 핸드오프 (대형·다세션 작업 한정 opt-in)" 섹션)
- **경계**: 상태/승인 SSOT = ai-pm 티켓. 이 파일은 진행 메모일 뿐 **티켓 상태를 재정의하지 않는다**.

---

## 템플릿 본문 (복사해서 사용)

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
> ⚠ 다음 라운드가 반드시 보존해야 할 불변 계약. **누락 = 맥락 손실(가장 치명적)**.
> 이 필드를 비우지 말 것 — 비우면 fresh 인스턴스가 방향을 잃는다.
- 타입/시그니처: <예: `executeAction(input: YourInput): Promise<YourResult>`>
- API 계약: <엔드포인트·요청/응답 형태>
- DB 스키마/마이그레이션 상태: <변경된 테이블·인덱스>
- 결정된 네이밍·규칙: <합의된 이름·패턴 (예: enum 철자 'archived' US 스펠링 확정)>
- 환경 가정: <env 변수·외부 의존. **어느 환경에 적용됐는지** 명시 (예: 0007은 로컬만 적용, staging/prod 미적용)>
- 가역성(Reversibility): <롤백 스크립트 유무·백필 가역성 (예: 0007_down.sql 존재 / 비가역)>
- 건드리면 안 되는 영역(Do-not-touch): <다음 라운드가 수정하면 안 되는 파일·계약·전이 규칙>
- 누적 정책: 직전 라운드 ④에서 **변경된 계약만 갱신**하되 유효 계약은 누적 승계(델타+캐리)

## 참조 (필요 시 추가 회수)
- 직전 라운드 handoff: round-<N-1>-handoff.md
- 관련 docs 산출물: docs/01-plan/APS-X-Y-plan.md
```

---

## 4필드 정의 (모두 필수)

| 필드 | 의미 | 누락 시 리스크 |
|------|------|------|
| **① 완료(Done)** | 이 라운드에서 검증 통과한 산출물 | 다음 라운드가 중복 작업 |
| **② 진행 중 상태(In-Progress)** | 현재 위치·미완 작업·열린 루프 | 어디서 이어야 할지 모름 |
| **③ 진입점(Entry Point)** | 무엇부터 시작할지 (구체적 파일·함수·명령) | fresh 인스턴스 방향 상실 |
| **④ 승계 계약(Inheritance Contract)** | 불변 계약: 타입·API·DB 스키마·네이밍·환경 | **핵심 맥락 손실 — 가장 치명적** |

## ④ 승계 계약 vs `coord:` shared_memory 키 (혼동 금지)

`agent-mapping.md` 원칙 2의 `coord:` 키와 페이로드가 유사하지만 **채널·수명·용도가 다르다**:

| 구분 | round-handoff ④ 승계 계약 | `coord:<ticket>:<영역>` 키 (원칙 2) |
|------|--------------------------|-----------------------------------|
| 용도 | **세션/라운드 경계**에서 fresh 인스턴스 승계 | **동시·순차 sibling 에이전트** 간 계약 공유 |
| 채널 | 파일 (`.omc/ultragoal/<mission>/`) | `shared_memory` (오케스트레이터 전용) |
| 수명 | 라운드 진행 메모 (미션 종료까지) | 티켓 `done` 시 `shared_memory_delete` 정리 |

> 같은 계약을 두 채널에 **이중 기록하지 말 것**. 라운드 승계는 ④(파일), sibling 공유는 `coord:`(메모리)로 분리한다.

## 작성 예시 (모의 — DB 마이그레이션 라운드 1)

```markdown
# Round Handoff — db-migration-tasks-v2 / Round 1
- 티켓: APS-9-3
## ① 완료
- [x] `migrations/0007_add_status_index.sql` 작성 + 로컬 적용 검증
## ② 진행 중 상태
- `services/task-service.ts:142` — 새 status 값 처리 분기 미완 (TODO)
## ③ 다음 라운드 진입점
- 시작점: `services/task-service.ts` `updateStatus()`
- 첫 액션: enum 신규 값 `archived` 분기 구현 + 회귀 테스트
## ④ 승계 계약
- 타입: `TaskStatus = 'todo'|'in_progress'|'review'|'done'|'archived'` (archived 신규)
- DB: `0007` 적용됨. 롤백 `0007_down.sql` 존재
- 네이밍: 신규 상태는 'archived' (us 스펠링 확정)
```
