// Shared client code for the BharatRWA Token-2022 RWA mint.
// Used by the CLI scripts in this folder and by tests/rwa.ts.

import { AnchorProvider, BN, Program } from "@anchor-lang/core";
import {
  AccountState,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, TokenMetadata } from "@solana/spl-token-metadata";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import type { Compliance } from "../target/types/compliance";
import type { TransferHook } from "../target/types/transfer_hook";
import complianceIdl from "../target/idl/compliance.json";
import transferHookIdl from "../target/idl/transfer_hook.json";

export const COMPLIANCE_PROGRAM_ID = new PublicKey(complianceIdl.address);
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(transferHookIdl.address);

export interface Rwa {
  connection: Connection;
  /** Mint authority, permanent delegate and compliance issuer. Pays fees. */
  issuer: Keypair;
  compliance: Program<Compliance>;
  hook: Program<TransferHook>;
}

export function loadPrograms(provider: AnchorProvider, issuer: Keypair): Rwa {
  return {
    connection: provider.connection,
    issuer,
    compliance: new Program<Compliance>(complianceIdl as Compliance, provider),
    hook: new Program<TransferHook>(transferHookIdl as TransferHook, provider),
  };
}

// ============================================================
//                          PDAs
// ============================================================

const pda = (seeds: Buffer[], programId: PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];

export const configPda = (mint: PublicKey) =>
  pda([Buffer.from("config"), mint.toBuffer()], COMPLIANCE_PROGRAM_ID);

export const entryPda = (mint: PublicKey, wallet: PublicKey) =>
  pda([Buffer.from("allowlist"), mint.toBuffer(), wallet.toBuffer()], COMPLIANCE_PROGRAM_ID);

export const legalHoldPda = (tokenAccount: PublicKey) =>
  pda([Buffer.from("legal-hold"), tokenAccount.toBuffer()], COMPLIANCE_PROGRAM_ID);

export const extraMetasPda = (mint: PublicKey) =>
  pda([Buffer.from("extra-account-metas"), mint.toBuffer()], TRANSFER_HOOK_PROGRAM_ID);

export const ata = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);

// ============================================================
//                         ACTIONS
// ============================================================

async function send(rwa: Rwa, ixs: TransactionInstruction[], signers: Keypair[]) {
  return sendAndConfirmTransaction(rwa.connection, new Transaction().add(...ixs), signers, {
    commitment: "confirmed",
  });
}

export interface MintParams {
  mint: Keypair;
  attester: PublicKey;
  decimals: number;
  name: string;
  symbol: string;
  uri: string;
}

/**
 * Create the Token-2022 mint with all extensions, then register it with the
 * compliance and transfer-hook programs.
 *
 * Extensions:
 * - TransferHook       -> transfer_hook program (allowlist check)
 * - DefaultAccountState = Frozen (new holders must be approved first)
 * - PermanentDelegate  -> issuer (forced transfers)
 * - MetadataPointer    -> the mint itself, with on-mint TokenMetadata
 * Freeze authority is the compliance Config PDA, so that the compliance
 * program can thaw on approval and freeze on the issuer's instruction.
 */
export async function createRwaMint(rwa: Rwa, p: MintParams): Promise<PublicKey> {
  const { issuer, connection } = rwa;
  const mint = p.mint.publicKey;

  const extensions = [
    ExtensionType.TransferHook,
    ExtensionType.DefaultAccountState,
    ExtensionType.PermanentDelegate,
    ExtensionType.MetadataPointer,
  ];
  const metadata: TokenMetadata = {
    mint,
    updateAuthority: issuer.publicKey,
    name: p.name,
    symbol: p.symbol,
    uri: p.uri,
    additionalMetadata: [],
  };
  // The account is created at the fixed-extension size; Token-2022 reallocs
  // when the metadata is written, so fund the metadata bytes up front.
  const mintLen = getMintLen(extensions);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

  await send(
    rwa,
    [
      SystemProgram.createAccount({
        fromPubkey: issuer.publicKey,
        newAccountPubkey: mint,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferHookInstruction(
        mint,
        issuer.publicKey,
        TRANSFER_HOOK_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeDefaultAccountStateInstruction(
        mint,
        AccountState.Frozen,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializePermanentDelegateInstruction(mint, issuer.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMetadataPointerInstruction(
        mint,
        issuer.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mint,
        p.decimals,
        issuer.publicKey,
        configPda(mint),
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint,
        updateAuthority: issuer.publicKey,
        mint,
        mintAuthority: issuer.publicKey,
        name: p.name,
        symbol: p.symbol,
        uri: p.uri,
      }),
    ],
    [issuer, p.mint]
  );

  const initCompliance = await rwa.compliance.methods
    .initialize(p.attester)
    .accountsPartial({ issuer: issuer.publicKey, mint })
    .instruction();
  const initHook = await rwa.hook.methods
    .initializeExtraAccountMetaList()
    .accountsPartial({ payer: issuer.publicKey, mint })
    .instruction();
  await send(rwa, [initCompliance, initHook], [issuer]);

  return mint;
}

/**
 * Attester approves an investor: creates their token account if needed,
 * writes the allowlist entry and thaws the account, in one transaction.
 */
export async function approveInvestor(
  rwa: Rwa,
  mint: PublicKey,
  attester: Keypair,
  wallet: PublicKey,
  jurisdiction: string,
  expiresAt: number
) {
  const tokenAccount = ata(mint, wallet);
  const createAta = createAssociatedTokenAccountIdempotentInstruction(
    attester.publicKey,
    tokenAccount,
    wallet,
    mint,
    TOKEN_2022_PROGRAM_ID
  );
  const approve = await rwa.compliance.methods
    .approveInvestor(jurisdictionBytes(jurisdiction), new BN(expiresAt))
    .accountsPartial({
      attester: attester.publicKey,
      mint,
      wallet,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  return send(rwa, [createAta, approve], [attester]);
}

export async function updateInvestor(
  rwa: Rwa,
  mint: PublicKey,
  attester: Keypair,
  wallet: PublicKey,
  approved: boolean,
  jurisdiction: string,
  expiresAt: number
) {
  return rwa.compliance.methods
    .updateInvestor(approved, jurisdictionBytes(jurisdiction), new BN(expiresAt))
    .accountsPartial({ attester: attester.publicKey, entry: entryPda(mint, wallet) })
    .signers([attester])
    .rpc({ commitment: "confirmed" });
}

export async function removeInvestor(rwa: Rwa, mint: PublicKey, attester: Keypair, wallet: PublicKey) {
  return rwa.compliance.methods
    .removeInvestor()
    .accountsPartial({ attester: attester.publicKey, entry: entryPda(mint, wallet) })
    .signers([attester])
    .rpc({ commitment: "confirmed" });
}

/** Issuer mints to an investor. The investor's account must be thawed (approved). */
export async function mintTokens(rwa: Rwa, mint: PublicKey, wallet: PublicKey, amount: bigint, decimals: number) {
  const ix = createMintToCheckedInstruction(
    mint,
    ata(mint, wallet),
    rwa.issuer.publicKey,
    amount,
    decimals,
    [],
    TOKEN_2022_PROGRAM_ID
  );
  return send(rwa, [ix], [rwa.issuer]);
}

/**
 * A normal holder-to-holder transfer. The transfer-hook extra accounts are
 * resolved from the on-chain extra-account-metas PDA, as a wallet would do.
 */
export async function transfer(
  rwa: Rwa,
  mint: PublicKey,
  from: Keypair,
  to: PublicKey,
  amount: bigint,
  decimals: number
) {
  const ix = await createTransferCheckedWithTransferHookInstruction(
    rwa.connection,
    ata(mint, from.publicKey),
    mint,
    ata(mint, to),
    from.publicKey,
    amount,
    decimals,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  return send(rwa, [ix], [rwa.issuer, from]);
}

async function issuerFreezeIx(rwa: Rwa, mint: PublicKey, wallet: PublicKey) {
  return rwa.compliance.methods
    .freezeAccount()
    .accountsPartial({
      issuer: rwa.issuer.publicKey,
      mint,
      tokenAccount: ata(mint, wallet),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

async function issuerThawIx(rwa: Rwa, mint: PublicKey, wallet: PublicKey) {
  const tokenAccount = ata(mint, wallet);
  return rwa.compliance.methods
    .thawAccount()
    .accountsPartial({
      issuer: rwa.issuer.publicKey,
      mint,
      tokenAccount,
      legalHold: legalHoldPda(tokenAccount),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
}

/** Issuer freezes a holder's account and places it under legal hold. */
export async function freezeAccount(rwa: Rwa, mint: PublicKey, wallet: PublicKey) {
  return send(rwa, [await issuerFreezeIx(rwa, mint, wallet)], [rwa.issuer]);
}

/** Issuer thaws a holder's account and lifts any legal hold. */
export async function thawAccount(rwa: Rwa, mint: PublicKey, wallet: PublicKey) {
  return send(rwa, [await issuerThawIx(rwa, mint, wallet)], [rwa.issuer]);
}

/**
 * Forced transfer (court order / legal recovery) by the issuer acting as
 * permanent delegate. Token-2022 cannot move tokens out of a frozen account,
 * so if the source is frozen this atomically thaws it, transfers, and
 * freezes it again. The hook still requires the destination to be
 * allowlisted.
 */
export async function forcedTransfer(
  rwa: Rwa,
  mint: PublicKey,
  fromWallet: PublicKey,
  to: PublicKey,
  amount: bigint,
  decimals: number
) {
  const source = ata(mint, fromWallet);
  const wasFrozen = (await getAccount(rwa.connection, source, "confirmed", TOKEN_2022_PROGRAM_ID))
    .isFrozen;

  const move = await createTransferCheckedWithTransferHookInstruction(
    rwa.connection,
    source,
    mint,
    ata(mint, to),
    rwa.issuer.publicKey, // permanent delegate signs instead of the owner
    amount,
    decimals,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const ixs = wasFrozen
    ? [await issuerThawIx(rwa, mint, fromWallet), move, await issuerFreezeIx(rwa, mint, fromWallet)]
    : [move];
  return send(rwa, ixs, [rwa.issuer]);
}

export function jurisdictionBytes(code: string): number[] {
  if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Jurisdiction must be 2 uppercase letters, got "${code}"`);
  return [code.charCodeAt(0), code.charCodeAt(1)];
}

export async function balanceOf(rwa: Rwa, mint: PublicKey, wallet: PublicKey): Promise<bigint> {
  return (await getAccount(rwa.connection, ata(mint, wallet), "confirmed", TOKEN_2022_PROGRAM_ID))
    .amount;
}

export async function isFrozen(rwa: Rwa, mint: PublicKey, wallet: PublicKey): Promise<boolean> {
  return (await getAccount(rwa.connection, ata(mint, wallet), "confirmed", TOKEN_2022_PROGRAM_ID))
    .isFrozen;
}

/** Current cluster time (unix seconds), which can differ from the local clock. */
export async function clusterTime(connection: Connection): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  const t = await connection.getBlockTime(slot);
  if (t === null) throw new Error("block time unavailable");
  return t;
}
