#!/usr/bin/env bash
set -euxo pipefail

# Submodules
git submodule update --init lib/micropython-microbit-v2
git -C lib/micropython-microbit-v2 submodule update --init lib/micropython

# Emscripten
VERSION="3.1.25"
export PYTHON=python3.7 # Needed by Emscripten in Netlify's build image.
git clone https://github.com/emscripten-core/emsdk.git -b $VERSION ~/.emsdk
~/.emsdk/emsdk install $VERSION
~/.emsdk/emsdk activate $VERSION
source ~/.emsdk/emsdk_env.sh

npm run test && npm run build
