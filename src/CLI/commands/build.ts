import { CLIError } from "CLI/errors/CLIError";
import fs from "fs-extra";
import path from "path";
import { cleanup } from "Project/functions/cleanup";
import { compileFiles } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { createProjectData } from "Project/functions/createProjectData";
import { createProjectProgram } from "Project/functions/createProjectProgram";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import { LogService } from "Shared/classes/LogService";
import { DEFAULT_PROJECT_OPTIONS, ProjectType } from "Shared/constants";
import { LoggableError } from "Shared/errors/LoggableError";
import { ProjectFlags, ProjectOptions } from "Shared/types";
import { getRootDirs } from "Shared/util/getRootDirs";
import { hasErrors } from "Shared/util/hasErrors";
import ts from "typescript";
import yargs from "yargs";

function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			return ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
		}
	}
}

function findTsConfigPath(projectPath: string) {
	let tsConfigPath: string | undefined = path.resolve(projectPath);
	if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
		tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new CLIError("Unable to find tsconfig.json!");
		}
	}
	return path.resolve(process.cwd(), tsConfigPath);
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, ProjectFlags & Partial<ProjectOptions>>>({
	command: ["$0", "build"],

	describe: "Build a project",

	builder: () =>
		yargs
			.option("project", {
				alias: "p",
				default: ".",
				string: true,
				describe: "project path",
			})
			// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
			.option("watch", {
				alias: "w",
				boolean: true,
				describe: "enable watch mode",
			})
			.option("usePolling", {
				implies: "watch",
				boolean: true,
				describe: "use polling for watch mode",
			})
			.option("verbose", {
				boolean: true,
				describe: "enable verbose logs",
			})
			.option("noInclude", {
				boolean: true,
				describe: "do not copy include files",
			})
			.option("logTruthyChanges", {
				boolean: true,
				describe: "logs changes to truthiness evaluation from Lua truthiness rules",
			})
			.option("writeOnlyChanged", {
				boolean: true,
				hidden: true,
			})
			.option("optimizedLoops", {
				boolean: true,
				hidden: true,
			})
			.option("type", {
				choices: [ProjectType.Game, ProjectType.Model, ProjectType.Package] as const,
				describe: "override project type",
			})
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "manually select Rojo project file",
			}),

	handler: async argv => {
		try {
			const tsConfigPath = findTsConfigPath(argv.project);

			// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
			const projectOptions: ProjectOptions = Object.assign(
				{},
				DEFAULT_PROJECT_OPTIONS,
				getTsConfigProjectOptions(tsConfigPath),
				argv,
			);

			LogService.verbose = projectOptions.verbose === true;

			const diagnosticReporter = ts.createDiagnosticReporter(ts.sys, true);

			const data = createProjectData(tsConfigPath, projectOptions);
			if (projectOptions.watch) {
				setupProjectWatchProgram(data, projectOptions.usePolling);
			} else {
				const program = createProjectProgram(data);
				const pathTranslator = createPathTranslator(program);
				cleanup(pathTranslator);
				copyInclude(data);
				copyFiles(data, pathTranslator, new Set(getRootDirs(program.getCompilerOptions())));
				const emitResult = compileFiles(
					program.getProgram(),
					data,
					pathTranslator,
					getChangedSourceFiles(program),
				);
				for (const diagnostic of emitResult.diagnostics) {
					diagnosticReporter(diagnostic);
				}
				if (hasErrors(emitResult.diagnostics)) {
					process.exitCode = 1;
				}
			}
		} catch (e) {
			process.exitCode = 1;
			if (e instanceof LoggableError) {
				e.log();
				debugger;
			} else {
				throw e;
			}
		}
	},
});
