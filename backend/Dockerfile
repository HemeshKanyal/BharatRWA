FROM node:24-bookworm

# bb needs glibc >= 2.34 (bookworm has 2.36; the previous bullseye image had 2.31).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    bash \
    git \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the versions that generated bharat-rwa/src/zk/WalletBoundHonkVerifier.sol.
# Proofs from other bb versions may not verify against that contract.
ARG NARGO_VERSION=1.0.0-beta.22
ARG BB_VERSION=5.0.0-nightly.20260522

# 1. Noir (nargo)
RUN curl -fsSL https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash && \
    /root/.nargo/bin/noirup -v ${NARGO_VERSION} && \
    cp /root/.nargo/bin/nargo /usr/local/bin/nargo

# 2. Barretenberg (bb)
RUN curl -fsSL https://raw.githubusercontent.com/AztecProtocol/aztec-packages/next/barretenberg/bbup/install | bash && \
    /root/.bb/bbup -v ${BB_VERSION} && \
    cp /root/.bb/bb /usr/local/bin/bb && \
    chmod +x /usr/local/bin/bb && \
    nargo --version && bb --version

WORKDIR /app

# 3. Node dependencies
COPY --chown=node package*.json ./
RUN npm ci --omit=dev

# 4. Application code
COPY --chown=node . .

# 5. Compile the circuit and write its verification key at build time
WORKDIR /app/zk_kyc
RUN nargo compile && \
    bb write_vk -b ./target/zk_kyc.json -o ./target/vk -t evm
WORKDIR /app

RUN chown -R node:node /app
USER node

# Hugging Face Spaces
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]
