import { assert } from "Shared/util/assert";

import { createTestProject } from "../createTestProject";

function changeCompilerTypes(file: string, rewrite: (source: string) => string) {
	const project = createTestProject();
	const path = `/node_modules/@rbxts/compiler-types/types/${file}.d.ts`;
	const source = project.vfs.readFile(path);
	assert(source !== undefined);
	const changed = rewrite(source);
	expect(changed).not.toBe(source);
	project.vfs.writeFile(path, changed);
	return project;
}

it.each([
	["Promise", "Promise", "declare const Promise: PromiseConstructor;", ""],
	["ArrayConstructor", "Array", "interface ArrayConstructor", "interface MissingConstructor"],
	["TemplateStringsArray", "Array", "interface TemplateStringsArray", "interface MissingTemplateStringsArray"],
])("explains a missing %s compiler type", (symbol, file, before, after) => {
	const project = changeCompilerTypes(file, source => source.replace(before, after));

	expect(() => project.compileSource("export const value = 1;")).toThrow(
		`MacroManager could not find symbol for ${symbol}`,
	);
});

it("explains a missing constructor signature", () => {
	const project = changeCompilerTypes("Array", source => source.replace(/new <T>\([^;]*;/g, ""));

	expect(() => project.compileSource("export const value = 1;")).toThrow(
		"MacroManager could not find constructor for ArrayConstructor",
	);
});

it("explains a missing macro method", () => {
	const project = changeCompilerTypes("Array", source => source.replace("push(", "missingPush("));

	expect(() => project.compileSource("export const value = 1;")).toThrow(
		"MacroManager could not find method for Array.push",
	);
});

it("accepts constructor metadata and merged namespace declarations", () => {
	const project = changeCompilerTypes("Array", source =>
		source.replace(
			"interface ArrayConstructor {",
			"interface ArrayConstructor { readonly metadata: unique symbol;",
		),
	);
	project.vfs.writeFile(
		"/src/augmentation.d.ts",
		"declare namespace ReadonlyArray { const metadata: unique symbol; }",
	);

	expect(project.compileSource("export const values = new Array<number>();")).toContain("local values = {}");
});

it("rejects added array methods that have no runtime implementation", () => {
	const project = createTestProject();
	project.vfs.writeFile("/src/augmentation.d.ts", "interface ReadonlyArray<T> { custom(): void; }");

	expect(() => project.compileSource("[1].custom();")).toThrow("Macro ReadonlyArray.custom() is not implemented!");
});

it("finds a constructor interface after its merged namespace", () => {
	const project = changeCompilerTypes(
		"Array",
		source => `declare namespace ArrayConstructor { const metadata: unique symbol; }\n${source}`,
	);
	expect(project.compileSource("export const values = new Array<number>();")).toContain("local values = {}");
});

it.each([
	["an interface", "interface LuaTuple<T extends Array<any>> {}"],
	["an unbranded alias", "type LuaTuple<T extends Array<any>> = T;"],
])("allows unrelated compilation when LuaTuple is %s", (description, declaration) => {
	const project = changeCompilerTypes("core", source =>
		source.replace(/type LuaTuple<T extends Array<any>> = T & \{[^}]*\};/, declaration),
	);
	expect(project.compileSource("export const value = 1;")).toContain("local value = 1");
});
