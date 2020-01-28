#!/usr/bin/env node

import { CLIError } from "CLI/errors/CLIError";
import yargs from "yargs";

const cli = yargs
	// help
	.usage("roblox-ts - A TypeScript-to-Lua Compiler for Roblox")
	.help("help")
	.alias("h", "help")
	.describe("help", "show help information")

	// version
	.version()
	.alias("v", "version")
	.describe("version", "show version information")

	// commands
	.commandDir(`${__dirname}/commands`)

	// options
	.recommendCommands()
	.strict()
	.wrap(yargs.terminalWidth());

try {
	cli.parse();
} catch (e) {
	if (e instanceof CLIError) {
		e.log();
	} else {
		throw e;
	}
}
