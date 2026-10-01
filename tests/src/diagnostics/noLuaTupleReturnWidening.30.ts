type Pair = LuaTuple<[number, number]>;
interface Source {
	next: <T>(value: T) => Source;
	callback: <T>(value: T) => Pair;
}
interface Target {
	next: <T>(value: T) => Target;
	callback: <T>(value: T) => Pair | undefined;
}
declare const source: Source;
const target: Target = source;
export {};
