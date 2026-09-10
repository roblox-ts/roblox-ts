import * as browser from "CLI/browser";
import * as node from "CLI/index";
import * as project from "Project";
import { COMPILER_VERSION } from "Shared/constants";

it("exposes the project API and compiler version from the Node entry point", () => {
	for (const [name, value] of Object.entries(project)) {
		expect(node).toHaveProperty(name, value);
	}
	expect(node.COMPILER_VERSION).toBe(COMPILER_VERSION);
});

it("exposes the virtual compiler and version from the browser entry point", () => {
	expect(browser.VirtualProject).toBe(project.VirtualProject);
	expect(browser.COMPILER_VERSION).toBe(COMPILER_VERSION);
	expect(Object.keys(browser).sort()).toEqual(["COMPILER_VERSION", "VirtualProject"]);
});
