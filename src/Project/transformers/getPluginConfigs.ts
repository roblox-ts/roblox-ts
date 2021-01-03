import ts from "byots";
import { ProjectError } from "Shared/errors/ProjectError";
import { TransformerPluginConfig } from "Shared/types";

export function getPluginConfigs(tsConfigPath: string) {
	const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
	if (configFile.error) {
		throw new ProjectError(configFile.error.messageText.toString());
	}

	const pluginConfigs = new Array<TransformerPluginConfig>();
	const plugins = configFile.config.compilerOptions.plugins;
	if (plugins && Array.isArray(plugins)) {
		for (const pluginConfig of plugins) {
			if (pluginConfig.transform && typeof pluginConfig.transform === "string") {
				pluginConfigs.push(pluginConfig);
			}
		}
	}

	return pluginConfigs;
}
