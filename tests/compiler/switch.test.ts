import { createTestProject } from "./createTestProject";

it("emits enum case values directly", () => {
	const project = createTestProject();
	const output = project.compileSource(`
		enum Kind {
			A = "A",
			B = "B",
		}
		function handle(value: Kind | "missing", enumAlias: typeof Kind) {
			switch (value) {
				case "missing":
					break;
				case Kind.A:
					break;
				case Kind["B"]:
					break;
				case enumAlias.B:
					break;
			}
		}
	`);
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
