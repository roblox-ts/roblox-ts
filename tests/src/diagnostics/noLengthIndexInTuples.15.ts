const value = [1, 2] as const;
let length: number;
({ inner: { length } } = { inner: value });
