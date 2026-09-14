/** @jsx createElement */

interface RenderedElement {
	tag: string;
	props: unknown;
	children: Array<string | RenderedElement>;
}

function createElement(tag: string, props: unknown, ...children: Array<string | RenderedElement>): RenderedElement {
	return { tag, props, children };
}

declare namespace createElement {
	namespace JSX {
		type Element = RenderedElement;

		interface IntrinsicElements {
			text: { "custom:value"?: number };
			"custom:text": {};
		}
	}
}

export = () => {
	it("should ignore a line containing only nonbreaking whitespace", () => {
		// prettier-ignore
		const element = <text> 
		</text>;
		expect(element.children.size()).to.equal(0);
	});

	it("should ignore trailing blank lines in JSX text", () => {
		// prettier-ignore
		const element = <text>value

		</text>;
		expect(element.children[0]).to.equal("value");
		expect(element.children.size()).to.equal(1);
	});

	it("should preserve namespaced attribute names", () => {
		const element = <text custom:value={42} />;

		expect((element.props as { "custom:value": number })["custom:value"]).to.equal(42);
	});

	it("should decode JSX text entities and preserve literal backslashes", () => {
		const element = <text>&amp;&lt;&gt;&quot;&apos;&#65;&#x42;&unknown;\path</text>;

		expect(element.children[0]).to.equal("&<>\"'AB&unknown;\\path");
	});

	it("should preserve control characters decoded from JSX entities", () => {
		const element = <text>&#0;1&#9;&#10;&#13;&#127;&#x1f;</text>;

		expect(element.children[0]).to.equal("\x001\t\n\r\x7f\x1f");
	});

	it("should trim JSX lines while preserving spaces beside tags", () => {
		// prettier-ignore
		const element = <text> first
			second

			third </text>;

		expect(element.children[0]).to.equal(" first second third ");
	});

	it("should ignore empty JSX expressions and whitespace-only lines", () => {
		const element = (
			<text>
				{}
				{/* an empty expression contributes no child */}
				<custom:text />
			</text>
		);

		expect(element.children.size()).to.equal(1);
		expect((element.children[0] as RenderedElement).tag).to.equal("custom:text");
	});
};
