#!/usr/bin/env node

import yargs from "yargs";
import { CliError } from "./errors/CliError";
import { InitializeMode, Initializer } from "./Initializer";
import { Project } from "./Project";
import { Watcher } from "./Watcher";

// cli interface
const argv = yargs
	.usage("Usage: rbxtsc [options]")

	// version
	.alias("v", "version")
	.version(require("../package.json").version as string)
	.describe("version", "show version information")

	// help
	.alias("h", "help")
	.help("help")
	.describe("help", "show help information")
	.showHelpOnFail(false, "specify --help for available options")

	// watch
	.option("w", {
		alias: "watch",
		boolean: true,
		describe: "enable watch mode",
	})

	// project
	.option("p", {
		alias: "project",
		default: ".",
		describe: "project path",
	})

	// noInclude
	.option("noInclude", {
		boolean: true,
		default: false,
		describe: "do not copy runtime files",
	})

	// includePath
	.option("i", {
		alias: "includePath",
		default: "include",
		describe: "folder to copy runtime files to",
	})

	// minify
	.option("minify", {
		alias: "min",
		boolean: true,
		default: false,
		describe: "minify emitted Lua code",
	})

	// onSuccess
	.option("onSuccess", {
		default: "",
		describe: "Command to run on watch success",
	})

	// rojo
	.option("rojo", {
		alias: "r",
		default: "",
		describe: "Manually select Rojo configuration file",
	})

	// init
	.option("init", {
		choices: [InitializeMode.Game, InitializeMode.Model, InitializeMode.Plugin, InitializeMode.Package],
		conflicts: ["w"],
		type: "string",
	})

	// parse
	.parse();

void (async () => {
	try {
		if (argv.init !== undefined) {
			await Initializer.init(argv.init as InitializeMode);
		} else if (argv.watch === true) {
			const watcher = new Watcher(new Project(argv), argv.onSuccess);
			watcher.start();
		} else {
			await new Project(argv).compileAll();
		}
	} catch (e) {
		if (e instanceof CliError) {
			e.log();
		} else {
			throw e;
		}
	}
})();
