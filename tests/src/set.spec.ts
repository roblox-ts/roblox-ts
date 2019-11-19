declare function getmetatable(obj: object): { __mode: "k" | "v" | "kv" };

export = () => {
	it("should support set constructor", () => {
		const set = new Set(["foo", "bar", "baz"]);
		expect(set.has("foo")).to.equal(true);
		expect(set.has("bar")).to.equal(true);
		expect(set.has("baz")).to.equal(true);

		{
			new Set([1, 2, 3]);
			new Set([1, 2, 3]).add(4);
			new Set([1, 2, 3]).add(4).add(5);

			const u = new Set([1, 2, 3]);
			const v = new Set([1, 2, 3]).add(4);
			const w = new Set([1, 2, 3]).add(4).add(5);

			const x = () => new Set([1, 2, 3]);
			const y = () => new Set([1, 2, 3]).add(4);
			const z = () => new Set([1, 2, 3]).add(4).add(5);

			let i = 0;

			new Set([1, 2, (() => i++)()]);
			new Set([1, 2, (() => i++)()]).add(4);
			new Set([1, 2, (() => i++)()]).add(4).add(5);

			const a = new Set([1, 2, (() => i++)()]);
			const b = new Set([1, 2, (() => i++)()]).add(4);
			const c = new Set([1, 2, (() => i++)()]).add(4).add(5);

			const d = () => new Set([1, 2, (() => i++)()]);
			const e = () => new Set([1, 2, (() => i++)()]).add(4);
			const f = () => new Set([1, 2, (() => i++)()]).add(4).add(5);

			expect(i).to.equal(6);
			d();
			expect(i).to.equal(7);
			e();
			expect(i).to.equal(8);
			f();
			expect(i).to.equal(9);
		}

		{
			new Set([...[1, 2, 3]]);
			new Set([...[1, 2, 3]]).add(4);
			new Set([...[1, 2, 3]]).add(4).add(5);

			const u = new Set([...[1, 2, 3]]);
			const v = new Set([...[1, 2, 3]]).add(4);
			const w = new Set([...[1, 2, 3]]).add(4).add(5);

			const x = () => new Set([...[1, 2, 3]]);
			const y = () => new Set([...[1, 2, 3]]).add(4);
			const z = () => new Set([...[1, 2, 3]]).add(4).add(5);

			let i = 0;

			new Set([...[1, 2, (() => i++)()]]);
			new Set([...[1, 2, (() => i++)()]]).add(4);
			new Set([...[1, 2, (() => i++)()]]).add(4).add(5);

			const a = new Set([...[1, 2, (() => i++)()]]);
			const b = new Set([...[1, 2, (() => i++)()]]).add(4);
			const c = new Set([...[1, 2, (() => i++)()]]).add(4).add(5);

			const d = () => new Set([...[1, 2, (() => i++)()]]);
			const e = () => new Set([...[1, 2, (() => i++)()]]).add(4);
			const f = () => new Set([...[1, 2, (() => i++)()]]).add(4).add(5);

			expect(i).to.equal(6);
			d();
			expect(i).to.equal(7);
			e();
			expect(i).to.equal(8);
			f();
			expect(i).to.equal(9);
		}
	});

	it("should support weak sets", () => {
		const set = new WeakSet<Instance>();
		const f = new Instance("Frame");
		set.add(f);
		expect(set.has(f)).to.equal(true);
		let i = 0;

		let k = { x: i++ };

		new WeakSet();
		new WeakSet([]);
		new WeakSet([...[[]]]);
		new WeakSet([{}]);
		new WeakSet([{ x: i++ }]);
		new WeakSet([{ ...k }]);

		expect(getmetatable(new WeakSet()).__mode).to.equal("k");
		expect(getmetatable(new WeakSet([])).__mode).to.equal("k");
		expect(getmetatable(new WeakSet([...[[]]])).__mode).to.equal("k");
		expect(getmetatable(new WeakSet([{}])).__mode).to.equal("k");
		expect(getmetatable(new WeakSet([{ x: i++ }])).__mode).to.equal("k");
		expect(getmetatable(new WeakSet([{ ...k }])).__mode).to.equal("k");

		const u = new WeakSet();
		const v = new WeakSet([]);
		const w = new WeakSet([...[[]]]);
		const x = new WeakSet([{}]);
		const y = new WeakSet([{ x: i++ }]);
		const z = new WeakSet([{ ...k }]);

		expect(getmetatable(u).__mode).to.equal("k");
		expect(getmetatable(v).__mode).to.equal("k");
		expect(getmetatable(w).__mode).to.equal("k");
		expect(getmetatable(x).__mode).to.equal("k");
		expect(getmetatable(y).__mode).to.equal("k");
		expect(getmetatable(z).__mode).to.equal("k");
	});

	it("should support add", () => {
		const set = new Set<string>();
		set.add("foo");
		expect(set.add("test")).to.equal(set);
		expect(set.has("foo")).to.equal(true);
	});

	it("should support has", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		set.has("a");
		expect(set.has("a")).to.equal(true);
		expect(set.has("b")).to.equal(true);
		expect(set.has("c")).to.equal(true);
		expect(set.has("d")).to.equal(false);
	});

	it("should support clear", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		set.clear();
		expect(set.size()).to.equal(0);
		expect(set.has("a")).to.equal(false);
		expect(set.has("b")).to.equal(false);
		expect(set.has("c")).to.equal(false);
	});

	it("should support delete", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		expect(set.size()).to.equal(3);
		expect(set.has("b")).to.equal(true);
		const hadB = set.delete("b");
		const hadD = set.delete("d");
		expect(hadB).to.equal(true);
		expect(hadD).to.equal(false);
		expect(set.size()).to.equal(2);
		expect(set.has("b")).to.equal(false);
		expect(set.has("a")).to.equal(true);
		set.delete("a");
		expect(set.has("a")).to.equal(false);
	});

	it("should support forEach", () => {
		let hitA = 0;
		let hitB = 0;
		let hitC = 0;

		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		set.forEach((value, value2, obj) => {
			expect(value).to.equal(value2);
			expect(obj).to.equal(set);
			if (value === "a") {
				hitA++;
			} else if (value === "b") {
				hitB++;
			} else if (value === "c") {
				hitC++;
			}
		});
		expect(hitA).to.equal(1);
		expect(hitB).to.equal(1);
		expect(hitC).to.equal(1);
	});

	it("should support values", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		const a = set.values();
		expect(a.some(v => v === "a")).to.equal(true);
		expect(a.some(v => v === "b")).to.equal(true);
		expect(a.some(v => v === "c")).to.equal(true);
		expect(a.some(v => v === "d")).to.equal(false);
	});

	it("should support size", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		expect(set.size()).to.equal(3);
		set.add("d");
		expect(set.size()).to.equal(4);
	});

	it("should support toString", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		expect(set.toString()).to.be.ok();
		expect(typeOf(new Set<string>().toString())).to.equal("string");
	});

	it("should support isSubsetOf", () => {
		const set1 = new Set<string>()
			.add("a")
			.add("b")
			.add("c");

		const set2 = new Set<string>().add("b").add("a");

		expect(set1.isSubsetOf(set2)).to.equal(false);
		expect(set2.isSubsetOf(set1)).to.equal(true);

		set2.add("c");

		expect(set1.isSubsetOf(set2)).to.equal(true);
		expect(set2.isSubsetOf(set1)).to.equal(true);
		expect(set2.isSubsetOf(set2)).to.equal(true);
	});

	it("should support union", () => {
		const set1 = new Set<string>()
			.add("a")
			.add("b")
			.add("c");

		const set2 = new Set<string>()
			.add("d")
			.add("a")
			.add("e");

		const set3 = set1.union(set2);
		const set4 = new Set<string>()
			.add("d")
			.add("a")
			.add("e")
			.add("a")
			.add("b")
			.add("c");

		expect(set3.isSubsetOf(set4)).to.equal(true);
		expect(set4.isSubsetOf(set3)).to.equal(true);

		expect(set3.isSubsetOf(set1)).to.equal(false);
		expect(set3.isSubsetOf(set2)).to.equal(false);

		expect(set1.isSubsetOf(set3)).to.equal(true);
		expect(set2.isSubsetOf(set3)).to.equal(true);

		expect(set3.has("e")).to.equal(true);
		expect(set3.has("a")).to.equal(true);
		expect(set3.has("d")).to.equal(true);
		expect(set3.has("b")).to.equal(true);
		expect(set3.has("c")).to.equal(true);
	});

	it("should support intersect", () => {
		const set1 = new Set<number>().add(1).add(2);
		const set2 = new Set<number>().add(1).add(2);
		const set3 = set1.intersect(set2);

		expect(set3.has(1)).to.equal(true);
		expect(set3.has(2)).to.equal(true);

		set2.add(3);
		const set4 = set2.intersect(set3);
		expect(set4.has(3)).to.equal(false);
	});

	it("should support isDisjointWith", () => {
		const set1 = new Set<number>().add(1).add(2);
		const set2 = new Set<number>().add(1).add(2);
		const set3 = new Set<number>().add(3).add(4);
		const set4 = new Set<number>().add(4).add(2);

		expect(set1.isDisjointWith(set2)).to.equal(false);
		expect(set1.isDisjointWith(set3)).to.equal(true);
		expect(set1.isDisjointWith(set4)).to.equal(false);
	});

	it("should support difference", () => {
		// the symmetric difference of  { 7, 8, 9, 10 } and { 9, 10, 11, 12 } is the set { 7, 8, 11, 12 }
		const set1 = new Set<number>([7, 8])
			.add(9)
			.add(10);
		const set2 = new Set<number>([11])
			.add(9)
			.add(10)
			.add(12);
		const set3 = new Set<number>()
			.add(7)
			.add(8)
			.add(11)
			.add(12);

		const set4 = set1.difference(set2).union(set2.difference(set1));

		expect(set3.isSubsetOf(set4)).to.equal(true);
		expect(set4.isSubsetOf(set3)).to.equal(true);
	});

	it("should support isEmpty", () => {
		new Set<string>().isEmpty();
		const v = new Set<string>().isEmpty();
		const set = new Set<string>();
		set.isEmpty();
		const x = set.isEmpty();

		expect(v).to.equal(true);
		expect(set.add("Nope").isEmpty()).to.equal(false);
	});

	it("should support the spread operator on Sets", () => {
		const foo = new Set(["a", "b", "c"]);
		expect(new Set([...foo]).difference(foo).isEmpty()).to.equal(true);
	});

	it("should support creating ReadonlySets", () => {
		const set = new ReadonlySet(["foo", "bar", "baz"]);
		expect(set.has("foo")).to.equal(true);
		expect(set.has("bar")).to.equal(true);
		expect(set.has("baz")).to.equal(true);
	});
};
