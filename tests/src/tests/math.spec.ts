/// <reference types="@rbxts/testez/globals" />

export = () => {
	describe("should support basic math operators", () => {
		it("should add numbers", () => {
			expect(1 + 5).to.equal(6);
			expect(22 + 44).to.equal(66);
		});

		it("should subtract numbers", () => {
			expect(10 - 3).to.equal(7);
			expect(20 - 37).to.equal(-17);
		});

		it("should multiply numbers", () => {
			expect(5 * 7).to.equal(35);
			expect(8 * 12).to.equal(96);
		});

		it("should divide numbers", () => {
			expect(6 / 3).to.equal(2);
			expect(22 / 44).to.equal(0.5);
		});

		it("should modulus numbers", () => {
			expect(5 % 2).to.equal(1);
			expect(100 % 17).to.equal(15);
		});

		it("should exponent numbers", () => {
			expect(2 ** 3).to.equal(8);
			expect(4 ** 5).to.equal(1024);
		});
	});

	describe("should support math unary operators", () => {
		it("should post increment", () => {
			let x = 10;
			x++;
			expect(x).to.equal(11);
			expect(x++).to.equal(11);
			expect(x).to.equal(12);
		});

		it("should pre increment", () => {
			let x = 10;
			++x;
			expect(x).to.equal(11);
			expect(++x).to.equal(12);
			expect(x).to.equal(12);
		});

		it("should post decrement", () => {
			let x = 10;
			x--;
			expect(x).to.equal(9);
			expect(x--).to.equal(9);
			expect(x).to.equal(8);
		});

		it("should pre decrement", () => {
			let x = 10;
			--x;
			expect(x).to.equal(9);
			expect(--x).to.equal(8);
			expect(x).to.equal(8);
		});
	});

	describe("should support compound assignment", () => {
		it("should compound assign addition", () => {
			let x = 10;
			x += 2;
			expect(x).to.equal(12);
			expect((x += 5)).to.equal(17);
		});

		it("should compound assign subtraction", () => {
			let x = 10;
			x -= 2;
			expect(x).to.equal(8);
			expect((x -= 5)).to.equal(3);
		});

		it("should compound assign multiplication", () => {
			let x = 10;
			x *= 2;
			expect(x).to.equal(20);
			expect((x *= 5)).to.equal(100);
		});

		it("should compound assign division", () => {
			let x = 10;
			x /= 2;
			expect(x).to.equal(5);
			expect((x /= 5)).to.equal(1);
		});

		it("should compound assign modulus", () => {
			let x = 10;
			x %= 2;
			expect(x).to.equal(0);
			expect((x %= 5)).to.equal(0);
		});

		it("should compound assign exponents", () => {
			let x = 10;
			x **= 2;
			expect(x).to.equal(100);
			expect((x **= 5)).to.equal(100e8);
		});
	});

	// unfortunately, these are the only types and operators that lemur supports
	describe("should support macro math", () => {
		it("should add UDim values", () => {
			const a = new UDim(1, 10);
			const b = new UDim(0, 5);
			const c = a.add(b);
			expect(c.Scale).to.equal(1);
			expect(c.Offset).to.equal(15);
		});

		it("should add UDim2 values", () => {
			const a = new UDim2(1, 0, 1, 0);
			const b = new UDim2(0, 10, 0, 10);
			const c = a.add(b);
			expect(c.X.Scale).to.equal(1);
			expect(c.X.Offset).to.equal(10);
			expect(c.Y.Scale).to.equal(1);
			expect(c.Y.Offset).to.equal(10);
		});

		it("should add Vector2 vaulues", () => {
			const a = new Vector2(1, 2);
			const b = new Vector2(3, 4);
			const c = a.add(b);
			expect(c.X).to.equal(4);
			expect(c.Y).to.equal(6);
		});
	});
};
