type Pair = LuaTuple<[number, number]>;
function pair(): Pair {
	return $tuple(50, 60);
}
function source<T>(callback: (value: T) => Pair | undefined, value: T): number {
	return callback(value)![1];
}
const target: <T>(callback: (value: T) => Pair, value: T) => number = source;
assert(target(pair, 1) === 60);
export {};
