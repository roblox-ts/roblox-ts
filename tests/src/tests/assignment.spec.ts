export = () => {
	it("should support logical null coalescing assignment statement", () => {
		let x: boolean | undefined;
		x ??= true;
		expect(x).to.equal(true);
	});

	it("should support logical or assignment statement", () => {
		let x = false;
		x ||= true;
		expect(x).to.equal(true);
	});

	it("should support logical and assignment statement", () => {
		let x = true;
		x &&= false;
		expect(x).to.equal(false);
	});

	it("should support logical null coalescing assignment expression", () => {
		let x: boolean | undefined;
		expect((x ??= true)).to.equal(true);
		expect(x).to.equal(true);
	});

	it("should support logical or assignment expression", () => {
		let x = false;
		expect((x ||= true)).to.equal(true);
		expect(x).to.equal(true);
	});

	it("should support logical and assignment expression", () => {
		let x = true;
		expect((x &&= false)).to.equal(false);
		expect(x).to.equal(false);
	});
};
