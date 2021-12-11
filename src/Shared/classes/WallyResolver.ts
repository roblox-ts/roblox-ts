import toml from "@ltd/j-toml";
import assert from "assert";
import fs from "fs-extra";
import path from "path";
import semver, { SemVer } from "semver";
import { warn } from "Shared/warn";

const WALLY_DEFAULT_NAME = "wally.toml";

interface Package {
	scope: string;
	package: string;
	version: SemVer;
}

type Dependencies = Record<string, Package | undefined>;

interface WallyFile {
	Dependencies: Dependencies;
	ServerDependencies: Dependencies;
	DevDependencies: Dependencies;
}

export class WallyResolver {
	public wallyFile: WallyFile;
	public dependenciesDirectory: string;
	public serverDependenciesDirectory: string;
	public devDependenciesDirectory: string;

	constructor(projectPath: string, wallyConfigFilePath: string) {
		this.wallyFile = this.parseConfig(wallyConfigFilePath);
		this.dependenciesDirectory = path.join(projectPath, "Packages");
		this.serverDependenciesDirectory = path.join(projectPath, "ServerPackages");
		this.devDependenciesDirectory = path.join(projectPath, "DevPackages");
	}

	public static getWallyConfigFilePath(projectPath: string) {
		return path.join(projectPath, WALLY_DEFAULT_NAME);
	}

	private parseConfig(wallyConfigFilePath: string): WallyFile {
		let dependencies: Dependencies = {};
		let serverDependencies: Dependencies = {};
		let DevDependencies: Dependencies = {};

		if (fs.pathExistsSync(wallyConfigFilePath)) {
			const realPath = fs.realpathSync(wallyConfigFilePath);
			let wallyToml: { [key: string]: unknown } | undefined;
			try {
				wallyToml = toml.parse(fs.readFileSync(realPath));
				assert(wallyToml);
				if (typeof wallyToml["dependencies"] === "object") {
					dependencies = this.parseDependencies(wallyToml["dependencies"] as Record<string, unknown>);
				}

				if (typeof wallyToml["server-dependencies"] === "object") {
					serverDependencies = this.parseDependencies(wallyToml["dependencies"] as Record<string, unknown>);
				}

				if (typeof wallyToml["server-dependencies"] === "object") {
					DevDependencies = this.parseDependencies(wallyToml["dependencies"] as Record<string, unknown>);
				}
			} catch (e) {}
			// TODO: check that wallyToml follows spec
		}

		return {
			Dependencies: dependencies,
			ServerDependencies: serverDependencies,
			DevDependencies: DevDependencies,
		};
	}

	private parseDependencies(dependencies: Record<string, unknown>) {
		const resolvedDependencies: Dependencies = {};
		for (const dependencyIdentifier in dependencies) {
			const dependency = this.parseDependency(dependencies[dependencyIdentifier]);
			if (dependency) {
				resolvedDependencies[dependencyIdentifier] = dependency;
			}
		}
		return resolvedDependencies;
	}

	private parseDependency(dependency: unknown): Package | undefined {
		try {
			assert(typeof dependency === "string");
			const [left, version] = dependency.split("@");
			const [scope, packagename] = left.split("/");
			const packageSemver = semver.parse(version);
			assert(packageSemver);
			return {
				scope,
				package: packagename,
				version: packageSemver,
			};
		} catch (error) {
			warn(`WallyResolver: Invalid Wally dependency`);
		}
	}

	public static fromPath(projectDir: string, wallyConfigFilePath: string) {
		const resolver = new WallyResolver(projectDir, wallyConfigFilePath);
		resolver.parseConfig(path.resolve(wallyConfigFilePath));
		return resolver;
	}

	public getFileForPackage(packageString: string) {
		const sharedIdentifier = WallyResolver.getIdentifierFromDependency(this.wallyFile.Dependencies, packageString);
		const serverIdentifier = WallyResolver.getIdentifierFromDependency(
			this.wallyFile.ServerDependencies,
			packageString,
		);
		const devIdentifier = WallyResolver.getIdentifierFromDependency(this.wallyFile.DevDependencies, packageString);
		const realmDir =
			(sharedIdentifier ? this.dependenciesDirectory : undefined) ||
			(serverIdentifier ? this.serverDependenciesDirectory : undefined) ||
			(devIdentifier ? this.devDependenciesDirectory : undefined);
		const identifier = sharedIdentifier || serverIdentifier || devIdentifier;

		return identifier && realmDir ? path.join(realmDir, `${identifier}.lua`) : undefined;
	}

	private static getIdentifierFromDependency(dependencyies: Dependencies, packageString: string) {
		for (const [identifier, dependency] of Object.entries(dependencyies)) {
			if (dependency) {
				if (packageString.toLowerCase() === `@rbxtswally/${dependency.scope}_${dependency.package}`) {
					return identifier;
				}
			}
		}
	}
}
