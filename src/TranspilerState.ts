import * as ts from "ts-morph";
import { ScriptContext } from "./utility";

interface Partition {
	dir: ts.Directory;
	target: string;
}

export const RBX_SERVICES = [
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

	public getService(serviceType: string, node: ts.Node) {
		// get ancestor immediately inside the SourceFile
		const source = node.getSourceFile();
		let parent = node.getParent();

		while (parent) {
			const next = parent.getParent();
			if (next === source) {
				break;
			}
			parent = next;
		}

		if (parent) {
			for (const sibling of parent.getPreviousSiblings()) {
				if (ts.TypeGuards.isVariableStatement(sibling)) {
					const list = sibling.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
					for (const declaration of list.getDeclarations()) {
						const lhs = declaration.getNameNode();
						if (ts.TypeGuards.isIdentifier(lhs) && declaration.getType().getText() === serviceType) {
							return lhs.getText();
						}
					}
				} else if (ts.TypeGuards.isImportDeclaration(sibling)) {
					console.log(sibling.getText());
				}
			}
		}

		const id = "_0" + serviceType;
		this.hoistStack[0].add(`local ${id} = game:GetService("${serviceType}")`);
		return id;
	}
}
