#!/usr/bin/env node

import { CLIError } from "CLI/errors/CLIError";
import { PACKAGE_ROOT } from "Shared/constants";
import yargs from "yargs";

const cli = yargs
	// help
	.usage("roblox-ts - A TypeScript-to-Luau Compiler for Roblox")
	.help("help")
	.alias("h", "help")
	.describe("help", "show help information")

	// version
	.version()
	.alias("v", "version")
	.describe("version", "show version information")

	// commands
	.commandDir(`${PACKAGE_ROOT}/out/CLI/commands`)

	// options
	.recommendCommands()
	.strict()
	.wrap(yargs.terminalWidth());

// entry point
try {
	// attempt to parse the arguments passed through the CLI
	// run associated commands after parse
	cli.parse();
} catch (e) {
	// catch recognized errors and log
	if (e instanceof CLIError) {
		e.log();
	} else {
		throw e;
	}
}
