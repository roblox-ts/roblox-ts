import ts from "typescript";
import yargs from "yargs";
import { Project } from "../../TSProject";
import { ProjectOptions } from "../../TSTransformer";
import { identity } from "../../Shared/util/identity";
import { CLIError } from "../errors/CLIError";

const DEFAULT_BUILD_FLAGS: ProjectOptions = {
	includePath: "include",
	rojo: "",
	watch: false,
};

function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			return ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
		}
	}
}

export = identity<yargs.CommandModule<{}, Partial<ProjectOptions> & { project: string }>>({
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
			// DO NOT PROVIDE DEFAULTS BELOW HERE
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "Manually select Rojo configuration file",
			})
			.option("watch", {
				alias: "w",
				boolean: true,
				describe: "enable watch mode",
			}),
	handler: argv => {
		const tsConfigPath = ts.findConfigFile(argv.project, ts.sys.fileExists);
		if (tsConfigPath === undefined) {
			throw new CLIError("Unable to find tsconfig.json!");
		}

		const tsConfigProjectOptions = getTsConfigProjectOptions(tsConfigPath);
		const projectOptions: ProjectOptions = Object.assign({}, DEFAULT_BUILD_FLAGS, tsConfigProjectOptions, argv);

		const project = new Project(tsConfigPath, projectOptions);
		project.compile();
	},
});
