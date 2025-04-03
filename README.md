# Katdropper - KRC721 NFT Airdrop Tool

A Node.js tool for bulk airdropping KRC721 NFTs on the Kaspa network.

## Overview

Katdropper is a command-line tool that allows you to send KRC721 NFTs to multiple wallet addresses in bulk. It uses a two-step transaction process (commit and reveal) to ensure secure and reliable NFT transfers.

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Access to a Kaspa RPC node
- Treasury wallet with NFTs to distribute

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following configuration:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Kaspa Configuration
   NETWORK=mainnet
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

### Preparing Input Data

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
  },
  {
    "walletAddress": "kaspa:qrq4j6u9f4l8q2z3x5c7v9b1n3m5k7j9h1g3f5d7s9a1w3e5r7t9y1u3i5o7p9",
    "tick": "NACHO",
    "tokenId": "2"
  }
]
```

### Running the Airdrop

To run the airdrop, use the following command:

```bash
npm start -- path/to/your/input/file.csv
```

or

```bash
npm start -- path/to/your/input/file.json
```

The tool will:
1. Process the input file
2. For each NFT transfer:
   - Create a commit transaction
   - Wait for confirmation
   - Create and submit a reveal transaction
3. Log the results of each transfer

## How It Works

### Two-Step Transaction Process

1. **Commit Transaction**:
   - Creates a P2SH (Pay-to-Script-Hash) address with the NFT transfer data
   - Sends funds to this address
   - This transaction is signed with the treasury private key

2. **Reveal Transaction**:
   - Spends from the P2SH address
   - Reveals the script containing the NFT transfer data
   - This transaction is also signed with the treasury private key

### KRC721 Script Structure

The KRC721 transfer script follows this structure:
```
<public_key> OP_CHECKSIG OP_FALSE OP_IF "kasplex" 0 <data> OP_ENDIF
```

Where `<data>` is a JSON string:
```json
{
  "op": "transfer",
  "p": "krc-721",
  "tick": "TICKER",
  "tokenId": "ID",
  "to": "ADDRESS"
}
```

## Development

To start the development server with hot-reload:
```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server with hot-reload
- `npm run build` - Build the project
- `npm start` - Start production server
- `npm run clean` - Clean build output
- `npm run lint` - Run ESLint
- `npm test` - Run tests

## Project Structure

```
katdropper/
├── src/                  # Source files
│   ├── index.ts          # Main entry point
│   ├── krc721Transfer.ts # KRC721 transfer implementation
│   ├── krc20Transfer.ts  # KRC20 transfer implementation (reference)
│   └── utils/            # Utility functions
│       ├── fileProcessor.ts # Input file processing
│       └── kaspaUtils.ts    # Kaspa-specific utilities
├── examples/             # Example input files
├── dist/                 # Compiled output
├── .env                  # Environment variables
├── .gitignore            # Git ignore file
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
└── README.md             # Project documentation
```

## Troubleshooting

### Common Issues

1. **"No suitable UTXO found"**: Ensure your treasury wallet has sufficient KAS (at least 1 KAS per NFT transfer)
2. **"Treasury private key not found"**: Check that your `.env` file contains the correct `TREASURY_PRIVATE_KEY`
3. **"Invalid Kaspa address format"**: Ensure all wallet addresses in your input file start with "kaspa:"

### Logs

The tool provides detailed logs for each step of the process. If you encounter issues, check the console output for error messages 