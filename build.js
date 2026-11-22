#!/usr/bin/env node
/* DUNA Bath static site builder — zero dependencies.
   node build.js        → ./dist  (draft, noindex)
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const cfg = readJSON('site.config.json');
const I18N = readJSON('content/i18n.json');
const CATALOG = readJSON('content/products.json');
const DIST = path.join(ROOT, process.env.DIST_DIR || 'dist');
const LANGS = cfg.site.languages;
const DEF = cfg.site.defaultLang;
const BASE = String(cfg.site.basePath || '').replace(/\/$/, '');
const SITE = String(cfg.site.url || '').replace(/\/$/, '');
const BRAND = cfg.brand.name;
const LEGAL = cfg.brand.legalName;
const EMAIL = cfg.contact.email;
const ADDRESS = cfg.contact.address;
const ADDR = cfg.contact.addressParts;
const PREVIEW = !!cfg.site.previewBanner;
const NOINDEX = true; // draft always noindex

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (key, lang) => {
  const parts = key.split('.');
  let node = I18N;
  for (const p of parts) node = node && node[p];
  if (node && typeof node === 'object' && (node[lang] || node[DEF])) return node[lang] || node[DEF];
  return key;
};
const write = (rel, content) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};
const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
};

/* paths */
const prefix = p => (BASE + '/' + String(p || '').replace(/^\/+/, '')).replace(/\/+/g, '/');
const langRoot = lang => (lang === DEF ? prefix('/') : prefix('/' + lang + '/'));
const u = (lang, p = '') => {
  const root = lang === DEF ? '' : lang + '/';
  const full = prefix(root + String(p || '').replace(/^\/+/, ''));
  return (full.endsWith('/') || /\.[a-z0-9]+$/i.test(full)) ? full : full + '/';
};
const asset = p => prefix(p);
const ORIGIN = (BASE && SITE.endsWith(BASE)) ? SITE.slice(0, -BASE.length) : SITE;
const abs = p => ORIGIN + (String(p).startsWith('/') ? p : '/' + p);

const PAGE = {
  home: { es: '', en: '' },
  collection: { es: 'coleccion/', en: 'collection/' },
  system: { es: 'el-sistema/', en: 'the-system/' },
  order: { es: 'como-pedir/', en: 'how-to-order/' },
  pros: { es: 'profesionales/', en: 'professionals/' },
  contact: { es: 'contacto/', en: 'contact/' },
  legal: { es: 'aviso-legal/', en: 'legal-notice/' },
  privacy: { es: 'privacidad/', en: 'privacy/' }
};
const pageUrl = (lang, name) => u(lang, PAGE[name][lang]);
const productUrl = (lang, p) => u(lang, (lang === 'es' ? 'coleccion/' : 'collection/') + p.slug[lang] + '/');
const altLang = lang => (lang === 'es' ? 'en' : 'es');
const altUrl = (lang, name, product) => product
  ? productUrl(altLang(lang), product)
  : pageUrl(altLang(lang), name);

const families = CATALOG.families;
const products = CATALOG.products;
const famById = Object.fromEntries(families.map(f => [f.id, f]));
const seriesList = CATALOG.series || [];
const seriesById = Object.fromEntries(seriesList.map(x => [x.id, x]));
const displayName = (p, lang) => `${p.code} · ${p.name[lang]}`;

/* ---------- head / shell ---------- */
function fontPreloads() {
  const files = [
    'cormorant-garamond-400-normal-latin.woff2',
    'cormorant-garamond-400-italic-latin.woff2',
    'cormorant-garamond-300-normal-latin.woff2',
    'source-sans-3-400-normal-latin.woff2',
    'source-sans-3-600-normal-latin.woff2'
  ];
  return files.map(f =>
    `<link rel="preload" href="${esc(asset('fonts/' + f))}" as="font" type="font/woff2" crossorigin>`
  ).join('\n  ');
}

function jsonLd(lang, extra) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    legalName: LEGAL,
    url: SITE + '/',
    email: EMAIL,
    logo: abs(asset('img/marca/logo.png')),
    address: {
      '@type': 'PostalAddress',
      streetAddress: ADDR.street,
      postalCode: ADDR.postalCode,
      addressLocality: ADDR.locality,
      addressRegion: ADDR.region,
      addressCountry: ADDR.country
    }
  };
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND,
    url: SITE + '/',
    inLanguage: [ 'es-ES', 'en-GB' ],
    publisher: { '@type': 'Organization', name: LEGAL }
  };
  const blocks = [org, site].concat(extra || []);
  return blocks.map(b => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n  ');
}

function shell(opts) {
  const { lang, pathName, title, description, canonicalPath, altPath, body, extraHead, ogImage, jsonld } = opts;
  const canonical = abs(canonicalPath);
  const alt = abs(altPath);
  const og = abs(ogImage || asset('img/og-cover.jpg'));
  const robots = NOINDEX ? 'noindex, nofollow' : 'index, follow';
  const hreflangDef = langRoot(DEF);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" hreflang="${lang === 'es' ? 'es' : 'en'}" href="${esc(canonical)}">
  <link rel="alternate" hreflang="${lang === 'es' ? 'en' : 'es'}" href="${esc(alt)}">
  <link rel="alternate" hreflang="x-default" href="${esc(abs(hreflangDef))}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(BRAND)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(og)}">
  <meta property="og:locale" content="${esc(t('meta.ogLocale', lang))}">
  <meta property="og:locale:alternate" content="${esc(t('meta.ogLocale', altLang(lang)))}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(og)}">
  <link rel="icon" href="${esc(asset('favicon.svg'))}" type="image/svg+xml">
  <link rel="icon" href="${esc(asset('favicon.ico'))}" sizes="any">
  <link rel="apple-touch-icon" href="${esc(asset('apple-touch-icon.png'))}">
  ${fontPreloads()}
  <link rel="stylesheet" href="${esc(asset('css/style.css'))}">
  ${extraHead || ''}
  ${jsonLd(lang, jsonld)}
</head>
<body>
  <a class="skip" href="#contenido">${esc(t('nav.skip', lang))}</a>
  ${PREVIEW ? `<div class="draft-bar" role="note"><strong>${esc(t('draft.label', lang))}</strong><span>${esc(t('draft.text', lang))}</span></div>` : ''}
  ${header(lang, pathName)}
  <main id="contenido">
    ${body}
  </main>
  ${footer(lang)}
  <script src="${esc(asset('js/main.js'))}" defer></script>
</body>
</html>
`;
}

function header(lang, pathName) {
  const items = [
    ['home', 'nav.home'],
    ['collection', 'nav.collection'],
    ['system', 'nav.system'],
    ['order', 'nav.order'],
    ['pros', 'nav.pros'],
    ['contact', 'nav.contact']
  ];
  const nav = items.map(([name, key]) => {
    const href = pageUrl(lang, name);
    const current = pathName === name ? ' aria-current="page"' : '';
    return `<a href="${esc(href)}"${current}>${esc(t(key, lang))}</a>`;
  }).join('\n        ');
  const altHref = typeof pathName === 'object' ? pathName.alt : altUrl(lang, pathName);
  return `
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="${esc(pageUrl(lang, 'home'))}">
        <img src="${esc(asset('img/marca/logo-header.webp'))}" alt="${esc(BRAND)}" width="720" height="317">
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-principal" aria-label="${esc(t('nav.menu', lang))}"><span></span></button>
      <nav class="nav" id="nav-principal">${nav}</nav>
      <div class="header-tools">
        <a class="lang-switch" href="${esc(altHref)}" lang="${altLang(lang)}" hreflang="${altLang(lang)}">${esc(t('nav.langSwitch', lang))}</a>
      </div>
    </div>
  </header>`;
}

function footer(lang) {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="logo" href="${esc(pageUrl(lang, 'home'))}">
          <img src="${esc(asset('img/marca/logo-header.webp'))}" alt="${esc(BRAND)}" width="720" height="317">
        </a>
        <p>${esc(t('footer.tagline', lang))}</p>
      </div>
      <div class="footer-col">
        <h2>${esc(LEGAL)}</h2>
        <address>${esc(ADDRESS)}<br>
          <a href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a>
          ${PREVIEW ? `<div class="hint">${esc(t('contact.emailNote', lang))}</div>` : ''}
        </address>
      </div>
      <div class="footer-col">
        <h2>${esc(BRAND)}</h2>
        <ul>
          <li><a href="${esc(pageUrl(lang, 'collection'))}">${esc(t('nav.collection', lang))}</a></li>
          <li><a href="${esc(asset('downloads/DUNA-Bath-Catalogo-Slim.pdf'))}">${esc(t('footer.catalogue', lang))}</a></li>
          <li><a href="${esc(pageUrl(lang, 'legal'))}">${esc(t('footer.legal', lang))}</a></li>
          <li><a href="${esc(pageUrl(lang, 'privacy'))}">${esc(t('footer.privacy', lang))}</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>${esc(LEGAL)}</span>
      <span>${esc(t('footer.rights', lang))}</span>
    </div>
  </footer>`;
}

function picture(srcStem, alt, cls, w, h, lazy) {
  const webp = asset(`img/${srcStem}.webp`);
  const jpg = asset(`img/${srcStem}.jpg`);
  const png = asset(`img/${srcStem}.png`);
  const fallback = fs.existsSync(path.join(ROOT, 'public/img', srcStem + '.jpg')) ? jpg
    : fs.existsSync(path.join(ROOT, 'public/img', srcStem + '.png')) ? png
    : webp;
  const loading = 'eager';
  const fetchp = lazy === false ? ' fetchpriority="high"' : '';
  return `<picture>
      <source type="image/webp" srcset="${esc(webp)}">
      <img class="${cls || ''}" src="${esc(fallback)}" alt="${esc(alt)}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} loading="${loading}"${fetchp} decoding="${lazy === false ? 'sync' : 'async'}">
    </picture>`;
}

function productCard(p, lang) {
  const alt = `${displayName(p, lang)}. ${t('collection.selection', lang)} ${p.id}. ${CATALOG.disclaimer[lang]}`;
  return `<a class="card" href="${esc(productUrl(lang, p))}" data-family="${esc(p.family)}" data-series="${esc(p.series)}">
    <div class="card-img">${picture('productos/' + p.image + '-thumb', alt, '', 600, 750, false)}</div>
    <div class="card-meta">
      <div class="card-kicker">${esc(t('collection.selection', lang))} ${esc(p.id)}</div>
      <h3>${esc(p.code)}</h3>
      <p class="card-sub">${esc(p.name[lang])}</p>
    </div>
  </a>`;
}

function filters(lang, current) {
  const btns = [`<button type="button" class="filter-btn" data-filter="all" aria-pressed="${current ? 'false' : 'true'}">${esc(t('collection.all', lang))}</button>`]
    .concat(seriesList.map(f =>
      `<button type="button" class="filter-btn" data-filter="${esc(f.id)}" aria-pressed="${current === f.id ? 'true' : 'false'}">${esc(f.code)}</button>`
    ));
  return `<div class="filters" data-filters role="group" aria-label="${esc(t('collection.filterLabel', lang))}">${btns.join('')}</div>`;
}

function collectionGrid(lang) {
  return `${filters(lang)}
    <div class="grid" id="coleccion-grid">
      ${products.map(p => productCard(p, lang)).join('\n')}
    </div>
    <p class="footnote">${esc(CATALOG.footnote[lang])}</p>`;
}

function quoteForm(lang, preselect) {
  const opts = [`<option value="">${esc(t('contact.selectionPlaceholder', lang))}</option>`]
    .concat(products.map(p => {
      const val = displayName(p, lang);
      const sel = preselect === p.id ? ' selected' : '';
      return `<option value="${esc(val)}" data-id="${esc(p.id)}"${sel}>${esc(val)}</option>`;
    }));
  return `<form class="form" data-quote-form data-email="${esc(EMAIL)}" data-subject="${esc(t('contact.mailtoSubjectGeneric', lang))}" data-subject-sel="${esc(t('contact.mailtoSubject', lang))}" method="post" action="mailto:${esc(EMAIL)}">
      <div>
        <label for="selection">${esc(t('contact.selection', lang))}</label>
        <select id="selection" name="selection">${opts.join('')}</select>
      </div>
      <div>
        <label for="finish">${esc(t('contact.finish', lang))}</label>
        <input id="finish" name="finish" type="text" placeholder="${esc(t('contact.finishPlaceholder', lang))}">
      </div>
      <div>
        <label for="install">${esc(t('contact.install', lang))}</label>
        <input id="install" name="install" type="text" placeholder="${esc(t('contact.installPlaceholder', lang))}">
      </div>
      <div>
        <label for="qty">${esc(t('contact.qty', lang))}</label>
        <input id="qty" name="qty" type="number" min="50" step="1" >
        <span class="hint">${esc(t('contact.qtyNote', lang))}</span>
      </div>
      <div>
        <label for="width">${esc(t('contact.width', lang))}</label>
        <input id="width" name="width" type="text">
      </div>
      <div>
        <label for="height">${esc(t('contact.height', lang))}</label>
        <input id="height" name="height" type="text">
      </div>
      <div class="full">
        <label for="format">${esc(t('contact.format', lang))}</label>
        <select id="format" name="format">
          <option value="${esc(t('contact.formatKit', lang))}">${esc(t('contact.formatKit', lang))}</option>
          <option value="${esc(t('contact.formatGlass', lang))}">${esc(t('contact.formatGlass', lang))}</option>
          <option value="${esc(t('contact.formatComplete', lang))}">${esc(t('contact.formatComplete', lang))}</option>
        </select>
      </div>
      <div>
        <label for="name">${esc(t('contact.name', lang))}</label>
        <input id="name" name="name" type="text" autocomplete="organization">
      </div>
      <div>
        <label for="email">${esc(t('contact.email', lang))}</label>
        <input id="email" name="email" type="email" autocomplete="email">
      </div>
      <div class="full">
        <label for="message">${esc(t('contact.message', lang))}</label>
        <textarea id="message" name="message"></textarea>
      </div>
      <div class="full">
        <button class="btn" type="submit">${esc(t('contact.submit', lang))}</button>
        <p class="form-note">${esc(t('contact.formNote', lang))}</p>
      </div>
    </form>`;
}

/* ---------- pages ---------- */
function homeBody(lang) {
  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="kicker">${esc(t('hero.kicker', lang))}</p>
        <p class="collection-name">${esc(t('hero.collection', lang))}</p>
        <h1>${esc(t('hero.title', lang))}<em>${esc(t('hero.italic', lang))}</em></h1>
        <p class="hero-lead">${esc(t('hero.lead', lang))}</p>
        <span class="badge">${esc(t('hero.moq', lang))}</span>
        <p class="hero-note">${esc(t('hero.complete', lang))}</p>
        <div class="hero-actions">
          <a class="btn" href="${esc(pageUrl(lang, 'collection'))}">${esc(t('hero.ctaCollection', lang))}</a>
          <a class="btn btn-ghost" href="${esc(pageUrl(lang, 'contact'))}">${esc(t('hero.ctaQuote', lang))}</a>
        </div>
      </div>
      <div class="hero-media">
        ${picture('hero/portada', t('hero.heroAlt', lang), '', 1071, 1311, false)}
      </div>
    </section>

    <section class="facts" aria-label="${esc(t('facts.kit', lang))}">
      <div class="facts-inner">
        <div class="fact">${esc(t('facts.kit', lang))}</div>
        <div class="fact">${esc(t('facts.moq', lang))}</div>
        <div class="fact">${esc(t('facts.glass', lang))}</div>
        <div class="fact">${esc(t('facts.complete', lang))}</div>
      </div>
    </section>

    <section class="section" id="sistema">
      <div class="section-inner">
        <p class="kicker">${esc(t('system.kicker', lang))}</p>
        <h2>${esc(t('system.title', lang))}</h2>
        <p class="section-lead">${esc(t('system.lead', lang))}</p>
        <div class="system-grid">
          <div class="system-photos">
            <figure class="photo-card">
              ${picture('sistema/kit-embalado', t('system.packedCaption', lang), 'img-packed', 470, 811, true)}
              <figcaption>${esc(t('system.packedCaption', lang))}</figcaption>
            </figure>
            <figure class="photo-card">
              ${picture('sistema/kit-presentacion', t('system.boxCaption', lang), 'img-box', 647, 216, true)}
              <figcaption>${esc(t('system.boxCaption', lang))}<span class="note">${esc(t('system.boxNote', lang))}</span></figcaption>
            </figure>
          </div>
          <div class="system-points">
            <div class="point"><span class="num">01</span><div><h3>${esc(t('system.item1Title', lang))}</h3><p>${esc(t('system.item1Text', lang))}</p></div></div>
            <div class="point"><span class="num">02</span><div><h3>${esc(t('system.item2Title', lang))}</h3><p>${esc(t('system.item2Text', lang))}</p></div></div>
            <div class="point"><span class="num">03</span><div><h3>${esc(t('system.item3Title', lang))}</h3><p>${esc(t('system.item3Text', lang))}</p></div></div>
            <div><a class="btn btn-ghost" href="${esc(pageUrl(lang, 'system'))}">${esc(t('nav.system', lang))}</a></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="coleccion" style="padding-top:0">
      <div class="section-wide">
        <p class="kicker">${esc(t('collection.kicker', lang))}</p>
        <h2>${esc(t('collection.title', lang))}</h2>
        <p class="section-lead">${esc(t('collection.lead', lang))}</p>
        ${collectionGrid(lang)}
      </div>
    </section>

    <section class="section" id="pedido">
      <div class="section-inner">
        <p class="kicker">${esc(t('order.kicker', lang))}</p>
        <h2>${esc(t('order.title', lang))}</h2>
        <p class="section-lead">${esc(t('order.lead', lang))}</p>
        <div class="order-photos">
          <figure class="photo-card">
            ${picture('sistema/expedicion', t('order.warehouseAlt', lang), '', 1218, 684, true)}
            <figcaption>${esc(t('order.warehouseCaption', lang))}</figcaption>
          </figure>
          <figure class="photo-card">
            ${picture('sistema/detalle-embalaje', t('order.packingAlt', lang), '', 627, 684, true)}
            <figcaption>${esc(t('order.packingCaption', lang))}</figcaption>
          </figure>
        </div>
        <div class="steps">
          <div class="step"><span class="num">01</span><h3>${esc(t('order.step1Title', lang))}</h3><p>${esc(t('order.step1Text', lang))}</p></div>
          <div class="step"><span class="num">02</span><h3>${esc(t('order.step2Title', lang))}</h3><p>${esc(t('order.step2Text', lang))}</p></div>
          <div class="step"><span class="num">03</span><h3>${esc(t('order.step3Title', lang))}</h3><p>${esc(t('order.step3Text', lang))}</p></div>
        </div>
        <p style="margin-top:2.2rem"><span class="badge">${esc(t('hero.moq', lang))}</span></p>
        <div class="hero-actions"><a class="btn" href="${esc(pageUrl(lang, 'contact'))}">${esc(t('order.cta', lang))}</a></div>
      </div>
    </section>

    <section class="split" id="profesionales">
      <div class="split-copy">
        <p class="kicker">${esc(t('pros.kicker', lang))}</p>
        <h2>${esc(t('pros.title', lang))}</h2>
        <p class="section-lead">${esc(t('pros.lead', lang))}</p>
        <div class="pros-actions">
          <a class="btn btn-light" href="${esc(asset('downloads/DUNA-Bath-Catalogo-Slim.pdf'))}">${esc(t('pros.download', lang))}</a>
          <a class="btn btn-on-dark" href="${esc(pageUrl(lang, 'contact'))}">${esc(t('pros.sheetCta', lang))}</a>
        </div>
        <p class="pros-note">${esc(t('pros.sheetTitle', lang))}. ${esc(t('pros.sheetText', lang))}</p>
        ${PREVIEW ? `<p class="pros-note">${esc(t('pros.note', lang))}</p>` : ''}
      </div>
      <div class="split-media">
        ${picture('hero/pedido', t('hero.heroAlt', lang), '', 889, 1311, true)}
      </div>
    </section>

    <section class="form-section" id="contacto">
      <div class="section-wide">
        <div class="form-grid">
          <div>
            <p class="kicker">${esc(t('contact.kicker', lang))}</p>
            <h2>${esc(t('contact.title', lang))}</h2>
            <p class="section-lead">${esc(t('contact.lead', lang))} <a class="email-inline" href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a> ${esc(t('contact.emailNote', lang))}.</p>
          </div>
          ${quoteForm(lang)}
        </div>
      </div>
    </section>`;
}

function collectionPage(lang) {
  return `<div class="page-hero section-wide">
      <p class="kicker">${esc(t('collection.kicker', lang))}</p>
      <h1>${esc(t('collection.title', lang))}</h1>
      <p class="section-lead">${esc(t('collection.lead', lang))}</p>
    </div>
    <section class="section" style="padding-top:0">
      <div class="section-wide">${collectionGrid(lang)}</div>
    </section>`;
}

function systemPage(lang) {
  return `<div class="page-hero section-inner">
      <p class="kicker">${esc(t('system.kicker', lang))}</p>
      <h1>${esc(t('system.title', lang))}</h1>
      <p class="section-lead">${esc(t('system.lead', lang))}</p>
    </div>
    <section class="section" style="padding-top:0">
      <div class="section-inner">
        <div class="system-grid">
          <div class="system-photos">
            <figure class="photo-card">
              ${picture('sistema/kit-embalado', t('system.packedCaption', lang), 'img-packed', 470, 811, true)}
              <figcaption>${esc(t('system.packedCaption', lang))}</figcaption>
            </figure>
            <figure class="photo-card">
              ${picture('sistema/kit-presentacion', t('system.boxCaption', lang), 'img-box', 647, 216, true)}
              <figcaption>${esc(t('system.boxCaption', lang))}<span class="note">${esc(t('system.boxNote', lang))}</span></figcaption>
            </figure>
          </div>
          <div class="system-points">
            <div class="point"><span class="num">01</span><div><h3>${esc(t('system.item1Title', lang))}</h3><p>${esc(t('system.item1Text', lang))}</p></div></div>
            <div class="point"><span class="num">02</span><div><h3>${esc(t('system.item2Title', lang))}</h3><p>${esc(t('system.item2Text', lang))}</p></div></div>
            <div class="point"><span class="num">03</span><div><h3>${esc(t('system.item3Title', lang))}</h3><p>${esc(t('system.item3Text', lang))}</p></div></div>
          </div>
        </div>
        <p class="footnote" style="margin-top:3rem">${esc(t('hero.complete', lang))}</p>
      </div>
    </section>`;
}

function orderPage(lang) {
  return `<div class="page-hero section-inner">
      <p class="kicker">${esc(t('order.kicker', lang))}</p>
      <h1>${esc(t('order.title', lang))}</h1>
      <p class="section-lead">${esc(t('order.lead', lang))}</p>
    </div>
    <section class="section" style="padding-top:0">
      <div class="section-inner">
        <div class="order-photos">
          <figure class="photo-card">
            ${picture('sistema/expedicion', t('order.warehouseAlt', lang), '', 1218, 684, true)}
            <figcaption>${esc(t('order.warehouseCaption', lang))}</figcaption>
          </figure>
          <figure class="photo-card">
            ${picture('sistema/detalle-embalaje', t('order.packingAlt', lang), '', 627, 684, true)}
            <figcaption>${esc(t('order.packingCaption', lang))}</figcaption>
          </figure>
        </div>
        <div class="steps">
          <div class="step"><span class="num">01</span><h3>${esc(t('order.step1Title', lang))}</h3><p>${esc(t('order.step1Text', lang))}</p></div>
          <div class="step"><span class="num">02</span><h3>${esc(t('order.step2Title', lang))}</h3><p>${esc(t('order.step2Text', lang))}</p></div>
          <div class="step"><span class="num">03</span><h3>${esc(t('order.step3Title', lang))}</h3><p>${esc(t('order.step3Text', lang))}</p></div>
        </div>
        <p style="margin-top:2.2rem"><span class="badge">${esc(t('hero.moq', lang))}</span></p>
        <div class="hero-actions"><a class="btn" href="${esc(pageUrl(lang, 'contact'))}">${esc(t('order.cta', lang))}</a></div>
      </div>
    </section>`;
}

function prosPage(lang) {
  return `<div class="page-hero section-inner">
      <p class="kicker">${esc(t('pros.kicker', lang))}</p>
      <h1>${esc(t('pros.title', lang))}</h1>
      <p class="section-lead">${esc(t('pros.lead', lang))}</p>
      <div class="hero-actions">
        <a class="btn" href="${esc(asset('downloads/DUNA-Bath-Catalogo-Slim.pdf'))}">${esc(t('pros.download', lang))}</a>
        <a class="btn btn-ghost" href="${esc(pageUrl(lang, 'contact'))}">${esc(t('pros.sheetCta', lang))}</a>
      </div>
      <p class="footnote">${esc(t('pros.sheetText', lang))}</p>
      ${PREVIEW ? `<p class="footnote">${esc(t('pros.note', lang))}</p>` : ''}
    </div>`;
}

function contactPage(lang, preselect) {
  return `<div class="form-section">
      <div class="section-wide">
        <div class="form-grid">
          <div>
            <p class="kicker">${esc(t('contact.kicker', lang))}</p>
            <h1>${esc(t('contact.title', lang))}</h1>
            <p class="section-lead">${esc(t('contact.lead', lang))} <a class="email-inline" href="mailto:${esc(EMAIL)}">${esc(EMAIL)}</a> ${esc(t('contact.emailNote', lang))}.</p>
            <p><span class="badge">${esc(t('hero.moq', lang))}</span></p>
          </div>
          ${quoteForm(lang, preselect)}
        </div>
      </div>
    </div>`;
}

function productPage(lang, p) {
  const fam = famById[p.family];
  const ser = seriesById[p.series];
  const alt = `${displayName(p, lang)}. ${t('collection.selection', lang)} ${p.id}. ${CATALOG.disclaimer[lang]}`;
  return `<section class="section-wide product-layout" style="padding-top:4.2rem;padding-bottom:5rem">
      <div class="product-visual">${picture('productos/' + p.image, alt, '', 900, 1125, false)}</div>
      <div class="product-info">
        <nav class="crumb"><a href="${esc(pageUrl(lang, 'collection'))}">${esc(t('nav.collection', lang))}</a> / ${esc(ser.code)}</nav>
        <p class="kicker">${esc(t('product.selection', lang))} ${esc(p.id)}</p>
        <h1>${esc(p.code)}</h1>
        <p class="product-sub">${esc(p.name[lang])}</p>
        <p class="family card-kicker">${esc(fam.name[lang])}</p>
        <p class="section-lead">${esc(CATALOG.disclaimer[lang])}</p>
        <p>${esc(CATALOG.footnote[lang])}</p>
        <p style="margin-top:1.4rem"><span class="badge">${esc(t('hero.moq', lang))}</span></p>
        <div class="product-actions">
          <a class="btn" href="${esc(pageUrl(lang, 'contact'))}?sel=${esc(p.id)}">${esc(t('product.cta', lang))}</a>
          <a class="btn btn-ghost" href="${esc(pageUrl(lang, 'contact'))}?sel=${esc(p.id)}">${esc(t('product.sheet', lang))}</a>
        </div>
        <p class="footnote"><a href="${esc(pageUrl(lang, 'collection'))}">← ${esc(t('product.back', lang))}</a></p>
      </div>
    </section>`;
}

function legalPage(lang, key) {
  const paras = I18N[key].body[lang];
  return `<div class="page-hero section-inner">
      <p class="kicker">${esc(t(key + '.kicker', lang))}</p>
      <h1>${esc(t(key + '.title', lang))}</h1>
      <p class="draft-note">${esc(t(key + '.draftNote', lang))}</p>
      <div class="legal-body">${paras.map(p => `<p>${esc(p)}</p>`).join('\n')}</div>
    </div>`;
}

function notFound(lang) {
  return `<div class="not-found">
      <p class="kicker">${esc(BRAND)}</p>
      <h1>${esc(t('notFound.title', lang))}</h1>
      <p class="section-lead">${esc(t('notFound.text', lang))}</p>
      <div class="hero-actions">
        <a class="btn" href="${esc(pageUrl(lang, 'home'))}">${esc(t('notFound.home', lang))}</a>
        <a class="btn btn-ghost" href="${esc(pageUrl(lang, 'collection'))}">${esc(t('nav.collection', lang))}</a>
      </div>
    </div>`;
}

function productJsonLd(lang, p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName(p, lang),
    description: CATALOG.disclaimer[lang] + ' ' + CATALOG.footnote[lang],
    image: abs(asset('img/productos/' + p.image + '.jpg')),
    brand: { '@type': 'Brand', name: BRAND },
    category: `${seriesById[p.series].code} / ${famById[p.family].name[lang]}`
  };
}

function breadcrumb(lang, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.url)
    }))
  };
}

/* ---------- write pages ---------- */
function outFile(lang, pagePath) {
  // pagePath like '' or 'coleccion/' or 'coleccion/foo/'
  const rel = (lang === DEF ? '' : lang + '/') + pagePath + (pagePath.endsWith('/') || pagePath === '' ? 'index.html' : '');
  return rel;
}

function render(lang, name, body, titleKey, descKey, product) {
  const canonicalPath = product ? productUrl(lang, product) : pageUrl(lang, name);
  const altPath = product ? productUrl(altLang(lang), product) : altUrl(lang, name);
  const title = product
    ? t('meta.productTitle', lang).replace('{n}', product.id).replace('{name}', product.name[lang]).replace('{code}', product.code)
    : t(titleKey, lang);
  const description = product
    ? t('meta.productDescription', lang).replace('{n}', product.id).replace('{name}', product.name[lang]).replace('{code}', product.code)
    : t(descKey, lang);
  const jsonld = [];
  if (product) {
    jsonld.push(productJsonLd(lang, product));
    jsonld.push(breadcrumb(lang, [
      { name: BRAND, url: pageUrl(lang, 'home') },
      { name: t('nav.collection', lang), url: pageUrl(lang, 'collection') },
      { name: displayName(product, lang), url: productUrl(lang, product) }
    ]));
  } else if (name !== 'home') {
    jsonld.push(breadcrumb(lang, [
      { name: BRAND, url: pageUrl(lang, 'home') },
      { name: title.replace(` | ${BRAND}`, ''), url: pageUrl(lang, name) }
    ]));
  }
  const html = shell({
    lang,
    pathName: product ? { alt: altPath } : name,
    title,
    description,
    canonicalPath,
    altPath,
    body,
    jsonld
  });
  const pagePath = product
    ? ((lang === 'es' ? 'coleccion/' : 'collection/') + product.slug[lang] + '/')
    : PAGE[name][lang];
  write(outFile(lang, pagePath), html);
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(path.join(ROOT, 'public'), DIST);

  const css = fs.readFileSync(path.join(ROOT, 'src/fonts.css'), 'utf8') +
    '\n' + fs.readFileSync(path.join(ROOT, 'src/style.css'), 'utf8');
  write('css/style.css', minifyCss(css));
  write('js/main.js', fs.readFileSync(path.join(ROOT, 'src/main.js')));
  write('.nojekyll', '');

  for (const lang of LANGS) {
    render(lang, 'home', homeBody(lang), 'meta.homeTitle', 'meta.homeDescription');
    render(lang, 'collection', collectionPage(lang), 'meta.collectionTitle', 'meta.collectionDescription');
    render(lang, 'system', systemPage(lang), 'meta.systemTitle', 'meta.systemDescription');
    render(lang, 'order', orderPage(lang), 'meta.orderTitle', 'meta.orderDescription');
    render(lang, 'pros', prosPage(lang), 'meta.prosTitle', 'meta.prosDescription');
    render(lang, 'contact', contactPage(lang), 'meta.contactTitle', 'meta.contactDescription');
    render(lang, 'legal', legalPage(lang, 'legal'), 'meta.legalTitle', 'meta.legalDescription');
    render(lang, 'privacy', legalPage(lang, 'privacy'), 'meta.privacyTitle', 'meta.privacyDescription');
    for (const p of products) {
      render(lang, 'collection', productPage(lang, p), null, null, p);
    }
  }
  write('404.html', shell({
    lang: DEF,
    pathName: 'home',
    title: t('meta.notFoundTitle', DEF),
    description: t('notFound.text', DEF),
    canonicalPath: u(DEF, '404.html'),
    altPath: u('en', '404.html'),
    body: notFound(DEF)
  }));
  write('en/404.html', shell({
    lang: 'en',
    pathName: 'home',
    title: t('meta.notFoundTitle', 'en'),
    description: t('notFound.text', 'en'),
    canonicalPath: u('en', '404.html'),
    altPath: u(DEF, '404.html'),
    body: notFound('en')
  }));

  const robotLines = [
    'User-agent: *',
    'Disallow: /',
    'Sitemap: ' + abs(asset('sitemap.xml'))
  ];
  write('robots.txt', robotLines.join('\n') + '\n');

  const urls = [];
  for (const lang of LANGS) {
    for (const name of Object.keys(PAGE)) urls.push(abs(pageUrl(lang, name)));
    for (const p of products) urls.push(abs(productUrl(lang, p)));
  }
  const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(loc => `  <url><loc>${esc(loc)}</loc></url>`).join('\n')}
</urlset>
`;
  write('sitemap.xml', sm);

  const pages = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  };
  walk(DIST);
  console.log('Built', pages.length, 'html pages →', DIST);
  console.log('Base', BASE || '/', '· Site', SITE);
}

build();
