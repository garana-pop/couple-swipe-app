import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['ja', 'en-US', 'fr-FR', 'ko-KR', 'ru-RU', 'th', 'zh-CN', 'zh-TW'];
const LOCALES_DIR = path.resolve(process.cwd(), 'store-assets', 'i18n', 'locales');
const DOC_PATH = path.resolve(process.cwd(), 'docs', 'STORE_LISTING_I18N.md');
const WRITE_DOC = process.argv.includes('--write-doc');

const LIMITS = {
  gpAppName: 30,
  gpShortDescription: 80,
  gpFullDescription: 4000,
  gpReleaseNotes: 500,
  asName: 30,
  asSubtitle: 30,
  asPromotionalText: 170,
  asKeywords: 100,
  subName: 55,
  subDescription: 80,
  subBenefit: 40,
};

let errorCount = 0;
function err(msg) {
  console.error(`[ERROR] ${msg}`);
  errorCount++;
}

function charLen(str) {
  return Array.from(String(str ?? '')).length;
}

function checkText(locale, field, value, maxLen, opts = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    err(`[${locale}] ${field} is empty`);
    return 0;
  }
  const len = charLen(value);
  if (maxLen && len > maxLen) {
    err(`[${locale}] ${field} exceeds limit (${len} > ${maxLen}): "${value}"`);
  }
  if (opts.mustInclude && !value.includes(opts.mustInclude)) {
    err(`[${locale}] ${field} must include "${opts.mustInclude}": "${value}"`);
  }
  if (locale !== 'ja' && /[\u3040-\u309F\u30A0-\u30FF]/.test(value)) {
    err(`[${locale}] ${field} contains Japanese kana: "${value.slice(0, 80)}"`);
  }
  return len;
}

const loaded = [];

for (const locale of LOCALES) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    err(`Missing file: ${filePath}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  loaded.push(data);

  // Google Play
  checkText(locale, 'googlePlay.appName', data.googlePlay?.appName, LIMITS.gpAppName, { mustInclude: 'Kotaeai' });
  checkText(locale, 'googlePlay.shortDescription', data.googlePlay?.shortDescription, LIMITS.gpShortDescription);
  checkText(locale, 'googlePlay.fullDescription', data.googlePlay?.fullDescription, LIMITS.gpFullDescription, { mustInclude: 'Kotaeai' });
  checkText(locale, 'googlePlay.releaseNotes', data.googlePlay?.releaseNotes, LIMITS.gpReleaseNotes);

  // App Store
  checkText(locale, 'appStore.name', data.appStore?.name, LIMITS.asName, { mustInclude: 'Kotaeai' });
  checkText(locale, 'appStore.subtitle', data.appStore?.subtitle, LIMITS.asSubtitle);
  checkText(locale, 'appStore.promotionalText', data.appStore?.promotionalText, LIMITS.asPromotionalText);
  checkText(locale, 'appStore.keywords', data.appStore?.keywords, LIMITS.asKeywords);

  const kwList = String(data.appStore?.keywords ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (new Set(kwList).size !== kwList.length) {
    err(`[${locale}] appStore.keywords has duplicate entries: ${data.appStore?.keywords}`);
  }

  // Subscriptions
  for (const planKey of ['yearly', 'monthly']) {
    const plan = data.subscriptions?.[planKey];
    if (!plan) {
      err(`[${locale}] Missing subscriptions.${planKey}`);
      continue;
    }
    checkText(locale, `subscriptions.${planKey}.name`, plan.name, LIMITS.subName);
    checkText(locale, `subscriptions.${planKey}.description`, plan.description, LIMITS.subDescription);
    if (!Array.isArray(plan.benefits) || plan.benefits.length === 0 || plan.benefits.length > 4) {
      err(`[${locale}] subscriptions.${planKey}.benefits must have 1-4 items`);
    } else {
      plan.benefits.forEach((b, idx) => {
        checkText(locale, `subscriptions.${planKey}.benefits[${idx}]`, b, LIMITS.subBenefit);
      });
    }
  }

  // Feature graphic
  const fg = data.featureGraphic;
  if (!fg) {
    err(`[${locale}] Missing featureGraphic`);
  } else {
    checkText(locale, 'featureGraphic.brandSub', fg.brandSub, 48);
    checkText(locale, 'featureGraphic.headlineAccent', fg.headlineAccent, 30);
    checkText(locale, 'featureGraphic.headlineLine2', fg.headlineLine2, 42);
    checkText(locale, 'featureGraphic.subcopyLine1', fg.subcopyLine1, 64);
    checkText(locale, 'featureGraphic.subcopyLine2', fg.subcopyLine2, 72);
    checkText(locale, 'featureGraphic.cardTag', fg.cardTag, 28);
    checkText(locale, 'featureGraphic.cardFooterLabel', fg.cardFooterLabel, 24);
    checkText(locale, 'featureGraphic.cardMatchPill', fg.cardMatchPill, 18);
    if (!Array.isArray(fg.pills) || fg.pills.length !== 3) {
      err(`[${locale}] featureGraphic.pills must have 3 items`);
    } else {
      fg.pills.forEach((p, i) => checkText(locale, `featureGraphic.pills[${i}]`, p, 24));
    }
    if (!Array.isArray(fg.cardQuestionLines) || fg.cardQuestionLines.length !== 3) {
      err(`[${locale}] featureGraphic.cardQuestionLines must have 3 items`);
    } else {
      fg.cardQuestionLines.forEach((line, i) => checkText(locale, `featureGraphic.cardQuestionLines[${i}]`, line, 22));
    }
    for (const dir of ['up', 'left', 'right', 'down']) {
      checkText(locale, `featureGraphic.choices.${dir}`, fg.choices?.[dir], dir === 'left' || dir === 'right' ? 18 : 26);
    }
  }

  // Screenshots
  if (!Array.isArray(data.screenshots) || data.screenshots.length !== 6) {
    err(`[${locale}] screenshots must have 6 items`);
  } else {
    data.screenshots.forEach((s, i) => {
      checkText(locale, `screenshots[${i}].eyebrow`, s.eyebrow, 30);
      checkText(locale, `screenshots[${i}].title`, s.title, 44);
      checkText(locale, `screenshots[${i}].subtitle`, s.subtitle, 60);
      checkText(locale, `screenshots[${i}].headerTitle`, s.headerTitle, 24);
    });
  }
}

console.log(`Checked ${loaded.length} store locales. Errors: ${errorCount}`);

if (errorCount > 0) {
  process.exit(1);
}

if (WRITE_DOC) {
  const lines = [];
  lines.push('# Kotaeai 多言語ストア掲載情報キット（全8言語・コピペ対応）');
  lines.push('');
  lines.push('Google Play Console（メインのストア掲載情報・定期購入の翻訳・リリースノート・フィーチャーグラフィック）および App Store Connect へそのまま貼り付けられる全8言語分のテキストと素材パスをまとめています。');
  lines.push('');
  lines.push('> すべての文字数制限は `npm run check:store-i18n` で自動検証済みです。ソースデータは `store-assets/i18n/locales/*.json` で一元管理しています。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 0. 対応言語コード一覧 ＆ 素材ファイル対応表');
  lines.push('');
  lines.push('| 言語 | Google Play 言語コード | App Store 言語コード | フィーチャーグラフィック (`1024×500`) | プライバシーポリシー URL |');
  lines.push('|---|---|---|---|---|');
  for (const d of loaded) {
    const fgPath =
      d.locale === 'ja'
        ? '`store-assets/google-play/feature-graphic-1024x500.png`'
        : `\`store-assets/google-play/localized/${d.locale}/feature-graphic-1024x500.png\``;
    lines.push(
      `| ${d.displayNameJa} | \`${d.googlePlayCode}\` | \`${d.appStoreCode}\` | ${fgPath} | \`${d.legalBaseUrl}/privacy.html\` |`
    );
  }
  lines.push('');
  lines.push('### グラフィック・スクリーンショットの一括再生成コマンド');
  lines.push('```powershell');
  lines.push('# 全7言語のフィーチャーグラフィック（1024x500 PNG）を一括生成');
  lines.push('powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1');
  lines.push('');
  lines.push('# 実機で撮影した多言語スクショを raw/<言語コード>/ に配置したあと、提出用1080x1920 PNGを一括生成');
  lines.push('# 例: store-assets/google-play/screenshots/raw/en-US/01-home.jpg 〜 06-ai-report.jpg');
  lines.push('powershell -ExecutionPolicy Bypass -File scripts/build-store-i18n-assets.ps1 -Screenshots');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const d of loaded) {
    const gp = d.googlePlay;
    const as = d.appStore;
    const y = d.subscriptions.yearly;
    const m = d.subscriptions.monthly;

    lines.push(`## ${d.displayNameJa} — Google Play: \`${d.googlePlayCode}\` / App Store: \`${d.appStoreCode}\``);
    lines.push('');
    lines.push(`- **フィーチャーグラフィック**: ${d.locale === 'ja' ? '`store-assets/google-play/feature-graphic-1024x500.png`' : `\`store-assets/google-play/localized/${d.locale}/feature-graphic-1024x500.png\``}`);
    lines.push(`- **法務ページ**: \`${d.legalBaseUrl}/privacy.html\` / \`${d.legalBaseUrl}/terms.html\` / \`${d.legalBaseUrl}/account-deletion.html\``);
    lines.push('');
    lines.push(`### アプリ名（${charLen(gp.appName)} / 30文字）`);
    lines.push('```text');
    lines.push(gp.appName);
    lines.push('```');
    lines.push('');
    lines.push(`### Google Play 簡単な説明（${charLen(gp.shortDescription)} / 80文字）`);
    lines.push('```text');
    lines.push(gp.shortDescription);
    lines.push('```');
    lines.push('');
    lines.push(`### 詳しい説明（${charLen(gp.fullDescription)} / 4,000文字）`);
    lines.push('```text');
    lines.push(gp.fullDescription);
    lines.push('```');
    lines.push('');
    lines.push(`### リリースノート / What's new（${charLen(gp.releaseNotes)} / 500文字）`);
    lines.push('```text');
    lines.push(gp.releaseNotes);
    lines.push('```');
    lines.push('');
    lines.push('### Google Play 定期購入の翻訳（収益化 ＞ 商品 ＞ 定期購入）');
    lines.push('| 商品 ID | 名前（≤55） | 説明（≤80） | 特典リスト（各≤40） |');
    lines.push('|---|---|---|---|');
    lines.push(`| \`${y.productId}\` | ${y.name} (${charLen(y.name)}) | ${y.description} (${charLen(y.description)}) | ${y.benefits.map((b) => `${b} (${charLen(b)})`).join('<br>')} |`);
    lines.push(`| \`${m.productId}\` | ${m.name} (${charLen(m.name)}) | ${m.description} (${charLen(m.description)}) | ${m.benefits.map((b) => `${b} (${charLen(b)})`).join('<br>')} |`);
    lines.push('');
    lines.push('### App Store Connect 向け（iOS 公開時）');
    lines.push(`- **サブタイトル（${charLen(as.subtitle)} / 30文字）**: \`${as.subtitle}\``);
    lines.push(`- **プロモーションテキスト（${charLen(as.promotionalText)} / 170文字）**: \`${as.promotionalText}\``);
    lines.push(`- **キーワード（${charLen(as.keywords)} / 100文字）**: \`${as.keywords}\``);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  fs.writeFileSync(DOC_PATH, lines.join('\n'), 'utf8');
  console.log(`Generated ${DOC_PATH}`);
}
