type Pair = LuaTuple<[number, number]>;
type Source<T> = () => { callback: T; next: Source<() => Pair> };
type Target<T> = () => { callback: T; next: Target<() => Pair | undefined> };
declare const source: Source<() => number>;
const target: Target<() => number> = source;
export {};
