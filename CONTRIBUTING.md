# Contributing

Thank you for your interest in contributing to **roblox-ts**!

## Getting Started

First, we'll need to setup the development build of **roblox-ts**.

This guide assumes you have the following installed:

-   Git
-   NodeJS
-   NPM

We'll also assume you understand some basic terminal navigation commands (`cd`, `ls`/`dir`, etc.).

1. Begin by creating a fork of roblox-ts.

![https://i.imgur.com/wRtbuiy.png](https://i.imgur.com/wRtbuiy.png)

2. Navigate to somewhere you'd like to keep your development copy of **roblox-ts** and then you can run the following commands:

```sh
# Clone your fork of roblox-ts (you may prefer to use SSH instead)
git clone https://github.com/YOUR_GITHUB_USERNAME/roblox-ts.git
# Navigate into the roblox-ts folder
cd roblox-ts
# Install dependency packages (node_modules)
npm install
# build the compiler
npm run build
# link
npm run devlink
```

3. You should now be able to use the command `rbxtsc-dev` to run the development compiler!

4. At a later time, if you need to update it:

```sh
# pull latest changes
git pull
# build the compiler
npm run build
```

It is not necessary to run the "devlink" script again.

## Unit Testing

**roblox-ts** keeps a suite of automated unit tests inside of `/tests`.

The tests run in two environments:

- `tests/compiler/` contains Node/Jest tests for compiler behavior and exact Luau output.
  Expected output is stored in Jest's `__snapshots__/` directories.
- `tests/src/` is a tiny **roblox-ts** game containing runtime tests, diagnostic cases,
  and supporting fixtures. It has a separate TypeScript configuration from the Node tests.

Prefer source-level runtime tests for behavior and diagnostic tests for invalid source.
Use emit snapshots to verify output quality that runtime assertions cannot observe,
such as unnecessary temporary variables. Avoid testing transformer internals in isolation.

The testing process is as follows:

1. Run Jest to check compiler behavior, verify snapshots, and compile the Roblox test project into `tests/out`
2. Use `rojo build` to create `tests/test.rbxl`
3. Use `lune` to execute the runtime tests

You can run this process yourself if you have [rokit](https://github.com/rojo-rbx/rokit) installed.

```sh
# install rojo + lune
rokit install
# Compile tests, build .rbxl, run with lune
npm test
```

After building the compiler, you can also run just the Jest tests with `npm run test-compile`.
For an intentional emit change, update snapshots with `npm run test-compile -- --updateSnapshot`
and review the resulting diff before committing.
