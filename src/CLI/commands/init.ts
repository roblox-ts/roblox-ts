import { exec, ExecException } from "child_process";
import build from "CLI/commands/build";
import { CLIError } from "CLI/errors/CLIError";
import fs from "fs-extra";
import kleur from "kleur";
import { lookpath } from "lookpath";
import path from "path";
import prompts from "prompts";
import { COMPILER_VERSION, PACKAGE_ROOT, RBXTS_SCOPE } from "Shared/constants";
import { benchmark } from "Shared/util/benchmark";
import ts from "typescript";
import yargs from "yargs";

interface InitOptions {
	yes?: boolean;
	git?: boolean;
	eslint?: boolean;
	prettier?: boolean;
	vscode?: boolean;
	packageManager?: PackageManager;
}

enum InitMode {
	None = "none",
	Game = "game",
	Place = "place",
	Model = "model",
	Plugin = "plugin",
	Package = "package",
}

enum PackageManager {
	NPM = "npm",
	Yarn = "yarn",
	PNPM = "pnpm",
}

interface PackageManagerCommands {
	init: string;
	devInstall: string;
	build: string;
}

const packageManagerCommands: Record<PackageManager, PackageManagerCommands> = {
	[PackageManager.NPM]: {
		init: "npm init -y",
		devInstall: "npm install --silent -D",
		build: "npm run build",
	},
	[PackageManager.Yarn]: {
		init: "yarn init -y",
		devInstall: "yarn add --silent -D",
		build: "yarn run build",
	},
	[PackageManager.PNPM]: {
		init: "pnpm init -y",
		devInstall: "pnpm install --silent -D",
		build: "pnpm run build",
	},
};

function cmd(cmdStr: string) {
	return new Promise<string>((resolve, reject) => {
		exec(cmdStr, (error, stdout) => {
			if (error) {
				reject(error);
			}
			resolve(stdout);
		});
	}).catch((error: ExecException) => {
		throw new CLIError(`Command "${error.cmd!}" exited with code ${error.code!}\n\n${error.message}`);
	});
}

function getNonDevCompilerVersion() {
	return COMPILER_VERSION.match(/^(.+)-dev.+$/)?.[1] ?? COMPILER_VERSION;
}

const TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates");
const GIT_IGNORE = ["/node_modules", "/out", "/include", "*.tsbuildinfo"];

async function init(argv: yargs.Arguments<InitOptions>, mode: InitMode) {
	const cwd = process.cwd();
	const paths = {
		packageJson: path.join(cwd, "package.json"),
		packageLockJson: path.join(cwd, "package-lock.json"),
		projectJson: path.join(cwd, "default.project.json"),
		serveProjectJson: mode === InitMode.Plugin && path.join(cwd, "serve.project.json"),
		src: path.join(cwd, "src"),
		tsconfig: path.join(cwd, "tsconfig.json"),
		gitignore: path.join(cwd, ".gitignore"),
		eslintrc: path.join(cwd, ".eslintrc"),
		prettierrc: path.join(cwd, ".prettierrc"),
		settings: path.join(cwd, ".vscode", "settings.json"),
		extensions: path.join(cwd, ".vscode", "extensions.json"),
	};

	const existingPaths = new Array<string>();
	for (const filePath of Object.values(paths)) {
		if (filePath && (await fs.pathExists(filePath))) {
			const stat = await fs.stat(filePath);
			if (stat.isFile() || (await fs.readdir(filePath)).length > 0) {
				existingPaths.push(path.relative(cwd, filePath));
			}
		}
	}
	if (existingPaths.length > 0) {
		const pathInfo = existingPaths.map(v => `  - ${kleur.yellow(v)}\n`).join("");
		throw new CLIError(`Cannot initialize project, process could overwrite:\n${pathInfo}`);
	}

	if (mode === InitMode.None) {
		mode = (
			await prompts({
				type: "select",
				name: "template",
				message: "Select template",
				choices: [InitMode.Game, InitMode.Model, InitMode.Plugin, InitMode.Package].map(value => ({
					title: value,
					value,
				})),
				initial: 0,
			})
		).template;

		// ctrl+c
		if (mode === undefined) {
			return;
		}
	}

	// Detect if there are any additional package managers
	// We don't need to prompt the user to use additional package managers if none are installed

	// Although npm is installed by default, it can be uninstalled
	// and replaced by another manager, so check for it to make sure
	const npmAvailable = lookpath("npm");
	const pnpmAvailable = lookpath("pnpm");
	const yarnAvailable = lookpath("yarn");
	const gitAvailable = !!(await lookpath("git"));

	const packageManagerExistance: Record<PackageManager, boolean> = {
		[PackageManager.NPM]: !!(await npmAvailable),
		[PackageManager.PNPM]: !!(await pnpmAvailable),
		[PackageManager.Yarn]: !!(await yarnAvailable),
	};

	const packageManagerCount = Object.values(packageManagerExistance).filter(exists => exists).length;

	const {
		git = argv.git ?? (argv.yes && gitAvailable) ?? false,
		eslint = argv.eslint ?? argv.yes ?? false,
		prettier = argv.prettier ?? argv.yes ?? false,
		vscode = argv.vscode ?? argv.yes ?? false,
		packageManager = argv.packageManager ?? PackageManager.NPM,
	}: {
		git: boolean;
		eslint: boolean;
		prettier: boolean;
		vscode: boolean;
		packageManager: PackageManager;
	} = await prompts([
		{
			type: () => argv.git === undefined && argv.yes === undefined && gitAvailable && "confirm",
			name: "git",
			message: "Configure Git",
			initial: true,
		},
		{
			type: () => argv.eslint === undefined && argv.yes === undefined && "confirm",
			name: "eslint",
			message: "Configure ESLint",
			initial: true,
		},
		{
			type: () => argv.prettier === undefined && argv.yes === undefined && "confirm",
			name: "prettier",
			message: "Configure Prettier",
			initial: true,
		},
		{
			type: () => argv.vscode === undefined && argv.yes === undefined && "confirm",
			name: "vscode",
			message: "Configure VSCode Project Settings",
			initial: true,
		},
		{
			type: () =>
				argv.packageManager === undefined && packageManagerCount > 1 && argv.yes === undefined && "select",
			name: "packageManager",
			message: "Multiple package managers detected. Select package manager:",
			choices: Object.entries(PackageManager)
				.filter(([, packageManager]) => packageManagerExistance[packageManager])
				.map(([managerDisplayName, managerEnum]) => ({
					title: managerDisplayName,
					value: managerEnum,
				})),
		},
	]);

	const selectedPackageManager = packageManagerCommands[packageManager];

	await benchmark("Initializing package.json..", async () => {
		await cmd(selectedPackageManager.init);
		const pkgJson = await fs.readJson(paths.packageJson);
		pkgJson.scripts = {
			build: "rbxtsc",
			watch: "rbxtsc -w",
		};
		if (mode === InitMode.Package) {
			pkgJson.name = RBXTS_SCOPE + "/" + pkgJson.name;
			pkgJson.main = "out/init.lua";
			pkgJson.types = "out/index.d.ts";
			pkgJson.files = ["out", "!**/*.tsbuildinfo"];
			pkgJson.publishConfig = { access: "public" };
			pkgJson.scripts.prepublishOnly = selectedPackageManager.build;
		}
		await fs.outputFile(paths.packageJson, JSON.stringify(pkgJson, null, 2));
	});

	if (git) {
		await benchmark("Initializing Git..", async () => {
			await cmd("git init");
			await fs.outputFile(paths.gitignore, GIT_IGNORE.join("\n") + "\n");
		});
	}

	await benchmark("Installing dependencies..", async () => {
		const devDependencies = [
			"@rbxts/types",
			`@rbxts/compiler-types@compiler-${getNonDevCompilerVersion()}`,
			"typescript",
		];

		if (prettier) {
			devDependencies.push("prettier");
		}

		if (eslint) {
			devDependencies.push(
				"eslint",
				"@typescript-eslint/eslint-plugin",
				"@typescript-eslint/parser",
				"eslint-plugin-roblox-ts",
			);
			if (prettier) {
				devDependencies.push("eslint-config-prettier", "eslint-plugin-prettier");
			}
		}

		await cmd(`${selectedPackageManager.devInstall} ${devDependencies.join(" ")}`);
	});

	if (eslint) {
		await benchmark("Configuring ESLint..", async () => {
			const eslintConfig = {
				parser: "@typescript-eslint/parser",
				parserOptions: {
					jsx: true,
					useJSXTextNode: true,
					ecmaVersion: 2018,
					sourceType: "module",
					project: "./tsconfig.json",
				},
				ignorePatterns: ["/out"],
				plugins: ["@typescript-eslint", "roblox-ts"],
				extends: [
					"eslint:recommended",
					"plugin:@typescript-eslint/recommended",
					"plugin:roblox-ts/recommended",
				],
				rules: ts.identity<{ [index: string]: unknown }>({}),
			};

			if (prettier) {
				eslintConfig.plugins.push("prettier");
				eslintConfig.extends.push("plugin:prettier/recommended");
				eslintConfig.rules["prettier/prettier"] = "warn";
			}

			await fs.outputFile(paths.eslintrc, JSON.stringify(eslintConfig, undefined, "\t"));
		});
	}

	if (prettier) {
		await benchmark("Configuring prettier..", async () => {
			const prettierConfig = {
				printWidth: 120,
				tabWidth: 4,
				trailingComma: "all",
				useTabs: true,
			};
			await fs.outputFile(paths.prettierrc, JSON.stringify(prettierConfig, undefined, "\t"));
		});
	}

	if (vscode) {
		await benchmark("Configuring vscode..", async () => {
			const extensions = {
				recommendations: ["roblox-ts.vscode-roblox-ts"],
			};
			const settings = {
				"typescript.tsdk": "node_modules/typescript/lib",
				"files.eol": "\n",
			};

			if (eslint) {
				extensions.recommendations.push("dbaeumer.vscode-eslint");
				Object.assign(settings, {
					"[typescript]": {
						"editor.defaultFormatter": "dbaeumer.vscode-eslint",
						"editor.formatOnSave": true,
					},
					"[typescriptreact]": {
						"editor.defaultFormatter": "dbaeumer.vscode-eslint",
						"editor.formatOnSave": true,
					},
					"eslint.run": "onType",
					"eslint.format.enable": true,
				});
			} else if (prettier) {
				// no eslint but still prettier
				extensions.recommendations.push("esbenp.prettier-vscode");
				Object.assign(settings, {
					"[typescript]": {
						"editor.defaultFormatter": "esbenp.prettier-vscode",
						"editor.formatOnSave": true,
					},
					"[typescriptreact]": {
						"editor.defaultFormatter": "esbenp.prettier-vscode",
						"editor.formatOnSave": true,
					},
				});
			}

			await fs.outputFile(paths.extensions, JSON.stringify(extensions, undefined, "\t"));
			await fs.outputFile(paths.settings, JSON.stringify(settings, undefined, "\t"));
		});
	}

	await benchmark("Copying template files..", async () => {
		const templateTsConfig = path.join(
			TEMPLATE_DIR,
			`tsconfig-${mode === InitMode.Package ? "package" : "default"}.json`,
		);
		await fs.copy(templateTsConfig, paths.tsconfig);

		await fs.copy(path.join(TEMPLATE_DIR, mode), cwd);
	});

	await benchmark(
		"Compiling..",
		() =>
			build.handler({
				logTruthyChanges: false,
				noInclude: false,
				project: ".",
				usePolling: false,
				verbose: false,
				watch: false,
				writeOnlyChanged: false,
				$0: argv.$0,
				_: argv._,
			}) as never,
	);
}

const GAME_DESCRIPTION = "Generate a Roblox place";
const MODEL_DESCRIPTION = "Generate a Roblox model";
const PLUGIN_DESCRIPTION = "Generate a Roblox Studio plugin";
const PACKAGE_DESCRIPTION = "Generate a roblox-ts npm package";

/**
 * Defines behavior of `rbxtsc init` command.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export = ts.identity<yargs.CommandModule<{}, InitOptions>>({
	command: "init",
	describe: "Create a project from a template",
	builder: () =>
		yargs
			.option("yes", {
				alias: "y",
				boolean: true,
				describe: "recommended options",
			})
			.option("git", {
				boolean: true,
				describe: "Configure Git",
			})
			.option("eslint", {
				boolean: true,
				describe: "Configure ESLint",
			})
			.option("prettier", {
				boolean: true,
				describe: "Configure Prettier",
			})
			.option("vscode", {
				boolean: true,
				describe: "Configure VSCode Project Settings",
			})
			.option("packageManager", {
				choices: Object.values(PackageManager),
				describe: "Choose an alternative package manager",
			})
			.command([InitMode.Game, InitMode.Place], GAME_DESCRIPTION, {}, argv => init(argv as never, InitMode.Game))
			.command(InitMode.Model, MODEL_DESCRIPTION, {}, argv => init(argv as never, InitMode.Model))
			.command(InitMode.Plugin, PLUGIN_DESCRIPTION, {}, argv => init(argv as never, InitMode.Plugin))
			.command(InitMode.Package, PACKAGE_DESCRIPTION, {}, argv => init(argv as never, InitMode.Package)),
	handler: argv => init(argv, InitMode.None),
});
