export = () => {
	it("should support set constructor", () => {
		const set = new Set(["foo", "bar", "baz"]);
		expect(set.has("foo")).to.equal(true);
		expect(set.has("bar")).to.equal(true);
		expect(set.has("baz")).to.equal(true);
	});

	it("should support weak sets", () => {
		const set = new WeakSet<Instance>();
		const f = new Instance("Frame");
		set.add(f);
		expect(set.has(f)).to.equal(true);
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

	it("should support entries", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		const a = set.entries();
		expect(a.some(v => v[0] === "a" && v[1] === "a")).to.equal(true);
		expect(a.some(v => v[0] === "b" && v[1] === "b")).to.equal(true);
		expect(a.some(v => v[0] === "c" && v[1] === "c")).to.equal(true);
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

	it("should support keys", () => {
		const set = new Set<string>()
			.add("a")
			.add("b")
			.add("c");
		const a = set.keys();
		expect(a.some(v => v === "a")).to.equal(true);
		expect(a.some(v => v === "b")).to.equal(true);
		expect(a.some(v => v === "c")).to.equal(true);
		expect(a.some(v => v === "d")).to.equal(false);
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
		expect(typeof new Set<string>().toString()).to.equal("string");
	});
};
