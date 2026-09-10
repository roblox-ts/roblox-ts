async function* foo() {
	yield 1;
}

const expression = async function* () {
	yield 1;
};

class Generator {
	async *values() {
		yield 1;
	}
}
