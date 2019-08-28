import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards } from "../utility/general";
import { bold, suggest } from "../utility/text";
import { getType, isArrayType, isMapType } from "../utility/type";

const ROACT_ELEMENT_TYPE = "Roact.Element";
export const ROACT_COMPONENT_TYPE = "Roact.Component";
export const ROACT_PURE_COMPONENT_TYPE = "Roact.PureComponent";
const ROACT_FRAGMENT_TYPE = "Roact.Fragment";

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

/**
 * Returns whether or not the type is of `Roact.Element` or `undefined`
 * @param type The type
 * @param allowsUndefined Allow undefined
 */
function isRoactElementType(type: ts.Type, allowsUndefined: boolean = true) {
	const unionTypeName = type.getText();
	return unionTypeName === ROACT_ELEMENT_TYPE || (unionTypeName === "undefined" && allowsUndefined);
}

/**
 * Will return true if it's `Roact.Element | undefined` or `Roact.Element`
 * @param unionTypes The union types
 */
function isValidRoactElementUnionType(type: ts.Type) {
	const unionTypes = type.getUnionTypes();
	for (const unionType of unionTypes) {
		if (!isRoactElementType(unionType)) {
			return false;
		}
	}

	return true;
}

function isValidRoactMapKey(type: ts.Type) {
	return type.isString() || type.isNumber();
}

/**
 * Returns whether or not the type matches `Map<string, Roact.Element>` or `Map<number, Roact.Element>`
 * @param type The type
 */
function isRoactElementMapType(type: ts.Type) {
	if (isMapType(type)) {
		const typeArgs = type.getTypeArguments();
		return (
			typeArgs.length === 2 &&
			isValidRoactMapKey(typeArgs[0]) &&
			(isValidRoactElementUnionType(typeArgs[1]) && isRoactElementType(typeArgs[1]))
		);
	} else {
		return false;
	}
}

/**
 * Returns whether or not the type matches `Array<Roact.Element>` or `Array<Roact.Element | undefined>`
 * @param type The type
 */
function isRoactElementArrayType(type: ts.Type) {
	if (isArrayType(type)) {
		if (isValidRoactElementUnionType(type) || type.getText() === ROACT_ELEMENT_TYPE) {
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

/**
 * Returns whether or not this is a valid roact child element type
 *
 * e.g. `Roact.Element`, `Map<string, Roact.Element>`, `Map<number, Roact.Element>`
 * or `Array<Roact.Element | undefined>`
 * @param type
 */
function isRoactChildElementType(type: ts.Type) {
	if (isRoactElementMapType(type) || isRoactElementArrayType(type) || isRoactElementType(type)) {
		return true;
	} else {
		return false;
	}
}

function getFullTypeList(type: ts.Type): Array<string> {
	const symbol = type.getSymbol();
	const typeArray = new Array<string>();
	if (symbol) {
		symbol.getDeclarations().forEach(declaration => {
			const declarationType = getType(declaration);
			typeArray.push(declarationType.getText());
			for (const baseType of declarationType.getBaseTypes()) {
				typeArray.push(...getFullTypeList(baseType));
			}
		});
	}

	return typeArray;
}

export function inheritsFromRoact(type: ts.Type): boolean {
	let isRoactClass = false;
	for (const name of getFullTypeList(type)) {
		if (name.startsWith(ROACT_COMPONENT_TYPE) || name.startsWith(ROACT_PURE_COMPONENT_TYPE)) {
			isRoactClass = true;
			break;
		}
	}
	return isRoactClass;
}

export function getRoactType(node: ts.ClassDeclaration | ts.ClassExpression) {
	const extendsExp = node.getExtends();
	if (extendsExp) {
		const extendsText = skipNodesDownwards(extendsExp.getExpression()).getText();
		if (extendsText.startsWith(ROACT_COMPONENT_TYPE)) {
			return ROACT_COMPONENT_TYPE;
		} else if (extendsText.startsWith(ROACT_PURE_COMPONENT_TYPE)) {
			return ROACT_PURE_COMPONENT_TYPE;
		}
	}
	return undefined;
}

export function inheritsFromRoactComponent(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
	const extendsExp = node.getExtends();
	if (extendsExp) {
		const symbol = extendsExp.getType().getSymbol();
		if (symbol) {
			const valueDec = symbol.getValueDeclaration();
			if (valueDec && (ts.TypeGuards.isClassDeclaration(valueDec) || ts.TypeGuards.isClassExpression(valueDec))) {
				if (getRoactType(node) !== undefined) {
					return true;
				} else {
					return inheritsFromRoactComponent(valueDec);
				}
			}
		}
	}
	return false;
}

export function checkRoactReserved(className: string, name: string, node: ts.Node<ts.ts.Node>) {
	if (RESERVED_METHOD_NAMES.indexOf(name) !== -1) {
		let userError = `Member ${bold(name)} in component ${bold(className)} is a reserved Roact method name.`;

		if (name === CONSTRUCTOR_METHOD_NAME) {
			userError += `\n ... Use the constructor ${bold("constructor(props)")} instead of the method ${bold(
				"init(props)",
			)}.`;
		} else if (name === INHERITANCE_METHOD_NAME) {
			userError += "\n" + ROACT_DERIVED_CLASSES_ERROR;
		}

		throw new CompilerError(userError, node, CompilerErrorType.RoactNoReservedMethods);
	}
}

function compileSymbolPropertyCallback(state: CompilerState, node: ts.Expression) {
	const symbol = node.getSymbolOrThrow();
	const name = symbol.getName();
	const value = symbol.getValueDeclarationOrThrow();

	if (ts.TypeGuards.isFunctionLikeDeclaration(value)) {
		if (ts.TypeGuards.isMethodDeclaration(value)) {
			throw new CompilerError(
				"Do not use Method signatures directly as callbacks for Roact Event, Changed or Ref.\n" +
					suggest(
						`Change the declaration of \`${name}(...) {...}\` to \`${name} = () => { ... }\`, ` +
							` or use an arrow function: \`() => { this.${name}() }\``,
					),
				node,
				CompilerErrorType.RoactInvalidCallExpression,
			);
		}
	}

	return compileExpression(state, node);
}

export function generateRoactSymbolProperty(
	state: CompilerState,
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
						value = compileSymbolPropertyCallback(state, rhs);
					} else {
						if (hasExtraAttributes) {
							state.pushIndent(); // fix indentation with extra props
						}
						value = compileExpression(state, rhs);
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
					value = compileSymbolPropertyCallback(state, innerExpression);
				} else {
					if (hasExtraAttributes) {
						state.pushIndent(); // fix indentation with extra props
					}
					value = compileExpression(state, getAccessExpression);
				}
			} else {
				if (hasExtraAttributes) {
					state.pushIndent(); // fix indentation with extra props
				}
				value = compileExpression(state, innerExpression);
			}

			if (hasExtraAttributes) {
				state.popIndent();
			}

			attributeCollection.push(`[Roact.Ref] = ${value}`);
		} else {
			throw new CompilerError(
				`Roact symbol ${roactSymbol} does not support (${innerExpression.getKindName()})`,
				node,
				CompilerErrorType.RoactInvalidSymbol,
			);
		}
	}
}

export function generateRoactElement(
	state: CompilerState,
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
	let isFragment = false;

	state.roactIndent++;

	if (name.match(/^[a-z]+$/)) {
		// if lowercase

		// Check if defined as a intrinsic mapping
		const rbxName = INTRINSIC_MAPPINGS[name];
		if (rbxName) {
			str += `"${rbxName}"`;
		} else {
			throw new CompilerError(
				`"${bold(name)}" is not a valid primitive type.\n` + suggest("Your roblox-ts may be out of date."),
				nameNode,
				CompilerErrorType.RoactInvalidPrimitive,
			);
		}
	} else if (name === ROACT_FRAGMENT_TYPE) {
		str = "Roact.createFragment(";
		isFragment = true;
	} else {
		str += name;
	}

	if (attributes.length > 0 && !isFragment) {
		state.pushIndent();

		const extraAttributes = attributes.filter(attr => ts.TypeGuards.isJsxSpreadAttribute(attr));

		for (const attributeLike of attributes) {
			if (ts.TypeGuards.isJsxSpreadAttribute(attributeLike)) {
				const expression = attributeLike.getExpression();
				extraAttributeCollections.push(compileExpression(state, expression));
			} else {
				const attribute = attributeLike as ts.JsxAttribute;
				const attributeName = attribute.getName();
				const value = compileExpression(state, attribute.getInitializerOrThrow());

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
		str += isFragment ? "" : ", {}";
	}

	if (children.length > 0) {
		state.pushIndent();

		for (const child of children) {
			if (ts.TypeGuards.isJsxElement(child) || ts.TypeGuards.isJsxSelfClosingElement(child)) {
				const value = compileExpression(state, child);
				childCollection.push(`${state.indent}${value}`);
			} else if (ts.TypeGuards.isJsxText(child)) {
				// If the inner text isn't just indentation/spaces
				if (child.getText().match(/[^\s]/)) {
					throw new CompilerError(
						"Roact does not support text!",
						child,
						CompilerErrorType.RoactJsxTextNotSupported,
					);
				}
			} else if (ts.TypeGuards.isJsxExpression(child)) {
				const expression = child.getExpressionOrThrow();
				if (ts.TypeGuards.isCallExpression(expression)) {
					// Must return Roact.Element :(
					const returnType = expression.getReturnType();
					if (isRoactChildElementType(returnType)) {
						if (isArrayType(returnType) || isMapType(returnType)) {
							// Roact.Element[]
							extraChildrenCollection.push(state.indent + compileExpression(state, expression));
						} else {
							// Roact.Element
							extraChildrenCollection.push(state.indent + `{ ${compileExpression(state, expression)} }`);
						}
					} else {
						throw new CompilerError(
							`Function call in an expression must return Roact.Element or Roact.Element[]`,
							expression,
							CompilerErrorType.RoactInvalidCallExpression,
						);
					}
				} else if (ts.TypeGuards.isIdentifier(expression)) {
					const definitionNodes = expression.getDefinitionNodes();
					for (const definitionNode of definitionNodes) {
						const type = getType(definitionNode);
						if (isRoactChildElementType(type)) {
							extraChildrenCollection.push(state.indent + compileExpression(state, expression));
						} else {
							throw new CompilerError(
								`Roact does not support identifiers that have the return type ` + type.getText(),
								expression,
								CompilerErrorType.RoactInvalidIdentifierExpression,
							);
						}
					}
				} else if (
					ts.TypeGuards.isPropertyAccessExpression(expression) ||
					ts.TypeGuards.isElementAccessExpression(expression)
				) {
					const propertyType = getType(expression);

					if (isRoactChildElementType(propertyType)) {
						extraChildrenCollection.push(compileExpression(state, expression));
					} else {
						throw new CompilerError(
							`Roact does not support the property type ` + propertyType.getText(),
							expression,
							CompilerErrorType.RoactInvalidPropertyExpression,
						);
					}
				} else {
					throw new CompilerError(
						`Roact does not support this type of expression ` +
							`{${expression.getText()}} (${expression.getKindName()})`,
						expression,
						CompilerErrorType.RoactInvalidExpression,
					);
				}
			}
		}

		state.popIndent();

		if (extraChildrenCollection.length > 0) {
			state.usesTSLibrary = true;
			str += isFragment ? `TS.Roact_combine(` : `, TS.Roact_combine(`;

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
			str += state.indent + isFragment ? "{\n" : ", {\n";
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

export function compileJsxElement(state: CompilerState, node: ts.JsxElement): string {
	if (!state.hasRoactImport) {
		throw new CompilerError(
			"Cannot use JSX without importing Roact first!\n" +
				suggest('To fix this, put `import Roact from "@rbxts/roact"` at the top of this file.'),
			node,
			CompilerErrorType.RoactJsxWithoutImport,
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

export function compileJsxSelfClosingElement(state: CompilerState, node: ts.JsxSelfClosingElement): string {
	if (!state.hasRoactImport) {
		throw new CompilerError(
			"Cannot use JSX without importing Roact first!\n" +
				suggest('To fix this, put `import Roact from "@rbxts/roact"` at the top of this file.'),
			node,
			CompilerErrorType.RoactJsxWithoutImport,
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
