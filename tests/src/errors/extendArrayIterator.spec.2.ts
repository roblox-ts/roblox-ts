{
	class SortedArray<T> extends Array<T> {
		public *[Symbol.iterator]() {
			yield (1 as unknown) as T;
		}
	}
}
export {};
