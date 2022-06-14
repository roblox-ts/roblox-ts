let a: boolean;
let b: unknown | void;

print(([a, b] = pcall(() => {})));
