import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";

// force colors
chalk.level = 1;

export class ProjectError extends LoggableError {
	constructor(message: string) {
		super(message);
	}

	public log() {
		console.log(chalk.redBright("Project Error:"), this.message);
	}
}
