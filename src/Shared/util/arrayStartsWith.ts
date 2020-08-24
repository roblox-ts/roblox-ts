/**
 * Returns if the shorter of `a` and `b` contains items that are equivalent to their parallel item in the longer array. Essentially, if the longer array starts with the shorter array.
 *
 * If the lengths are equal, then `arrayStartsWith()` returns a surface level equivalence test
 * @example
 * arrayStartsWith([1, 2, 3], [1, 2, 3, 4]) // -> true
 * arrayStartsWith([1, 2, 3, 4], [1, 2, 3, 4]) // -> true
 * arrayStartsWith([1, 2, 3, 4], [1, 2, 5]) // -> false
 */
export function arrayStartsWith<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>) {
	const minLength = Math.min(a.length, b.length);
	for (let i = 0; i < minLength; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}
