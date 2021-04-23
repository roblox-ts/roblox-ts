import ts from "byots";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { TransformerPluginConfig } from "Shared/types";

export function getPluginConfigs(tsConfigPath: string) {
	const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
	if (configFile.error) {
		throw new ProjectError(configFile.error.messageText.toString());
	}

	const pluginConfigs = new Array<TransformerPluginConfig>();
	const config = configFile.config;
	const plugins = config.compilerOptions?.plugins;
	if (plugins && Array.isArray(plugins)) {
		for (const pluginConfig of plugins) {
			if (pluginConfig.transform && typeof pluginConfig.transform === "string") {
				pluginConfigs.push(pluginConfig);
			}
		}
	}

	if (config.extends) {
		const extendedPath = require.resolve(config.extends, {
			paths: [path.dirname(tsConfigPath)],
		});
		pluginConfigs.push(...getPluginConfigs(extendedPath));
	}

	return pluginConfigs;
}
