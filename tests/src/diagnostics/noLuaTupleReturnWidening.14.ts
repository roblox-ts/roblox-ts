type Pair = LuaTuple<[number, number]>;
declare const original: { callback: () => Pair };
const widened: { callback: () => Pair | undefined } | string = original;
