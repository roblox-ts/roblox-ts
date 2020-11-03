/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should support try/catch", () => {
		let x: number = 123;
		try {
			x = 456;
		} catch (e) {}
		expect(x).to.equal(456);
	});

	it("should support try/catch with throwing strings", () => {
		function foo(): unknown {
			let exception: unknown;
			try {
				throw "bar";
			} catch (e) {
				exception = e;
			}
			return exception;
		}
		expect(foo()).to.be.a("string");
	});

	it("should support try/catch with throwing objects", () => {
		function foo(): unknown {
			let exception: unknown;
			try {
				throw {};
			} catch (e) {
				exception = e;
			}
			return exception;
		}
		expect(foo()).to.be.a("table");
	});

	it("should support try/catch with return", () => {
		function foo(): unknown {
			try {
				throw "foo";
			} catch (e) {
				return e;
			}
		}
		expect(foo()).to.be.a("string");
	});

	it("should support try/catch with break", () => {
		let x = 0;
		for (let i = 0; i < 2; i++) {
			x++;
			try {
				break;
			} catch (e) {}
		}
		expect(x).to.equal(1);
	});

	it("should support try/catch with continue", () => {
		let x = 0;
		for (let i = 0; i < 2; i++) {
			if (i % 2 === 0) {
				try {
					continue;
				} catch (e) {}
			}
			x++;
		}
		expect(x).to.equal(1);
	});
};
