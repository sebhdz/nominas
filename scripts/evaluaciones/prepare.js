import { inflateRawSync } from 'node:zlib';

export function normalizeEvaluationName(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXmlText(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readZipEntries(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) {
    eocd -= 1;
  }
  if (eocd < 0) throw new Error('Invalid XLSX archive: End of Central Directory not found.');

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid XLSX archive: Central Directory header mismatch.');
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(fileName, compressed);
    } else if (compressionMethod === 8) {
      entries.set(fileName, inflateRawSync(compressed));
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${fileName}.`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let text = '';
    let tMatch;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += decodeXmlText(tMatch[1]);
    }
    strings.push(text);
  }
  return strings;
}

export function parseXlsxRows(buffer) {
  const entries = readZipEntries(buffer);
  const sharedStringsXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  const sheetXml = entries.get('xl/worksheets/sheet1.xml')?.toString('utf8');
  if (!sheetXml) throw new Error('Worksheet xl/worksheets/sheet1.xml not found in XLSX.');

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cells = {};
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? '';
      const refMatch = /\br="([A-Z]+)\d+"/.exec(attrs);
      if (!refMatch) continue;
      const col = refMatch[1];
      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : '';
      const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
      let value = valueMatch ? decodeXmlText(valueMatch[1]) : null;
      if (cellType === 's' && value !== null) {
        const index = Number(value);
        value = sharedStrings[index] ?? null;
      } else if (cellType === 'inlineStr') {
        const inlineMatch = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner);
        value = inlineMatch ? decodeXmlText(inlineMatch[1]) : null;
      }
      cells[col] = value;
    }
    rows.push(cells);
  }

  return rows;
}

const roundScore = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function prepareEvaluationRows(rows, source) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('Invalid evaluation rows: expected header and at least one data row.');
  }

  const header = rows[0];
  const colByHeader = {};
  for (const [col, label] of Object.entries(header)) {
    const normalized = normalizeEvaluationName(label);
    if (normalized) colByHeader[normalized] = col;
  }

  const nameCol = colByHeader.NOMBRE;
  const pointsCol = colByHeader.PUNTOS;
  if (!nameCol || !pointsCol) {
    throw new Error('Expected NOMBRE and PUNTOS columns in evaluation sheet.');
  }

  const grouped = new Map();
  let dataRowCount = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = typeof row[nameCol] === 'string' ? row[nameCol].replace(/\s+/g, ' ').trim() : '';
    const rawPoints = row[pointsCol];
    if (!rawName) {
      continue;
    }
    const normalizedName = normalizeEvaluationName(rawName);
    const parsedPoints = Number(rawPoints);
    if (!Number.isFinite(parsedPoints)) {
      throw new Error(`Invalid evaluation score at row ${i + 1} for ${rawName}.`);
    }
    const score = roundScore(parsedPoints);
    dataRowCount += 1;

    if (!grouped.has(normalizedName)) {
      grouped.set(normalizedName, {
        nombre: rawName,
        nombreNormalizado: normalizedName,
        puntajes: [],
      });
    }
    grouped.get(normalizedName).puntajes.push(score);
  }

  if (!dataRowCount) {
    throw new Error('No evaluation data rows found.');
  }

  const registros = [...grouped.values()].map(({ nombre, nombreNormalizado, puntajes }) => {
    const sum = puntajes.reduce((acc, item) => acc + item, 0);
    return {
      nombre,
      nombreNormalizado,
      calificacion: roundScore(sum / puntajes.length),
      evaluaciones: puntajes.length,
    };
  });

  return {
    version: 1,
    identificadorInstitucion: source.identificadorInstitucion,
    periodo: source.periodo,
    puntajeMaximo: 40,
    fuente: {
      archivo: source.archivo,
      sha256: source.sha256,
    },
    filasEntrada: dataRowCount,
    totalPersonas: registros.length,
    registros,
  };
}

export function prepareEvaluationsFromXlsx(buffer, source) {
  const rows = parseXlsxRows(buffer);
  return prepareEvaluationRows(rows, source);
}
