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

		const [w, x, y, z] = walkDescendants(root);
		expect(w).to.equal(root);
		expect(x).to.equal(a);
		expect(y).to.equal(b);
		expect(z).to.equal(c);
	});
};
