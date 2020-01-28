import { identity } from "Shared/util/identity";
import yargs from "yargs";

const command = "init";

const describe = "Create a project from a template";

function handler(argv: yargs.Arguments, name: string) {
	console.log("init", name, argv);
}

const builder: yargs.CommandBuilder = () =>
	yargs
		.command(["game", "place"], "Generate a Roblox place", {}, argv => handler(argv, "game"))
		.command("model", "Generate a Roblox model", {}, argv => handler(argv, "model"))
		.command("plugin", "Generate a Roblox Studio plugin", {}, argv => handler(argv, "plugin"))
		.command("package", "Generate a roblox-ts npm package", {}, argv => handler(argv, "package"))
		.demandCommand();

export = identity<yargs.CommandModule>({ command, describe, builder, handler: () => {} });
