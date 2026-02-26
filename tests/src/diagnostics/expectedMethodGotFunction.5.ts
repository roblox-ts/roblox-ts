interface MyWow {
	method(a: string): void;
}

class A implements MyWow {
	method = (a: string) => {};
}
