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
		expect(tostring(foo()).find("bar")[0]).to.be.ok();
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

	it("should support try/catch with return in try block", () => {
		function foo(): unknown {
			try {
				return "foo";
			} catch (e) {}
		}
		expect(foo()).to.equal("foo");
	});

	it("should support try/catch with return in catch block", () => {
		function foo(): unknown {
			try {
				throw undefined;
			} catch {
				return "foo";
			}
		}
		expect(foo()).to.equal("foo");
	});

	it("should support try/catch with return in finally block", () => {
		function foo(): unknown {
			try {
				return 1;
			} finally {
				return 2;
			}
		}
		expect(foo()).to.equal(2);
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

	it("should support try/catch with multiple flow control cases", () => {
		function foo() {
			let x = 0;
			for (let i = 0; i < 10; i++) {
				try {
					if (i === 5) {
						return x;
					} else if (i % 2 === 0) {
						continue;
					}
					x++;
				} catch {}
			}
		}

		expect(foo()).to.equal(2);
	});

	it("should support loops between nested try/catch with break", () => {
		function foo() {
			let x = 0;
			try {
				for (let i = 0; i < 10; i++) {
					try {
						if (i === 5) {
							return x;
						} else if (i % 2 === 0) {
							continue;
						}
						x++;
					} catch {}
				}
			} catch {}
		}

		expect(foo()).to.equal(2);
	});

	it("should rethrow the error if there's no catch block", () => {
		function foo() {
			try {
				throw "bar";
			} finally {
			}
		}

		expect(() => foo()).to.throw("bar");
	});

	it("should run try -> catch -> finally in order", () => {
		const array = new Array<number>();
		try {
			let condition = true;
			try {
				array.push(1);
				if (condition) throw "error";
				array.push(999);
			} catch {
				array.push(2);
			} finally {
				array.push(3);
			}
		} catch {}

		expect(array[0]).to.equal(1);
		expect(array[1]).to.equal(2);
		expect(array[2]).to.equal(3);
	});

	it("should run try -> finally in order", () => {
		const array = new Array<number>();
		try {
			let condition = true;
			try {
				array.push(1);
				if (condition) throw "error";
				array.push(999);
			} finally {
				array.push(2);
			}
		} catch {}

		expect(array[0]).to.equal(1);
		expect(array[1]).to.equal(2);
	});

	it("should run finally even if catch throws", () => {
		let ranFinally = false;
		try {
			try {
				throw "try error";
			} catch {
				throw "catch error";
			} finally {
				ranFinally = true;
			}
		} catch {}

		expect(ranFinally).to.equal(true);
	});

	it("should throw if finally throws", () => {
		function foo() {
			try {
			} finally {
				throw "bar";
			}
		}

		expect(() => foo()).to.throw("bar");
	});

	it("should discard errors if finally has a control flow statement", () => {
		function tryErrorReturn() {
			try {
				throw "try error";
			} finally {
				return true;
			}
			return false;
		}

		expect(tryErrorReturn()).to.equal(true);

		function catchErrorReturn() {
			try {
				throw "try error";
			} catch {
				throw "catch error";
			} finally {
				return true;
			}
			return false;
		}

		expect(catchErrorReturn()).to.equal(true);

		function tryErrorBreak() {
			for (let i = 0; i < 10; i++) {
				try {
					throw "try error";
				} finally {
					break;
				}
				return false;
			}
			return true;
		}

		expect(tryErrorBreak()).to.equal(true);

		function catchErrorBreak() {
			for (let i = 0; i < 1; i++) {
				try {
					throw "try error";
				} catch {
					throw "catch error";
				} finally {
					break;
				}
				return false;
			}
			return true;
		}

		expect(catchErrorBreak()).to.equal(true);

		function tryErrorContinue() {
			for (let i = 0; i < 1; i++) {
				try {
					throw "try error";
				} finally {
					continue;
				}
				return false;
			}
			return true;
		}

		expect(tryErrorContinue()).to.equal(true);

		function catchErrorContinue() {
			for (let i = 0; i < 1; i++) {
				try {
					throw "try error";
				} catch {
					throw "catch error";
				} finally {
					continue;
				}
				return false;
			}
			return true;
		}

		expect(catchErrorContinue()).to.equal(true);
	});
};
