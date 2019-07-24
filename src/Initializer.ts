import fs from "fs-extra";
import path from "path";
import { CliError } from "./errors/CliError";
import { cmd } from "./utility/general";
import { yellow } from "./utility/text";

export enum InitializeMode {
	Game = "game",
	Bundle = "bundle",
	Package = "package",
}

const TEMPLATE_DIR = path.join(__dirname, "..", "templates");

export abstract class Initializer {
	private static step = 0;
	public static async doStep(message: string, callback: () => Promise<any>) {
		const start = Date.now();
		process.stdout.write(`\t${++this.step} - ${message}`);
		await callback();
		process.stdout.write(` ( ${Date.now() - start} ms )\n`);
	}

	public static async init(mode: InitializeMode) {
		const dir = process.cwd();

		const srcPath = path.join(dir, "src");
		if ((await fs.pathExists(srcPath)) && (await fs.readdir(srcPath)).length > 0) {
			throw new CliError(`Cannot initialize with existing non-empty src directory!`);
		}

		if (mode === InitializeMode.Package && (await fs.pathExists(path.join(dir, "default.project.json")))) {
			throw new CliError("Packages should not have default.project.json");
		}

		console.log(yellow(`Initializing directory as ${mode}`));

		await this.doStep("Creating package.json", () => cmd("npm", ["init", "-y"]));

		await this.doStep("Install @rbxts/types", () => cmd("npm", ["i", "-D", "@rbxts/types"]));

		await this.doStep("Copying files", () => fs.copy(path.join(TEMPLATE_DIR, mode), dir, { errorOnExist: true }));

		console.log("Run `rbxtsc` to compile!");
	}
}
