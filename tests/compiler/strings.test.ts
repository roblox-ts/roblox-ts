import fs from "fs-extra";
import path from "path";

import { createTestProject } from "./createTestProject";

it("preserves string literal spelling", () => {
	const source = fs.readFileSync(path.join(__dirname, "fixtures/stringSpelling.ts"), "utf8");
	const project = createTestProject();
	const output = project.compileSource(source);
	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});
