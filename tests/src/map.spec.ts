export = () => {
	it("should support get and set", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		expect(map.get("a")).to.equal(1);
		expect(map.get("b")).to.equal(2);
		expect(map.get("c")).to.equal(3);
		expect(map.set("d", 4)).to.equal(map);
	});

	it("should support has", () => {
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
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
		const map = new Map<string, number>()
			.set("a", 1)
			.set("b", 2)
			.set("c", 3);
		const a = map.values();
		expect(a.some(v => v === 1)).to.equal(true);
		expect(a.some(v => v === 2)).to.equal(true);
		expect(a.some(v => v === 3)).to.equal(true);
	});
};
