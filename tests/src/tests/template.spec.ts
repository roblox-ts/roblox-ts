export = () => {
	it("should understand string templates", () => {
		const value = "hello";
		expect(`"${value} world"`).to.equal('"hello world"');
		expect(`"${value}" world`).to.equal('"hello" world');
		expect(`${value} "world"`).to.equal('hello "world"');
		expect(`a${"b"}c${"d"}e`).to.equal("abcde");
		expect(`1 ${`2 ${`3 ${4}`}`}`).to.equal("1 2 3 4");
		// prettier-ignore
		expect(`${value} {}`).to.equal("hello \{\}");
		// prettier-ignore
		expect(`${value} {world}`).to.equal("hello \{world\}");
		expect(`${value}\nworld`).to.equal("hello\nworld");
		expect(`${value}
world`).to.equal("hello\nworld");
		expect(() => `${value} ${{}}`).to.never.throw();
		expect(`${value} ${0} ${1}`.size()).to.equal(9);

		const tableStrLength = tostring({}).size();
		expect(`${value} ${{}}`.size()).to.equal(6 + tableStrLength);
		expect(`${value} ${[]}`.size()).to.equal(6 + tableStrLength);
		expect(`${value} ${new Map()}`.size()).to.equal(6 + tableStrLength);
		expect(`${value} ${new Set()}`.size()).to.equal(6 + tableStrLength);

		function returnsTuple() {
			return $tuple("Osyris", "rimuy", "Dionysusnu");
		}

		expect(`${value} ${returnsTuple()}`.size()).to.equal(6 + tableStrLength);
	});

	it("should support tagged TemplateExpression", () => {
		const OPERATIONS: { [index: string]: (a: Vector3, b: Vector3) => Vector3 } = {
			"*": (a, b) => a.mul(b),
			"/": (a, b) => a.div(b),
			"+": (a, b) => a.add(b),
			"-": (a, b) => a.sub(b),
		};

		function trim(s: string) {
			return s.match("^%s*(.-)%s*$")[0] as string;
		}

		function m(strings: TemplateStringsArray, ...operands: Array<Vector3>): Vector3 {
			const operators = strings.map(trim);

			let value = operands.shift()!;
			operators.shift();

			for (let i = 0; i < operands.size(); i++) {
				const operator = trim(operators[i]);
				if (operator in OPERATIONS) {
					const operation = OPERATIONS[operator];
					value = operation(value, operands[i]);
				}
			}

			return value;
		}

		const a = new Vector3(1, 2, 3);
		const b = new Vector3(4, 5, 6);
		const pos = m`${a} * ${b} - ${new Vector3(1, 2, 3)}`;

		expect(pos.X).to.equal(3);
		expect(pos.Y).to.equal(8);
		expect(pos.Z).to.equal(15);
	});

	it("should support tagged NoSubstitutionTemplateLiteral", () => {
		function foo(strings: TemplateStringsArray) {
			return "baz";
		}
		expect(foo`bar`).to.equal("baz");
	});

	it("should support functions which might return void", () => {
		function foo() {
			if (math.random() > 1) {
				// impossible condition, math.random will always be 0-1
				// but this generates an optional return type for TS
				return new Instance("Model");
			}
		}
		tonumber(foo());
		expect(`value = ${foo()}`).to.equal("value = nil");
	});

	it("should support defined expressions", () => {
		const value: defined = 123;
		expect(`value = ${value}`).to.equal("value = 123");
	});

	it("should support unknown expressions", () => {
		const value: unknown = 456;
		expect(`value = ${value}`).to.equal("value = 456");
	});

	it("should not escape unicode sequences in template literals", () => {
		expect(`\u{E001}`).to.equal("\u{E001}");
	});

	it("should preserve decoded escapes in every template segment", () => {
		const separator = "X";
		const slash = string.char(92);
		expect(`a\u005cb${separator}c\u005cd${separator}e\u005cf`).to.equal(
			"a" + slash + "bXc" + slash + "dXe" + slash + "f",
		);
		expect(`a\u005cb`).to.equal("a" + slash + "b");
	});

	it("should preserve escaped backticks, braces, and literal escape text", () => {
		const separator = "X";
		const tick = string.char(96);
		const slash = string.char(92);
		expect(`a\`${separator}b\`${separator}c\``).to.equal("a" + tick + "Xb" + tick + "Xc" + tick);
		expect(`\`{value}\``).to.equal(tick + "{value}" + tick);
		expect(`\\u{0041}${separator}\\n`).to.equal(slash + "u{0041}X" + slash + "n");
	});

	it("should preserve control characters and line continuations in templates", () => {
		const separator = "X";
		expect(`a\0${separator}\r\n${separator}\x01`).to.equal(string.char(97, 0, 88, 13, 10, 88, 1));
		// prettier-ignore
		expect(`a\
b${separator}c\
d`).to.equal("abXcd");
	});

	it("should translate TypeScript-only escapes in templates", () => {
		const separator = "X";
		expect(`\uD83D\uDE00${separator}\uD83D\uDE00`).to.equal("😀X😀");
		expect(`\\uD83D\\uDE00${separator}`).to.equal(string.char(92) + "uD83D" + string.char(92) + "uDE00X");
		// prettier-ignore
		expect(`\a\z\/\$\{\}${separator}`).to.equal("az/${}X");
	});
};
