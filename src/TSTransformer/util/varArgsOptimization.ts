import luau from "@roblox-ts/luau-ast";
import { AnyIdentifier } from "@roblox-ts/luau-ast/out/LuauAST/bundle";
import { TransformState } from "TSTransformer/classes/TransformState";
import { offset } from "TSTransformer/util/offset";
import { skipDownwards, skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts, { Node, TypeFlags } from "typescript";

export interface VarArgsData {
	valueDeclaration: Node;
	id: luau.AnyIdentifier;
	useLengthVar: boolean;
	/** Note: if useLengthVar, will exist after handleVarArgsParameterOptimization */
	lengthId?: luau.AnyIdentifier;
}

export function analyzeVarArgsOptimization(
	state: TransformState,
	body: NonNullable<ts.FunctionLikeDeclarationBase["body"]>,
	parameter: ts.ParameterDeclaration,
	paramId: AnyIdentifier,
): VarArgsData | undefined {
	// If the parent is a generator function, it is never safe
	// (Note: technically body.parent won't always be a FunctionDeclaration)
	if ((body.parent as ts.FunctionDeclaration).asteriskToken !== undefined) return;
	// Track whether the var args parameter is being shadowed by a nested function's parameters
	// Note that we don't need to track variables defined in inner scopes because we only analyze parameters
	let numShadows = 0;
	const shadowedStack = new Array<boolean>();
	function pushVarArgs(name: string) {
		const shadowed = name === paramId.name;
		shadowedStack.push(shadowed);
		if (shadowed) numShadows++;
	}
	function pushNoVarArgs() {
		shadowedStack.push(false);
	}
	function popVarArgs() {
		const shadowed = shadowedStack.pop();
		if (shadowed) numShadows--;
	}
	let tryDepth = 0;
	/** Check to see if the identifier refers to a var args of the top-level function that we're analyzing - but also returns false if it's unsafe (due to being an upvalue). */
	function isIdentifierVarArgs(identifier: ts.Identifier) {
		// Filter out non-parameters
		const symbol = state.typeChecker.getSymbolAtLocation(identifier);
		if (!symbol || !symbol.valueDeclaration || symbol.valueDeclaration.kind !== ts.SyntaxKind.Parameter) {
			return false;
		}
		if (identifier.getText() !== paramId.name) {
			return false;
		}
		if (numShadows > 0) {
			return false; // this variable belongs to a nested function
		}
		if (shadowedStack.length > 0 || tryDepth > 0) {
			// our varArgs is being accessed as an upvalue
			unsafe = true;
			return false;
		}
		return true;
	}

	let sizeAccesses = 0;
	// determine if there are any unsafe-for-optimization usages of paramId (described below as `args`)
	let unsafe = false;
	function visit(node: Node) {
		if (unsafe) return;
		if (ts.isIdentifier(node)) {
			if (!isIdentifierVarArgs(node)) {
				return;
			}
			// note: in `(args as number[]) = 5`, the identifier isn't considered an assignment target (unlike in `args = [5]`), hence the `skipUpwards(node)` in the next line
			if (ts.isAssignmentTarget(skipUpwards(node))) {
				// `args = `
				// In the future we could use optimizations up to this point
				unsafe = true;
				return;
			}
			// if it's `...args`, we can ignore it (we'll deal with it later)
			const top = skipUpwards(node);
			const parent = top.parent;
			if (ts.isSpreadElement(parent)) {
				return;
			}

			// check for `y = args` (via VariableDeclaration or BinaryExpression)
			if (ts.isVariableDeclaration(parent)) {
				// we already checked if it's an assignment target, implying that this is `y = args`, not `args = y`
				unsafe = true;
				return;
			} else if (ts.isBinaryExpression(parent)) {
				// this could be `args = y` or `y = args`; both are unsafe
				unsafe = true;
				return;
			}

			// check for passing args as an argument
			if (ts.isCallExpression(parent)) {
				unsafe = true;
				return;
			}
			// check if it's the target of a forOf expression
			if (ts.isForOfStatement(parent)) {
				// we could check to see if parent.expression === skipUpwards(node), but since we've already checked isAssignmentTarget (which covers if `args` is used in the initializer), that's the only possibility
				sizeAccesses++;
				return;
			}
			// Other uses are presumed unsafe
			// Known cases: return
			unsafe = true;
			return;
		} else if (ts.isTypeQueryNode(node) || ts.isTypeAlias(node) || ts.isInterfaceDeclaration(node)) {
			// Types & type queries (like `typeof args`) don't affect safety
			return;
		} else if (ts.isPropertyAccessExpression(node)) {
			// if it's not `args.___`, ignore it
			const expression = skipDownwards(node.expression);
			if (!ts.isIdentifier(expression) || !isIdentifierVarArgs(expression)) {
				node.forEachChild(visit); // args could be inside a nested expression
				return;
			}
			if (ts.isAssignmentTarget(node)) {
				unsafe = true;
				return;
			}
			// safe accesses include "size"
			const type = state.getType(node.name);
			const symbol = getFirstDefinedSymbol(state, type);
			if (!symbol || symbol.escapedName !== "size") {
				unsafe = true;
				return;
			}
			sizeAccesses++;
		} else if (ts.isElementAccessExpression(node)) {
			// if it's not `args[]`, ignore it
			const expression = skipDownwards(node.expression);
			if (!ts.isIdentifier(expression) || !isIdentifierVarArgs(expression)) {
				node.forEachChild(visit); // args could be inside a nested expression
				return;
			}
			if (ts.isAssignmentTarget(node)) {
				unsafe = true;
				return;
			}
			// Note: a NumberLiteral is not a Number for some reason
			const type = state.getType(node.argumentExpression);
			const okay =
				type.flags & (TypeFlags.Number | TypeFlags.NumberLiteral) ||
				(type.isStringLiteral() && type.value === "size");
			if (!okay) {
				unsafe = true;
				return;
			}
		} else if (ts.isFunctionLikeDeclaration(node)) {
			const varArgs = node.parameters.find(value => value.dotDotDotToken !== undefined);
			if (varArgs) {
				pushVarArgs(varArgs.name.getText());
			} else {
				pushNoVarArgs();
			}
			node.forEachChild(visit);
			popVarArgs();
		} else if (ts.isTryStatement(node)) {
			tryDepth++;
			node.forEachChild(visit);
			tryDepth--;
		} else {
			node.forEachChild(visit);
		}
	}
	visit(body);
	if (unsafe) return;
	return {
		id: paramId,
		valueDeclaration: parameter.symbol.valueDeclaration!,
		useLengthVar: sizeAccesses > 1,
	};
}

// Declare some commonly used lua fragments
const varArgsLiteral = luau.create(luau.SyntaxKind.VarArgsLiteral, {});
export const selectLengthCall = luau.call(luau.globals.select, [luau.string("#"), varArgsLiteral]);
const selectArg0 = luau.create(luau.SyntaxKind.ParenthesizedExpression, {
	expression: varArgsLiteral,
});
const oneLiteral = luau.number(1);

/** Handle the optimization (or lack thereof) for a var args parameter (meant for use by transformParameters) */
export function handleVarArgsParameterOptimization(
	statements: luau.List<luau.Statement>,
	varArgs: VarArgsData | undefined,
	paramId: luau.AnyIdentifier,
) {
	if (varArgs) {
		if (varArgs.useLengthVar) {
			varArgs.lengthId = luau.tempId(`${varArgs.id.name}_length`);
			// `_args_length = select("#", ...)`
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: varArgs.lengthId,
					right: selectLengthCall,
				}),
			);
		}
	} else {
		// `local args = {...}`
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: paramId,
				right: luau.create(luau.SyntaxKind.Array, {
					members: luau.list.make(luau.create(luau.SyntaxKind.VarArgsLiteral, {})),
				}),
			}),
		);
	}
}

export function tryHandleVarArgsCallMacro(state: TransformState, callExpr: ts.CallExpression, macroSymbol: ts.Symbol) {
	const expr = callExpr.expression;
	if (!ts.isPropertyAccessExpression(expr) && !ts.isElementAccessExpression(expr)) return;
	const varArgs = state.getOptimizableVarArgsData(expr.expression);
	if (!varArgs) return;
	if (macroSymbol.name === "size") {
		return varArgs.lengthId ?? selectLengthCall;
	}
	// Note: could support things like indexOf and other read/search functions (would also need to update analyzeVarArgsOptimization)
}

export function tryHandleVarArgsIndexableExpression(
	state: TransformState,
	node: ts.ElementAccessExpression,
	index: luau.Expression,
) {
	const varArgs = state.getOptimizableVarArgsData(node.expression);
	if (!varArgs) return;
	/* Transformations:
	args[0] -> (...)
	args[1] -> (select(2, ...))
	args[expr] -> (select(expr + 1, ...))

	(Theoretically this function could be called for cases like `args[0] = ` or `args["pop"]()`, but these aren't optimizable, so varArgs would be undefined)
	*/
	const argExpr = node.argumentExpression;
	let argsIndex;
	if (ts.isNumericLiteral(argExpr)) {
		const num = (state.typeChecker.getTypeAtLocation(argExpr) as ts.NumberLiteralType).value;
		if (num === 0) return selectArg0;
		argsIndex = luau.number(num + 1);
	} else {
		argsIndex = offset(index, 1);
	}
	return luau.create(luau.SyntaxKind.ParenthesizedExpression, {
		expression: luau.call(luau.globals.select, [argsIndex, varArgsLiteral]),
	});
}

export function tryHandleVarArgsArraySpread(state: TransformState, node: ts.SpreadElement) {
	const varArgs = state.getOptimizableVarArgsData(node.expression);
	return varArgs ? varArgsLiteral : undefined;
}

export function varArgsForOfGetFirstStatementValue(indexId: luau.AnyIdentifier) {
	return luau.call(luau.globals.select, [indexId, varArgsLiteral]);
}

export function transformVarArgsForOfResult(
	state: TransformState,
	node: ts.ForOfStatement,
	result: luau.List<luau.Statement>,
) {
	const varArgs = state.getOptimizableVarArgsData(node.expression);
	if (!varArgs) return result;

	// `result` contains a ForStatement; we want to convert it to a numeric for
	// Find it:
	let lNode = result.head!;
	let forNode: luau.ForStatement;
	while (true) {
		if (lNode.value.kind === luau.SyntaxKind.ForStatement) {
			forNode = lNode.value;
			break;
		}
		lNode = lNode.next!;
	}

	const ids = forNode.ids;
	let indexId = ids.head!.value;
	const valueId = ids.tail!.value;
	if (indexId.name === "") {
		indexId = luau.tempId("i");
	}
	const statements = forNode.statements;
	luau.list.unshift(
		statements,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: valueId,
			right: luau.call(luau.globals.select, [indexId, varArgsLiteral]),
		}),
	);

	// Convert lNode to numeric for
	Object.assign(
		lNode.value,
		luau.create(luau.SyntaxKind.NumericForStatement, {
			id: indexId,
			start: oneLiteral,
			end: varArgs.lengthId ?? selectLengthCall,
			step: undefined,
			statements,
		}),
	);

	return result;
}
