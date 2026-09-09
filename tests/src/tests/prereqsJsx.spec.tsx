/** @jsxFrag Roact.Fragment */
import Roact from "@rbxts/roact";

export = () => {
	it("should evaluate JSX attribute prerequisites in order", () => {
		const values = [1, 2, 3];
		const element = <frame LayoutOrder={values.pop()} ZIndex={values.pop()} />;
		const props = element.props as Frame;

		expect(props.LayoutOrder).to.equal(3);
		expect(props.ZIndex).to.equal(2);
		expect(values.join(",")).to.equal("1");
	});

	it("should evaluate conditional JSX spreads once", () => {
		let calls = 0;
		function props(enabled: boolean) {
			calls += 1;
			return enabled && { LayoutOrder: 3 };
		}

		const enabled = <frame ZIndex={2} {...props(true)} />;
		const disabled = <frame ZIndex={4} {...props(false)} />;
		expect((enabled.props as Frame).LayoutOrder).to.equal(3);
		expect((disabled.props as Frame).LayoutOrder).to.equal(undefined);
		expect((disabled.props as Frame).ZIndex).to.equal(4);
		expect(calls).to.equal(2);
	});

	it("should preserve child prerequisites in shorthand fragments", () => {
		const values = [1, 2];
		const fragment = (
			<>
				<frame Key="Child" LayoutOrder={values.pop()} />
			</>
		);
		const children = (fragment as unknown as { elements: { Child: Roact.Element } }).elements;
		expect((children.Child.props as Frame).LayoutOrder).to.equal(2);
		expect(values.join(",")).to.equal("1");
	});
};
