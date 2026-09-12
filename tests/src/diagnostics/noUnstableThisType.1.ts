function make<T>() {
	return {
		method(this: T, value: number) {
			return value + 1;
		},
	};
}

make<void>().method(41);
