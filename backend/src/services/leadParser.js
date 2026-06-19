const xlsx = require('xlsx');
const mammoth = require('mammoth');

/** Parse Excel buffer → array of lead objects */
function parseExcel(buffer) {
  const wb = xlsx.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(normalizeRow).filter(l => l.phone);
}

/** Parse Word (.docx) buffer → array of lead objects */
async function parseWord(buffer) {
  // Try table first
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const tableLeads = parseHtmlTable(html);
  if (tableLeads.length) return tableLeads.filter(l => l.phone);

  // Fallback: pipe-delimited lines  "Jane Smith | +15550001 | jane@co.com | Acme"
  const { value: text } = await mammoth.extractRawText({ buffer });
  return parsePipeLines(text).filter(l => l.phone);
}

function parseHtmlTable(html) {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const rows = tableMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (rows.length < 2) return [];

  const headers = (rows[0].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
    .map(c => c.replace(/<[^>]+>/g, '').trim().toLowerCase());

  return rows.slice(1).map(row => {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(c => c.replace(/<[^>]+>/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
    return normalizeRow(obj);
  });
}

function parsePipeLines(text) {
  return text.split('\n')
    .map(l => l.trim()).filter(l => l.includes('|'))
    .map(l => {
      const [name = '', phone = '', email = '', company = ''] = l.split('|').map(s => s.trim());
      const parts = name.split(' ');
      return { firstName: parts[0], lastName: parts.slice(1).join(' '),
               phone: normalizePhone(phone), email, company };
    });
}

function normalizeRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
      if (val) return String(val).trim();
    }
    return '';
  };

  let firstName = get('first_name','firstname','First Name','FirstName');
  let lastName  = get('last_name','lastname','Last Name','LastName');

  if (!firstName && !lastName) {
    const full = get('name','full_name','Full Name','FullName','contact','Contact');
    if (full) { const p = full.split(' '); firstName = p[0]; lastName = p.slice(1).join(' '); }
  }

  return {
    firstName,
    lastName,
    phone:   normalizePhone(get('phone','Phone','mobile','Mobile','tel','Tel','telephone','cell')),
    email:   get('email','Email','email_address').toLowerCase(),
    company: get('company','Company','organization','Organization','org'),
  };
}

function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('+'))  return s;
  if (s.length === 10)    return `+1${s}`;
  if (s.length === 11 && s.startsWith('1')) return `+${s}`;
  return s.length ? `+${s}` : '';
}

function validateLead(lead) {
  const errors = [];
  if (!lead.phone) errors.push('Missing phone');
  else if (!/^\+[1-9]\d{6,14}$/.test(lead.phone)) errors.push(`Invalid phone: ${lead.phone}`);
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push(`Invalid email: ${lead.email}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { parseExcel, parseWord, validateLead, normalizePhone };
