import type { NextFunction, Request, Response } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
	const expected = process.env.API_KEY;
	if (!expected) {
		// API_KEY 미설정 시 인증 skip (옵트인 보안 — 단일 사용자 + 비공개 URL 환경).
		// API_KEY env를 설정하면 인증이 강제됨.
		// 후속(정식 인증): remote-client.ts가 x-api-key를 전송하도록 + 클라이언트/서버 양쪽 API_KEY 설정.
		next();
		return;
	}
	const provided =
		req.header('x-api-key') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
	if (provided !== expected) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	next();
}
