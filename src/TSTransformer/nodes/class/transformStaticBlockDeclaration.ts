import { TransformState } from "TSTransformer/classes/TransformState";
import ts, { DoStatement } from "typescript";
import { transformBlock } from "../statements/transformBlock";

export function transformStaticBlockDeclaration(state: TransformState, node: ts.ClassStaticBlockDeclaration) {
	state.isInStaticBlockDeclaration = true;
	const block = transformBlock(state, node.body);
	state.isInStaticBlockDeclaration = false;

	return block;
}
