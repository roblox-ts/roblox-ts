const toolbar = plugin.CreateToolbar("MyToolbar");
const button = toolbar.CreateButton("MyButton", "", "");

button.Click.Connect(() => {
	print("Button clicked!");
});
