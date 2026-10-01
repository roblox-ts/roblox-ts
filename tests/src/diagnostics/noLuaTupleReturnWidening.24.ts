type Pair = LuaTuple<[number, number]>;
function f(value: true): Pair;
function f(value: false): Pair | undefined;
function f(value: boolean): Pair {
	return $tuple(50, 60);
}
f(false);
export {};
