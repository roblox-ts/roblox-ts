import fs from "fs-extra";
import os from "os";
import path from "path";
import { createTransformerList, flattenIntoTransformers } from "Project/transformers/createTransformerList";
import { getPluginConfigs } from "Project/transformers/getPluginConfigs";
import { TransformerPluginConfig } from "Shared/types";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

let directory: string;
beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "rbxts-plugins-"));
});
afterEach(() => {
	DiagnosticService.flush();
	fs.removeSync(directory);
});

it.each([
	[undefined, "first.getTypeChecker && helpers.ts.factory"],
	["program", "first.getTypeChecker && helpers.ts.factory"],
	["checker", "first.getTypeAtLocation"],
	["compilerOptions", "first.strict === true"],
	["config", "first.marker === 123"],
	["raw", "first.factory && config.getTypeChecker && helpers.marker === 123"],
] as const)("loads the %s factory convention", (type, condition) => {
	fs.writeFileSync(
		path.join(directory, "plugin.js"),
		`
		module.exports = function(first, config, helpers) {
			if (!(${condition})) {
				throw new Error("incorrect factory arguments");
			}
			const transform = source => ({ ...source, fileName: "transformed.ts" });
			return ${type === "raw" ? "transform" : "context => transform"};
		};
	`,
	);
	const program = ts.createProgram([], { strict: true });
	const list = createTransformerList(program, [{ transform: "./plugin.js", type, marker: 123 }], directory);
	const source = ts.createSourceFile("original.ts", "export const value = 1;", ts.ScriptTarget.Latest);

	const result = ts.transform(source, flattenIntoTransformers(list));

	expect(DiagnosticService.flush()).toEqual([]);
	expect(result.transformed[0].fileName).toBe("transformed.ts");
	result.dispose();
});

it.each([
	[{ after: true }, [0, 1, 0]],
	[{ afterDeclarations: true }, [0, 0, 1]],
] as const)("assigns a named factory to the requested phase %j", (phase, counts) => {
	fs.writeFileSync(path.join(directory, "plugin.js"), "exports.named = () => context => source => source;");

	const list = createTransformerList(
		ts.createProgram([], {}),
		[{ transform: "./plugin.js", import: "named", ...phase }],
		directory,
	);

	expect(DiagnosticService.flush()).toEqual([]);
	expect([list.before.length, list.after.length, list.afterDeclarations.length]).toEqual(counts);
});

it.each(["undefined", "{}", "{ default: 42 }"])("warns about an invalid factory export %s", exported => {
	fs.writeFileSync(path.join(directory, "plugin.js"), `module.exports = ${exported};`);

	const list = createTransformerList(ts.createProgram([], {}), [{ transform: "./plugin.js" }], directory);

	expect(flattenIntoTransformers(list)).toEqual([]);
	expect(DiagnosticService.flush()).toHaveLength(1);
});

it("ignores plugins without transforms and unsupported factory conventions", () => {
	fs.writeFileSync(path.join(directory, "plugin.js"), "module.exports = () => undefined;");
	fs.writeJsonSync(path.join(directory, "tsconfig.json"), {
		compilerOptions: {
			plugins: [
				{ transform: "./plugin.js", type: "unsupported" },
				{ transform: "./plugin.js" },
				{ name: "language-service-plugin" },
				{ transform: 123 },
			],
		},
	});
	const configs: Array<TransformerPluginConfig> = [{}, ...getPluginConfigs(path.join(directory, "tsconfig.json"))];

	const list = createTransformerList(ts.createProgram([], {}), configs, directory);

	expect(configs).toHaveLength(3);
	expect(list).toEqual({ before: [], after: [], afterDeclarations: [] });
	expect(DiagnosticService.flush()).toEqual([]);
});

it.each([{}, { compilerOptions: { plugins: {} } }])("accepts configs without a plugin array %j", config => {
	fs.writeJsonSync(path.join(directory, "tsconfig.json"), config);

	expect(getPluginConfigs(path.join(directory, "tsconfig.json"))).toEqual([]);
});

it("reports unreadable plugin config files", () => {
	expect(() => getPluginConfigs(path.join(directory, "missing.json"))).toThrow("Cannot read file");
});
