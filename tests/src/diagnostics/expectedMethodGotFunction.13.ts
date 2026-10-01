declare function accept(callback: (this: defined) => number): void;

accept(function (this: void, value?: number) {
	return value ?? 42;
});
