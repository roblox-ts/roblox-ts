import * as ts from "ts-morph";
import { RbxService } from "./typeUtilities";
import { ScriptContext } from "./utility";

interface Partition {
	dir: ts.Directory;
	target: string;
}

export class TranspilerState {
	constructor(public readonly syncInfo: Array<Partition>, public readonly modulesDir?: ts.Directory) {}

	// indent
	public indent = "";

	public pushIndent() {
		this.indent += "\t";
	}

	public popIndent() {
		this.indent = this.indent.substr(1);
	}

	// id stack
	public idStack = new Array<number>();

	public pushIdStack() {
		this.idStack.push(0);
	}

	public popIdStack() {
		this.idStack.pop();
	}

	public getNewId() {
		const sum = this.idStack.reduce((accum, value) => accum + value);
		this.idStack[this.idStack.length - 1]++;
		return `_${sum}`;
	}

	// hoist stack
	public hoistStack = new Array<Set<string>>();

	public pushHoistStack(name: string) {
		this.hoistStack[this.hoistStack.length - 1].add(name);
	}

	public popHoistStack(result: string) {
		const top = this.hoistStack.pop();
		if (top) {
			const hoists = [...top];
			const namedHoists = new Array<string>();
			const declareHoists = new Array<string>();
			hoists.forEach(v => (v.includes("=") ? declareHoists : namedHoists).push(v));

			if (namedHoists && namedHoists.length > 0) {
				result = this.indent + `local ${namedHoists.join(", ")};\n` + result;
			}

			if (declareHoists && declareHoists.length > 0) {
				result = this.indent + `${declareHoists.join(";\n" + this.indent)};\n` + result;
			}
		}
		return result;
	}

	// export stack
	public exportStack = new Array<Set<string>>();

	public pushExport(name: string, node: ts.Node & ts.ExportableNode) {
		if (!node.hasExportKeyword()) {
			return;
		}

		const ancestorName = this.getExportContextName(node);
		const alias = node.isDefaultExport() ? "_default" : name;
		this.exportStack[this.exportStack.length - 1].add(`${ancestorName}.${alias} = ${name};\n`);
	}

	public getExportContextName(node: ts.VariableStatement | ts.Node): string {
		const myNamespace = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
		let name;

		if (myNamespace) {
			name = myNamespace.getName();
			name = this.namespaceStack.get(name) || name;
		} else {
			name = "_exports";
			this.isModule = true;
		}

		return name;
	}

	// in the form: { ORIGINAL_IDENTIFIER = REPLACEMENT_VALUE }
	// For example, this is used for  exported/namespace values
	// which should be represented differently in Lua than they
	// can be represented in TS
	public variableAliases = new Map<string, string>();

	public getAlias(name: string) {
		const alias = this.variableAliases.get(name);
		if (alias !== undefined) {
			return alias;
		} else {
			return name;
		}
	}

	public namespaceStack = new Map<string, string>();
	public continueId = -1;
	public isModule = false;
	public scriptContext = ScriptContext.None;
	public roactIndent: number = 0;
	public hasRoactImport: boolean = false;
	public usesTSLibrary = false;

	public getService(serviceType: RbxService, state: TranspilerState, node: ts.Node) {
		const source = node.getSourceFile();
		// get parent to be the ancestor immediately inside the SourceFile
		let parent: ts.Node | undefined = node;

		let encounteredNonExpression = false;
		const generations = new Array<[Array<ts.Node<ts.ts.Node>>, ts.Node<ts.ts.Node> | undefined]>();

		while (parent) {
			const next: ts.Node | undefined = parent.getParent();

			if (next === source) {
				break;
			}

			const previousSiblings = parent.getPreviousSiblings();
			const isExpression = ts.TypeGuards.isExpression(parent);
			if (encounteredNonExpression || !isExpression) {
				if (!isExpression) {
					encounteredNonExpression = true;
				}
				if (previousSiblings.length > 0) {
					generations.push([previousSiblings, next]);
				}
			}

			parent = next;
		}

		let alias: string | undefined;

		if (parent) {
			for (const sibling of parent.getPreviousSiblings()) {
				if (ts.TypeGuards.isVariableStatement(sibling)) {
					const list = sibling.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
					for (const declaration of list.getDeclarations()) {
						const lhs = declaration.getNameNode();
						if (ts.TypeGuards.isIdentifier(lhs) && declaration.getType().getText() === serviceType) {
							alias = this.getAlias(lhs.getText());
						}
					}
				} else if (ts.TypeGuards.isImportDeclaration(sibling)) {
					for (const namedImport of sibling.getNamedImports()) {
						if (namedImport.getType().getText() === serviceType) {
							const aliasNode = namedImport.getAliasNode();
							alias = aliasNode ? aliasNode.getText() : namedImport.getName();
						}
					}
				}
			}
		}

		const id = "___" + serviceType;
		const localize = `local ${id} = game:GetService("${serviceType}")`;

		// intentionally unsophisticated
		//
		for (const generation of generations) {
			const previousSiblings = generation[0];
			const next = generation[1];
			for (const element of previousSiblings) {
				for (const identifier of element.getDescendantsOfKind(ts.SyntaxKind.Identifier)) {
					for (const def of identifier.getDefinitions()) {
						const definition = def.getNode();

						// if a variable overshadows alias
						if (next && definition.getText() === alias) {
							if (definition.getAncestors().some(ancestor => ancestor === next)) {
								this.hoistStack[0].add(localize);
								return id;
							}
						}
					}
				}
			}
		}

		if (alias) {
			return alias;
		} else {
			// Pick a reserved id that won't conflict due to out-of-order compilation
			// Generates the same id for the same serviceType every time
			this.hoistStack[0].add(localize);
			return id;
		}
	}
}
