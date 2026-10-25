import luau from "@roblox-ts/luau-ast";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import ts from "typescript";

/**
 * Returns the innermost `switch` statement between `node` and the loop a `continue` targets.
 *
 * The search starts above `node`, so a `switch` statement can ask for the `switch` statement
 * enclosing it by passing itself.
 */
function findEnclosingSwitch(node: ts.Node) {
	let switchStatement: ts.SwitchStatement | undefined;

	ts.findAncestor(node.parent, ancestor => {
		if (ts.isSwitchStatement(ancestor)) {
			switchStatement = ancestor;
			return true;
		}

		// a loop owns the statements that continue it, and a function body cannot continue an outer loop
		return ts.isIterationStatement(ancestor, false) || ts.isFunctionLikeDeclaration(ancestor);
	});

	return switchStatement;
}

/**
 * Creates the statements that continue the loop enclosing `node`.
 *
 * A `switch` statement compiles to `repeat ... until true`, which Luau's `continue` targets instead
 * of the loop. Crossing a `switch` statement raises its continue flag and breaks out of that
 * `repeat`; `transformSwitchStatement` resumes the escape after `until true`.
 */
export function createContinueStatements(state: TransformState, node: ts.Node): luau.List<luau.Statement> {
	const switchStatement = findEnclosingSwitch(node);
	if (!switchStatement) {
		return luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {}));
	}

	// one flag per switch statement, shared by every continue that crosses it
	const continueFlagId = getOrSetDefault(state.switchContinueFlags, switchStatement, () => luau.tempId("continue"));

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.Assignment, {
			left: continueFlagId,
			operator: "=",
			right: luau.bool(true),
		}),
		luau.create(luau.SyntaxKind.BreakStatement, {}),
	);
}
