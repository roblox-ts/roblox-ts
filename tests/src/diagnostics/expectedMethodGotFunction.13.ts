declare function accept(callback: (this: defined) => number): void;

accept(function (this: void) {
	return 42;
});
