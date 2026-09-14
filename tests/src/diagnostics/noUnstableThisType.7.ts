function make<T>() {
	return {
		method(this: T extends string ? never : void, value: number) {
			return value + 1;
		},
	};
}

make<number>().method(41);
