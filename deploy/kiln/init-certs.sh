#!/usr/bin/env bash
# Create a short-lived certificate so nginx can boot before Let's Encrypt exists.
# A later real certificate replaces these two files. See deploy/kiln/README.md.
set -euo pipefail

cd /opt/kiln
mkdir -p certs acme logs backups

if [[ -f certs/fullchain.pem && -f certs/privkey.pem ]]; then
  exit 0
fi

domain="localhost"
if [[ -f .env ]]; then
  domain="$(awk -F= '/^KILN_DOMAIN=/{value=substr($0, index($0, "=") + 1)} END{print value}' .env)"
  domain="${domain:-localhost}"
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -subj "/CN=${domain}"

chmod 755 certs acme logs backups
chmod 644 certs/fullchain.pem certs/privkey.pem
echo "wrote a temporary certificate for ${domain}; replace it with Let's Encrypt"
