import Vector, { a, b, c, foo, Fruits, letVar } from "./export";
import export_equals from "./export_equals";
import export_equals2 = require("./export_equals");
import { x, y, z } from "./export_dec";
import * as ns from "./namespaceExport";

export = () => {
	it("should support import/export equals", () => {
		expect(export_equals.foo).to.equal("bar");
		expect(export_equals2.foo).to.equal("bar");
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
		expect(x).to.equal(1);
		expect(y).to.equal(2);
		expect(z).to.equal(3);
	});

	it("should allow exported enums", () => {
		expect(Fruits).to.be.ok();
		expect(Fruits.Apple).to.equal(0);
		expect(Fruits.Orange).to.equal(1);
		expect(Fruits.Pear).to.equal(2);
		expect(Fruits[0]).to.equal("Apple");
		expect(Fruits[1]).to.equal("Orange");
		expect(Fruits[2]).to.equal("Pear");
	});

	it("should support let exports", () => {
		expect(letVar).to.equal(2);
	});

	it("should support namespace import/export", () => {
		expect(ns.a).to.equal(1);
		expect(ns.b).to.equal(2);
		expect(ns.c).to.equal(3);
		expect(ns.letVar).to.equal(2);
	});
};
