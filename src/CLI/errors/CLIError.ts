import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";

// force colors
chalk.level = chalk.Level.Basic;

export class CLIError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public toString() {
		return chalk.redBright("CLI Error:") + " " + this.message;
	}
}
