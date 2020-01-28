import * as lua from "LuaAST";

export class RenderState {
	public indent = "";

	private pushIndent() {
		this.indent += "\t";
	}

	private popIndent() {
		this.indent = this.indent.substr(1);
	}

	public block<T>(callback: () => T) {
		this.pushIndent();
		const result = callback();
		this.popIndent();
		return result;
	}

	private readonly listNodesStack = new Array<lua.ListNode<lua.Statement>>();

	public pushListNode(listNode: lua.ListNode<lua.Statement>) {
		this.listNodesStack.push(listNode);
	}

	public peekListNode(): lua.ListNode<lua.Statement> | undefined {
		return this.listNodesStack[this.listNodesStack.length - 1];
	}

	public popListNode() {
		return this.listNodesStack.pop();
	}
}
