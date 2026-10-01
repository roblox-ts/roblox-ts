declare function accept(callback: (this: defined) => number): void;

accept((...values: Array<number>) => values.size());
