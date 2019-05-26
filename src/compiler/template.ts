import * as ts from "ts-morph";
import { compileExpression, compileList } from ".";
import { CompilerState } from "../CompilerState";
import { isStringType } from "../typeUtilities";

export function sanitizeTemplate(str: string) {
	str = str.replace(/(^|[^\\](?:\\\\)*)"/g, '$1\\"'); // replace " with \"
	str = str.replace(/(\r?\n|\r)/g, "\\$1"); // prefix new lines with \
	return str;
}

interface TemplateParts {
	literals: Array<string>;
	expressions: Array<string>;
}

function wrapQuotes(s: string) {
	return `"${s}"`;
}

function getTemplateExpressionParts(
	state: CompilerState,
	node: ts.TemplateExpression,
	tostring: boolean,
): TemplateParts {
	const literals = new Array<string>();

	literals.push(
		wrapQuotes(
			sanitizeTemplate(
				node
					.getHead()
					.getText()
					.slice(1, -2),
			),
		),
	);

	for (const span of node.getTemplateSpans()) {
		const literal = span.getLiteral();
		literals.push(
			wrapQuotes(sanitizeTemplate(literal.getText().slice(1, ts.TypeGuards.isTemplateMiddle(literal) ? -2 : -1))),
		);
	}

	const expressions = compileList(state, node.getTemplateSpans().map(span => span.getExpression()), (_, exp) => {
		const expStr = compileExpression(state, exp);
		if (tostring) {
			return isStringType(exp.getType()) ? expStr : `tostring(${expStr})`;
		} else {
			return expStr;
		}
	});

	return {
		expressions,
		literals,
	};
}

function getNoSubstitutionTemplateLiteralParts(
	state: CompilerState,
	node: ts.NoSubstitutionTemplateLiteral,
): TemplateParts {
	return {
		expressions: [],
		literals: [wrapQuotes(sanitizeTemplate(node.getText().slice(1, -1)))],
	};
}

function getTemplateParts(
	state: CompilerState,
	node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
	tostring: boolean,
): TemplateParts {
	if (ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
		return getNoSubstitutionTemplateLiteralParts(state, node);
	} else {
		return getTemplateExpressionParts(state, node, tostring);
	}
}

export function compileTemplateExpression(state: CompilerState, node: ts.TemplateExpression) {
	const parts = getTemplateParts(state, node, true);

	const bin = new Array<string>();
	for (let i = 0; i < parts.expressions.length; i++) {
		bin.push(parts.literals[i]);
		bin.push(parts.expressions[i]);
	}
	bin.push(parts.literals[parts.literals.length - 1]);

	return bin.filter(v => v !== `""`).join(" .. ");
}

export function compileTaggedTemplateExpression(state: CompilerState, node: ts.TaggedTemplateExpression) {
	const tagStr = compileExpression(state, node.getTag());
	const parts = getTemplateParts(state, node.getTemplate(), false);
	return `${tagStr}({ ${parts.literals.join(", ")} }, ${parts.expressions.join(", ")})`;
}
