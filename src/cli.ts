#!/usr/bin/env node

import yargs from "yargs";
import { setAnalyticsDisabled } from "./analytics";
import { LoggableError } from "./errors/LoggableError";
import { InitializeMode, Initializer } from "./Initializer";
import { Project } from "./Project";
import { COMPILER_VERSION } from "./utility/general";
import { red } from "./utility/text";
import { Watcher } from "./Watcher";

// cli interface
const argv = yargs
	.usage("Usage: rbxtsc [options]")

	// version
	.alias("v", "version")
	.version(COMPILER_VERSION)
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
		conflicts: ["w", "no-analytics"],
		type: "string",
	})

	// noAnalytics
	.option("noAnalytics", {
		conflicts: ["w", "init"],
		description: "disables analytics globally",
		type: "boolean",
	})

	// logTruthyChanges
	.option("logTruthyChanges", {
		boolean: true,
		describe: "logs changes to truthiness evaluation from Lua truthiness rules",
	})

	// noHash
	.option("noHash", {
		boolean: true,
		describe: "Ignores file hashes",
	})

	// parse
	.parse();

void (async () => {
	try {
		if (argv.noAnalytics !== undefined) {
			await setAnalyticsDisabled(argv.noAnalytics);
		} else if (argv.init !== undefined) {
			await Initializer.init(argv.init as InitializeMode);
		} else if (argv.watch === true) {
			new Watcher(new Project(argv), argv.onSuccess).start();
		} else {
			await new Project(argv).compileAll();
		}
	} catch (e) {
		if (e instanceof LoggableError) {
			e.log("");
		} else if (e instanceof Error) {
			let text = e.stack || String(e);
			const ERROR_PREFIX = "Error: ";
			if (text.startsWith(ERROR_PREFIX)) {
				text = red(ERROR_PREFIX) + text.slice(ERROR_PREFIX.length);
			}
			console.log(text);
		} else {
			throw e;
		}
	}
})();
