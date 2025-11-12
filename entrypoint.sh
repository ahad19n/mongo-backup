#!/bin/sh
set -e

# ensure /backup exists and is writable
mkdir -p /backup
chown -R $(id -u):$(id -g) /backup || true

# run the node script
node index.js
