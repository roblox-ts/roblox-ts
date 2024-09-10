export = () => {
	it("should support ternary expressions", () => {
		expect(true ? 1 : 0).to.equal(1);
		expect(false ? 1 : 0).to.equal(0);
		expect(true ? false : true).to.equal(false);
		expect(false ? false : true).to.equal(true);
	});

	it("should support JS truthiness", () => {
		let value = 123;
		let zero = 0;
		let emptyStr = "";
		let NaN = 0 / 0;

		expect(value ? "PASS" : "FAIL").to.equal("PASS");
		expect(zero ? "PASS" : "FAIL").to.equal("FAIL");
		expect(emptyStr ? "PASS" : "FAIL").to.equal("FAIL");
		expect(NaN ? "PASS" : "FAIL").to.equal("FAIL");
	});

	it("should support JS truthiness with prereqs", () => {
		let value = 123;
		let zero = 0;
		let emptyStr = "";
		let NaN = 0 / 0;

		let strA = "A";
		let strB = "";

		expect(value ? (strA += "B") : "FAIL").to.equal("AB");
		expect(zero ? "FAIL" : (strB += "X")).to.equal("X");
		expect(emptyStr ? "FAIL" : (strB += "Y")).to.equal("XY");
		expect(NaN ? "FAIL" : (strB += "Z")).to.equal("XYZ");
	});

	it("should correctly wrap if-expressions in parentheses where needed", () => {
		function getColorStr(on: boolean) {
			return `${on ? "on" : "off"}Color`;
		}

		expect(getColorStr(true)).to.equal("onColor");
		expect(getColorStr(false)).to.equal("offColor");
	});
};
