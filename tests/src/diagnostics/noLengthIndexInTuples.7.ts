function readLength(value: [number, number] & { tag?: string }) {
	value.length;
}

readLength([1, 2]);
