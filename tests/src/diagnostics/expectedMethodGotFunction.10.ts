declare function accept(callback: (this: defined) => number): void;

accept((value: number = 42) => value);
