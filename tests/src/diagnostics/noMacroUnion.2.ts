export {};

function foo(x: ReadonlyArray<number> | ReadonlyMap<number, string>) {
	const v = [...x];
}
