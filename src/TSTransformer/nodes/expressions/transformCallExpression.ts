import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformImportExpression } from "TSTransformer/nodes/expressions/transformImportExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import {
	commutes,
	computeMacroCaptures,
	decideOrderedCaptures,
	OrderedOperand,
	summarizeExpression,
	summarizeStatements,
	tagValueRegion,
} from "TSTransformer/util/effects";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isMethod } from "TSTransformer/util/isMethod";
import { getFirstDefinedSymbol, isPossiblyType, isRobloxType, isUndefinedType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

function runCallMacro(
	macro: CallMacro | PropertyCallMacro,
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
): luau.Expression {
	// Each operand is transformed into prerequisite statements plus result expressions
	// (a spread contributes multiple results). TS evaluates operands left-to-right; an
	// operand result is captured at its original position when deferring it to the
	// consumption point is observable (see decideOrderedCaptures). The operands are then
	// handed to the macro, whose usage of them determines any further captures (see the
	// trial-run analysis below).
	interface OperandInfo extends OrderedOperand {
		expressions: Array<luau.Expression>;
		node?: ts.Expression;
	}

	const operands = new Array<OperandInfo>();
	for (const nodeArg of nodeArguments) {
		const [argExp, prereqs] = state.capture(() => transformExpression(state, nodeArg));
		operands.push({ expressions: [argExp], prereqs, node: nodeArg });
	}

	const lastArg = nodeArguments[nodeArguments.length - 1];
	if (lastArg && ts.isSpreadElement(lastArg)) {
		const signature = state.typeChecker.getSignaturesOfType(
			state.getType(node.expression),
			ts.SignatureKind.Call,
		)[0];

		const lastParameter = signature.parameters[signature.parameters.length - 1].valueDeclaration;
		if (lastParameter && ts.isParameter(lastParameter) && lastParameter.dotDotDotToken) {
			DiagnosticService.addDiagnostic(errors.noVarArgsMacroSpread(lastArg));
			return luau.none();
		}

		// use .expression for the tuple type, simply `lastArg` would give the tuple's element type
		const tupleArgType = state.getType(lastArg.expression);
		// Since we've excluded vararg macros, TS will have ensured that the spread is from a tuple type
		assert(state.typeChecker.isTupleType(tupleArgType));
		const argumentCount = (tupleArgType as ts.TupleTypeReference).target.elementFlags.length;

		// unpack the spread into temporaries as part of the spread operand's prereqs;
		// evaluating the spread expression happens inside this declaration, so earlier
		// operands are ordered against it like any other prerequisite statement
		const spreadOperand = operands[operands.length - 1];
		const spreadExp = spreadOperand.expressions.pop();
		const tempIds = luau.list.make<luau.TemporaryIdentifier>();
		const explicitArgumentCount = nodeArguments.length - 1;
		for (let i = 0; i < argumentCount; i++) {
			const tempId = luau.tempId(`spread${explicitArgumentCount + i}`);
			spreadOperand.expressions.push(tempId);
			luau.list.push(tempIds, tempId);
		}
		luau.list.push(
			spreadOperand.prereqs,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: tempIds,
				right: spreadExp,
			}),
		);
		spreadOperand.node = undefined;
	}

	// the object expression is evaluated before the arguments; its prereqs have already
	// been emitted by the caller, so it participates only as a deferred result expression
	let nodeExpression = node.expression;
	if (ts.isPropertyAccessExpression(nodeExpression) || ts.isElementAccessExpression(nodeExpression)) {
		nodeExpression = nodeExpression.expression;
	}
	operands.unshift({ expressions: [expression], prereqs: luau.list.make(), node: nodeExpression });

	// record each operand value's heap region so the macro's member accesses through it
	// (which have no source nodes) classify by base; tags survive the macro's clones
	for (const operand of operands) {
		if (operand.node !== undefined) {
			for (const operandExpression of operand.expressions) {
				tagValueRegion(state, operandExpression, operand.node);
			}
		}
	}

	const operandCaptures = decideOrderedCaptures(state, operands);

	const args = new Array<luau.Expression>();
	for (let i = 0; i < operands.length; i++) {
		const operand = operands[i];
		state.prereqList(operand.prereqs);
		for (let j = 0; j < operand.expressions.length; j++) {
			let value = operand.expressions[j];
			if (operandCaptures[i][j]) {
				value = state.pushToVar(value, valueToIdStr(value) || (i === 0 ? "exp" : `arg${i - 1}`));
			}
			operand.expressions[j] = value;
			if (i > 0) {
				args.push(value);
			}
		}
	}
	expression = operands[0].expressions[0];

	// The macro decides how to embed the operands, but the driver decides evaluation order:
	// trial-run the macro to observe how each operand is actually used, capture the ones
	// that would otherwise be re-evaluated or evaluated out of order, then run the macro for
	// real with those operands replaced by temporaries. The macro's transform never has to
	// reason about ordering, and only the operands that genuinely need a temporary get one.
	// (PropertyCallMacro's node parameter is a refinement of CallMacro's; the macro was
	// selected for this node, so the wider signature is safe to call through.)
	const macroFn = macro as CallMacro;
	const operandExpressions = [expression, ...args];
	// operands must be tagged (inside computeMacroCaptures) before the trial run so that any
	// clones the macro makes of a reused operand carry the tag; the trial output is discarded
	const captures = computeMacroCaptures(state, operandExpressions, () =>
		DiagnosticService.suppressed(() => state.capture(() => macroFn(state, node, expression, args.slice()))),
	);
	for (let i = 0; i < operandExpressions.length; i++) {
		if (captures[i]) {
			operandExpressions[i] = state.pushToVar(
				operandExpressions[i],
				valueToIdStr(operandExpressions[i]) || (i === 0 ? "exp" : `arg${i - 1}`),
			);
		}
	}
	expression = operandExpressions[0];
	const finalArgs = operandExpressions.slice(1);

	return wrapReturnIfLuaTuple(state, node, macroFn(state, node, expression, finalArgs));
}

function stabilizeBeforePrereqs(
	state: TransformState,
	expression: luau.Expression,
	node: ts.Expression,
	prereqs: luau.List<luau.Statement>,
	name?: string,
) {
	if (!commutes(summarizeExpression(state, expression, node), summarizeStatements(state, prereqs))) {
		expression = state.pushToVar(expression, name);
	}
	state.prereqList(prereqs);
	return expression;
}

/**
 * Some C functions like `tonumber()` will error if the given argument is a function that returns nothing.
 * i.e.
 * ```lua
 * local function foo()
 * end
 * local x = tonumber(foo()) -- error!
 * ```
 *
 * To protect against this, we can wrap possibly-undefined arguments with `()` to coerce the values to `nil`
 */
function fixVoidArgumentsForRobloxFunctions(
	state: TransformState,
	type: ts.Type,
	args: Array<luau.Expression>,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (isPossiblyType(type, isRobloxType(state))) {
		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			const nodeArg = nodeArguments[i];
			if (ts.isCallExpression(nodeArg) && isPossiblyType(state.getType(nodeArg), isUndefinedType)) {
				args[i] = luau.create(luau.SyntaxKind.ParenthesizedExpression, {
					expression: arg,
				});
			}
		}
	}
}

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (ts.isImportCall(node)) {
		return transformImportExpression(state, node);
	}

	// a in a()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperCall(node)) {
		return luau.call(luau.property(convertToIndexableExpression(expression), "constructor"), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getCallMacro(symbol);
		if (macro) {
			return runCallMacro(macro, state, node, expression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	expression = stabilizeBeforePrereqs(state, expression, node.expression, prereqs, "fn");

	const exp = luau.call(convertToIndexableExpression(expression), args);

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformPropertyCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: ts.PropertyAccessExpression,
	baseExpression: luau.Expression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	// a in a.b()
	validateNotAnyType(state, expression.expression);
	// a.b in a.b()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		return luau.call(luau.property(convertToIndexableExpression(baseExpression), expression.name.text), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	baseExpression = stabilizeBeforePrereqs(state, baseExpression, expression.expression, prereqs);

	let exp: luau.Expression;
	if (isMethod(state, expression)) {
		// check that the name isn't a Luau keyword
		// if it is, we need to use PropertyAccessExpression and manually add the self argument
		if (luau.isValidIdentifier(name)) {
			exp = luau.create(luau.SyntaxKind.MethodCallExpression, {
				name,
				expression: convertToIndexableExpression(baseExpression),
				args: luau.list.make(...args),
			});
		} else {
			baseExpression = state.pushToVarIfComplex(baseExpression);
			args.unshift(baseExpression);
			exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
		}
	} else {
		// PropertyAccessExpression will wrap the identifier for us if necessary
		exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
	}

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformElementCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: ts.ElementAccessExpression,
	baseExpression: luau.Expression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	// a in a[b]()
	validateNotAnyType(state, expression.expression);
	// b in a[b]()
	validateNotAnyType(state, expression.argumentExpression);
	// a[b] in a[b]()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		return luau.call(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(baseExpression),
				index: transformExpression(state, expression.argumentExpression),
			}),
			[luau.globals.self, ...ensureTransformOrder(state, node.arguments)],
		);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [[argumentExp, ...args], prereqs] = state.capture(() =>
		ensureTransformOrder(state, [argumentExpression, ...nodeArguments]),
	);

	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	baseExpression = stabilizeBeforePrereqs(state, baseExpression, expression.expression, prereqs);

	if (isMethod(state, expression)) {
		baseExpression = state.pushToVarIfComplex(baseExpression);
		args.unshift(baseExpression);
	}

	const exp = luau.call(
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(baseExpression),
			index: addOneIfArrayType(
				state,
				state.typeChecker.getNonOptionalType(state.getType(expression.expression)),
				argumentExp,
			),
		}),
		args,
	);

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}
