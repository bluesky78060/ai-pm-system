export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TICKET_CODE_REGEX = /^[A-Z0-9]{1,6}-\d+-\d+$/i;

/**
 * Generate a short project code from a project name.
 * Extracts ASCII initials; falls back to first ASCII word or 'PROJ'.
 */
export function generateProjectCode(name: string): string {
	// Try ASCII initials first
	const initials = name
		.split(/[\s\-_]+/)
		.map((w) => w[0] ?? '')
		.join('')
		.replace(/[^A-Za-z0-9]/g, '')
		.toUpperCase()
		.slice(0, 5);
	if (initials.length >= 2) return initials;

	// Fallback: first ASCII word of 2+ chars
	const firstWord = name
		.match(/[A-Za-z]{2,}/)?.[0]
		?.toUpperCase()
		.slice(0, 5);
	return firstWord ?? 'PROJ';
}
