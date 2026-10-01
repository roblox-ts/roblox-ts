type Pair = LuaTuple<[number, number]>;
declare const original: { kind: "a"; callback: () => Pair } | { kind: "b"; callback: () => Pair };
const widened: { callback: () => Pair | undefined } = original;
