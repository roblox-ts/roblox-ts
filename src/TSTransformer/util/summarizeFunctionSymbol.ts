import { TransformState } from "TSTransformer";
import {
	CALLS_UNKNOWN_SUMMARY,
	EffectSummary,
	HEAP_ALL,
	HEAP_TABLES,
	PURE_SUMMARY,
	summarizeKnownConstruction,
	summarizeKnownEngineCall,
	summarizeMemberRead,
	summarizeMemberWrite,
	unionSummaries,
} from "TSTransformer/util/effects";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { isAncestorOf, skipDownwards } from "TSTransformer/util/traversal";
import {
	isArrayType,
	isBooleanType,
	isDefinitelyType,
	isFunctionReturningPrimitive,
	isMapType,
	isNumberType,
	isSetType,
	isStringType,
	isUndefinedType,
} from "TSTransformer/util/types";
import ts from "typescript";

/** What the analysis knows about calling an immutably-bound, statically-known function. */
export interface FunctionSymbolInfo {
	readonly summary: EffectSummary;
	/** every TS call signature definitely returns a primitive (see `isFunctionReturningPrimitive`) */
	readonly returnsPrimitive: boolean;
}

/**
 * Computes an effect summary for calling a function whose body is statically known: a
 * function declaration, or a `const`-declared arrow/function expression. Returns
 * `undefined` when the callee cannot be analyzed (mutable binding, no body, async,
 * generator, or an unsupported construct in the body — anything not explicitly understood
 * makes the whole body summarize to unknown code, which callers treat like `undefined`).
 *
 * The summary describes what the *emitted Luau* for the body may do, in the same terms as
 * `summarizeExpression`: parameters and locals declared inside the function are compiler-
 * invisible; reads/writes of outer mutable bindings are recorded by name — or as heap
 * accesses when the binding is exported, since those are emitted as exports-table accesses;
 * property and element accesses are heap reads/writes that may throw.
 *
 * Like `markConstIdentifier`, this relies on function-declaration bindings never being
 * reassigned (roblox-ts's existing const-ness model via `isSymbolMutable` treats them as
 * immutable), and `const` bindings are immutable by the language.
 *
 * Results are cached per symbol for the compilation step. Recursion is handled as a least
 * fixpoint: a call to a function currently being analyzed contributes nothing extra (its
 * effects are exactly the union being accumulated), and results that depended on such an
 * in-progress summary are only cached at the root of the analysis, where the fixpoint is
 * complete.
 */
export function getFunctionSymbolInfo(state: TransformState, symbol: ts.Symbol): FunctionSymbolInfo | undefined {
	if (symbol.flags & ts.SymbolFlags.Alias) {
		symbol = state.typeChecker.getAliasedSymbol(symbol);
	}

	const cache = state.multiTransformState.functionSymbolSummaryCache;
	const cached = cache.get(symbol);
	if (cached !== undefined) {
		return cached === false ? undefined : cached;
	}

	if (pendingSymbols.has(symbol)) {
		// self/mutual recursion: the pending function's effects are already being unioned
		sawPendingSymbol = true;
		return RECURSION_PENDING_INFO;
	}

	const func = getAnalyzableFunction(state, symbol);
	if (func === undefined) {
		cache.set(symbol, false);
		return undefined;
	}

	pendingSymbols.add(symbol);
	const outerSawPending = sawPendingSymbol;
	sawPendingSymbol = false;
	let dependedOnPending = true;
	let info: FunctionSymbolInfo;
	try {
		const summary = summarizeFunctionBody(state, func);
		info = {
			summary,
			returnsPrimitive: isFunctionReturningPrimitive(state.typeChecker.getTypeOfSymbolAtLocation(symbol, func)),
		};
		dependedOnPending = sawPendingSymbol;
	} finally {
		pendingSymbols.delete(symbol);
		sawPendingSymbol = outerSawPending || (dependedOnPending && pendingSymbols.size > 0);
	}
	// a result computed while some enclosing analysis is still pending may be a partial
	// fixpoint — usable by that analysis, but not cacheable
	if (!dependedOnPending || pendingSymbols.size === 0) {
		cache.set(symbol, info);
	}
	return info;
}

const RECURSION_PENDING_INFO: FunctionSymbolInfo = { summary: PURE_SUMMARY, returnsPrimitive: false };

/**
 * Body summary for a function-literal expression (an inline arrow/function expression that
 * is not bound to any symbol — e.g. a callback argument). Same terms as
 * `getFunctionSymbolInfo`; `undefined` for async/generator/bodyless functions.
 */
export function getFunctionExpressionSummary(
	state: TransformState,
	node: ts.ArrowFunction | ts.FunctionExpression,
): EffectSummary | undefined {
	if (node.asteriskToken !== undefined || ts.hasSyntacticModifier(node, ts.ModifierFlags.Async)) {
		return undefined;
	}
	if (node.body === undefined) {
		return undefined;
	}
	return summarizeFunctionBody(state, node as AnalyzableFunction);
}

const pendingSymbols = new Set<ts.Symbol>();
let sawPendingSymbol = false;

type AnalyzableFunction = (ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression) & {
	body: ts.ConciseBody;
};

function getAnalyzableFunction(state: TransformState, symbol: ts.Symbol): AnalyzableFunction | undefined {
	if (isSymbolMutable(state, symbol)) {
		return undefined;
	}
	const declaration = symbol.valueDeclaration;
	if (declaration === undefined) {
		return undefined;
	}

	let func: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
	if (ts.isFunctionDeclaration(declaration)) {
		// overload signatures have no body; multiple *bodied* declarations cannot merge
		if (declaration.body === undefined) {
			return undefined;
		}
		func = declaration;
	} else if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
		const initializer = skipDownwards(declaration.initializer);
		if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) {
			return undefined;
		}
		func = initializer;
	} else {
		return undefined;
	}

	// async bodies schedule work (Promise machinery); generator bodies run lazily
	if (func.asteriskToken !== undefined || ts.hasSyntacticModifier(func, ts.ModifierFlags.Async)) {
		return undefined;
	}
	return func.body !== undefined ? (func as AnalyzableFunction) : undefined;
}

// analysis gives up on very large bodies rather than walking them in full
const ANALYSIS_NODE_BUDGET = 2000;

// the exports table, iterated containers, spread sources, and metatable walks are all Lua tables
const READS_TABLES_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_TABLES };
const READS_ALL_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_ALL, throws: true };
const THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, throws: true };

// call macros that only evaluate their arguments (no other observable behavior); `assert`
// is handled separately (it throws). Keep in sync with CALL_MACROS in macros/callMacros.ts
// when adding a macro.
const PURE_CALL_MACROS = new Set(["typeOf", "typeIs", "classIs", "identity", "$range", "$tuple", "$getModuleTree"]);

function summarizeFunctionBody(state: TransformState, func: AnalyzableFunction): EffectSummary {
	let fuel = ANALYSIS_NODE_BUDGET;

	/** symbols declared inside the function compile to locals invisible outside it */
	const isInternal = (symbol: ts.Symbol): boolean => {
		const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
		return declaration !== undefined && isAncestorOf(func, declaration);
	};

	const readIdentifier = (node: ts.Identifier): EffectSummary => {
		const symbol = state.typeChecker.getSymbolAtLocation(node);
		if (symbol === undefined) {
			return CALLS_UNKNOWN_SUMMARY;
		}
		if (state.typeChecker.isUndefinedSymbol(symbol) || isInternal(symbol) || !isSymbolMutable(state, symbol)) {
			return PURE_SUMMARY;
		}
		// outer mutable binding: an exports-table read if exported, else a plain local read
		if (state.isExportsTableBinding(symbol)) {
			return READS_TABLES_SUMMARY;
		}
		return { ...PURE_SUMMARY, readsLocals: new Set([node.text]) };
	};

	const writeIdentifier = (node: ts.Identifier): EffectSummary => {
		const symbol = state.typeChecker.getSymbolAtLocation(node);
		if (symbol === undefined) {
			return CALLS_UNKNOWN_SUMMARY;
		}
		if (isInternal(symbol)) {
			return PURE_SUMMARY;
		}
		// outer binding write: an exports-table write if exported, else a plain local write
		if (state.isExportsTableBinding(symbol)) {
			return { ...PURE_SUMMARY, writesHeap: HEAP_TABLES };
		}
		return { ...PURE_SUMMARY, writesLocals: new Set([node.text]) };
	};

	/** the write side of an assignment target (the read side, for compound ops, is separate) */
	const writeTarget = (node: ts.Expression): EffectSummary => {
		const target = skipDownwards(node);
		if (ts.isIdentifier(target)) {
			return writeIdentifier(target);
		}
		if (ts.isPropertyAccessExpression(target)) {
			return unionSummaries(visit(target.expression), summarizeMemberWrite(state, target.expression));
		}
		if (ts.isElementAccessExpression(target)) {
			return unionSummaries(
				unionSummaries(visit(target.expression), visit(target.argumentExpression)),
				summarizeMemberWrite(state, target.expression),
			);
		}
		// destructuring assignment targets, etc.
		return CALLS_UNKNOWN_SUMMARY;
	};

	const visitBindingName = (name: ts.BindingName): EffectSummary => {
		if (ts.isIdentifier(name)) {
			return PURE_SUMMARY; // declares an internal local
		}
		// destructuring: reads through the bound value, may throw on nil; default-value
		// initializers evaluate as part of it
		let result = READS_ALL_THROWS_SUMMARY;
		for (const element of name.elements) {
			if (ts.isOmittedExpression(element)) {
				continue;
			}
			if (element.propertyName !== undefined && ts.isComputedPropertyName(element.propertyName)) {
				result = unionSummaries(result, visit(element.propertyName.expression));
			}
			result = unionSummaries(result, visitBindingName(element.name));
			if (element.initializer !== undefined) {
				result = unionSummaries(result, visit(element.initializer));
			}
		}
		return result;
	};

	const visitVariableDeclarationList = (list: ts.VariableDeclarationList): EffectSummary => {
		let result = PURE_SUMMARY;
		for (const declaration of list.declarations) {
			result = unionSummaries(result, visitBindingName(declaration.name));
			if (declaration.initializer !== undefined) {
				result = unionSummaries(result, visit(declaration.initializer));
			}
		}
		return result;
	};

	const getCallMacroName = (callee: ts.Expression): string | undefined => {
		if (!ts.isIdentifier(callee)) {
			return undefined;
		}
		const symbol = state.typeChecker.getSymbolAtLocation(callee);
		if (symbol === undefined || state.services.macroManager.getCallMacro(symbol) === undefined) {
			return undefined;
		}
		return symbol.name;
	};

	const visitCall = (node: ts.CallExpression): EffectSummary => {
		let result = PURE_SUMMARY;
		for (const arg of node.arguments) {
			result = unionSummaries(result, visit(arg));
		}
		const callee = skipDownwards(node.expression);

		const macroName = getCallMacroName(callee);
		if (macroName !== undefined) {
			if (PURE_CALL_MACROS.has(macroName)) {
				return result;
			}
			if (macroName === "assert") {
				return unionSummaries(result, THROWS_SUMMARY);
			}
			return CALLS_UNKNOWN_SUMMARY;
		}

		if (ts.isIdentifier(callee)) {
			const symbol = state.typeChecker.getSymbolAtLocation(callee);
			if (symbol !== undefined) {
				const calleeInfo = getFunctionSymbolInfo(state, symbol);
				if (calleeInfo !== undefined) {
					// an analyzable callee is an immutable binding, so reading it is free
					return unionSummaries(result, calleeInfo.summary);
				}
			}
		}
		if (ts.isPropertyAccessExpression(callee)) {
			// tame engine calls: immutable data type methods/statics, read-only Instance methods
			const known = summarizeKnownEngineCall(state, callee);
			if (known !== undefined) {
				return unionSummaries(unionSummaries(result, visit(callee.expression)), known);
			}
		}
		return CALLS_UNKNOWN_SUMMARY;
	};

	const visitForOf = (node: ts.ForOfStatement): EffectSummary => {
		if (node.awaitModifier !== undefined) {
			return CALLS_UNKNOWN_SUMMARY;
		}
		let result = ts.isVariableDeclarationList(node.initializer)
			? visitVariableDeclarationList(node.initializer)
			: writeTarget(node.initializer);
		result = unionSummaries(result, visit(node.expression));
		result = unionSummaries(result, visit(node.statement));
		// iterating anything but a plain array/set/map/string (or $range) may invoke a user
		// iterator/generator
		const iterated = skipDownwards(node.expression);
		if (ts.isCallExpression(iterated) && getCallMacroName(skipDownwards(iterated.expression)) === "$range") {
			return result;
		}
		if (
			isDefinitelyType(
				state.getType(node.expression),
				isArrayType(state),
				isSetType(state),
				isMapType(state),
				isStringType,
			)
		) {
			return unionSummaries(result, READS_TABLES_SUMMARY);
		}
		return CALLS_UNKNOWN_SUMMARY;
	};

	const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
		kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

	const visit = (node: ts.Node): EffectSummary => {
		if (fuel-- <= 0) {
			return CALLS_UNKNOWN_SUMMARY;
		}

		// leaves
		if (
			ts.isStringLiteralLike(node) ||
			ts.isNumericLiteral(node) ||
			node.kind === ts.SyntaxKind.TrueKeyword ||
			node.kind === ts.SyntaxKind.FalseKeyword ||
			ts.isOmittedExpression(node) ||
			ts.isEmptyStatement(node) ||
			ts.isBreakStatement(node) ||
			ts.isContinueStatement(node)
		) {
			return PURE_SUMMARY;
		}
		if (ts.isIdentifier(node)) {
			return readIdentifier(node);
		}

		// transparent wrappers
		if (
			ts.isParenthesizedExpression(node) ||
			ts.isAsExpression(node) ||
			ts.isSatisfiesExpression(node) ||
			ts.isNonNullExpression(node) ||
			ts.isTypeAssertionExpression(node) ||
			ts.isVoidExpression(node)
		) {
			return visit(node.expression);
		}

		// expressions
		if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
			if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
				const operand = skipDownwards(node.operand);
				// read-modify-write of the operand
				if (ts.isIdentifier(operand)) {
					return unionSummaries(readIdentifier(operand), writeIdentifier(operand));
				}
				if (ts.isPropertyAccessExpression(operand) || ts.isElementAccessExpression(operand)) {
					return unionSummaries(visit(operand), summarizeMemberWrite(state, operand.expression));
				}
				return CALLS_UNKNOWN_SUMMARY;
			}
			return visit(node.operand);
		}
		if (ts.isBinaryExpression(node)) {
			const operator = node.operatorToken.kind;
			if (isAssignmentOperator(operator)) {
				let result = visit(node.right);
				result = unionSummaries(result, writeTarget(node.left));
				if (operator !== ts.SyntaxKind.EqualsToken) {
					// compound assignment also reads the target
					const target = skipDownwards(node.left);
					if (ts.isIdentifier(target)) {
						result = unionSummaries(result, readIdentifier(target));
					} else if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
						result = unionSummaries(result, summarizeMemberRead(state, target.expression));
					} else {
						result = unionSummaries(result, READS_ALL_THROWS_SUMMARY);
					}
				}
				return result;
			}
			const operands = unionSummaries(visit(node.left), visit(node.right));
			if (operator === ts.SyntaxKind.InstanceOfKeyword || operator === ts.SyntaxKind.InKeyword) {
				return unionSummaries(operands, READS_TABLES_SUMMARY);
			}
			// TS restricts remaining operators so they never invoke user metamethods
			return operands;
		}
		if (ts.isConditionalExpression(node)) {
			return unionSummaries(visit(node.condition), unionSummaries(visit(node.whenTrue), visit(node.whenFalse)));
		}
		if (ts.isPropertyAccessExpression(node)) {
			// getters do not exist in roblox-ts, so member reads never run user code
			return unionSummaries(visit(node.expression), summarizeMemberRead(state, node.expression));
		}
		if (ts.isElementAccessExpression(node)) {
			return unionSummaries(
				unionSummaries(visit(node.expression), visit(node.argumentExpression)),
				summarizeMemberRead(state, node.expression),
			);
		}
		if (ts.isCallExpression(node)) {
			return visitCall(node);
		}
		if (ts.isNewExpression(node)) {
			const known = summarizeKnownConstruction(state, node);
			if (known !== undefined) {
				let result = known;
				for (const arg of node.arguments ?? []) {
					result = unionSummaries(result, visit(arg));
				}
				return result;
			}
			return CALLS_UNKNOWN_SUMMARY;
		}
		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
			// allocating a closure (or declaring an internal function) is unobservable here;
			// its body only contributes effects where it is called
			return PURE_SUMMARY;
		}
		if (ts.isArrayLiteralExpression(node)) {
			let result = PURE_SUMMARY;
			for (const element of node.elements) {
				if (ts.isSpreadElement(element)) {
					result = unionSummaries(result, visit(element.expression));
					// spreading anything but a plain array may invoke a user iterator
					result = isDefinitelyType(state.getType(element.expression), isArrayType(state))
						? unionSummaries(result, READS_TABLES_SUMMARY)
						: CALLS_UNKNOWN_SUMMARY;
				} else {
					result = unionSummaries(result, visit(element));
				}
			}
			return result;
		}
		if (ts.isObjectLiteralExpression(node)) {
			let result = PURE_SUMMARY;
			for (const property of node.properties) {
				if (ts.isPropertyAssignment(property)) {
					if (ts.isComputedPropertyName(property.name)) {
						result = unionSummaries(result, visit(property.name.expression));
					}
					result = unionSummaries(result, visit(property.initializer));
				} else if (ts.isShorthandPropertyAssignment(property)) {
					result = unionSummaries(result, readIdentifier(property.name));
				} else if (ts.isSpreadAssignment(property)) {
					result = unionSummaries(result, unionSummaries(visit(property.expression), READS_TABLES_SUMMARY));
				} else if (ts.isMethodDeclaration(property)) {
					result = unionSummaries(result, PURE_SUMMARY);
				} else {
					return CALLS_UNKNOWN_SUMMARY; // accessors, etc.
				}
			}
			return result;
		}
		if (ts.isTemplateExpression(node)) {
			let result = PURE_SUMMARY;
			for (const span of node.templateSpans) {
				result = unionSummaries(result, visit(span.expression));
			}
			// interpolating a non-primitive invokes `__tostring`, which may be user code
			if (
				!node.templateSpans.every(span =>
					isDefinitelyType(
						state.getType(span.expression),
						isStringType,
						isNumberType,
						isBooleanType,
						isUndefinedType,
					),
				)
			) {
				return CALLS_UNKNOWN_SUMMARY;
			}
			return result;
		}

		// statements
		if (ts.isBlock(node)) {
			let result = PURE_SUMMARY;
			for (const statement of node.statements) {
				result = unionSummaries(result, visit(statement));
			}
			return result;
		}
		if (ts.isExpressionStatement(node) || ts.isReturnStatement(node)) {
			return node.expression !== undefined ? visit(node.expression) : PURE_SUMMARY;
		}
		if (ts.isVariableStatement(node)) {
			return visitVariableDeclarationList(node.declarationList);
		}
		if (ts.isIfStatement(node)) {
			let result = unionSummaries(visit(node.expression), visit(node.thenStatement));
			if (node.elseStatement !== undefined) {
				result = unionSummaries(result, visit(node.elseStatement));
			}
			return result;
		}
		if (ts.isForStatement(node)) {
			let result = PURE_SUMMARY;
			if (node.initializer !== undefined) {
				result = ts.isVariableDeclarationList(node.initializer)
					? visitVariableDeclarationList(node.initializer)
					: visit(node.initializer);
			}
			if (node.condition !== undefined) {
				result = unionSummaries(result, visit(node.condition));
			}
			if (node.incrementor !== undefined) {
				result = unionSummaries(result, visit(node.incrementor));
			}
			return unionSummaries(result, visit(node.statement));
		}
		if (ts.isForOfStatement(node)) {
			return visitForOf(node);
		}
		if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
			return unionSummaries(visit(node.expression), visit(node.statement));
		}
		if (ts.isThrowStatement(node)) {
			return unionSummaries(visit(node.expression), THROWS_SUMMARY);
		}
		if (ts.isTryStatement(node)) {
			// conservative: union everything, keep `throws` even though catch may swallow it
			let result = visit(node.tryBlock);
			if (node.catchClause !== undefined) {
				result = unionSummaries(result, visit(node.catchClause.block));
			}
			if (node.finallyBlock !== undefined) {
				result = unionSummaries(result, visit(node.finallyBlock));
			}
			return result;
		}
		if (ts.isSwitchStatement(node)) {
			let result = visit(node.expression);
			for (const clause of node.caseBlock.clauses) {
				if (ts.isCaseClause(clause)) {
					result = unionSummaries(result, visit(clause.expression));
				}
				for (const statement of clause.statements) {
					result = unionSummaries(result, visit(statement));
				}
			}
			return result;
		}

		// anything not understood (this/super, new, await/yield, classes, for-in, tagged
		// templates, JSX, …) makes the body unknown code
		return CALLS_UNKNOWN_SUMMARY;
	};

	// parameter defaults and destructuring run on call; identifier params are internal locals
	let summary = PURE_SUMMARY;
	for (const parameter of func.parameters) {
		summary = unionSummaries(summary, visitBindingName(parameter.name));
		if (parameter.initializer !== undefined) {
			summary = unionSummaries(summary, visit(parameter.initializer));
		}
	}
	summary = unionSummaries(summary, visit(func.body));
	return summary;
}
