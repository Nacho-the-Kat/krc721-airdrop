import fs from 'fs';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';

interface NFTTransferData {
  walletAddress: string;
  tick: string;
  id: string;
}

export function processInputFile(filePath: string): NFTTransferData[] {
  const fileExtension = path.extname(filePath).toLowerCase();
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  if (fileExtension === '.json') {
    return processJsonFile(fileContent);
  } else if (fileExtension === '.csv') {
    return processCsvFile(fileContent);
  } else {
    throw new Error('Unsupported file format. Please provide a CSV or JSON file.');
  }
}

function processJsonFile(content: string): NFTTransferData[] {
  try {
    const data = JSON.parse(content);
    validateTransferData(data);
    return normalizeTransferData(data);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Error processing JSON file: ${error.message}`);
    }
    throw new Error('Unknown error processing JSON file');
  }
}

function processCsvFile(content: string): NFTTransferData[] {
  try {
    const records = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    validateTransferData(records);
    return normalizeTransferData(records);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Error processing CSV file: ${error.message}`);
    }
    throw new Error('Unknown error processing CSV file');
  }
}

function validateTransferData(data: any[]): asserts data is any[] {
  if (!Array.isArray(data)) {
    throw new Error('Input data must be an array');
  }

  for (const [index, item] of data.entries()) {
    // Check for required fields (either id or tokenId must be present)
    if (!item.walletAddress || !item.tick || (!item.id && !item.tokenId)) {
      throw new Error(
        `Invalid data format at index ${index}. Each entry must have walletAddress, tick, and either id or tokenId field`
      );
    }

    // Validate wallet address format (basic check)
    if (!item.walletAddress.startsWith('kaspa:')) {
      throw new Error(
        `Invalid Kaspa address format at index ${index}: ${item.walletAddress}`
      );
    }

    // Validate tick format (basic check)
    if (typeof item.tick !== 'string' || item.tick.length === 0) {
      throw new Error(
        `Invalid tick format at index ${index}: ${item.tick}`
      );
    }

    // Validate ID format (should be a string or number)
    const idValue = item.id || item.tokenId;
    if (typeof idValue !== 'string' && typeof idValue !== 'number') {
      throw new Error(
        `Invalid ID format at index ${index}: ${idValue}`
      );
    }
  }
}

// Normalize the data to ensure consistent property names
function normalizeTransferData(data: any[]): NFTTransferData[] {
  return data.map(item => ({
    walletAddress: item.walletAddress,
    tick: item.tick,
    id: item.id || item.tokenId // Use id if present, otherwise use tokenId
  }));
} 