export function arrayCount<T>(
	array: Array<T>,
	callback: (currentValue: T, currentIndex: number, array: Array<T>) => boolean,
): number {
	return array.reduce((prev, curr, index, arr) => prev + (callback(curr, index, arr) ? 1 : 0), 0);
}
