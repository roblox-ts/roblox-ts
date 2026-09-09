import { addMapping, GenMapping, setSourceContent, toEncodedMap } from "@jridgewell/gen-mapping";
import luau, { render, RenderState, solveTempIds } from "@roblox-ts/luau-ast";
import type { SourcePosition } from "Shared/types";
import { assert } from "Shared/util/assert";

function countNewlines(text: string): number {
	let count = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) {
			count++;
		}
	}
	return count;
}

interface MappingContext {
	state: RenderState;
	map: GenMapping;
	sourcePositionMap: WeakMap<luau.Node, SourcePosition>;
	sourceEndPositionMap: WeakMap<luau.Node, SourcePosition>;
	sourceFileName: string;
}

interface ExpressionMappingRequest extends MappingContext {
	generatedLine: number;
	owner: luau.Statement;
}

interface StatementMappingRequest extends MappingContext {
	generatedLine: number;
}

function hasStatements(node: luau.Statement): node is luau.Statement & { statements: luau.List<luau.Statement> } {
	return "statements" in node && luau.list.isList(node.statements);
}

function getElseBody(node: luau.Statement): luau.IfStatement | luau.List<luau.Statement> | undefined {
	if (luau.isIfStatement(node)) {
		return node.elseBody;
	}
}

function addStatementListMappings(
	state: RenderState,
	map: GenMapping,
	stmtList: luau.List<luau.Statement>,
	startLine: number,
	sourcePositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceEndPositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceFileName: string,
) {
	let innerLine = startLine;
	let listNode = stmtList.head;
	while (listNode !== undefined) {
		const sourcePos = sourcePositionMap.get(listNode.value);
		if (sourcePos) {
			addMapping(map, {
				generated: { line: innerLine, column: 0 },
				source: sourceFileName,
				original: { line: sourcePos.line + 1, column: sourcePos.column },
			});
		}

		state.pushListNode(listNode);
		const rendered = render(state, listNode.value);
		state.popListNode();
		const lines = countNewlines(rendered);

		addInnerMappings(
			state,
			map,
			listNode.value,
			innerLine,
			sourcePositionMap,
			sourceEndPositionMap,
			sourceFileName,
		);

		innerLine += lines;
		listNode = listNode.next;
	}
}

function addEndMapping(map: GenMapping, endLine: number, sourcePos: SourcePosition, sourceFileName: string) {
	addMapping(map, {
		generated: { line: endLine, column: 0 },
		source: sourceFileName,
		original: { line: sourcePos.line + 1, column: sourcePos.column },
	});
}

function addExpressionListMappings<T extends luau.Expression>(
	expressions: luau.List<T>,
	request: ExpressionMappingRequest,
): number {
	let expressionLine = request.generatedLine;
	let expressionNode = expressions.head;
	while (expressionNode !== undefined) {
		addExpressionMappings(expressionNode.value, { ...request, generatedLine: expressionLine });
		expressionLine += countNewlines(render(request.state, expressionNode.value));
		expressionNode = expressionNode.next;
	}
	return expressionLine;
}

function addMapFieldMappings(field: luau.MapField, request: ExpressionMappingRequest): void {
	addExpressionMappings(field.index, request);
	const valueLine = request.generatedLine + countNewlines(render(request.state, field.index));
	addExpressionMappings(field.value, { ...request, generatedLine: valueLine });
}

function addTableMappings(fields: luau.List<luau.MapField | luau.Expression>, request: ExpressionMappingRequest): void {
	let fieldLine = request.generatedLine + 1;
	let fieldNode = fields.head;
	while (fieldNode !== undefined) {
		const field = fieldNode.value;
		if (luau.isMapField(field)) {
			addMapFieldMappings(field, { ...request, generatedLine: fieldLine });
		} else {
			addExpressionMappings(field, { ...request, generatedLine: fieldLine });
		}
		fieldLine += countNewlines(render(request.state, field)) + 1;
		fieldNode = fieldNode.next;
	}
}

function addExpressionMappings(expression: luau.Expression, request: ExpressionMappingRequest): void {
	const { generatedLine, map, owner, sourceEndPositionMap, sourceFileName, sourcePositionMap, state } = request;
	switch (expression.kind) {
		case luau.SyntaxKind.FunctionExpression: {
			assert(luau.isFunctionExpression(expression));
			const fnExpression = expression;
			if (luau.list.isEmpty(fnExpression.statements)) {
				return;
			}
			addStatementListMappings(
				state,
				map,
				fnExpression.statements,
				generatedLine + 1,
				sourcePositionMap,
				sourceEndPositionMap,
				sourceFileName,
			);
			const endPos = getEndPos(owner, sourcePositionMap, sourceEndPositionMap);
			if (endPos) {
				addEndMapping(map, generatedLine + countNewlines(render(state, fnExpression)), endPos, sourceFileName);
			}
			return;
		}
		case luau.SyntaxKind.ComputedIndexExpression: {
			assert(luau.isComputedIndexExpression(expression));
			const computed = expression;
			addExpressionMappings(computed.expression, request);
			addExpressionMappings(computed.index, {
				...request,
				generatedLine: generatedLine + countNewlines(render(state, computed.expression)),
			});
			return;
		}
		case luau.SyntaxKind.PropertyAccessExpression:
			assert(luau.isPropertyAccessExpression(expression));
			addExpressionMappings(expression.expression, request);
			return;
		case luau.SyntaxKind.CallExpression:
		case luau.SyntaxKind.MethodCallExpression: {
			assert(luau.isCallExpression(expression) || luau.isMethodCallExpression(expression));
			const call = expression;
			addExpressionMappings(call.expression, request);
			addExpressionListMappings(call.args, {
				...request,
				generatedLine: generatedLine + countNewlines(render(state, call.expression)),
			});
			return;
		}
		case luau.SyntaxKind.ParenthesizedExpression:
			assert(luau.isParenthesizedExpression(expression));
			addExpressionMappings(expression.expression, request);
			return;
		case luau.SyntaxKind.BinaryExpression: {
			assert(luau.isBinaryExpression(expression));
			const binary = expression;
			addExpressionMappings(binary.left, request);
			addExpressionMappings(binary.right, {
				...request,
				generatedLine: generatedLine + countNewlines(render(state, binary.left)),
			});
			return;
		}
		case luau.SyntaxKind.UnaryExpression:
			assert(luau.isUnaryExpression(expression));
			addExpressionMappings(expression.expression, request);
			return;
		case luau.SyntaxKind.IfExpression: {
			assert(luau.isIfExpression(expression));
			const ifExpression = expression;
			addExpressionMappings(ifExpression.condition, request);
			const consequentLine = generatedLine + countNewlines(render(state, ifExpression.condition));
			addExpressionMappings(ifExpression.expression, { ...request, generatedLine: consequentLine });
			const alternativeLine = consequentLine + countNewlines(render(state, ifExpression.expression));
			addExpressionMappings(ifExpression.alternative, { ...request, generatedLine: alternativeLine });
			return;
		}
		case luau.SyntaxKind.InterpolatedString: {
			assert(luau.isInterpolatedString(expression));
			let partLine = generatedLine;
			let partNode = expression.parts.head;
			while (partNode !== undefined) {
				const part = partNode.value;
				if (!luau.isInterpolatedStringPart(part)) {
					addExpressionMappings(part, { ...request, generatedLine: partLine });
				}
				partLine += countNewlines(render(state, part));
				partNode = partNode.next;
			}
			return;
		}
		case luau.SyntaxKind.Array:
			assert(luau.isArray(expression));
			addExpressionListMappings(expression.members, request);
			return;
		case luau.SyntaxKind.Map:
			assert(luau.isMap(expression));
			addTableMappings(expression.fields, request);
			return;
		case luau.SyntaxKind.Set: {
			assert(luau.isSet(expression));
			const set = expression;
			let memberLine = generatedLine + 1;
			let memberNode = set.members.head;
			while (memberNode !== undefined) {
				addExpressionMappings(memberNode.value, { ...request, generatedLine: memberLine });
				memberLine += countNewlines(render(state, memberNode.value)) + 1;
				memberNode = memberNode.next;
			}
			return;
		}
		case luau.SyntaxKind.MixedTable:
			assert(luau.isMixedTable(expression));
			addTableMappings(expression.fields, request);
			return;
	}
}

function getStatementHeaderLines(state: RenderState, statement: luau.Statement): number {
	switch (statement.kind) {
		case luau.SyntaxKind.WhileStatement:
		case luau.SyntaxKind.IfStatement:
			assert(luau.isWhileStatement(statement) || luau.isIfStatement(statement));
			return countNewlines(render(state, statement.condition)) + 1;
		case luau.SyntaxKind.ForStatement:
			assert(luau.isForStatement(statement));
			return countNewlines(render(state, statement.expression)) + 1;
		case luau.SyntaxKind.NumericForStatement: {
			assert(luau.isNumericForStatement(statement));
			const numericFor = statement;
			return (
				countNewlines(render(state, numericFor.start)) +
				countNewlines(render(state, numericFor.end)) +
				(numericFor.step ? countNewlines(render(state, numericFor.step)) : 0) +
				1
			);
		}
		case luau.SyntaxKind.FunctionDeclaration: {
			assert(luau.isFunctionDeclaration(statement));
			return countNewlines(render(state, statement.name)) + 1;
		}
		case luau.SyntaxKind.MethodDeclaration:
			assert(luau.isMethodDeclaration(statement));
			return countNewlines(render(state, statement.expression)) + 1;
		default:
			return 1;
	}
}

function addExpressionOrListMappings<T extends luau.Expression>(
	expression: T | luau.List<T>,
	request: ExpressionMappingRequest,
): void {
	if (luau.list.isList(expression)) {
		addExpressionListMappings(expression, request);
	} else {
		addExpressionMappings(expression, request);
	}
}

function addStatementExpressionMappings(statement: luau.Statement, request: StatementMappingRequest): void {
	const expressionRequest = { ...request, owner: statement } satisfies ExpressionMappingRequest;
	switch (statement.kind) {
		case luau.SyntaxKind.Assignment: {
			assert(luau.isAssignment(statement));
			const assignment = statement;
			const left = luau.list.isList(assignment.left)
				? luau.list
						.toArray(assignment.left)
						.map(expression => render(request.state, expression))
						.join(", ")
				: render(request.state, assignment.left);
			addExpressionOrListMappings(assignment.left, expressionRequest);
			addExpressionOrListMappings(assignment.right, {
				...expressionRequest,
				generatedLine: request.generatedLine + countNewlines(left),
			});
			return;
		}
		case luau.SyntaxKind.CallStatement:
			assert(luau.isCallStatement(statement));
			addExpressionMappings(statement.expression, expressionRequest);
			return;
		case luau.SyntaxKind.WhileStatement:
		case luau.SyntaxKind.IfStatement:
			assert(luau.isWhileStatement(statement) || luau.isIfStatement(statement));
			addExpressionMappings(statement.condition, expressionRequest);
			return;
		case luau.SyntaxKind.RepeatStatement: {
			assert(luau.isRepeatStatement(statement));
			const repeat = statement;
			const bodyLines = luau.list
				.toArray(repeat.statements)
				.reduce(
					(lineCount, bodyStatement) => lineCount + countNewlines(render(request.state, bodyStatement)),
					0,
				);
			addExpressionMappings(repeat.condition, {
				...expressionRequest,
				generatedLine: request.generatedLine + bodyLines + 1,
			});
			return;
		}
		case luau.SyntaxKind.ForStatement:
			assert(luau.isForStatement(statement));
			addExpressionMappings(statement.expression, expressionRequest);
			return;
		case luau.SyntaxKind.NumericForStatement: {
			assert(luau.isNumericForStatement(statement));
			const numericFor = statement;
			addExpressionMappings(numericFor.start, expressionRequest);
			const endLine = request.generatedLine + countNewlines(render(request.state, numericFor.start));
			addExpressionMappings(numericFor.end, { ...expressionRequest, generatedLine: endLine });
			if (numericFor.step) {
				addExpressionMappings(numericFor.step, {
					...expressionRequest,
					generatedLine: endLine + countNewlines(render(request.state, numericFor.end)),
				});
			}
			return;
		}
		case luau.SyntaxKind.FunctionDeclaration: {
			assert(luau.isFunctionDeclaration(statement));
			const declaration = statement;
			if (declaration.name.kind === luau.SyntaxKind.PropertyAccessExpression) {
				addExpressionMappings(declaration.name, expressionRequest);
			}
			return;
		}
		case luau.SyntaxKind.MethodDeclaration:
			assert(luau.isMethodDeclaration(statement));
			addExpressionMappings(statement.expression, expressionRequest);
			return;
		case luau.SyntaxKind.VariableDeclaration: {
			assert(luau.isVariableDeclaration(statement));
			const declaration = statement;
			if (declaration.right) {
				addExpressionOrListMappings(declaration.right, expressionRequest);
			}
			return;
		}
		case luau.SyntaxKind.ReturnStatement:
			assert(luau.isReturnStatement(statement));
			addExpressionOrListMappings(statement.expression, expressionRequest);
			return;
	}
}

function shouldMapEnd(stmt: luau.Statement): boolean {
	return stmt.kind !== luau.SyntaxKind.RepeatStatement;
}

// closing keywords fall back to the opening statement when no end position was captured
function getEndPos(
	stmt: luau.Node,
	sourcePositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceEndPositionMap: WeakMap<luau.Node, SourcePosition>,
): SourcePosition | undefined {
	return sourceEndPositionMap.get(stmt) ?? sourcePositionMap.get(stmt);
}

function addInnerMappings(
	state: RenderState,
	map: GenMapping,
	stmt: luau.Statement,
	startLine: number,
	sourcePositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceEndPositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceFileName: string,
	isElseifChild?: boolean,
) {
	const request = {
		state,
		map,
		sourcePositionMap,
		sourceEndPositionMap,
		sourceFileName,
		generatedLine: startLine,
	} satisfies StatementMappingRequest;
	addStatementExpressionMappings(stmt, request);
	if (!hasStatements(stmt)) {
		return;
	}

	const headerLines = getStatementHeaderLines(state, stmt);
	addStatementListMappings(
		state,
		map,
		stmt.statements,
		startLine + headerLines,
		sourcePositionMap,
		sourceEndPositionMap,
		sourceFileName,
	);

	// elseif and else bodies follow the then-body
	const elseBody = getElseBody(stmt);
	if (elseBody) {
		const statementsRendered = luau.list
			.toArray(stmt.statements)
			.map(s => render(state, s))
			.join("");
		const bodyLines = countNewlines(statementsRendered);

		if (luau.list.isList(elseBody)) {
			// `else\n` takes 1 line after the then-body
			const elseStartLine = startLine + headerLines + bodyLines + 1;
			addStatementListMappings(
				state,
				map,
				elseBody,
				elseStartLine,
				sourcePositionMap,
				sourceEndPositionMap,
				sourceFileName,
			);
		} else {
			// elseif — it's an IfStatement, recurse
			const elseifLine = startLine + headerLines + bodyLines;
			const sourcePos = sourcePositionMap.get(elseBody);
			if (sourcePos) {
				addMapping(map, {
					generated: { line: elseifLine, column: 0 },
					source: sourceFileName,
					original: { line: sourcePos.line + 1, column: sourcePos.column },
				});
			}
			addInnerMappings(
				state,
				map,
				elseBody,
				elseifLine,
				sourcePositionMap,
				sourceEndPositionMap,
				sourceFileName,
				true,
			);
		}
	}

	// the outermost if owns the closing end shared with its elseif children
	if (!isElseifChild && shouldMapEnd(stmt)) {
		const endPos = getEndPos(stmt, sourcePositionMap, sourceEndPositionMap);
		if (endPos) {
			const rendered = render(state, stmt);
			const totalLines = countNewlines(rendered);
			addEndMapping(map, startLine + totalLines - 1, endPos, sourceFileName);
		}
	}
}

export function renderASTWithSourceMap(
	ast: luau.List<luau.Statement>,
	sourcePositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceEndPositionMap: WeakMap<luau.Node, SourcePosition>,
	sourceFileName: string,
	outputFileName: string,
	sourceContent?: string,
) {
	const state = new RenderState();
	solveTempIds(state, ast);

	const map = new GenMapping({ file: outputFileName });
	if (sourceContent !== undefined) {
		setSourceContent(map, sourceFileName, sourceContent);
	}
	let outputLine = 1;
	let code = "";

	let listNode = ast.head;
	let hasFinalStatement = false;
	while (listNode !== undefined) {
		if (hasFinalStatement && !luau.isComment(listNode.value)) {
			break;
		}
		hasFinalStatement ||= luau.isFinalStatement(listNode.value);

		state.pushListNode(listNode);

		const sourcePos = sourcePositionMap.get(listNode.value);
		if (sourcePos) {
			addMapping(map, {
				generated: { line: outputLine, column: 0 },
				source: sourceFileName,
				original: { line: sourcePos.line + 1, column: sourcePos.column },
			});
		}

		const rendered = render(state, listNode.value);
		const lines = countNewlines(rendered);

		addInnerMappings(
			state,
			map,
			listNode.value,
			outputLine,
			sourcePositionMap,
			sourceEndPositionMap,
			sourceFileName,
		);

		outputLine += lines;
		code += rendered;

		state.popListNode();
		listNode = listNode.next;
	}

	return { code, map: toEncodedMap(map) };
}
