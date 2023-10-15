import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export function isSymbolFromRobloxTypes(state: TransformState, symbol: ts.Symbol | undefined) {
	const filePath = symbol?.valueDeclaration?.getSourceFile()?.fileName;
	const typesPath = path.join(state.data.nodeModulesPath, RBXTS_SCOPE, "types");
	return filePath !== undefined && isPathDescendantOf(filePath, typesPath);
}
