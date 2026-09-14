function make<T>() {
	return {
		method(this: Exclude<T, undefined>, value: number) {
			return value + 1;
		},
	};
}

make<void>().method(41);
