# 코드 리뷰 보고서

> **작성일**: 2026-03-12
> **티켓**: APS-5-5
> **리뷰 대상**: packages/mcp-server/src/, packages/web-ui/src/
> **검토 파일 수**: 37개

---

## 요약

| 심각도 | 건수 | 조치 |
|--------|------|------|
| CRITICAL | 2 | 즉시 수정 필요 |
| HIGH | 8 | 머지 전 수정 권장 |
| MEDIUM | 11 | 개선 권장 |
| LOW | 7 | 선택적 |

**결론: 보안·성능 이슈 다수 발견 - 수정 필요**

---

## CRITICAL 이슈

### [CRITICAL-1] SSL 인증서 검증 비활성화
- **파일**: `packages/mcp-server/src/db/connection.ts:22`
- **문제**: `rejectUnauthorized: false` - SSL 인증서 검증 비활성화로 MITM 공격 취약
- **조치**: 운영 환경에서 `rejectUnauthorized: true` 또는 CA 인증서 명시

### [CRITICAL-2] REST API 인증/인가 부재
- **파일**: `packages/mcp-server/src/api-server.ts:73-74`
- **문제**: `app.use(cors())` 전체 허용, DELETE /api/tasks/:id 등 파괴적 엔드포인트 무보호
- **조치**: API 키 또는 JWT 인증 미들웨어 추가, CORS 화이트리스트 설정

---

## HIGH 이슈

### [HIGH-1] index.ts God File (1073줄)
- **파일**: `packages/mcp-server/src/index.ts`
- **문제**: 30+ MCP 도구 핸들러가 단일 파일에 집중
- **조치**: 기능별 핸들러 모듈로 분리

### [HIGH-2] TaskModal.tsx 과다 책임 (992줄)
- **파일**: `packages/web-ui/src/components/TaskModal.tsx`
- **조치**: TaskTimeline, TestFixHistory, TaskMetadata 컴포넌트로 분리

### [HIGH-3] 태스크 seq 생성 레이스 컨디션
- **파일**: `packages/mcp-server/src/db/repositories/task-repo.ts:92-95`
- **문제**: `SELECT MAX(seq) + 1` 미트랜잭션 - 동시 요청 시 중복 티켓 코드 발생 가능
- **조치**: DB 시퀀스 또는 SERIALIZABLE 트랜잭션 사용

### [HIGH-4] 에픽 seq 생성 레이스 컨디션
- **파일**: `packages/mcp-server/src/db/repositories/epic-repo.ts:28-33`
- **문제**: HIGH-3과 동일 패턴

### [HIGH-5] hasCircularDependency N+1 쿼리
- **파일**: `packages/mcp-server/src/db/repositories/task-repo.ts:180-197`
- **문제**: BFS 노드당 개별 DB 쿼리
- **조치**: PostgreSQL recursive CTE 사용

### [HIGH-6] Project Activities N+1 쿼리
- **파일**: `packages/mcp-server/src/api-server.ts:280-286`
- **문제**: 태스크별 개별 쿼리 (배치 메서드 `findByTasks` 미사용)
- **조치**: `activityRepo.findByTasks(taskIds)` 배치 호출

### [HIGH-7] 의존성 체인 분석 N+1 쿼리
- **파일**: `packages/mcp-server/src/services/analysis-service.ts:182-209`
- **조치**: `getDependenciesBatch`로 일괄 조회

### [HIGH-8] Context Service nextRecommended N+1 쿼리
- **파일**: `packages/mcp-server/src/services/context-service.ts:80-88`
- **조치**: 의존성/태스크 일괄 사전 조회

---

## MEDIUM 이슈

| # | 파일 | 문제 |
|---|------|------|
| M-1 | `packages/web-ui/src/api.ts:123,128,131,138,142` | `any` 타입 남용 |
| M-2 | `services/template-service.ts:84,104,117` | `any` 타입 |
| M-3 | `services/export-service.ts:20` | `any` 타입 |
| M-4 | `pages/Dashboard.tsx:47` | 5초 폴링 과도 |
| M-5 | `pages/ProjectDetail.tsx:43` | 3초 폴링 과도 |
| M-6 | `notification-service.ts:319` | 알림 캐시 메모리 누수 가능성 |
| M-7 | 서비스 3곳 | `resolveTask` 함수 중복 |
| M-8 | 서버/클라이언트 | 타입 정의 중복 |
| M-9 | `api-server.ts:78-84` | 문자열 매칭으로 에러 상태 감지 (취약) |
| M-10 | `KanbanBoard.tsx:40` | done 컬럼에 blocked 혼재 |
| M-11 | `search-service.ts:65-76` | 날짜 범위 필터 OR/AND 논리 오류 |

---

## LOW 이슈

| # | 문제 |
|---|------|
| L-1 | 프로덕션 코드에 console.log (7개 파일) |
| L-2 | `SearchBar.tsx:45` 하드코딩 `'default-user'` |
| L-3 | 매직 넘버 (3개 파일) |
| L-4 | API 경계 입력 유효성 검사 없음 (zod 미사용) |
| L-5 | 에러 메시지 한/영 혼용 |
| L-6 | public 서비스 메서드 JSDoc 누락 |
| L-7 | `TaskCard.tsx:73-99` 인라인 스타일 (Tailwind 미사용) |

---

## 긍정적 관찰

1. Repository 패턴 + 파라미터화 쿼리 → SQL 인젝션 위험 없음
2. `TaskService.updateStatus`의 `WORKFLOW_ONLY` 가드
3. import 서비스 트랜잭션 및 롤백 정상 구현
4. 배치 쿼리 메서드 존재 (`getDependenciesBatch`, `findByTasks`)
5. 알림 중복 방지 TTL 캐시
6. `types/entities.ts` 엔티티 타입 명확히 정의
7. 로컬/리모트 듀얼 모드 아키텍처 설계 양호

---

## 권장 후속 조치

| 우선순위 | 내용 | 예상 티켓 |
|----------|------|-----------|
| 즉시 | CRITICAL-2 REST API 인증 추가 | 신규 티켓 필요 |
| 즉시 | CRITICAL-1 SSL 설정 수정 | 신규 티켓 필요 |
| 단기 | HIGH-3,4 레이스 컨디션 수정 | 신규 티켓 필요 |
| 단기 | HIGH-5,6,7,8 N+1 쿼리 최적화 | 신규 티켓 필요 |
| 중기 | HIGH-1,2 파일 분리 리팩토링 | 신규 티켓 필요 |
