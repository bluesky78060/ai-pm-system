import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  maskApiKey,
  sanitizeErrorMessage,
  buildPromptInjectionMarkers,
  sanitizeUserInput,
  atomicWrite,
  validateTaskId,
  filterSafeUrls,
  TICKET_PATTERN,
  TASK_ID_MAX_LEN_DEFAULT,
  URL_MAX_LEN_DEFAULT,
  URL_MAX_COUNT_DEFAULT,
} from '../services/_security-base.js';

// ──────────────────────────────────────────────────────────────────
// 1. maskApiKey
// ──────────────────────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('정상 키는 처음 4자 + ***', () => {
    expect(maskApiKey('AIzaSyABCDEFG1234')).toBe('AIza***');
  });

  it('빈 문자열은 통째로 ***', () => {
    expect(maskApiKey('')).toBe('***');
  });

  it('null/undefined는 ***', () => {
    expect(maskApiKey(null)).toBe('***');
    expect(maskApiKey(undefined)).toBe('***');
  });

  it('짧은 키(8자 미만)는 ***', () => {
    expect(maskApiKey('abc')).toBe('***');
    expect(maskApiKey('abcdefg')).toBe('***'); // 7자
  });

  it('정확히 8자 키는 마스킹', () => {
    expect(maskApiKey('abcdefgh')).toBe('abcd***');
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. sanitizeErrorMessage (4중 마스킹)
// ──────────────────────────────────────────────────────────────────

describe('sanitizeErrorMessage', () => {
  it('현재 사용 중인 키 자체가 마스킹된다', () => {
    const key = 'AIzaSyABCDEFG1234567890';
    const msg = `Auth failed with key ${key}`;
    const result = sanitizeErrorMessage(msg, key);
    expect(result).not.toContain(key);
    expect(result).toContain('AIza***');
  });

  it('AIza 패턴(다른 키)도 마스킹된다', () => {
    const otherKey = 'AIzaSyOtherSecretKey1234567890';
    const msg = `Different key in stack: ${otherKey}`;
    const result = sanitizeErrorMessage(msg, 'AIzaCurrent123Different');
    expect(result).not.toContain(otherKey);
    expect(result).toContain('AIza***');
  });

  it('?key= URL 쿼리 파라미터가 마스킹된다', () => {
    const msg = 'Request to https://api.example.com/v1?key=secretval&model=test';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('secretval');
    expect(result).toContain('?key=***');
  });

  it('&key= URL 쿼리 파라미터도 마스킹된다', () => {
    const msg = 'URL: https://api.example.com/v1?model=test&key=secretval';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('secretval');
    expect(result).toContain('&key=***');
  });

  it('Bearer 토큰이 마스킹된다', () => {
    const msg = 'Authorization: Bearer abcdef1234567890fedcba0987654321 invalid';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('abcdef1234567890fedcba0987654321');
    expect(result).toContain('Bearer ***');
  });

  it('Basic 토큰이 마스킹된다', () => {
    const msg = 'Header: Basic YWRtaW46cGFzc3dvcmQxMjM0NTY3ODk= request';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('YWRtaW46cGFzc3dvcmQxMjM0NTY3ODk=');
    expect(result).toContain('Basic ***');
  });

  it('apiKey가 없어도 일반 패턴은 마스킹된다', () => {
    const msg = 'AIzaSyXXXXXXXXXXXXXXXXXXXXX failed';
    const result = sanitizeErrorMessage(msg);
    expect(result).toContain('AIza***');
  });

  it('정상 메시지는 변경 없이 반환된다', () => {
    const msg = '이것은 정상 메시지입니다';
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. buildPromptInjectionMarkers
// ──────────────────────────────────────────────────────────────────

describe('buildPromptInjectionMarkers', () => {
  it('nonce는 16자 hex이다 (64-bit)', () => {
    const m = buildPromptInjectionMarkers();
    expect(m.nonce).toMatch(/^[a-f0-9]{16}$/);
  });

  it('startMarker와 endMarker에 nonce가 포함된다', () => {
    const m = buildPromptInjectionMarkers();
    expect(m.startMarker).toContain(`[${m.nonce}]`);
    expect(m.endMarker).toContain(`[${m.nonce}]`);
    expect(m.startMarker).toContain('USER_INPUT_START');
    expect(m.endMarker).toContain('USER_INPUT_END');
  });

  it('두 번 호출 시 다른 nonce가 생성된다 (예측 불가)', () => {
    const m1 = buildPromptInjectionMarkers();
    const m2 = buildPromptInjectionMarkers();
    expect(m1.nonce).not.toBe(m2.nonce);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. sanitizeUserInput
// ──────────────────────────────────────────────────────────────────

describe('sanitizeUserInput', () => {
  it('백틱이 zero-width space + backtick으로 치환된다', () => {
    const input = 'code: `console.log("test")`';
    const out = sanitizeUserInput(input);
    expect(out).not.toBe(input);
    // zero-width space는 U+200B
    expect(out).toContain('​`');
  });

  it('백틱 없는 입력은 그대로 반환된다', () => {
    const input = '일반 텍스트입니다';
    expect(sanitizeUserInput(input)).toBe(input);
  });

  it('빈 문자열은 빈 문자열로 반환된다', () => {
    expect(sanitizeUserInput('')).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. atomicWrite
// ──────────────────────────────────────────────────────────────────

describe('atomicWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-base-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('정상 호출 시 파일이 생성된다', async () => {
    const target = path.join(tmpDir, 'output.md');
    await atomicWrite(target, '# Hello');
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('# Hello');
  });

  it('정상 호출 후 임시 파일은 남지 않는다', async () => {
    const target = path.join(tmpDir, 'output.md');
    await atomicWrite(target, '# Hello');
    const files = await fs.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp-'));
    expect(tmpFiles.length).toBe(0);
    expect(files).toContain('output.md');
  });

  it('파일 권한이 0o600(소유자 RW)이다', async () => {
    const target = path.join(tmpDir, 'output.md');
    await atomicWrite(target, '# Hello');
    const stat = await fs.stat(target);
    // mode의 하위 9비트만 확인 (perm bits)
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('encoding 옵션이 적용된다 (utf8 default)', async () => {
    const target = path.join(tmpDir, 'output.md');
    await atomicWrite(target, '한글 테스트');
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('한글 테스트');
  });

  it('mode 옵션이 적용된다 (override)', async () => {
    const target = path.join(tmpDir, 'output.md');
    await atomicWrite(target, '# Hello', { mode: 0o644 });
    const stat = await fs.stat(target);
    expect(stat.mode & 0o777).toBe(0o644);
  });

  it('대상 디렉터리가 없으면 에러를 던진다 (자동 생성 안 함)', async () => {
    const target = path.join(tmpDir, 'nonexistent-dir', 'output.md');
    await expect(atomicWrite(target, '# Hello')).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. validateTaskId
// ──────────────────────────────────────────────────────────────────

describe('validateTaskId', () => {
  it('정상 ticket 형식은 valid', () => {
    expect(validateTaskId('APS-1-1').valid).toBe(true);
    expect(validateTaskId('ABC-12-34-56').valid).toBe(true);
    expect(validateTaskId('A-1').valid).toBe(true);
  });

  it('소문자 prefix는 invalid', () => {
    const r = validateTaskId('aps-1-1');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/형식이 올바르지 않/);
  });

  it('슬래시 포함은 invalid', () => {
    expect(validateTaskId('APS/1').valid).toBe(false);
  });

  it('숫자만 있는 입력은 invalid', () => {
    expect(validateTaskId('123').valid).toBe(false);
  });

  it('non-string 입력은 invalid', () => {
    expect(validateTaskId(123).valid).toBe(false);
    expect(validateTaskId(null).valid).toBe(false);
    expect(validateTaskId(undefined).valid).toBe(false);
    expect(validateTaskId({}).valid).toBe(false);
  });

  it('기본 길이 캡(64자) 초과는 invalid', () => {
    const longId = 'A' + '-1'.repeat(40); // 81자
    expect(longId.length).toBeGreaterThan(64);
    const r = validateTaskId(longId);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/64자를 초과/);
  });

  it('정확히 64자는 valid (경계값)', () => {
    const id = 'AB' + '-1'.repeat(31); // 64자
    expect(id.length).toBe(64);
    expect(validateTaskId(id).valid).toBe(true);
  });

  it('maxLen 옵션으로 한도 변경 가능', () => {
    expect(validateTaskId('APS-1-1', 5).valid).toBe(false); // 7자, 한도 5
    expect(validateTaskId('A-1', 5).valid).toBe(true); // 3자, 한도 5
  });
});

// ──────────────────────────────────────────────────────────────────
// 7. filterSafeUrls
// ──────────────────────────────────────────────────────────────────

describe('filterSafeUrls', () => {
  it('http/https URL은 통과', () => {
    const out = filterSafeUrls(['https://example.com', 'http://test.org']);
    expect(out).toEqual(['https://example.com', 'http://test.org']);
  });

  it('javascript: 스킴은 차단', () => {
    const out = filterSafeUrls(['javascript:alert(1)', 'https://safe.com']);
    expect(out).toEqual(['https://safe.com']);
  });

  it('data: 스킴은 차단', () => {
    const out = filterSafeUrls(['data:text/html,<script>', 'https://safe.com']);
    expect(out).toEqual(['https://safe.com']);
  });

  it('file:// 스킴은 차단', () => {
    const out = filterSafeUrls(['file:///etc/passwd', 'https://safe.com']);
    expect(out).toEqual(['https://safe.com']);
  });

  it('알 수 없는 스킴은 차단 (ftp 등)', () => {
    const out = filterSafeUrls(['ftp://example.com', 'https://safe.com']);
    expect(out).toEqual(['https://safe.com']);
  });

  it('단일 URL 길이 cap (default 2048) 초과는 제외', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2050);
    const out = filterSafeUrls([longUrl, 'https://normal.com']);
    expect(out).toEqual(['https://normal.com']);
  });

  it('결과 개수 cap (default 50) 적용', () => {
    const urls = Array.from({ length: 60 }, (_, i) => `https://example${i}.com`);
    const out = filterSafeUrls(urls);
    expect(out.length).toBe(50);
  });

  it('maxUrlLen 옵션 override', () => {
    const urls = ['https://x.com', 'https://yyyyyyyyyyy.com'];
    const out = filterSafeUrls(urls, { maxUrlLen: 15 });
    expect(out).toEqual(['https://x.com']);
  });

  it('maxCount 옵션 override', () => {
    const urls = ['https://a.com', 'https://b.com', 'https://c.com'];
    const out = filterSafeUrls(urls, { maxCount: 2 });
    expect(out).toEqual(['https://a.com', 'https://b.com']);
  });

  it('빈 문자열·공백·non-string은 무시', () => {
    const out = filterSafeUrls(['', '   ', 'https://safe.com', 123 as unknown as string]);
    expect(out).toEqual(['https://safe.com']);
  });

  it('순서를 보존한다 (dedupe는 호출자 책임)', () => {
    const out = filterSafeUrls(['https://a.com', 'https://b.com', 'https://a.com']);
    expect(out).toEqual(['https://a.com', 'https://b.com', 'https://a.com']);
  });
});

// ──────────────────────────────────────────────────────────────────
// 상수 export 검증
// ──────────────────────────────────────────────────────────────────

describe('상수 export', () => {
  it('TICKET_PATTERN 정규식', () => {
    expect(TICKET_PATTERN.test('APS-1-1')).toBe(true);
    expect(TICKET_PATTERN.test('apS-1')).toBe(false);
  });

  it('TASK_ID_MAX_LEN_DEFAULT', () => {
    expect(TASK_ID_MAX_LEN_DEFAULT).toBe(64);
  });

  it('URL_MAX_LEN_DEFAULT', () => {
    expect(URL_MAX_LEN_DEFAULT).toBe(2048);
  });

  it('URL_MAX_COUNT_DEFAULT', () => {
    expect(URL_MAX_COUNT_DEFAULT).toBe(50);
  });
});
