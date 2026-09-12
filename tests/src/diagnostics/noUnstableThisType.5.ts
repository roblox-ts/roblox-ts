function callback<T>(this: T extends string ? void : defined, value: number) {
	return value + 1;
}

callback<string>(41);
