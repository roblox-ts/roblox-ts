import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";

// force colors
chalk.level = 1;

export class CLIError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public log() {
		console.log(chalk.redBright("CLI Error:"), this.message);
	}
}
