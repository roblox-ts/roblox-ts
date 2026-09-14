type Callable<T> = (this: T, value: number) => number;

function make<T>() {
	const callback: Callable<T> = value => value + 1;
	return { callback };
}

make<void>().callback(41);
