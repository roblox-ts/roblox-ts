import { createTestProject } from "./createTestProject";

// keep cases alphabetized to match Jest's snapshot ordering
it.each([
	[
		"class field and parameter initializers",
		`const values = [1, 2, 3];
		class Example {
			value = values.pop();
			constructor(readonly other = values.pop()) {}
		}
		print(new Example(10), new Example());`,
	],
	[
		"conditional macro expansion inside an optional call",
		`declare const enabled: boolean;
		declare const values: Array<number> | undefined;
		const first = [1, 2];
		const second = [3, 4];
		const result = values?.map(() => enabled ? first.pop() : second.pop());
		print(result);`,
	],
	[
		"destructuring defaults before object rest",
		`const values = [1, 2, 3];
		function read({ value = values.pop(), ...rest }: { value?: number; other: number }) {
			return [value, rest.other];
		}
		print(read({ other: 4 }), read({ value: 5, other: 6 }));`,
	],
	[
		"else-if condition prerequisites",
		`const values = [1, 2, 3];
		function read(enabled: boolean) {
			if (enabled) {
				return 0;
			} else if (values.pop() === 3) {
				return values.pop();
			}
			return values.pop();
		}
		print(read(true), read(false));`,
	],
	[
		"loop condition and increment prerequisites with continue",
		`const values = [1, 2, 3];
		let checks = 0;
		let increments = 0;
		for (; (checks += 1) < 4 && values.pop() !== undefined; increments += 1) {
			if (checks === 2) { continue; }
			print(checks);
		}
		print(checks, increments);`,
	],
	[
		"statement comments and hoisted declarations",
		`const values = [1, 2, 3];
		// keep this comment before the hoist and temporary
		const read = [() => later, values.pop()];
		const later = 4;
		print(read, later);`,
	],
	[
		"statement prerequisites before namespace exports",
		`const values = [1, 2, 3];
		namespace Example {
			export const value = values.pop();
			export function read() { return values.pop(); }
		}
		print(Example.value, Example.read());`,
	],
	[
		"try return and throw prerequisites",
		`const values = [1, 2, 3, 4];
		function read(enabled: boolean) {
			try {
				if (enabled) { return $tuple(values.pop(), values.pop()); }
				throw values.pop();
			} catch (error) {
				return $tuple(error, values.pop());
			}
		}
		print(read(true));
		print(read(false));`,
	],
])("preserves prerequisites for %s", (name, source) => {
	const outputs = [false, true].map(optimizedLoops => {
		const project = createTestProject({ optimizedLoops });
		return project.compileSource(source).replace(/^-- Compiled with.*\n/, "");
	});

	expect(outputs[0]).toBe(outputs[1]);
	expect(outputs[0]).toMatchSnapshot();
});
