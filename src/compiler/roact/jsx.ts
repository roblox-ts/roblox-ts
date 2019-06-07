import ts from "ts-morph";
import { CompilerState } from "../../CompilerState";
import { CompilerError, CompilerErrorType } from "../../errors/CompilerError";
import { suggest } from "../../utility";

function compileJsx(
	state: CompilerState,
	node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
	children: Array<ts.JsxChild>,
) {
	// const attributes = node.getAttributes();
	// const hasSpreads = attributes.filter(v => ts.TypeGuards.isJsxSpreadAttribute(v)).length > 0;
	return "!";
}

function assertRoact(state: CompilerState, node: ts.Node) {
	if (!state.hasRoactImport) {
		throw new CompilerError(
			"Cannot use JSX without importing Roact first!\n" +
				suggest('To fix this, put `import Roact from "@rbxts/roact"` at the top of this file.'),
			node,
			CompilerErrorType.RoactJsxWithoutImport,
		);
	}
}

export function compileJsxElement(state: CompilerState, node: ts.JsxElement) {
	assertRoact(state, node);
	return compileJsx(state, node.getOpeningElement(), node.getJsxChildren());
}

export function compileJsxSelfClosingElement(state: CompilerState, node: ts.JsxSelfClosingElement) {
	assertRoact(state, node);
	return compileJsx(state, node, []);
}

export const ROACT_COMPONENT_TYPE = "Roact.Component";
export const ROACT_PURE_COMPONENT_TYPE = "Roact.PureComponent";
export const ROACT_DERIVED_CLASSES_ERROR = suggest(
	"Composition is preferred over inheritance with Roact components.\n" +
		"...\tsee https://reactjs.org/docs/composition-vs-inheritance.html for more info about composition over inheritance.",
);

export function inheritsFromRoact(type: ts.Type): boolean {
	return false;
}

export function compileRoactClassDeclaration(
	state: CompilerState,
	type: "PureComponent" | "Component",
	name: string,
	node: ts.ClassDeclaration | ts.ClassExpression,
) {
	return "";
}
