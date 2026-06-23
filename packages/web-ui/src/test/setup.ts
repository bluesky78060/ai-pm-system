// APS-3-4: jest-dom matchers(toBeInTheDocument 등)를 vitest expect에 등록.
import '@testing-library/jest-dom';

// Node 22+ 실험적 localStorage(--localstorage-file)가 jsdom의 localStorage를 가려
// clear/getItem 등이 누락되는 문제 회피 → 결정론적 in-memory Storage로 교체.
class MemoryStorage implements Storage {
	private store = new Map<string, string>();
	get length(): number {
		return this.store.size;
	}
	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.has(key) ? (this.store.get(key) as string) : null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, String(value));
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
}

Object.defineProperty(globalThis, 'localStorage', {
	value: new MemoryStorage(),
	configurable: true,
	writable: true,
});
