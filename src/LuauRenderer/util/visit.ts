import ts from "byots";
import luau from "LuauAST";

export interface Visitor {
	before?: (node: luau.Node) => void;
	after?: (node: luau.Node) => void;
}

type VisitStrategy<T extends luau.SyntaxKind> = (node: luau.NodeByKind[T], visitor: Visitor) => void;

const NOOP = () => {};

const KIND_TO_VISITOR = ts.identity<{ [K in luau.SyntaxKind]: VisitStrategy<K> }>({
	// indexable expressions
	[luau.SyntaxKind.Identifier]: NOOP,
	[luau.SyntaxKind.EmptyIdentifier]: NOOP,
	[luau.SyntaxKind.TemporaryIdentifier]: NOOP,
	[luau.SyntaxKind.ComputedIndexExpression]: (node, visitor) => {
		visitNode(node.expression, visitor);
		visitNode(node.index, visitor);
	},
	[luau.SyntaxKind.PropertyAccessExpression]: (node, visitor) => visitNode(node.expression, visitor),
	[luau.SyntaxKind.CallExpression]: (node, visitor) => {
		visitNode(node.expression, visitor);
		visitList(node.args, visitor);
	},
	[luau.SyntaxKind.MethodCallExpression]: (node, visitor) => {
		visitNode(node.expression, visitor);
		visitList(node.args, visitor);
	},
	[luau.SyntaxKind.ParenthesizedExpression]: (node, visitor) => visitNode(node.expression, visitor),

	// expressions
	[luau.SyntaxKind.NilLiteral]: NOOP,
	[luau.SyntaxKind.FalseLiteral]: NOOP,
	[luau.SyntaxKind.TrueLiteral]: NOOP,
	[luau.SyntaxKind.NumberLiteral]: NOOP,
	[luau.SyntaxKind.StringLiteral]: NOOP,
	[luau.SyntaxKind.VarArgsLiteral]: NOOP,
	[luau.SyntaxKind.FunctionExpression]: (node, visitor) => {
		visitList(node.parameters, visitor);
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.BinaryExpression]: (node, visitor) => {
		visitNode(node.left, visitor);
		visitNode(node.right, visitor);
	},
	[luau.SyntaxKind.UnaryExpression]: (node, visitor) => visitNode(node.expression, visitor),
	[luau.SyntaxKind.Array]: (node, visitor) => visitList(node.members, visitor),
	[luau.SyntaxKind.Map]: (node, visitor) => visitList(node.fields, visitor),
	[luau.SyntaxKind.Set]: (node, visitor) => visitList(node.members, visitor),
	[luau.SyntaxKind.MixedTable]: (node, visitor) => visitList(node.fields, visitor),

	// statements
	[luau.SyntaxKind.Assignment]: (node, visitor) => {
		if (luau.list.isList(node.left)) {
			visitList(node.left, visitor);
		} else {
			visitNode(node.left, visitor);
		}
		visitNode(node.right, visitor);
	},
	[luau.SyntaxKind.BreakStatement]: NOOP,
	[luau.SyntaxKind.CallStatement]: (node, visitor) => visitNode(node.expression, visitor),
	[luau.SyntaxKind.ContinueStatement]: NOOP,
	[luau.SyntaxKind.DoStatement]: (node, visitor) => visitList(node.statements, visitor),
	[luau.SyntaxKind.WhileStatement]: (node, visitor) => {
		visitNode(node.condition, visitor);
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.RepeatStatement]: (node, visitor) => {
		visitList(node.statements, visitor);
		visitNode(node.condition, visitor);
	},
	[luau.SyntaxKind.IfStatement]: (node, visitor) => {
		visitNode(node.condition, visitor);
		visitList(node.statements, visitor);
		if (luau.list.isList(node.elseBody)) {
			visitList(node.elseBody, visitor);
		} else {
			visitNode(node.elseBody, visitor);
		}
	},
	[luau.SyntaxKind.NumericForStatement]: (node, visitor) => {
		visitNode(node.id, visitor);
		visitNode(node.start, visitor);
		visitNode(node.end, visitor);
		if (node.step) {
			visitNode(node.step, visitor);
		}
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.ForStatement]: (node, visitor) => {
		visitList(node.ids, visitor);
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.FunctionDeclaration]: (node, visitor) => {
		visitNode(node.name, visitor);
		visitList(node.parameters, visitor);
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.MethodDeclaration]: (node, visitor) => {
		visitNode(node.expression, visitor);
		visitList(node.parameters, visitor);
		visitList(node.statements, visitor);
	},
	[luau.SyntaxKind.VariableDeclaration]: (node, visitor) => {
		if (luau.list.isList(node.left)) {
			visitList(node.left, visitor);
		} else {
			visitNode(node.left, visitor);
		}
		if (node.right) {
			visitNode(node.right, visitor);
		}
	},
	[luau.SyntaxKind.ReturnStatement]: (node, visitor) => {
		if (luau.list.isList(node.expression)) {
			visitList(node.expression, visitor);
		} else {
			visitNode(node.expression, visitor);
		}
	},
	[luau.SyntaxKind.Comment]: NOOP,

	// fields
	[luau.SyntaxKind.MapField]: (node, visitor) => {
		visitNode(node.index, visitor);
		visitNode(node.value, visitor);
	},
});

function visitNode(node: luau.Node, visitor: Visitor) {
	visitor.before?.(node);
	KIND_TO_VISITOR[node.kind](node as never, visitor);
	visitor.after?.(node);
}

function visitList(list: luau.List<luau.Node>, visitor: Visitor) {
	luau.list.forEach(list, v => visitNode(v, visitor));
}

export function visit(ast: luau.List<luau.Node> | luau.Node, visitor: Visitor) {
	if (luau.list.isList(ast)) {
		visitList(ast, visitor);
	} else {
		visitNode(ast, visitor);
	}
}
