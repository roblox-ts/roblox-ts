class Foo {
	public bar<T extends string>(arg: T) {
		return arg;
	}
}

const foo = new Foo();
const bar = foo.bar<"hello">;
