type Callable<T> = (this: T, value: number) => number;

function withThis(this: defined | void, value: number) {
	return value + 1;
}

function call(callback: Callable<void> = withThis) {
	return callback(41);
}
