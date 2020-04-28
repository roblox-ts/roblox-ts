import * as lua from "LuaAST";
import { NoInfer } from "Shared/util/types";
import { assert } from "Shared/util/assert";

const LIST_MARKER = Symbol("List");

export type ListNode<T extends lua.Node> = {
	prev?: lua.ListNode<T>;
	next?: lua.ListNode<T>;
	value: T;
};

export type List<T extends lua.Node> = {
	[LIST_MARKER]: true;
	head?: lua.ListNode<T>;
	tail?: lua.ListNode<T>;
	readonly: boolean;
};

// list creation functions
export namespace list {
	export function makeNode<T extends lua.Node>(value: T): lua.ListNode<T> {
		return { value };
	}

	export function make<T extends lua.Node>(...values: Array<T>): lua.List<T> {
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
			return { [LIST_MARKER]: true, head, tail, readonly: false };
		} else {
			return { [LIST_MARKER]: true, readonly: false };
		}
	}

	export function join<T extends lua.Node>(...lists: Array<lua.List<T>>): lua.List<T> {
		const nonEmptyLists = lists.filter(list => list.head !== undefined && list.tail !== undefined);
		if (nonEmptyLists.length === 0) {
			return lua.list.make();
		}

		const newList = lua.list.make<T>();
		newList.head = nonEmptyLists[0].head;
		newList.tail = nonEmptyLists[nonEmptyLists.length - 1].tail;
		for (let i = 1; i < nonEmptyLists.length; i++) {
			const list = nonEmptyLists[i];
			const prevList = nonEmptyLists[i - 1];
			assert(!list.readonly);
			assert(!prevList.readonly);
			list.readonly = true;
			list.head!.prev = prevList.tail!;
			prevList.tail!.next = list.head!;
		}
		return newList;
	}
}

// type guard
export namespace list {
	export function isList(value: unknown): value is lua.List<lua.Node> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return typeof value === "object" && (value as any)[LIST_MARKER] === true;
	}
}

// list utility functions
export namespace list {
	export function push<T extends lua.Node>(list: lua.List<T>, value: NoInfer<T>) {
		assert(!list.readonly);
		const node = lua.list.makeNode(value);
		if (list.tail) {
			list.tail.next = node;
			node.prev = list.tail;
		} else {
			list.head = node;
		}
		list.tail = node;
	}

	export function pushList<T extends lua.Node>(list: lua.List<T>, other: lua.List<T>) {
		assert(!list.readonly);
		assert(!other.readonly);
		other.readonly = true;

		if (other.head && other.tail) {
			if (list.head && list.tail) {
				list.tail.next = other.head;
				other.head.prev = list.tail;
				list.tail = other.tail;
			} else {
				list.head = other.head;
				list.tail = other.tail;
			}
		}
	}

	export function pop<T extends lua.Node>(list: lua.List<T>): T | undefined {
		assert(!list.readonly);
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
		assert(!list.readonly);
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

	export function unshift<T extends lua.Node>(list: lua.List<T>, value: NoInfer<T>) {
		assert(!list.readonly);
		const node = lua.list.makeNode(value);
		if (list.head) {
			list.head.prev = node;
			node.next = list.head;
		} else {
			list.tail = node;
		}
		list.head = node;
	}

	export function isEmpty<T extends lua.Node>(list: lua.List<T>) {
		return list.head === undefined;
	}

	export function forEach<T extends lua.Node>(list: lua.List<T>, callback: (value: NoInfer<T>) => void) {
		let node = list.head;
		while (node) {
			callback(node.value);
			node = node.next;
		}
	}

	export function forEachRev<T extends lua.Node>(list: lua.List<T>, callback: (value: NoInfer<T>) => void) {
		let node = list.tail;
		while (node) {
			callback(node.value);
			node = node.prev;
		}
	}

	export function mapToArray<T extends lua.Node, U>(list: lua.List<T>, callback: (value: NoInfer<T>) => U): Array<U> {
		const result = new Array<U>();
		lua.list.forEach(list, value => result.push(callback(value)));
		return result;
	}

	export function toArray<T extends lua.Node>(list: lua.List<T>): Array<T> {
		const result = new Array<T>();
		lua.list.forEach(list, value => result.push(value));
		return result;
	}

	export function toString<T extends lua.Node>(list: lua.List<T>, toStr: (value: NoInfer<T>) => string) {
		const strs = mapToArray(list, value => toStr(value));
		if (strs.length > 0) {
			return `[ ${strs.join(", ")} ]`;
		} else {
			return "[]";
		}
	}

	export function every<T extends lua.Node>(list: lua.List<T>, callback: (value: NoInfer<T>) => boolean) {
		let node = list.head;
		while (node) {
			if (!callback(node.value)) {
				return false;
			}
			node = node.next;
		}
		return true;
	}

	export function any<T extends lua.Node>(list: lua.List<T>, callback: (value: NoInfer<T>) => boolean) {
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

	export function insertAfter<T extends lua.Node>(node: lua.ListNode<T>, value: NoInfer<T>) {
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
