{
	class SortedArray<T> extends Array<T> {
		public static [Symbol.iterator] = function*() {
			yield 1 as unknown;
		};
	}
}
export {};
