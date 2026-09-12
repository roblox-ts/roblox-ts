type Callable<T> = (this: T, value: number) => number;

function withThis(this: defined | void, value: number) {
	return value + 1;
}

class Example {
	callback: Callable<void> = withThis;
}
