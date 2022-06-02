interface MyWow {
	method(): void;
}

class A implements MyWow {
	method = () => {}; // bad!
}
