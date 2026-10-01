type Pair = LuaTuple<[number, number]>;
function source<T extends Pair>(callback: () => T | undefined): number {
	return callback()![1];
}
declare const targetType: <T extends Pair>(callback: () => T) => number;
const target: typeof targetType = source;
export {};
