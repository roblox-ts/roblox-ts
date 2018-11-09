namespace n1 {
	export const a = "a";
}

namespace n2 {
	export namespace n3 { export const a = "a"; }
}

/* tslint:disable */
namespace foo {
	export namespace foo { export namespace foo { export const bar = "bar"; } }
}
/* tslint:enable */

export = () => {
	it("should support namespaces", () => {
		expect(n1.a).to.equal("a");
	});

	it("should support nested namespaces", () => {
		expect(n2.n3.a).to.equal("a");
	});

	it("should support shadowed namespaces", () => {
		expect(foo.foo.foo.bar).to.equal("bar");
	});
};
