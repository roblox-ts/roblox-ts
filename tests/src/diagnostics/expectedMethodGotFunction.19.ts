declare function accept(callback: (this: defined) => number): void;

const object = { callback: () => 42 };
object.callback = (value?: number) => value ?? 42;
accept(object.callback);
