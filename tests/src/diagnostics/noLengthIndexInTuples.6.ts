function readLength<T extends readonly [number, number]>(value: T) {
	value.length;
}

readLength([1, 2]);
