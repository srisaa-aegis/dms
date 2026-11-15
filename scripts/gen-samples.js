// Generates the dummy documents in demo/sample-files/ (real PDF, DOCX, XLSX, PNG and TXT files, no dependencies)
// and demo/data/manifest.js, the tree the demo reads. Run with: npm run samples
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const samples = path.join(root, 'demo', 'sample-files');
const manifestFile = path.join(root, 'demo', 'data', 'manifest.js');
const ROOT_NAME = 'Company Documents';

// ---------- helpers ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A "stored" (uncompressed) zip: enough for .docx / .xlsx. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(text);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function docx(title, paragraphs) {
  const p = (t, bold) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(title, true)}${paragraphs.map((t) => p(t)).join('')}</w:body></w:document>`],
  ]);
}

function xlsx(rows) {
  const cell = (v) => (typeof v === 'number' ? `<c><v>${v}</v></c>` : `<c t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
  const sheet = rows.map((r) => `<row>${r.map(cell).join('')}</row>`).join('');
  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`],
  ]);
}

function pdf(title, lines) {
  const pe = (s) => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
  let y = 790;
  let content = `BT /F1 20 Tf 50 ${y} Td (${pe(title)}) Tj ET\n`;
  for (const l of lines) {
    y -= 22;
    content += `BT /F1 11 Tf 50 ${y} Td (${pe(l)}) Tj ET\n`;
  }
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function png() {
  const w = 480;
  const h = 300;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      let r, g, b;
      if (y < 190) [r, g, b] = [90 + y / 3, 150 + y / 4, 235 - y / 5]; // sky
      else [r, g, b] = [96, 122 - (y - 190) / 4, 70]; // ground
      if (x > 150 && x < 330 && y > 110 && y < 230) [r, g, b] = [170, 172, 178]; // substation building
      if (x > 200 && x < 280 && y > 160 && y < 230) [r, g, b] = [60, 64, 74]; // door
      if (x > 60 && x < 70 && y > 70 && y < 230) [r, g, b] = [80, 80, 86]; // pole
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- the sample documents ----------
const lorem = (topic) => [
  `${topic}`,
  'This is a dummy document generated for the document-manager demo.',
  'Its only purpose is to give the folder tree and file list something to show.',
  'Replace demo/sample-files with your own files and run `npm run samples` to rebuild the manifest.',
];

/** [relative path, date, content] */
const files = [
  ['README.txt', '2026-11-01', 'Company Documents (sample)\n\nEvery file here is dummy data for the stl-dms demo.\nOpen the folders on the left, then View, Download, Rename or Delete a file.\n'],
  ['RFPs/Smart-City-CCTV-RFP.pdf', '2026-09-14', pdf('RFP: City-wide CCTV Surveillance', [...lorem('Request for Proposal'), 'Bid due date: 20 Dec 2026', 'Estimated value: INR 24.5 Cr'])],
  ['RFPs/Water-SCADA-RFP-Addendum.pdf', '2026-10-02', pdf('Addendum 1: Water SCADA', [...lorem('Addendum to the RFP'), 'Clarifications to clauses 4.2 and 7.1'])],
  ['RFPs/Pre-Bid-Queries.docx', '2026-10-09', docx('Pre-Bid Queries', ['Q1. Is a joint venture allowed?', 'A1. Yes, up to two partners.', 'Q2. Is the EMD refundable?', 'A2. Yes, within 30 days of the award.'])],
  ['Contracts/Master-Services-Agreement.docx', '2026-06-20', docx('Master Services Agreement', lorem('Agreement between the parties').concat(['Term: 36 months', 'Governing law: India']))],
  ['Contracts/NDA-Template.docx', '2026-03-11', docx('Mutual Non-Disclosure Agreement', lorem('Template'))],
  ['Contracts/Work-Order-WO-2026-014.pdf', '2026-08-05', pdf('Work Order WO-2026-014', [...lorem('Work order'), 'Value: INR 3.2 Cr', 'Delivery: 90 days'])],
  ['Contracts/Archive/Expired-NDA-2024.pdf', '2024-12-31', pdf('Expired NDA (2024)', lorem('Archived'))],
  ['Invoices/FY2025-26/Invoice-Register.xlsx', '2026-03-31', xlsx([['Invoice', 'Client', 'Amount (INR)'], ['INV-0031', 'Pune Municipal Corp', 1250000], ['INV-0032', 'Greater Chennai Corp', 980000], ['INV-0033', 'MSEDCL', 2210000]])],
  ['Invoices/FY2026-27/INV-0042.pdf', '2026-10-15', pdf('Tax Invoice INV-0042', ['Bill to: Bengaluru Smart City Ltd', 'Item: Command centre phase 1', 'Amount: INR 18,50,000', 'GST 18%: INR 3,33,000'])],
  ['Invoices/FY2026-27/INV-0043.pdf', '2026-10-28', pdf('Tax Invoice INV-0043', ['Bill to: Kerala Road Fund Board', 'Item: Highway ITS survey', 'Amount: INR 7,20,000', 'GST 18%: INR 1,29,600'])],
  ['Invoices/FY2026-27/Invoice-Register.xlsx', '2026-11-05', xlsx([['Invoice', 'Client', 'Amount (INR)', 'Status'], ['INV-0042', 'Bengaluru Smart City Ltd', 1850000, 'Paid'], ['INV-0043', 'Kerala Road Fund Board', 720000, 'Due']])],
  ['Project Reports/Weekly-Status-Report.docx', '2026-11-08', docx('Weekly Status Report: Week 45', ['Progress: 62% complete', 'Next week: cabling and commissioning', 'Risks: material delivery delay (2 days)'])],
  ['Project Reports/Budget-vs-Actual.xlsx', '2026-11-10', xlsx([['Head', 'Budget (INR)', 'Actual (INR)'], ['Materials', 4000000, 3650000], ['Labour', 1800000, 1920000], ['Travel', 250000, 180000]])],
  ['Project Reports/Site-Photo-Substation.png', '2026-11-12', png()],
  ['HR Policies/Leave-Policy.pdf', '2026-01-15', pdf('Leave Policy', [...lorem('HR policy'), 'Casual leave: 12 days', 'Earned leave: 18 days'])],
  ['HR Policies/Travel-Policy.txt', '2026-02-02', 'Travel Policy (sample)\n\n- Economy class for flights under 6 hours.\n- Hotel cap: INR 6,000 per night.\n- Submit expenses within 7 days of returning.\n'],
];

fs.rmSync(samples, { recursive: true, force: true });
for (const [rel, date, content] of files) {
  const full = path.join(samples, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  const t = new Date(`${date}T10:30:00Z`);
  fs.utimesSync(full, t, t);
}

// ---------- manifest ----------
function scan(dir, name) {
  const node = { name, folders: [], files: [] };
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) node.folders.push(scan(full, e.name));
    else {
      const st = fs.statSync(full);
      node.files.push({ name: e.name, size: st.size, modifiedAt: st.mtime.toISOString() });
    }
  }
  return node;
}
const manifest = scan(samples, ROOT_NAME);
fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
fs.writeFileSync(
  manifestFile,
  `/* The folder tree the demo shows (generated from demo/sample-files by \`npm run samples\`). */\nwindow.__DMS_DEMO__ = window.__DMS_DEMO__ || {};\nwindow.__DMS_DEMO__.manifest = ${JSON.stringify(manifest, null, 2)};\n`,
);
console.log(`${files.length} sample files written to demo/sample-files, manifest at demo/data/manifest.js`);
