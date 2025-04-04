import { config } from 'dotenv';
import { RpcClient, Resolver, Encoding } from '../wasm/kaspa';
import { processInputFile } from './utils/fileProcessor';
import { processNFTTransfers } from './krc721Transfer';

// Load environment variables
config();

async function main() {
    try {
        console.log('NFT Airdrop Server starting...');
        
        // Get network from environment variables
        const network = process.env.NETWORK || 'mainnet';
        console.log(`Using network: ${network}`);
        
        // Initialize RPC client with improved configuration
        console.log('Starting RPC connection...');
        const rpcClient = new RpcClient({
            resolver: new Resolver(),
            encoding: Encoding.Borsh,
            networkId: network
        });
        
        // Set a timeout for the initial connection
        const connectionTimeout = setTimeout(() => {
            console.error('Timeout - Failed to establish RPC connection within 30 seconds');
            process.exit(1);
        }, 30000);

        try {
            // Disconnect and reconnect to ensure a clean connection
            await rpcClient.disconnect();
            await rpcClient.connect();
            clearTimeout(connectionTimeout);
            console.log('RPC connection established');
        } catch (error) {
            clearTimeout(connectionTimeout);
            console.error('Failed to establish RPC connection:', error);
            process.exit(1);
        }
        
        // Process input file
        const inputFilePath = process.argv[2];
        if (!inputFilePath) {
            throw new Error('Please provide an input file path (CSV or JSON)');
        }

        console.log(`Processing input file: ${inputFilePath}`);
        const transferList = processInputFile(inputFilePath);
        
        console.log(`Found ${transferList.length} NFTs to transfer`);
        
        // Process transfers
        await processNFTTransfers(rpcClient, transferList);
        
        console.log('NFT airdrop completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during NFT airdrop:', error);
        process.exit(1);
    }
}

main(); 