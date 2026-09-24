import fs from "fs-extra";
import { ProjectType } from "Shared/constants";
import { errors, getDiagnosticId, warnings } from "Shared/diagnostics";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import ts from "typescript";

import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it.each(['export * from "./missing";', 'export * as missing from "./missing";'])(
	"reports an unresolved re-export with semantic checks disabled: %s",
	source => {
		const project = createTestProject({ allowCommentDirectives: true });

		try {
			project.compileSource(`// @ts-nocheck\n${source}`);
			throw new Error("Expected a module resolution diagnostic");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagnosticError);
			if (!(error instanceof DiagnosticError)) {
				throw error;
			}
			expect(error.diagnostics.map(getDiagnosticId)).toEqual([errors.noModuleSpecifierFile.id]);
		}
	},
);

it.each([
	["unmapped dependency", {}, errors.noRojoData],
	[
		"scope outside node_modules",
		{ packages: { "@rbxts": { $path: "node_modules/@rbxts" } } },
		errors.noPackageImportWithoutScope,
	],
	[
		"node_modules without scope",
		{ node_modules: { $path: "node_modules/@rbxts" } },
		errors.noPackageImportWithoutScope,
	],
])("rejects a %s in the Rojo tree", (name, mappings, diagnostic) => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.json("node_modules/@rbxts/example/package.json", {
			name: "@rbxts/example",
			types: "index.d.ts",
			main: "init.luau",
		});
		fixture.write("node_modules/@rbxts/example/index.d.ts", "export declare const value: number;");
		fixture.write("node_modules/@rbxts/example/init.luau", "return { value = 1 }");
		fixture.rojo(mappings);
		fixture.write("game/src/index.ts", 'import "@rbxts/example";');

		const result = fixture.createBuild().build();

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(getDiagnosticId)).toEqual([diagnostic.id]);
	} finally {
		fixture.close();
	}
});

it.each([false, true])("explains external package entry points (symlink: %s)", linked => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		for (const name of ["first", "second"]) {
			const directory = linked ? `packages/${name}` : `node_modules/@rbxts/${name}`;
			fixture.json(`${directory}/package.json`, {
				name: `@rbxts/${name}`,
				types: "index.d.ts",
				main: fixture.file(`elsewhere/node_modules/@rbxts/${name}/init.luau`),
			});
			fixture.write(`${directory}/index.d.ts`, "export declare const value: number;");
			if (linked) {
				fs.ensureSymlinkSync(fixture.file(directory), fixture.file(`node_modules/@rbxts/${name}`), "junction");
			}
		}
		fixture.write(
			"game/src/index.ts",
			[
				'import { value as first } from "@rbxts/first";',
				'import { value as second } from "@rbxts/second";',
				"print(first, second);",
			].join("\n"),
		);

		const result = fixture.createBuild().build();

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(getDiagnosticId)).toEqual([
			errors.failedSymlinkResolve.id,
			errors.failedSymlinkResolve.id,
		]);
		const messages = result.diagnostics.map(diagnostic =>
			ts
				.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
				.replace(/\\/g, "/")
				.split(fixture.directory.replace(/\\/g, "/"))
				.join("<project>"),
		);
		expect(messages[0]).not.toContain("second");
		expect(messages[1]).not.toContain("first");
		expect(messages).toMatchSnapshot();
	} finally {
		fixture.close();
	}
});

it.each([
	["@other/example", errors.noInvalidScope],
	["unscoped", errors.noUnscopedModule],
])("explains why %s cannot be imported", (name, diagnostic) => {
	const project = createTestProject();
	project.vfs.writeFile(`/node_modules/${name}/index.d.ts`, "export declare const value: number;");

	try {
		project.compileSource(`import { value } from "${name}"; print(value);`);
		throw new Error("Expected an import diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}
		expect(error.diagnostics.map(getDiagnosticId)).toEqual([diagnostic.id]);
		expect(ts.flattenDiagnosticMessageText(error.diagnostics[0].messageText, "\n")).toMatchSnapshot();
	}
});

it("imports a correctly resolved linked package", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.json("packages/example/package.json", {
			name: "@rbxts/example",
			types: "index.d.ts",
			main: "init.luau",
		});
		fixture.write("packages/example/index.d.ts", "export declare const value: number;");
		fixture.write("packages/example/init.luau", "return { value = 1 }");
		fs.ensureSymlinkSync(fixture.file("packages/example"), fixture.file("node_modules/@rbxts/example"), "junction");
		fixture.rojo({ node_modules: { "@rbxts": { $path: "node_modules/@rbxts" } } });
		fixture.write("game/src/local.ts", "export const localValue = 2;");
		fixture.write(
			"game/src/index.ts",
			'import { value } from "@rbxts/example"; import { localValue } from "./local"; print(value, localValue);',
		);

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau");
		expect(output).toContain('"node_modules", "@rbxts", "example"');
		expect(output).toContain('"game", "local"');
	} finally {
		fixture.close();
	}
});

it("warns when ReplicatedFirst code uses the runtime library", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.json("default.project.json", {
			name: "early",
			tree: {
				$className: "DataModel",
				ReplicatedStorage: { $className: "ReplicatedStorage", include: { $path: "include" } },
				ReplicatedFirst: { $className: "ReplicatedFirst", game: { $path: "out/game" } },
			},
		});
		fixture.write("game/src/index.ts", "export async function load() { return 1; }");

		const result = fixture.createBuild().build();

		expect(result.emitSkipped).toBe(false);
		expect(result.diagnostics.map(getDiagnosticId)).toEqual([warnings.runtimeLibUsedInReplicatedFirst.id]);
		expect(result.diagnostics[0].category).toBe(ts.DiagnosticCategory.Warning);
		expect(fixture.read("out/game/init.luau")).toContain("TS.async");
	} finally {
		fixture.close();
	}
});

it.each([ProjectType.Game, ProjectType.Model])(
	"rejects unmapped source files needing runtime imports in a %s",
	type => {
		const fixture = new ReferenceFixture();
		try {
			fixture.project("game");
			fixture.rojo({ game: { $path: "out/game/value.luau" } });
			fixture.write("game/src/value.ts", "export const value = 7;");
			fixture.write("game/src/index.ts", 'import { value } from "./value"; print(value);');

			const result = fixture.createBuild({ type }).build();

			expect(result.emitSkipped).toBe(true);
			expect(result.diagnostics.length).toBeGreaterThan(0);
			expect(result.diagnostics.every(diagnostic => getDiagnosticId(diagnostic) === errors.noRojoData.id)).toBe(
				true,
			);
		} finally {
			fixture.close();
		}
	},
);

it("rejects an ambient module declaration without a backing module file", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/ambient.d.ts", 'declare module "@rbxts/example" { export const value: number; }');

	try {
		project.compileSource('import { value } from "@rbxts/example"; print(value);');
		throw new Error("Expected an import diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}
		expect(error.diagnostics.map(getDiagnosticId)).toEqual([errors.noModuleSpecifierFile.id]);
	}
});

it("rejects a package omitted from the scope's Rojo project", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.json("node_modules/@rbxts/example/package.json", {
			name: "@rbxts/example",
			types: "index.d.ts",
			main: "init.luau",
		});
		fixture.write("node_modules/@rbxts/example/index.d.ts", "export declare const value: number;");
		fixture.write("node_modules/@rbxts/example/init.luau", "return { value = 1 }");
		fixture.json("node_modules/@rbxts/default.project.json", { name: "scope", tree: {} });
		fixture.write("game/src/index.ts", 'import { value } from "@rbxts/example"; print(value);');

		const result = fixture.createBuild({ type: ProjectType.Package }).build();

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(getDiagnosticId)).toEqual([errors.noRojoData.id]);
	} finally {
		fixture.close();
	}
});
