#!/usr/bin/env bash
# Sourced by the Codespaces startup script; it does not start any processes.
if [[ "${CODESPACES:-}" == true ]]; then
  : "${CODESPACE_NAME:?Codespaces must provide CODESPACE_NAME}"
  : "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:?Codespaces must provide its port-forwarding domain}"
  export APP_ORIGIN="https://${CODESPACE_NAME}-${PORT:-3000}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  export COOKIE_SECURE=true
fi
