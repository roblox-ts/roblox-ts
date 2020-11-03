export {};

function foo(x: ReadonlyArray<number> | ReadonlyMap<number, string>) {
	const [a, b, c] = x;
}
