import { ServerScriptService } from "@rbxts/services";
import TestEZ from "@rbxts/testez";

const results = TestEZ.TestBootstrap.run([ ServerScriptService.tests ]);
if (results.errors.size() > 0 || results.failureCount > 0) {
	error("Tests failed!");
}
