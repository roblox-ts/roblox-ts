# Contributing Guide
Thanks for your interest in contributing to **roblox-ts**!

## Questions
Have a question? [Please ask it on our Discord!](https://discord.gg/f6Rn6RY)

## Issues
If you think you found a bug or have a feature request, please make a new issue in the [issues section](https://github.com/roblox-ts/roblox-ts).\
Please include:
- a code sample to reproduce the issue or specific steps to follow
- what you expected to happen
- what actually happened

## Development
If you're interested in contributing to the compiler's source code, please continue reading.

### Structure
The compiler is split into three primary files currently.
- `src/index.ts` - controls the CLI part of the compiler and creates new `Compiler` objects.
- `src/class/Compiler.ts` - a class that represents the entire project structure. Handles module resoltuion, emitting files, copying include files, and copying module files. Creates a `Transpiler` for each file.
- `src/class/Transpiler.ts` - a class consisting mostly of methods which take TypeScript AST Node objects, and return strings of emitted Lua source code.

To summarize,\
`src/index.ts` creates a `Compiler`, and `src/class/Compiler.ts` creates a `Transpiler` for each file in your project.

Most of the code for the project exists inside of the `Transpiler` class. The dependancy [`ts-simple-ast`](https://github.com/dsherret/ts-simple-ast) provides the TypeScript node classes. [You can find some documentation on those classes here.](https://dsherret.github.io/ts-simple-ast/) The nodes are converted to strings of Lua source code that is functionally identical to their TypeScript equivalents.

### Local Testing
Usually, it's inconvenient to continuously sync code to Roblox Studio when working on the compiler.

For faster development and testing, it's recommended to use roblox-ts with [LPGHatGuy's lemur](https://github.com/LPGhatguy/lemur).

[You can find a guide for that here.](https://github.com/roblox-ts/roblox-ts/wiki/Usage-with-Lemur)