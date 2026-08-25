/**
 * 에러 메시지 문자열로 HTTP 상태 코드를 정한다. api-server.ts의 wrapAsync가 사용한다.
 *
 * ⚠️ APS-1-18: 이 함수는 **메시지 내용**으로 상태를 가른다. 따라서 서비스 계층의 에러 문구나
 * 자리표시자를 바꾸면 API 계약이 조용히 바뀐다. 문구를 수정할 때는 아래 키워드 목록을 먼저 볼 것.
 *
 * 실제 사고: APS-1-18 초안이 태스크 식별자 fallback을 '식별자 없음'으로 바꾸려 했다.
 * '식별자 없음'에 '없'이 들어 있어 400이어야 할 상태 전환 오류가 404가 됐다. 그래서 현재
 * 자리표시자는 '미상'이다(workflow-service.ts의 workflowFailure 참조).
 *
 * ⚠️ APS-1-35: 409 분기('circular'/'already'/'duplicate')는 **현재 도달하지 않는다.**
 * 저장소의 throw 메시지 전수 검사 결과 이 세 키워드를 쓰는 곳이 0곳이다 — 예를 들어
 * '순환 의존성이 감지되었습니다'는 한국어라 409가 아니라 400으로 나간다. 별도 티켓에서 다룬다.
 *
 * **422 분기는 살아 있다.** notification-settings-service.ts의 `Invalid event type: ...`이
 * PATCH /api/notification-settings/:eventType 경로로 실제 422를 낸다.
 * 이 메시지를 바꾸면 그 엔드포인트의 상태 코드가 바뀐다.
 *
 * 이 파일이 api-server.ts에서 분리된 이유는 테스트가 **실제 함수**를 import해 검증할 수 있게
 * 하기 위해서다. api-server.ts는 export가 없는 Express 부트스트랩 스크립트다.
 * 로직을 테스트 파일에 복사하면 이 함수가 바뀌어도 테스트는 모른다.
 */
export function getErrorStatus(msg: string): number {
	const lower = msg.toLowerCase();
	if (lower.includes('not found') || lower.includes('없')) return 404;
	if (lower.includes('circular') || lower.includes('already') || lower.includes('duplicate'))
		return 409;
	if (
		lower.includes('invalid') ||
		lower.includes('must') ||
		lower.includes('required') ||
		lower.includes('cannot')
	)
		return 422;
	return 400;
}
