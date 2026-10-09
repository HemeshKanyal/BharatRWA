// Shared secrets come from the environment only — never hardcode keys here.
// Locally: `node --env-file=.env server.js` (Node 20.6+). On Hugging Face: set Space secrets.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. See backend/README.md.`);
    process.exit(1);
  }
  return value;
}

module.exports = {
  RPC: requireEnv('SEPOLIA_RPC_URL'),
  PK: requireEnv('PRIVATE_KEY'),
};
