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

Effectively, this folder is a tiny **roblox-ts** game. Testing process is as follows:

1. Compile tests project to create a `/tests/out` folder containing `.lua` files
2. Use `rojo build` to create `/tests/test.rbxlx`
3. Use `run-in-roblox` to open studio and execute the tests

You can run this process yourself if you have Roblox Studio and [foreman](https://github.com/Roblox/foreman) installed. (Only works on Windows and MacOS)

```sh
# install rojo + run-in-roblox
foreman install
# Compile tests, build .rbxlx, run with run-in-roblox
npm test
```
