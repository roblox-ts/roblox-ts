import { ProjectType } from "Shared/constants";

import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it.each([false, true])("elides type-only CommonJS imports (verbatimModuleSyntax: %s)", verbatimModuleSyntax => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { verbatimModuleSyntax });
		fixture.write("game/src/value.ts", "class Value { value = 0; } export = Value;");
		fixture.write(
			"game/src/index.ts",
			'import type Value = require("./value"); const value: Value = { value: 42 }; print(value.value);',
		);

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau");
		expect(output).not.toContain("RuntimeLib");
		expect(output).not.toContain("TS.import");
		expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
	} finally {
		fixture.close();
	}
});

it.each(["export { Value };", "export default Value;", "export = Value;"])(
	"elides type-only CommonJS imports re-exported with %s",
	exportStatement => {
		const project = createTestProject();
		project.vfs.writeFile("/src/value.ts", "class Value { value = 0; } export = Value;");

		const output = project.compileSource(`import type Value = require("./value"); ${exportStatement}`);

		expect(output.replace(/^-- Compiled with.*\n/, "")).toBe("return nil\n");
	},
);

it("elides type-only mutable exports without redirecting local reads or writes", () => {
	const output = createTestProject().compileSource("let value = 1; export type { value }; value = 2; print(value);");

	expect(output).not.toContain("exports");
	expect(output).toContain("local value = 1");
	expect(output).toContain("value = 2");
});

it("elides unused default bindings alongside used named imports", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/value.ts", "export default 1; export const named = 2;");
	const output = project.compileSource('import unused, { named } from "./value"; print(named);');
	expect(output).not.toContain("unused");
	expect(output).toContain(".named");
});

it("imports a local module in VirtualProject without project references", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/value.ts", "export const value = 7;");

	const output = project.compileSource('import { value } from "./value"; export const result = value;');

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("imports a package described by an ambient module declaration", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/ambient.d.ts", 'declare module "@rbxts/example" { export const value: number; }');
	project.vfs.writeFile("/node_modules/@rbxts/example/index.d.ts", "export declare const value: number;");
	project.setMapping("/node_modules/@rbxts/example/index.d.ts", "/node_modules/@rbxts/example/init.luau");

	const output = project.compileSource('import { value } from "@rbxts/example"; export { value };');

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it("imports a scoped dependency from a package", () => {
	const project = createTestProject({ type: ProjectType.Package });
	project.vfs.writeFile("/node_modules/@rbxts/example/index.d.ts", "export declare const value: number;");
	project.setMapping("/node_modules/@rbxts/example/index.d.ts", "/node_modules/@rbxts/example/init.luau");

	const output = project.compileSource('import { value } from "@rbxts/example"; export const result = value;');

	expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
});

it.each([false, true])(
	"keeps explicit type-only export aliases erased (verbatimModuleSyntax: %s)",
	verbatimModuleSyntax => {
		const fixture = new ReferenceFixture();
		try {
			fixture.project("game", [], { verbatimModuleSyntax, noCheck: true });
			fixture.write("game/src/value.ts", "class Value {} export = Value;");
			fixture.write(
				"game/src/index.ts",
				'import type Value = require("./value"); export { Value }; let value = 1; export { value as live }; export type { value as hidden }; value = 2;',
			);

			expectSuccess(fixture.createBuild().build());
			const output = fixture.read("out/game/init.luau");
			expect(output).toContain("exports.live = 2");
			expect(output).not.toContain("hidden");
			expect(output.includes("exports.Value = Value")).toBe(verbatimModuleSyntax);
		} finally {
			fixture.close();
		}
	},
);

it.each([false, true])(
	"preserves unmarked import-equals side effects with noCheck (verbatimModuleSyntax: %s)",
	verbatimModuleSyntax => {
		const fixture = new ReferenceFixture();
		try {
			fixture.project("game", [], { verbatimModuleSyntax, noCheck: true });
			fixture.write(
				"game/src/shape.ts",
				'print("module side effect"); interface Shape { value: number; } export = Shape;',
			);
			fixture.write(
				"game/src/index.ts",
				'import Shape = require("./shape"); const value: Shape = { value: 42 }; print(value.value);',
			);

			expectSuccess(fixture.createBuild().build());

			const output = fixture.read("out/game/init.luau");
			expect(output.includes("TS.import")).toBe(verbatimModuleSyntax);
			expect(output.replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
		} finally {
			fixture.close();
		}
	},
);

it("preserves verbatim import side effects and value re-exports with noCheck", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { verbatimModuleSyntax: true, noCheck: true });
		fixture.write("game/src/value.ts", "export const value = 42; export type Shape = number;");
		fixture.write("game/src/index.ts", 'import { type Shape } from "./value"; export { value } from "./value";');

		expectSuccess(fixture.createBuild().build());
		const output = fixture.read("out/game/init.luau");
		expect(output.match(/TS\.import\(/g)).toHaveLength(2);
		expect(output).toContain("exports.value = TS.import");
		expect(output).not.toContain("Shape");
	} finally {
		fixture.close();
	}
});

it("uses relative imports within an isolated game container", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.json("default.project.json", {
			name: "isolated",
			tree: {
				$className: "DataModel",
				ReplicatedStorage: { $className: "ReplicatedStorage", include: { $path: "include" } },
				StarterGui: { $className: "StarterGui", game: { $path: "out/game" } },
			},
		});
		fixture.write("game/src/value.ts", "export const value = 7;");
		fixture.write("game/src/index.ts", 'import { value } from "./value"; print(value);');

		expectSuccess(fixture.createBuild().build());

		expect(fixture.read("out/game/init.luau").replace(/^-- Compiled with.*\n/, "")).toMatchSnapshot();
	} finally {
		fixture.close();
	}
});
