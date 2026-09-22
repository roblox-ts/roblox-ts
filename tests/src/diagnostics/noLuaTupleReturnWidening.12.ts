type Pair = LuaTuple<[number, number]>;
declare const original: { [name: string]: () => Pair };
const widened: { [name: string]: () => Pair | undefined } = original;
