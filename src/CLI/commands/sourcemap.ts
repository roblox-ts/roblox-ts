import { PathTranslator } from "@roblox-ts/path-translator";
import { createRojoProject } from "CLI/util/createRojoProject";
import { getRojoSourceMap, RojoSourceMap } from "CLI/util/getRojoSourceMap";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import ts from "typescript";
import type yargs from "yargs";

interface SourceMapFlags {
	rojo?: string;
	project: string;
	"include-non-scripts"?: boolean;
	output?: string;
}

function updateRojoSourceMapRecursively(sourceMap: RojoSourceMap, projectDir: string, pathTranslator: PathTranslator) {
	if (sourceMap.filePaths) {
		sourceMap.filePaths = sourceMap.filePaths.flatMap(v => {
			const filePath = path.resolve(projectDir, v);
			if (!isPathDescendantOf(filePath, pathTranslator.outDir)) {
				// retain things outside of outDir
				return v;
			} else {
				return pathTranslator
					.getInputPaths(filePath)
					.filter(fs.existsSync)
					.map(v => path.relative(projectDir, v));
			}
		});
	}
	if (sourceMap.children) {
		for (const child of sourceMap.children) {
			updateRojoSourceMapRecursively(child, projectDir, pathTranslator);
		}
	}
}

export = ts.identity<yargs.CommandModule<object, SourceMapFlags>>({
	command: ["sourcemap [project]"],

	describe: "Invokes `rojo sourcemap` to generate a sourcemap file from the Rojo project",

	builder: parser =>
		parser
			.option("rojo", {
				describe: "manually select Rojo project file",
				type: "string",
			})
			.option("project", {
				alias: "p",
				string: true,
				default: ".",
				describe: "project path",
			})
			.option("output", {
				type: "string",
				alias: "o",
			})
			.option("include-non-scripts", {
				type: "boolean",
			}),

	handler: async argv => {
		const { rojoConfigPath, pathTranslator } = createRojoProject(argv);
		const rojoSourceMap = getRojoSourceMap(rojoConfigPath, argv["include-non-scripts"]);
		const projectDir = path.dirname(rojoConfigPath);
		if (rojoSourceMap !== null) {
			updateRojoSourceMapRecursively(rojoSourceMap, projectDir, pathTranslator);
		}
		const transformedSourceMap = JSON.stringify(rojoSourceMap);
		if (argv.output) {
			fs.writeFileSync(argv.output, transformedSourceMap);
		} else {
			LogService.writeLine(transformedSourceMap);
		}
	},
});
