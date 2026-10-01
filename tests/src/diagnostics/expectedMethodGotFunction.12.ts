declare function accept(callback: (this: defined) => number): void;

const callback: () => number = (...values: Array<number>) => values.size();
accept(callback);
