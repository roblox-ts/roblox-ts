#!/usr/bin/env node

import { CLIError } from "CLI/errors/CLIError";
import { LogService } from "Shared/classes/LogService";
import { COMPILER_VERSION, PACKAGE_ROOT } from "Shared/constants";
import yargs from "yargs";

yargs
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
	// .fail() is necessary to properly `.toString()` custom error objects like CLIError
	.fail(str => {
		process.exitCode = 1;
		if (str) {
			LogService.fatal(str);
		}
	})
	.parseAsync()
	.catch(e => {
		if (e instanceof CLIError) {
			e.log();
			debugger;
		} else {
			throw e;
		}
	});
