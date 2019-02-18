let y = 0;
namespace Foo {
	export let x = 1;
	y = x;
}

export = () => {
	it("should allow mutatable exports", () => {
		expect(Foo.x).to.equal(1);
		Foo.x = 2;
		expect(Foo.x).to.equal(2);
		expect(y).to.equal(1);
	});
};
