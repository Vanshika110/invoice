const express = require('express');
const cors = require('cors');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const path = require('path');
const fs = require('fs');

const resolveAssetPath = (candidates) => {
  for (const candidate of candidates) {
    const absolute = path.join(__dirname, 'images', candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return null;
};

const LOGO_PATH = resolveAssetPath(['logo.png', 'logo.jpg', 'logo.jpeg']);
const STAMP_PATH = resolveAssetPath(['stamp.png', 'stamp.jpg', 'stamp.jpeg']);

// A4 dimensions in points (72 DPI)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 24; // Standard margin matching original
const BORDER_WIDTH = 0.4; // Hairline borders (0.4px)
const META_TABLE_WIDTH = 230;
const META_GAP = 10; // Original gap

const getContentWidth = () => A4_WIDTH - MARGIN * 2;

const getLayoutDimensions = () => {
  const contentWidth = getContentWidth();
  const leftWidth = contentWidth - META_TABLE_WIDTH - META_GAP;
  const leftX = MARGIN;

  return {
    contentWidth,
    leftX,
    leftWidth,
    rightWidth: META_TABLE_WIDTH,
    rightX: leftX + leftWidth + META_GAP,
    gap: META_GAP,
  };
};

// Helper function to wrap text
const wrapText = (text, maxWidth, font, fontSize) => {
  // First split by newlines to handle existing line breaks
  const paragraphs = text.split('\n');
  const allLines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      // Skip empty lines and handle word wrapping
      if (testLine.trim()) {
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    // Add all lines from this paragraph
    allLines.push(...lines);
  }

  return allLines.length > 0 ? allLines : [''];
};

// Helper function to get text width
const getTextWidth = (text, font, fontSize) => font.widthOfTextAtSize(text, fontSize);

// Helper function to center text
const centerTextX = (text, x, width, font, fontSize) => {
  const textWidth = getTextWidth(text, font, fontSize);
  return x + (width - textWidth) / 2;
};

const app = express();

app.use(cors());
app.use(express.json());

const createInvoiceData = () => ({
  company: {
    name: 'Delovita Services Pvt. Ltd.',
    brand: 'HeyEV!',
    address: '2/52 Viklap Khand, Near Rail Vihar, Chauraha, Gomti Nagar, Lucknow',
    state: 'Uttar Pradesh',
    stateCode: '09',
    gstin: '09AAJCD9447L2W',
    contact: '+91 8368395140',
  },
  invoice: {
    number: '25-26/UP-1596',
    issueDate: '08 Nov 2025',
    dueDate: '08 Nov 2025',
    terms: '100% Payment',
    reference: 'HEV-UP-190 dt. 08-Nov-25',
    otherReference: '',
    paymentMode: 'Cash',
    consignee: {
      name: 'Ranjeet',
      contact: '7897931119',
      state: 'Uttar Pradesh',
      stateCode: '09',
      addressLine: 'Lucknow, Uttar Pradesh',
    },
    buyer: {
      name: 'Ranjeet',
      contact: '7897931119',
      state: 'Uttar Pradesh',
      stateCode: '09',
      addressLine: 'Lucknow, Uttar Pradesh',
    },
    hsn: '997319',
    items: [
      {
        description: 'Monthly Payment',
        quantity: 1,
        rate: 3033.89,
        unit: 'Nos.',
      },
    ],
    taxRates: {
      cgst: 0.09,
      sgst: 0.09,
    },
    roundOff: 0.01,
    amountInWords: 'INR Three Thousand Five Hundred Eighty Only',
    taxAmountInWords: 'INR Five Hundred Forty Six and Ten paise Only',
    remarks: 'Monthly Payment 3580, 18 Months\nPayment no. 3',
    declaration:
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  },
  bank: {
    name: 'HDFC Bank',
    accountNumber: '50200076730302',
    ifsc: 'HDFC0001098',
    branch: 'Badshahpur',
  },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/invoice', async (_req, res, next) => {
  try {
    const data = createInvoiceData();
    const pdfDoc = await PDFDocument.create();
    
    // Add a single page
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Embed images if available
    let logoImage = null;
    let stampImage = null;
    
    if (LOGO_PATH) {
      try {
        const imageBytes = fs.readFileSync(LOGO_PATH);
        if (LOGO_PATH.endsWith('.png')) {
          logoImage = await pdfDoc.embedPng(imageBytes);
        } else {
          logoImage = await pdfDoc.embedJpg(imageBytes);
        }
      } catch (err) {
        console.warn('Could not embed logo:', err.message);
      }
    }
    
    if (STAMP_PATH) {
      try {
        const imageBytes = fs.readFileSync(STAMP_PATH);
        if (STAMP_PATH.endsWith('.png')) {
          stampImage = await pdfDoc.embedPng(imageBytes);
        } else {
          stampImage = await pdfDoc.embedJpg(imageBytes);
        }
      } catch (err) {
        console.warn('Could not embed stamp:', err.message);
      }
    }
    
    const fonts = { normal: helveticaFont, bold: helveticaBoldFont };
    const images = { logo: logoImage, stamp: stampImage };
    
    await generateInvoicePDF(page, pdfDoc, data, fonts, images);
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="invoice.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Invoice service ready on port ${PORT}`);
});

async function generateInvoicePDF(page, pdfDoc, data, fonts, images) {
  const { company, invoice, bank } = data;
  const totals = computeTotals(invoice);

  drawOuterBorder(page);
  drawTitle(page, fonts);

  // Header sections should start with proper padding from top border
  const headerTop = MARGIN + 8;
  const companyBottom = drawCompanyHeader(page, company, headerTop, fonts, images.logo);
  const invoiceMetaBottom = drawInvoiceMetaTable(page, invoice, headerTop, fonts);
  const headerBottom = Math.max(companyBottom, invoiceMetaBottom);

  // Exact spacing between sections matching original
  const partiesBottom = drawPartyBlocks(page, invoice, headerBottom + 10, fonts);
  const itemsBottom = drawItemsSection(page, invoice, totals, partiesBottom + 6, fonts);
  const amountBottom = drawAmountSummaries(page, invoice, itemsBottom + 6, fonts);
  const taxBottom = drawTaxBreakup(page, invoice, totals, amountBottom + 8, fonts);
  const footerInfo = drawBankAndRemarks(page, invoice, bank, taxBottom + 10, fonts);
  drawStampAndFooter(page, footerInfo, fonts, images.stamp);
}

function drawOuterBorder(page) {
  page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: A4_WIDTH - MARGIN * 2,
    height: A4_HEIGHT - MARGIN * 2,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH,
  });
}

function drawTitle(page, fonts) {
  // Title should sit just above the top border
  const titleText = 'Tax Invoice';
  const titleY = A4_HEIGHT - (MARGIN - 8);
  const titleX = centerTextX(titleText, 0, A4_WIDTH, fonts.bold, 14);
  page.drawText('Tax Invoice', {
    x: titleX,
    y: titleY,
    size: 14,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  // "(ORIGINAL FOR RECIPIENT)" aligned to the top-right outside the border
  const subtitleText = '(ORIGINAL FOR RECIPIENT)';
  const subtitleWidth = getTextWidth(subtitleText, fonts.normal, 9);
  const subtitleX = A4_WIDTH - MARGIN - subtitleWidth;
  page.drawText(subtitleText, {
    x: subtitleX,
    y: titleY,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });
}

function drawCompanyHeader(page, company, top, fonts, logoImage) {
  const { leftX, leftWidth } = getLayoutDimensions();
  let textX = leftX + 8;
  let logoBottom = top;

  if (logoImage) {
    // Logo exact positioning - ensure it stays inside top border
    const logoWidth = 88;
    const logoDims = logoImage.scale(logoWidth / logoImage.width);
    // Position logo with same padding as text (6px from top)
    const logoTop = top + 6;
    page.drawImage(logoImage, {
      x: textX,
      y: A4_HEIGHT - logoTop - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    logoBottom = logoTop + logoDims.height + 4;
    textX += logoWidth + 8; // Exact spacing after logo
  }

  const textWidth = leftWidth - (textX - leftX) - 8;
  const safeTextWidth = Math.min(textWidth, 205);
  const lineSpacing = 12;
  const paragraphSpacing = 2;
  // Add padding from top to ensure text stays inside border
  let currentY = top + 6;

  // Company name - bold, exact positioning
  page.drawText(company.name, {
    x: textX,
    y: A4_HEIGHT - currentY,
    size: 11,
    font: fonts.bold,
    color: rgb(0, 0, 0),
    maxWidth: safeTextWidth,
  });

  currentY += 14; // Exact line spacing

  const lines = [
    company.address,
    `State: ${company.state}, Code : ${company.stateCode}`,
    `GSTIN/UIN : ${company.gstin}`,
    `Contact : ${company.contact}`,
  ];

  lines.forEach((line) => {
    const wrappedLines = wrapText(line, safeTextWidth, fonts.normal, 9);
    wrappedLines.forEach((wrappedLine) => {
      page.drawText(wrappedLine, {
        x: textX,
        y: A4_HEIGHT - currentY,
        size: 9,
        font: fonts.normal,
        color: rgb(0, 0, 0),
        maxWidth: safeTextWidth,
      });
      currentY += lineSpacing; // Slightly larger spacing to prevent overlap
    });
    currentY += paragraphSpacing;
  });

  return Math.max(currentY, logoBottom);
}

function drawInvoiceMetaTable(page, invoice, top, fonts) {
  const { rightX, rightWidth } = getLayoutDimensions();
  const tableWidth = rightWidth;
  const x = rightX;
  const y = top;
  const rowHeight = 24;
  const rows = [
    ['Invoice No.', invoice.number],
    ['Dated', invoice.issueDate],
    ['Mode/Terms of Payment', invoice.paymentMode],
    ["Supplier's Ref.", invoice.reference],
    ['Other Reference', invoice.otherReference || '-'],
    ['Terms of Delivery', invoice.terms],
  ];

  const tableHeight = rows.length * rowHeight;
  const tableTopY = A4_HEIGHT - (y + tableHeight);
  const tableBottomY = A4_HEIGHT - y;

  // Draw single outer frame
  page.drawRectangle({
    x: x,
    y: tableTopY,
    width: tableWidth,
    height: tableHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH,
  });

  rows.forEach((row, index) => {
    const rowY = y + index * rowHeight;
    
    // Draw horizontal line between rows (not for first row to avoid double line at top)
    if (index > 0) {
      page.drawLine({
        start: { x: x, y: A4_HEIGHT - rowY },
        end: { x: x + tableWidth, y: A4_HEIGHT - rowY },
        thickness: BORDER_WIDTH,
        color: rgb(0, 0, 0),
      });
    }

    // Vertical separator - exact position
    const separatorX = x + tableWidth * 0.45;
    page.drawLine({
      start: { x: separatorX, y: A4_HEIGHT - rowY },
      end: { x: separatorX, y: A4_HEIGHT - (rowY + rowHeight) },
      thickness: BORDER_WIDTH,
      color: rgb(0, 0, 0),
    });

    // Draw label - bold, with proper padding from top
    page.drawText(row[0], {
      x: x + 6,
      y: A4_HEIGHT - (rowY + 8),
      size: 9,
      font: fonts.bold,
      color: rgb(0, 0, 0),
      maxWidth: tableWidth * 0.45 - 10,
    });

    // Draw value - normal, with proper padding from top
    page.drawText(row[1], {
      x: separatorX + 6,
      y: A4_HEIGHT - (rowY + 8),
      size: 9,
      font: fonts.normal,
      color: rgb(0, 0, 0),
      maxWidth: tableWidth * 0.55 - 10,
    });
  });

  return y + rows.length * rowHeight;
}

function drawPartyBlocks(page, invoice, top, fonts) {
  // Use a single outer frame that contains both rows (Consignee/Terms row and Buyer row)
  const rowHeight = 82; // per-row height
  const rows = 2;
  const contentWidth = getContentWidth();
  const leftX = MARGIN;
  const totalHeight = rowHeight * rows;
  const termsWidth = META_TABLE_WIDTH;
  const consigneeWidth = contentWidth - termsWidth;
  const termsX = leftX + consigneeWidth;

  // Draw single outer frame covering both rows to avoid double borders
  page.drawRectangle({
    x: leftX,
    y: A4_HEIGHT - (top + totalHeight),
    width: contentWidth,
    height: totalHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH,
  });

  // Vertical divider for Terms column spanning both rows (draw once)
  page.drawLine({
    start: { x: termsX, y: A4_HEIGHT - top },
    end: { x: termsX, y: A4_HEIGHT - (top + totalHeight) },
    thickness: BORDER_WIDTH,
    color: rgb(0, 0, 0),
  });

  // Horizontal divider only between Consignee and Buyer (not through Terms section)
  page.drawLine({
    start: { x: leftX, y: A4_HEIGHT - (top + rowHeight) },
    end: { x: termsX, y: A4_HEIGHT - (top + rowHeight) },
    thickness: BORDER_WIDTH,
    color: rgb(0, 0, 0),
  });

  // Draw content into the boxes but do NOT draw inner borders for buyer/consignee to avoid double lines
  drawPartyBox(page, 'Consignee', invoice.consignee, leftX, top, consigneeWidth, rowHeight, fonts, {
    drawBorder: false,
  });

  drawTermsBox(page, invoice.terms, termsX, top, termsWidth, rowHeight, fonts, {
    drawBorder: false,
  });

  const buyerTop = top + rowHeight;
  drawPartyBox(page, 'Buyer', invoice.buyer, leftX, buyerTop, contentWidth, rowHeight, fonts, {
    drawBorder: false,
  });

  return buyerTop + rowHeight;
}

function drawPartyBox(page, label, party, x, y, width, height, fonts, options = {}) {
  const { drawBorder = true } = options;

  if (drawBorder) {
    page.drawRectangle({
      x: x,
      y: A4_HEIGHT - (y + height),
      width: width,
      height: height,
      borderColor: rgb(0, 0, 0),
      borderWidth: BORDER_WIDTH,
    });
  }

  // Label - bold with proper padding from top
  page.drawText(label, {
    x: x + 8,
    y: A4_HEIGHT - (y + 10),
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  // Party details - normal font with proper spacing
  page.drawText(`${party.name} (${party.contact})`, {
    x: x + 8,
    y: A4_HEIGHT - (y + 26),
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  page.drawText(`State Name : ${party.state}, Code : ${party.stateCode}`, {
    x: x + 8,
    y: A4_HEIGHT - (y + 40),
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });
}

function drawTermsBox(page, terms, x, y, width, height, fonts, options = {}) {
  const { drawBorder = true } = options;

  if (drawBorder) {
    page.drawRectangle({
      x: x,
      y: A4_HEIGHT - (y + height),
      width: width,
      height: height,
      borderColor: rgb(0, 0, 0),
      borderWidth: BORDER_WIDTH,
    });
  }

  // Label - bold with proper padding from top
  page.drawText('Terms of Delivery', {
    x: x + 8,
    y: A4_HEIGHT - (y + 10),
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  // Terms - with proper spacing
  page.drawText(terms, {
    x: x + 8,
    y: A4_HEIGHT - (y + 26),
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });
}

function drawItemsSection(page, invoice, totals, startY, fonts) {
  const x = MARGIN;
  const width = getContentWidth();
  const headerTop = startY;
  // Exact column widths matching original
  const columnWidths = [30, 225, 55, 45, 65, 22, 85];
  const columnX = columnWidths.reduce((positions, _colWidth, idx) => {
    const prev = idx === 0 ? x : positions[idx - 1] + columnWidths[idx - 1];
    positions.push(prev);
    return positions;
  }, []);
  const headerHeight = 26; // Slightly taller header to avoid overlap
  // Calculate detail area first (so we can draw a single outer frame)
  const headers = ['Sl No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount'];
  headers.forEach((header, idx) => {
    const headerX = columnX[idx] + (columnWidths[idx] - getTextWidth(header, fonts.bold, 9)) / 2;
    page.drawText(header, {
      x: headerX,
      y: A4_HEIGHT - (headerTop + 10),
      size: 9,
      font: fonts.bold,
      color: rgb(0, 0, 0),
    });
  });

  // Build detail area with wrapped description support
  const item = invoice.items[0] || { description: '', quantity: 0, rate: 0, unit: '' };
  const descMaxWidth = columnWidths[1] - 8;
  const descWrapped = wrapText(item.description, descMaxWidth, fonts.bold, 10);
  const lineHeight = 15; // Increased to avoid overlap
  const smallLines = [
    { label: 'Output Cgst UP', amount: totals.cgstAmount },
    { label: 'Output Sgst UP', amount: totals.sgstAmount },
    { label: 'Round Off', amount: totals.roundOff },
  ];

  // Calculate detail area height: some space for primary row + description lines + small lines
  const primaryBlockHeight = lineHeight + 8; // sl no, hsn, qty, rate, unit
  const descBlockHeight = descWrapped.length * lineHeight;
  const smallBlockHeight = smallLines.length * lineHeight + 8;
  const detailRowHeight = primaryBlockHeight + descBlockHeight + smallBlockHeight + 12;
  const detailTop = headerTop + headerHeight;

  // total row
  const totalRowHeight = 20;
  const totalRowTop = detailTop + detailRowHeight;

  // Draw single outer frame for the whole items table (header + details + total)
  const tableHeight = headerHeight + detailRowHeight + totalRowHeight;
  page.drawRectangle({
    x: x,
    y: A4_HEIGHT - (headerTop + tableHeight),
    width: width,
    height: tableHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH,
  });

  // Draw vertical column separators once across whole table height
  for (let i = 1; i < columnWidths.length; i += 1) {
    page.drawLine({
      start: { x: columnX[i], y: A4_HEIGHT - headerTop },
      end: { x: columnX[i], y: A4_HEIGHT - (headerTop + tableHeight) },
      thickness: BORDER_WIDTH,
      color: rgb(0, 0, 0),
    });
  }

  // Draw horizontal separators: after header, after detail
  page.drawLine({ start: { x: x, y: A4_HEIGHT - (headerTop + headerHeight) }, end: { x: x + width, y: A4_HEIGHT - (headerTop + headerHeight) }, thickness: BORDER_WIDTH, color: rgb(0,0,0) });
  page.drawLine({ start: { x: x, y: A4_HEIGHT - (detailTop + detailRowHeight) }, end: { x: x + width, y: A4_HEIGHT - (detailTop + detailRowHeight) }, thickness: BORDER_WIDTH, color: rgb(0,0,0) });

  // Primary row content
  const primaryY = detailTop + 8;
  const slNoX = columnX[0] + (columnWidths[0] - getTextWidth('1', fonts.normal, 9)) / 2;
  page.drawText('1', { x: slNoX, y: A4_HEIGHT - primaryY, size: 9, font: fonts.normal, color: rgb(0, 0, 0) });

  page.drawText(item.hsn || invoice.hsn || '', { x: columnX[2] + 4, y: A4_HEIGHT - primaryY, size: 9, font: fonts.normal, color: rgb(0, 0, 0), maxWidth: columnWidths[2] - 8 });

  page.drawText(item.quantity?.toString() || '', { x: columnX[3] + 4, y: A4_HEIGHT - primaryY, size: 9, font: fonts.normal, color: rgb(0, 0, 0), maxWidth: columnWidths[3] - 8 });

  const rateText = formatCurrency(item.rate || 0);
  const rateX = columnX[4] + columnWidths[4] - 4 - getTextWidth(rateText, fonts.normal, 9);
  page.drawText(rateText, { x: rateX, y: A4_HEIGHT - primaryY, size: 9, font: fonts.normal, color: rgb(0, 0, 0) });

  page.drawText(item.unit || '', { x: columnX[5] + 4, y: A4_HEIGHT - primaryY, size: 9, font: fonts.normal, color: rgb(0, 0, 0), maxWidth: columnWidths[5] - 8 });

  // Draw wrapped description just below primary line
  const descStartY = primaryY + lineHeight;
  descWrapped.forEach((line, idx) => {
    page.drawText(line, { x: columnX[1] + 4, y: A4_HEIGHT - (descStartY + idx * lineHeight), size: 10, font: fonts.bold, color: rgb(0, 0, 0), maxWidth: descMaxWidth });
  });

  // Small tax/round-off lines below description
  const afterDescY = descStartY + descWrapped.length * lineHeight + 6;
  smallLines.forEach((line, idx) => {
    const lineY = afterDescY + idx * lineHeight;
    page.drawText(line.label, { x: columnX[1] + 4, y: A4_HEIGHT - lineY, size: 9, font: fonts.normal, color: rgb(0, 0, 0), maxWidth: columnWidths[1] - 8 });
    const amountText = formatCurrency(line.amount);
    const amountX = columnX[6] + columnWidths[6] - 4 - getTextWidth(amountText, fonts.normal, 9);
    page.drawText(amountText, { x: amountX, y: A4_HEIGHT - lineY, size: 9, font: fonts.normal, color: rgb(0, 0, 0) });
  });

  // total row already accounted for in tableHeight

  // Total label - bold with proper padding
  page.drawText('Total', {
    x: columnX[1] + 6,
    y: A4_HEIGHT - (totalRowTop + 8),
    size: 9,
    font: fonts.bold,
    color: rgb(0, 0, 0),
    maxWidth: columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] - 8,
  });

  // Grand total - bold, right aligned with proper padding
  const grandTotalText = formatCurrency(totals.grandTotal);
  const grandTotalX = columnX[6] + columnWidths[6] - 6 - getTextWidth(grandTotalText, fonts.bold, 10);
  page.drawText(grandTotalText, {
    x: grandTotalX,
    y: A4_HEIGHT - (totalRowTop + 8),
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  // E. & O.E - right aligned, small
  const eoeText = 'E. & O.E';
  const eoeX = columnX[6] + columnWidths[6] - 6 - getTextWidth(eoeText, fonts.normal, 8);
  page.drawText(eoeText, {
    x: eoeX,
    y: A4_HEIGHT - (totalRowTop + 16),
    size: 8,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  return totalRowTop + totalRowHeight;
}

function drawAmountSummaries(page, invoice, startY, fonts) {
  const x = MARGIN;
  const width = getContentWidth();

  // Label - bold, exact positioning nearer to items table
  page.drawText('Amount Chargeable (in words):', {
    x: x,
    y: A4_HEIGHT - startY,
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  // Amount in words - exact spacing
  const wordsLines = wrapText(invoice.amountInWords, width - 210, fonts.normal, 9);
  wordsLines.forEach((line, idx) => {
    page.drawText(line, {
      x: x + 200,
      y: A4_HEIGHT - (startY + idx * 11),
      size: 9,
      font: fonts.normal,
      color: rgb(0, 0, 0),
      maxWidth: width - 210,
    });
  });

  // Exact spacing matching original
  return startY + Math.max(14, wordsLines.length * 11);
}

function drawTaxBreakup(page, invoice, totals, startY, fonts) {
  const x = MARGIN;
  const tableTop = startY;
  const columnWidths = [70, 110, 70, 70, 70, 70, 75];
  const tableWidth = columnWidths.reduce((sum, value) => sum + value, 0);
  const columnX = columnWidths.reduce((positions, _colWidth, idx) => {
    const prev = idx === 0 ? x : positions[idx - 1] + columnWidths[idx - 1];
    positions.push(prev);
    return positions;
  }, []);

  const rowHeight = 24; // Exact row height matching original

  // Draw single outer frame for entire tax table (header + data + total)
  const rowsCount = 3; // header, data, total
  const tableHeight = rowHeight * rowsCount;
  page.drawRectangle({ x: x, y: A4_HEIGHT - (tableTop + tableHeight), width: tableWidth, height: tableHeight, borderColor: rgb(0,0,0), borderWidth: BORDER_WIDTH });

  // Draw vertical separators across whole table
  for (let i = 1; i < columnWidths.length; i += 1) {
    page.drawLine({ start: { x: columnX[i], y: A4_HEIGHT - tableTop }, end: { x: columnX[i], y: A4_HEIGHT - (tableTop + tableHeight) }, thickness: BORDER_WIDTH, color: rgb(0,0,0) });
  }

  // Draw horizontal separators between rows
  page.drawLine({ start: { x: x, y: A4_HEIGHT - (tableTop + rowHeight) }, end: { x: x + tableWidth, y: A4_HEIGHT - (tableTop + rowHeight) }, thickness: BORDER_WIDTH, color: rgb(0,0,0) });
  page.drawLine({ start: { x: x, y: A4_HEIGHT - (tableTop + rowHeight * 2) }, end: { x: x + tableWidth, y: A4_HEIGHT - (tableTop + rowHeight * 2) }, thickness: BORDER_WIDTH, color: rgb(0,0,0) });

  const headers = [
    'HSN/SAC',
    'Taxable Value',
    'CGST Rate',
    'CGST Amount',
    'SGST/UTGST Rate',
    'SGST/UTGST Amount',
    'Total Tax Amount',
  ];

  // Headers - place inside header row with proper padding
  headers.forEach((header, idx) => {
    page.drawText(header, { x: columnX[idx] + 6, y: A4_HEIGHT - (tableTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0), maxWidth: columnWidths[idx] - 12 });
  });

  // Data row positions with proper padding
  const dataRowTop = tableTop + rowHeight;
  page.drawText(invoice.hsn, { x: columnX[0] + 6, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0), maxWidth: columnWidths[0] - 12 });

  const taxableValueText = formatCurrency(totals.baseAmount);
  const taxableX = columnX[1] + columnWidths[1] - 6 - getTextWidth(taxableValueText, fonts.normal, 9);
  page.drawText(taxableValueText, { x: taxableX, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0) });

  page.drawText(`${(invoice.taxRates.cgst * 100).toFixed(0)}%`, { x: columnX[2] + 6, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0), maxWidth: columnWidths[2] - 12 });

  const cgstText = formatCurrency(totals.cgstAmount);
  const cgstX = columnX[3] + columnWidths[3] - 6 - getTextWidth(cgstText, fonts.normal, 9);
  page.drawText(cgstText, { x: cgstX, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0) });

  page.drawText(`${(invoice.taxRates.sgst * 100).toFixed(0)}%`, { x: columnX[4] + 6, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0), maxWidth: columnWidths[4] - 12 });

  const sgstText = formatCurrency(totals.sgstAmount);
  const sgstX = columnX[5] + columnWidths[5] - 6 - getTextWidth(sgstText, fonts.normal, 9);
  page.drawText(sgstText, { x: sgstX, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0) });

  const totalTaxText = formatCurrency(totals.taxTotal);
  const totalTaxX = columnX[6] + columnWidths[6] - 6 - getTextWidth(totalTaxText, fonts.normal, 9);
  page.drawText(totalTaxText, { x: totalTaxX, y: A4_HEIGHT - (dataRowTop + 10), size: 9, font: fonts.normal, color: rgb(0,0,0) });

  // Total row with proper padding
  const totalRowTop = dataRowTop + rowHeight;
  page.drawText('Total', { x: columnX[0] + 6, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0), maxWidth: columnWidths[0] - 12 });

  const totalBaseX = columnX[1] + columnWidths[1] - 6 - getTextWidth(taxableValueText, fonts.bold, 9);
  page.drawText(taxableValueText, { x: totalBaseX, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0) });

  page.drawText(`${(invoice.taxRates.cgst * 100).toFixed(0)}%`, { x: columnX[2] + 6, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0), maxWidth: columnWidths[2] - 12 });

  const totalCgstX = columnX[3] + columnWidths[3] - 6 - getTextWidth(cgstText, fonts.bold, 9);
  page.drawText(cgstText, { x: totalCgstX, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0) });

  page.drawText(`${(invoice.taxRates.sgst * 100).toFixed(0)}%`, { x: columnX[4] + 6, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0), maxWidth: columnWidths[4] - 12 });

  const totalSgstX = columnX[5] + columnWidths[5] - 6 - getTextWidth(sgstText, fonts.bold, 9);
  page.drawText(sgstText, { x: totalSgstX, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0) });

  const totalTaxTotalX = columnX[6] + columnWidths[6] - 6 - getTextWidth(totalTaxText, fonts.bold, 9);
  page.drawText(totalTaxText, { x: totalTaxTotalX, y: A4_HEIGHT - (totalRowTop + 10), size: 9, font: fonts.bold, color: rgb(0,0,0) });

  // Tax Amount in words - exact spacing from above table
  const taxWordsY = totalRowTop + rowHeight + 12;
  page.drawText('Tax Amount (in words):', {
    x: x,
    y: A4_HEIGHT - taxWordsY,
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  const taxWordsLines = wrapText(invoice.taxAmountInWords, getContentWidth() - 170, fonts.normal, 9);
  taxWordsLines.forEach((line, idx) => {
    page.drawText(line, {
      x: x + 170,
      y: A4_HEIGHT - (taxWordsY + idx * 11),
      size: 9,
      font: fonts.normal,
      color: rgb(0, 0, 0),
      maxWidth: getContentWidth() - 170,
    });
  });

  return taxWordsY + Math.max(16, taxWordsLines.length * 11);
}

function drawBankAndRemarks(page, invoice, bank, startY, fonts) {
  const x = MARGIN;
  const width = getContentWidth();
  const textAreaWidth = width / 2 - 10;
  const bankBoxWidth = width / 2 - 10;
  const bankX = x + textAreaWidth + 20;

  let currentY = startY;

  page.drawText('Remarks:', {
    x,
    y: A4_HEIGHT - currentY,
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  currentY += 14;

  const remarksLines = wrapText(invoice.remarks, textAreaWidth, fonts.normal, 9);
  remarksLines.forEach((line, idx) => {
    page.drawText(line, {
      x,
      y: A4_HEIGHT - (currentY + idx * 12),
      size: 9,
      font: fonts.normal,
      color: rgb(0, 0, 0),
      maxWidth: textAreaWidth,
    });
  });

  currentY += remarksLines.length * 12 + 10;

  page.drawText('Declaration:', {
    x,
    y: A4_HEIGHT - currentY,
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  currentY += 14;

  const declarationLines = wrapText(invoice.declaration, textAreaWidth, fonts.normal, 9);
  declarationLines.forEach((line, idx) => {
    page.drawText(line, {
      x,
      y: A4_HEIGHT - (currentY + idx * 12),
      size: 9,
      font: fonts.normal,
      color: rgb(0, 0, 0),
      maxWidth: textAreaWidth,
    });
  });

  currentY += declarationLines.length * 12;
  const leftSectionBottom = currentY;

  // Bank Details (RIGHT) - plain text without box to match remarks style
  let bankY = startY;
  
  page.drawText("Company's Bank Details", {
    x: bankX,
    y: A4_HEIGHT - bankY,
    size: 10,
    font: fonts.bold,
    color: rgb(0, 0, 0),
  });

  bankY += 14;

  page.drawText(`Bank Name : ${bank.name}`, {
    x: bankX,
    y: A4_HEIGHT - bankY,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  bankY += 13;

  page.drawText(`A/c No. : ${bank.accountNumber}`, {
    x: bankX,
    y: A4_HEIGHT - bankY,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  bankY += 13;

  page.drawText(`Branch & IFSC Code : ${bank.branch} & ${bank.ifsc}`, {
    x: bankX,
    y: A4_HEIGHT - bankY,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  bankY += 13;

  const sectionBottom = Math.max(leftSectionBottom, bankY);
  return sectionBottom + 6;
}

function drawStampAndFooter(page, contentBottom, fonts, stampImage) {
  // Draw a single box containing stamp and 'Authorised Signatory' text at bottom-right
  const boxWidth = 160;
  const boxHeight = 95;
  const boxX = A4_WIDTH - MARGIN - boxWidth - 8;
  const boxY = MARGIN + 18; // Position above footer text

  // Draw single outer box
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER_WIDTH,
  });

  // Draw stamp image inside the box if available
  if (stampImage) {
    const stampWidth = 65;
    const stampDims = stampImage.scale(stampWidth / stampImage.width);
    const stampX = boxX + (boxWidth - stampDims.width) / 2;
    const stampY = boxY + boxHeight - stampDims.height - 10;
    
    page.drawImage(stampImage, {
      x: stampX,
      y: stampY,
      width: stampDims.width,
      height: stampDims.height,
    });
  }

  // Draw 'Authorised Signatory' text at bottom of box
  const signatoryText = 'Authorised Signatory';
  const signatoryX = boxX + (boxWidth - getTextWidth(signatoryText, fonts.normal, 9)) / 2;
  page.drawText(signatoryText, {
    x: signatoryX,
    y: boxY + 8,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });

  // Footer text - centered outside the border at the very bottom
  const footerText = 'This is a Computer Generated Invoice';
  const footerTextX = centerTextX(footerText, 0, A4_WIDTH, fonts.normal, 9);
  const footerY = MARGIN - 10;
  page.drawText(footerText, {
    x: footerTextX,
    y: footerY,
    size: 9,
    font: fonts.normal,
    color: rgb(0, 0, 0),
  });
}

function computeTotals(invoice) {
  const baseAmount = invoice.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const cgstAmount = baseAmount * (invoice.taxRates?.cgst || 0);
  const sgstAmount = baseAmount * (invoice.taxRates?.sgst || 0);
  const taxTotal = cgstAmount + sgstAmount;
  const roundOff = invoice.roundOff || 0;
  const grandTotal = baseAmount + taxTotal + roundOff;
  return { baseAmount, cgstAmount, sgstAmount, taxTotal, roundOff, grandTotal };
}

function formatCurrency(amount) {
  return `Rs ${amount.toFixed(2)}`;
}
