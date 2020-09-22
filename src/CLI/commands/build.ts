import ts from "byots";
import { CLIError } from "CLI/errors/CLIError";
import fs from "fs-extra";
import path from "path";
import {
	createProjectData,
	createProjectProgram,
	createProjectServices,
	createProjectWatchProgram,
} from "Project/functions/bootstrap";
import { cleanup } from "Project/functions/cleanup";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { getRootDirs } from "Project/functions/getRootDirs";
import { ProjectFlags, ProjectOptions } from "Project/types";
import { LogService } from "Shared/classes/LogService";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
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
export = ts.identity<yargs.CommandModule<{}, Partial<ProjectOptions> & ProjectFlags>>({
	command: ["$0", "build"],

	describe: "Build a project",

	builder: () =>
		yargs
			.option("project", {
				alias: "p",
				string: true,
				default: ".",
				describe: "project path",
			})
			.option("watch", {
				alias: "w",
				boolean: true,
				default: false,
				describe: "enable watch mode",
			})
			.option("verbose", {
				boolean: true,
				default: false,
				describe: "enable verbose logs",
			})
			.option("noInclude", {
				boolean: true,
				default: false,
				describe: "do not copy include files",
			})
			// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
			.option("type", {
				choices: [ProjectType.Game, ProjectType.Model, ProjectType.Package] as const,
			})
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "manually select Rojo configuration file",
			}),

	handler: async argv => {
		const tsConfigPath = findTsConfigPath(argv.project);

		// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
		const projectOptions: Partial<ProjectOptions> = Object.assign(
			{},
			getTsConfigProjectOptions(tsConfigPath),
			argv as ProjectFlags,
		);

		LogService.verbose = argv.verbose === true;

		try {
			const data = createProjectData(tsConfigPath, projectOptions, argv);
			if (argv.watch) {
				createProjectWatchProgram(data);
			} else {
				const program = createProjectProgram(data);
				const services = createProjectServices(program, data);
				cleanup(services.pathTranslator);
				copyInclude(data);
				copyFiles(program, services, new Set(getRootDirs(program)));
				const emitResult = program.emit();
				if (emitResult.diagnostics.length > 0) {
					throw new DiagnosticError(emitResult.diagnostics);
				}
			}
		} catch (e) {
			// catch recognized errors
			if (e instanceof ProjectError || e instanceof DiagnosticError) {
				e.log();
				process.exit(1);
			} else {
				throw e;
			}
		}
	},
});
