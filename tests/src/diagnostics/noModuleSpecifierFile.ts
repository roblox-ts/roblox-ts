// @ts-expect-error
import { x } from "packageThatDoesNotExist";
print(x);

const modulePath = "./module";
$getModuleTree(modulePath);
