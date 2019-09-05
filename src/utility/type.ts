import * as ts from "ts-morph";
import { CompilerDirective, getCompilerDirective, isIdentifierDefinedInConst } from "../compiler";
import { PrecedingStatementContext } from "../CompilerState";
import { skipNodesDownwards, skipNodesUpwardsLookAhead } from "./general";

const RBX_SERVICES = new Set([
	"AssetService",
	"BadgeService",
	"Chat",
	"CollectionService",
	"ContentProvider",
	"ContextActionService",
	"DataStoreService",
	"Debris",
	"GamePassService",
	"GroupService",
	"GuiService",
	"HapticService",
	"HttpService",
	"InsertService",
	"KeyframeSequenceProvider",
	"Lighting",
	"LocalizationService",
	"LogService",
	"MarketplaceService",
	"PathfindingService",
	"PhysicsService",
	"Players",
	"PointsService",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"RunService",
	"ScriptContext",
	"Selection",
	"ServerScriptService",
	"ServerStorage",
	"SoundService",
	"StarterGui",
	"StarterPlayer",
	"Stats",
	"Teams",
	"TeleportService",
	"TestService",
	"TextService",
	"TweenService",
	"UserInputService",
	"VRService",
	"Workspace",
]);

export function isRbxService(name: string) {
	return RBX_SERVICES.has(name);
}

export function isTypeStatement(node: ts.Node) {
	return (
		// Classes which implement
		(ts.TypeGuards.isHeritageClause(node) && node.getToken() === ts.SyntaxKind.ImplementsKeyword) ||
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeReferenceNode(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node) ||
		(ts.TypeGuards.isEnumDeclaration(node) && node.isConstEnum())
	);
}

/** Helper function which determines whether a given node is a type.
 * Note: This assumes that if `node` is a const enum then it is the bottom-level identifer.
 * If this receives a propertyAccess or elementAccess to a const enum, it will return false.
 */
function isType(node: ts.Node) {
	return (
		isTypeStatement(node) ||
		node
			.getAncestors()
			.some(ancestor => ancestor.getKind() === ts.SyntaxKind.TypeQuery || isTypeStatement(ancestor)) ||
		// if it is a const enum, it is always a type, even if it isn't a type >:)
		(ts.TypeGuards.isIdentifier(node) &&
			node.getDefinitions().some(def =>
				def
					.getNode()
					.getAncestors()
					.some(ancestor => ts.TypeGuards.isEnumDeclaration(ancestor) && ancestor.isConstEnum()),
			))
	);
}

export function isUsedExclusivelyAsType(node: ts.Identifier) {
	try {
		for (const refSymbol of node.findReferences()) {
			for (const refEntry of refSymbol.getReferences()) {
				if (refEntry.getSourceFile() === node.getSourceFile()) {
					const ref = skipNodesDownwards(refEntry.getNode());
					const isInImportStatement = ref.getFirstAncestorByKind(ts.SyntaxKind.ImportDeclaration);

					// We want to check all references in this file to see whether this identifier is ever used as a value.
					// Import statements, however, don't count.
					if (!isInImportStatement) {
						const isInExportStatement = ref.getFirstAncestor(
							ancestor =>
								ts.TypeGuards.isExportAssignment(ancestor) ||
								ts.TypeGuards.isExportDeclaration(ancestor),
						);

						// If it is in an export statement, then it does count, but only if there is a value-version of the identifier.
						// Otherwise, if the ref is a non-type, then it counts
						if (
							isInExportStatement
								? ts.TypeGuards.isIdentifier(ref) &&
								  ref.getDefinitions().some(def => !isType(def.getNode()))
								: !isType(ref)
						) {
							return false;
						}
					}
				}
			}
		}
	} catch (e) {
		// https://github.com/dsherret/ts-morph/issues/650
		return false;
	}
	return true;
}

export function inheritsFrom(type: ts.Type, className: string): boolean {
	const symbol = type.getSymbol();
	if (symbol) {
		if (symbol.getName() === className) {
			return true;
		}
		const declarations = symbol.getDeclarations();
		for (const declaration of declarations) {
			if (!ts.TypeGuards.isSourceFile(declaration)) {
				const decType = getType(declaration);
				const decBaseTypes = decType.getBaseTypes();
				for (const baseType of decBaseTypes) {
					if (inheritsFrom(baseType, className)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

export function isTypeOnlyNamespace(node: ts.NamespaceDeclaration) {
	const statements = node.getStatements();
	for (const statement of statements) {
		if (!ts.TypeGuards.isNamespaceDeclaration(statement) && !isType(statement)) {
			return false;
		}
	}
	for (const statement of statements) {
		if (ts.TypeGuards.isNamespaceDeclaration(statement) && !isTypeOnlyNamespace(statement)) {
			return false;
		}
	}
	return true;
}

export function typeConstraint(type: ts.Type, cb: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.getUnionTypes().every(t => typeConstraint(t, cb));
	} else if (type.isIntersection()) {
		return type.getIntersectionTypes().some(t => typeConstraint(t, cb));
	} else {
		return cb(type);
	}
}

export function laxTypeConstraint(type: ts.Type, cb: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.getUnionTypes().some(t => laxTypeConstraint(t, cb));
	} else if (type.isIntersection()) {
		return type.getIntersectionTypes().some(t => laxTypeConstraint(t, cb));
	} else {
		return cb(type);
	}
}

export function strictTypeConstraint(type: ts.Type, cb: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.getUnionTypes().every(t => strictTypeConstraint(t, cb));
	} else if (type.isIntersection()) {
		return type.getIntersectionTypes().every(t => strictTypeConstraint(t, cb));
	} else {
		return cb(type);
	}
}

function isSomeType(
	type: ts.Type,
	typeConstraintChecker: (type: ts.Type, cb: (type: ts.Type) => boolean) => boolean,
	cb: (type: ts.Type) => boolean,
) {
	if (typeConstraintChecker(type, cb)) {
		return true;
	} else {
		const constraint = type.getConstraint();
		if (constraint) {
			return typeConstraintChecker(constraint, cb);
		}
	}
	return false;
}

const check = (t: ts.Type, c: (t: ts.Type) => boolean) => c(t);

export function isAnyType(type: ts.Type) {
	return isSomeType(type, check, t => t.getText() === "any");
}

export function isNullableType(type: ts.Type) {
	return isSomeType(type, laxTypeConstraint, t => t.isNullable() || t.isUndefined());
}

export function isBooleanType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => t.isBoolean() || t.isBooleanLiteral());
}

export function isBoolishTypeLax(type: ts.Type) {
	return isSomeType(
		type,
		laxTypeConstraint,
		t => t.isBoolean() || t.isBooleanLiteral() || t.isNullable() || t.isUndefined(),
	);
}

export function isBooleanTypeStrict(type: ts.Type) {
	return isSomeType(type, strictTypeConstraint, t => t.isBoolean() || t.isBooleanLiteral());
}

export function isUnknowableType(type: ts.Type) {
	return isSomeType(type, laxTypeConstraint, t => t.isUnknown() || t.isAny());
}

export function isNumberType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => t.isNumber() || t.isNumberLiteral());
}

export function isNumberTypeStrict(type: ts.Type) {
	return isSomeType(type, strictTypeConstraint, t => t.isNumber() || t.isNumberLiteral());
}

export function isNumberTypeLax(type: ts.Type) {
	return isSomeType(type, laxTypeConstraint, t => t.isNumber());
}

export function isLiterally0Lax(type: ts.Type) {
	return isSomeType(type, laxTypeConstraint, t => t.isNumberLiteral() && t.getText() === `0`);
}

export function isNumericLiteralTypeStrict(type: ts.Type) {
	return isSomeType(type, strictTypeConstraint, t => t.isNumberLiteral());
}

export function isStringType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => t.isString() || t.isStringLiteral());
}

export function isFalsyStringTypeLax(type: ts.Type) {
	return isSomeType(type, laxTypeConstraint, t => t.isString() || (t.isStringLiteral() && t.getText() === `""`));
}

export function isObjectType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => t.isObject());
}

export function isEnumType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => {
		const symbol = t.getSymbol();
		return symbol !== undefined && symbol.getDeclarations().some(d => ts.TypeGuards.isEnumDeclaration(d));
	});
}

export function isGeneratorType(type: ts.Type) {
	return isSomeType(type, typeConstraint, t => {
		const symbol = t.getSymbol();
		if (symbol) {
			const name = symbol.getEscapedName();
			return name === "Generator" || name === "IterableIterator";
		}
		return false;
	});
}

export function isIterableFunctionType(type: ts.Type) {
	return isSomeType(type, check, t => {
		const symbol = t.getAliasSymbol();
		return symbol ? symbol.getEscapedName() === "IterableFunction" : false;
	});
}

function getCompilerDirectiveHelper(
	type: ts.Type,
	directive: CompilerDirective,
	orCallback: (t: ts.Type) => boolean,
	t: ts.Type,
) {
	const symbol = t.getSymbol();

	if ((symbol !== undefined && getCompilerDirective(symbol, [directive]) === directive) || orCallback(t)) {
		return true;
	} else {
		if (type.isTypeParameter()) {
			const constraint = type.getConstraint();
			if (constraint) {
				return getCompilerDirectiveWithConstraint(constraint, directive, orCallback);
			}
		}
		return false;
	}
}

function getCompilerDirectiveWithSomeConstraint(
	someTypeConstraint: (type: ts.Type<ts.ts.Type>, cb: (type: ts.Type<ts.ts.Type>) => boolean) => boolean,
	type: ts.Type,
	directive: CompilerDirective,
	orCallback = (t: ts.Type) => false,
) {
	return someTypeConstraint(type, t => getCompilerDirectiveHelper(type, directive, orCallback, t));
}

export function getCompilerDirectiveWithConstraint(
	type: ts.Type,
	directive: CompilerDirective,
	orCallback = (t: ts.Type) => false,
): boolean {
	return (
		getCompilerDirectiveWithSomeConstraint(typeConstraint, type, directive, orCallback) ||
		getCompilerDirectiveWithSomeConstraint(typeConstraint, type.getApparentType(), directive, orCallback)
	);
}

export function getCompilerDirectiveWithStrictConstraint(
	type: ts.Type,
	directive: CompilerDirective,
	orCallback = (t: ts.Type) => false,
): boolean {
	return (
		getCompilerDirectiveWithSomeConstraint(strictTypeConstraint, type, directive, orCallback) ||
		getCompilerDirectiveWithSomeConstraint(strictTypeConstraint, type.getApparentType(), directive, orCallback)
	);
}

export function getCompilerDirectiveWithLaxConstraint(
	type: ts.Type,
	directive: CompilerDirective,
	orCallback = (t: ts.Type) => false,
): boolean {
	return (
		getCompilerDirectiveWithSomeConstraint(laxTypeConstraint, type, directive, orCallback) ||
		getCompilerDirectiveWithSomeConstraint(laxTypeConstraint, type.getApparentType(), directive, orCallback)
	);
}

export function superExpressionClassInheritsFromSetOrMap(node: ts.Expression) {
	for (const constructSignature of getType(node).getConstructSignatures()) {
		const returnType = constructSignature.getReturnType();
		if (
			getCompilerDirectiveWithConstraint(returnType, CompilerDirective.Set) ||
			getCompilerDirectiveWithConstraint(returnType, CompilerDirective.Map)
		) {
			return true;
		}
	}
	return false;
}

export function superExpressionClassInheritsFromArray(node: ts.Expression, recursive = true) {
	const type = getType(node);
	for (const constructSignature of type.getConstructSignatures()) {
		if (
			getCompilerDirectiveWithConstraint(
				constructSignature.getReturnType(),
				CompilerDirective.Array,
				t => t.isArray() || t.isTuple(),
			)
		) {
			return true;
		}
	}

	return recursive && inheritsFromArray(type);
}

export function classDeclarationInheritsFromArray(
	classExp: ts.ClassDeclaration | ts.ClassExpression,
	recursive = true,
) {
	const extendsExp = classExp.getExtends();
	return extendsExp ? superExpressionClassInheritsFromArray(extendsExp.getExpression(), recursive) : false;
}

function inheritsFromArray(type: ts.Type) {
	const symbol = type.getSymbol();

	if (symbol) {
		for (const declaration of symbol.getDeclarations()) {
			if (ts.TypeGuards.isClassDeclaration(declaration) && classDeclarationInheritsFromArray(declaration)) {
				return true;
			}
		}
	}

	return false;
}

export function isArrayTypeLax(type: ts.Type) {
	return getCompilerDirectiveWithLaxConstraint(
		type,
		CompilerDirective.Array,
		t => t.isArray() || t.isTuple() || inheritsFromArray(type),
	);
}

export function isArrayType(type: ts.Type) {
	return getCompilerDirectiveWithConstraint(
		type,
		CompilerDirective.Array,
		t => t.isArray() || t.isTuple() || inheritsFromArray(type),
	);
}

export function isMapType(type: ts.Type) {
	return getCompilerDirectiveWithConstraint(type, CompilerDirective.Map);
}

export function isSetType(type: ts.Type) {
	return getCompilerDirectiveWithConstraint(type, CompilerDirective.Set);
}

export function isFunctionType(type: ts.Type) {
	return type.getCallSignatures().length > 0;
}

export function isArrayMethodType(type: ts.Type) {
	return isFunctionType(type) && getCompilerDirectiveWithConstraint(type, CompilerDirective.Array);
}

export function isMapMethodType(type: ts.Type) {
	return isFunctionType(type) && getCompilerDirectiveWithConstraint(type, CompilerDirective.Map);
}

export function isSetMethodType(type: ts.Type) {
	return isFunctionType(type) && getCompilerDirectiveWithConstraint(type, CompilerDirective.Set);
}

export function isStringMethodType(type: ts.Type) {
	return isFunctionType(type) && getCompilerDirectiveWithConstraint(type, CompilerDirective.String);
}

const LUA_TUPLE_REGEX = /^LuaTuple<[^]+>$/;

export function isTupleType(node: ts.TypeNode | ts.Type) {
	return LUA_TUPLE_REGEX.test(node.getText());
}

export function isTupleReturnType(node: ts.ReturnTypedNode) {
	const returnTypeNode = node.getReturnTypeNode();
	return returnTypeNode ? isTupleType(returnTypeNode) : false;
}

export function isTupleReturnTypeCall(node: ts.CallExpression) {
	const expr = node.getExpression();

	if (ts.TypeGuards.isIdentifier(expr)) {
		const definitions = expr.getDefinitions();
		if (
			// I don't think a case like this could ever occur, but I also don't want to be blamed if it does.
			definitions.length > 0 &&
			definitions.every(def => {
				const declarationNode = def.getDeclarationNode();
				return declarationNode && ts.TypeGuards.isFunctionDeclaration(declarationNode)
					? isTupleReturnType(declarationNode)
					: false;
			})
		) {
			return true;
		}
	}

	const symbol = expr.getSymbol();

	if (symbol) {
		const valDec = symbol.getValueDeclaration();
		return valDec && ts.TypeGuards.isReturnTypedNode(valDec) ? isTupleReturnType(valDec) : false;
	} else {
		return false;
	}
}

export function shouldHoist(ancestor: ts.Node, id: ts.Identifier, checkAncestor = true): boolean {
	if (ts.TypeGuards.isForStatement(ancestor)) {
		return false;
	}

	const refs = new Array<ts.Node>();
	for (const refSymbol of id.findReferences()) {
		for (const refEntry of refSymbol.getReferences()) {
			if (refEntry.getSourceFile() === id.getSourceFile()) {
				let refNode = refEntry.getNode();
				if (ts.TypeGuards.isVariableDeclaration(refNode)) {
					refNode = refNode.getNameNode();
				}
				refs.push(refNode);
			}
		}
	}

	const ancestorParent = ancestor.getParent();
	const ancestorChildIndex = ancestor.getChildIndex();

	const checkCallback = (ref: ts.Node) => {
		// if ever ref is in front
		if (ref === id) {
			return true;
		}

		if (checkAncestor && (ref === ancestor || ref.getFirstAncestor(a => a === ancestor))) {
			return false;
		} else {
			let refAncestor: ts.Node | undefined = ref;
			while (refAncestor && refAncestor.getParent() !== ancestorParent) {
				refAncestor = refAncestor.getParent();
			}
			if (refAncestor && refAncestor.getChildIndex() >= ancestorChildIndex) {
				return true;
			}
		}

		return false;
	};

	if (checkAncestor ? refs.every(checkCallback) : !refs.some(checkCallback)) {
		return false;
	} else {
		const caseClauseAncestor = ancestor.getFirstAncestorByKind(ts.SyntaxKind.CaseClause);

		if (caseClauseAncestor) {
			return shouldHoist(caseClauseAncestor, id, false);
		}

		return true;
	}
}

export function shouldPushToPrecedingStatement(
	arg: ts.Expression,
	argStr: string,
	argContext: PrecedingStatementContext,
) {
	return !argContext.isPushed && !isConstantExpression(arg);
}

/** Returns whether or not the given expression is an expression containing only:
 * - constants
 * - numeric/string literals
 * - unary/binary/ternary expressions
 */
export function isConstantExpression(node: ts.Expression, maxDepth: number = Number.MAX_VALUE): boolean {
	if (maxDepth >= 0) {
		if (ts.TypeGuards.isStringLiteral(node)) {
			return true;
		} else if (ts.TypeGuards.isNumericLiteral(node)) {
			return true;
		} else if (ts.TypeGuards.isIdentifier(node) && isIdentifierDefinedInConst(node)) {
			return true;
		} else if (ts.TypeGuards.isThisExpression(node) || ts.TypeGuards.isSuperExpression(node)) {
			return true;
		} else if (
			ts.TypeGuards.isBinaryExpression(node) &&
			isConstantExpression(skipNodesDownwards(node.getLeft()), maxDepth - 1) &&
			isConstantExpression(skipNodesDownwards(node.getRight()), maxDepth - 1)
		) {
			return true;
		} else if (
			(ts.TypeGuards.isPrefixUnaryExpression(node) || ts.TypeGuards.isPostfixUnaryExpression(node)) &&
			isConstantExpression(skipNodesDownwards(node.getOperand()), maxDepth)
		) {
			return true;
		} else if (
			ts.TypeGuards.isConditionalExpression(node) &&
			isConstantExpression(skipNodesDownwards(node.getCondition()), maxDepth - 1) &&
			isConstantExpression(skipNodesDownwards(node.getWhenTrue()), maxDepth - 1) &&
			isConstantExpression(skipNodesDownwards(node.getWhenFalse()), maxDepth - 1)
		) {
			return true;
		}
	}
	return false;
}

/** Skips NonNullExpressions and Parenthesized Expressions above the current node and returns `getType()` */
export function getType(node: ts.Node) {
	return skipNodesUpwardsLookAhead(node).getType();
}
