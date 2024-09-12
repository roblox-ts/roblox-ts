/* eslint-disable no-console -- LogService is probably overkill here */

import { PathTranslator } from "@roblox-ts/path-translator";
import { spawnSync } from "child_process";
import { findTsConfigPath } from "CLI/util/findTsConfigPath";
import { getTsConfigProjectOptions } from "CLI/util/getTsConfigProjectOptions";
import fs from "fs-extra";
import path from "path";
import { createProjectData, createProjectProgram, ProjectOptions } from "Project";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import ts from "typescript";
import yargs from "yargs";

interface SourceMapFlags {
	rojo?: string;
	project: string;
	"include-non-scripts"?: boolean;
	output?: string;
}

interface RojoSourceMap {
	name: string;
	className: string;
	filePaths?: Array<string>;
	children?: Array<RojoSourceMap>;
}

function updateRojoSourceMapRecursively(sourcemap: RojoSourceMap, projectDir: string, pathTranslator: PathTranslator) {
	if (sourcemap.filePaths) {
		sourcemap.filePaths = sourcemap.filePaths.flatMap(v => {
			if (path.relative(pathTranslator.outDir, v).startsWith("..")) {
				// retain things outside of outDir
				return v;
			} else {
				return pathTranslator
					.getInputPaths(v)
					.filter(fs.existsSync)
					.map(v => path.relative(projectDir, v));
			}
		});
	}
	if (sourcemap.children) {
		for (const child of sourcemap.children) {
			updateRojoSourceMapRecursively(child, projectDir, pathTranslator);
		}
	}
}

/**
 * Defines the behavior for the `rbxtsc sourcemap` command.
 */
export = ts.identity<yargs.CommandModule<object, SourceMapFlags>>({
	command: ["sourcemap [project]"],

	describe: "Invokes `rojo sourcemap` to generates a sourcemap file from the Rojo project",

	builder: () =>
		yargs
			.positional("rojo", {
				describe: "Rojo project.json path",
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
		const tsConfigPath = findTsConfigPath(argv.project);

		// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
		const projectOptions: ProjectOptions = Object.assign(
			{},
			DEFAULT_PROJECT_OPTIONS,
			getTsConfigProjectOptions(tsConfigPath),
			argv,
		);

		const data = createProjectData(tsConfigPath, projectOptions);
		const program = createProjectProgram(data);
		const pathTranslator = createPathTranslator(program, data);

		const args = ["sourcemap"];
		if (argv.rojo) args.push(argv.rojo);
		if (argv["include-non-scripts"]) args.push("--include-non-scripts", String(argv["include-non-scripts"]));
		const { stdout, stderr, error, status } = spawnSync("rojo", args);
		if (error) {
			console.error(error);
			process.exit(1);
		}
		if (status !== 0) {
			console.error(stderr.toString());
			process.exit(status);
		}
		const rojoSourceMap: RojoSourceMap = JSON.parse(stdout.toString());
		const rojoProjectJsonPath = argv.rojo
			? path.resolve(argv.rojo)
			: path.join(process.cwd(), "default.project.json");
		const projectDir = path.dirname(rojoProjectJsonPath);
		updateRojoSourceMapRecursively(rojoSourceMap, projectDir, pathTranslator);
		const transformedSourceMap = JSON.stringify(rojoSourceMap);
		if (argv.output) {
			fs.writeFileSync(argv.output, transformedSourceMap);
		} else {
			console.log(transformedSourceMap);
		}
	},
});
