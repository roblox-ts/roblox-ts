export {};

function foo(x: ReadonlyArray<number> | ReadonlyMap<number, string>) {
	for (const v of x) {}
}
