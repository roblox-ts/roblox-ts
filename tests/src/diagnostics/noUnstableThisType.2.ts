function make<T>() {
	const callback: (this: T, value: number) => number = value => value + 1;
	return { callback };
}

make<void>().callback(41);
