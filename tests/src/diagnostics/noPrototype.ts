function foo() {}

print(foo.prototype);

class Example {}
Example.prototype = new Example();
