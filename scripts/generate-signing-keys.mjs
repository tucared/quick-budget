#!/usr/bin/env node
// Generates an ES256 JWK file at ./signing_keys.json for local Supabase to sign
// access tokens with. Without this, local Supabase uses HS256 which the app's
// JWKS verifier (jose) cannot validate.
//
// After running this, uncomment `signing_keys_path = "./signing_keys.json"` in
// supabase/config.toml and restart the local stack (`supabase stop && supabase
// start`). See README "Quick Start" for the full bootstrap.

import { writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { generateKeyPair, exportJWK } from "jose"

const OUTPUT = "signing_keys.json"

const { privateKey } = await generateKeyPair("ES256", { extractable: true })
const jwk = await exportJWK(privateKey)
jwk.kid = randomUUID()
jwk.alg = "ES256"
jwk.use = "sig"

await writeFile(OUTPUT, JSON.stringify({ keys: [jwk] }, null, 2) + "\n", {
  flag: "wx", // refuse to overwrite an existing key file
})
console.log(`Wrote ${OUTPUT} (kid=${jwk.kid}). Next:`)
console.log(`  1. Uncomment 'signing_keys_path = "./signing_keys.json"' in supabase/config.toml`)
console.log(`  2. supabase stop && supabase start`)
