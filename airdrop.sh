#!/bin/bash

# Check if an input file was provided
if [ -z "$1" ]; then
  echo "Error: Please provide an input file path (CSV or JSON)"
  echo "Usage: ./airdrop.sh path/to/your/input/file.csv"
  exit 1
fi

# Check if the file exists
if [ ! -f "$1" ]; then
  echo "Error: File not found: $1"
  exit 1
fi

# Check if the file extension is valid
file_extension=$(echo "$1" | grep -o '\.[^.]*$' | tr '[:upper:]' '[:lower:]')
if [ "$file_extension" != ".csv" ] && [ "$file_extension" != ".json" ]; then
  echo "Error: Invalid file format. Please provide a CSV or JSON file."
  exit 1
fi

# Run the airdrop
echo "Starting NFT airdrop with input file: $1"
npm start -- "$1" 