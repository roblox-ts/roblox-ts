function readNamespace() {
	return n1.a;
}

interface n1 {
	value: number;
}

declare namespace n1 {
	interface DeclaredShape {
		value: number;
	}
}

namespace TypesOnly {
	export interface Shape {
		value: number;
	}
}

namespace n1 {
	export declare const absent: number;
	export const a = "a";
	export function read(value: string): string;
	export function read(value: string) {
		return value;
	}
	export interface Shape {
		value: number;
	}
	export const Shape = { value: 42 };
	export type Label = string;
	export const Label = "label";
}

namespace dotted.inner {
	export const value = 42;
}

namespace n2 {
	export namespace n3 {
		export const a = "a";
	}
}

namespace foo {
	export namespace foo {
		export namespace foo {
			export const bar = "bar";
		}
	}
}

let namespaceEffects = 0;
namespace Empty {
	namespaceEffects++;
}
namespace WithFunction {
	export function value() {
		return 42;
	}
}
namespace Nested.Self {
	export function value() {
		return Self;
	}
}

enum EnumBeforeNamespace {
	Value = 3,
}
namespace EnumBeforeNamespace {
	export interface Shape {
		value: number;
	}
}

namespace NamespaceBeforeEnum {
	export type Label = string;
}
enum NamespaceBeforeEnum {
	Value = 4,
}

export = () => {
	it("should preserve enums merged with namespaces containing only types", () => {
		const shape: EnumBeforeNamespace.Shape = { value: EnumBeforeNamespace.Value };
		const label: NamespaceBeforeEnum.Label = NamespaceBeforeEnum[NamespaceBeforeEnum.Value];

		expect(shape.value).to.equal(3);
		expect(EnumBeforeNamespace[3]).to.equal("Value");
		expect(label).to.equal("Value");
	});

	it("should execute namespaces without exports", () => {
		expect(namespaceEffects).to.equal(1);
		expect(WithFunction.value()).to.equal(42);
		expect(Nested.Self.value()).to.equal(Nested.Self);
	});

	it("should support namespaces", () => {
		const typed: TypesOnly.Shape & n1.DeclaredShape & n1 = { value: 42 };

		expect(typed.value).to.equal(42);
		expect("absent" in n1).to.equal(false);
		expect(n1.a).to.equal("a");
		expect(readNamespace()).to.equal("a");
		expect(n1.read("value")).to.equal("value");
		expect(n1.Shape.value).to.equal(42);
		expect(n1.Label).to.equal("label");
		expect(dotted.inner.value).to.equal(42);
	});

	it("should support nested namespaces", () => {
		expect(n2.n3.a).to.equal("a");
	});

	it("should support shadowed namespaces", () => {
		expect(foo.foo.foo.bar).to.equal("bar");
	});
};
