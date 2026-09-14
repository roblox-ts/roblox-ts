import { createTestProject } from "./createTestProject";

it("supplies receiver slots only for direct calls that require them", () => {
	const output = createTestProject().compileSource(`
		type Callable<T> = (this: T, value: number) => number;
		function original(value: number) { return value + 1; }
		const callback: Callable<void> = original;
		callback(41);
		function method(this: defined | void, value: number) { return value + 1; }
		method(41);
		const optional: typeof method | undefined = (() => method)();
		optional?.(41);
		const adapted: Callable<void> = value => method(value);
		adapted(41);
	`);

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
