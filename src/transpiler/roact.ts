import * as ts from "ts-morph";
import {
	checkMethodReserved,
	checkReserved,
	getParameterData,
	transpileBlock,
	transpileExpression,
	transpileStatement,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType } from "../typeUtilities";
import { bold, suggest } from "../utility";

const ROACT_ELEMENT_TYPE = "Roact.Element";
export const ROACT_COMPONENT_TYPE = "Roact.Component";
export const ROACT_PURE_COMPONENT_TYPE = "Roact.PureComponent";
const ROACT_COMPONENT_CLASSES = [ROACT_COMPONENT_TYPE, ROACT_PURE_COMPONENT_TYPE];

export const ROACT_DERIVED_CLASSES_ERROR = suggest(
	"Composition is preferred over inheritance with Roact components.\n" +
		"...\tsee https://reactjs.org/docs/composition-vs-inheritance.html for more info about composition over inheritance.",
);
const CONSTRUCTOR_METHOD_NAME = "init";
const INHERITANCE_METHOD_NAME = "extend";
const RESERVED_METHOD_NAMES = [
	CONSTRUCTOR_METHOD_NAME,
	"setState",
	"_update",
	"getElementTraceback",
	"_forceUpdate",
	"_mount",
	"_unmount",
	INHERITANCE_METHOD_NAME,
];

/**
 * A list of lowercase names that map to Roblox elements for JSX
 */
const INTRINSIC_MAPPINGS: { [name: string]: string } = {
	billboardgui: "BillboardGui",

	frame: "Frame",

	imagebutton: "ImageButton",
	imagelabel: "ImageLabel",

	screengui: "ScreenGui",
	scrollingframe: "ScrollingFrame",
	surfacegui: "SurfaceGui",

	textbox: "TextBox",
	textbutton: "TextButton",
	textlabel: "TextLabel",

	uigridlayout: "UIGridLayout",
	uilistlayout: "UIListLayout",
	uipagelayout: "UIPageLayout",
	uitablelayout: "UITableLayout",

	uipadding: "UIPadding",
	uiscale: "UIScale",

	uiaspectratioconstraint: "UIAspectRatioConstraint",

	uisizeconstraint: "UISizeConstraint",
	uitextsizeconstraint: "UITextSizeConstraint",

	viewportframe: "ViewportFrame",
};

function isRoactElementType(type: ts.Type) {
	const allowed = [ROACT_ELEMENT_TYPE, `${ROACT_ELEMENT_TYPE}[]`];
	const types = type.getUnionTypes();

	if (types.length > 0) {
		for (const unionType of types) {
			const unionTypeName = unionType.getText();
			if (allowed.indexOf(unionTypeName) === -1 && unionTypeName !== "undefined") {
				return false;
			}
		}
	} else {
		return allowed.indexOf(type.getText()) !== -1;
	}

	return true;
}

function getFullTypeList(type: ts.Type): Array<string> {
	const symbol = type.getSymbol();
	const typeArray = new Array<string>();
	if (symbol) {
		symbol.getDeclarations().forEach(declaration => {
			typeArray.push(declaration.getType().getText());
			declaration
				.getType()
				.getBaseTypes()
				.forEach(baseType => typeArray.push(...getFullTypeList(baseType)));
		});
	}

	return typeArray;
}

export function inheritsFromRoact(type: ts.Type): boolean {
	const fullName = getFullTypeList(type);
	let isRoactClass = false;
	for (const name of fullName) {
		if (ROACT_COMPONENT_CLASSES.findIndex(value => name.startsWith(value)) !== -1) {
			isRoactClass = true;
			break;
		}
	}

	return isRoactClass;
}

function checkRoactReserved(className: string, name: string, node: ts.Node<ts.ts.Node>) {
	if (RESERVED_METHOD_NAMES.indexOf(name) !== -1) {
		let userError = `Member ${bold(name)} in component ${bold(className)} is a reserved Roact method name.`;

		if (name === CONSTRUCTOR_METHOD_NAME) {
			userError += `\n ... Use the constructor ${bold("constructor(props)")} instead of the method ${bold(
				"init(props)",
			)}.`;
		} else if (name === INHERITANCE_METHOD_NAME) {
			userError += "\n" + ROACT_DERIVED_CLASSES_ERROR;
		}

		throw new TranspilerError(userError, node, TranspilerErrorType.RoactNoReservedMethods);
	}
}

function getConstructor(node: ts.ClassDeclaration | ts.ClassExpression) {
	for (const constructor of node.getConstructors()) {
		return constructor;
	}
}

export function transpileRoactClassDeclaration(
	state: TranspilerState,
	type: "Component" | "PureComponent",
	className: string,
	node: ts.ClassDeclaration | ts.ClassExpression,
) {
	let declaration = `${state.indent}local ${className} = Roact.${type}:extend("${className}");\n`;

	const instanceProps = node
		.getInstanceProperties()
		// @ts-ignore
		.filter(prop => prop.getParent() === node)
		.filter(prop => !ts.TypeGuards.isGetAccessorDeclaration(prop))
		.filter(prop => !ts.TypeGuards.isSetAccessorDeclaration(prop));

	const extraInitializers = new Array<string>();

	if (instanceProps.length > 0) {
		for (const prop of instanceProps) {
			const propName = prop.getName();

			if (propName) {
				checkMethodReserved(propName, prop);
				checkRoactReserved(className, propName, prop);

				if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
					const initializer = prop.getInitializer();
					if (initializer) {
						extraInitializers.push(`self.${propName} = ${transpileExpression(state, initializer)};`);
					}
				}
			}
		}
	}

	const constructor = getConstructor(node);
	if (constructor) {
		const paramNames = new Array<string>();
		const initializers = new Array<string>();
		const defaults = new Array<string>();

		getParameterData(state, paramNames, initializers, constructor, defaults);

		declaration += `${state.indent}function ${className}:init(${paramNames.join(", ")})\n`;

		state.pushIndent();

		const body = constructor.getBodyOrThrow();
		if (ts.TypeGuards.isBlock(body)) {
			// we can ignore super() as it's not required.
			if (ts.TypeGuards.isBlock(body)) {
				defaults.forEach(initializer => (declaration += state.indent + initializer + "\n"));

				const bodyStatements = body.getStatements();
				let k = 0;

				initializers.forEach(initializer => (declaration += state.indent + initializer + "\n"));
				extraInitializers.forEach(initializer => (declaration += state.indent + initializer + "\n"));

				for (; k < bodyStatements.length; ++k) {
					const bodyStatement = bodyStatements[k];

					// Because we want to ignore super. I will figure out a better way to do this eventually.
					// isSuperExpression doesn't seem to work.
					if (!bodyStatement.getText().startsWith("super")) {
						declaration += transpileStatement(state, bodyStatement);
					}
				}

				const returnStatement = body.getStatementByKind(ts.SyntaxKind.ReturnStatement);

				if (returnStatement) {
					throw new TranspilerError(
						`Cannot use return statement in constructor for ${className}`,
						returnStatement,
						TranspilerErrorType.NoConstructorReturn,
					);
				}
			}
		}

		state.popIndent();

		declaration += `${state.indent}end;\n`;
	}

	const staticFields = node.getStaticProperties();
	for (const staticField of staticFields) {
		if (ts.TypeGuards.isInitializerExpressionableNode(staticField)) {
			const initializer = staticField.getInitializer();
			if (initializer) {
				checkRoactReserved(className, staticField.getName(), staticField);
				declaration += `${state.indent}${className}.${staticField.getName()} = ${transpileExpression(
					state,
					initializer,
				)};\n`;
			}
		}
	}

	const staticMethods = node.getStaticMethods().filter(method => method.getBody() !== undefined);
	for (const staticMethod of staticMethods) {
		const name = staticMethod.getName();
		checkReserved(name, staticMethod);
		checkRoactReserved(className, name, staticMethod);
		const body = staticMethod.getBodyOrThrow();

		const paramNames = new Array<string>();
		const initializers = new Array<string>();
		state.pushIdStack();
		getParameterData(state, paramNames, initializers, staticMethod);
		const paramStr = paramNames.join(", ");

		declaration += `${state.indent}function ${className}.${name}(${paramStr})\n`;

		state.pushIndent();
		if (ts.TypeGuards.isBlock(body)) {
			initializers.forEach(initializer => (declaration += state.indent + initializer + "\n"));
			declaration += transpileBlock(state, body);
		}
		state.popIndent();

		declaration += `${state.indent}end;\n`;
	}

	// Now we'll get the methods, and make them into the special roact format
	const methods = node.getInstanceMethods().filter(method => method.getBody() !== undefined);

	for (const method of methods) {
		const name = method.getName();
		checkReserved(name, method);
		checkRoactReserved(className, name, method);

		const body = method.getBodyOrThrow();

		const paramNames = new Array<string>();
		const initializers = new Array<string>();
		state.pushIdStack();
		getParameterData(state, paramNames, initializers, method);
		const paramStr = paramNames.join(", ");

		declaration += `${state.indent}function ${className}:${name}(${paramStr})\n`;

		state.pushIndent();
		if (ts.TypeGuards.isBlock(body)) {
			initializers.forEach(initializer => (declaration += state.indent + initializer + "\n"));
			declaration += transpileBlock(state, body);
		}
		state.popIndent();

		declaration += `${state.indent}end;\n`;
	}

	const getters = node
		.getInstanceProperties()
		.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
	if (getters.length > 0) {
		throw new TranspilerError("Roact does not support getters", node, TranspilerErrorType.RoactGettersNotAllowed);
	}

	const setters = node
		.getInstanceProperties()
		.filter((prop): prop is ts.SetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
	if (setters.length > 0) {
		throw new TranspilerError("Roact does not support setters", node, TranspilerErrorType.RoactSettersNotAllowed);
	}

	return declaration;
}

function transpileSymbolPropertyCallback(state: TranspilerState, node: ts.Expression) {
	const symbol = node.getSymbolOrThrow();
	const name = symbol.getName();
	const value = symbol.getValueDeclarationOrThrow();

	if (ts.TypeGuards.isFunctionLikeDeclaration(value)) {
		if (ts.TypeGuards.isMethodDeclaration(value)) {
			throw new TranspilerError(
				"Do not use Method signatures directly as callbacks for Roact Event, Changed or Ref.\n" +
					suggest(
						`Change the declaration of \`${name}(...) {...}\` to \`${name} = () => { ... }\`, ` +
							` or use an arrow function: \`() => { this.${name}() }\``,
					),
				node,
				TranspilerErrorType.RoactInvalidCallExpression,
			);
		}
	}

	return transpileExpression(state, node);
}

export function generateRoactSymbolProperty(
	state: TranspilerState,
	roactSymbol: "Event" | "Change" | "Ref",
	node: ts.JsxAttributeLike,
	attributeCollection: Array<string>,
	hasExtraAttributes: boolean = false,
) {
	const expr = node.getChildrenOfKind(ts.SyntaxKind.JsxExpression);
	for (const expression of expr) {
		const innerExpression = expression.getExpressionOrThrow();
		if (ts.TypeGuards.isObjectLiteralExpression(innerExpression)) {
			const properties = innerExpression.getProperties();
			for (const property of properties) {
				if (
					ts.TypeGuards.isPropertyAssignment(property) ||
					ts.TypeGuards.isShorthandPropertyAssignment(property)
				) {
					const propName = property.getName();
					const rhs = property.getInitializerOrThrow();
					let value: string;

					if (ts.TypeGuards.isPropertyAccessExpression(rhs)) {
						value = transpileSymbolPropertyCallback(state, rhs);
					} else {
						if (hasExtraAttributes) {
							state.pushIndent(); // fix indentation with extra props
						}
						console.log(rhs.getType().getText());
						value = transpileExpression(state, rhs);
					}

					if (hasExtraAttributes) {
						state.popIndent(); // fix indentation with extra props
					}

					attributeCollection.push(`[Roact.${roactSymbol}.${propName}] = ${value}`);
				}
			}
		} else if (roactSymbol === "Ref") {
			let value: string;

			if (ts.TypeGuards.isPropertyAccessExpression(innerExpression)) {
				const getAccessExpression = innerExpression.getExpression();
				if (ts.TypeGuards.isThisExpression(getAccessExpression)) {
					value = transpileSymbolPropertyCallback(state, innerExpression);
				} else {
					if (hasExtraAttributes) {
						state.pushIndent(); // fix indentation with extra props
					}
					value = transpileExpression(state, getAccessExpression);
				}
			} else {
				if (hasExtraAttributes) {
					state.pushIndent(); // fix indentation with extra props
				}
				value = transpileExpression(state, innerExpression);
			}

			if (hasExtraAttributes) {
				state.popIndent();
			}

			attributeCollection.push(`[Roact.Ref] = ${value}`);
		} else {
			throw new TranspilerError(
				`Roact symbol ${roactSymbol} does not support (${innerExpression.getKindName()})`,
				node,
				TranspilerErrorType.RoactInvalidSymbol,
			);
		}
	}
}

export function generateRoactElement(
	state: TranspilerState,
	// name: string,
	nameNode: ts.JsxTagNameExpression,
	attributes: Array<ts.JsxAttributeLike>,
	children: Array<ts.JsxChild>,
): string {
	let str = `Roact.createElement(`;
	const name = nameNode.getText();
	const attributeCollection = new Array<string>();
	const extraAttributeCollections = new Array<string>();
	const extraChildrenCollection = new Array<string>();
	const childCollection = new Array<string>();
	let key: string | undefined;

	state.roactIndent++;

	if (name.match(/^[a-z]+$/)) {
		// if lowercase

		// Check if defined as a intrinsic mapping
		const rbxName = INTRINSIC_MAPPINGS[name];
		if (rbxName) {
			str += `"${rbxName}"`;
		} else {
			throw new TranspilerError(
				`"${bold(name)}" is not a valid primitive type.\n` + suggest("Your roblox-ts may be out of date."),
				nameNode,
				TranspilerErrorType.RoactInvalidPrimitive,
			);
		}
	} else {
		str += name;
	}

	if (attributes.length > 0) {
		state.pushIndent();

		const extraAttributes = attributes.filter(attr => ts.TypeGuards.isJsxSpreadAttribute(attr));

		for (const attributeLike of attributes) {
			if (ts.TypeGuards.isJsxSpreadAttribute(attributeLike)) {
				const expression = attributeLike.getExpression();
				extraAttributeCollections.push(transpileExpression(state, expression));
			} else {
				const attribute = attributeLike as ts.JsxAttribute;
				const attributeName = attribute.getName();
				const value = transpileExpression(state, attribute.getInitializerOrThrow());

				if (attributeName === "Key") {
					// handle setting a key for this element
					key = value;
				} else if (attributeName === "Event") {
					// handle [Roact.Event]
					generateRoactSymbolProperty(
						state,
						"Event",
						attributeLike,
						attributeCollection,
						extraAttributes.length > 0,
					);
				} else if (attributeName === "Change") {
					// handle [Roact.Change]
					generateRoactSymbolProperty(
						state,
						"Change",
						attributeLike,
						attributeCollection,
						extraAttributes.length > 0,
					);
				} else if (attributeName === "Ref") {
					// handle [Roact.Ref]
					generateRoactSymbolProperty(
						state,
						"Ref",
						attributeLike,
						attributeCollection,
						extraAttributes.length > 0,
					);
				} else {
					attributeCollection.push(`${attributeName} = ${value}`);
				}
			}
		}

		state.popIndent();

		// use Object.assign if we have extra attributes
		if (extraAttributeCollections.length > 0) {
			str += ", \n";
			state.pushIndent();

			state.usesTSLibrary = true;
			str += state.indent + "TS.Roact_combine(";

			// If it has other attributes
			if (attributeCollection.length > 0) {
				str += "{\n";

				state.pushIndent();
				str += state.indent + attributeCollection.join(",\n" + state.indent);
				state.popIndent();
				str += ` \n${state.indent}},\n${state.indent}`;
			} else {
				str += `{}, `;
			}

			str += extraAttributeCollections.join(",\n" + state.indent);
			str += ")\n";

			state.popIndent();
		} else {
			str += ", {\n";
			state.pushIndent();
			str += state.indent + attributeCollection.join(",\n" + state.indent);
			state.popIndent();
			str += ` \n${state.indent}}`;
		}
	} else {
		str += ", {}";
	}

	if (children.length > 0) {
		state.pushIndent();

		for (const child of children) {
			if (ts.TypeGuards.isJsxElement(child) || ts.TypeGuards.isJsxSelfClosingElement(child)) {
				const value = transpileExpression(state, child);
				childCollection.push(`${state.indent}${value}`);
			} else if (ts.TypeGuards.isJsxText(child)) {
				// If the inner text isn't just indentation/spaces
				if (child.getText().match(/[^\s]/)) {
					throw new TranspilerError(
						"Roact does not support text!",
						child,
						TranspilerErrorType.RoactJsxTextNotSupported,
					);
				}
			} else if (ts.TypeGuards.isJsxExpression(child)) {
				const expression = child.getExpressionOrThrow();
				if (ts.TypeGuards.isCallExpression(expression)) {
					// Must return Roact.Element :(
					const returnType = expression.getReturnType();
					if (isRoactElementType(returnType)) {
						if (isArrayType(returnType)) {
							// Roact.Element[]
							extraChildrenCollection.push(state.indent + transpileExpression(state, expression));
						} else {
							// Roact.Element
							extraChildrenCollection.push(
								state.indent + `{ ${transpileExpression(state, expression)} }`,
							);
						}
					} else {
						throw new TranspilerError(
							`Function call in an expression must return Roact.Element or Roact.Element[]`,
							expression,
							TranspilerErrorType.RoactInvalidCallExpression,
						);
					}
				} else if (ts.TypeGuards.isIdentifier(expression)) {
					const definitionNodes = expression.getDefinitionNodes();
					for (const definitionNode of definitionNodes) {
						const type = definitionNode.getType();
						if (isRoactElementType(type)) {
							extraChildrenCollection.push(state.indent + transpileExpression(state, expression));
						} else {
							throw new TranspilerError(
								`Roact does not support identifiers that have the return type ` + type.getText(),
								expression,
								TranspilerErrorType.RoactInvalidIdentifierExpression,
							);
						}
					}
				} else if (
					ts.TypeGuards.isPropertyAccessExpression(expression) ||
					ts.TypeGuards.isElementAccessExpression(expression)
				) {
					const propertyType = expression.getType();

					if (isRoactElementType(propertyType)) {
						extraChildrenCollection.push(transpileExpression(state, expression));
					} else {
						throw new TranspilerError(
							`Roact does not support the property type ` + propertyType.getText(),
							expression,
							TranspilerErrorType.RoactInvalidPropertyExpression,
						);
					}
				} else {
					throw new TranspilerError(
						`Roact does not support this type of expression ` +
							`{${expression.getText()}} (${expression.getKindName()})`,
						expression,
						TranspilerErrorType.RoactInvalidExpression,
					);
				}
			}
		}

		state.popIndent();

		if (extraChildrenCollection.length > 0) {
			state.usesTSLibrary = true;
			str += `, TS.Roact_combine(`;

			if (childCollection.length > 0) {
				str += "{\n" + state.indent;
				str += childCollection.join(",\n") + `\n${state.indent}}, `;
			}

			str += "\n";
			str += extraChildrenCollection.join(",\n") + `\n`;

			str += state.indent + ")";
			str += ")";
		} else {
			// state.pushIndent();
			str += state.indent + ", {\n";
			str += childCollection.join(",\n") + `\n${state.indent}})`;
		}
	} else {
		if (extraAttributeCollections.length > 0) {
			str += state.indent + ")";
		} else {
			str += ")";
		}
	}

	state.roactIndent--;

	if (key && state.roactIndent > 0) {
		return `[${key}] = ${str}`;
	} else {
		return str;
	}
}

export function transpileJsxElement(state: TranspilerState, node: ts.JsxElement): string {
	if (!state.hasRoactImport) {
		throw new TranspilerError(
			"Cannot use JSX without importing Roact first!\n" +
				suggest('To fix this, put `import * as Roact from "rbx-roact"` at the top of this file.'),
			node,
			TranspilerErrorType.RoactJsxWithoutImport,
		);
	}
	const open = node.getOpeningElement() as ts.JsxOpeningElement;
	const tagNameNode = open.getTagNameNode();
	const children = node.getJsxChildren();
	const isArrayExpressionParent = node.getParentIfKind(ts.ts.SyntaxKind.ArrayLiteralExpression);

	if (isArrayExpressionParent) {
		state.roactIndent++;
	}

	const element = generateRoactElement(state, tagNameNode, open.getAttributes(), children);

	if (isArrayExpressionParent) {
		state.roactIndent--;
	}

	return element;
}

export function transpileJsxSelfClosingElement(state: TranspilerState, node: ts.JsxSelfClosingElement): string {
	if (!state.hasRoactImport) {
		throw new TranspilerError(
			"Cannot use JSX without importing Roact first!\n" +
				suggest('To fix this, put `import * as Roact from "rbx-roact"` at the top of this file.'),
			node,
			TranspilerErrorType.RoactJsxWithoutImport,
		);
	}

	const tagNameNode = node.getTagNameNode();
	const isArrayExpressionParent = node.getParentIfKind(ts.ts.SyntaxKind.ArrayLiteralExpression);

	if (isArrayExpressionParent) {
		state.roactIndent++;
	}

	const element = generateRoactElement(state, tagNameNode, node.getAttributes(), []);

	if (isArrayExpressionParent) {
		state.roactIndent--;
	}

	return element;
}
