type Pair = LuaTuple<[number, number]>;
type Factory<T> = <U>(value: U) => T;
declare const source: { first: Factory<() => number>; second: Factory<() => Pair> };
const target: { first: Factory<() => number | undefined>; second: Factory<() => Pair | undefined> } = source;
export {};
