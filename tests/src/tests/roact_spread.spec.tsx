/// <reference types="@rbxts/testez/globals" />

import Roact from "@rbxts/roact";

export = () => {
	describe("Roact Spread operator", () => {
		it("should spread properties", () => {
			const props = {
				BackgroundColor3: Color3.fromRGB(50, 50, 50)
			};

			const element = <frame {...props} />;

			expect(
				(element as { props: { BackgroundColor3: Color3 } }).props
					.BackgroundColor3
			).to.equal(props.BackgroundColor3);
		});

		it("should support spread as well as regular properties", () => {
			const props = {
				BackgroundColor3: Color3.fromRGB(50, 50, 50)
			};

			const TextColor = Color3.fromRGB(220, 220, 220);

			const element = <textlabel TextColor3={TextColor} {...props} />;
			const elementProps = element.props as Roact.Template<TextLabel>;

			expect(elementProps.BackgroundColor3).to.equal(
				props.BackgroundColor3
			);
			expect(elementProps.TextColor3).to.equal(TextColor);
		});

		it("should support multiple spreads", () => {
			const props = {
				BackgroundColor3: Color3.fromRGB(50, 50, 50)
			};

			const props2 = {
				TextColor3: Color3.fromRGB(220, 220, 220)
			};

			const element = <textlabel {...props} {...props2} />;
			const elementProps = element.props as Roact.Template<TextLabel>;

			expect(elementProps.TextColor3).to.equal(props2.TextColor3);
			expect(elementProps.BackgroundColor3).to.equal(
				props.BackgroundColor3
			);
		});

		it("should support spreading for custom objects", () => {
			interface Props {
				Text: string;
				TextColor3: Color3;
			}

			class RoactClass extends Roact.Component<Props, {}> {
				public render(): Roact.Element {
					return (
						<textlabel
							Text={this.props.Text}
							TextColor3={this.props.TextColor3}
						/>
					);
				}
			}

			const setValues = {
				Text: "The text here"
			};
			const element = (
				<RoactClass TextColor3={new Color3(1, 0, 0)} {...setValues} />
			);
			const elementProps = element.props as Props;

			expect(elementProps.Text).to.equal(setValues.Text);
			expect(elementProps.TextColor3).to.equal(new Color3(1, 0, 0));
		});

		it("should support making templated objects", () => {
			enum ButtonSize {
				Small,
				Normal,
				Large
			}

			interface MyButtonProps {
				Size: ButtonSize;
				Text: string;
			}

			interface ButtonTemplateProps {
				TextSize: number;
				Size: UDim2;
			}

			const smallButtonProps: ButtonTemplateProps = {
				Size: new UDim2(0, 150, 0, 20),
				TextSize: 12
			};

			const normalButtonProps: ButtonTemplateProps = {
				Size: new UDim2(0, 200, 0, 30),
				TextSize: 20
			};

			const largeButtonProps: ButtonTemplateProps = {
				Size: new UDim2(0, 300, 0, 40),
				TextSize: 30
			};

			const buttonRef: Roact.Ref<TextButton> = Roact.createRef<
				TextButton
			>();

			class MyButton extends Roact.Component<MyButtonProps, {}> {
				public render(): Roact.Element {
					const { Size, Text } = this.props;

					const overloadProps = {
						Text
					};

					if (Size === ButtonSize.Normal) {
						return (
							<textbutton
								Ref={buttonRef}
								{...normalButtonProps}
								{...overloadProps}
							/>
						);
					} else if (Size === ButtonSize.Large) {
						return (
							<textbutton
								Ref={buttonRef}
								{...largeButtonProps}
								{...overloadProps}
							/>
						);
					} else if (Size === ButtonSize.Small) {
						return (
							<textbutton
								Ref={buttonRef}
								{...smallButtonProps}
								{...overloadProps}
							/>
						);
					} else {
						throw "Size specified not supported.";
					}
				}
			}

			const largeButton = (
				<MyButton Size={ButtonSize.Large} Text="Large Button" />
			);
			const normalButton = (
				<MyButton Size={ButtonSize.Normal} Text="Normal Button" />
			);
			const smallButton = (
				<MyButton Size={ButtonSize.Small} Text="Small Button" />
			);

			expect((largeButton.props as MyButtonProps).Size).to.equal(
				ButtonSize.Large
			);
			expect((normalButton.props as MyButtonProps).Size).to.equal(
				ButtonSize.Normal
			);
			expect((smallButton.props as MyButtonProps).Size).to.equal(
				ButtonSize.Small
			);

			const buttons = [
				{ button: largeButton, template: largeButtonProps },
				{ button: normalButton, template: normalButtonProps },
				{ button: smallButton, template: smallButtonProps }
			];
			for (const button of buttons) {
				Roact.mount(button.button);
				expect(buttonRef.getValue()).to.be.ok();
				expect(buttonRef.getValue()!.TextSize).to.equal(
					button.template.TextSize
				);
				expect(buttonRef.getValue()!.Size).to.equal(
					button.template.Size
				);
			}
		});
	});
};
