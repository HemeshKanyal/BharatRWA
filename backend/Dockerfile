FROM node:18-bullseye

# 1. Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    git \
    cmake \
    build-essential \
    libssl-dev \
    pkg-config \
    libc++1 \
    libc++abi1 \
    jq \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Noir (Nargo) v1.0.0-beta.19 globally
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
RUN /root/.nargo/bin/noirup -v 1.0.0-beta.19 && \
    cp /root/.nargo/bin/nargo /usr/local/bin/nargo

# 3. Install Barretenberg (bb) globally
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash && \
    FIND_BBUP=$(find /root -name "bbup" -type f | head -n 1) && \
    $FIND_BBUP -v 0.47.1 && \
    FIND_BB=$(find /root -name "bb" -type f | head -n 1) && \
    cp $FIND_BB /usr/local/bin/bb
RUN chmod +x /usr/local/bin/bb || true

# 4. Setup working directory
WORKDIR /app

# 5. Copy package files and install node dependencies
COPY --chown=node package*.json ./
RUN npm install

# 6. Copy application code
COPY --chown=node . .

# 7. Pre-compile Noir circuit
WORKDIR /app/zk_kyc
RUN nargo compile
WORKDIR /app

# 8. Final permissions
RUN chown -R node:node /app
USER node

# 9. Hugging Face environment
EXPOSE 7860
ENV PORT=7860

# 10. Launch server
CMD ["node", "server.js"]
