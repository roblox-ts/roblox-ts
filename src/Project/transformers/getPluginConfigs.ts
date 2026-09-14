import { getExtendedConfigPaths } from "Project/functions/getExtendedConfigPaths";
import { ProjectError } from "Shared/errors/ProjectError";
import { TransformerPluginConfig } from "Shared/types";
import ts from "typescript";

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

	for (const extendedPath of getExtendedConfigPaths(tsConfigPath, config.extends)) {
		pluginConfigs.push(...getPluginConfigs(extendedPath));
	}

	return pluginConfigs;
}
