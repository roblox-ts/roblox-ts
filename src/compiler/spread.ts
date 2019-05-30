import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayType,
	isIterableFunction,
	isIterableIterator,
	isMapType,
	isSetType,
	isStringType,
	isTupleReturnTypeCall,
	shouldPushToPrecedingStatement,
} from "../typeUtilities";

export function shouldCompileAsSpreadableList(elements: Array<ts.Expression>) {
	const { length } = elements;
	for (let i = 0; i < length; i++) {
		if (ts.TypeGuards.isSpreadElement(elements[i])) {
			return i + 1 !== length;
		}
	}
	return false;
}

export function compileSpreadableList(
	state: CompilerState,
	elements: Array<ts.Expression>,
	compile: (state: CompilerState, expression: ts.Expression) => string = compileExpression,
) {
	// The logic here is equivalent to the compileList logic, although it looks a bit more complicated
	let isInArray = false;
	const parts = new Array<Array<string> | string>();
	const contexts = new Array<Array<PrecedingStatementContext> | PrecedingStatementContext>();
	const args = new Array<Array<ts.Expression> | ts.Expression>();
	let gIndex = 0;
	let lastContextualIndex: number | undefined;
	let lastContextualElement: ts.Expression | undefined;

	for (const element of elements) {
		if (ts.TypeGuards.isSpreadElement(element)) {
			state.enterPrecedingStatementContext();
			const expStr = compileSpreadExpressionOrThrow(state, element.getExpression());
			const context = state.exitPrecedingStatementContext() as PrecedingStatementContext;

			if (context.length > 0) {
				lastContextualIndex = gIndex;
				lastContextualElement = element;
			}
			parts.push(expStr);
			contexts.push(context);
			args.push(element);

			gIndex++;
			isInArray = false;
		} else {
			let last: Array<string>;
			let lastContext: Array<PrecedingStatementContext>;
			let lastElement: Array<ts.Expression>;
			if (isInArray) {
				last = parts[parts.length - 1] as Array<string>;
				lastContext = contexts[contexts.length - 1] as Array<PrecedingStatementContext>;
				lastElement = args[args.length - 1] as Array<ts.Expression>;
			} else {
				last = new Array();
				lastContext = new Array() as Array<PrecedingStatementContext>;
				lastElement = new Array();

				parts.push(last);
				contexts.push(lastContext);
				args.push(lastElement);
			}
			state.enterPrecedingStatementContext();
			const expStr = compile(state, element);
			const context = state.exitPrecedingStatementContext() as PrecedingStatementContext;

			if (context.length > 0) {
				lastContextualIndex = gIndex;
				lastContextualElement = element;
			}

			last.push(expStr);
			lastContext.push(context);
			lastElement.push(element);

			gIndex++;
			isInArray = true;
		}
	}

	if (lastContextualIndex !== undefined) {
		let gIter = 0;
		for (let i = 0; i < contexts.length; i++) {
			if (gIter === lastContextualIndex) {
				if (typeof parts[i] === "string") {
					state.pushPrecedingStatements(lastContextualElement!, ...(contexts[i] as Array<string>));
				} else {
					(contexts[i] as Array<PrecedingStatementContext>).forEach(context =>
						state.pushPrecedingStatements(lastContextualElement!, ...context),
					);
				}
				break;
			}

			const part = parts[i];

			if (typeof part === "string") {
				const arg = args[i] as ts.Expression;
				const context = contexts[i] as PrecedingStatementContext;

				if (context.length > 0) {
					state.pushPrecedingStatements(arg, ...context);
				}

				if (shouldPushToPrecedingStatement(arg, part, context)) {
					let nextContext: PrecedingStatementContext;

					// get nextContext
					if (typeof parts[i + 1] === "string") {
						nextContext = contexts[i + 1] as PrecedingStatementContext;
					} else {
						const contextSet = contexts[i + 1] as Array<PrecedingStatementContext>;
						nextContext = contextSet.reduce((a, x) => {
							a.push(...x);
							return a;
						}, new Array<string>()) as PrecedingStatementContext;
						nextContext.isPushed = false;
					}

					parts[i] = state.pushPrecedingStatementToReuseableId(arg, part, nextContext);
				}
				gIter++;
			} else {
				const arg = args[i] as Array<ts.Expression>;
				const context = contexts[i] as Array<PrecedingStatementContext>;

				for (let j = 0; j < context.length; j++) {
					const subContext = context[j];
					const subExp = arg[j];
					const subStr = part[j];

					if (subContext.length > 0) {
						state.pushPrecedingStatements(subExp, ...subContext);
					}

					if (shouldPushToPrecedingStatement(subExp, subStr, subContext)) {
						part[j] = state.pushPrecedingStatementToReuseableId(subExp, subStr, context[j + 1]);
					}

					if (++gIter === lastContextualIndex) {
						state.pushPrecedingStatements(lastContextualElement!, ...(context[j + 1] as Array<string>));
						break;
					}
				}
			}
		}
	}

	return parts;
}

export function compileSpreadableListAndJoin(
	state: CompilerState,
	elements: Array<ts.Expression>,
	shouldWrapInConcat: boolean = true,
	compile: (state: CompilerState, expression: ts.Expression) => string = compileExpression,
) {
	let params = compileSpreadableList(state, elements, compile)
		.map(v => {
			if (typeof v === "string") {
				return v;
			} else {
				return `{ ${v.join(", ")} }`;
			}
		})
		.join(", ");

	if (shouldWrapInConcat) {
		state.usesTSLibrary = true;
		params = `TS.array_concat(${params})`;
	}

	return params;
}

export function compileSpreadExpression(state: CompilerState, expression: ts.Expression) {
	const expType = expression.getType();
	if (isSetType(expType)) {
		state.usesTSLibrary = true;
		return `TS.set_values(${compileExpression(state, expression)})`;
	} else if (isMapType(expType)) {
		state.usesTSLibrary = true;
		return `TS.map_entries(${compileExpression(state, expression)})`;
	} else if (isArrayType(expType)) {
		return compileExpression(state, expression);
	} else if (isStringType(expType)) {
		if (ts.TypeGuards.isStringLiteral(expression)) {
			const text = expression.getText();
			const quote = text.slice(-1);
			return "{" + text.replace(/\\?./g, a => `${quote}${a}${quote}, `).slice(4, -7) + " }";
		} else {
			return `string.split(${compileExpression(state, expression)}, "")`;
		}
	} else if (isIterableFunction(expType)) {
		state.usesTSLibrary = true;
		return `TS.iterableFunctionCache(${compileExpression(state, expression)})`;
	} else if (isIterableIterator(expType, expression)) {
		state.usesTSLibrary = true;
		return `TS.iterableCache(${compileExpression(state, expression)})`;
	} else {
		state.usesTSLibrary = true;
		const arrName = compileExpression(state, expression);
		return `TS.iterableCache(${arrName}[TS.Symbol_iterator](${arrName}))`;
	}
}

export function compileSpreadExpressionOrThrow(state: CompilerState, expression: ts.Expression) {
	const result = compileSpreadExpression(state, expression);
	if (result) {
		return result;
	} else {
		throw new CompilerError(
			`Unable to spread expression of type ${expression.getType().getText()}`,
			expression,
			CompilerErrorType.BadSpreadType,
		);
	}
}

export function compileSpreadElement(state: CompilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);

	if (ts.TypeGuards.isCallExpression(expression) && isTupleReturnTypeCall(expression)) {
		return compileCallExpression(state, expression, true);
	} else {
		return `unpack(${compileSpreadExpressionOrThrow(state, expression)})`;
	}
}
