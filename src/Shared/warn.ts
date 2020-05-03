import chalk from "chalk";

// force colors
chalk.level = chalk.Level.Basic;

export function warn(message: string) {
	console.log(chalk.yellow("Compiler Warning:"), message);
}
