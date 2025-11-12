#!/bin/sh
set -e

mkdir -p /backup
chown -R $(id -u):$(id -g) /backup || true

node index.js