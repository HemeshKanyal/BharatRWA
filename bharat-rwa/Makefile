# BharatRWA Makefile
# ==================

-include .env

.PHONY: all build test clean deploy

# ============================================================
#                    BUILD & TEST
# ============================================================

build:
	forge build

test:
	forge test -vvv

test-gas:
	forge test --gas-report

test-fuzz:
	forge test --fuzz-runs 1000 -vvv

snapshot:
	forge snapshot

fmt:
	forge fmt

lint:
	forge fmt --check

clean:
	forge clean

# ============================================================
#                    DEPLOYMENT
# ============================================================

deploy-local:
	forge script script/DeployAll.s.sol:DeployAll \
		--rpc-url http://127.0.0.1:8545 \
		--broadcast \
		-vvvv

deploy-sepolia:
	forge script script/DeployAll.s.sol:DeployAll \
		--rpc-url $(SEPOLIA_RPC_URL) \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		--verify \
		--etherscan-api-key $(ETHERSCAN_API_KEY) \
		-vvvv

# ============================================================
#                    LOCAL NODE
# ============================================================

anvil:
	anvil --block-time 2

# ============================================================
#                    ZK CIRCUIT
# ============================================================

zk-compile:
	cd ../zk_kyc && nargo compile

zk-execute:
	cd ../zk_kyc && nargo execute

zk-prove:
	cd ../zk_kyc && bb prove \
		-b ./target/zk_kyc.json \
		-w ./target/zk_kyc.gz \
		-o ./target/proof \
		-t evm --verify

zk-verify:
	cd ../zk_kyc && bb verify \
		-p ./target/proof \
		-k ./target/vk/vk

zk-verifier:
	cd ../zk_kyc && \
	nargo compile && \
	bb write_vk -b ./target/zk_kyc.json -o ./target/vk/ -t evm && \
	bb write_solidity_verifier -k ./target/vk/vk -o ../bharat-rwa/src/UltraVerifier.sol -t evm
	@echo "HonkVerifier (Solidity) generated at src/UltraVerifier.sol"

# ============================================================
#                    UTILITIES
# ============================================================

sizes:
	forge build --sizes

slither:
	slither src/

help:
	@echo "BharatRWA Makefile Commands:"
	@echo "  make build          - Compile contracts"
	@echo "  make test           - Run all tests (verbose)"
	@echo "  make test-gas       - Run tests with gas report"
	@echo "  make test-fuzz      - Run fuzz tests (1000 runs)"
	@echo "  make snapshot       - Generate gas snapshots"
	@echo "  make fmt            - Format code"
	@echo "  make lint           - Check formatting"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make deploy-local   - Deploy to Anvil"
	@echo "  make deploy-sepolia - Deploy to Sepolia"
	@echo "  make anvil          - Start Anvil local node"
	@echo "  make zk-compile     - Compile Noir circuit"
	@echo "  make zk-execute     - Execute circuit and generate witness"
	@echo "  make zk-prove       - Generate ZK proof (needs ~2GB RAM)"
	@echo "  make zk-verify      - Verify ZK proof natively"
	@echo "  make zk-verifier    - Generate HonkVerifier Solidity contract"
	@echo "  make sizes          - Show contract sizes"
	@echo "  make help           - Show this help"

