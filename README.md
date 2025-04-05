# KRC721 NFT Airdrop Tool

A robust Node.js tool for bulk airdropping KRC721 NFTs on the Kaspa network with optimized transaction handling and automatic reconnection capabilities.

## Overview

This tool enables secure and efficient bulk transfers of KRC721 NFTs using a two-step transaction process (commit and reveal). It features:
- Automatic RPC connection management with reconnection logic
- Optimized transaction timeouts (20 seconds)
- Efficient UTXO handling
- Detailed transaction logging
- Support for both mainnet and testnet-10 networks

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Access to a Kaspa RPC node
- Treasury wallet with NFTs to distribute
- Sufficient KAS for transaction fees (minimum 1 KAS per transfer - this is a UTXO minimum, not the fee)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following configuration:
   ```
   # Network Configuration
   NETWORK=mainnet  # or testnet-10 for test network
   
   # Treasury Configuration
   TREASURY_PRIVATE_KEY=your_private_key_here
   TREASURY_ADDRESS=your_treasury_address_here
   
   # RPC Configuration
   RPC_URL=http://localhost:16110
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Input File Format

Create a CSV or JSON file with the following structure:

#### CSV Format
```csv
walletAddress,tick,tokenId
kaspa:qrq4j6u9f4l8q2z3x5c7v9b1n3m5k7j9h1g3f5d7s9a1w3e5r7t9y1u3i5o7p9,NACHO,1
kaspa:qrq4j6u9f4l8q2z3x5c7v9b1n3m5k7j9h1g3f5d7s9a1w3e5r7t9y1u3i5o7p9,NACHO,2
```

#### JSON Format
```json
[
  {
    "walletAddress": "kaspa:qrq4j6u9f4l8q2z3x5c7v9b1n3m5k7j9h1g3f5d7s9a1w3e5r7t9y1u3i5o7p9",
    "tick": "NACHO",
    "tokenId": "1"
  }
]
```

### Running the Airdrop

```bash
npm start -- path/to/your/input/file.csv
```

The tool will:
1. Validate the input file
2. Establish RPC connection with automatic reconnection
3. Process transfers sequentially with 5-second delays between transfers
4. For each NFT transfer:
   - Create and submit commit transaction
   - Wait up to 20 seconds for commit confirmation
   - Create and submit reveal transaction
   - Wait up to 20 seconds for reveal confirmation
5. Log detailed transaction information

## Technical Details

### Transaction Process

1. **Commit Transaction**:
   - Creates P2SH (Pay-to-Script-Hash) address with NFT transfer data
   - Sends funds to P2SH address
   - Uses treasury private key for signing
   - Timeout: 20 seconds

2. **Reveal Transaction**:
   - Spends from P2SH address
   - Reveals transfer script
   - Uses treasury private key for signing
   - Timeout: 20 seconds

### KRC721 Script Structure
```
<public_key> OP_CHECKSIG OP_FALSE OP_IF "kspr" 0 <data> OP_ENDIF
```

Where `<data>` is:
```json
{
  "op": "transfer",
  "p": "krc-721",
  "tick": "TICKER",
  "tokenId": "ID",
  "to": "ADDRESS"
}
```

### Network Configuration

- **Mainnet**: Addresses must start with "kaspa:"
- **Testnet-10**: Addresses must start with "kaspatest:"

### UTXO Management

- Preferred UTXO size: ≥ 5 KAS
- Minimum UTXO size: ≥ 1 KAS
- Automatic UTXO selection and combination
- Fee handling: 0.0001 KAS per transaction

### Error Handling

- Automatic RPC reconnection
- Transaction timeout handling
- Detailed error logging
- Graceful continuation on non-critical errors

## Development

### Available Scripts

```bash
npm run dev    # Start development server with hot-reload
npm run build  # Build the project
npm start      # Start production server
npm run clean  # Clean build output
npm run lint   # Run ESLint
npm test       # Run tests
```

### Project Structure

```
katdropper/
├── src/                  # Source files
│   ├── index.ts          # Main entry point
│   ├── krc721Transfer.ts # KRC721 transfer implementation
│   └── utils/            # Utility functions
│       ├── fileProcessor.ts # Input file processing
│       └── kaspaUtils.ts    # Kaspa-specific utilities
├── examples/             # Example input files
├── dist/                 # Compiled output
├── .env                  # Environment variables
└── package.json          # Project configuration
```

## Troubleshooting

### Common Issues

1. **"No suitable UTXO found"**
   - Ensure treasury has sufficient KAS (≥ 1 KAS per transfer)
   - Check UTXO consolidation if needed

2. **"RPC connection lost"**
   - Tool will automatically attempt reconnection
   - Check RPC node availability
   - Verify network configuration

3. **"Transaction timeout"**
   - Tool will continue after 20-second timeout
   - Check network congestion
   - Verify transaction fees

4. **"Invalid address format"**
   - Ensure addresses match network (mainnet/testnet)
   - Check address validation rules

### Logging

The tool provides detailed logs:
- Transaction submission and confirmation
- UTXO selection and management
- Connection status and reconnection attempts
- Error details and recovery actions

## Best Practices

1. **Testing**
   - Always test with small batches first
   - Use testnet for initial testing
   - Verify transaction confirmations

2. **Security**
   - Keep private keys secure
   - Use environment variables for sensitive data
   - Verify addresses before processing

3. **Performance**
   - Process transfers in manageable batches
   - Monitor network conditions
   - Adjust timeouts based on network performance

4. **Monitoring**
   - Watch for transaction confirmations
   - Monitor treasury balance
   - Check for any failed transactions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

The MIT License is a permissive free software license that:
- Allows commercial use
- Allows modifications
- Allows distribution
- Allows private use
- Includes a limitation of liability
- Includes a warranty disclaimer

## Contributing

We welcome contributions from the community! Here's how you can help:

1. **Reporting Issues**
   - Check existing issues before creating a new one
   - Provide detailed reproduction steps
   - Include relevant logs and error messages
   - Specify your environment (Node.js version, network, etc.)

2. **Feature Requests**
   - Describe the feature and its benefits
   - Explain potential use cases
   - Suggest implementation approaches if possible

3. **Pull Requests**
   - Fork the repository
   - Create a feature branch (`git checkout -b feature/amazing-feature`)
   - Commit your changes (`git commit -m 'Add amazing feature'`)
   - Push to the branch (`git push origin feature/amazing-feature`)
   - Open a Pull Request

4. **Code Style**
   - Follow existing code style and patterns
   - Include tests for new features
   - Update documentation as needed
   - Keep commits focused and atomic

5. **Development Process**
   - Create issues for significant changes
   - Discuss major changes before implementation
   - Keep PRs focused and manageable
   - Respond to review comments promptly

6. **Community Guidelines**
   - Be respectful and inclusive
   - Focus on constructive feedback
   - Help others when possible
   - Follow the project's code of conduct

By contributing to this project, you agree to abide by its terms and the MIT License. 
