import ts from "byots";
import yargs from "yargs";

interface InitOptions {}

enum TemplateType {
	Game = "game",
	Model = "model",
	Plugin = "plugin",
	Package = "package",
}

function initialize(argv: yargs.Arguments<InitOptions>, type: TemplateType) {
	if (type === TemplateType.Game) {
	} else if (type === TemplateType.Model) {
	} else if (type === TemplateType.Plugin) {
	} else if (type === TemplateType.Package) {
	}
}

/**
 * Defines behavior of `rbxtsc init` command.
 */
export = ts.identity<yargs.CommandModule<{}, InitOptions>>({
	command: "init",
	describe: "Create a project from a template",
	builder: () =>
		yargs
			.command(["game", "place"], "Generate a Roblox place", {}, argv => initialize(argv, TemplateType.Game))
			.command("model", "Generate a Roblox model", {}, argv => initialize(argv, TemplateType.Model))
			.command("plugin", "Generate a Roblox Studio plugin", {}, argv => initialize(argv, TemplateType.Plugin))
			.command("package", "Generate a roblox-ts npm package", {}, argv => initialize(argv, TemplateType.Package))
			.demandCommand(),
	handler: () => {},
});
