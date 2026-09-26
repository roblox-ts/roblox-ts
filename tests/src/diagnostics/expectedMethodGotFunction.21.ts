declare function accept(callback: (this: defined) => number): void;

let original: () => number = () => 42;
original = (value?: number) => value ?? 42;
const callback = original;
accept(callback);
