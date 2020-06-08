import ts from "byots";
import fs from "fs-extra";
import { CLIError } from "CLI/errors/CLIError";
import { Watcher } from "CLI/modules/Watcher";
import path from "path";
import { Project, ProjectOptions } from "Project";
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

interface CLIOptions {
	project: string;
	watch: boolean;
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
export = ts.identity<yargs.CommandModule<{}, Partial<ProjectOptions> & CLIOptions>>({
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
			// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "Manually select Rojo configuration file",
			})
			.option("optimise", {
				alias: "o",
				boolean: true,
				describe: "whether or not the Lua output should be optimised",
			}),

	handler: async argv => {
		// Attempt to retrieve TypeScript configuration JSON path
		let tsConfigPath: string | undefined = path.resolve(argv.project);
		if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
			tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
			if (tsConfigPath === undefined) {
				throw new CLIError("Unable to find tsconfig.json!");
			}
		}
		tsConfigPath = path.resolve(process.cwd(), tsConfigPath);

		// Parse the contents of the retrieved JSON path as a partial `ProjectOptions`
		const tsConfigProjectOptions = getTsConfigProjectOptions(tsConfigPath);
		const projectOptions: Partial<ProjectOptions> = Object.assign({}, tsConfigProjectOptions, argv);

		// If watch mode is enabled
		if (argv.watch) {
			new Watcher(tsConfigPath, projectOptions);
		} else {
			try {
				// Attempt to build the project
				const project = new Project(tsConfigPath, projectOptions);
				await project.cleanup();
				project.compile();
			} catch (e) {
				// Catch recognized errors
				if (e instanceof ProjectError || e instanceof DiagnosticError) {
					e.log();
				} else {
					throw e;
				}
			}
		}
	},
});
