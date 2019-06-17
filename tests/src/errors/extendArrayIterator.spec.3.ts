{
	class SortedArray<T> extends Array<T> {
		public [Symbol.iterator] = function*() {
			yield (1 as unknown) as T;
		};
	}
}
export {};
