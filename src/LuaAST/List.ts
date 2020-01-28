import * as lua from ".";

export type ListNode<T extends lua.Node> = {
	prev?: lua.ListNode<T>;
	next?: lua.ListNode<T>;
	value: T;
};

export type List<T extends lua.Node> = {
	head?: lua.ListNode<T>;
	tail?: lua.ListNode<T>;
};

// list creation functions
export namespace list {
	export function makeNode<T extends lua.Node>(value: T): lua.ListNode<T> {
		return { value };
	}

	export function make<T extends lua.Node>(...values: T[]): lua.List<T> {
		if (values.length > 0) {
			const head = lua.list.makeNode(values[0]);
			let tail = head;
			for (let i = 1; i < values.length; i++) {
				const node = lua.list.makeNode(values[i]);
				if (tail) {
					tail.next = node;
					node.prev = tail;
				}
				tail = node;
			}
			return { head, tail };
		} else {
			return {};
		}
	}
}

// type guard
export namespace list {
	export function isList(value: unknown): value is lua.List<lua.Node> {
		return (
			typeof value === "object" &&
			value !== null &&
			(("head" in value && "tail" in value) || Object.keys(value).length === 0)
		);
	}
}

// list utility functions
export namespace list {
	export function push<T extends lua.Node>(list: lua.List<T>, value: T) {
		const node = lua.list.makeNode(value);
		if (list.tail) {
			list.tail.next = node;
			node.prev = list.tail;
		} else {
			list.head = node;
		}
		list.tail = node;
	}

	export function pop<T extends lua.Node>(list: lua.List<T>): T | undefined {
		if (list.tail) {
			const tail = list.tail;
			if (tail.prev) {
				tail.prev.next = undefined;
			} else {
				list.head = undefined;
			}
			list.tail = undefined;
			return tail.value;
		}
	}

	export function shift<T extends lua.Node>(list: lua.List<T>): T | undefined {
		if (list.head) {
			const head = list.head;
			if (head.next) {
				head.next.prev = undefined;
			} else {
				list.tail = undefined;
			}
			list.head = undefined;
			return head.value;
		}
	}

	export function unshift<T extends lua.Node>(list: lua.List<T>, value: T) {
		const node = lua.list.makeNode(value);
		if (list.head) {
			list.head.prev = node;
			node.next = list.head;
		} else {
			list.tail = node;
		}
		list.head = node;
	}

	export function forEach<T extends lua.Node>(list: lua.List<T>, callback: (value: T) => void) {
		let node = list.head;
		while (node) {
			callback(node.value);
			node = node.next;
		}
	}

	export function forEachRev<T extends lua.Node>(list: lua.List<T>, callback: (value: T) => void) {
		let node = list.tail;
		while (node) {
			callback(node.value);
			node = node.prev;
		}
	}

	export function mapToArray<T extends lua.Node, U>(list: lua.List<T>, callback: (value: T) => U): Array<U> {
		const result = new Array<U>();
		lua.list.forEach(list, value => result.push(callback(value)));
		return result;
	}

	export function toString<T extends lua.Node>(list: lua.List<T>, toStr: (value: T) => string) {
		const strs = mapToArray(list, value => toStr(value));
		if (strs.length > 0) {
			return `[ ${strs.join(", ")} ]`;
		} else {
			return "[]";
		}
	}

	export function every<T extends lua.Node>(list: lua.List<T>, callback: (value: T) => boolean) {
		let node = list.head;
		while (node) {
			if (!callback(node.value)) {
				return false;
			}
			node = node.next;
		}
		return true;
	}

	export function any<T extends lua.Node>(list: lua.List<T>, callback: (value: T) => boolean) {
		let node = list.head;
		while (node) {
			if (callback(node.value)) {
				return true;
			}
			node = node.next;
		}
		return false;
	}
}

// node utility functions
export namespace list {
	export function remove<T extends lua.Node>(node: lua.ListNode<T>) {
		const prevNode = node.prev;
		const nextNode = node.next;
		node.prev = undefined;
		node.next = undefined;
		if (prevNode) {
			prevNode.next = nextNode;
		}
		if (nextNode) {
			nextNode.prev = prevNode;
		}
	}

	export function insertAfter<T extends lua.Node>(node: lua.ListNode<T>, value: T) {
		const newNode = lua.list.makeNode(value);
		const origNext = node.next;
		node.next = newNode;
		newNode.prev = node;
		if (origNext) {
			origNext.prev = newNode;
			newNode.next = origNext;
		}
	}
}
