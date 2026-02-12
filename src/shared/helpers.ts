export function extractErrorMsg(error: unknown, fallbackMsg?: string): string {
	return error instanceof Error ? error.message : fallbackMsg || 'An unknown error occurred!';
}
