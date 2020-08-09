import ts from "byots";
import yargs from "yargs";
import { RojoResolver } from "Shared/classes/RojoResolver";
import { assert } from "Shared/util/assert";

export = ts.identity<yargs.CommandModule<{}, {}>>({
	command: "rojo",
	describe: "test",
	builder: () => yargs.strict(false),
	handler: argv => {
		const rojoConfigFilePath = RojoResolver.findRojoConfigFilePath(process.cwd());
		assert(rojoConfigFilePath);
		const rojoResolver = RojoResolver.fromPath(rojoConfigFilePath);
		console.log(rojoResolver.getRbxPathFromFilePath(argv._[1]));
	},
});
