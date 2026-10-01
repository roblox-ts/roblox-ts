type Pair = LuaTuple<[number, number]>;
class Example {
	f(): Pair | undefined;
	f() {
		return $tuple(50, 60);
	}
}
new Example().f();
export {};
