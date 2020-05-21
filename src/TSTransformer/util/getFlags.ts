// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFlags<T extends number>(flags: T, from: any) {
	const results = new Array<string>();
	for (const [flagName, flagValue] of Object.entries(from)) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!!(flags & (flagValue as any))) {
			results.push(flagName);
		}
	}
	return results;
}
