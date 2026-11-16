#!/usr/bin/env python3
"""Encrypt (or decrypt) the shared Sharma finance data.

Sharma AR and Sharma P&L only read finance-data.enc.json. The plain finance-data.json
is a local working copy: it is in .gitignore and must never be committed.

  Encrypt (default):  python3 tools/encrypt.py
      reads  finance-data.json            (plain, local only)
      checks it against finance-data.schema.json
      writes finance-data.enc.json        (commit this file only)

  Decrypt for editing: python3 tools/encrypt.py --decrypt
      reads  finance-data.enc.json  ->  writes finance-data.json (local only)

The code comes from the SHARMA_PASSCODE environment variable, or a hidden prompt.
It is never written to disk, printed or logged. Sanjay gives it out separately.

Format: AES-GCM 256, key = PBKDF2-HMAC-SHA256(code, random 16-byte salt, 600,000+ iterations),
random 12-byte IV, fresh salt and IV on every run. salt/iv/ciphertext are base64.

Needs: pip install cryptography jsonschema
"""
import argparse, base64, getpass, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ITERATIONS = 600_000
FORMAT = "sharma-enc-v1"

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    sys.exit("Missing package: pip install cryptography jsonschema")


def die(msg):
    sys.exit("ERROR: " + msg)


def get_code(confirm):
    code = os.environ.get("SHARMA_PASSCODE")
    if code is None:
        if not sys.stdin.isatty():
            die("set SHARMA_PASSCODE or run in a terminal to be prompted")
        code = getpass.getpass("Code: ")
        if confirm and getpass.getpass("Code again: ") != code:
            die("codes did not match")
    code = code.strip()
    if not code:
        die("empty code")
    return code


def derive(code, salt, iterations):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations).derive(code.encode("utf-8"))


def b64(b):
    return base64.b64encode(b).decode("ascii")


def validate(data, schema_path):
    try:
        import jsonschema
    except ImportError:
        die("Missing package: pip install jsonschema (schema check is required before encrypting)")
    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)
    cls = jsonschema.validators.validator_for(schema)
    errors = sorted(cls(schema).iter_errors(data), key=lambda e: list(e.absolute_path))
    if errors:
        print("Schema check FAILED (%d problem%s):" % (len(errors), "" if len(errors) == 1 else "s"), file=sys.stderr)
        for e in errors[:50]:
            where = "/".join(str(p) for p in e.absolute_path) or "(root)"
            print("  - %s: %s" % (where, e.message), file=sys.stderr)
        die("fix the data file; nothing was written")
    # Same-id check the schema can't express.
    ids = [i.get("id") for i in data.get("invoices", []) if isinstance(i, dict)]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        die("duplicate invoice ids: " + ", ".join(map(str, dup)))
    print("Schema check passed: %d invoices, %d P&L months, %d P&L jobs." % (
        len(data.get("invoices", [])), len(data.get("pnl", {}).get("months", [])), len(data.get("pnl", {}).get("jobs", []))))


def decrypt_env(env, code):
    if env.get("format") != FORMAT or env.get("kdf") != "PBKDF2-SHA256" or env.get("cipher") != "AES-GCM-256":
        die("not a %s file" % FORMAT)
    key = derive(code, base64.b64decode(env["salt"]), int(env["iterations"]))
    try:
        pt = AESGCM(key).decrypt(base64.b64decode(env["iv"]), base64.b64decode(env["ciphertext"]), None)
    except Exception:
        die("Wrong code (or the file is damaged)")
    return json.loads(pt.decode("utf-8"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--decrypt", action="store_true", help="turn finance-data.enc.json back into a local plain finance-data.json")
    ap.add_argument("--plain", default=os.path.join(ROOT, "finance-data.json"))
    ap.add_argument("--enc", default=os.path.join(ROOT, "finance-data.enc.json"))
    ap.add_argument("--schema", default=os.path.join(ROOT, "finance-data.schema.json"))
    ap.add_argument("--iterations", type=int, default=ITERATIONS)
    a = ap.parse_args()

    if a.decrypt:
        with open(a.enc, encoding="utf-8") as f:
            env = json.load(f)
        data = decrypt_env(env, get_code(False))
        with open(a.plain, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        print("Wrote %s (local only; it is in .gitignore, never commit it)." % a.plain)
        return

    if a.iterations < 600_000:
        die("iterations must be 600000 or more")
    with open(a.plain, encoding="utf-8") as f:
        data = json.load(f)
    validate(data, a.schema)
    code = get_code(True)
    salt, iv = os.urandom(16), os.urandom(12)
    key = derive(code, salt, a.iterations)
    pt = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ct = AESGCM(key).encrypt(iv, pt, None)
    env = {"format": FORMAT, "kdf": "PBKDF2-SHA256", "hash": "SHA-256", "iterations": a.iterations,
           "cipher": "AES-GCM-256", "salt": b64(salt), "iv": b64(iv), "ciphertext": b64(ct)}
    # Round-trip check before writing.
    if decrypt_env(env, code) != data:
        die("round-trip check failed; nothing was written")
    with open(a.enc, "w", encoding="utf-8") as f:
        json.dump(env, f, indent=2)
        f.write("\n")
    print("Wrote %s. Commit only this file. Do not commit finance-data.json." % a.enc)


if __name__ == "__main__":
    main()
