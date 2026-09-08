import fs from "fs-extra";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

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

it("normalizes aliases introduced by declaration plugins", () => {
	fixture.project("game", [], {
		declaration: true,
		baseUrl: "./src",
		paths: { "@local/*": ["./*"] },
		plugins: [{ transform: "../declarations.cjs", afterDeclarations: true }],
	});
	fixture.write("game/src/index.ts", 'export { value } from "./target";');
	fixture.write("game/src/target.ts", "export const value = 1;");
	fixture.write("game/src/other.ts", "export const value = 2;");
	fixture.write(
		"declarations.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isStringLiteral(node) && node.text === "./target"
			? ts.factory.createStringLiteral("@local/other") : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
	);

	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/index.d.ts")).toContain('"./other"');
	expect(fixture.read("out/game/init.luau")).toContain('"target"');
});

it("keeps declaration plugins out of Luau and applies them to declarations", () => {
	fixture.project("game", [], {
		declaration: true,
		plugins: [{ transform: "../declarations.cjs", afterDeclarations: true }],
	});
	fixture.write("game/src/index.ts", 'export { value } from "./target";');
	fixture.write("game/src/target.ts", "export const value = 1;");
	fixture.write("game/src/other.ts", "export const value = 2;");
	fixture.write(
		"declarations.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isStringLiteral(node) && node.text === "./target"
			? ts.factory.createStringLiteral("./other") : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
	);

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/init.luau")).toContain('"target"');
	expect(fixture.read("out/game/index.d.ts")).toContain('"./other"');
});

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
