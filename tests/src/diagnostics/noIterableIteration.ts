declare const values: Iterable<number>;
for (const value of values) {
	print(value);
}
const array = [...values];
const [first] = values;
const [, ...rest] = values;
