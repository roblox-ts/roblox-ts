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
- `src/index.ts` - controls the CLI part of the compiler and creates new `Project` objects.
- `src/class/Project.ts` - a class that represents the entire project structure. Handles module resoltuion, emitting files, copying include files, and copying module files. Creates a `Compiler` for each file.
- `src/compiler/*.ts` - a folder consisting mostly of functions which take TypeScript AST Node objects, and return strings of emitted Lua source code.
- `src/CompilerState.ts` - a class which holds the global state for a single file's compilation.

Most of the code for the project exists inside of the `src/compiler` folder. The dependancy [`ts-morph`](https://github.com/dsherret/ts-morph) provides the TypeScript node classes. [You can find some documentation on those classes here.](https://dsherret.github.io/ts-morph/) The nodes are converted to strings of Lua source code that is functionally identical to their TypeScript equivalents.

### Local Testing
Usually, it's inconvenient to continuously sync code to Roblox Studio when working on the compiler.

For faster development and testing, it's recommended to use roblox-ts with [LPGHatGuy's lemur](https://github.com/LPGhatguy/lemur).

[You can find a guide for that here.](https://roblox-ts.com/docs/guides/lemur-usage)

### Code Quality and Formatting
To ensure code quality, we use **[eslint](https://eslint.org/)** and **[Prettier](https://prettier.io/)**. These rules are enforced by our GitHub Acions CI build step.\
If you prefer to not install these globally or use extensions, you can simply run:\
`npm run eslint` to check linting and\
`npm run prettier` to clean up code formatting

### Unit Tests
The unit tests are written in TypeScript, compiled into Lua and then run in GitHub Acions CI using Lemur + TestEZ.\
The tests are located in the `tests/src` folder.\
All tests must be in the form of `export = () => { /* test code */ }`\


To run the tests locally, you'll need Lua 5.1, luarocks, luafilesystem, and dkjson installed.\
Then simply run, `npm test` to compile and run the tests.

