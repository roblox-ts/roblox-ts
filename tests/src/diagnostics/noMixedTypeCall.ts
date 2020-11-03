export {};

interface Foo {
	foo(): void;
	foo(this: void): void;
}

declare const bar: Foo;
bar.foo();
