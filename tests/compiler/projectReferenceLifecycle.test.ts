import { execFileSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { createProjectProgram } from "Project";
import { compileFiles } from "Project/functions/compileFiles";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import * as constants from "Shared/constants";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("releases replaced programs while retaining the current builder", () => {
	fixture.project("game");

	// a subprocess enables collection without changing the Jest process or its compiler instances
	const output = execFileSync(
		process.execPath,
		[
			"--expose-gc",
			"-e",
			`const assert = require("assert");
const fs = require("fs");
const { setImmediate } = require("timers/promises");
const { createProgramFactory } = require(process.argv[1]);
const { ProjectBuild } = require(process.argv[2]);
const build = new ProjectBuild(process.argv[3], JSON.parse(process.argv[4]));
const sourceFile = process.argv[5];
(async () => {
	try {
		const { data, config } = build.graph.root;
		const create = createProgramFactory(data, config.options);
		let builder = create(config.fileNames, config.options);
		assert.equal(builder.getSemanticDiagnostics().length, 0);
		const previous = new WeakRef(builder.getProgram());
		fs.writeFileSync(sourceFile, "export const value = 2;");
		builder = create(config.fileNames, config.options, undefined, builder);
		assert.equal(builder.getSemanticDiagnostics().length, 0);
		for (let attempt = 0; attempt < 3; attempt++) {
			await setImmediate();
			global.gc();
		}
		assert.equal(previous.deref() === undefined, true, "previous program remains reachable");
		assert.equal(builder.getProgram().getSourceFile(sourceFile).text, "export const value = 2;");
		console.log("previous program released");
	} finally {
		build.close();
	}
})();`,
			path.join(constants.PACKAGE_ROOT, "out/Project/functions/createProgramFactory.js"),
			path.join(constants.PACKAGE_ROOT, "out/Project/classes/ProjectBuild.js"),
			fixture.file("game/tsconfig.json"),
			JSON.stringify(fixture.options()),
			fixture.file("game/src/index.ts"),
		],
		{ encoding: "utf8" },
	);

	expect(output.trim()).toBe("previous program released");
});

it("preserves nested bundled runtime files while cleaning generated output", () => {
	fixture.project("game");
	fixture.write("game/src/orphan.ts", "export const orphan = 1;");
	fixture.rojo({ include: { $path: "out/game" } });
	const runtime = fixture.file("runtime");
	fs.copySync(constants.INCLUDE_PATH, runtime);
	fixture.write("runtime/helpers/nested.lua", "return 42");
	const installation = jest.replaceProperty(constants, "INCLUDE_PATH", runtime);

	try {
		const build = fixture.createBuild({ includePath: fixture.file("out/game") });
		expectSuccess(build.build());

		fs.removeSync(fixture.file("game/src/orphan.ts"));

		expectSuccess(build.build());
		expect(fixture.read("out/game/helpers/nested.lua")).toBe("return 42");
		expect(fs.existsSync(fixture.file("out/game/orphan.luau"))).toBe(false);
		expect(fs.existsSync(fixture.file("out/game/RuntimeLib.lua"))).toBe(true);
	} finally {
		installation.restore();
	}
});

it("reloads transformer options and removes and restores a transformed dependency", () => {
	fixture.project("shared", [], { plugins: [{ transform: "../plugin.cjs", value: 1 }] });
	fixture.project("game", ["shared"]);
	fixture.write("shared/src/index.ts", "export const value = PLACEHOLDER;");
	fixture.write(
		"plugin.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
	const visit = node => ts.isIdentifier(node) && node.text === "PLACEHOLDER"
		? ts.factory.createNumericLiteral(config.value) : ts.visitEachChild(node, visit, context);
	return ts.visitNode(source, visit);
};`,
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	expect(fixture.read("out/shared/init.luau")).toContain("value = 1");

	const sharedConfig = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	sharedConfig.compilerOptions.plugins[0].value = 2;
	fixture.json("shared/tsconfig.json", sharedConfig);

	expectSuccess(build.build());
	expect(fixture.read("out/shared/init.luau")).toContain("value = 2");
	expect(fixture.read("out/shared/index.d.ts")).toContain("value = 2");

	const gameConfig = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...gameConfig, references: [] });

	expectSuccess(build.build());

	sharedConfig.compilerOptions.plugins[0].value = 3;
	fixture.json("shared/tsconfig.json", sharedConfig);
	fixture.json("game/tsconfig.json", gameConfig);

	expectSuccess(build.build());
	expect(fixture.read("out/shared/init.luau")).toContain("value = 3");
	expect(fixture.read("out/shared/index.d.ts")).toContain("value = 3");
});

it("recovers a deleted external declaration in a transformed project", () => {
	fixture.project("game", [], { plugins: [{ transform: "../plugin.cjs" }] });
	fixture.write("plugin.cjs", "module.exports = () => () => source => source;");
	fixture.write("external/types.d.ts", "export interface Named { name: string; }");
	fixture.write(
		"game/src/index.ts",
		'import type { Named } from "../../external/types"; export const value: Named = { name: "before" };',
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const output = fixture.read("out/game/init.luau");

	fs.removeSync(fixture.file("external/types.d.ts"));
	fixture.write("game/src/index.ts", fixture.read("game/src/index.ts").replace("before", "after"));

	const result = build.build();

	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2307);
	expect(fixture.read("out/game/init.luau")).toBe(output);

	fixture.write("external/types.d.ts", "export interface Named { name: string; }");

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain('name = "after"');
});

it("preserves output when emitting one file discovers a declaration error in another file", () => {
	fixture.project("game", [], { declaration: true, noEmitOnError: true });
	fixture.write("game/src/other.ts", "export const Other = class { value = 1; };");
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const output = fixture.read("out/game/init.luau");
	const declaration = fixture.read("out/game/index.d.ts");

	fixture.write("game/src/index.ts", "export const value = 2;");
	fixture.write("game/src/other.ts", "export const Other = class { private value = 1; };");
	const data = build.graph.root.data;
	const program = createProjectProgram(data);
	const source = program.getSourceFile(fixture.file("game/src/index.ts"));
	if (!source) {
		throw new Error("Missing entrypoint");
	}

	const result = compileFiles(program.getProgram(), data, createPathTranslator(program, data), [source]);

	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(4094);
	expect(fixture.read("out/game/init.luau")).toBe(output);
	expect(fixture.read("out/game/index.d.ts")).toBe(declaration);
});
