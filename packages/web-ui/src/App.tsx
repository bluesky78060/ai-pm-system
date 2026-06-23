import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { UNAUTHORIZED_EVENT, clearApiKey } from './api.ts';
import ApiKeyGate from './components/ApiKeyGate.tsx';
import Dashboard from './pages/Dashboard.tsx';
import ProjectDetail from './pages/ProjectDetail.tsx';
import TaskDetail from './pages/TaskDetail.tsx';

// 로그아웃: 저장된 키 제거 + 전역 이벤트로 게이트 복귀 (APS-3-3).
function logout() {
	clearApiKey();
	window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

const navItems = [{ path: '/', label: 'Dashboard' }];

export default function App() {
	const location = useLocation();

	return (
		<div className="min-h-screen bg-gray-950 text-gray-100">
			<header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
				<div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-8">
					<Link to="/" className="text-lg font-bold tracking-tight text-white">
						AI PM System
					</Link>
					<nav className="flex gap-1">
						{navItems.map((item) => (
							<Link
								key={item.path}
								to={item.path}
								className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
									location.pathname === item.path
										? 'bg-gray-800 text-white'
										: 'text-gray-400 hover:text-white hover:bg-gray-800/50'
								}`}
							>
								{item.label}
							</Link>
						))}
					</nav>
					<button
						type="button"
						onClick={logout}
						className="ml-auto px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
					>
						로그아웃
					</button>
				</div>
			</header>
			<main className="px-6 py-6">
				<ApiKeyGate>
					<Routes>
						<Route path="/" element={<Dashboard />} />
						<Route path="/projects/:id" element={<ProjectDetail />} />
						<Route path="/tasks/:id" element={<TaskDetail />} />
					</Routes>
				</ApiKeyGate>
			</main>
		</div>
	);
}
