type Pair = LuaTuple<[number, number]>;
function f(): Pair | undefined;
function f() {
	return $tuple(50, 60);
}
f();
export {};
