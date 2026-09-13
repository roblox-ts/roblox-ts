function make<T extends defined>() {
	return {
		method(this: T | void, value: number) {
			return value + 1;
		},
	};
}

make<never>().method(41);
