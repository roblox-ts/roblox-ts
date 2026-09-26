declare function accept(callback: (this: defined) => number): void;

let callback = () => 42;
callback = (value?: number) => value ?? 42;
accept(callback);
