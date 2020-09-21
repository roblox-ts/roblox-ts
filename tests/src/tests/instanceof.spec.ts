/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support instanceof", () => {
		class Foo {}
		class Bar extends Foo {}
		class Baz {}

		const foo = new Foo();
		expect(foo instanceof Foo).to.equal(true);
		expect(foo instanceof Bar).to.equal(false);
		expect(foo instanceof Baz).to.equal(false);

		const bar = new Bar();
		expect(bar instanceof Foo).to.equal(true);
		expect(bar instanceof Bar).to.equal(true);
		expect(bar instanceof Baz).to.equal(false);

		const baz = new Baz();
		expect(baz instanceof Foo).to.equal(false);
		expect(baz instanceof Bar).to.equal(false);
		expect(baz instanceof Baz).to.equal(true);
	});
};
