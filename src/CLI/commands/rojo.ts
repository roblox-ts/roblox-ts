import ts from "byots";
import yargs from "yargs";
import { RojoResolver } from "Shared/classes/RojoResolver";
import { assert } from "Shared/util/assert";

export = ts.identity<yargs.CommandModule<{}, {}>>({
	command: "rojo",
	describe: "test",
	handler: () => {
		const rojoConfigFilePath = RojoResolver.findRojoConfigFilePath(process.cwd());
		assert(rojoConfigFilePath);
		const rojoResolver = new RojoResolver(rojoConfigFilePath);
	},
});
