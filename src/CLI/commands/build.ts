import { CLIError } from "CLI/errors/CLIError";
import { Watcher } from "CLI/modules/Watcher";
import { identity } from "Shared/util/identity";
import { Project, ProjectOptions } from "TSProject";
import { DiagnosticError } from "TSProject/errors/DiagnosticError";
import { ProjectError } from "TSProject/errors/ProjectError";
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

interface CLIOptions {
	project: string;
	watch: boolean;
}

export = identity<yargs.CommandModule<{}, Partial<ProjectOptions> & CLIOptions>>({
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
			}),

	handler: argv => {
		const tsConfigPath = ts.findConfigFile(argv.project, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new CLIError("Unable to find tsconfig.json!");
		}

		const tsConfigProjectOptions = getTsConfigProjectOptions(tsConfigPath);
		const projectOptions: Partial<ProjectOptions> = Object.assign({}, tsConfigProjectOptions, argv);

		if (argv.watch) {
			new Watcher(tsConfigPath, projectOptions);
		} else {
			try {
				const project = new Project(tsConfigPath, projectOptions);
				project.compile();
			} catch (e) {
				if (e instanceof ProjectError || e instanceof DiagnosticError) {
					e.log();
				} else {
					throw e;
				}
			}
		}
	},
});
