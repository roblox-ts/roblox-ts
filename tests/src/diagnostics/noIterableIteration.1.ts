declare const values: Iterable<number> & { next: number };
const [first, ...rest] = values;
