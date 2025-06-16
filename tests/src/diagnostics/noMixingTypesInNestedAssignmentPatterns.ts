const obj = {
	a: 1,
	b: 2,
	c: 3,
	[Symbol.iterator]: function* () {
		yield 1;
		yield 2;
	},
};

let a: number, b: number
let n1: number, n2: number
({ a, b, ...[n1, n2] } = obj);
