import Vector, { a, b, c, foo } from "./export";
import export_equals = require("./export_equals");
import export_dec = require("./export_dec");

export = () => {
	it("should support import/export equals", () => {
		expect(export_equals.foo).to.equal("bar");
	});

	it("should support namespace import/export", () => {
		expect(a).to.equal(1);
		expect(b).to.equal(2);
		expect(c).to.equal(3);
		expect(foo()).to.equal("bar");
	});

	it("should support default import/export", () => {
		const v = new Vector(1, 2, 3);
		expect(v.x).to.equal(1);
		expect(v.y).to.equal(2);
		expect(v.z).to.equal(3);
	});

	it("should support export declarations", () => {
		expect(export_dec()).to.equal("returnstr");
	})
};
