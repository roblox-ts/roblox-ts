import { createTestProject } from "./createTestProject";

it("captures the delegated next function once and forwards resume inputs", () => {
	const project = createTestProject();
	const output = project.compileSource(
		`
		declare function getIterator(): Generator<number, number, number>;
		function* delegate(): Generator<number, number, number> {
			return yield* getIterator();
		}
	`,
	);

	expect(output).toMatchSnapshot();
});
