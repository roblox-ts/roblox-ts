declare function accept(callback: (this: defined) => number | undefined): void;

const callback: () => number | undefined = (value?: number) => value;
accept(callback);
