import { describe, expect, it } from 'vitest';
import {
	type TestResult,
	matchesStrictFlag,
	validateStrictResults,
} from '../services/workflow-service.js';

// APS-1-9: validateStrictResults는 순수 함수(DB 비의존)라 격리 단위 테스트 가능.
const pass = (test_type: string): TestResult => ({
	test_type,
	status: 'pass',
	output: 'x'.repeat(10),
});

describe('validateStrictResults (APS-1-9 STRICT 검증)', () => {
	it('비-strict면 어떤 입력이든 통과 (기존 동작 보존, isStrict=false 폴백)', () => {
		expect(() => validateStrictResults([pass('build')], false)).not.toThrow();
		expect(() => validateStrictResults([], false)).not.toThrow();
		// fail/skip이 섞여도 비-strict면 통과 (강화는 strict 전용)
		expect(() =>
			validateStrictResults([{ test_type: 'build', status: 'fail', output: 'x' }], false),
		).not.toThrow();
	});

	it('strict + build/lint/unit 모두 pass → 통과', () => {
		expect(() =>
			validateStrictResults([pass('build'), pass('lint'), pass('unit')], true),
		).not.toThrow();
	});

	it('strict + lint 누락 → throw (누락 타입 명시)', () => {
		expect(() => validateStrictResults([pass('build'), pass('unit')], true)).toThrow(/lint/);
	});

	it('strict + build·lint·unit 모두 누락 → throw', () => {
		expect(() => validateStrictResults([pass('integration')], true)).toThrow(/build/);
	});

	it('strict + unit status=fail → throw (비-pass 거부)', () => {
		const results: TestResult[] = [
			pass('build'),
			pass('lint'),
			{ test_type: 'unit', status: 'fail', output: 'x'.repeat(10) },
		];
		expect(() => validateStrictResults(results, true)).toThrow(/unit/);
	});

	it('strict + 추가 항목 status=skip → throw (skip 거부)', () => {
		const results: TestResult[] = [
			pass('build'),
			pass('lint'),
			pass('unit'),
			{ test_type: 'integration', status: 'skip', output: 'x'.repeat(10) },
		];
		expect(() => validateStrictResults(results, true)).toThrow(/integration|skip|통과하지 않은/);
	});
});

describe('matchesStrictFlag (APS-1-10 플래그 매칭)', () => {
	it('코드가 플래그에 포함 → true', () => {
		expect(matchesStrictFlag('APS', 'APS')).toBe(true);
		expect(matchesStrictFlag('APS', 'APS,DIET')).toBe(true);
		expect(matchesStrictFlag('DIET', 'APS,DIET')).toBe(true);
	});

	it('코드가 플래그에 없음 → false', () => {
		expect(matchesStrictFlag('DIET', 'APS')).toBe(false);
		expect(matchesStrictFlag('SLS', 'APS,DIET')).toBe(false);
	});

	it('code가 null → false (조회 실패 폴백)', () => {
		expect(matchesStrictFlag(null, 'APS')).toBe(false);
	});

	it('플래그 빈값/미설정 → false', () => {
		expect(matchesStrictFlag('APS', '')).toBe(false);
		expect(matchesStrictFlag('APS', undefined)).toBe(false);
		expect(matchesStrictFlag('APS', '   ')).toBe(false);
	});

	it('case-exact 매칭 (소문자 불일치 → false)', () => {
		expect(matchesStrictFlag('aps', 'APS')).toBe(false);
		expect(matchesStrictFlag('APS', 'aps')).toBe(false);
	});

	it('공백/trailing 콤마 정규화 (trim + filter)', () => {
		expect(matchesStrictFlag('DIET', ' APS , DIET ')).toBe(true);
		expect(matchesStrictFlag('APS', 'APS,')).toBe(true);
	});
});
