import fs from "fs-extra";
import os from "os";
import path from "path";
import transformPaths from "Project/transformers/builtin/transformPaths";
import { transformTypeReferenceDirectives } from "Project/transformers/builtin/transformTypeReferenceDirectives";
import ts from "typescript";

let directory: string;
beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "rbxts-declarations-"));
	fs.outputFileSync(path.join(directory, "src/shape.ts"), "export interface Shape {}");
});
afterEach(() => fs.removeSync(directory));

function rewrite(source: string, options: ts.CompilerOptions = { baseUrl: directory }) {
	const file = ts.createSourceFile(path.join(directory, "index.d.ts"), source, ts.ScriptTarget.Latest, true);
	const program = ts.createProgram([], options);
	const result = ts.transform(file, [transformPaths(program)]);
	const output = ts.createPrinter().printFile(result.transformed[0] as ts.SourceFile);
	result.dispose();
	return output;
}

it.each([
	['import { Shape } from "src/shape"; export { Shape };', 'from "./src/shape"'],
	['export { Shape } from "src/shape";', 'from "./src/shape"'],
	['import shape = require("src/shape"); export = shape;', 'require("./src/shape")'],
	['export type Shape = import("src/shape").Shape;', 'import("./src/shape").Shape'],
	['export type Shape = typeof import("src/shape");', 'typeof import("./src/shape")'],
	['export type Shape = import("");', 'import("")'],
	["export type Shape = import(123);", "import(123)"],
	['export { Shape } from "missing";', 'from "missing"'],
])("rewrites declaration module specifiers in %s", (source, expected) => {
	expect(rewrite(source)).toContain(expected);
});

it("resolves paths without a baseUrl and preserves parent-relative imports", () => {
	const options = { paths: { shape: [path.join(directory, "src/shape")] } };

	expect(rewrite('export { Shape } from "shape";', options)).toContain('from "./src/shape"');
	fs.outputFileSync(path.join(directory, "parent.ts"), "export interface Shape {}");
	const file = ts.createSourceFile(
		path.join(directory, "src/index.d.ts"),
		'export { Shape } from "../parent";',
		ts.ScriptTarget.Latest,
	);
	const result = ts.transform(file, [transformPaths(ts.createProgram([], { baseUrl: directory }))]);

	expect(ts.createPrinter().printFile(result.transformed[0] as ts.SourceFile)).toContain('from "../parent"');
	result.dispose();
});

it("preserves external package names", () => {
	fs.outputFileSync(path.join(directory, "node_modules/external/index.d.ts"), "export interface Shape {}");

	expect(rewrite('export { Shape } from "external";')).toContain('from "external"');
});

it("keeps URL mappings in declarations", () => {
	expect(rewrite('export { Shape } from "remote";', { paths: { remote: ["https://example.com/shape"] } })).toContain(
		'from "https://example.com/shape.ts"',
	);
});

it("preserves a module name when its resolved file is literally named .ts", () => {
	fs.outputFileSync(path.join(directory, ".ts"), "export interface Shape {}");

	expect(rewrite('export { Shape } from "hidden";', { paths: { hidden: [path.join(directory, ".ts")] } })).toContain(
		'from "hidden"',
	);
});

it("retains JSX extensions when JSX emission is disabled", () => {
	fs.outputFileSync(path.join(directory, "src/module.tsx"), "export {};");

	expect(rewrite('export * from "src/module";', { baseUrl: directory, jsx: ts.JsxEmit.None })).toContain(
		'from "./src/module.tsx"',
	);
});

it.each([
	["ts", {}],
	["tsx", { jsx: ts.JsxEmit.React }],
	["js", { allowJs: true }],
	["jsx", { allowJs: true, jsx: ts.JsxEmit.React }],
	["json", { resolveJsonModule: true }],
	["mts", {}],
] as const)("handles the resolved .%s extension", (extension, options) => {
	fs.outputFileSync(path.join(directory, `src/module.${extension}`), extension === "json" ? "{}" : "export {};");
	const suffix = extension === "mts" ? ".mts" : "";

	expect(rewrite(`export * from "src/module.${extension}";`, { baseUrl: directory, ...options })).toContain(
		`from "./src/module${suffix}"`,
	);
});

it("passes through declaration bundles", () => {
	const source = ts.createSourceFile("index.d.ts", "export {};", ts.ScriptTarget.Latest);
	const bundle = ts.factory.createBundle([source]);
	const result = ts.transform(bundle, [transformPaths(ts.createProgram([], {}))]);

	expect(result.transformed[0]).toBe(bundle);
	expect(transformTypeReferenceDirectives()(bundle)).toBe(bundle);
	result.dispose();
});

it("scopes Roblox type references while preserving other references", () => {
	const source = ts.createSourceFile(
		"index.d.ts",
		'/// <reference types="types" />\n/// <reference types="other" />\nexport {};',
		ts.ScriptTarget.Latest,
	);
	const original = source.typeReferenceDirectives.map(reference => ({ ...reference }));

	const result = transformTypeReferenceDirectives()(source);

	expect(result).toBe(source);
	expect(source.typeReferenceDirectives).toEqual([
		{ ...original[0], fileName: "@rbxts/types", end: original[0].end + "@rbxts/".length },
		original[1],
	]);
});
