import fs from "fs-extra";
import { createProjectProgram } from "Project";
import { compileFiles } from "Project/functions/compileFiles";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

jest.setTimeout(30000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("preserves filename casing when rebinding plugin output", () => {
	fixture.project("game", [], { plugins: [{ transform: "../identity.cjs" }] });
	fixture.write("identity.cjs", "module.exports = () => () => source => source;");
	fixture.write("game/src/MixedCase.ts", "export const value = 1;");
	fixture.write("game/src/index.ts", 'export { value } from "./MixedCase";');

	expectSuccess(fixture.createBuild().build());

	expect(fs.readdirSync(fixture.file("out/game"))).toContain("MixedCase.luau");
	expect(fixture.read("out/game/init.luau")).toContain('"MixedCase"');
});

it("refreshes declarations imported only by transformed source", () => {
	fixture.project("game", [], { plugins: [{ transform: "../replace.cjs" }] });
	fixture.write(
		"replace.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isStringLiteral(node) && node.text === "../../original/options"
			? ts.factory.createStringLiteral("../../external/options") : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
	);
	fixture.write("original/options.d.ts", "export interface Options { value: number; }");
	fixture.write("external/options.d.ts", "export interface Options { value: number; }");
	const source = 'import { Options } from "../../original/options"; export const options: Options = { value: 1 };';
	fixture.write("game/src/index.ts", source);
	const build = fixture.createBuild();
	expectSuccess(build.build());

	fixture.write("external/options.d.ts", "export interface Options { value: string; }");
	fixture.write("game/src/index.ts", `${source}\nexport const changed = true;`);
	const result = build.build([fixture.file("game/src/index.ts")]);

	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);
});

it.each([{ target: "./other" }, { target: "@local/other", baseUrl: "./src", paths: { "@local/*": ["./*"] } }])(
	"applies declaration plugins to $target without changing Luau",
	({ target, ...options }) => {
		fixture.project("game", [], {
			declaration: true,
			...options,
			plugins: [{ transform: "../declarations.cjs", afterDeclarations: true }],
		});
		fixture.write("game/src/index.ts", 'export { value } from "./target";');
		fixture.write("game/src/target.ts", "export const value = 1;");
		fixture.write("game/src/other.ts", "export const value = 2;");
		fixture.write(
			"declarations.cjs",
			`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isStringLiteral(node) && node.text === "./target"
			? ts.factory.createStringLiteral(${JSON.stringify(target)}) : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
		);

		expectSuccess(fixture.createBuild().build());
		expect(fixture.read("out/game/index.d.ts")).toContain('"./other"');
		expect(fixture.read("out/game/init.luau")).toContain('"target"');
	},
);

it("resolves transitive types through a pnpm-style symlink with a plugin", () => {
	fixture.project("game");
	const packages = "node_modules/.pnpm/@rbxts+host@1.0.0/node_modules/@rbxts";
	fixture.json(`${packages}/host/package.json`, { name: "@rbxts/host", types: "index.d.ts" });
	fixture.write(
		`${packages}/host/index.d.ts`,
		'import { LeafOptions } from "@rbxts/leaf"; export interface HostOptions extends LeafOptions { extra?: number; }',
	);
	fixture.json(`${packages}/leaf/package.json`, { name: "@rbxts/leaf", types: "index.d.ts" });
	fixture.write(`${packages}/leaf/index.d.ts`, "export interface LeafOptions { phantom?: boolean; }");
	fs.ensureSymlinkSync(fixture.file(`${packages}/host`), fixture.file("node_modules/@rbxts/host"), "junction");
	fixture.write(
		"game/src/index.ts",
		'import { HostOptions } from "@rbxts/host"; export const options: HostOptions = { phantom: true };',
	);

	expectSuccess(fixture.createBuild().build());
	const expected = fixture.read("out/game/init.luau");

	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.compilerOptions.plugins = [{ transform: "../identity.cjs" }];
	fixture.json("game/tsconfig.json", config);
	fixture.write("identity.cjs", "module.exports = () => () => source => source;");

	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toBe(expected);
});

it("runs before plugins before after plugins", () => {
	fixture.project("game", [], {
		plugins: [
			{ transform: "../replace.cjs", from: "initial", to: "before" },
			{ transform: "../replace.cjs", from: "before", to: "after", after: true },
		],
	});
	fixture.write("game/src/index.ts", 'export const value = "initial";');
	fixture.write(
		"replace.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isStringLiteral(node) && node.text === config.from
			? ts.factory.createStringLiteral(config.to) : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
	);

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/init.luau")).toContain('"after"');
});

it("updates external declaration types when their modification time is unchanged", () => {
	fixture.project("game", [], { plugins: [{ transform: "../identity.cjs" }] });
	fixture.write("identity.cjs", "module.exports = () => () => source => source;");
	fixture.write("external/options.d.ts", "export interface Options { value: number; }");
	fixture.write(
		"game/src/index.ts",
		'import { Options } from "../../external/options"; export const options: Options = { value: 1 };',
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const output = fixture.read("out/game/init.luau");

	const file = fixture.file("external/options.d.ts");
	const times = fs.statSync(file);
	fixture.write("external/options.d.ts", "export interface Options { value: string; }");
	fs.utimesSync(file, times.atime, times.mtime);

	const result = build.build([file]);
	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);
	expect(fixture.read("out/game/init.luau")).toBe(output);

	fixture.write("external/options.d.ts", "export interface Options { value: number; }");
	fs.utimesSync(file, times.atime, times.mtime);

	expectSuccess(build.build([file]));
});

it("transforms imported source files outside the root file list", () => {
	fixture.project("game", [], { plugins: [{ transform: "../identity.cjs" }] });
	fixture.write("identity.cjs", "module.exports = () => () => source => source;");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	delete config.include;
	fixture.json("game/tsconfig.json", { ...config, files: ["src/index.ts"] });
	fixture.write("game/src/helper.ts", "export const value = 42;");
	fixture.write("game/src/index.ts", 'export { value } from "./helper";');

	const data = fixture.createBuild().graph.root.data;
	const builder = createProjectProgram(data);
	expectSuccess(
		compileFiles(builder.getProgram(), data, createPathTranslator(builder, data), getChangedSourceFiles(builder)),
	);
	expect(fixture.read("out/game/helper.luau")).toContain("value = 42");
	expect(fixture.read("out/game/init.luau")).toContain('"helper"');
});
