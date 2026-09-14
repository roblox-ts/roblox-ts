function original(value: number) {
	return value + 1;
}

const method: (this: defined | void, value: number) => number = original;
