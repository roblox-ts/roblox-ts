import chalk from "chalk";

// force colors
chalk.level = chalk.Level.Basic;

/**
 * Prints out a 'Compiler Warning' message.
 * @param message
 */
export function warn(message: string) {
	console.log(chalk.yellow("Compiler Warning:"), message);
}
