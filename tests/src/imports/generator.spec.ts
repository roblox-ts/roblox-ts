function* walkDescendants(instance: Instance): IterableIterator<Instance> {
	yield instance;
	for (const child of instance.GetChildren()) {
		yield* walkDescendants(child);
	}
}

function makeFolder(name: string, parent?: Instance) {
	const folder = new Instance("Folder");
	folder.Name = name;
	folder.Parent = parent;
	return folder;
}

const root = makeFolder("root");
const a = makeFolder("a", root);
const b = makeFolder("b", a);
const c = makeFolder("c", b);

export = () => {
	it("should support generator functions", () => {
		function* arrayIterator<T>(arr: Array<T>) {
			for (const v of arr) {
				yield v;
			}
		}

		const iter = arrayIterator([1, 2, 3, 4]);
		const { done, value } = iter.next();
		expect(done).to.equal(false);
		expect(value).to.equal(1);
		expect(iter.next().value).to.equal(2);
		expect(iter.next().value).to.equal(3);
		expect(iter.next().value).to.equal(4);
		expect(iter.next().value).to.equal(undefined);
		expect(iter.next().done).to.equal(true);
		expect(iter.next().done).to.equal(true);
	});

	it("should support generator destructuring", () => {
		class Test {
			public *iter() {
				for (const v of [1, 2, 3, 4]) {
					yield v;
				}
			}
		}

		const [, a] = new Test().iter();
		expect(a).to.equal(2);
	});

	it("should support for..of iterating", () => {
		function* arrayIterator<T>(arr: Array<T>) {
			for (const v of arr) {
				yield v;
			}
		}

		let count = 0;
		for (const foo of arrayIterator([1, 2, 3])) {
			expect(foo).to.equal(++count);
		}
	});

	it("should allow an argument to be passed into a next call", () => {
		function* arrayIterator<T>(arr: Array<T>) {
			for (const v of arr) {
				const num: number = yield v;
				observe({ done: false, value: num });
			}
		}

		const answers: Array<[boolean, number | undefined]> = [
			[false, 10],
			[false, 50],
			[false, 20],
			[false, 60],
			[false, 30],
			[false, 70],
		];

		let count = 0;
		function observe<T>({ done, value }: IteratorResult<T>) {
			const answer = answers[count] || [true, undefined];
			expect(done).to.equal(answer[0]);
			expect(value).to.equal(answer[1]);
			count++;
		}

		const array4 = [10, 20, 30];
		const it4 = arrayIterator(array4);
		observe(it4.next(40));
		observe(it4.next(50));
		observe(it4.next(60));
		observe(it4.next(70));
		observe(it4.next(0));
		observe(it4.next(0));
		observe(it4.next(0));
	});

	it("should properly destructure elements returned by generator statements", () => {
		function* arrayIterator<T>(arr: Array<T>) {
			for (const v of arr) {
				const dee = [v];
				yield dee;
			}
		}
		const array4 = [10, 20, 30];
		const it4 = arrayIterator(array4);
		const [, [a]] = it4;
		expect(a).to.equal(20);
		for (const [foo] of it4) {
			expect(foo).to.equal(30);
		}
	});

	it("should support the spread operator on iterators", () => {
		function* arrayIterator<T>(arr: Array<T>) {
			for (const v of arr) {
				yield v;
			}
		}

		const array4 = [10, 20, 30];
		const it4 = arrayIterator(array4);

		expect([...it4].every((x, i) => x === array4[i])).to.equal(true);
	});

	it("should suport using yield with a generator", () => {
		const [w, x, y, z] = walkDescendants(root);
		expect(w).to.equal(root);
		expect(x).to.equal(a);
		expect(y).to.equal(b);
		expect(z).to.equal(c);
	});

	it("should suport using yield with a generator with omitted expression", () => {
		const [, x, y, z] = walkDescendants(root);
		expect(x).to.equal(a);
		expect(y).to.equal(b);
		expect(z).to.equal(c);
	});

	it("should support using Symbol.iterator indirectly", () => {
		// ripped from https://www.lua.org/cgi-bin/demo?sieve
		// the sieve of Eratosthenes

		const answers = [
			2,
			3,
			5,
			7,
			11,
			13,
			17,
			19,
			23,
			29,
			31,
			37,
			41,
			43,
			47,
			53,
			59,
			61,
			67,
			71,
			73,
			79,
			83,
			89,
			97,
			101,
			103,
			107,
			109,
			113,
			127,
			131,
			137,
			139,
			149,
			151,
			157,
			163,
			167,
			173,
			179,
			181,
			191,
			193,
			197,
			199,
			211,
			223,
			227,
			229,
			233,
			239,
			241,
			251,
			257,
			263,
			269,
			271,
			277,
			281,
			283,
			293,
			307,
			311,
			313,
			317,
			331,
			337,
			347,
			349,
			353,
			359,
			367,
			373,
			379,
			383,
			389,
			397,
			401,
			409,
			419,
			421,
			431,
			433,
			439,
			443,
			449,
			457,
			461,
			463,
			467,
			479,
			487,
			491,
			499,
		];

		function* gen(n: number) {
			for (let i = 2; i <= n; i++) yield i;
		}

		function* filter(p: number, g: Iterable<number>) {
			for (const n of g) {
				if (n % p !== 0) yield n;
			}
		}

		let x = gen(500);
		let i = 0;
		while (true) {
			const n = x.next();
			if (n.done) break;
			else {
				const { value } = n;
				expect(value).to.equal(answers[i++]);
				x = filter(value, x);
			}
		}

		expect(i).to.equal(answers.size());
	});

	it("should support using Symbol.iterator directly", () => {
		function* range(start: number, last: number, iter: number = 1) {
			for (let i = start; i <= last; i += iter) yield i;
		}

		let n = 0;

		for (const i of range(0, 5)
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()
			[Symbol.iterator]()) {
			expect(i).to.equal(n++);
		}

		const x = range(6, 10, 2);

		expect(x[Symbol.iterator]().next().value).to.equal(n);
		expect(x[Symbol.iterator]().next().value).to.equal((n += 2));
		expect(x[Symbol.iterator]().next().value).to.equal((n += 2));
		expect(x[Symbol.iterator]().next().value).to.equal(undefined);
	});
};
