import fs from "fs-extra";
import { createProjectData, createProjectProgram } from "Project";
import { compileFiles } from "Project/functions/compileFiles";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { LogService } from "Shared/classes/LogService";
import { DEFAULT_PROJECT_OPTIONS, ProjectType } from "Shared/constants";
import { errors, getDiagnosticId } from "Shared/diagnostics";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => {
	jest.restoreAllMocks();
	fixture.close();
});

it.each([
	[{ noLib: false }, '"noLib" must be true'],
	[{ strict: false }, '"strict" must be true'],
	[{ module: "esnext" }, '"module" must be commonjs'],
	[{ moduleDetection: "auto" }, '"moduleDetection" must be "force"'],
	[{ moduleResolution: "classic" }, '"moduleResolution" must be "Node"'],
	[{ allowSyntheticDefaultImports: false }, '"allowSyntheticDefaultImports" must be true'],
	[{ rootDir: undefined }, '"rootDir" or "rootDirs" must be defined'],
	[{ outDir: undefined }, '"outDir" must be defined'],
	[{ importsNotUsedAsValues: "remove" }, '"verbatimModuleSyntax": false'],
	[{ importsNotUsedAsValues: "preserve" }, '"verbatimModuleSyntax": true'],
])("explains invalid compiler options %j", (options, message) => {
	fixture.project("game", [], options);

	expect(() => fixture.createBuild()).toThrow(message);
});

it("accepts rootDirs without rootDir", () => {
	fixture.project("game", [], { rootDir: undefined, rootDirs: ["src"] });

	expectSuccess(fixture.createBuild().build());
});

it("keeps sibling rootDirs with a shared name prefix under their common output directory", () => {
	fixture.project("game", [], { rootDir: undefined, rootDirs: ["src", "src-extra"] });
	fs.removeSync(fixture.file("game/src/index.ts"));
	fixture.write("game/src/nested/value.ts", "export const value = 42;");

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/src/nested/value.luau")).toContain("local value = 42");
	expect(fs.existsSync(fixture.file("out/game/nested/value.luau"))).toBe(false);
});

it("ignores additional missing type roots", () => {
	fixture.project("game", [], { typeRoots: ["../node_modules/@rbxts", "../missing"] });

	expectSuccess(fixture.createBuild().build());
});

it("explains a missing package.json", () => {
	fs.removeSync(fixture.file("package.json"));

	expect(() => createProjectData(fixture.file("tsconfig.json"), { ...DEFAULT_PROJECT_OPTIONS })).toThrow(
		"Unable to find package.json",
	);
});

it("treats unnamed package metadata as a non-package project", () => {
	fixture.json("package.json", {});

	const data = createProjectData(fixture.file("tsconfig.json"), { ...DEFAULT_PROJECT_OPTIONS });

	expect(data.isPackage).toBe(false);
});

it("warns when more than one Rojo project is available", () => {
	fixture.project("game");
	fixture.json("game/first.project.json", { name: "first", tree: {} });
	fixture.json("game/second.project.json", { name: "second", tree: {} });
	const warn = jest.spyOn(LogService, "warn").mockImplementation(() => {});

	createProjectData(fixture.file("game/tsconfig.json"), { ...DEFAULT_PROJECT_OPTIONS });

	expect(warn).toHaveBeenCalled();
});

it.each(["init.ts", "init.server.ts", "init.client.tsx"])("explains the reserved filename %s", name => {
	fixture.project("game");
	fs.removeSync(fixture.file("game/src/index.ts"));
	fixture.write(`game/src/${name}`, "export const value = 1;");

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain(`Incorrect file name: \`${name}\``);
});

it("explains Rojo mappings that point into the source directory", () => {
	fixture.project("game");
	fixture.rojo({ misplaced: { $path: "game/src" } });

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain("Rojo");
	expect(formatDiagnostics(result.diagnostics)).toContain("out");
});

it.each([
	["ServerStorage", "server-only or client-only"],
	["StarterGui", "server-only or client-only"],
	["PluginDebugService", "isolated"],
])("rejects runtime libraries under %s", (container, message) => {
	fixture.project("game");
	fixture.json("default.project.json", {
		name: "restricted",
		tree: {
			$className: "DataModel",
			ReplicatedStorage: { $className: "ReplicatedStorage", game: { $path: "out/game" } },
			[container]: { $className: container, include: { $path: "include" } },
		},
	});

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain(message);
});

it("requires a Rojo file for explicitly selected game builds", () => {
	fixture.project("game");
	fs.removeSync(fixture.file("default.project.json"));
	const data = createProjectData(fixture.file("game/tsconfig.json"), {
		...DEFAULT_PROJECT_OPTIONS,
		type: ProjectType.Game,
	});
	const builder = createProjectProgram(data);

	const result = compileFiles(
		builder.getProgram(),
		data,
		createPathTranslator(builder, data),
		getChangedSourceFiles(builder),
	);

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain("Non-package projects must have a Rojo project file");
});

it("stops emission when a transformer reports an error", () => {
	fixture.project("game", [], { plugins: [{ transform: "./plugin.js" }] });
	fixture.write(
		"game/plugin.js",
		`
		module.exports = () => context => source => {
			context.addDiagnostic({ category: 1, code: 12345, file: source, start: 0, length: 1, messageText: "plugin failure" });
			return source;
		};
	`,
	);

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain("plugin failure");
	expect(fs.existsSync(fixture.file("out/game/index.luau"))).toBe(false);
});

it.each([false, true])("keeps original source when a plugin returns a bundle (after=%s)", after => {
	fixture.project("game");
	expectSuccess(fixture.createBuild().build());
	const expected = fixture.read("out/game/init.luau");

	fixture.project("game", [], { plugins: [{ transform: "./plugin.js", after }] });
	fixture.write(
		"game/plugin.js",
		"module.exports = (program, config, { ts }) => () => source => ts.factory.createBundle([source]);",
	);

	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toBe(expected);
});

it.each(["// @ts-ignore\n", "// @ts-expect-error\n", "// @ts-nocheck\n", "// @ts-nocheck\n// @ts-nocheck\n"])(
	"rejects forbidden comment directives %j",
	directive => {
		fixture.project("game");
		const source = directive.includes("expect-error")
			? 'export const value: number = "bad";'
			: "export const value = 1;";
		fixture.write("game/src/index.ts", directive + source);

		const result = fixture.createBuild().build();

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(getDiagnosticId)).toContain(errors.noCommentDirectives.id);
	},
);
