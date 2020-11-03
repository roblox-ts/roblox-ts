export {};

class A {
	x = 1;
}

class B extends A {
	constructor() {
		super();
		print(super.x);
	}
}
