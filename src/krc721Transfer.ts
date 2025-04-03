import { RpcClient, ScriptBuilder, Opcodes, addressFromScriptPublicKey, createTransactions, kaspaToSompi, PrivateKey } from "../wasm/kaspa";
import { config } from 'dotenv';

// Load environment variables
config();

// Constants
const network = process.env.NETWORK || 'mainnet';
const FIXED_FEE = '0.0001'; // Fixed minimal fee in KAS
const feeInSompi = kaspaToSompi(FIXED_FEE)!;
const timeout = 180000; // 3 minutes timeout

// UTXO selection thresholds in sompi (1 KAS = 100_000_000 sompi)
const PREFERRED_MIN_UTXO = BigInt(kaspaToSompi('5')!); // 5 KAS
const ABSOLUTE_MIN_UTXO = BigInt(kaspaToSompi('1')!);  // 1 KAS

interface NFTTransferData {
  walletAddress: string;
  tick: string;
  id: string;
}

// Helper function to find suitable UTXO
function findSuitableUtxo(entries: any[]): any {
  if (!entries.length) return null;
  
  // First try to find a UTXO ≥ 5 KAS
  let utxo = entries.find(entry => BigInt(entry.entry.amount) >= PREFERRED_MIN_UTXO);
  
  // If not found, try to find a UTXO ≥ 1 KAS
  if (!utxo) {
    utxo = entries.find(entry => BigInt(entry.entry.amount) >= ABSOLUTE_MIN_UTXO);
  }
  
  return utxo;
}

// Helper function to convert sompi to KAS
function sompiToKaspa(sompi: bigint): string {
  return (Number(sompi) / 100_000_000).toFixed(8);
}

export async function transferKRC721(
  rpc: RpcClient,
  treasuryPrivateKeyStr: string,
  treasuryAddressStr: string,
  transferData: NFTTransferData
): Promise<{ commitTx: string; revealTx: string }> {
  const { walletAddress, tick, id } = transferData;
  let eventReceived = false;
  let addedEventTrxId: any;
  let SubmittedtrxId: any;
  
  // Subscribe to UTXO changes
  console.log(`Subscribing to UTXO changes for address: ${treasuryAddressStr}`);
  try {
    await rpc.subscribeUtxosChanged([treasuryAddressStr]);
  } catch (error) {
    console.error(`Failed to subscribe to UTXO changes: ${error}`);
    throw error;
  }

  // Setup UTXO change event listener
  rpc.addEventListener('utxos-changed', async (event: any) => {
    console.log(`UTXO changes detected for address: ${treasuryAddressStr}`);
    
    // Check for UTXOs removed for the specific address
    const removedEntry = event.data.removed.find((entry: any) => 
      entry.address.payload === treasuryAddressStr.split(':')[1]
    );
    const addedEntry = event.data.added.find((entry: any) => 
      entry.address.payload === treasuryAddressStr.split(':')[1]
    );    
    if (removedEntry && addedEntry) {
      console.log(`Added UTXO found for address: ${treasuryAddressStr} with UTXO: ${JSON.stringify(addedEntry, (key, value) =>
        typeof value === 'bigint' ? value.toString() + 'n' : value)}`);
      console.log(`Removed UTXO found for address: ${treasuryAddressStr} with UTXO: ${JSON.stringify(removedEntry, (key, value) =>
        typeof value === 'bigint' ? value.toString() + 'n' : value)}`);
      addedEventTrxId = addedEntry.outpoint.transactionId;
      console.log(`Added UTXO TransactionId: ${addedEventTrxId}`);
      if (addedEventTrxId == SubmittedtrxId) {
        eventReceived = true;
      }
    } else {
      console.log(`No removed UTXO found for address: ${treasuryAddressStr} in this UTXO change event`);
    }
  });
  
  // Create the NFT transfer script data - Updated to match KRC20 format exactly
  const data = {
    "op": "transfer",
    "p": "krc-721",
    "tick": tick.toLowerCase(),
    "to": walletAddress,
    "tokenId": id
  };

  // Create private key object and get public key
  const privateKey = new PrivateKey(treasuryPrivateKeyStr);
  const publicKey = privateKey.toPublicKey().toXOnlyPublicKey().toString();

  // Create the script for KRC721 transfer - Updated to match KRC20 format exactly
  const script = new ScriptBuilder()
    .addData(publicKey)
    .addOp(Opcodes.OpCheckSig)
    .addOp(Opcodes.OpFalse)
    .addOp(Opcodes.OpIf)
    .addData(Buffer.from("kasplex"))
    .addI64(0n)
    .addData(Buffer.from(JSON.stringify(data, null, 0)))
    .addOp(Opcodes.OpEndIf);

  const P2SHAddress = addressFromScriptPublicKey(script.createPayToScriptHashScript(), network)!;
  console.log(`P2SH Address: ${P2SHAddress.toString()}`);
  
  try {
    const { entries } = await rpc.getUtxosByAddresses([treasuryAddressStr]);
    
    // Calculate total balance
    const totalBalance = entries.reduce((sum, entry) => sum + BigInt(entry.entry.amount), BigInt(0));
    console.log(`Total treasury balance: ${sompiToKaspa(totalBalance)} KAS`);
    
    // Find a suitable UTXO
    const selectedUtxo = findSuitableUtxo(entries);
    if (!selectedUtxo) {
      throw new Error(`No suitable UTXO found. Each transfer requires at least ${sompiToKaspa(ABSOLUTE_MIN_UTXO)} KAS. Total balance: ${sompiToKaspa(totalBalance)} KAS`);
    }

    let utxoAmount = BigInt(selectedUtxo.entry.amount);
    console.log(`Selected UTXO with amount: ${sompiToKaspa(utxoAmount)} KAS`);

    // Adjust utxoAmount if only one entry
    if (entries.length === 1) {
      utxoAmount = utxoAmount - (3n * BigInt(feeInSompi)!);
    }

    // Create commit transaction
    const { transactions: commitTransactions } = await createTransactions({
      priorityEntries: [selectedUtxo],
      entries: entries.filter(e => e !== selectedUtxo),
      outputs: [{
        address: P2SHAddress.toString(),
        amount: PREFERRED_MIN_UTXO // Send PREFERRED_MIN_UTXO
      }],
      changeAddress: treasuryAddressStr,
      priorityFee: feeInSompi,
      networkId: network
    });

    // Sign and submit commit transaction
    const commitTx = commitTransactions[0];
    commitTx.sign([privateKey]);
    
    // Do NOT add the P2SH script to the commit transaction
    // The commit transaction should NOT include the script
    const commitHash = await commitTx.submit(rpc);
    console.log(`Submitted commit transaction: ${commitHash}`);
    SubmittedtrxId = commitHash;

    // Set a timeout to handle failure cases
    const commitTimeout = setTimeout(() => {
      if (!eventReceived) {
        throw new Error('Timeout - Commit transaction did not mature within 3 minutes');
      }
    }, timeout);

    // Wait until the maturity event has been received
    while (!eventReceived) {
      await new Promise(resolve => setTimeout(resolve, 500)); // wait and check every 500ms
    }
    clearTimeout(commitTimeout);

    // Reset event received flag for reveal transaction
    eventReceived = false;

    // Get updated entries for reveal transaction
    const { entries: updatedEntries } = await rpc.getUtxosByAddresses([treasuryAddressStr]);
    console.log(`Creating revealUTXOs from P2SHAddress`);
    const revealUTXOs = await rpc.getUtxosByAddresses([P2SHAddress.toString()]);
    console.log(`Creating Transaction with revealUTX0s entries: ${revealUTXOs.entries[0]}`);

    // Second transaction: Send funds to recipient
    const revealUtxoAmount = BigInt(revealUTXOs.entries[0].entry.amount);

    const { transactions } = await createTransactions({
      priorityEntries: [revealUTXOs.entries[0]],
      entries: [], // Empty entries array to ensure only 1 input
      outputs: [{
        address: walletAddress, // Send to recipient
        amount: revealUtxoAmount - BigInt(feeInSompi) // Return everything except fee
      }],
      changeAddress: treasuryAddressStr,
      priorityFee: feeInSompi,
      networkId: network
    });

    // Sign and submit reveal transaction
    const revealTx = transactions[0];
    revealTx.sign([privateKey], false);
    
    // Add the P2SH script to the reveal transaction - This is where the script should be
    const signature = await revealTx.createInputSignature(0, privateKey);
    revealTx.fillInput(0, script.encodePayToScriptHashSignatureScript(signature));
    
    const revealHash = await revealTx.submit(rpc);
    console.log(`Submitted reveal transaction: ${revealHash}`);
    SubmittedtrxId = revealHash;

    // Set a timeout for reveal transaction
    const revealTimeout = setTimeout(() => {
      if (!eventReceived) {
        throw new Error('Timeout - Reveal transaction did not mature within 3 minutes');
      }
    }, timeout);

    // Wait until the reveal maturity event has been received
    while (!eventReceived) {
      await new Promise(resolve => setTimeout(resolve, 500)); // wait and check every 500ms
    }
    clearTimeout(revealTimeout);

    // Verify reveal transaction acceptance
    try {
      const updatedUTXOs = await rpc.getUtxosByAddresses([treasuryAddressStr]);
      const revealAccepted = updatedUTXOs.entries.some(entry => {
        const transactionId = entry.entry.outpoint ? entry.entry.outpoint.transactionId : undefined;
        return transactionId === revealHash;
      });

      if (revealAccepted) {
        console.log(`Reveal transaction has been accepted: ${revealHash}`);
      } else if (!eventReceived) {
        console.log('Reveal transaction has not been accepted yet.');
      }
    } catch (error) {
      console.error(`Error checking reveal transaction status: ${error}`);
    }

    return {
      commitTx: commitHash,
      revealTx: revealHash
    };
  } catch (error) {
    console.error('Error during KRC721 transfer:', error);
    throw error;
  }
}

export async function processNFTTransfers(
  rpc: RpcClient,
  transferList: NFTTransferData[]
): Promise<void> {
  const treasuryPrivateKeyStr = process.env.TREASURY_PRIVATE_KEY;
  const treasuryAddressStr = process.env.TREASURY_ADDRESS;
  
  if (!treasuryPrivateKeyStr) {
    throw new Error("Treasury private key not found in environment variables");
  }
  
  if (!treasuryAddressStr) {
    throw new Error("Treasury address not found in environment variables");
  }

  // Calculate required funds
  const requiredFundsPerTransfer = PREFERRED_MIN_UTXO + BigInt(feeInSompi);
  const totalRequiredFunds = requiredFundsPerTransfer * BigInt(transferList.length);
  console.log(`Required funds: ${sompiToKaspa(totalRequiredFunds)} KAS (${sompiToKaspa(requiredFundsPerTransfer)} KAS per transfer)`);

  // Process transfers sequentially with a delay between each
  for (let i = 0; i < transferList.length; i++) {
    const transfer = transferList[i];
    try {
      console.log(`Processing transfer ${i+1}/${transferList.length}: NFT ${transfer.tick}:${transfer.id} to ${transfer.walletAddress}`);
      const result = await transferKRC721(rpc, treasuryPrivateKeyStr, treasuryAddressStr, transfer);
      console.log(`Successfully transferred NFT ${transfer.tick}:${transfer.id} to ${transfer.walletAddress}`);
      console.log(`Commit TX: ${result.commitTx}`);
      console.log(`Reveal TX: ${result.revealTx}`);
      
      // Add a delay between transactions to prevent UTXO conflicts
      if (i < transferList.length - 1) {
        const delaySeconds = 10; // 10 seconds delay between transactions
        console.log(`Waiting ${delaySeconds} seconds before processing next transfer...`);
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }
    } catch (error) {
      console.error(`Failed to transfer NFT ${transfer.tick}:${transfer.id} to ${transfer.walletAddress}:`, error);
    }
  }
} 