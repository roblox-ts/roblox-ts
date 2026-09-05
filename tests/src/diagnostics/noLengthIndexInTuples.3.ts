const foo = [1, 2, 3] as const;
let length: number;
({ length } = foo);
