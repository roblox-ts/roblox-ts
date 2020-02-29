import fs from "fs-extra";
import path from "path";
import { CliError } from "./errors/CliError";
import { Project } from "./Project";
import { cmd } from "./utility/general";
import { yellow } from "./utility/text";

export enum InitializeMode {
	Game = "game",
	Model = "model",
	Plugin = "plugin",
	Package = "package",
}

export enum DependencyMode {
	npm = "npm",
	pnpm = "pnpm",
	yarn = "yarn",
	off = "off",
}
const TEMPLATE_DIR = path.join(__dirname, "..", "templates");

export abstract class Initializer {
	private static step = 0;
	public static async doStep(message: string, callback: () => Promise<unknown>) {
		const start = Date.now();
		process.stdout.write(`\t${++this.step} - ${message}`);
		await callback();
		process.stdout.write(` ( ${Date.now() - start} ms )\n`);
	}

	public static async init(mode: InitializeMode, dependencyMode: DependencyMode) {
		const dir = process.cwd();

		const srcPath = path.join(dir, "src");
		if ((await fs.pathExists(srcPath)) && (await fs.readdir(srcPath)).length > 0) {
			throw new CliError(`Cannot initialize with existing non-empty src directory!`);
		}

		if (mode === InitializeMode.Package && (await fs.pathExists(path.join(dir, "default.project.json")))) {
			throw new CliError("Packages should not have default.project.json");
		}

		console.log(yellow(`Initializing directory as ${mode}`));

		await this.doStep("Creating package.json", async () => {
			if (mode === InitializeMode.Package) {
				await cmd("npm", ["init", "-y", "--scope", "@rbxts"]);
				const pkgJsonPath = path.join(dir, "package.json");
				const pkgJson = await fs.readJson(pkgJsonPath);
				pkgJson.publishConfig = {
					access: "public",
				};
				pkgJson.scripts = {
					prepublishOnly: "rbxtsc",
				};
				pkgJson.main = "out/init.lua";
				pkgJson.types = "out/index.d.ts";
				await fs.outputFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
			} else {
				await cmd("npm", ["init", "-y"]);
			}
		});

		switch (dependencyMode) {
			case DependencyMode.npm:
			case DependencyMode.pnpm: {
				await this.doStep("Installing @rbxts/types", () => cmd(dependencyMode, ["i", "-D", "@rbxts/types"]));
				break;
			}
			case DependencyMode.yarn: {
				await this.doStep("Installing @rbxts/types", () => cmd("yarn", ["add", "--dev", "@rbxts/types"]));
				break;
			}
			case DependencyMode.off: {
				break;
			}
		}

		await this.doStep("Copying files", () => fs.copy(path.join(TEMPLATE_DIR, mode), dir));

		if (dependencyMode === DependencyMode.off) {
			// Skip compiling because @rbxts/types might not be installed
		} else {
			// Package manager in use, @rbxts/types has been installed, compile
			await this.doStep(
				"Compiling",
				async () =>
					await new Project({
						includePath: "include",
						project: dir,
						rojo: "",
					}).compileAll(),
			);
		}

		console.log("Run `rbxtsc` to compile!");
	}
}
