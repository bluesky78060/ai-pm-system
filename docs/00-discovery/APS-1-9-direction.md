# APS-1-9 Discovery — submit_test 검증 강화

> 방향 확정: 사용자와 직접 문답으로 결정 (build+lint+test 필수 + pass 판정 + 플래그 점진 도입).

## 1. 목표 (Why)

- **문제**: `submitTest()`(workflow-service.ts:85-96)가 형식적 검증만 수행 — build 타입 1개 존재 + 모든 output 10자 이상. **status(pass/fail)를 실제 판정하지 않음** (라인 128에서 `status==='fail'`만 아니면 overall='pass'). 즉 빌드/테스트가 실제로 통과했다는 증거를 요구하지 않고 제출자 자기신고에 의존.
- **성공 기준**: 플래그 활성 프로젝트에서 build·lint·test 모두 제출 + 모두 `status==='pass'`여야 submit_test 통과. 하나라도 누락/fail이면 거부.
- **측정**: APS 프로젝트에서 새 기준으로 submit_test 호출 시, 4종 미제출 또는 fail 포함 시 거부됨을 단위 테스트로 검증.

## 2. 사용자 (Who)

- ai-pm 워크플로우를 사용하는 프로젝트 (APS 먼저 옵트인, 이후 DIET 등 확대)
- 페인 포인트: 현재 build만 형식 제출하면 통과 → lint/test 누락·실패가 done까지 새어나감 (APS-1-8에서 실제 발생: lint 361 에러가 방치됨)

## 3. 범위 (What)

- **포함**: `submitTest()` 검증 로직 강화, 환경변수 플래그 파싱, task→project code 조회
- **제외**: submit_test 외 다른 워크플로우 액션(start_work/approve_review), test_results DB 스키마 변경
- **MVP 경계**: 플래그 ON일 때만 강화 적용. 필수 타입 = build + lint + unit(test). typecheck는 build(tsc)에 내포되므로 별도 'type' 요구 안 함.

## 4. 제약 (Constraints)

- **공유 서버**: 이 mcp-server는 Render 배포로 모든 프로젝트(APS·DIET·SLS 등)가 공유 → 전면 즉시 적용 시 모든 프로젝트 워크플로우가 깨짐 → **플래그 옵트인 필수**
- 하위호환: 플래그 미설정 프로젝트는 기존 동작(build만 + output 10자) 유지
- 기술 스택 고정: 기존 TestResult 인터페이스·status enum(pass/fail/skip) 활용

## 5. 우선순위 (Priority)

- P0: status==='pass' 실제 판정, 4종(build+lint+test) 필수, 플래그 점진(하위호환)
- P1: 명확한 거부 에러 메시지(어떤 타입 누락/어떤 항목 fail인지)

## 6. 리스크 (Risk)

- **Breaking change**: 강화가 모든 프로젝트에 즉시 적용되면 진행 중 워크플로우 차단 → **플래그 `STRICT_SUBMIT_TEST_PROJECTS`로 APS만 우선 적용**하여 완화
- task→project code 조회 실패 시 처리: 조회 불가하면 안전하게 기존(비-strict) 동작으로 폴백
- 자가검증 역설: 이 변경 자체의 submit_test가 새 기준 충족 필요 → APS-1-8에서 lint 0 선행 완료로 충족 가능

## 7. 검증 (Verify)

- **DoD**: 플래그 ON(APS)에서 (a) build+lint+test 모두 pass 제출 → 통과, (b) lint 누락 → 거부, (c) test status=fail → 거부. 플래그 OFF 프로젝트 → 기존 동작 유지.
- 단위 테스트로 위 케이스 커버
- 배포 전: pnpm lint 0, build 성공, vitest 통과 (새 테스트 포함)

## 확정 방향

플래그 기반 점진 도입으로 하위호환을 지키며, 활성 프로젝트에서 build+lint+test 4종 필수 + 전 항목 pass 판정을 강제한다. 미해결 이슈 없음.
