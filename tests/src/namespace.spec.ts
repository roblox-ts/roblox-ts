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
	it("should allow namespaces", () => {
		expect(n1.a).to.equal("a");
	});

	it("should allow nested namespaces", () => {
		expect(n2.n3.a).to.equal("a");
	});

	it("should allow shadowed namespaces", () => {
		expect(foo.foo.foo.bar).to.equal("bar");
	});
};
