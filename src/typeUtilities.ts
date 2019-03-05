import * as ts from "ts-morph";
import { CompilerDirective, getCompilerDirective } from "./transpiler";

export const RBX_SERVICES: Array<string> = [
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
];

export function isRbxService(name: string) {
	return RBX_SERVICES.indexOf(name) !== -1;
}

export function isTypeStatement(node: ts.Node) {
	return (
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeReferenceNode(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node) ||
		(ts.TypeGuards.isAmbientableNode(node) && node.hasDeclareKeyword())
	);
}

export function isType(node: ts.Node) {
	return (
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeReferenceNode(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node) ||
		ts.TypeGuards.isImportSpecifier(node) ||
		ts.TypeGuards.isImportClause(node) ||
		ts.TypeGuards.isImportEqualsDeclaration(node) ||
		ts.TypeGuards.isExportAssignment(node) ||
		ts.TypeGuards.isExportSpecifier(node) ||
		(ts.TypeGuards.isAmbientableNode(node) && node.hasDeclareKeyword())
	);
}

export function isUsedAsType(node: ts.Identifier) {
	return node.findReferences().every(refSymbol =>
		refSymbol
			.getReferences()
			.filter(refEntry => refEntry.getSourceFile() === node.getSourceFile())
			.every(refEntry => isType(refEntry.getNode().getParent()!)),
	);
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
				const decType = declaration.getType();
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

export function isAnyType(type: ts.Type) {
	return type.getText() === "any";
}

export function isNullableType(type: ts.Type) {
	return typeConstraint(type, t => t.isNullable());
}

export function isBooleanType(type: ts.Type) {
	return typeConstraint(type, t => t.isBoolean() || t.isBooleanLiteral());
}

export function isNumberType(type: ts.Type) {
	return typeConstraint(type, t => t.isNumber() || t.isNumberLiteral());
}

export function isStringType(type: ts.Type) {
	return typeConstraint(type, t => t.isString() || t.isStringLiteral());
}

export function isEnumType(type: ts.Type) {
	return typeConstraint(type, t => {
		const symbol = t.getSymbol();
		return symbol !== undefined && symbol.getDeclarations().some(d => ts.TypeGuards.isEnumDeclaration(d));
	});
}

export function isArrayType(type: ts.Type) {
	return (
		typeConstraint(type, t => {
			const symbol = t.getSymbol();
			if (symbol) {
				if (getCompilerDirective(symbol, [CompilerDirective.Array]) === CompilerDirective.Array) {
					return true;
				}
			}
			return t.isArray();
		}) || isTupleType(type)
	);
}

export function isTupleType(type: ts.Type) {
	return type.getText().startsWith("LuaTuple<") || typeConstraint(type, t => t.isTuple());
}

export function isTupleReturnType(node: ts.CallExpression) {
	return isTupleType(node.getReturnType());
}

function isAncestorOf(ancestor: ts.Node, descendant: ts.Node) {
	while (descendant) {
		if (ancestor === descendant) {
			return true;
		}
		descendant = descendant.getParent();
	}
	return false;
}

export function shouldHoist(ancestor: ts.Node, id: ts.Identifier) {
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
	for (const ref of refs) {
		if (ref !== id) {
			if (isAncestorOf(ancestor, ref)) {
				return true;
			} else {
				let refAncestor: ts.Node | undefined = ref;
				while (refAncestor && refAncestor.getParent() !== ancestorParent) {
					refAncestor = refAncestor.getParent();
				}
				if (refAncestor && refAncestor.getChildIndex() < ancestorChildIndex) {
					return true;
				}
			}
		}
	}

	return false;
}
