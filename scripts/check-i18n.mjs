import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['ja', 'en', 'fr', 'ko', 'ru', 'th', 'zh-Hans', 'zh-Hant'];
const NAMESPACES = ['common', 'questions'];
const BASE_LOCALE = 'ja';
const LOCALES_DIR = path.resolve(process.cwd(), 'src', 'i18n', 'locales');
const NATIVE_DIR = path.resolve(process.cwd(), 'locales', 'native');

function flattenKeys(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, fullKey, out);
    } else {
      out.set(fullKey, v);
    }
  }
  return out;
}

function stripPluralSuffix(key) {
  return key.replace(/_(zero|one|two|few|many|other)$/, '');
}

function extractPlaceholders(value) {
  if (typeof value !== 'string') return [];
  const matches = value.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim()))].sort();
}

let errorCount = 0;
let warningCount = 0;

function error(msg) {
  console.error(`[ERROR] ${msg}`);
  errorCount++;
}

function warn(msg) {
  console.warn(`[WARN]  ${msg}`);
  warningCount++;
}

// 1. Check native locale files
for (const locale of LOCALES) {
  const nativeFile = path.join(NATIVE_DIR, `${locale}.json`);
  if (!fs.existsSync(nativeFile)) {
    error(`Missing native locale file: ${nativeFile}`);
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
      if (data.CFBundleDisplayName !== 'Kotaeai') {
        error(`Unexpected CFBundleDisplayName in ${nativeFile}: ${data.CFBundleDisplayName}`);
      }
    } catch (e) {
      error(`Invalid JSON in ${nativeFile}: ${e.message}`);
    }
  }
}

// 2. Check namespace files across all locales
for (const ns of NAMESPACES) {
  const basePath = path.join(LOCALES_DIR, BASE_LOCALE, `${ns}.json`);
  if (!fs.existsSync(basePath)) {
    error(`Missing base locale file: ${basePath}`);
    continue;
  }

  const baseJson = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const baseFlat = flattenKeys(baseJson);
  const baseNormalized = new Map();
  for (const [k, v] of baseFlat.entries()) {
    const norm = stripPluralSuffix(k);
    if (!baseNormalized.has(norm)) {
      baseNormalized.set(norm, { sampleKey: k, value: v });
    }
  }

  for (const locale of LOCALES) {
    const filePath = path.join(LOCALES_DIR, locale, `${ns}.json`);
    if (!fs.existsSync(filePath)) {
      error(`Missing locale file: ${locale}/${ns}.json`);
      continue;
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      error(`Invalid JSON in ${locale}/${ns}.json: ${e.message}`);
      continue;
    }

    const flat = flattenKeys(json);
    const localeNormalized = new Map();
    for (const [k, v] of flat.entries()) {
      const norm = stripPluralSuffix(k);
      if (!localeNormalized.has(norm)) {
        localeNormalized.set(norm, []);
      }
      localeNormalized.get(norm).push({ key: k, value: v });
    }

    // Missing keys
    for (const [normKey, baseEntry] of baseNormalized.entries()) {
      if (!localeNormalized.has(normKey)) {
        error(`[${locale}/${ns}] Missing key: ${normKey}`);
        continue;
      }

      const baseVars = extractPlaceholders(baseEntry.value);
      for (const entry of localeNormalized.get(normKey)) {
        if (typeof entry.value !== 'string' || entry.value.trim() === '') {
          error(`[${locale}/${ns}] Empty value for key: ${entry.key}`);
          continue;
        }
        const vars = extractPlaceholders(entry.value);
        // Allow {{count}} omission in singular _one if deliberate, otherwise enforce exact match
        const isSingularOne = entry.key.endsWith('_one');
        const missingVars = baseVars.filter((v) => !vars.includes(v) && !(isSingularOne && v === 'count'));
        const extraVars = vars.filter((v) => !baseVars.includes(v));
        if (missingVars.length > 0 || extraVars.length > 0) {
          error(
            `[${locale}/${ns}] Placeholder mismatch on ${entry.key}: expected [${baseVars.join(', ')}], got [${vars.join(', ')}]`
          );
        }

        // Check leftover Japanese characters in non-ja locales (excluding brand/proper names)
        if (locale !== 'ja') {
          const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(entry.value);
          if (hasKana) {
            error(`[${locale}/${ns}] Leftover Japanese kana in ${entry.key}: "${entry.value}"`);
          }
        }

        // Layout safety warning for SwipeCard choices (LEFT/RIGHT slots are narrow)
        if (ns === 'questions' && /\.choices\.(UP|DOWN|LEFT|RIGHT)$/.test(entry.key)) {
          const maxLen = locale === 'ja' || locale === 'zh-Hans' || locale === 'zh-Hant' ? 24 : 46;
          if (entry.value.length > maxLen) {
            warn(`[${locale}/${ns}] Long choice text (${entry.value.length} chars) at ${entry.key}: "${entry.value}"`);
          }
        }
      }
    }

    // Extra keys
    for (const normKey of localeNormalized.keys()) {
      if (!baseNormalized.has(normKey)) {
        error(`[${locale}/${ns}] Extra unknown key: ${normKey}`);
      }
    }
  }
}

console.log(`\nChecked ${LOCALES.length} locales across [${NAMESPACES.join(', ')}].`);
console.log(`Errors: ${errorCount}, Warnings: ${warningCount}`);
process.exit(errorCount > 0 ? 1 : 0);
