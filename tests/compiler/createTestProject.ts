import fs from "fs-extra";
import path from "path";
import { VirtualProject } from "Project/classes/VirtualProject";
import { PACKAGE_ROOT } from "Shared/constants";

/** Creates an isolated compiler project with the test suite's Roblox type declarations. */
export function createTestProject() {
	const project = new VirtualProject();
	const root = path.join(PACKAGE_ROOT, "tests/node_modules/@rbxts");
	function load(directory: string) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				load(file);
			} else if (entry.name.endsWith(".d.ts") || entry.name === "package.json") {
				project.vfs.writeFile(
					`/node_modules/@rbxts/${path.relative(root, file).split(path.sep).join("/")}`,
					fs.readFileSync(file, "utf8"),
				);
			}
		}
	}
	load(path.join(root, "compiler-types"));
	load(path.join(root, "types"));
	return project;
}
