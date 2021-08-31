import {} from "ts-expose-internals"; // inject ts internal typings
export * from "Project";
export { COMPILER_VERSION } from "Shared/constants";
import "CLI/util/patchFs";
