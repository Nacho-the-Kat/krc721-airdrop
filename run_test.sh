#!/bin/bash

# Check if the test CSV file exists
if [ ! -f "examples/test_nft_transfers.csv" ]; then
  echo "Error: Test CSV file not found at examples/test_nft_transfers.csv"
  exit 1
fi

# Run the airdrop with the test CSV file
echo "Starting NFT airdrop test with examples/test_nft_transfers.csv"
npm start -- examples/test_nft_transfers.csv 