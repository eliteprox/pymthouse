#!/usr/bin/env python3
"""Fetch JWKS from URL and write the first RSA public key as PEM (for mod_authnz_jwt)."""
from __future__ import annotations

import argparse
import base64
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s.encode("ascii"))


def jwk_rsa_to_pem(jwk: dict) -> bytes:
    if jwk.get("kty") != "RSA":
        raise ValueError(f"Unsupported kty: {jwk.get('kty')}")
    n = int.from_bytes(_b64url_decode(jwk["n"]), "big")
    e = int.from_bytes(_b64url_decode(jwk["e"]), "big")
    pub = rsa.RSAPublicNumbers(e, n).public_key(default_backend())
    return pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--url",
        default="https://pymthouse.com/api/v1/oidc/jwks",
        help="JWKS URL",
    )
    p.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output PEM path",
    )
    p.add_argument(
        "--kid",
        default=None,
        help="If set, pick the RSA key with this kid (else first RSA key)",
    )
    args = p.parse_args()

    # Only allow https: JWKS is fetched over the public internet and signing-key trust
    # depends on TLS. Reject http/file/ftp/etc. outright rather than relying on urlopen defaults.
    parsed = urllib.parse.urlparse(args.url)
    if parsed.scheme != "https" or not parsed.netloc:
        print(
            f"jwks_to_pem: refusing to fetch JWKS from non-https URL: {args.url!r}",
            file=sys.stderr,
        )
        return 1

    ctx = ssl.create_default_context()
    req = urllib.request.Request(args.url, headers={"User-Agent": "pymthouse-signer-dmz/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            body = resp.read()
    except urllib.error.URLError as e:
        print(f"jwks_to_pem: fetch failed: {e}", file=sys.stderr)
        return 1

    try:
        doc = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as e:
        print(f"jwks_to_pem: invalid JSON: {e}", file=sys.stderr)
        return 1

    keys = doc.get("keys")
    if not isinstance(keys, list) or not keys:
        print("jwks_to_pem: no keys in JWKS", file=sys.stderr)
        return 1

    chosen: dict | None = None
    if args.kid:
        for k in keys:
            if isinstance(k, dict) and k.get("kid") == args.kid and k.get("kty") == "RSA":
                chosen = k
                break
        if chosen is None:
            print(f"jwks_to_pem: no RSA key with kid={args.kid!r}", file=sys.stderr)
            return 1
    else:
        for k in keys:
            if isinstance(k, dict) and k.get("kty") == "RSA":
                chosen = k
                break
        if chosen is None:
            print("jwks_to_pem: no RSA key in JWKS", file=sys.stderr)
            return 1

    try:
        pem = jwk_rsa_to_pem(chosen)
    except (KeyError, ValueError) as e:
        print(f"jwks_to_pem: {e}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(pem)
    kid = chosen.get("kid", "?")
    print(f"jwks_to_pem: wrote {args.out} (kid={kid})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
