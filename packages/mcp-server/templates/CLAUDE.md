# Ticket-First Development (필수)

이 프로젝트의 모든 코드 변경 작업은 **AI PM System MCP를 통해 티켓을 발행한 후 진행**해야 합니다.

## 프로젝트 설정

> 아래 값을 프로젝트에 맞게 수정하세요.

- **프로젝트 이름**: `MY_PROJECT`
- **프로젝트 ID**: `<get_project_status로 확인>`
- **프로젝트 코드**: `<자동 생성됨>`

## 작업 프로세스

### 1단계: 티켓 발행 (코드 수정 전 반드시 수행)

```
1. get_project_status로 에픽 목록 확인
2. 해당 에픽이 없으면 create_epic으로 생성
3. create_task로 티켓 생성 (epic_id 필수 지정)
4. .claude/active-ticket 파일에 티켓코드 기록
```

### 2단계: 상태 머신 준수

```
todo → in_progress → testing → review → done
                       ↓                  ↓
                     fixing → testing    in_progress (재작업)

어디서든 → blocked 전환 가능
```

- `update_task_status`로 상태 전환
- 작업 시작: `todo` → `in_progress`
- 빌드/테스트 검증: `in_progress` → `testing`
- 테스트 통과: `testing` → `review`
- 코드 리뷰 통과: `review` → `done`
- 테스트 실패: `testing` → `fixing` → `testing` (반복)

### 3단계: 활성 티켓 관리

소스 코드 수정 전에 반드시 활성 티켓을 설정:

```bash
# 티켓 활성화 (작업 시작 시)
echo "PRJ-1-3" > .claude/active-ticket

# 티켓 해제 (작업 완료 후)
rm .claude/active-ticket
```

> PreToolUse hook이 설정되어 있으면, 활성 티켓 없이 소스 코드를 수정하려 할 때 자동 차단됩니다.

## MCP 도구 목록

| 도구 | 용도 |
|------|------|
| `create_project` | 프로젝트 생성 (최초 1회) |
| `create_epic` | 에픽(기능 영역) 생성 |
| `create_task` | 티켓 발행 |
| `update_task_status` | 상태 전환 |
| `get_project_status` | 프로젝트 진행률 조회 |
| `get_session_context` | 현재 작업 컨텍스트 |
| `get_blocking_analysis` | 블로킹 분석 |
| `smart_workflow` | 복합 워크플로우 (start_work, submit_test 등) |
| `auto_analyze` | 프로젝트 자동 분석 (daily_report, bottleneck, velocity) |

## 금지 사항

- 티켓 없이 코드 변경 작업을 시작하지 않는다
- `testing` → `review` → `done`을 실제 검증 없이 형식적으로 통과시키지 않는다
- 상태 머신을 우회하지 않는다 (예: `todo`에서 바로 `done` 불가)
