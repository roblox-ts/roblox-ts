#!/usr/bin/env node

import { CLIError } from "CLI/errors/CLIError";
import { COMPILER_VERSION, PACKAGE_ROOT } from "Shared/constants";
import yargs from "yargs";

void yargs
	// help
	.usage("roblox-ts - A TypeScript-to-Luau Compiler for Roblox")
	.help("help")
	.alias("h", "help")
	.describe("help", "show help information")

	// version
	.version(COMPILER_VERSION)
	.alias("v", "version")
	.describe("version", "show version information")

	// commands
	.commandDir(`${PACKAGE_ROOT}/out/CLI/commands`)

	// options
	.recommendCommands()
	.strict()
	.wrap(yargs.terminalWidth())

	// execute
	.fail((str, e: unknown) => {
		process.exitCode = 1;
		if (e instanceof CLIError) {
			e.log();
		} else {
			// eslint-disable-next-line no-console
			if (str !== undefined && str !== null) console.log(str);
			// eslint-disable-next-line no-console
			if (e) console.log(e);
		}
		debugger;
	})
	.parse();
