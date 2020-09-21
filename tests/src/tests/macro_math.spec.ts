/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support CFrame * CFrame = CFrame", () => {
		const a = new CFrame(3, 7, 9);
		const b = new CFrame(1, 2, 3);
		const c = a.mul(b);
		expect(typeIs(c, "CFrame")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(9);
		expect(c.Z).to.equal(12);
	});

	it("should support CFrame * Vector3 = Vector3", () => {
		const a = new CFrame(3, 7, 9);
		const b = new Vector3(1, 2, 3);
		const c = a.mul(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(9);
		expect(c.Z).to.equal(12);
	});

	it("should support CFrame + Vector3 = CFrame", () => {
		const a = new CFrame(3, 7, 9);
		const b = new Vector3(1, 2, 3);
		const c = a.add(b);
		expect(typeIs(c, "CFrame")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(9);
		expect(c.Z).to.equal(12);
	});

	it("should support CFrame - Vector3 = CFrame", () => {
		const a = new CFrame(3, 7, 9);
		const b = new Vector3(1, 2, 3);
		const c = a.sub(b);
		expect(typeIs(c, "CFrame")).to.equal(true);
		expect(c.X).to.equal(2);
		expect(c.Y).to.equal(5);
		expect(c.Z).to.equal(6);
	});

	it("should support UDim + UDim = UDim", () => {
		const a = new UDim(1, 2);
		const b = new UDim(3, 4);
		const c = a.add(b);
		expect(typeIs(c, "UDim")).to.equal(true);
		expect(c.Scale).to.equal(4);
		expect(c.Offset).to.equal(6);
	});

	it("should support UDim - UDim = UDim", () => {
		const a = new UDim(1, 2);
		const b = new UDim(3, 4);
		const c = a.sub(b);
		expect(typeIs(c, "UDim")).to.equal(true);
		expect(c.Scale).to.equal(-2);
		expect(c.Offset).to.equal(-2);
	});

	it("should support UDim2 + UDim2 = UDim2", () => {
		const a = new UDim2(1, 2, 3, 4);
		const b = new UDim2(1, 1, 1, 1);
		const c = a.add(b);
		expect(typeIs(c, "UDim2")).to.equal(true);
		expect(c.X.Scale).to.equal(2);
		expect(c.X.Offset).to.equal(3);
		expect(c.Y.Scale).to.equal(4);
		expect(c.Y.Offset).to.equal(5);
	});

	it("should support UDim2 - UDim2 = UDim2", () => {
		const a = new UDim2(1, 2, 3, 4);
		const b = new UDim2(1, 1, 1, 1);
		const c = a.sub(b);
		expect(typeIs(c, "UDim2")).to.equal(true);
		expect(c.X.Scale).to.equal(0);
		expect(c.X.Offset).to.equal(1);
		expect(c.Y.Scale).to.equal(2);
		expect(c.Y.Offset).to.equal(3);
	});

	it("should support Vector2 + Vector2 = Vector2", () => {
		const a = new Vector2(1, 2);
		const b = new Vector2(3, 4);
		const c = a.add(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(6);
	});

	it("should support Vector2 - Vector2 = Vector2", () => {
		const a = new Vector2(1, 2);
		const b = new Vector2(3, 4);
		const c = a.sub(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(-2);
		expect(c.Y).to.equal(-2);
	});

	it("should support Vector2 * Vector2 = Vector2", () => {
		const a = new Vector2(1, 2);
		const b = new Vector2(3, 4);
		const c = a.mul(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(3);
		expect(c.Y).to.equal(8);
	});

	it("should support Vector2 * number = Vector2", () => {
		const a = new Vector2(1, 2);
		const b = 2;
		const c = a.mul(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(2);
		expect(c.Y).to.equal(4);
	});

	it("should support Vector2 / Vector2 = Vector2", () => {
		const a = new Vector2(8, 4);
		const b = new Vector2(2, 2);
		const c = a.div(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(2);
	});

	it("should support Vector2 / number = Vector2", () => {
		const a = new Vector2(8, 4);
		const b = 2;
		const c = a.div(b);
		expect(typeIs(c, "Vector2")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(2);
	});

	it("should support Vector2int16 + Vector2int16 = Vector2int16", () => {
		const a = new Vector2int16(1, 2);
		const b = new Vector2int16(3, 4);
		const c = a.add(b);
		expect(typeIs(c, "Vector2int16")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(6);
	});

	it("should support Vector2int16 - Vector2int16 = Vector2int16", () => {
		const a = new Vector2int16(3, 4);
		const b = new Vector2int16(1, 4);
		const c = a.sub(b);
		expect(typeIs(c, "Vector2int16")).to.equal(true);
		expect(c.X).to.equal(2);
		expect(c.Y).to.equal(0);
	});

	it("should support Vector2int16 * Vector2int16 = Vector2int16", () => {
		const a = new Vector2int16(1, 2);
		const b = new Vector2int16(3, 4);
		const c = a.mul(b);
		expect(typeIs(c, "Vector2int16")).to.equal(true);
		expect(c.X).to.equal(3);
		expect(c.Y).to.equal(8);
	});

	it("should support Vector2int16 / Vector2int16 = Vector2int16", () => {
		const a = new Vector2int16(2, 4);
		const b = new Vector2int16(2, 2);
		const c = a.div(b);
		expect(typeIs(c, "Vector2int16")).to.equal(true);
		expect(c.X).to.equal(1);
		expect(c.Y).to.equal(2);
	});

	it("should support Vector3 + Vector3 = Vector3", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(4, 5, 6);
		const c = a.add(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(5);
		expect(c.Y).to.equal(7);
		expect(c.Z).to.equal(9);
	});

	it("should support Vector3 - Vector3 = Vector3", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(0, 1, 0);
		const c = a.sub(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(1);
		expect(c.Y).to.equal(1);
		expect(c.Z).to.equal(3);
	});

	it("should support Vector3 * Vector3 = Vector3", () => {
		const a = new Vector3(1, 2, 3);
		const b = new Vector3(4, 5, 6);
		const c = a.mul(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(10);
		expect(c.Z).to.equal(18);
	});

	it("should support Vector3 * number = Vector3", () => {
		const a = new Vector3(1, 2, 3);
		const b = 2;
		const c = a.mul(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(2);
		expect(c.Y).to.equal(4);
		expect(c.Z).to.equal(6);
	});

	it("should support Vector3 / Vector3 = Vector3", () => {
		const a = new Vector3(4, 6, 8);
		const b = new Vector3(2, 2, 2);
		const c = a.div(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(2);
		expect(c.Y).to.equal(3);
		expect(c.Z).to.equal(4);
	});

	it("should support Vector3 / number = Vector3", () => {
		const a = new Vector3(2, 4, 6);
		const b = 2;
		const c = a.div(b);
		expect(typeIs(c, "Vector3")).to.equal(true);
		expect(c.X).to.equal(1);
		expect(c.Y).to.equal(2);
		expect(c.Z).to.equal(3);
	});

	it("should support Vector3int16 + Vector3int16 = Vector3int16", () => {
		const a = new Vector3int16(1, 2, 3);
		const b = new Vector3int16(4, 5, 6);
		const c = a.add(b);
		expect(typeIs(c, "Vector3int16")).to.equal(true);
		expect(c.X).to.equal(5);
		expect(c.Y).to.equal(7);
		expect(c.Z).to.equal(9);
	});

	it("should support Vector3int16 - Vector3int16 = Vector3int16", () => {
		const a = new Vector3int16(1, 2, 3);
		const b = new Vector3int16(4, 5, 6);
		const c = a.sub(b);
		expect(typeIs(c, "Vector3int16")).to.equal(true);
		expect(c.X).to.equal(-3);
		expect(c.Y).to.equal(-3);
		expect(c.Z).to.equal(-3);
	});

	it("should support Vector3int16 * Vector3int16 = Vector3int16", () => {
		const a = new Vector3int16(1, 2, 3);
		const b = new Vector3int16(4, 5, 6);
		const c = a.mul(b);
		expect(typeIs(c, "Vector3int16")).to.equal(true);
		expect(c.X).to.equal(4);
		expect(c.Y).to.equal(10);
		expect(c.Z).to.equal(18);
	});

	it("should support Vector3int16 / Vector3int16 = Vector3int16", () => {
		const a = new Vector3int16(2, 4, 6);
		const b = new Vector3int16(2, 2, 2);
		const c = a.div(b);
		expect(typeIs(c, "Vector3int16")).to.equal(true);
		expect(c.X).to.equal(1);
		expect(c.Y).to.equal(2);
		expect(c.Z).to.equal(3);
	});

	it("should properly support roblox math macros with binary expressions", () => {
		const a = new Vector2(1, 2).mul(1 + 3);
		expect(a.X).to.equal(4);
		expect(a.Y).to.equal(8);
	});
};
