import { RpcClient, ScriptBuilder, Opcodes, addressFromScriptPublicKey, createTransactions, kaspaToSompi, PrivateKey } from "../wasm/kaspa";
import { config } from 'dotenv';

// Load environment variables
config();

// Constants
const network = process.env.NETWORK || 'mainnet';
const FIXED_FEE = '0.0001'; // Fixed minimal fee in KAS
const feeInSompi = kaspaToSompi(FIXED_FEE)!;
const timeout = 30000; // 30 second timeout

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

// Helper function to check and reconnect RPC connection
async function ensureRpcConnection(rpc: RpcClient): Promise<void> {
  try {
    // Try a simple RPC call to check connection
    await rpc.getInfo();
  } catch (error) {
    console.log('RPC connection lost, attempting to reconnect...');
    try {
      // Reconnect by reinitializing the connection
      await rpc.connect();
      console.log('RPC connection reestablished');
    } catch (reconnectError) {
      console.error('Failed to reconnect to RPC:', reconnectError);
      throw reconnectError;
    }
  }
}

export async function transferKRC721(
  rpc: RpcClient,
  treasuryPrivateKeyStr: string,
  treasuryAddressStr: string,
  transferData: NFTTransferData
): Promise<{ commitTx: string; revealTx: string }> {
  const { walletAddress, tick, id } = transferData;
  let eventReceived = false;
  let control = { stopPolling: false };
  let addedEventTrxId: any;
  let submittedTrxId: any;
  
  // Check and ensure RPC connection before starting
  await ensureRpcConnection(rpc);
  
  // Subscribe to UTXO changes
  console.log(`Subscribing to UTXO changes for address: ${treasuryAddressStr}`);
  try {
    await rpc.subscribeUtxosChanged([treasuryAddressStr]);
  } catch (error) {
    console.error(`Failed to subscribe to UTXO changes: ${error}`);
    // Try to reconnect and retry once
    await ensureRpcConnection(rpc);
    await rpc.subscribeUtxosChanged([treasuryAddressStr]);
  }

  // Setup UTXO change event listener
  rpc.addEventListener('utxos-changed', async (event: any) => {
    const removedEntry = event.data.removed.find((entry: any) => 
      entry.address.payload === treasuryAddressStr.split(':')[1]
    );
    const addedEntry = event.data.added.find((entry: any) => 
      entry.address.payload === treasuryAddressStr.split(':')[1]
    );    
    
    if (removedEntry && addedEntry) {
      addedEventTrxId = addedEntry.outpoint.transactionId;
      if (addedEventTrxId === submittedTrxId) {
        eventReceived = true;
        control.stopPolling = true;
      }
    }
  });
  
  // Create NFT transfer data object - MUST use tokenId as a string
  const data = { 
    "p": "krc-721", 
    "op": "transfer", 
    "tick": tick.toLowerCase(), 
    "tokenId": id.toString(), // Convert tokenId to string
    "to": walletAddress 
  };
  
  console.log(`Script data: ${JSON.stringify(data)}`);
  
  // Create private key object
  const privateKey = new PrivateKey(treasuryPrivateKeyStr);
  
  // Create the script for KRC721 transfer - key difference is "kspr" instead of "kasplex"
  const script = new ScriptBuilder()
    .addData(privateKey.toPublicKey().toXOnlyPublicKey().toString())
    .addOp(Opcodes.OpCheckSig)
    .addOp(Opcodes.OpFalse)
    .addOp(Opcodes.OpIf)
    .addData(Buffer.from("kspr"))  // This is the key difference from KRC20
    .addI64(0n)
    .addData(Buffer.from(JSON.stringify(data)))
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
      throw new Error(`No suitable UTXO found. Each transfer requires at least ${sompiToKaspa(ABSOLUTE_MIN_UTXO)} KAS.`);
    }

    let utxoAmount = BigInt(selectedUtxo.entry.amount);
    console.log(`Selected UTXO with amount: ${sompiToKaspa(utxoAmount)} KAS`);

    // Adjust utxoAmount if only one entry to account for fees
    if (entries.length === 1) {
      utxoAmount = utxoAmount - (3n * BigInt(feeInSompi));
    }

    // Create commit transaction with a single output
    const { transactions } = await createTransactions({
      priorityEntries: [selectedUtxo],
      entries: entries.filter(e => e !== selectedUtxo),
      outputs: [{
        address: P2SHAddress.toString(),
        amount: PREFERRED_MIN_UTXO
      }],
      changeAddress: treasuryAddressStr,
      priorityFee: feeInSompi < BigInt(kaspaToSompi('2.8')!) ? feeInSompi : BigInt(kaspaToSompi('2.7')!),
      networkId: network
    });

    // Sign and submit commit transaction
    const commitTx = transactions[0];
    commitTx.sign([privateKey]);
    
    const commitHash = await commitTx.submit(rpc);
    console.log(`Submitted commit transaction: ${commitHash}`);
    submittedTrxId = commitHash;

    // Setup timeout for commit transaction
    const commitTimeout = setTimeout(() => {
      if (!eventReceived) {
        console.error('Timeout - Commit transaction did not mature within 30 seconds');
        eventReceived = true;
      }
    }, timeout);

    // Wait until the maturity event has been received
    while (!eventReceived && !control.stopPolling) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        // Check connection periodically
        await ensureRpcConnection(rpc);
      } catch (error) {
        console.error('Error during event wait:', error);
        // If connection is lost, wait a bit longer and try to reconnect
        await new Promise(resolve => setTimeout(resolve, 2000));
        await ensureRpcConnection(rpc);
      }
    }
    clearTimeout(commitTimeout);

    // If we timed out, log a warning but continue
    if (!eventReceived) {
      console.warn('Warning: Commit transaction event not received, but continuing with reveal transaction');
    }

    // Reset event received flag for reveal transaction
    eventReceived = false;
    control.stopPolling = false;
    
    // Wait a bit for the commit transaction to fully mature
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get updated entries for reveal transaction
    console.log(`Creating revealUTXOs from P2SHAddress: ${P2SHAddress.toString()}`);
    const revealUTXOs = await rpc.getUtxosByAddresses([P2SHAddress.toString()]);
    
    if (!revealUTXOs.entries || revealUTXOs.entries.length === 0) {
      throw new Error(`No UTXOs found at P2SH address: ${P2SHAddress.toString()}`);
    }
    
    console.log(`Found ${revealUTXOs.entries.length} UTXOs at P2SH address`);

    // Second transaction: Reveal without outputs, only change address
    const revealUtxoAmount = BigInt(revealUTXOs.entries[0].entry.amount);
    console.log(`Reveal UTXO amount: ${sompiToKaspa(revealUtxoAmount)} KAS`);

    // Get fresh treasury UTXOs for the reveal transaction
    const { entries: treasuryEntries } = await rpc.getUtxosByAddresses([treasuryAddressStr]);

    const { transactions: revealTransactions } = await createTransactions({
      priorityEntries: [revealUTXOs.entries[0]],
      entries: treasuryEntries,
      outputs: [], // No outputs, only change address
      changeAddress: treasuryAddressStr,
      priorityFee: feeInSompi < BigInt(kaspaToSompi('2.8')!) ? feeInSompi : BigInt(kaspaToSompi('2.7')!),
      networkId: network
    });
  
    // Sign and submit reveal transaction
    const revealTx = revealTransactions[0];
    revealTx.sign([privateKey], false);
    
    // Add the P2SH script to the reveal transaction
    const inputIndex = revealTx.transaction.inputs.findIndex(input => input.signatureScript === '');
    if (inputIndex !== -1) {
      const signature = await revealTx.createInputSignature(inputIndex, privateKey);
      revealTx.fillInput(inputIndex, script.encodePayToScriptHashSignatureScript(signature));
    } else {
      console.error("Could not find unsigned input in reveal transaction");
    }
    
    const revealHash = await revealTx.submit(rpc);
    console.log(`Submitted reveal transaction: ${revealHash}`);
    submittedTrxId = revealHash;

    // Setup timeout for reveal transaction
    const revealTimeout = setTimeout(() => {
      if (!eventReceived) {
        console.error('Timeout - Reveal transaction did not mature within 30 seconds');
        eventReceived = true;
      }
    }, timeout);

    // Wait until the reveal event has been received
    while (!eventReceived && !control.stopPolling) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        // Check connection periodically
        await ensureRpcConnection(rpc);
      } catch (error) {
        console.error('Error during reveal event wait:', error);
        // If connection is lost, wait a bit longer and try to reconnect
        await new Promise(resolve => setTimeout(resolve, 2000));
        await ensureRpcConnection(rpc);
      }
    }
    clearTimeout(revealTimeout);

    // If we timed out, log a warning but continue
    if (!eventReceived) {
      console.warn('Warning: Reveal transaction event not received, but continuing with next transfer');
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