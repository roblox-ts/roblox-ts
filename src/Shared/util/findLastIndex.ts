/**
 * Similar to Array<T>.findIndex, but works in reverse.
 */
export function findLastIndex<T>(array: Array<T>, callback: (value: T) => boolean) {
	for (let i = array.length - 1; i >= 0; i--) {
		if (callback(array[i])) {
			return i;
		}
	}
	return -1;
}
