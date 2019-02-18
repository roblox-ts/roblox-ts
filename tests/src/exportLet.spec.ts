namespace Foo {
	export let x = 1;
}

export = () => {
	it("should allow mutatable exports", () => {
		expect(Foo.x).to.equal(1);
		Foo.x = 2;
		expect(Foo.x).to.equal(2);
	});
};
