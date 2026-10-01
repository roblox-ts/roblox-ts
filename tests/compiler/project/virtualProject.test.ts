import { VirtualProject } from "Project/classes/VirtualProject";
import { COMPILER_VERSION } from "Shared/constants";

import { loadTestTypes } from "../createTestProject";

it("compiles a virtual project with default options and a compiler header", () => {
	const project = new VirtualProject();
	loadTestTypes(project);

	expect(project.compileSource("export const value = 1;")).toBe(
		`-- Compiled with roblox-ts v${COMPILER_VERSION}\nlocal value = 1\nreturn {\n\tvalue = value,\n}\n`,
	);
});
