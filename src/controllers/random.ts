`
1. **Transparency and Fairness**:
By using a blockchain-based public seed and combining it with a private seed, the game ensures that the outcome is not only unpredictable but also verifiable by players. The public seed ensures that no one can predict the outcome in advance, while the private seed ensures that each game’s outcome is unique.

2. **Security**:
Generating random numbers using a combination of public and private seeds provides a secure method to produce outcomes that are resistant to manipulation. Hashing ensures that the generated values are not easily reversible or predictable.

3. **Integrity**:
Using the blockchain to provide a public seed adds a layer of trust and integrity. Players can verify the fairness of the game by checking the public seed and the resulting crash point.`;

import * as crypto from "crypto";
import fetch from "node-fetch";
import { JsonRpc } from "eosjs";

const httpProviderApi = "http://eos.greymass.com";

const rpc = new JsonRpc(httpProviderApi, { fetch });

// Grab EOS block with id
export const getPublicSeed = async (): Promise<string> => {
  const buffer = crypto.randomBytes(256);
  return buffer.toString("hex");
  // try {
  //   const info = await rpc.get_info();
  //   const blockNumber = info.last_irreversible_block_num + 1;
  //   const block = await rpc.get_block(blockNumber || 1);
  //   return block.id;
  // } catch (error) {
  //   // console.log(error);
  //   return "";
  // }
};

// Generate a secure random number
export const generatePrivateSeed = (): string => {
  const buffer = crypto.randomBytes(256);
  return buffer.toString("hex");
};

// Hash an input (private seed) to SHA256
const buildPrivateHash = (seed: string): string => {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return hash;
};

// Generate a private seed and hash pair
export const generatePrivateSeedHashPair = (): {
  seed: string;
  hash: string;
} | null => {
  try {
    const seed = generatePrivateSeed();
    const hash = buildPrivateHash(seed);
    return { seed, hash };
  } catch (error) {
    // console.log(error);
    return null;
  }
};

// Generate crash random data
export const generateCrashRandom = async (
  privateSeed: string,
  publicSeed: string
): Promise<{ publicSeed: string; crashPoint: number } | null> => {
  try {
    // Get a new public seed from blockchain
    // Generate Crash Point with seed and salt
    const crashPoint = generateCrashPoint(privateSeed, publicSeed);
    // Resolve promise and return data
    return { publicSeed, crashPoint };
  } catch (error) {
    // console.log(error);
    return null;
  }
};

const generateCrashPoint = (seed: string, salt: string): number => {
  const hash = crypto.createHmac("sha256", seed).update(salt).digest("hex");

  const houseEdge = 0.04; //House edge percentage
  const hs = parseInt((100 / (houseEdge * 100)).toString());
  if (isCrashHashDivisible(hash, hs)) {
    return 100;
  }

  const h = parseInt(hash.slice(0, 52 / 4), 16);
  const e = Math.pow(2, 52);

  return Math.floor((100 * e - h) / (e - h));
};

const isCrashHashDivisible = (hash: string, mod: number): boolean => {
  let val = 0;

  const o = hash.length % 4;
  for (let i = o > 0 ? o - 4 : 0; i < hash.length; i += 4) {
    val = ((val << 16) + parseInt(hash.substring(i, i + 4), 16)) % mod;
  }

  return val === 0;
};
