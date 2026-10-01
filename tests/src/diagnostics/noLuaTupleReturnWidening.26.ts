type Pair = LuaTuple<[number, number]>;
function source<T>(value: T): (value: T) => Pair {
	return (value: T): Pair => $tuple(50, 60);
}
const target: <T>(value: T) => (value: T) => Pair | undefined = source;
assert(target(1)(1)![1] === 60);
export {};
