import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import officeParser from 'officeparser';

/**
 * Clean text: Collapses whitespace while preserving structural intent.
 */
const cleanText = (text: string): string => {
  return text
    .replace(/[^\S\r\n]+/g, ' ') // Collapses horizontal spaces but keeps newlines
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Strips non-printable control characters
    .replace(/\n\s*\n/g, '\n\n') // Normalizes paragraph breaks
    .trim();
};

/**
 * Universal Parser with Page-Aware Extraction
 */
export const parseDocument = async (
  buffer: Buffer,
  fileExt: string
): Promise<{ pageNumber: number; text: string }[]> => {
  const ext = fileExt.toLowerCase().replace('.', '');

  try {
    // --- 1. PDF: COORDINATE-BASED EXTRACTION ---
    if (ext === 'pdf') {
      const pages: string[] = [];
      const options = {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          let lastY = -1;
          let text = "";

          for (const item of textContent.items) {
            // OPTIMIZATION: Check Y-coordinates to detect natural line breaks
            if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 2) {
              text += "\n";
            }
            text += item.str;
            lastY = item.transform[5];
          }
          pages.push(text);
          return text;
        },
      };

      await pdf(buffer, options);
      
      return pages
        .map((text, i) => ({
          pageNumber: i + 1,
          text: cleanText(text),
        }))
        .filter(p => p.text.length > 5); // Drops blank/artifact pages
    }

    // --- 2. DOCX: STYLE PRESERVATION ---
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      return [{ pageNumber: 1, text: cleanText(result.value) }];
    }

    // --- 3. PPTX: SLIDE SEPARATION ---
    if (ext === 'pptx' || ext === 'ppt') {
      const data: string = await new Promise((resolve, reject) => {
        officeParser.parseOffice(buffer, (data: any, err: any) => {
          if (err) reject(err);
          resolve(data);
        });
      });

      // Most PPTX parsers separate slides with multiple newlines
      const slides = data.split(/\n\n+/); 
      
      return slides.map((slide, i) => ({
        pageNumber: i + 1, // This maps to Slide Number
        text: cleanText(slide)
      })).filter(p => p.text.length > 5);
    }

    throw new Error(`Unsupported type: ${ext}`);
  } catch (error: any) {
    console.error(`[Parser Error]: ${error.message}`);
    throw error;
  }
};