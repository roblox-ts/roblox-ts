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
				return "foo";
			} catch (e) {}
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

	it("should support try/catch without a catch variable", () => {
		function foo(): unknown {
			let exception: unknown;
			try {
				throw "bar";
			} catch {
				exception = "abc";
			}
			return exception;
		}
		expect(foo()).to.equal("abc");
	});

	it("should support try/catch with finally", () => {
		const values = new Array<string>();
		try {
			values.push("A");
			throw "bar";
		} catch {
			values.push("B");
		} finally {
			values.push("C");
		}
		expect(values[0]).to.equal("A");
		expect(values[1]).to.equal("B");
		expect(values[2]).to.equal("C");
	});

	it("should support try with finally", () => {
		const values = new Array<string>();
		try {
			values.push("A");
		} finally {
			values.push("C");
		}
		expect(values[0]).to.equal("A");
		expect(values[1]).to.equal("C");
	});

	it("should support nested try/catch with return", () => {
		function foo(): unknown {
			try {
				try {
					return "foo";
				} catch (e) {}
			} catch (e) {}
		}
		expect(foo()).to.be.a("string");
	});

	it("should support nested try/catch with break", () => {
		let x = 0;
		for (let i = 0; i < 2; i++) {
			x++;
			try {
				try {
					break;
				} catch (e) {}
			} catch (e) {}
		}
		expect(x).to.equal(1);
	});

	it("should support nested try/catch with continue", () => {
		let x = 0;
		for (let i = 0; i < 2; i++) {
			if (i % 2 === 0) {
				try {
					try {
						continue;
					} catch (e) {}
				} catch (e) {}
			}
			x++;
		}
		expect(x).to.equal(1);
	});
};
