/**
 * Returns the index of the last item in `array` that satisfies the provided testing function `callback`.
 * Otherwise, it returns `-1`, indicating that no element passed the test.
 * Similar to `Array<T>.findIndex()`, but works from end->start instead of start->end.
 * @param array The array to search.
 * @param callback A function to execute on each value in the array until the function returns `true`, indicating that the satisfying element was found.
 */
export function findLastIndex<T>(array: ReadonlyArray<T>, callback: (value: T) => boolean) {
	for (let i = array.length - 1; i >= 0; i--) {
		if (callback(array[i])) {
			return i;
		}
	}
	return -1;
}
