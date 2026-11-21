// eml-lib masks a session token only when it is whole: the exact --accessToken value, or a JWT with all three
// parts. Logs also hold cut-off copies. The JVM truncates the java_command line of hs_err_pid*.log at 2000
// characters, which leaves a token with no signature and half a payload, and that slipped through. So mask
// anything that starts like a JWT ("eyJ" is base64 for '{"'), however much of it follows.
const JWT_START = /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*){0,2}/g

export function maskTokens(text: string) {
  return text.replace(JWT_START, '<JWT>')
}
