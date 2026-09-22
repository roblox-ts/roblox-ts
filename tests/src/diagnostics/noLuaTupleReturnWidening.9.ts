type Pair = LuaTuple<[number, number]>;
interface Original {
	next?: Original;
	callback: () => Pair;
}
interface Widened {
	next?: Widened;
	callback: () => Pair | undefined;
}
declare const original: Original;
const widened: Widened = original;
