export function arrayStartsWith<T>(a: Array<T>, b: Array<T>) {
	const minLength = Math.min(a.length, b.length);
	for (let i = 0; i < minLength; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}
