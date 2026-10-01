type Pair = LuaTuple<[number, number]>;
class Example {
	f(): Pair;
	f(): Pair | undefined {
		return $tuple(50, 60);
	}
}
new Example().f();
export {};
