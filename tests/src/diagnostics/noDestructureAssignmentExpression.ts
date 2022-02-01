export {};

let a: boolean;
let b: string | void;

print([a, b] = pcall(() => {}));
