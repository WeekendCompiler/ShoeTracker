/*
 * ShoeTracker – running shoe mileage tracker.
 *
 * WARNING: Ground rules – all data stays in localStorage (no network), user data
 * is only ever rendered via textContent (never innerHTML), and everything read
 * from storage or a backup goes through normalize() first.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- Constants

  var STORAGE_KEY = 'shoe_tracker_data';
  var THEME_KEY = 'shoe_tracker_theme';
  var ONBOARD_KEY = 'shoe_tracker_onboarded';
  var LANG_KEY = 'shoe_tracker_lang';
  var UNIT_KEY = 'shoe_tracker_unit';
  var CURRENCY_KEY = 'shoe_tracker_currency';
  var ALL_KEYS = [STORAGE_KEY, THEME_KEY, ONBOARD_KEY, LANG_KEY, UNIT_KEY, CURRENCY_KEY];
  // WARNING: Storage keys, backup format and hash routes are public API for
  // existing installs – renaming any of them loses user data or breaks links.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DEFAULT_ICON = '👟';
  var BACKUP_VERSION = 1;
  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  var LIMIT = {
    name: 60,
    brand: 40,
    notes: 280,
    id: 64,
    maxKm: 5000,
    initialKm: 5000,
    distance: 999,
    price: 999999
  };

  // WARNING: All distances are stored in km; miles exist only in display and input.
  var KM_PER_MI = 1.609344;
  var MILE_REGIONS = ['US', 'GB', 'LR', 'MM'];
  // INFO: Same set as FinanzGecko. Display only – prices are never converted.
  var CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'JPY', 'SEK', 'NOK', 'DKK', 'ISK', 'CAD'];
  var REGION_CURRENCY = { CH: 'CHF', LI: 'CHF', US: 'USD', GB: 'GBP', JP: 'JPY', SE: 'SEK', NO: 'NOK', DK: 'DKK' };

  var TABS = ['shoes', 'stats'];
  var TAB_HASH = { shoes: '#schuhe', stats: '#statistik' };
  // WARNING: '#lauf' was the former log tab; old links and home-screen shortcuts
  // still use it, so it keeps opening the shoe list (runs are logged from the cards).
  var LEGACY_HASH = { '#lauf': 'shoes' };

  // ------------------------------------------------------------------ Formats

  var lang = 'de';
  var unit = 'km';
  var currency = 'EUR';
  var numberFormat, numberFormat1, priceFormat, dateFormat;

  function setupFormats() {
    // INFO: English uses the system's regional variant (en-US, en-GB …) when available.
    var system = navigator.language || '';
    var locale = lang === 'de' ? 'de-DE' : (/^en\b/i.test(system) ? system : 'en-GB');
    numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    numberFormat1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    priceFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    dateFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ------------------------------------------------------------------ Settings

  /** Translates a key from i18n.js, replacing {placeholders}; falls back to German. */
  function t(key, vars) {
    var dict = window.SHOE_I18N || {};
    var text = (dict[lang] && dict[lang][key]) || (dict.de && dict.de[key]) || key;
    return vars ? text.replace(/\{(\w+)\}/g, function (match, name) {
      return vars[name] != null ? String(vars[name]) : match;
    }) : text;
  }

  /** Data without a stored setting means an install from before settings existed. */
  function hasLegacyData() {
    return storage.read(STORAGE_KEY) !== null;
  }

  /** Stored choice, else German for legacy installs, else first supported system
   * language, else English. The result is stored right away.
   * WARNING: Mirrored in boot.js – keep both in sync.
   * WARNING: Must be stored on first start, otherwise a new user's first shoe would
   * later look like legacy data and flip the language to German. */
  function detectLanguage() {
    var stored = storage.read(LANG_KEY);
    if (stored === 'de' || stored === 'en') return stored;
    // INFO: Older versions were German-only; pin that so the UI doesn't switch on update.
    var detected = hasLegacyData() ? 'de' : systemLanguage();
    storage.write(LANG_KEY, detected);
    return detected;
  }

  function systemLanguage() {
    var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i]).slice(0, 2).toLowerCase();
      if (code === 'de' || code === 'en') return code;
    }
    return 'en';
  }

  /** Region of the preferred system locale, e.g. 'CH' for de-CH. */
  function systemRegion() {
    var tag = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    var match = /-([a-z]{2})\b/i.exec(tag);
    return match ? match[1].toUpperCase() : '';
  }

  /** Same pattern as detectLanguage(): older versions were km-only. */
  function detectUnit() {
    var stored = storage.read(UNIT_KEY);
    if (stored === 'km' || stored === 'mi') return stored;
    var detected = !hasLegacyData() && MILE_REGIONS.indexOf(systemRegion()) !== -1 ? 'mi' : 'km';
    storage.write(UNIT_KEY, detected);
    return detected;
  }

  function detectCurrency() {
    var stored = storage.read(CURRENCY_KEY);
    if (CURRENCIES.indexOf(stored) !== -1) return stored;
    // WARNING: Prices are never converted, so the currency must not change under existing
    // data. Older versions only knew euros; the default is stored so it stays put later.
    var detected = hasLegacyData() ? 'EUR' : (REGION_CURRENCY[systemRegion()] || 'EUR');
    storage.write(CURRENCY_KEY, detected);
    return detected;
  }

  function loadSettings() {
    lang = detectLanguage();
    unit = detectUnit();
    currency = detectCurrency();
    applySettings();
  }

  function applySettings() {
    setupFormats();
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    var description = document.querySelector('meta[name="description"]');
    if (description) description.content = t('meta.description');

    // INFO: data-i18n-unit marks texts with a ".mi" variant that names mile figures.
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      var key = node.dataset.i18n;
      node.textContent = t(unit === 'mi' && node.hasAttribute('data-i18n-unit') ? key + '.mi' : key);
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (node) {
      node.dataset.i18nAttr.split(',').forEach(function (pair) {
        var parts = pair.split('=');
        node.setAttribute(parts[0], t(parts[1]));
      });
    });
    applyUnitControls();
    syncSettingsForm();
    delete document.documentElement.dataset.i18nPending;
  }

  /** Unit/currency suffixes and the km-based input limits converted to the chosen unit. */
  function applyUnitControls() {
    document.querySelectorAll('[data-unit]').forEach(function (node) { node.textContent = unit; });
    var suffix = currencySuffix();
    document.querySelectorAll('[data-currency]').forEach(function (node) {
      node.textContent = suffix;
    });

    byId('quick-run-distance').max = String(unitLimit(LIMIT.distance));
    var maxKm = byId('shoe-max-km');
    maxKm.min = String(Math.round(fromKm(50)));
    maxKm.max = String(unitLimit(LIMIT.maxKm));
    // INFO: The value attribute is what form.reset() restores.
    maxKm.setAttribute('value', unit === 'km' ? '800' : '500');
    if (!byId('dialog-add-shoe').open) maxKm.value = maxKm.getAttribute('value');
    byId('shoe-initial-km').max = String(unitLimit(LIMIT.initialKm));
  }

  function syncSettingsForm() {
    var fields = byId('settings-form').elements;
    fields.lang.value = lang;
    fields.unit.value = unit;
    fields.currency.value = currency;
    fields.theme.value = themeChoice();
  }

  /** Stores and applies one setting the moment it changes in the settings dialog. */
  function changeSetting(name, value) {
    if (name === 'theme') {
      applyTheme(value);
      return;
    }
    if (name === 'lang' && (value === 'de' || value === 'en')) {
      lang = value;
      storage.write(LANG_KEY, lang);
    } else if (name === 'unit' && (value === 'km' || value === 'mi')) {
      unit = value;
      storage.write(UNIT_KEY, unit);
    } else if (name === 'currency' && CURRENCIES.indexOf(value) !== -1) {
      currency = value;
      storage.write(CURRENCY_KEY, currency);
    } else {
      return;
    }
    applySettings();
    switchTab(ui.tab, false);
  }

  // ------------------------------------------------------------------ Units

  function fromKm(km) {
    return unit === 'mi' ? km / KM_PER_MI : km;
  }

  /** Parses an input in the chosen unit and returns km (NaN if not a number). */
  function inputToKm(value) {
    var parsed = parseFloat(value);
    return unit === 'mi' ? parsed * KM_PER_MI : parsed;
  }

  /** A km limit as the largest whole number in the chosen unit. */
  function unitLimit(km) {
    return Math.floor(fromKm(km));
  }

  /** INFO: Metre precision, so values entered in miles survive the km round trip. */
  function roundKm(value) {
    return Math.round(value * 1000) / 1000;
  }

  function formatKm(km) {
    return numberFormat.format(fromKm(km)) + ' ' + unit;
  }

  function formatKm1(km) {
    return numberFormat1.format(fromKm(km)) + ' ' + unit;
  }

  function formatDate(iso) {
    if (!iso) return '–';
    var parsed = new Date(iso + 'T00:00:00');
    return Number.isNaN(parsed.getTime()) ? iso : dateFormat.format(parsed);
  }

  function formatPrice(value) {
    if (value === undefined || value === null || value === '') return '–';
    return priceFormat.format(value) + ' ' + currencySuffix();
  }

  function currencySuffix() {
    var select = byId('currency-select');
    var option = select && select.selectedOptions[0];
    return option ? option.textContent.split(/\s[-–]\s/).pop().trim() : currency;
  }

  /** Takes a price per km and shows it per chosen unit. */
  function formatCostPerKm(value) {
    return value === null ? '–' : formatPrice(unit === 'mi' ? value * KM_PER_MI : value) + '/' + unit;
  }

  /** INFO: Local date – toISOString() alone is UTC and would be off by a day in the evening. */
  function todayIso() {
    var now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // ------------------------------------------------------------------ Helpers

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(symbol, extraClass) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#' + symbol);
    svg.appendChild(use);
    return svg;
  }

  function uid(prefix) {
    var random = (self.crypto && typeof self.crypto.randomUUID === 'function')
      ? self.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return prefix + '-' + random;
  }

  function firstGrapheme(value) {
    if (typeof Intl.Segmenter === 'function') {
      var segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
      var iterator = segments[Symbol.iterator]();
      var first = iterator.next();
      return first.done ? '' : first.value.segment;
    }
    return Array.from(value).slice(0, 2).join('');
  }

  // ------------------------------------------------------------------ Storage

  var storage = {
    read: function (key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    write: function (key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    },
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        /* ignore: nothing stored means nothing to remove */
      }
    }
  };

  // --------------------------------------------------------------- Validation

  function toText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  function toNumber(value, min, max, fallback) {
    var parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }

  function toIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    return Number.isNaN(Date.parse(value)) ? '' : value;
  }

  function toIcon(value) {
    var text = toText(value, 12);
    return text ? (firstGrapheme(text) || DEFAULT_ICON) : DEFAULT_ICON;
  }

  /**
   * Turns arbitrary input into a guaranteed-valid state; the rest of the app
   * relies on this and does no further checks.
   * WARNING: Must keep accepting every older backup/storage shape (no migrations).
   */
  function normalize(raw) {
    var source = (raw && typeof raw === 'object') ? raw : {};
    var usedIds = new Set();

    function freshId(candidate, prefix) {
      var id = toText(candidate, LIMIT.id);
      if (!id || usedIds.has(id)) id = uid(prefix);
      while (usedIds.has(id)) id = uid(prefix);
      usedIds.add(id);
      return id;
    }

    var shoes = (Array.isArray(source.shoes) ? source.shoes : [])
      .filter(function (entry) { return entry && typeof entry === 'object'; })
      .map(function (entry) {
        return {
          id: freshId(entry.id, 'shoe'),
          name: toText(entry.name, LIMIT.name) || t('shoe.unnamed'),
          brand: toText(entry.brand, LIMIT.brand),
          maxKm: toNumber(entry.maxKm, 1, LIMIT.maxKm, 800),
          initialKm: toNumber(entry.initialKm, 0, LIMIT.initialKm, 0),
          price: toNumber(entry.price, 0, LIMIT.price, null),
          purchaseDate: toIsoDate(entry.purchaseDate),
          icon: toIcon(entry.icon),
          archived: entry.archived === true
        };
      });

    var runs = (Array.isArray(source.runs) ? source.runs : [])
      .filter(function (entry) { return entry && typeof entry === 'object'; })
      .map(function (entry) {
        return {
          id: freshId(entry.id, 'run'),
          shoeId: toText(entry.shoeId, LIMIT.id),
          distance: roundKm(toNumber(entry.distance, 0, LIMIT.distance, 0)),
          date: toIsoDate(entry.date) || todayIso(),
          notes: toText(entry.notes, LIMIT.notes)
        };
      })
      .filter(function (run) { return run.distance > 0; });

    return { shoes: shoes, runs: runs };
  }

  // -------------------------------------------------------------------- State

  var state = { shoes: [], runs: [] };
  var ui = { tab: 'shoes', filter: 'active', detailId: null };
  var drag = null;
  var installPrompt = null;

  function load() {
    var raw = storage.read(STORAGE_KEY);
    if (!raw) return;
    try {
      state = normalize(JSON.parse(raw));
    } catch (error) {
      state = { shoes: [], runs: [] };
      showToast(t('toast.corrupt'));
    }
  }

  function save() {
    if (storage.write(STORAGE_KEY, JSON.stringify(state))) return true;
    // INFO: Locked so the caller's success message can't hide this warning.
    showToast(t('toast.saveFailed'), null, 5000);
    return false;
  }

  // ------------------------------------------------------------- Calculations

  /** Total km per shoe in a single pass (O(n)). */
  function kilometresByShoe() {
    var totals = new Map();
    state.shoes.forEach(function (shoe) { totals.set(shoe.id, shoe.initialKm); });
    state.runs.forEach(function (run) {
      if (totals.has(run.shoeId)) {
        totals.set(run.shoeId, totals.get(run.shoeId) + run.distance);
      }
    });
    totals.forEach(function (value, key) { totals.set(key, round1(value)); });
    return totals;
  }

  function wearOf(currentKm, maxKm) {
    var rawPercent = maxKm > 0 ? (currentKm / maxKm) * 100 : 0;
    var percent = Math.min(rawPercent, 100);
    var displayPercent = Math.round(rawPercent);
    var key = rawPercent >= 90 ? 'worn' : (rawPercent >= 75 ? 'warn' : (rawPercent >= 25 ? 'ok' : 'fresh'));
    return { percent: percent, displayPercent: displayPercent, key: key, label: t('wear.' + key) };
  }

  /** Price per km, or null without a price or mileage. */
  function costPerKm(shoe, totalKm) {
    return shoe.price > 0 && totalKm > 0 ? shoe.price / totalKm : null;
  }

  function average(values) {
    if (values.length === 0) return null;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function shoeById(id) {
    return state.shoes.find(function (shoe) { return shoe.id === id; }) || null;
  }

  function visibleShoes() {
    var wantArchived = ui.filter === 'archived';
    return state.shoes.filter(function (shoe) { return shoe.archived === wantArchived; });
  }

  /** Runs by date, newest first; stable sort keeps entry order within a day. */
  function runsSorted(shoeId) {
    return state.runs
      .filter(function (run) { return !shoeId || run.shoeId === shoeId; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  // ----------------------------------------------------------------- Meter

  function buildMeter(labelLeft, labelRight, wear, modifier, showBadge) {
    var meter = el('div', 'meter meter--' + wear.key + (modifier ? ' ' + modifier : ''));

    var labels = el('div', 'meter__labels');
    labels.appendChild(el('span', null, labelLeft));
    
    var rightGroup = el('span', 'meter__right');
    if (showBadge) {
      rightGroup.appendChild(el('span', 'badge badge--' + wear.key, wear.label));
    }
    rightGroup.appendChild(el('b', null, labelRight));
    labels.appendChild(rightGroup);

    var track = el('div', 'meter__track');
    var bar = el('div', 'meter__bar');
    bar.style.setProperty('--value', wear.percent + '%');
    track.appendChild(bar);

    meter.appendChild(labels);
    meter.appendChild(track);
    return meter;
  }

  // --------------------------------------------------------------- Onboarding

  var onboardingEl = byId('onboarding');

  // INFO: Having shoes also counts as done – covers users from before the flag existed.
  function onboardingDone() {
    return storage.read(ONBOARD_KEY) === '1' || state.shoes.length > 0;
  }

  function syncOnboarding() {
    var done = onboardingDone();
    onboardingEl.hidden = done;
    byId('add-shoe-btn').hidden = !done || ui.tab !== 'shoes';
    // INFO: Mirrored on <html> so boot.js can hide the block before first paint next time.
    if (done) document.documentElement.dataset.onboarded = '1';
    return done;
  }

  function finishOnboarding() {
    storage.write(ONBOARD_KEY, '1');
    syncOnboarding();
  }

  function openAddShoeDialog() {
    byId('shoe-purchase-date').value = todayIso();
    byId('shoe-price').value = '';
    openDialog(byId('dialog-add-shoe'));
    byId('shoe-name').focus();
  }

  // ---------------------------------------------------------- Render: shoes

  var shoesList = byId('shoes-list');
  var shoesEmpty = byId('shoes-empty');

  function renderShoes() {
    var shoes = visibleShoes();
    var totals = kilometresByShoe();
    var onboarding = !syncOnboarding();

    shoesList.replaceChildren();

    var archived = ui.filter === 'archived';
    byId('empty-title').textContent = t(archived ? 'empty.archiveTitle' : 'empty.title');
    byId('empty-text').textContent = t(archived ? 'empty.archiveText' : 'empty.text');
    byId('empty-text').classList.toggle('empty__text--hint', archived);
    shoesEmpty.hidden = shoes.length > 0 || onboarding;
    byId('empty-action').hidden = archived;

    byId('reorder-hint').textContent = t(archived ? 'shoes.reorderHintArchive' : 'shoes.reorderHint');
    byId('reorder-hint').hidden = shoes.length === 0;
    byId('shoes-filter').hidden = state.shoes.length === 0;
    byId('shoes-head').hidden = onboarding;

    shoes.forEach(function (shoe) {
      shoesList.appendChild(buildShoeCard(shoe, totals.get(shoe.id) || 0));
    });
  }

  function buildShoeCard(shoe, totalKm) {
    var wear = wearOf(totalKm, shoe.maxKm);

    var item = el('li', 'shoe shoe--' + wear.key);
    item.dataset.id = shoe.id;

    var head = el('div', 'shoe__head');

    var handle = el('button', 'shoe__handle');
    handle.type = 'button';
    handle.dataset.handle = 'true';
    handle.setAttribute('aria-label', t('shoe.reorder', { name: shoe.name }));
    handle.title = t('shoe.reorderTitle');
    handle.appendChild(icon('i-drag', 'icon--solid'));

    var open = el('button', 'shoe__open');
    open.type = 'button';
    open.dataset.open = shoe.id;
    open.setAttribute('aria-label', t('shoe.open', { name: shoe.name }));
    open.title = t('shoe.editTitle');
    open.appendChild(el('span', 'shoe__emoji', shoe.icon));

    // WARNING: <button> allows phrasing content only – keep spans, no headings/paragraphs.
    var text = el('div', 'shoe__text');
    text.appendChild(el('span', 'shoe__name', shoe.name));
    if (shoe.brand) text.appendChild(el('span', 'shoe__brand', shoe.brand));
    open.appendChild(text);

    head.appendChild(handle);
    head.appendChild(open);

    // INFO: Runs can only be logged for active shoes.
    if (!shoe.archived) {
      var add = el('button', 'shoe__add');
      add.type = 'button';
      add.dataset.logRun = shoe.id;
      add.setAttribute('aria-label', t('shoe.logRun', { name: shoe.name }));
      add.title = t('shoe.logRunTitle');
      // INFO: The visible label is part of the accessible name (WCAG 2.5.3 Label in Name).
      add.appendChild(icon('i-plus', 'icon--sm'));
      head.appendChild(add);
    }

    item.appendChild(head);
    item.appendChild(buildMeter(
      t('shoe.kmOf', { km: formatKm(totalKm), max: formatKm(shoe.maxKm) }),
      wear.displayPercent + ' %',
      wear,
      null,
      true
    ));
    return item;
  }

  // ----------------------------------------------------------- Render: runs

  function buildRunRow(run, options) {
    var item = el('li', 'run');
    var main = el('div', 'run__main');

    var line = el('div');
    line.appendChild(el('span', 'run__distance', formatKm(run.distance)));

    main.appendChild(line);

    if (run.notes) main.appendChild(el('p', 'run__notes', run.notes));

    item.appendChild(main);
    item.appendChild(el('span', 'run__date', formatDate(run.date)));

    if (options.withDelete) {
      var remove = el('button', 'icon-btn icon-btn--danger');
      remove.type = 'button';
      remove.dataset.deleteRun = run.id;
      remove.setAttribute('aria-label', t('run.delete', { date: formatDate(run.date) }));
      remove.appendChild(icon('i-trash', 'icon--sm'));
      item.appendChild(remove);
    }

    return item;
  }

  // ---------------------------------------------------------- Render: stats

  function renderStats() {
    var totals = kilometresByShoe();
    var runKm = state.runs.reduce(function (sum, run) { return sum + run.distance; }, 0);
    var shoeCount = state.shoes.length;
    var initialKm = 0, shoeKm = 0, shoeCost = 0, archivedCount = 0, costs = [];

    state.shoes.forEach(function (shoe) {
      var totalKm = totals.get(shoe.id) || 0;
      var cost = costPerKm(shoe, totalKm);
      initialKm += shoe.initialKm;
      shoeKm += totalKm;
      shoeCost += shoe.price || 0;
      if (shoe.archived) archivedCount++;
      if (cost !== null) costs.push(cost);
    });

    byId('stat-total-distance').textContent = formatKm(round1(runKm + initialKm));
    byId('stat-total-shoes').textContent = String(shoeCount);
    byId('stat-total-shoe-cost').textContent = formatPrice(shoeCost);
    byId('stat-active-shoes').textContent = String(shoeCount - archivedCount);
    byId('stat-archived-shoes').textContent = String(archivedCount);
    byId('stat-total-runs').textContent = String(state.runs.length);
    byId('stat-avg-distance').textContent = formatKm1(round1(shoeCount ? shoeKm / shoeCount : 0));
    byId('stat-avg-cost').textContent = formatCostPerKm(average(costs));

    var container = byId('wear-distribution');
    container.replaceChildren();

    if (shoeCount === 0) {
      container.appendChild(el('p', 'hint', t('stats.noShoes')));
      return;
    }

    // INFO: Active shoes first; the stable sort keeps the user's order within each group.
    state.shoes.slice()
      .sort(function (a, b) { return a.archived - b.archived; })
      .forEach(function (shoe) {
        var totalKm = totals.get(shoe.id) || 0;
        container.appendChild(buildMeter(
          shoe.icon + ' ' + shoe.name,
          formatKm(totalKm) + ' / ' + formatKm(shoe.maxKm),
          wearOf(totalKm, shoe.maxKm),
          'meter--thin',
          false
        ));
      });
  }

  // --------------------------------------------------------------- Navigation

  function switchTab(tab, updateHash) {
    if (TABS.indexOf(tab) === -1) tab = 'shoes';
    ui.tab = tab;

    TABS.forEach(function (name) {
      var selected = name === tab;
      var button = byId('tab-' + name);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      byId('panel-' + name).hidden = !selected;
    });

    byId('add-shoe-btn').hidden = tab !== 'shoes' || !onboardingDone();

    if (tab === 'shoes') renderShoes();
    if (tab === 'stats') renderStats();

    if (updateHash !== false && location.hash !== TAB_HASH[tab]) {
      try {
        history.replaceState(null, '', TAB_HASH[tab]);
      } catch (error) {
        // INFO: Some browsers forbid replaceState on file://.
        location.hash = TAB_HASH[tab];
      }
    }
  }

  function tabFromHash() {
    var found = TABS.find(function (name) { return TAB_HASH[name] === location.hash; });
    return found || LEGACY_HASH[location.hash] || 'shoes';
  }

  // ---------------------------------------------------------- Dialogs/toast

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  var confirmDialog = byId('dialog-confirm');
  var confirmResolve = null;

  function askConfirm(title, text, confirmLabel) {
    byId('confirm-title').textContent = title;
    byId('confirm-text').textContent = text;
    byId('confirm-ok').textContent = confirmLabel || t('confirm.delete');
    openDialog(confirmDialog);
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }

  function settleConfirm(result) {
    // WARNING: Take the resolver first – close() fires a close event that would resolve again with false.
    var resolve = confirmResolve;
    confirmResolve = null;
    closeDialog(confirmDialog);
    if (resolve) resolve(result);
  }

  var toastElement = byId('toast');
  var toastTimer = null;
  var toastAction = null;
  var toastLockedUntil = 0;

  /** lockMs keeps the toast visible and blocks other toasts for that time. */
  function showToast(message, action, lockMs) {
    if (Date.now() < toastLockedUntil) return;
    toastLockedUntil = lockMs ? Date.now() + lockMs : 0;
    // WARNING: A modal dialog makes everything outside it inert; the toast must live
    // inside the open dialog or its undo action can't be clicked.
    var host = document.querySelector('dialog[open]') || document.body;
    if (toastElement.parentNode !== host) host.appendChild(toastElement);

    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    toastElement.classList.toggle('toast--action', Boolean(action));
    toastAction = action || null;
    // INFO: Focusable only when it has an action, so it stays out of the tab order otherwise.
    toastElement.tabIndex = action ? 0 : -1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, lockMs || (action ? 8000 : 2800));
  }

  function hideToast() {
    toastElement.classList.remove('is-visible', 'toast--action');
    toastElement.tabIndex = -1;
    toastAction = null;
  }

  function runToastAction() {
    if (!toastAction) return;
    var action = toastAction;
    hideToast();
    action();
  }

  // ------------------------------------------------------------------ Actions

  function addShoe(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!form.reportValidity()) return;

    var name = toText(byId('shoe-name').value, LIMIT.name);
    var maxKm = toNumber(inputToKm(byId('shoe-max-km').value), 1, LIMIT.maxKm, NaN);
    var initialKm = toNumber(inputToKm(byId('shoe-initial-km').value), 0, LIMIT.initialKm, NaN);
    var price = toNumber(byId('shoe-price').value, 0, LIMIT.price, null);

    if (!name) { showToast(t('toast.needName')); return; }
    if (!Number.isFinite(maxKm)) { showToast(t('toast.needMaxKm')); return; }
    if (!Number.isFinite(initialKm)) { showToast(t('toast.needInitialKm')); return; }

    state.shoes.push({
      id: uid('shoe'),
      name: name,
      brand: toText(byId('shoe-brand').value, LIMIT.brand),
      maxKm: roundKm(maxKm),
      initialKm: roundKm(initialKm),
      price: price,
      purchaseDate: toIsoDate(byId('shoe-purchase-date').value) || todayIso(),
      icon: toIcon(byId('shoe-icon').value),
      archived: false
    });
    save();

    // INFO: Purchase date is refilled by openAddShoeDialog().
    form.reset();

    closeDialog(byId('dialog-add-shoe'));
    finishOnboarding();
    ui.filter = 'active';
    syncFilterChips();
    renderShoes();
    showToast(t('toast.shoeAdded'));
  }

  /** Submit handler of the per-shoe run dialog (opened from the shoe card). */
  function logRun(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!form.reportValidity()) return;

    var fields = form.elements;
    var shoeId = fields.shoeId.value;
    var distance = toNumber(inputToKm(fields.distance.value), 0, LIMIT.distance, NaN);
    var date = toIsoDate(fields.date.value);

    if (!shoeId || !shoeById(shoeId)) {
      showToast(t('toast.needShoe'));
      return;
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      showToast(t('toast.needDistance', { max: numberFormat.format(unitLimit(LIMIT.distance)) + ' ' + unit }));
      return;
    }
    if (!date) { showToast(t('toast.needDate')); return; }

    state.runs.unshift({
      id: uid('run'),
      shoeId: shoeId,
      distance: roundKm(distance),
      date: date,
      notes: toText(fields.notes.value, LIMIT.notes)
    });
    save();

    fields.distance.value = '';
    fields.notes.value = '';
    fields.date.value = todayIso();

    closeDialog(form.closest('dialog'));
    renderShoes();
    showToast(t('toast.runAdded', { km: formatKm(distance) }));
  }

  function openLogRunDialog(shoeId) {
    var shoe = shoeById(shoeId);
    if (!shoe || shoe.archived) return;

    byId('quick-run-shoe-id').value = shoe.id;
    byId('log-run-icon').textContent = shoe.icon;
    byId('log-run-shoe').textContent = shoe.name + (shoe.brand ? ' (' + shoe.brand + ')' : '');
    // INFO: Keep a half-typed run when the same shoe is reopened, start fresh otherwise.
    var form = byId('quick-run-form');
    if (form.dataset.shoeId !== shoe.id) {
      form.reset();
      form.dataset.shoeId = shoe.id;
      byId('quick-run-shoe-id').value = shoe.id;
    }
    if (!byId('quick-run-date').value) byId('quick-run-date').value = todayIso();

    openDialog(byId('dialog-log-run'));
    byId('quick-run-distance').focus();
  }

  function deleteRun(runId) {
    var index = state.runs.findIndex(function (run) { return run.id === runId; });
    if (index === -1) return;

    var removed = state.runs[index];
    state.runs.splice(index, 1);
    save();

    if (ui.detailId) openShoeDetail(ui.detailId);
    renderShoes();

    showToast(t('toast.runDeleted'), function () {
      state.runs.splice(index, 0, removed);
      save();
      if (ui.detailId) openShoeDetail(ui.detailId);
      renderShoes();
      showToast(t('toast.runRestored'));
    });
  }

  function toggleArchive() {
    var shoe = shoeById(ui.detailId);
    if (!shoe) return;

    shoe.archived = !shoe.archived;
    save();
    closeDialog(byId('dialog-shoe-detail'));
    renderShoes();
    showToast(t(shoe.archived ? 'toast.archived' : 'toast.unarchived'));
  }

  function deleteShoe() {
    var shoe = shoeById(ui.detailId);
    if (!shoe) return;

    var affected = state.runs.filter(function (run) { return run.shoeId === shoe.id; }).length;
    var text = affected > 0
      ? t('confirm.deleteShoeRuns', { name: shoe.name, count: affected })
      : t('confirm.deleteShoe', { name: shoe.name });

    askConfirm(t('confirm.deleteShoeTitle'), text).then(function (confirmed) {
      if (!confirmed) return;
      state.shoes = state.shoes.filter(function (entry) { return entry.id !== shoe.id; });
      state.runs = state.runs.filter(function (run) { return run.shoeId !== shoe.id; });
      save();
      closeDialog(byId('dialog-shoe-detail'));
      renderShoes();
      showToast(t('toast.shoeDeleted'));
    });
  }

  /** Removes every app key from this browser; the app then behaves like a first start. */
  function deleteAllData() {
    askConfirm(
      t('confirm.deleteAllTitle'),
      t('confirm.deleteAllText'),
      t('confirm.deleteAllOk')
    ).then(function (confirmed) {
      if (!confirmed) return;

      ALL_KEYS.forEach(storage.remove);

      state = { shoes: [], runs: [] };
      ui.detailId = null;
      ui.filter = 'active';

      delete document.documentElement.dataset.onboarded;
      applyTheme('system');
      loadSettings();
      syncFilterChips();
      switchTab('shoes');
      showToast(t('toast.allDeleted'));
    });
  }

  // ------------------------------------------------------------ Detail dialog

  function openShoeDetail(shoeId) {
    var shoe = shoeById(shoeId);
    if (!shoe) return;

    ui.detailId = shoe.id;

    var totalKm = kilometresByShoe().get(shoe.id) || 0;
    var wear = wearOf(totalKm, shoe.maxKm);

    byId('detail-icon').textContent = shoe.icon;
    byId('detail-name').textContent = shoe.name;
    byId('detail-brand').textContent = shoe.brand || '–';
    byId('detail-km-text').textContent = formatKm(totalKm) + ' / ' + formatKm(shoe.maxKm);
    byId('detail-meter').className = 'meter meter--' + wear.key;
    byId('detail-progress-bar').style.setProperty('--value', wear.percent + '%');
    byId('detail-purchase-date').textContent = formatDate(shoe.purchaseDate);
    byId('detail-price').textContent = formatPrice(shoe.price);
    byId('detail-max-km').textContent = formatKm(shoe.maxKm);
    byId('detail-initial-km').textContent = formatKm(shoe.initialKm);

    var runs = runsSorted(shoe.id);
    var avgDistance = average(runs.map(function (run) { return run.distance; }));
    byId('detail-run-count').textContent = String(runs.length);
    byId('detail-avg-distance').textContent = avgDistance === null ? '–' : formatKm(avgDistance);
    byId('detail-running-cost').textContent = formatCostPerKm(costPerKm(shoe, totalKm));
    byId('detail-remaining-km').textContent = formatKm(Math.max(round1(shoe.maxKm - totalKm), 0));

    byId('detail-archive-text').textContent = t(shoe.archived ? 'detail.unarchive' : 'detail.archive');
    byId('detail-archive-icon').setAttribute('href', shoe.archived ? '#i-unarchive' : '#i-archive');

    var list = byId('detail-runs-list');
    list.replaceChildren();

    if (shoe.initialKm > 0) {
      var initial = el('li', 'run');
      initial.appendChild(el('div', 'run__main', t('detail.initial')));
      initial.appendChild(el('span', 'run__distance', formatKm(shoe.initialKm)));
      list.appendChild(initial);
    }
    if (runs.length === 0 && shoe.initialKm === 0) {
      list.appendChild(el('li', 'hint', t('detail.noRuns')));
    }
    runs.forEach(function (run) {
      list.appendChild(buildRunRow(run, { withDelete: true }));
    });

    openDialog(byId('dialog-shoe-detail'));
  }

  function openEditShoeDialog() {
    var shoe = shoeById(ui.detailId);
    if (!shoe) return;

    byId('edit-shoe-id').value = shoe.id;
    byId('edit-shoe-icon').textContent = shoe.icon;
    byId('edit-shoe-title').textContent = t('edit.title');
    byId('edit-shoe-name').value = shoe.name;
    byId('edit-shoe-brand-input').value = shoe.brand || '';
    byId('edit-shoe-icon-input').value = shoe.icon || DEFAULT_ICON;
    byId('edit-shoe-icon').textContent = shoe.icon || DEFAULT_ICON;
    byId('edit-shoe-max-km').value = unit === 'km' ? shoe.maxKm : fromKm(shoe.maxKm);
    byId('edit-shoe-initial-km').value = unit === 'km' ? shoe.initialKm : fromKm(shoe.initialKm);
    byId('edit-shoe-purchase-date').value = shoe.purchaseDate;
    byId('edit-shoe-price').value = shoe.price || '';

    openDialog(byId('dialog-edit-shoe'));
  }

  function saveEditShoe(event) {
    event.preventDefault();
    var shoeId = byId('edit-shoe-id').value;
    var shoe = shoeById(shoeId);
    if (!shoe) return;

    var name = byId('edit-shoe-name').value.trim();
    var brand = byId('edit-shoe-brand-input').value.trim();
    var icon = byId('edit-shoe-icon-input').value.trim() || DEFAULT_ICON;
    var maxKm = toNumber(byId('edit-shoe-max-km').value, 1, LIMIT.maxKm, 800);
    var initialKm = toNumber(byId('edit-shoe-initial-km').value, 0, LIMIT.initialKm, 0);
    var purchaseDate = byId('edit-shoe-purchase-date').value;
    var price = toNumber(byId('edit-shoe-price').value, 0, LIMIT.price, 0) || 0;

    if (unit === 'mi') {
      maxKm = inputToKm(maxKm);
      initialKm = inputToKm(initialKm);
    }

    shoe.name = name;
    shoe.brand = brand;
    shoe.icon = icon;
    shoe.maxKm = maxKm;
    shoe.initialKm = initialKm;
    shoe.purchaseDate = purchaseDate;
    shoe.price = price;

    save();
    closeDialog(byId('dialog-edit-shoe'));
    openShoeDetail(shoeId);
    renderShoes();
    showToast(t('toast.edited'));
  }

  // ------------------------------------------------------------------ Sorting

  /** Applies the order of the visible (filtered) shoes to the full list. */
  function applyOrder(visibleIds) {
    var slots = [];
    state.shoes.forEach(function (shoe, index) {
      if (visibleIds.indexOf(shoe.id) !== -1) slots.push(index);
    });
    if (slots.length !== visibleIds.length) return false;

    var lookup = new Map(state.shoes.map(function (shoe) { return [shoe.id, shoe]; }));
    var changed = false;

    slots.forEach(function (slot, position) {
      var shoe = lookup.get(visibleIds[position]);
      if (state.shoes[slot] !== shoe) changed = true;
      state.shoes[slot] = shoe;
    });

    if (changed) save();
    return changed;
  }

  function moveShoeByKeyboard(shoeId, offset) {
    var ids = visibleShoes().map(function (shoe) { return shoe.id; });
    var from = ids.indexOf(shoeId);
    var to = from + offset;
    if (from === -1 || to < 0 || to >= ids.length) return;

    ids.splice(to, 0, ids.splice(from, 1)[0]);
    if (!applyOrder(ids)) return;

    renderShoes();
    var handle = shoesList.querySelector('[data-id="' + CSS.escape(shoeId) + '"] .shoe__handle');
    if (handle) handle.focus();
    showToast(t('toast.reordered'));
  }

  // INFO: Pointer events instead of HTML5 drag & drop so it works on touch devices.
  function startDrag(event, handle) {
    if (event.button != null && event.button !== 0) return;

    var item = handle.closest('.shoe');
    if (!item) return;

    drag = { item: item, pointerId: event.pointerId, moved: false };
    item.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.moved = true;

    var others = Array.prototype.filter.call(shoesList.children, function (node) {
      return node !== drag.item;
    });
    var target = others.find(function (node) {
      var box = node.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });

    if (target) {
      shoesList.insertBefore(drag.item, target);
    } else {
      shoesList.appendChild(drag.item);
    }
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;

    drag.item.classList.remove('is-dragging');
    var moved = drag.moved;
    drag = null;
    if (!moved) return;

    var ids = Array.prototype.map.call(shoesList.children, function (node) {
      return node.dataset.id;
    });
    if (applyOrder(ids)) showToast(t('toast.reordered'));
  }

  // ----------------------------------------------------------------- Export

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var link = el('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // WARNING: Revoke only after the click, otherwise Safari aborts the download.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportCsv() {
    var headers = t('csv.headers').split('|');
    var totals = kilometresByShoe();
    var rows = [];

    state.shoes.forEach(function (shoe) {
      var totalKm = totals.get(shoe.id) || 0;
      var base = [
        shoe.id, shoe.name, shoe.brand, t(shoe.archived ? 'csv.yes' : 'csv.no'),
        shoe.price ? priceFormat.format(shoe.price) : '', shoe.purchaseDate,
        shoe.maxKm, shoe.initialKm, totalKm, Math.max(round1(shoe.maxKm - totalKm), 0)
      ];
      var shoeRuns = runsSorted(shoe.id);

      if (shoeRuns.length === 0) {
        rows.push(base.concat(['', '', '', '']));
      } else {
        shoeRuns.forEach(function (run) {
          rows.push(base.concat([run.id, run.date, run.distance, run.notes]));
        });
      }
    });

    // INFO: German uses decimal comma + semicolon, English dot + comma; the BOM
    // makes Excel detect UTF-8.
    var german = lang === 'de';
    var cell = function (value) {
      var text = typeof value === 'number'
        ? (german ? String(value).replace('.', ',') : String(value))
        : String(value == null ? '' : value);
      return '"' + text.replace(/"/g, '""') + '"';
    };
    var csv = [headers].concat(rows)
      .map(function (row) { return row.map(cell).join(german ? ';' : ','); })
      .join('\r\n');

    download('shoetracker-export-' + todayIso() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8;');
    showToast(t('toast.csv'));
  }

  function exportJson() {
    var backup = {
      app: 'ShoeTracker',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      shoes: state.shoes,
      runs: state.runs
    };
    download('shoetracker-backup-' + todayIso() + '.json', JSON.stringify(backup, null, 2), 'application/json');
    showToast(t('toast.backup'));
  }

  function importJson(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast(t('toast.tooLarge'));
      return;
    }

    file.text()
      .then(function (text) { return normalize(JSON.parse(text)); })
      .then(function (imported) {
        if (imported.shoes.length === 0 && imported.runs.length === 0) {
          showToast(t('toast.emptyBackup'));
          return;
        }
        return askConfirm(
          t('confirm.importTitle'),
          t('confirm.importText', { shoes: imported.shoes.length, runs: imported.runs.length }),
          t('confirm.importOk')
        ).then(function (confirmed) {
          if (!confirmed) return;
          state = imported;
          save();
          ui.detailId = null;
          switchTab(ui.tab);
          showToast(t('toast.restored'));
        });
      })
      .catch(function () {
        showToast(t('toast.invalidBackup'));
      });
  }

  // ------------------------------------------------------------------ Theme

  /** 'light', 'dark' or 'system' (no stored choice, follows the OS). */
  function themeChoice() {
    var theme = document.documentElement.dataset.theme;
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  }

  // WARNING: theme-color values must match --surface of the light/dark palettes in app.css.
  var THEME_COLORS = { light: '#fdf8f8', dark: '#161212' };

  function applyTheme(theme) {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
      storage.remove(THEME_KEY);
      metas.forEach(function (meta, index) {
        var scheme = index === 0 ? 'light' : 'dark';
        meta.media = '(prefers-color-scheme: ' + scheme + ')';
        meta.content = THEME_COLORS[scheme];
      });
      return;
    }
    if (theme !== 'light' && theme !== 'dark') return;
    document.documentElement.dataset.theme = theme;
    storage.write(THEME_KEY, theme);
    metas.forEach(function (meta) {
      meta.removeAttribute('media');
      meta.content = THEME_COLORS[theme];
    });
  }

  // -------------------------------------------------------------------- PWA

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /** Install instructions for browsers without beforeinstallprompt (Safari, Firefox). */
  function installHint() {
    var ua = navigator.userAgent;

    if (location.protocol === 'file:') return t('install.file');
    if (isIos()) return t('install.ios');
    if (/Android/.test(ua)) return t('install.android');
    if (/Firefox\//.test(ua)) return t('install.firefox');
    if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return t('install.safari');
    return t('install.other');
  }

  function setupInstall() {
    var button = byId('install-btn');
    if (isStandalone()) return;

    // INFO: Always shown – Safari/Firefox never fire beforeinstallprompt.
    button.hidden = false;
    installPrompt = window.__installPrompt || null;

    addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      installPrompt = event;
    });

    addEventListener('appinstalled', function () {
      installPrompt = null;
      button.hidden = true;
      showToast(t('toast.installed'));
    });

    button.addEventListener('click', function () {
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.then(function (choice) {
          if (choice.outcome === 'accepted') button.hidden = true;
          installPrompt = null;
        });
        return;
      }
      byId('install-text').textContent = installHint();
      openDialog(byId('dialog-install'));
    });
  }

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js').catch(function () {
      /* App keeps working, just without the offline cache. */
    });

    // INFO: On the very first visit clients.claim() takes control – that is not an update.
    var hadController = Boolean(navigator.serviceWorker.controller);
    var reloading = false;

    function reload() {
      if (reloading) return;
      reloading = true;
      location.reload();
    }

    // WARNING: The new worker activates itself (skipWaiting). Reloading right away
    // would wipe whatever the user is typing just after app start, so reload only
    // when idle, otherwise once the app goes to the background.
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      if (isIdle()) {
        reload();
        return;
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') reload();
      });
    });
  }

  /** No open dialog and no unsaved input in the run form. */
  function isIdle() {
    return !document.querySelector('dialog[open]') &&
      !byId('quick-run-distance').value &&
      !byId('quick-run-notes').value;
  }

  // INFO: Without persistence the browser may evict local data under storage
  // pressure ("best effort"). Installed apps usually get it granted silently.
  function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
    navigator.storage.persisted().then(function (persisted) {
      return persisted || navigator.storage.persist();
    }).catch(function () {
      /* ignore: data is still in localStorage */
    });
  }

  // ----------------------------------------------------------------- Bindings

  function syncFilterChips() {
    byId('filter-active').setAttribute('aria-pressed', String(ui.filter === 'active'));
    byId('filter-archived').setAttribute('aria-pressed', String(ui.filter === 'archived'));
  }

  function bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(function (button) {
      button.addEventListener('click', function () { switchTab(button.dataset.tab); });
    });
    addEventListener('hashchange', function () { switchTab(tabFromHash(), false); });

    // WARNING: WAI-ARIA tabs – inactive tabs are tabindex=-1, so arrows/Home/End are
    // the only keyboard path to them (WCAG 2.1.1).
    document.querySelector('[role="tablist"]').addEventListener('keydown', function (event) {
      var index = TABS.indexOf(ui.tab);
      var next = {
        ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: TABS.length - 1
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      var tab = TABS[(next + TABS.length) % TABS.length];
      switchTab(tab);
      byId('tab-' + tab).focus();
    });

    document.querySelectorAll('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        ui.filter = chip.dataset.filter;
        syncFilterChips();
        renderShoes();
      });
    });

    // INFO: Delegated listeners – one per list instead of one per card.
    shoesList.addEventListener('click', function (event) {
      var open = event.target.closest('[data-open]');
      if (open) openShoeDetail(open.dataset.open);
      var logButton = event.target.closest('[data-log-run]');
      if (logButton) openLogRunDialog(logButton.dataset.logRun);
    });

    shoesList.addEventListener('pointerdown', function (event) {
      var handle = event.target.closest('[data-handle]');
      if (handle) startDrag(event, handle);
    });
    shoesList.addEventListener('pointermove', moveDrag);
    shoesList.addEventListener('pointerup', endDrag);
    shoesList.addEventListener('pointercancel', endDrag);

    shoesList.addEventListener('keydown', function (event) {
      var handle = event.target.closest('[data-handle]');
      if (!handle) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      moveShoeByKeyboard(handle.closest('.shoe').dataset.id, event.key === 'ArrowUp' ? -1 : 1);
    });

    byId('shoe-form').addEventListener('submit', addShoe);
    byId('quick-run-form').addEventListener('submit', logRun);

    byId('detail-runs-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete-run]');
      if (button) deleteRun(button.dataset.deleteRun);
    });
    byId('detail-archive-btn').addEventListener('click', toggleArchive);
    byId('detail-delete-btn').addEventListener('click', deleteShoe);
    byId('detail-edit-btn').addEventListener('click', openEditShoeDialog);
    byId('dialog-shoe-detail').addEventListener('close', function () { ui.detailId = null; });
    byId('dialog-edit-shoe').addEventListener('close', function () { ui.detailId = null; });
    byId('edit-shoe-form').addEventListener('submit', saveEditShoe);

    [
      'add-shoe-btn',
      'empty-action',
      'onboarding-start'
    ].forEach(function (id) {
      byId(id).addEventListener('click', openAddShoeDialog);
    });

    byId('export-csv-btn').addEventListener('click', exportCsv);
    byId('delete-all-btn').addEventListener('click', deleteAllData);
    byId('export-json-btn').addEventListener('click', exportJson);
    byId('import-json-btn').addEventListener('click', function () { byId('import-file').click(); });
    byId('import-file').addEventListener('change', function (event) {
      importJson(event.target.files[0]);
      event.target.value = '';
    });

    ['settings-btn', 'onboarding-settings-btn'].forEach(function (id) {
      byId(id).addEventListener('click', function () {
        syncSettingsForm();
        openDialog(byId('dialog-settings'));
      });
    });
    byId('settings-form').addEventListener('change', function (event) {
      changeSetting(event.target.name, event.target.value);
    });
    byId('settings-form').addEventListener('submit', function (event) { event.preventDefault(); });

    byId('confirm-ok').addEventListener('click', function () { settleConfirm(true); });
    byId('confirm-cancel').addEventListener('click', function () { settleConfirm(false); });
    confirmDialog.addEventListener('close', function () { settleConfirm(false); });

    document.querySelectorAll('dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener('close', function () {
        if (toastElement.parentNode === dialog) document.body.appendChild(toastElement);
      });
    });
    document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
      button.addEventListener('click', function () { closeDialog(button.closest('dialog')); });
    });

    toastElement.addEventListener('click', runToastAction);
    toastElement.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      runToastAction();
    });
  }

  // -------------------------------------------------------------------- Start

  function init() {
    loadSettings();
    load();
    syncOnboarding();
    syncFilterChips();

    bindEvents();
    switchTab(tabFromHash(), false);
    setupInstall();
    setupServiceWorker();
    requestPersistentStorage();
  }

  init();
})();
