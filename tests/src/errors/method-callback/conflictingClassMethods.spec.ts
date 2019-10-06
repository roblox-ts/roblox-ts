{
	class A {
		f() {}
	}

	class B {
		f = () => {};
	}

	function f(x: A | B) {
		x.f();
	}
}
export {};
