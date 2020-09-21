/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support map constructor", () => {
		const map = new Map([
			["foo", 1],
			["bar", 2],
			["baz", 3],
		]);
		expect(map.get("foo")).to.equal(1);
		expect(map.get("bar")).to.equal(2);
		expect(map.get("baz")).to.equal(3);
	});

	it("should support weak maps", () => {
		const map = new WeakMap<Instance, string>();
		const f = new Instance("Frame");
		map.set(f, "foo");
		expect(map.get(f)).to.equal("foo");
	});

	it("should support get and set", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		map.get("a");
		expect(map.get("a")).to.equal(1);
		expect(map.get("b")).to.equal(2);
		expect(map.get("c")).to.equal(3);
		expect(map.set("d", 4)).to.equal(map);
		map.set("e", 5);
		expect(map.get("e")).to.equal(5);
	});

	it("should support has", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		map.has("a");
		expect(map.has("a")).to.equal(true);
		expect(map.has("b")).to.equal(true);
		expect(map.has("c")).to.equal(true);
		expect(map.has("d")).to.equal(false);
	});

	it("should support delete", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		const hadA = map.delete("a");
		expect(hadA).to.equal(true);
		expect(map.get("a")).never.to.be.ok();
	});

	it("should support size", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		expect(map.size()).to.equal(3);
		map.delete("b");
		expect(map.size()).to.equal(2);
	});

	it("should support entries", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		const a = map.entries();
		expect(a.some(v => v[0] === "a" && v[1] === 1)).to.equal(true);
		expect(a.some(v => v[0] === "b" && v[1] === 2)).to.equal(true);
		expect(a.some(v => v[0] === "c" && v[1] === 3)).to.equal(true);
	});

	it("should support clear", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		map.clear();
		expect(map.has("a")).to.equal(false);
		expect(map.has("b")).to.equal(false);
		expect(map.has("c")).to.equal(false);
		expect(map.get("a")).never.to.be.ok();
		expect(map.get("b")).never.to.be.ok();
		expect(map.get("c")).never.to.be.ok();
		expect(map.size()).to.equal(0);
	});

	it("should support forEach", () => {
		let hitA = 0;
		let hitB = 0;
		let hitC = 0;

		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);

		map.forEach((value, key, obj) => {
			if (key === "a" && value === 1) {
				hitA++;
			} else if (key === "b" && value === 2) {
				hitB++;
			} else if (key === "c" && value === 3) {
				hitC++;
			}
			expect(obj).to.equal(map);
		});

		expect(hitA).to.equal(1);
		expect(hitB).to.equal(1);
		expect(hitC).to.equal(1);
	});

	it("should support keys", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		const a = map.keys();
		expect(a.some(v => v === "a")).to.equal(true);
		expect(a.some(v => v === "b")).to.equal(true);
		expect(a.some(v => v === "c")).to.equal(true);
	});

	it("should support values", () => {
		const map = new Map<string, number>([
			["b", 2],
			["c", 4],
			["a", 9],
		])
			.set("a", 1)
			.set("c", 3);
		const a = map.values();
		expect(a.some(v => v === 1)).to.equal(true);
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 3)).to.equal(true);
	});

	it("should support constructor parameters", () => {
		const arr: ReadonlyArray<[string, number]> = [
			["a", 1],
			["b", 2],
			["c", 3],
		];

		const map = new Map<string, number>([
			["a", 1],
			["b", 2],
			["c", 3],
		]);
		const map2 = new Map<string, number>(arr);

		{
			const a = map.values();
			expect(a.some(v => v === 1)).to.equal(true);
			expect(a.some(v => v === 2)).to.equal(true);
			expect(a.some(v => v === 3)).to.equal(true);
		}
		{
			const a = map2.values();
			expect(a.some(v => v === 1)).to.equal(true);
			expect(a.some(v => v === 2)).to.equal(true);
			expect(a.some(v => v === 3)).to.equal(true);
		}
	});

	it("should support isEmpty", () => {
		new Map<string, number>().isEmpty();
		const v = new Map<string, number>().isEmpty();
		const map = new Map<string, number>();
		map.isEmpty();
		const x = map.isEmpty();

		expect(v).to.equal(true);
		expect(map.set("Nope", 1).isEmpty()).to.equal(false);
	});

	// it("should support the spread operator on maps", () => {
	// 	expect(
	// 		[
	// 			...new Map([
	// 				["a", 97],
	// 				["b", 98],
	// 			]),
	// 			...new Map([
	// 				["c", 99],
	// 				["d", 100],
	// 			]),
	// 		].every(([l, n]) => l === string.char(n)),
	// 	).to.equal(true);
	// });

	it("should support the non-null assertion operator on maps", () => {
		const a = new Map<number, number>();
		let c: Map<number, number> | undefined;
		(c!!! = a!!!).set(1, 2);
		expect(a!.get(1)).to.equal(2);

		const b = new Map<string, Array<number>>([["a", [123]]]);
		expect(b.get("a")![0]).to.equal(123);
	});

	it("should support creating ReadonlyMaps", () => {
		const map = new ReadonlyMap([
			["foo", 1],
			["bar", 2],
			["baz", 3],
		]);
		expect(map.get("foo")).to.equal(1);
		expect(map.get("bar")).to.equal(2);
		expect(map.get("baz")).to.equal(3);
	});

	it("should support creating Maps with tuple calls", () => {
		function foo(): [number, string] {
			return [123, "abc"];
		}
		const map = new Map([foo()]);
		expect(map.get(123)).to.equal("abc");
	});
};
