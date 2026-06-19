/**
 * _security-base.ts — 외부 API 통합 공유 보안 모듈 (APS-1-2)
 *
 * APS-1-1(research-service)에서 검증된 보안 패턴을 추출하여 향후 외부 API 통합 작업에서
 * 재사용 가능하도록 한다. 신규 외부 API 통합 시 본 모듈을 import하여 보안 패치 라운드를 생략.
 *
 * 추출 함수 (7개):
 *  1. maskApiKey                — API 키 마스킹
 *  2. sanitizeErrorMessage      — 에러 메시지 4중 마스킹 (raw + AIza + ?key= + Bearer/Basic)
 *  3. buildPromptInjectionMarkers — 64-bit nonce 마커 생성
 *  4. sanitizeUserInput         — 백틱 zero-width space 치환
 *  5. atomicWrite               — 임시 파일 + rename 패턴 + mode 0o600
 *  6. validateTaskId            — 정규식 + 길이 검증
 *  7. filterSafeUrls            — 위험 스킴 필터 + 길이/개수 cap
 *
 * 의존성: Node.js builtin만 사용 (다른 service에 의존하지 않음 — 순환 차단)
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';

// ──────────────────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────────────────

/** task_id 정규식: 대문자 prefix + (-숫자) 1회 이상 (예: APS-1-1) */
export const TICKET_PATTERN = /^[A-Z]+(-\d+)+$/;
/** task_id 길이 캡 — 파일시스템 ENAMETOOLONG 방어 */
export const TASK_ID_MAX_LEN_DEFAULT = 64;
/** filterSafeUrls 단일 URL 길이 cap */
export const URL_MAX_LEN_DEFAULT = 2048;
/** filterSafeUrls 결과 개수 cap */
export const URL_MAX_COUNT_DEFAULT = 50;

// ──────────────────────────────────────────────────────────────────
// 1. API 키 마스킹
// ──────────────────────────────────────────────────────────────────

/**
 * API 키 마스킹: 처음 4자 + '***'. 빈/짧은 키는 통째로 '***'.
 *
 * @param key - 마스킹할 API 키
 * @returns 마스킹된 문자열 (예: "AIza***", "***")
 */
export function maskApiKey(key: string | null | undefined): string {
	if (!key || key.length < 8) return '***';
	return `${key.slice(0, 4)}***`;
}

// ──────────────────────────────────────────────────────────────────
// 2. 에러 메시지 4중 마스킹
// ──────────────────────────────────────────────────────────────────

/**
 * 에러 메시지에서 API 키 노출을 차단하는 4중 마스킹.
 * 1) 현재 사용 중인 키 자체 정확 매치 (raw)
 * 2) Google API 키 일반 패턴 (`AIza` + 20자+) — partial/다른 키 차단
 * 3) URL 쿼리 파라미터 형태 (`?key=...`, `&key=...`)
 * 4) Authorization 헤더 형태 (`Bearer ...`, `Basic ...`)
 *
 * @param rawMessage - 원본 에러 메시지
 * @param apiKey - 마스킹 대상 키 (선택)
 * @returns 마스킹된 메시지
 */
export function sanitizeErrorMessage(rawMessage: string, apiKey?: string): string {
	let out = rawMessage;
	// 1) 현재 사용 중인 키 자체 (정확 매치)
	if (apiKey && apiKey.length > 0) {
		const escaped = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		out = out.replace(new RegExp(escaped, 'g'), maskApiKey(apiKey));
	}
	// 2) Google API 키 일반 패턴
	out = out.replace(/AIza[0-9A-Za-z_\-]{20,}/g, 'AIza***');
	// 3) URL 쿼리 파라미터 키
	out = out.replace(/([?&]key=)[^&\s]+/gi, '$1***');
	// 4) Authorization 헤더 (Bearer/Basic)
	out = out.replace(/(Bearer|Basic)\s+[A-Za-z0-9+/_\-=.]{16,}/gi, '$1 ***');
	return out;
}

// ──────────────────────────────────────────────────────────────────
// 3. 프롬프트 인젝션 nonce 마커
// ──────────────────────────────────────────────────────────────────

export interface PromptInjectionMarkers {
	/** 16자 hex (64-bit) 무작위 nonce */
	nonce: string;
	/** 시작 마커 (예: "===== USER_INPUT_START [abc123...] =====") */
	startMarker: string;
	/** 종료 마커 */
	endMarker: string;
}

/**
 * 프롬프트 인젝션 방어용 무작위 nonce 마커 생성.
 * 매 호출마다 새 nonce(64-bit)를 생성하여 사용자가 마커를 추측·위장하지 못하도록 한다.
 *
 * @returns nonce + startMarker + endMarker
 */
export function buildPromptInjectionMarkers(): PromptInjectionMarkers {
	const nonce = randomBytes(8).toString('hex');
	return {
		nonce,
		startMarker: `===== USER_INPUT_START [${nonce}] =====`,
		endMarker: `===== USER_INPUT_END [${nonce}] =====`,
	};
}

// ──────────────────────────────────────────────────────────────────
// 4. 사용자 입력 sanitize
// ──────────────────────────────────────────────────────────────────

/**
 * 사용자 입력의 백틱(`)을 zero-width space + backtick으로 치환.
 * 가독성은 보존하면서 markdown code fence 등으로 prompt를 분리하는 시도를 무력화.
 *
 * @param input - 사용자 입력 문자열
 * @returns sanitized 문자열
 */
export function sanitizeUserInput(input: string): string {
	return input.replace(/`/g, '​`');
}

// ──────────────────────────────────────────────────────────────────
// 5. atomic write
// ──────────────────────────────────────────────────────────────────

export interface AtomicWriteOptions {
	/** 파일 인코딩 (기본: 'utf8') */
	encoding?: BufferEncoding;
	/** 파일 권한 모드 (기본: 0o600 — 소유자 RW만) */
	mode?: number;
}

/**
 * atomic write: 임시 파일에 쓴 후 rename으로 최종 경로로 이동.
 * ENOSPC 등 부분 쓰기 시 손상된 결과 파일이 디스크에 남지 않도록 보장.
 * 실패 시 임시 파일을 cleanup (실패해도 무시).
 *
 * @param filePath - 최종 파일 경로
 * @param content - 파일 내용
 * @param opts - encoding (default 'utf8') / mode (default 0o600)
 * @throws fs.writeFile/rename 에러 (호출자가 분류)
 */
export async function atomicWrite(
	filePath: string,
	content: string,
	opts?: AtomicWriteOptions,
): Promise<void> {
	const encoding = opts?.encoding ?? 'utf8';
	const mode = opts?.mode ?? 0o600;
	const tmpPath = `${filePath}.tmp-${randomBytes(4).toString('hex')}`;
	try {
		await fs.writeFile(tmpPath, content, { encoding, mode });
		await fs.rename(tmpPath, filePath);
	} catch (err) {
		await fs.unlink(tmpPath).catch(() => undefined);
		throw err;
	}
}

// ──────────────────────────────────────────────────────────────────
// 6. task_id 검증
// ──────────────────────────────────────────────────────────────────

export interface ValidateTaskIdResult {
	valid: boolean;
	/** valid=false일 때 사유 메시지 */
	error?: string;
}

/**
 * task_id가 ticket 형식 + 길이 한도 내인지 검증.
 *
 * @param taskId - 검증할 값 (string 외 타입도 허용 — type-safe)
 * @param maxLen - 최대 길이 (기본: 64자, ENAMETOOLONG 방어)
 * @returns valid + 사유
 */
export function validateTaskId(
	taskId: unknown,
	maxLen: number = TASK_ID_MAX_LEN_DEFAULT,
): ValidateTaskIdResult {
	if (typeof taskId !== 'string') {
		return { valid: false, error: 'task_id는 문자열이어야 합니다.' };
	}
	if (!TICKET_PATTERN.test(taskId)) {
		return {
			valid: false,
			error: `task_id 형식이 올바르지 않습니다. 예: APS-1-1 (정규식: ^[A-Z]+(-\\d+)+$). 입력값: ${taskId}`,
		};
	}
	if (taskId.length > maxLen) {
		return {
			valid: false,
			error: `task_id는 ${maxLen}자를 초과할 수 없습니다 (현재: ${taskId.length}자).`,
		};
	}
	return { valid: true };
}

// ──────────────────────────────────────────────────────────────────
// 7. 안전 URL 필터
// ──────────────────────────────────────────────────────────────────

export interface FilterSafeUrlsOptions {
	/** 단일 URL 최대 길이 (기본: 2048자) */
	maxUrlLen?: number;
	/** 결과 배열 최대 개수 (기본: 50) */
	maxCount?: number;
}

/**
 * URL 배열을 위험 스킴 필터링 + 길이/개수 cap 적용하여 반환.
 *
 * 차단 스킴: `javascript:`, `data:`, `file://`
 * 허용 스킴: `http://`, `https://`만
 *
 * **호출자 책임**: dedupe(중복 제거)는 호출부에서 처리. 본 함수는 순수 필터.
 *
 * @param urls - 검사할 URL 후보 목록
 * @param opts - maxUrlLen (default 2048) / maxCount (default 50)
 * @returns 안전 URL 배열 (순서 보존, cap 적용)
 */
export function filterSafeUrls(urls: string[], opts?: FilterSafeUrlsOptions): string[] {
	const maxUrlLen = opts?.maxUrlLen ?? URL_MAX_LEN_DEFAULT;
	const maxCount = opts?.maxCount ?? URL_MAX_COUNT_DEFAULT;
	const out: string[] = [];
	for (const raw of urls) {
		if (typeof raw !== 'string') continue;
		const trimmed = raw.trim();
		if (trimmed.length === 0) continue;
		if (trimmed.length > maxUrlLen) continue;
		const lower = trimmed.toLowerCase();
		if (
			lower.startsWith('javascript:') ||
			lower.startsWith('data:') ||
			lower.startsWith('file://')
		) {
			continue;
		}
		if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
			continue;
		}
		out.push(trimmed);
		if (out.length >= maxCount) break;
	}
	return out;
}
