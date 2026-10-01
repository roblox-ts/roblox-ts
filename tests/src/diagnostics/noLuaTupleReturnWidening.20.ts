type Pair = LuaTuple<[number, number]>;
function f(): Pair | undefined;
function f(): Pair {
	return $tuple(50, 60);
}
const result = f()!;
assert(result[1] === 60);
export {};
