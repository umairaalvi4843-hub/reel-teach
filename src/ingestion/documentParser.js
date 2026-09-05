// src/ingestion/documentParser.js — Supports PDF, TXT, DOCX, PPTX
import fs from "fs";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import AdmZip from "adm-zip";

export async function parseDocument(filePath, originalName) {
  const ext = originalName.toLowerCase().split('.').pop();
  
  try {
    switch (ext) {
      case 'pdf':
        return await parsePDF(filePath);
      case 'txt':
        return parseTXT(filePath);
      case 'docx':
        return await parseDOCX(filePath);
      case 'pptx':
        return await parsePPTX(filePath);
      default:
        throw new Error(`Unsupported file type: ${ext}. Please upload PDF, TXT, DOCX, or PPTX.`);
    }
  } catch (error) {
    console.error('Document parsing error:', error);
    throw new Error(`Failed to parse document: ${error.message}`);
  }
}

// ===== PDF =====
async function parsePDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

// ===== TXT =====
function parseTXT(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

// ===== DOCX =====
async function parseDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

// ===== PPTX — Using adm-zip (more reliable) =====
async function parsePPTX(filePath) {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    let fullText = '';
    
    for (const entry of entries) {
      // Look for slide XML files
      if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
        const content = entry.getData().toString('utf-8');
        // Extract text between <t> tags
        const textMatches = content.match(/<t[^>]*>(.*?)<\/t>/g);
        if (textMatches) {
          for (const match of textMatches) {
            const text = match.replace(/<[^>]*>/g, '').trim();
            if (text) fullText += text + ' ';
          }
          fullText += '\n\n';
        }
      }
    }
    
    // If no text found, try a simpler approach
    if (!fullText.trim()) {
      for (const entry of entries) {
        if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
          const content = entry.getData().toString('utf-8');
          // Remove all XML tags and get plain text
          const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (plainText) {
            fullText += plainText + '\n\n';
          }
        }
      }
    }
    
    return fullText || 'No text content found in PPTX file.';
  } catch (error) {
    console.error('PPTX parsing error:', error);
    throw new Error(`Failed to parse PPTX: ${error.message}`);
  }
}