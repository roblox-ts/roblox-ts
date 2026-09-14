# Contributing

Thank you for your interest in contributing to **roblox-ts**!

## Getting Started

First, we'll need to setup the development build of **roblox-ts**.

This guide assumes you have the following installed:

- Git
- NodeJS 24 or newer
- NPM

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

## Running Tests

**roblox-ts** keeps a suite of automated unit tests inside of `/tests`.

The tests run in two environments:

- `tests/compiler/` contains Node/Jest tests for compiler behavior and exact Luau output.
  Expected output is stored in Jest's `__snapshots__/` directories.
- `tests/src/` is a tiny **roblox-ts** game containing runtime tests, diagnostic cases,
  and supporting fixtures. It has a separate TypeScript configuration from the Node tests.

Run commands from the repository root. The compiler and `tests/` have separate npm dependencies.
On a fresh checkout, `npm ci` installs the root dependencies from the lockfile. Before the first test run,
install the test project's compiler and Roblox types with `npm run update-test-types`, as CI does.
This refresh can change test package metadata; review that diff separately.

The testing process is as follows:

1. Build the compiler
2. Run Jest to check compiler behavior, verify snapshots, and compile the Roblox test project into `tests/out`
3. Use `rojo build` to create `tests/test.rbxl`
4. Use `lune` to execute the runtime tests

You can run this process yourself if you have [rokit](https://github.com/rojo-rbx/rokit) installed.

```sh
# install the test project's types
npm run update-test-types
# install rojo + lune
rokit install
# build the compiler, compile tests, build .rbxl, run with lune
npm test
```

Tool versions are pinned in [foreman.toml](foreman.toml). Scripts are defined in [package.json](package.json).

| Command                                                                   | Purpose                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run build`                                                           | Build the compiler's TypeScript project references with `tspc -b` and configured path transforms |
| `npm run build-watch`                                                     | Rebuild compiler sources while editing                                                           |
| `npm run test-compile`                                                    | Run Jest with coverage, check snapshots and diagnostics, and compile the runtime project         |
| `npm run test-compile -- tests/compiler/strings.test.ts`                  | Run a focused compiler suite after building                                                      |
| `npm run test-compile -- tests/compiler/strings.test.ts --updateSnapshot` | Update that suite's snapshots for an intentional emit change                                     |
| `npm run test-rojo`                                                       | Build `tests/test.rbxl` from compiled test output                                                |
| `npm run test-run`                                                        | Execute that place's TestEZ tests through Lune                                                   |
| `npm test`                                                                | Run the complete build → Jest → Rojo → Lune sequence                                             |
| `npm run eslint`                                                          | Run lint with zero warnings allowed                                                              |
| `git diff --check`                                                        | Check patch whitespace                                                                           |

Build before validating compiler changes. A focused snapshot run does **not** refresh the complete runtime output;
run `tests/compiler/compile.test.ts` or the full Jest suite before running Rojo and Lune separately.
Inspect generated files under `tests/out/`, but change their TypeScript sources rather than editing the output.

For compiler or runtime behavior changes, run focused regressions while iterating, then `npm test` and lint on the
final code. For documentation-only changes, check formatting, referenced paths, and the diff. Repeat completed checks
only when later changes, failures, or unresolved concerns require it.

Lune runs a Roblox simulation with shims in [tests/runTestsWithLune.luau](tests/runTestsWithLune.luau); it does not
establish full engine behavior. For an engine-specific issue, verify the actual API and use an appropriate Roblox
integration check.

### Dependency Troubleshooting

If setup fails, inspect the actual npm error and installed test types before diagnosing a compiler bug.
Test dependencies include Git sources; npm versions that require explicit Git permission may need
`--allow-git=root` on the relevant install command. Roblox type recognition uses declaration paths, so symlinking
`tests/node_modules` from another worktree can change behavior; install or copy dependencies into that worktree.

## Writing Regression Tests

Prefer programs users can write. Add runtime cases to `tests/src/tests/*.spec.ts` and supporting files to
`tests/src/helpers/` or the relevant existing fixture folder. Follow neighboring TestEZ tests. Cover evaluation
order with observable side effects, not just the final value.

Add invalid-source cases to `tests/src/diagnostics/<diagnosticName>.ts`, or `.1.ts`, `.2.ts`, etc. The harness resolves
the name against `errors` in [src/Shared/diagnostics.ts](src/Shared/diagnostics.ts) and requires the expected diagnostic
without unrelated ones.

For output quality, use `createTestProject()` from [tests/compiler/createTestProject.ts](tests/compiler/createTestProject.ts)
and snapshot the complete `compileSource()` result, removing only the compiler version header as existing suites do.
Keep subject-specific suites in `tests/compiler/`; reusable TypeScript input fixtures go in `tests/compiler/fixtures/`.
Runtime assertions establish behavior; snapshots establish exact spelling, parentheses, and temporary placement.
Add both when both can regress. A snapshot alone does not prove the output parses or runs.

Keep snapshot cases alphabetized by test name to match Jest's snapshot ordering. Let Jest generate `.snap` files;
review every intentional change instead of manually arranging snapshots or accepting updates blindly.
Confirm a regression test exercises the original bug, preferably by demonstrating failure before the fix.
Avoid tests coupled to private analysis structures or fabricated internal states just to increase coverage.
Meet the patch coverage requirement in [codecov.yml](codecov.yml), prefer source-level cases for uncovered branches,
and check existing coverage before adding redundant cases.
