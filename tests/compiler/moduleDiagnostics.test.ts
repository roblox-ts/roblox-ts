import fs from "fs-extra";
import { errors, getDiagnosticId } from "Shared/diagnostics";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import ts from "typescript";

import { createTestProject } from "./createTestProject";
import { expectSuccess, ReferenceFixture } from "./referenceFixture";

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
		fixture.write("game/src/index.ts", 'import { value } from "@rbxts/example"; print(value);');

		expectSuccess(fixture.createBuild().build());

		expect(fixture.read("out/game/init.luau")).toContain('"node_modules", "@rbxts", "example"');
	} finally {
		fixture.close();
	}
});
