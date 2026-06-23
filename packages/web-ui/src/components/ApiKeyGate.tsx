import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { type ApiError, UNAUTHORIZED_EVENT, api, setApiKey } from '../api.ts';

type GateState = 'probing' | 'authed' | 'need-key' | 'error';

/**
 * API 키 게이트 (APS-3-3).
 * 마운트 시 프로브(GET /api/projects):
 *  - 성공 → children 렌더 (enforce OFF 또는 유효 키 → 게이트 안 뜸, 회귀 0)
 *  - 401  → 키 입력 폼 (need-key)
 *  - 그 외(403/500/네트워크) → 재시도 에러 상태 (키 폼 안 띄움)
 * keyed 401(세션 만료) 이벤트 수신 시에만 게이트 복귀. 폼 표시 중 자동 재프로브 금지(루프 방지).
 */
export default function ApiKeyGate({ children }: { children: ReactNode }) {
	const [state, setState] = useState<GateState>('probing');
	const [keyInput, setKeyInput] = useState('');
	const [errorMsg, setErrorMsg] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const probe = useCallback(async () => {
		setState('probing');
		setErrorMsg('');
		try {
			await api.listProjects();
			setState('authed');
		} catch (e) {
			const status = (e as ApiError).status;
			if (status === 401) {
				setState('need-key');
			} else {
				setErrorMsg((e as Error).message || '서버에 연결할 수 없습니다.');
				setState('error');
			}
		}
	}, []);

	useEffect(() => {
		void probe();
		// keyed 401(세션 만료) 이벤트 → authed였을 때만 게이트 복귀 (idempotent: 다중 이벤트 무시).
		const onUnauthorized = () => {
			setKeyInput('');
			setState((s) => (s === 'authed' ? 'need-key' : s));
		};
		window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
		return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
	}, [probe]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = keyInput.trim();
		if (!trimmed) {
			setErrorMsg('API 키를 입력하세요.');
			return;
		}
		setSubmitting(true);
		setErrorMsg('');
		setApiKey(trimmed);
		try {
			await api.listProjects();
			setKeyInput('');
			setState('authed');
		} catch (err) {
			const status = (err as ApiError).status;
			setErrorMsg(
				status === 401
					? '키가 올바르지 않습니다.'
					: (err as Error).message || '서버에 연결할 수 없습니다.',
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (state === 'authed') return <>{children}</>;
	if (state === 'probing') {
		return <div className="text-gray-400 animate-pulse text-center py-20">연결 확인 중…</div>;
	}

	return (
		<div className="min-h-[60vh] flex items-center justify-center">
			<div className="w-full max-w-sm bg-gray-900/50 border border-gray-800 rounded-xl p-6 backdrop-blur">
				<h1 className="text-xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
					API 키 입력
				</h1>
				{state === 'error' ? (
					<div>
						<p className="text-red-400 text-sm mb-4">{errorMsg || '서버에 연결할 수 없습니다.'}</p>
						<button
							type="button"
							onClick={() => void probe()}
							className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm font-medium text-gray-200 hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							재시도
						</button>
					</div>
				) : (
					<form onSubmit={handleSubmit}>
						<p className="text-gray-500 text-sm mb-4">
							이 대시보드는 인증이 필요합니다. 서버 API_KEY를 입력하세요.
						</p>
						<input
							type="password"
							value={keyInput}
							onChange={(e) => setKeyInput(e.target.value)}
							placeholder="x-api-key"
							autoComplete="off"
							// biome-ignore lint/a11y/noAutofocus: 단일 입력 게이트 — 즉시 입력 편의
							autoFocus
							className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
						/>
						{errorMsg && <p className="text-red-400 text-xs mb-3">{errorMsg}</p>}
						<button
							type="submit"
							disabled={submitting}
							className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							{submitting ? '확인 중…' : '접속'}
						</button>
					</form>
				)}
				<p className="text-gray-600 text-[11px] mt-4 leading-relaxed">
					키는 이 브라우저에만 저장됩니다(localStorage). 공용 기기에서는 사용 후 로그아웃하세요.
					(단일 사용자·HTTPS·비공개 URL 전제의 accepted risk)
				</p>
			</div>
		</div>
	);
}
