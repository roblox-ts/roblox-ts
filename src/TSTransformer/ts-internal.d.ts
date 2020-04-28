import ts from "typescript";

declare module "typescript" {
	interface ConstructSignatureDeclaration {
		symbol: ts.Symbol;
	}

	interface VariableDeclaration {
		symbol: ts.Symbol | undefined;
	}

	function isNamedDeclaration(node: Node): node is ts.NamedDeclaration & { name: DeclarationName };
	function isGetOrSetAccessorDeclaration(node: Node): node is ts.AccessorDeclaration;
	function isSyntaxList(n: Node): n is ts.SyntaxList;
	function isNodeArray<T extends Node>(array: ReadonlyArray<T>): array is ts.NodeArray<T>;
	function isModifierKind(token: SyntaxKind): token is ts.Modifier["kind"];
	function isFunctionLikeDeclaration(node: Node): node is ts.FunctionLikeDeclaration;
	function isMethodOrAccessor(node: Node): node is ts.MethodDeclaration | ts.AccessorDeclaration;
	function isBindingPattern(node: Node | undefined): node is ts.BindingPattern;
	function isAssignmentPattern(node: Node): node is ts.AssignmentPattern;
	function isArrayBindingElement(node: Node): node is ts.ArrayBindingElement;
	function isDeclarationBindingElement(
		bindingElement: BindingOrAssignmentElement,
	): bindingElement is ts.VariableDeclaration | ts.ParameterDeclaration | ts.BindingElement;
	function isBindingOrAssignmentPattern(
		node: BindingOrAssignmentElementTarget,
	): node is ts.BindingOrAssignmentPattern;
	function isObjectBindingOrAssignmentPattern(
		node: BindingOrAssignmentElementTarget,
	): node is ts.ObjectBindingOrAssignmentPattern;
	function isArrayBindingOrAssignmentPattern(
		node: BindingOrAssignmentElementTarget,
	): node is ts.ArrayBindingOrAssignmentPattern;
	function isPropertyAccessOrQualifiedNameOrImportTypeNode(
		node: Node,
	): node is ts.PropertyAccessExpression | ts.QualifiedName | ts.ImportTypeNode;
	function isLeftHandSideExpression(node: Node): node is ts.LeftHandSideExpression;
	function isUnaryExpression(node: Node): node is ts.UnaryExpression;
	function isUnaryExpressionWithWrite(expr: Node): expr is ts.PrefixUnaryExpression | ts.PostfixUnaryExpression;
	function isPartiallyEmittedExpression(node: Node): node is ts.PartiallyEmittedExpression;
	function isNotEmittedStatement(node: Node): node is ts.NotEmittedStatement;
	function isNotEmittedOrPartiallyEmittedNode(
		node: Node,
	): node is ts.NotEmittedStatement | ts.PartiallyEmittedExpression;
	function isForInOrOfStatement(node: Node): node is ts.ForInOrOfStatement;
	function isConciseBody(node: Node): node is ts.ConciseBody;
	function isFunctionBody(node: Node): node is ts.FunctionBody;
	function isForInitializer(node: Node): node is ts.ForInitializer;
	function isModuleBody(node: Node): node is ts.ModuleBody;
	function isNamespaceBody(node: Node): node is ts.NamespaceBody;
	function isJSDocNamespaceBody(node: Node): node is ts.JSDocNamespaceBody;
	function isNamedImportBindings(node: Node): node is ts.NamedImportBindings;
	function isModuleOrEnumDeclaration(node: Node): node is ts.ModuleDeclaration | ts.EnumDeclaration;
	function isDeclaration(node: Node): node is ts.NamedDeclaration;
	function isDeclarationStatement(node: Node): node is ts.DeclarationStatement;
	function isStatementButNotDeclaration(node: Node): node is ts.Statement;
	function isStatement(node: Node): node is ts.Statement;
	function isModuleReference(node: Node): node is ts.ModuleReference;
	function isJsxTagNameExpression(node: Node): node is ts.JsxTagNameExpression;
	function isJsxChild(node: Node): node is ts.JsxChild;
	function isJsxAttributeLike(node: Node): node is ts.JsxAttributeLike;
	function isStringLiteralOrJsxExpression(node: Node): node is ts.StringLiteral | ts.JsxExpression;
	function isJSDocTag(node: Node): node is ts.JSDocTag;
	function isTypeReferenceType(node: Node): node is ts.TypeReferenceType;
}
