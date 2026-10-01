type Pair = LuaTuple<[number, number]>;
class Example {
	f(): Pair | undefined;
	f(): Pair {
		return $tuple(50, 60);
	}
}
new Example().f();
export {};
