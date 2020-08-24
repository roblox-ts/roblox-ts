#!/usr/bin/env bash

set -e

# setup rbxtsc-dev
npm install
npm run build
npm run devlink

# setup playground
cd /workspaces
mkdir playground
cd playground
rbxtsc-dev init game --git=false --eslint=true --prettier=true --vscode=true
