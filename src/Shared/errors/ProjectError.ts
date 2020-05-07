import chalk from "chalk";
import { LoggableError } from "Shared/errors/LoggableError";

// force colors
chalk.level = chalk.Level.Basic;

export class ProjectError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public log() {
		console.log(chalk.redBright("Project Error:"), this.message);
	}
}
