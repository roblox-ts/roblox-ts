import { assert } from "Shared/util/assert";
import ts from "typescript";

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

function aliasCompilerType(file: string, name: string, targetName = name) {
	return changeCompilerTypes(file, source => {
		const sourceFile = ts.createSourceFile(`${file}.d.ts`, source, ts.ScriptTarget.Latest, true);
		const declarations = sourceFile.statements.filter(statement => {
			if (ts.isVariableStatement(statement)) {
				return statement.declarationList.declarations.some(
					declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name,
				);
			}
			return (
				(ts.isInterfaceDeclaration(statement) ||
					ts.isFunctionDeclaration(statement) ||
					ts.isModuleDeclaration(statement) ||
					ts.isTypeAliasDeclaration(statement)) &&
				statement.name?.text === name
			);
		});

		expect(declarations.length).toBeGreaterThan(0);

		const moved = declarations.map(
			declaration =>
				`export ${declaration
					.getText()
					.replace(/^declare /, "")
					.replace(name, targetName)}`,
		);
		for (const declaration of declarations.reverse()) {
			source = source.slice(0, declaration.getStart()) + source.slice(declaration.getEnd());
		}

		return `${source}\ndeclare namespace AliasedTypes { ${moved.join("\n")} }\nimport ${name} = AliasedTypes.${targetName};`;
	});
}

it.each([
	["Array", "ArrayConstructor", "export const values = new Array<number>();"],
	["Set", "ReadonlySet", "declare const values: ReadonlySet<number>; print(values.size());"],
	["callMacros", "identity", "export const value = identity(123);"],
	["callMacros", "$tuple", "export function values() { return $tuple(1, 2); }"],
	["core", "LuaTuple", "declare function values(): LuaTuple<[number, string]>; export const [a, b] = values();"],
	["Promise", "Promise", "export const value = Promise.resolve(1);"],
])("resolves aliased %s declarations for %s", (file, name, source) => {
	const expected = createTestProject().compileSource(source);
	const project = aliasCompilerType(file, name);

	expect(project.compileSource(source)).toBe(expected);
});

it("rejects unimplemented methods through a renamed interface alias", () => {
	const project = aliasCompilerType("Set", "ReadonlySet", "RenamedReadonlySet");
	project.vfs.writeFile(
		"/src/augmentation.d.ts",
		"declare namespace AliasedTypes { interface RenamedReadonlySet<T> { custom(): void; } }",
	);

	expect(() => project.compileSource("declare const values: ReadonlySet<number>; values.custom();")).toThrow(
		"Macro RenamedReadonlySet.custom() is not implemented!",
	);
});

it("rejects references to an aliased call-only macro", () => {
	const project = aliasCompilerType("callMacros", "identity");

	expect(() => project.compileSource("const callback = identity;")).toThrow(
		"Cannot index a method without calling it!",
	);
});

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
