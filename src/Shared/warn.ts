import chalk from "chalk";
import { LogService } from "Shared/classes/LogService";

// force colors
chalk.level = chalk.Level.Basic;

/**
 * Prints out a 'Compiler Warning' message.
 * @param message
 */
export function warn(message: string) {
	LogService.writeLine(`${chalk.yellow("Compiler Warning:")} ${message}`);
}
