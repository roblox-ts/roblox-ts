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
const RESERVED_METHOD_NAMES = new Set([
	CONSTRUCTOR_METHOD_NAME,
	"setState",
	"getElementTraceback",
	INHERITANCE_METHOD_NAME,
]);

/**
 * A list of lowercase names that map to Roblox elements for JSX
 */
const INTRINSIC_MAPPINGS: { [name: string]: string } = {
	// Frames
	frame: "Frame",
	scrollingframe: "ScrollingFrame",
	viewportframe: "ViewportFrame",

	// LayerCollectors
	billboardgui: "BillboardGui",
	screengui: "ScreenGui",
	surfacegui: "SurfaceGui",

	// Images
	imagebutton: "ImageButton",
	imagelabel: "ImageLabel",

	// Text
	textbox: "TextBox",
	textbutton: "TextButton",
	textlabel: "TextLabel",

	// Layouts
	uigridlayout: "UIGridLayout",
	uiinlinelayout: "UIInlineLayout",
	uilistlayout: "UIListLayout",
	uipagelayout: "UIPageLayout",
	uitablelayout: "UITableLayout",

	// Scaling & Padding
	uipadding: "UIPadding",
	uiscale: "UIScale",

	// Constraints
	uiaspectratioconstraint: "UIAspectRatioConstraint",
	uisizeconstraint: "UISizeConstraint",
	uitextsizeconstraint: "UITextSizeConstraint",

	// Other
	camera: "Camera",
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
 * Returns whether or not this is a valid conditional expression for Roact JSX
 * @param node The conditional expression
 */
function isValidRoactConditionalExpression(node: ts.ConditionalExpression) {
	const ifTrue = node.getWhenTrue();
	const ifFalse = node.getWhenFalse();
	return isRoactElementType(ifTrue.getType()) && isRoactElementType(ifFalse.getType());
}

/**
 * Returns whether or not this is a valid binary expression for Roact JSX
 * @param node The binary expression
 */
function isValidRoactBinaryExpression(node: ts.BinaryExpression) {
	const rawRhs = node.getRight();

	if (isRoactElementType(rawRhs.getType())) {
		return true;
	} else {
		return false;
	}
}

/**
 * Will return true if it's `Roact.Element | undefined` or `Roact.Element`
 * @param unionTypes The union types
 */
function isRoactElementUnionType(type: ts.Type) {
	const unionTypes = type.getUnionTypes();
	for (const unionType of unionTypes) {
		if (!isRoactElementType(unionType) && !isRoactElementArrayType(unionType)) {
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
			(isRoactElementUnionType(typeArgs[1]) && isRoactElementType(typeArgs[1]))
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
		if (isRoactElementUnionType(type) || type.getText() === ROACT_ELEMENT_TYPE) {
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
	if (
		isRoactElementMapType(type) ||
		isRoactElementArrayType(type) ||
		isRoactElementType(type) ||
		isRoactElementUnionType(type)
	) {
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

/**
 * Returns whether or not this type inherits a Roact.Component
 * @param type The type
 */
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

/**
 * Returns the Roact class type of the class declaration or expression
 * @param classNode The class declaration or expression
 */
export function getRoactType(classNode: ts.ClassDeclaration | ts.ClassExpression) {
	const extendsExp = classNode.getExtends();
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

/**
 * Whether or not this class declaration / expression inherits Roact.Component
 * @param classNode The class declaration or expression
 */
export function inheritsFromRoactComponent(classNode: ts.ClassDeclaration | ts.ClassExpression): boolean {
	const extendsExp = classNode.getExtends();
	if (extendsExp) {
		const symbol = extendsExp.getType().getSymbol();
		if (symbol) {
			const valueDec = symbol.getValueDeclaration();
			if (valueDec && (ts.TypeGuards.isClassDeclaration(valueDec) || ts.TypeGuards.isClassExpression(valueDec))) {
				if (getRoactType(classNode) !== undefined) {
					return true;
				} else {
					return inheritsFromRoactComponent(valueDec);
				}
			}
		}
	}
	return false;
}

/**
 * Checks to see if the name is a reserved roact keyword
 * @param className The class name
 * @param name The name of the member
 * @param node The node
 */
export function checkRoactReserved(className: string, name: string, node: ts.Node) {
	if (name.startsWith("__")) {
		throw new CompilerError(
			`Members with underscores in Roact like '${bold(className)}.${bold(
				name,
			)}' are only for internal use, and thus cannot be used.`,
			node,
			CompilerErrorType.RoactNoReservedMethods,
		);
	}

	if (RESERVED_METHOD_NAMES.has(name)) {
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

/**
 * Compiles a symbol property / callback
 * @param state The state
 * @param expression The expression
 */
function compileSymbolPropertyCallback(state: CompilerState, expression: ts.Expression) {
	const symbol = expression.getSymbolOrThrow();
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
				expression,
				CompilerErrorType.RoactInvalidCallExpression,
			);
		}
	}

	return compileExpression(state, expression);
}

/**
 * Joins the array of strings and wraps it in a Lua table
 * @param state The state
 * @param array The array of strings to join
 */
function joinAndWrapInTable(state: CompilerState, array: Array<string>) {
	if (array.length > 0) {
		return "{\n" + array.join(`,\n`) + ",\n" + state.indent + "}";
	} else {
		return "{}";
	}
}

/**
 * Joins the array of strings and wraps it in a TS.Roact_combine
 * @param state The state
 * @param stack The array of strings to join
 */
function joinAndWrapInRoactCombine(state: CompilerState, stack: Array<string>) {
	return `TS.Roact_combine(` + `\n` + stack.join(",\n") + `\n` + state.indent + `)`;
}

/**
 * Compiles a Roact JSX call expression
 * @param state The state
 * @param expression The call expression
 */
function compileRoactJsxCallExpression(state: CompilerState, expression: ts.CallExpression) {
	state.roactElementStack.push("CallExpression");
	const result = compileExpression(state, expression);
	state.roactElementStack.pop();
	return result;
}

/**
 * Transpiles a roact JSX expression
 * @param state The compiler state
 * @param expression The expression
 */
function compileRoactJsxExpression(state: CompilerState, expression: ts.Expression): string {
	if (ts.TypeGuards.isCallExpression(expression)) {
		const returnType = expression.getReturnType();

		// If returns Roact.Element or Roact.Element[]
		if (isRoactChildElementType(returnType)) {
			if (isArrayType(returnType)) {
				return state.indent + compileRoactJsxCallExpression(state, expression);
			} else {
				return state.indent + "{ " + compileRoactJsxCallExpression(state, expression) + " }";
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
				return state.indent + compileExpression(state, expression);
			} else {
				throw new CompilerError(
					`Roact does not support identifiers that have the return type ` + type.getText(),
					expression,
					CompilerErrorType.RoactInvalidIdentifierExpression,
				);
			}
		}

		return "";
	} else if (
		ts.TypeGuards.isPropertyAccessExpression(expression) ||
		ts.TypeGuards.isElementAccessExpression(expression)
	) {
		const propertyType = getType(expression);

		if (isRoactChildElementType(propertyType)) {
			return state.indent + compileExpression(state, expression);
		} else {
			throw new CompilerError(
				`Roact does not support the property type ` + propertyType.getText(),
				expression,
				CompilerErrorType.RoactInvalidPropertyExpression,
			);
		}
	} else if (ts.TypeGuards.isBinaryExpression(expression)) {
		if (isValidRoactBinaryExpression(expression)) {
			state.enterPrecedingStatementContext();

			const lhs = expression.getLeft();
			const rhs = expression.getRight();
			state.roactElementStack.push("BinaryExpression");
			const result = compileExpression(state, lhs) + " and " + compileExpression(state, rhs) + " or nil";
			state.roactElementStack.pop();
			return state.indent + "{ " + state.exitPrecedingStatementContextAndJoin() + result + " }";
		} else {
			const right = expression
				.getRight()
				.getType()
				.getText();
			throw new CompilerError(
				`Invalid right-hand to Roact Binary expression '${right}' - Must be of type Roact.Element or return Roact.Element`,
				expression,
				CompilerErrorType.RoactInvalidExpression,
			);
		}
	} else if (ts.TypeGuards.isConditionalExpression(expression)) {
		if (isValidRoactConditionalExpression(expression)) {
			state.roactElementStack.push("ConditionalExpression");
			const result = state.indent + compileExpression(state, expression);

			state.roactElementStack.pop();

			return result;
		} else {
			throw new CompilerError(
				`Conditional expression must return Roact.Element or undefined`,
				expression,
				CompilerErrorType.RoactInvalidExpression,
			);
		}
	} else if (ts.TypeGuards.isJsxSelfClosingElement(expression) || ts.TypeGuards.isJsxElement(expression)) {
		let str = state.indent + "{\n";
		state.pushIndent();
		str += state.indent + compileExpression(state, expression);
		state.popIndent();
		str += "\n" + state.indent + "}";
		return str;
	} else {
		throw new CompilerError(
			`Roact does not support this type of expression ` +
				`{${expression.getText()}} (${expression.getKindName()})`,
			expression,
			CompilerErrorType.RoactInvalidExpression,
		);
	}
}

const RoactCustomProps = new Set(["event", "change", "ref", "Event", "Change", "Ref"]);

/**
 * Generates the attributes for a roact element
 * @param state The compiler state
 * @param attributesCollection The attributes for the roact element
 */
function generateRoactAttributes(state: CompilerState, attributesCollection: Array<ts.JsxAttributeLike>) {
	const attributeCombineStack = new Array<string>();
	let attributeStack = new Array<string>();
	let useRoactCombine = false;

	// Check to see if we should use Roact_combine for the attributes
	for (const attributeLike of attributesCollection) {
		if (ts.TypeGuards.isJsxSpreadAttribute(attributeLike)) {
			useRoactCombine = true;
		}
	}

	state.pushIndent();

	for (const attributeLike of attributesCollection) {
		if (ts.TypeGuards.isJsxSpreadAttribute(attributeLike)) {
			if (attributeStack.length > 0) {
				attributeCombineStack.push(state.indent + joinAndWrapInTable(state, attributeStack));
				attributeStack = new Array<string>();
			}

			const expression = attributeLike.getExpression();
			attributeCombineStack.push(state.indent + compileExpression(state, expression));
		} else {
			if (useRoactCombine) {
				state.pushIndent();
			}

			const attribute = attributeLike as ts.JsxAttribute;
			const attributeName = attribute.getName();
			const attributeType = attribute.getType();

			let value;
			if (attributeType.isBooleanLiteral()) {
				// Allow <Component BooleanValue/> (implicit form of <Component BooleanValue={true}/>)
				const initializer = attribute.getInitializer();
				value = initializer ? compileExpression(state, initializer) : attributeType.getText();
			} else {
				value = compileExpression(state, attribute.getInitializerOrThrow());
			}

			if (RoactCustomProps.has(attributeName)) {
				generateRoactSymbolAttribute(state, attributeName, attribute, attributeStack);
			} else if (attributeName === "key" || attributeName === "Key") {
				state.roactKeyStack.push(value);
			} else {
				attributeStack.push(state.indent + attributeName + " = " + value);
			}

			if (useRoactCombine) {
				state.popIndent();
			}
		}
	}

	state.popIndent();

	if (attributeCombineStack.length >= 1) {
		if (attributeStack.length > 0) {
			state.pushIndent();
			attributeCombineStack.push(state.indent + joinAndWrapInTable(state, attributeStack));
			state.popIndent();
		}

		return state.indent + joinAndWrapInRoactCombine(state, attributeCombineStack);
	} else {
		return state.indent + joinAndWrapInTable(state, attributeStack);
	}
}

type RoactSymbol = "Event" | "Change" | "Ref" | "event" | "change" | "ref" | "style";

function toTitle(str: string) {
	return str.substr(0, 1).toUpperCase() + str.substr(1);
}

function getInlineObjectProperties(
	state: CompilerState,
	roactSymbol: RoactSymbol,
	properties: Array<ts.ObjectLiteralElementLike>,
	attributesStack: Array<string>,
) {
	for (const property of properties) {
		if (ts.TypeGuards.isPropertyAssignment(property) || ts.TypeGuards.isShorthandPropertyAssignment(property)) {
			const propName = property.getName();
			const rhs = property.getInitializerOrThrow();
			let value: string;

			if (ts.TypeGuards.isPropertyAccessExpression(rhs)) {
				value = compileSymbolPropertyCallback(state, rhs);
			} else {
				value = compileExpression(state, rhs);
			}

			attributesStack.push(state.indent + `[Roact.${toTitle(roactSymbol)}.${propName}] = ${value}`);
		}
	}
}

function getIdentifierObjectProperties(
	state: CompilerState,
	roactSymbol: RoactSymbol,
	identifier: ts.Identifier,
	attributesStack: Array<string>,
) {
	const definitionNodes = identifier.getDefinitionNodes();
	for (const definitionNode of definitionNodes) {
		const literalExpressions = definitionNode.getChildrenOfKind(ts.SyntaxKind.ObjectLiteralExpression);
		if (literalExpressions.length > 0) {
			for (const literalExpression of literalExpressions) {
				for (const property of literalExpression.getProperties()) {
					if (
						ts.TypeGuards.isPropertyAssignment(property) ||
						ts.TypeGuards.isShorthandPropertyAssignment(property)
					) {
						const propName = property.getName();
						attributesStack.push(
							state.indent +
								`[Roact.${toTitle(roactSymbol)}.${propName}] = ${compileExpression(
									state,
									identifier,
								)}.${propName}`,
						);
					}
				}
			}
		}
	}
}

/**
 * Generates the specified roact symbol attribute, and places it into `attrs`
 * @param state The state
 * @param roactSymbol The Roact symbol
 * @param attributeNode The attribute node
 * @param attributesStack The attribute stack
 */
export function generateRoactSymbolAttribute(
	state: CompilerState,
	roactSymbol: string,
	attributeNode: ts.JsxAttribute,
	attributesStack: Array<string>,
) {
	const expr = attributeNode.getChildrenOfKind(ts.SyntaxKind.JsxExpression);

	for (const expression of expr) {
		const innerExpression = expression.getExpressionOrThrow();

		if (
			roactSymbol === "event" ||
			roactSymbol === "change" ||
			roactSymbol === "Event" ||
			roactSymbol === "Change"
		) {
			if (ts.TypeGuards.isObjectLiteralExpression(innerExpression)) {
				const properties = innerExpression.getProperties();
				getInlineObjectProperties(state, roactSymbol, properties, attributesStack);
			} else if (ts.TypeGuards.isIdentifier(innerExpression)) {
				getIdentifierObjectProperties(state, roactSymbol, innerExpression, attributesStack);
			} else {
				throw new CompilerError(
					`Invalid value supplied to ${roactSymbol} ${innerExpression.getKindName()}`,
					attributeNode,
					CompilerErrorType.RoactInvalidSymbol,
				);
			}
		} else if (roactSymbol === "ref" || roactSymbol === "Ref") {
			let value: string;

			if (ts.TypeGuards.isPropertyAccessExpression(innerExpression)) {
				const getAccessExpression = innerExpression.getExpression();
				if (ts.TypeGuards.isThisExpression(getAccessExpression)) {
					value = compileSymbolPropertyCallback(state, innerExpression);
				} else {
					value = compileExpression(state, getAccessExpression);
				}
			} else {
				value = compileExpression(state, innerExpression);
			}

			attributesStack.push(state.indent + `[Roact.Ref] = ${value}`);
		} else {
			throw new CompilerError(
				`Roact symbol ${roactSymbol} does not support (${innerExpression.getKindName()})`,
				attributeNode,
				CompilerErrorType.RoactInvalidSymbol,
			);
		}
	}
}

/**
 * Generates the children for a Roact Element
 * @param state The compiler state
 * @param isFragment Whether or not this is children for a Roact.Fragment
 * @param childCollection The children
 */
function generateRoactChildren(state: CompilerState, isFragment: boolean, childCollection: Array<ts.JsxChild>) {
	const roactCombineStack = new Array<string>();

	let childStack = new Array<string>();

	let useRoactCombine = false;
	for (const child of childCollection) {
		if (ts.TypeGuards.isJsxExpression(child)) {
			useRoactCombine = true;
		}
	}

	state.pushIndent();

	for (const child of childCollection) {
		if (ts.TypeGuards.isJsxElement(child) || ts.TypeGuards.isJsxSelfClosingElement(child)) {
			if (useRoactCombine) {
				state.pushIndent();
			}

			const value = compileExpression(state, child);
			childStack.push(state.indent + value);

			if (useRoactCombine) {
				state.popIndent();
			}
		} else if (ts.TypeGuards.isJsxExpression(child)) {
			if (childStack.length > 0) {
				roactCombineStack.push(state.indent + joinAndWrapInTable(state, childStack));
				childStack = new Array();
			}

			// If there's no expression, it will be a comment.
			const expression = child.getExpression();
			if (expression) {
				roactCombineStack.push(compileRoactJsxExpression(state, expression));
			}
		} else if (ts.TypeGuards.isJsxText(child)) {
			if (child.getText().match(/[^\s]/)) {
				throw new CompilerError(
					"Roact does not support text!",
					child,
					CompilerErrorType.RoactJsxTextNotSupported,
				);
			}
		}
	}

	state.popIndent();

	if (roactCombineStack.length >= 1) {
		if (childStack.length > 0) {
			state.pushIndent();
			roactCombineStack.push(state.indent + joinAndWrapInTable(state, childStack));
			state.popIndent();
		}

		if (roactCombineStack.length > 1) {
			return state.indent + joinAndWrapInRoactCombine(state, roactCombineStack);
		} else {
			return (isFragment ? "" : state.indent) + roactCombineStack.join(",\n").trim();
		}
	}
	return (isFragment ? "" : state.indent) + joinAndWrapInTable(state, childStack);
}

/**
 * The new and improved Roact.Element generator
 * @param state The state
 * @param nameNode The name node
 * @param attributesCollection The attributes of the JSX element
 * @param childCollection The children of the JSX element
 */
function generateRoactElement(
	state: CompilerState,
	nameNode: ts.JsxTagNameExpression,
	attributesCollection: Array<ts.JsxAttributeLike>,
	childCollection: Array<ts.JsxChild>,
): string {
	const jsxName = nameNode.getText();
	let isFragment = false;
	let preWrap = "";
	let functionName = "Roact.createElement";
	let postWrap = "";

	const parentType = state.roactGetElementType(-1);

	// All arguments to Roact will end up here!
	const elementArguments = new Array<string>();

	if (jsxName === ROACT_FRAGMENT_TYPE) {
		isFragment = true;
		functionName = "Roact.createFragment";
	} else if (jsxName.match(/^[a-z]+$/)) {
		const contextualType = nameNode.getContextualType();

		const intrinsicLikeTypes = contextualType && contextualType.getText().match(/RbxJsxIntrinsicProps<([A-z]+)>/);
		if (intrinsicLikeTypes) {
			const intrinsicInstanceId = intrinsicLikeTypes[1];
			elementArguments.push(`"${intrinsicInstanceId}"`);
		} else {
			const rbxName = INTRINSIC_MAPPINGS[jsxName];
			if (rbxName !== undefined) {
				elementArguments.push(`"${rbxName}"`);
			} else {
				throw new CompilerError(
					`"${bold(jsxName)}" is not a valid primitive type.\n` +
						suggest("Your roblox-ts may be out of date."),
					nameNode,
					CompilerErrorType.RoactInvalidPrimitive,
				);
			}
		}
	} else {
		elementArguments.push(jsxName);
	}

	state.roactElementStack.push(isFragment ? "Fragment" : "Element");
	state.pushIndent();

	if (attributesCollection.length > 0 || childCollection.length > 0) {
		if (isFragment) {
			generateRoactAttributes(state, attributesCollection);
		} else {
			const statement = generateRoactAttributes(state, attributesCollection);
			elementArguments.push(statement);
		}
	}

	let hasKey = false;
	let key = "";
	if (state.roactKeyStack.length > 0) {
		const parentStackType = state.roactGetElementType(-2);

		key = state.roactKeyStack.pop()!;
		hasKey = true;
		if (state.roactElementStack.length === 1) {
			preWrap += "Roact.createFragment({ " + `[${key}] = `;
			postWrap += " })";
		} else if (parentStackType === "BinaryExpression") {
			state.pushPrecedingStatements(nameNode, `[${key}] = `);
			hasKey = false;
		} else if (parentStackType !== "CallExpression" && parentStackType !== "ConditionalExpression") {
			preWrap += `[${key}] = `;
		}
	}

	if (childCollection.length > 0 || isFragment) {
		elementArguments.push(generateRoactChildren(state, isFragment, childCollection));
	}

	state.roactElementStack.pop();

	if (hasKey) {
		if (parentType === "CallExpression" || parentType === "ConditionalExpression") {
			preWrap += "Roact.createFragment({ " + `[${key}] = `;
			postWrap += " })";
		} else if (parentType === "BinaryExpression") {
			preWrap = `[${key}] = `;
		}
	}

	state.popIndent();

	if (elementArguments.length > 1 || isFragment) {
		return (
			preWrap +
			functionName +
			"(\n" +
			state.indent +
			"\t" +
			elementArguments.join(",\n") +
			"\n" +
			state.indent +
			")" +
			postWrap
		);
	} else {
		return preWrap + functionName + "(" + elementArguments.join(",\n") + ")" + postWrap;
	}
}

export type RoactElementType =
	| "Element"
	| "ArrayExpression"
	| "Fragment"
	| "CallExpression"
	| "BinaryExpression"
	| "ConditionalExpression";

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

	const element = generateRoactElement(state, tagNameNode, open.getAttributes(), children);

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
		state.roactElementStack.push("ArrayExpression");
	}

	const element = generateRoactElement(state, tagNameNode, node.getAttributes(), []);

	if (isArrayExpressionParent) {
		state.roactElementStack.pop();
	}

	return element;
}
