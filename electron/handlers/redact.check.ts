// Run with: npm test
import assert from 'node:assert/strict'
import { maskTokens } from './redact.ts'

// Synthetic token, same shape as a Minecraft access token (header.payload.signature, base64url).
const part = (json: string) => Buffer.from(json).toString('base64url')
const header = part('{"kid":"synthetic","alg":"RS256"}')
const payload = part(JSON.stringify({ xuid: '0000000000000000', profiles: { mc: 'not-a-real-profile' }, pad: 'x'.repeat(300) }))
const signature = 'c2lnbmF0dXJl_-'.repeat(20)
const token = `${header}.${payload}.${signature}`

// Whole token, in each format the logs use.
assert.equal(maskTokens(`--accessToken ${token} --clientId abc`), '--accessToken <JWT> --clientId abc')
assert.equal(maskTokens(`[--accessToken, ${token}, --xuid, ${token}]`), '[--accessToken, <JWT>, --xuid, <JWT>]')
assert.equal(maskTokens(`xuid -> ${token}`), 'xuid -> <JWT>')

// The form that leaked: hs_err's java_command line, cut by the JVM in the middle of the payload.
const javaCommand = `java_command: Main --uuid 1234 --accessToken ${token} --clientId abc --xuid ${token}`
const cut = javaCommand.slice(0, javaCommand.length - signature.length - 150)
assert.equal(maskTokens(cut), 'java_command: Main --uuid 1234 --accessToken <JWT> --clientId abc --xuid <JWT>')

// Cut at every other point of the token: nothing but a few header characters may survive.
for (let keep = 12; keep <= token.length; keep += 7) {
  const out = maskTokens(`--xuid ${token.slice(0, keep)}`)
  assert.equal(out, '--xuid <JWT>', `token cut after ${keep} characters`)
}

// Ordinary log text stays readable.
for (const line of ['GreyJacketItem registered', 'Loaded 132 mods in 4.2 s', 'at net.minecraft.client.main.Main.main(Main.java:230)', 'key eyJ short']) {
  assert.equal(maskTokens(line), line)
}

console.log('redact check passed')
