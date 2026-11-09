// Fill engine. Injected on demand into every frame of the active tab.
// Exposes window.__HF.run() and window.__HF.teach().
(() => {
  // A tab keeps the copy it was first given even after the extension is reloaded,
  // so a newer build replaces the old one instead of being ignored.
  const BUILD = "2026-11-05.8";
  if (window.__HF && window.__HF.build === BUILD) return;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  const CONTROL_SEL = [
    'input:not([type=hidden],[type=submit],[type=button],[type=file],[type=radio],[type=image],[type=reset],[type=password],[type=search])',
    'textarea', 'select', '[contenteditable=true]', '[role=textbox]:not(input,textarea)',
    'button[aria-haspopup=listbox]', '[role=combobox]:not(input,select)',
  ].join(',');
  // SmartRecruiters' autocomplete lists are <spl-select-option> elements with no role.
  // react-select's older releases draw options with no role, only an id like react-select-3-option-0.
  const OPTION_SEL = '[role=option],spl-select-option,[id^="react-select-"][id*="-option-"]';
  const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,[role=heading],legend';

  // Keys that say which kind of block a field belongs to. Everything else
  // (dates, location, description) can appear in either kind.
  const KIND_OF = {
    company: 'emp', title: 'emp', school: 'edu', degree: 'edu', field: 'edu', gpa: 'edu',
    refName: 'ref', refFirst: 'ref', refLast: 'ref', refTitle: 'ref', refCompany: 'ref',
    refPhone: 'ref', refEmail: 'ref', refRelationship: 'ref',
  };
  // Where a job is, as opposed to what it was. Real on a job block, but on their
  // own they could as easily be the applicant's own details.
  const EMP_PLACE_KEYS = new Set(['city', 'state', 'location', 'empAddress', 'empZip', 'empPhone', 'empArea', 'empCountry']);
  const CONTACT_KEYS = new Set(['firstName', 'lastName', 'fullName', 'email', 'phone', 'address',
    'zip', 'county', 'country', 'linkedin', 'website', 'portfolio', 'github', 'skills']);

  // A heading matching this ends the current block.
  const SECTION_BREAK = /contact|personal|address|education|school|employ|work (history|experience)|experience|skills|references?|certif|licen[sc]e|language|military|veteran|disability|equal|voluntary|demographic|additional|resume|cover letter|links|questions|eligibility/i;
  const SECTION_OF_KIND = {
    emp: /employ|work|experience|job|position|career/i,
    edu: /education|school|degree|qualification|academic/i,
    ref: /reference/i,
  };
  const ADD_SPECIFIC = {
    emp: /\b(employ\w*|work|job|position|experience|role|company)\b/i,
    edu: /\b(education|schools?|degrees?|college|university|qualifications?)\b/i,
    ref: /\breferences?\b/i,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const norm = (s) => String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-[\].:#/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  // Matches in page order, including inside open shadow roots. Sites built
  // from web components (SmartRecruiters) keep every field inside one, where
  // document.querySelectorAll can't see it.
  function deepAll(selector, root = document) {
    const out = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.matches(selector)) out.push(el);
      if (el.shadowRoot) out.push(...deepAll(selector, el.shadowRoot));
    }
    return out;
  }

  // Ids and label[for] only reach within the element's own shadow root.
  const rootOf = (el) => el.getRootNode();
  // A list can live in an outer component's shadow root, so each root up the chain is tried.
  const byId = (el, id) => {
    for (let r = rootOf(el); r; r = r.host ? rootOf(r.host) : null) {
      const hit = r.getElementById && r.getElementById(id);
      if (hit) return hit;
    }
    return document.getElementById(id);
  };

  // The custom element a shadow-root field sits in, or null.
  const hostOf = (el) => rootOf(el).host || null;

  // Some forms (Workable) leave decoy boxes for bots: aria-hidden and out of
  // the tab order. A person never sees them, and filling them garbles the form.
  // Styled radios and checkboxes hide their input the same way, so they don't count.
  const isDecoy = (el) => el.tagName === 'INPUT' && !/^(radio|checkbox)$/.test(el.type)
    && el.getAttribute('aria-hidden') === 'true' && el.tabIndex === -1;

  function activeEl() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  // What an empty dropdown shows, which says nothing about what it asks.
  const PLACEHOLDER = /^(select|choose|enter)[ ...]*$/i;

  // Text of a node without the text of any controls inside it (a <label>
  // wrapping a <select> would otherwise include every option).
  function textOf(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const clone = node.cloneNode(true);
    // Hidden parts don't count: Lever tucks a collapsed "about each option"
    // list inside the Race label, which buried the word "Race".
    const parts = node.querySelectorAll('*');
    if (parts.length < 300 && node.getClientRects().length) {
      const copies = clone.querySelectorAll('*');
      const hidden = [...parts].map((p, i) => (p.getClientRects().length ? null : copies[i])).filter(Boolean);
      hidden.forEach((n) => n.remove());
    }
    clone.querySelectorAll('select,textarea,input,button,script,style').forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function hasControls(node) {
    const sel = `${CONTROL_SEL},input[type=file],input[type=radio]`;
    return node.nodeType === Node.ELEMENT_NODE && (node.matches(sel) || node.querySelector(sel));
  }

  // Short pieces of text just before the element, nearest first, walking up.
  function precedingTexts(el, levels = 4) {
    const out = [];
    let node = el;
    for (let level = 0; level < levels && node && node !== document.body; level++) {
      let sib = node.previousSibling;
      for (let n = 0; sib && n < 4; n++, sib = sib.previousSibling) {
        if (hasControls(sib)) break;
        const t = textOf(sib);
        // A dropdown's own "Select" placeholder is not its label.
        if (t && t.length < 60 && !PLACEHOLDER.test(t)) out.push(t);
      }
      node = node.parentElement;
    }
    return out;
  }

  // Text above a box that sits inside several wrappers of its own, like
  // <div>Label</div><div><div><div><input></div></div></div>. Only climbs while
  // each wrapper holds this one control, so it never borrows a neighbour's label.
  function wrapperLabel(el) {
    const controls = (node) => node.querySelectorAll(`${CONTROL_SEL},input[type=file]`).length;
    let node = el;
    for (let level = 0; level < 6 && node.parentElement && node.parentElement !== document.body; level++) {
      if (controls(node.parentElement) !== 1) return '';
      node = node.parentElement;
      for (let sib = node.previousElementSibling, n = 0; sib && n < 3; sib = sib.previousElementSibling, n++) {
        if (hasControls(sib)) break;
        const t = textOf(sib);
        if (t && t.length < 80 && !PLACEHOLDER.test(t)) return t;
      }
    }
    return '';
  }

  // Rich-text editors are a contenteditable div over a hidden textarea, and
  // the label belongs to the textarea. Looks only where the pair sit alone.
  function backingLabels(el) {
    if (!el.isContentEditable && el.getAttribute('role') !== 'textbox') return [];
    let node = el.parentElement;
    for (let level = 0; level < 6 && node && node !== document.body; level++, node = node.parentElement) {
      if (node.querySelectorAll(`${CONTROL_SEL},input[type=file]`).length > 2) return [];
      const area = node.querySelector('textarea');
      if (!area) continue;
      const labels = ownLabels(area);
      if (labels.length) return labels;
    }
    return [];
  }

  // A label can point at a wrapper around the field rather than the field.
  function ownLabels(el) {
    const labels = [...(el.labels || [])];
    let node = el.parentElement;
    for (let level = 0; level < 5 && node && node !== document.body; level++, node = node.parentElement) {
      if (node.id) labels.push(...rootOf(node).querySelectorAll(`label[for="${CSS.escape(node.id)}"]`));
    }
    return labels;
  }

  // Web components often take their label as an attribute on the outer
  // element, and draw it where nothing points back to the field.
  function hostLabel(el) {
    for (let host = hostOf(el), level = 0; host && level < 3; host = hostOf(host), level++) {
      const t = host.getAttribute('label') || host.getAttribute('aria-label');
      if (t && t.trim()) return t.trim();
    }
    return '';
  }

  function describe(el) {
    const strong = [...ownLabels(el), ...backingLabels(el)].map(textOf);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const n = byId(el, id);
        if (n && n !== el) strong.push(textOf(n));
      }
    }
    for (const attr of ['aria-label', 'title']) {
      if (el.getAttribute(attr)) strong.push(el.getAttribute(attr));
    }
    if (!strong.some(Boolean)) strong.push(hostLabel(el));
    // A placeholder like "Start typing..." doesn't stop us looking for the
    // text beside the field.
    if (!strong.some(Boolean)) strong.push(precedingTexts(el, 3)[0] || wrapperLabel(el));
    const weak = [el.getAttribute('placeholder') || ''];
    if (el.tagName === 'SELECT' && el.options[0] && !el.options[0].value) weak.push(el.options[0].text);
    const humanText = [...strong, ...weak].filter(Boolean).join(' ');
    return { human: norm(humanText), raw: humanText, machine: norm(`${el.name || ''} ${el.id || ''}`) };
  }

  const signature = (el, d) => (d.machine || d.human).replace(/\d+/g, '#');

  const isArea = (el) => el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('role') === 'textbox';

  const START_RE = /\b(start(ed|ing)?|from|beg[ia]n(ning)?|commenc\w*|hired?)\b/;
  const END_RE = /\b(end(ed|ing)?|to|until|through|finish(ed)?|left|leaving|graduat\w*|complet\w*)\b/;

  function sideOf(t) {
    if (START_RE.test(t)) return 'start';
    if (END_RE.test(t)) return 'end';
    return null;
  }

  function dateKeyFrom(t, el) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    // A bare "From*" or "To (Actual or Expected)" is a date, whatever the note says.
    const bare = t.replace(/\(.*?\)/g, ' ').replace(/[\s*\u2731\u2217]+/g, ' ').trim();
    if (/^(from|to)$/.test(bare)) return bare === 'from' ? 'startFull' : 'endFull';
    if (/birth|\bdob\b|availab|earliest|desired|can you|able to|expected|today|signature|applic/.test(t)) return null;
    if (/experience|how many|total|number of|salary|\bpay\b|\bper\b/.test(t)) return null;
    const hasMonth = /\bmm\b|month/.test(t);
    const hasYear = /\byy(yy)?\b|\byear\b/.test(t);
    let part = null;
    if (type === 'date' || type === 'month') part = 'Full';
    else if (hasMonth && hasYear) part = 'Full';
    else if (hasMonth) part = 'Month';
    else if (hasYear) part = 'Year';
    else if (/\bdates?\b/.test(t) || /^(from|to)$/.test(t)) part = 'Full';
    if (!part) return null;
    const side = sideOf(t);
    return side ? `${side}${part}` : `any${part}`;
  }

  function classifyText(t, el) {
    if (!t) return null;
    if (isArea(el)) {
      if (/reason|company description|cover/.test(t)) return null;
      return /description|responsibilit|duties|accomplish|summary|what did you do/.test(t) ? 'description' : null;
    }
    const dateKey = dateKeyFrom(t, el);
    if (dateKey) return dateKey;

    if (/\bgpa\b|grade point|\bgrade\b/.test(t)) return 'gpa';
    if (/\bmajor\b|field of study|area of study|course of study|discipline|concentration/.test(t)) return 'field';
    if (/degree|qualification|level of education|diploma/.test(t)) return 'degree';
    if (/\blocation\b/.test(t) && /school|university|college|institution/.test(t)) return 'location';
    if (/\bschool\b|university|college|institution/.test(t)) return 'school';

    if (/prefer|desired|relocat/.test(t)) return null;
    if (/\bcity\b|\btown\b/.test(t)) return 'city';
    if (/\bstate\b|\bprovince\b/.test(t)) return 'state';
    if (/\blocation\b/.test(t)) return 'location';

    if (!/supervisor|manager|contact|fax|e ?mail|website|\burl\b/.test(t)) {
      if (/\bcountry\b/.test(t)) return 'empCountry';
      if (/area code/.test(t)) return 'empArea';
      if (/\bphone\b|telephone/.test(t)) return 'empPhone';
      if (/line 2|address 2|\bapt\b|suite/.test(t)) return null;
      if (/street|address/.test(t)) return 'empAddress';
      if (/\bzip\b|postal|postcode/.test(t)) return 'empZip';
    }
    if (/phone|address|zip|postal|website|\burl\b|e ?mail|supervisor|manager|contact|reason|salary|wage|\bpay\b|size|industry|may we|applying/.test(t)) return null;
    if (/\b(company|employer|organi[sz]ation|business)\b/.test(t)) return 'company';
    if (/\btitle\b|\bposition\b|\boccupation\b|\brole\b/.test(t)) {
      // "Title: Mr / Ms" in personal details is not a job title.
      if (el.tagName === 'SELECT' && [...el.options].some((o) => /^(mr|mrs|ms|miss|dr)\.?$/i.test(o.text.trim()))) return null;
      return 'title';
    }
    return null;
  }

  // Recognize a bare month or year dropdown from its options alone.
  function keyFromOptions(el) {
    if (el.tagName !== 'SELECT') return null;
    const texts = [...el.options].map((o) => o.text.trim());
    if (texts.filter((t) => /^\d{4}$/.test(t)).length >= 5) return 'anyYear';
    const names = MONTHS.map((m) => m.slice(0, 3).toLowerCase());
    if (texts.filter((t) => names.includes(t.slice(0, 3).toLowerCase())).length >= 12) return 'anyMonth';
    return null;
  }

  function classifyRefText(t) {
    if (!t) return null;
    if (/relationship|how do you know/.test(t)) return 'refRelationship';
    if (/e ?mail/.test(t)) return 'refEmail';
    if (/phone|mobile|\bcell\b/.test(t)) return 'refPhone';
    if (/first name|given name/.test(t)) return 'refFirst';
    if (/last name|surname|family name/.test(t)) return 'refLast';
    if (/company|employer|organi[sz]ation/.test(t)) return 'refCompany';
    if (/\btitle\b|\bposition\b/.test(t)) return 'refTitle';
    if (/\bname\b/.test(t)) return 'refName';
    return null;
  }

  // Links a form can ask for, in the order they're given when one box wants
  // several: portfolio first, since it's the one that matters most.
  const LINK_KINDS = [
    ['portfolio', /portfolio|\breel\b|art ?station/],
    ['website', /website|web site|personal (site|url|page)|\bblog\b/],
    ['github', /git ?hub/],
    ['linkedin', /linked ?in/],
  ];

  // The yearly figure from the profile, so a monthly or hourly box is left alone.
  const SALARY_WORDS = /\b(salary|income|compensation|base pay|remuneration)\b|\bpay (expectation|requirement)|\b(desired|expected|target|minimum) (base|pay|annual)\b/;
  const NOT_YEARLY = /\b(month|monthly|hour|hourly|week|weekly|daily|per day|bonus|equity|current|previous|last)\b/;

  function classifyContactText(t, el) {
    if (t && /cover letter/.test(t) && isArea(el)) return 'coverLetter';
    if (t && SALARY_WORDS.test(t) && /\b(desired|expected|target|minimum|expectations?|requirements?|looking for|seeking)\b/.test(t)
      && !NOT_YEARLY.test(t) && (!isArea(el) || t.length < 60)) return 'salary';
    // A box that mentions a portfolio gets just the portfolio, even when it
    // also offers "personal website" or "other work" as alternatives.
    if (t && /portfolio|\breel\b|art ?station/.test(t) && !/supervisor|manager|reference|emergency/.test(t)) return 'portfolio';
    if (t && !isArea(el)) {
      const kinds = LINK_KINDS.filter(([, re]) => re.test(t)).map(([name]) => name);
      if (kinds.length > 1) return `links:${kinds.join('+')}`;
    }
    if (t && /current (company|employer|organi[sz]ation)/.test(t)) return 'currentCompany';
    if (t && /current (job |role |position )?title|current (position|role)\b/.test(t)) return 'currentTitle';
    if (!t || /supervisor|manager|employer|company|reference|emergency|school/.test(t)) return null;
    if (isArea(el)) {
      if (/\bskills\b/.test(t)) return 'skills';
      // Workable asks for the portfolio link in a big text box.
      if (t.length < 100 && /\b(link|url)\b|portfolio|website|art ?station/.test(t)) {
        const kinds = LINK_KINDS.filter(([, re]) => re.test(t)).map(([name]) => name);
        if (kinds.length > 1) return `links:${kinds.join('+')}`;
        if (kinds.length) return kinds[0];
      }
      return null;
    }
    if (/\bpreferred (first )?name\b|\bnick ?name\b|name you go by|name (you|you d) (like|prefer) to be called/.test(t)) return 'preferredName';
    if (/first name|given name|forename/.test(t)) return 'firstName';
    if (/last name|surname|family name/.test(t)) return 'lastName';
    if (/^(full |your |legal )?name\b/.test(t)) return 'fullName';
    if (/e ?mail/.test(t)) return 'email';
    if (/area code/.test(t)) return 'phoneArea';
    if (/country code|dial(l?ing)? code|calling code|phone ?country/.test(t)) return 'phoneCountry';
    if (/phone|mobile|\bcell\b/.test(t)) return 'phone';
    if (/linked ?in/.test(t)) return 'linkedin';
    if (/portfolio/.test(t)) return 'portfolio';
    if (/git ?hub/.test(t)) return 'github';
    if (/website|personal (site|url)/.test(t)) return 'website';
    if (/line 2|address 2|\bapt\b|suite/.test(t)) return null;
    if (/street|address/.test(t)) return 'address';
    if (/prefer|desired/.test(t)) return null;
    if (/\bcity\b|\btown\b/.test(t)) return 'city';
    if (/\bcounty\b/.test(t)) return 'county';
    if (/\bstate\b|\bprovince\b/.test(t)) return 'state';
    if (/\bzip\b|postal|postcode/.test(t)) return 'zip';
    if (/\bcountry\b/.test(t)) return 'country';
    if (/\bskills\b/.test(t)) return 'skills';
    if (/\blocation\b/.test(t) && !/prefer|desired|relocat|office|work/.test(t)) return 'location';
    return null;
  }

  // "What is your full name?" is a plain label worded as a question; longer or
  // wider questions are screening questions and carry no contact label.
  const SIMPLE_ASK = /^\s*(?:what(?:'s|’s| is| are)|please enter|enter)\s+your\s+([^?]{2,40})\??[\s*✱∗]*/i;
  const humanOf = (d) => {
    const ask = d.raw.match(SIMPLE_ASK);
    if (ask && d.raw.split('?').length <= 2) return norm(ask[1]);
    return d.raw.length > 60 || d.raw.includes('?') ? '' : d.human;
  };

  // The section a heading starts. Headings like "Apply for this job" name no
  // section but still end one, so "Experience" in a job ad above the form
  // doesn't swallow the form.
  function sectionAfter(node, text, section) {
    if (!text || text.length >= 60) return section;
    if (SECTION_BREAK.test(text)) return sectionOf(text);
    return node.matches('h1,h2,h3') ? 'other' : section;
  }

  function sectionOf(text) {
    if (SECTION_OF_KIND.ref.test(text)) return 'ref';
    if (SECTION_OF_KIND.edu.test(text)) return 'edu';
    if (SECTION_OF_KIND.emp.test(text)) return 'emp';
    return 'other';
  }

  function classify(el, siteMap, section) {
    const d = describe(el);
    const mapped = siteMap && siteMap[signature(el, d)];
    if (mapped) return mapped === 'ignore' ? null : mapped;

    if (el.type === 'checkbox') {
      if (section === 'ref') return null;
      return /\b(current|currently|present|still (work|employ|attend))\b/.test(`${d.human} ${d.machine}`) ? 'current' : null;
    }
    // Long or question-style labels are screening questions, not history fields.
    const human = humanOf(d);
    if (section === 'ref' || /\breferences?\b/.test(`${human} ${d.machine}`)) {
      return classifyRefText(human) || classifyRefText(d.machine);
    }
    let key = classifyText(human, el) || classifyText(d.machine, el) || keyFromOptions(el);
    if (key && key.startsWith('any')) {
      const part = key.slice(3);
      let side = sideOf(d.machine);
      if (!side) {
        const groups = [];
        const fs = el.closest('fieldset');
        if (fs && fs.querySelector('legend')) groups.push(textOf(fs.querySelector('legend')));
        const group = el.closest('[role=group]');
        if (group) {
          const label = group.getAttribute('aria-label')
            || textOf(byId(el, group.getAttribute('aria-labelledby')) || document.createTextNode(''));
          if (label) groups.push(label);
        }
        for (const t of [...groups, ...precedingTexts(el)]) {
          side = sideOf(norm(t));
          if (side) break;
        }
      }
      if (side) key = `${side}${part}`;
    }
    return key;
  }

  // Walk the page in document order and cut it into blocks: a block ends when
  // a field key repeats, when the kind changes, or at a section heading.
  function scan(siteMap) {
    const blocks = [];
    let cur = null;
    let section = null;
    const begin = () => {
      cur = { kind: null, section, fields: {}, order: [] };
      blocks.push(cur);
    };
    for (const node of deepAll(`${CONTROL_SEL},${HEADING_SEL}`)) {
      // react-select leaves a hidden "required" box beside each dropdown; it would
      // read as a second School and cut the real one off from its block.
      if (node.closest('[data-hf-ui]') || !isVisible(node) || isDecoy(node)) continue;
      if (node.matches(HEADING_SEL) && !node.matches(CONTROL_SEL)) {
        const t = textOf(node);
        // "Employment dates" inside a job shouldn't split it; only a change of
        // section ends the block.
        const next = sectionAfter(node, t, section);
        if (next !== section || (next === 'other' && SECTION_BREAK.test(t))) cur = null;
        section = next;
        continue;
      }
      let key = classify(node, siteMap, section);
      if (key && CONTACT_KEYS.has(key)) key = null;
      if (key && EMP_PLACE_KEYS.has(key) && section !== 'emp' && section !== 'edu' && !(cur && cur.kind)) key = null;
      if (!key) {
        // An unrelated field before any employer/school field means the
        // location or date we were holding belongs to something else.
        if (cur && !cur.kind) cur = null;
        continue;
      }
      if (key.startsWith('any')) {
        const part = key.slice(3);
        const f = cur ? cur.fields : {};
        key = !f[`start${part}`] ? `start${part}` : !f[`end${part}`] ? `end${part}` : `start${part}`;
      }
      const kind = KIND_OF[key] || null;
      if (!cur || cur.fields[key] || (kind && cur.kind && cur.kind !== kind)) begin();
      cur.fields[key] = node;
      cur.order.push(key);
      if (kind) cur.kind = kind;
    }
    const anchored = {
      emp: (f) => f.company || f.title,
      edu: (f) => f.school || f.degree,
      ref: (f) => f.refName || f.refFirst,
    };
    return blocks.filter((b) => {
      if (!b.kind || !anchored[b.kind](b.fields)) return false;
      // Location doesn't count: "City" next to "Current company" in personal
      // details is not a job.
      const core = b.order.filter((k) => !EMP_PLACE_KEYS.has(k));
      if (core.length < 2) return false;
      if (b.kind !== 'emp' || b.section === 'emp') return true;
      // Outside an employment section, a job has to have dates or a description.
      return core.some((k) => k === 'description' || /^(start|end)/.test(k));
    });
  }

  const scanKind = (kind, siteMap) => scan(siteMap).filter((b) => b.kind === kind);

  // Page order. Nodes in different shadow roots are compared by the outer
  // elements that hold them, since the browser won't order them directly.
  function isBefore(a, b) {
    const chain = (n) => {
      const out = [n];
      for (let h = hostOf(n); h; h = hostOf(h)) out.push(h);
      return out;
    };
    const ca = chain(a);
    const cb = chain(b);
    for (const x of ca) {
      const y = cb.find((n) => rootOf(n) === rootOf(x));
      if (!y) continue;
      // One sits inside the other's component; the component comes first.
      if (x === y) return a === x;
      return !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    }
    return false;
  }

  function nearestSectionHeading(el) {
    let found = null;
    for (const h of deepAll(HEADING_SEL)) {
      if (!isBefore(h, el)) break;
      const t = textOf(h);
      if (isVisible(h) && t.length < 60 && SECTION_BREAK.test(t)) found = t;
    }
    return found;
  }

  // "Add", "Add another", or "Add another education" (sites name the section).
  const ADD_TEXT = /^\W*add( another| more| new)?( entry| item| row| section| one| education| school| degree| employer| employment| job| position| experience| reference)?\W*$/i;
  const parentOf = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  const buttonText = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.textContent || '')
    .replace(/\s+/g, ' ').trim();
  // SmartRecruiters draws every button as <spl-button aria-label="Save experience entry">Save</spl-button>:
  // the real <button> is inside its shadow root and holds no text.
  const BTN_SEL = 'button,[role=button],input[type=button],spl-button';
  const isOff = (b) => b.disabled || b.getAttribute('aria-disabled') === 'true'
    || (b.hasAttribute('disabled') && b.getAttribute('disabled') !== 'false');
  const visibleLabel = (b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();

  // Sites that draw a section as a row ("Experience" ... [+ Add]) often use a
  // plain div for the title, so there is no heading to find. Walk up from the
  // button and take the short text that shares its row. Stop as soon as the
  // row would also hold another Add button, since then it isn't this one's.
  function rowLabel(el, adds) {
    let node = el;
    for (let i = 0; i < 5 && node; i++, node = parentOf(node)) {
      const box = parentOf(node);
      if (!box || adds.some((o) => o !== el && box.contains(o))) return null;
      const own = textOf(box).replace(/\+?\s*\badd\b\s*/gi, ' ').replace(/\s+/g, ' ').trim();
      if (own && own.length < 60) return own;
      const prev = node.previousElementSibling;
      const t = prev && !hasControls(prev) ? textOf(prev) : '';
      if (t && t.length < 60) return t;
    }
    return null;
  }

  // Every Add-looking thing on the page. `loose` also takes plain divs and
  // spans that act as buttons, which sites without real buttons use.
  // `anyState` keeps Add buttons that are greyed out for the moment (many
  // sites lock Add while an entry is open or still saving), for finding which
  // part of the page a section lives in.
  function addCandidates(loose, anyState) {
    const out = [];
    const seen = new Set();
    const push = (el) => {
      if (seen.has(el) || el.closest('[data-hf-ui]') || !isVisible(el)) return;
      if (!anyState && isOff(el)) return;
      seen.add(el);
      out.push(el);
    };
    for (const el of deepAll(`${BTN_SEL},a,[role=link]`)) {
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (href && !/^(#|javascript:)/.test(href)) continue; // would navigate away
      }
      push(el);
    }
    if (loose) {
      for (const el of deepAll('div,span,li,p,label')) {
        if (!ADD_TEXT.test(textOf(el)) || [...el.children].some((c) => ADD_TEXT.test(textOf(c)))) continue;
        if (out.some((c) => c.contains(el))) continue; // the label of a button already listed
        // The click target is the nearest thing that looks pressable.
        push(el.closest('[tabindex],[onclick],[role]') || el);
      }
    }
    return out;
  }

  function findAdd(kind, blocks, loose, anyState) {
    const last = blocks.length ? blocks[blocks.length - 1] : null;
    const lastEl = last ? last.fields[last.order[last.order.length - 1]] : null;
    const specific = [];
    const generic = [];
    const all = addCandidates(loose, anyState);
    const adds = all.filter((el) => ADD_TEXT.test(buttonText(el)) || /^\+$/.test(buttonText(el)));
    for (const el of all) {
      const text = buttonText(el);
      if (!text || text.length > 50) continue;
      if (/resume|\bcv\b|cover|file|attach|link|skill|language|certif|save|submit|apply/i.test(text)) continue;
      if (kind !== 'ref' && /reference/i.test(text)) continue;
      if (/\badd\b/i.test(text) && ADD_SPECIFIC[kind].test(text)) {
        specific.push(el);
      } else if (adds.includes(el)) {
        const row = rowLabel(el, adds);
        const heading = row && SECTION_BREAK.test(row) ? row : nearestSectionHeading(el);
        const inSection = heading ? SECTION_OF_KIND[kind].test(heading) : !!lastEl && isBefore(lastEl, el);
        if (inSection) generic.push(el);
      }
    }
    const pick = (list) => (lastEl && list.find((el) => isBefore(lastEl, el))) || list[0];
    return pick(specific) || pick(generic) || (loose ? null : findAdd(kind, blocks, true, anyState));
  }

  function realClick(el) {
    el.scrollIntoView({ block: 'center' });
    const opts = { bubbles: true, cancelable: true, composed: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function waitFor(test, ms) {
    return new Promise((resolve) => {
      const first = test();
      if (first) return resolve(first);
      const finish = (v) => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(v);
      };
      const observer = new MutationObserver(() => {
        const v = test();
        if (v) finish(v);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => finish(test() || null), ms);
    });
  }

  // Frameworks track .value on the element, so go through the prototype setter
  // and fire the events a real keystroke would.
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  function setText(el, value) {
    el.focus();
    setNativeValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  function matchOption(texts, candidates, strict) {
    // "Bachelor's Degree" and "Bachelors" should meet, so apostrophes don't count.
    const nz = (t) => norm(t).replace(/['’`]/g, '');
    const lower = texts.map((t) => nz(t));
    // Country lists often read "🇺🇸 (+1) United States"; compare the bare name too.
    // Some lists (react-select country pickers) read "United StatesUnited States+1":
    // the name twice, then the code. Drop the code and the repeat.
    const plain = (t) => {
      const words = nz(String(t).replace(/^[^\p{L}\p{N}(+]+/u, '').replace(/\(\+[\d\s]+\)\s*/, '')).replace(/\s*\+\d+$/, '').split(' ');
      const half = words.length / 2;
      if (Number.isInteger(half) && half > 0 && words.slice(0, half).join(' ') === words.slice(half).join(' ')) return words.slice(0, half).join(' ');
      // The name twice with no space between ("United StatesUnited States").
      const glued = /^(.{3,}?)\s*\1$/.exec(words.join(' '));
      return glued ? glued[1] : words.join(' ');
    };
    const bare = texts.map(plain);
    const words = candidates.filter((c) => typeof c === 'string');
    for (const c of words) {
      const i = lower.indexOf(nz(c));
      if (i >= 0) return i;
    }
    for (const c of words) {
      const i = bare.indexOf(nz(c));
      if (i >= 0) return i;
    }
    // Patterns say what an answer means, for wordings nobody listed.
    for (const c of candidates) {
      if (c instanceof RegExp) {
        const i = bare.findIndex((t) => c.test(t));
        if (i >= 0) return i;
      }
    }
    if (strict) return -1;
    for (const c of words) {
      const n = nz(c);
      if (n.length < 4 || /^\d+$/.test(n)) continue;
      let i = lower.findIndex((t) => t.startsWith(n) || n.startsWith(t) && t.length >= 4);
      if (i < 0) i = lower.findIndex((t) => t.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  }

  function setSelect(el, candidates, strict) {
    const options = [...el.options];
    let i = matchOption(options.map((o) => o.text), candidates, strict);
    if (i < 0) i = matchOption(options.map((o) => o.value), candidates, strict);
    if (i < 0) return false;
    el.focus();
    setNativeValue(el, options[i].value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  }

  // Types into a search-as-you-type box the way a person would, one key at a
  // time, so the site's own handlers see each character and offer suggestions.
  // Setting .value in one go leaves many of these boxes thinking they're empty.
  function typeKeys(el, text) {
    el.focus();
    setNativeValue(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    let shown = '';
    for (const ch of String(text)) {
      const key = { key: ch, bubbles: true, composed: true };
      el.dispatchEvent(new KeyboardEvent('keydown', key));
      shown += ch;
      setNativeValue(el, shown);
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ch, bubbles: true, composed: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', key));
    }
  }

  // The text is staying as typed (nothing in the list matched): commit it the
  // way leaving the box would, without Escape, which cancels it in most of
  // these widgets.
  async function keepTyped(el, text) {
    if (norm(el.value) !== norm(text)) typeKeys(el, text);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(60);
    // Leaving the box commits it. When the browser window itself isn't
    // focused, blur() fires nothing, so send the events ourselves.
    let left = false;
    const note = () => { left = true; };
    el.addEventListener('blur', note, { once: true });
    el.blur();
    el.removeEventListener('blur', note);
    if (!left) {
      el.dispatchEvent(new FocusEvent('blur', { composed: true }));
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    }
    await sleep(80);
    // A list still hanging open is closed by clicking somewhere neutral.
    const listId = el.getAttribute('aria-controls');
    const list = listId && byId(el, listId);
    if (list && [...list.querySelectorAll(OPTION_SEL)].some(isVisible)) {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    return !!el.value.trim();
  }

  // Opens a custom dropdown and clicks the option that matches. Many of these
  // redraw their list as you type, so options are read again after the typing
  // settles; the ones read before it are gone from the page by then.
  async function pickFromListbox(el, candidates, typed, strict, fallback) {
    const result = await pickOpen(el, candidates, typed, strict, fallback);
    await closeList(el);
    return result;
  }

  // Leaves the dropdown shut and the cursor out of it, so the next click or key
  // press on the page behaves normally.
  async function closeList(el) {
    await sleep(60);
    if (activeEl() === el) el.blur();
    await sleep(60);
    const listId = el.getAttribute('aria-controls');
    const list = listId && byId(el, listId);
    const stillOpen = el.getAttribute('aria-expanded') === 'true'
      || !!(list && [...list.querySelectorAll(OPTION_SEL)].some(isVisible));
    if (stillOpen) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await sleep(60);
      if (activeEl() === el) el.blur();
    }
  }

  async function pickOpen(el, candidates, typed, strict, fallback) {
    const owned = () => {
      const id = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      const list = id && byId(el, id);
      if (list) return [...list.querySelectorAll(OPTION_SEL)].filter(isVisible);
      // No link to its list: take the nearest options, so another dropdown's
      // list that's still open can't answer for this one.
      let node = el.parentElement;
      for (let level = 0; level < 4 && node; level++, node = node.parentElement) {
        if (node.querySelectorAll('input[role=combobox]').length > 1) break;
        const near = [...node.querySelectorAll(OPTION_SEL)].filter(isVisible);
        if (near.length) return near;
      }
      // Lists are often drawn elsewhere on the page. Skip any sitting right
      // beside a different dropdown.
      const besideOther = (option) => {
        let up = option.parentElement;
        for (let level = 0; level < 2 && up && up !== document.body; level++, up = up.parentElement) {
          const other = up.querySelector('input[role=combobox]');
          if (other && other !== el) return true;
        }
        return false;
      };
      return deepAll(OPTION_SEL).filter((o) => isVisible(o) && !besideOther(o));
    };
    const choose = async (list, cands = candidates, strictly = strict) => {
      const i = matchOption(list.map((o) => o.innerText || o.textContent), cands, strictly);
      if (i < 0) return false;
      // <spl-select-option> picks on a plain click; the full pointer sequence
      // leaves its menu open with the text typed but nothing chosen.
      if (list[i].matches('spl-select-option')) list[i].click();
      else realClick(list[i]);
      await sleep(80);
      return true;
    };
    const type = (text) => typeKeys(el, text);

    realClick(el);
    const typing = el.tagName === 'INPUT' && typed;
    // Some lists stay empty until you type, so don't wait long if we can type.
    const opened = await waitFor(() => {
      const o = owned();
      return o.length ? o : null;
    }, typing ? 500 : 1500);
    if (typing) {
      type(typed);
      // Some lists (job titles) take a second or more to come back with options.
      // Lists that search as you type first show the old list, then the filtered
      // one. Clicking the old list's entry does nothing, so wait until the list
      // stops changing (twice the same) before choosing.
      let before = null;
      for (let tries = 0; tries < 12; tries++) {
        await sleep(350);
        const now = owned();
        const seen = now.map((o) => o.textContent).join('|');
        const settled = seen === before || tries >= 4;
        before = seen;
        if (settled && await choose(now)) return true;
      }
      // The typed text may match nothing the way the site spells it, so try
      // the full list.
      type('');
      await sleep(350);
      if (await choose(owned())) return true;
      // The site may spell it another way we know ("USA" for United States, "Georgia"
      // for GA): type those too, since long lists only show what matches the typing.
      const others = candidates.filter((c) => typeof c === 'string' && c.length > 1 && norm(c) !== norm(typed)).slice(0, 3);
      // These lists can take a second or more to filter, so keep looking for a while.
      for (const other of others) {
        type(other);
        for (let tries = 0; tries < 8; tries++) {
          await sleep(350);
          if (await choose(owned())) return true;
        }
      }
      // Some lists (SuccessFactors) drop their options when the typed text matches
      // nothing and don't bring them back when it's cleared: close, open again
      // without typing, and choose from the whole list.
      {
        if (others.length) {
          type('');
          await sleep(200);
        }
        el.blur();
        await sleep(300);
        realClick(el);
        const reopened = await waitFor(() => {
          const o = owned();
          return o.length ? o : null;
        }, 1500);
        if (reopened && await choose(reopened)) return true;
        if (reopened && fallback && await choose(reopened, fallback, true)) return true;
        // Long lists only show their first part, so "Others" may be out of sight: type it.
        if (fallback) {
          type(fallback[0]);
          for (let tries = 0; tries < 8; tries++) {
            await sleep(350);
            if (await choose(owned(), fallback, true)) return true;
          }
        }
      }
      // Nothing like it in the full list: take the fallback ("Other") from the same open list.
      if (fallback && await choose(owned(), fallback, true)) return true;
    } else if (opened && await choose(opened)) {
      return true;
    } else if (opened && fallback && await choose(opened, fallback, true)) {
      return true;
    }
    const esc = { key: 'Escape', code: 'Escape', bubbles: true };
    el.dispatchEvent(new KeyboardEvent('keydown', esc));
    return false;
  }

  // Hints are checked one at a time: a label and placeholder that both say
  // "MM/YYYY" would otherwise read as one "MM/YYYY MM/YYYY" format.
  function formatDate(iso, ...hints) {
    const [y, m] = iso.split('-');
    const match = hints.map((h) => /(?:yyyy|yy|mmm|mm|dd)(?:[/\-. ]+(?:yyyy|yy|mmm|mm|dd))+/i.exec(h || '')).find(Boolean);
    if (!match) return `${m}/${y}`;
    return match[0].replace(/yyyy|yy|mmm|mm|dd/gi, (tok) => {
      switch (tok.toLowerCase()) {
        case 'yyyy': return y;
        case 'yy': return y.slice(2);
        case 'mmm': return MONTHS[Number(m) - 1].slice(0, 3);
        case 'mm': return m;
        default: return '01';
      }
    });
  }

  function valueFor(key, item, block) {
    const dm = /^(start|end)(Full|Month|Year)$/.exec(key);
    if (dm) {
      const [, side, part] = dm;
      const iso = item[side];
      if (!iso || (side === 'end' && item.current)) return null;
      return { date: iso, part };
    }
    if (key.startsWith('ref')) {
      const name = (item.name || '').trim();
      const space = name.indexOf(' ');
      if (key === 'refFirst') return name ? { text: space > 0 ? name.slice(0, space) : name } : null;
      if (key === 'refLast') return space > 0 ? { text: name.slice(space + 1) } : null;
      if (key === 'refName') return name ? { text: name } : null;
      const v = item[key.slice(3).toLowerCase()];
      return v ? { text: String(v) } : null;
    }
    const parts = (item.location || '').split(',').map((s) => s.trim());
    const city = item.city || parts[0];
    const state = item.state || parts[1];
    if (key === 'city') return city ? { text: city } : null;
    if (key === 'state') return state ? { text: state, alts: altsFor('state', state) } : null;
    if (key === 'location') {
      const place = [item.city, item.state].filter(Boolean).join(', ') || item.location;
      return place ? { text: place } : null;
    }
    if (key === 'empAddress') return item.address ? { text: item.address } : null;
    if (key === 'empZip') return item.zip ? { text: item.zip } : null;
    if (key === 'empCountry') return item.country ? { text: item.country, alts: altsFor('country', item.country) } : null;
    if (key === 'empArea' || key === 'empPhone') {
      const digits10 = String(item.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      const us = digits10.length === 10;
      if (key === 'empArea') return us ? { text: digits10.slice(0, 3) } : null;
      if (us && block && block.fields.empArea) return { text: `${digits10.slice(3, 6)}-${digits10.slice(6)}` };
      return item.phone ? { text: item.phone } : null;
    }
    // A dropdown of fields of study that doesn't list this one gets "Other".
    // With nothing written in the profile, a dropdown still gets "Other"; a typing box is left alone.
    if (key === 'field') return item.field ? { text: String(item.field), other: true } : { text: 'Other', other: true, listOnly: true, strict: true };
    return item[key] ? { text: String(item[key]) } : null;
  }

  function isEmpty(el) {
    // A picker that shows only a flag has no text, so remember what we chose.
    if (el.dataset && el.dataset.hfPicked) return false;
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return !o || !o.value || /^\W*(select|choose|please|month|year)/i.test(o.text);
    }
    // A phone box that shows only its country code ("+1") has no number yet.
    if (el.tagName === 'INPUT' && el.type === 'tel' && /^\+\d{1,3}\s*$/.test(el.value.trim())) return true;
    // A dropdown box showing "No Selection" or "Select…" has nothing chosen.
    if (el.tagName === 'INPUT' && el.getAttribute('role') === 'combobox' && /^\W*(no selection|select|choose|please select)\b[\s.\u2026]*$/i.test(el.value.trim())) return true;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return !el.value.trim();
    const t = (el.innerText || el.textContent || '').trim();
    return !t || (el.tagName === 'BUTTON' && /^(select|choose)/i.test(t));
  }

  const opensPicker = (el) => el.tagName === 'BUTTON'
    && !!el.getAttribute('aria-haspopup') && el.getAttribute('aria-haspopup') !== 'false';

  const isListboxWidget = (el) => el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA'
    && (opensPicker(el) || el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox' || el.getAttribute('aria-autocomplete') === 'list');

  function textToHtml(text) {
    const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
      .map((para) => `<p>${para.split('\n').map(escape).join('<br>')}</p>`).join('');
  }

  // The flatpickr instance behind a date box, or null. It hangs off the
  // calendar's wrapper element, which can be the box's ancestor or sit beside it.
  function flatpickrOf(el) {
    if (el._flatpickr) return el._flatpickr;
    for (let n = el; n; n = parentOf(n)) {
      if (n._flatpickr) return n._flatpickr;
    }
    const root = rootOf(el);
    const hit = root.querySelectorAll && [...root.querySelectorAll('*')].find((n) => n._flatpickr
      && (n._flatpickr.input === el || n._flatpickr._input === el || n.contains(el)));
    return hit ? hit._flatpickr : null;
  }

  function autocompleteHost(el) {
    for (let r = el.getRootNode(); r && r.host; r = r.host.getRootNode()) {
      if (r.host.tagName === 'SPL-AUTOCOMPLETE') return r.host;
    }
    return null;
  }

  // Backup for SmartRecruiters' search boxes: the background worker types and
  // picks the suggestion from inside the page itself.
  async function pickInPageWorld(el, text) {
    if (typeof chrome === 'undefined' || !chrome.runtime) return false;
    el.setAttribute('data-hf-pick', '1');
    let reply = null;
    try {
      reply = await chrome.runtime.sendMessage({ action: 'pickInPage', text });
    } catch (e) { /* nothing more to try */ }
    el.removeAttribute('data-hf-pick');
    return !!(reply && reply.ok);
  }

  // Date pickers built on react-datepicker (Phenom, CHOA) ignore typed text.
  // The popup beside the box takes a year from its list and a month by click,
  // or just a year from a grid.
  // Returns true or false once it has tried, or null when this isn't one.
  async function pickMonthInCalendar(el, year, month) {
    const wrap = el.closest('.react-datepicker-wrapper');
    if (!wrap) return null;
    const popup = () => {
      const next = wrap.nextElementSibling;
      return next && next.matches('.react-datepicker-popper') ? next : null;
    };
    const click = (node) => {
      for (const type of ['mousedown', 'mouseup', 'click']) {
        node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    };
    const ready = () => popup() && popup().querySelector('.react-datepicker__month-0, .react-datepicker__year-text');
    el.focus();
    for (let i = 0; i < 8 && !ready(); i++) {
      if (i % 3 === 0) click(el);
      await sleep(100);
    }
    const box = popup();
    if (!box || !ready()) return null;
    // Some boxes (school dates) ask for the year alone: a grid of twelve years,
    // paged with Previous and Next until the one wanted shows.
    if (!box.querySelector('.react-datepicker__month-0')) {
      for (let step = 0; step < 14; step++) {
        const open = popup();
        if (!open) return false;
        const cells = [...open.querySelectorAll('.react-datepicker__year-text')];
        const hit = cells.find((c) => c.textContent.trim() === String(year) && !/--disabled/.test(c.className));
        if (hit) {
          click(hit);
          await sleep(250);
          return !!el.value.trim();
        }
        const shown = cells.map((c) => parseInt(c.textContent, 10)).filter(Boolean);
        const turn = open.querySelector(year < Math.min(...shown) ? '.react-datepicker__navigation--previous' : '.react-datepicker__navigation--next');
        if (!turn) return false;
        click(turn);
        await sleep(150);
      }
      return false;
    }
    const years = box.querySelector('select');
    if (years) {
      if (![...years.options].some((o) => o.value === String(year))) {
        el.blur();
        return false;
      }
      setNativeValue(years, String(year));
      years.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(150);
    }
    const cell = (popup() || box).querySelector(`.react-datepicker__month-${month - 1}`);
    if (!cell) return false;
    click(cell);
    await sleep(200);
    return !!el.value.trim();
  }

  // Returns true when the value was set, false when it needs a human.
  async function fillField(el, value) {
    let text = value.text;
    let candidates = text ? [text, ...(value.alts || [])] : [];
    let typed = value.typed || text;
    if (value.date) {
      const [y, m] = value.date.split('-');
      const name = MONTHS[Number(m) - 1];
      if (value.part === 'Month') {
        text = m;
        candidates = [name, name.slice(0, 3), m, String(Number(m))];
        typed = name;
      } else if (value.part === 'Year') {
        text = y;
        candidates = [y];
        typed = y;
      } else if (el.type === 'date') {
        text = `${y}-${m}-01`;
      } else if (el.type === 'month') {
        text = `${y}-${m}`;
      } else {
        const d = describe(el);
        text = formatDate(value.date, el.getAttribute('placeholder'), d.raw);
        candidates = [text];
        typed = text;
      }
    }

    // Month pickers built on flatpickr (SmartRecruiters) ignore typing; the
    // calendar object is told the date directly and fires the site's handlers.
    if (value.date && el.tagName === 'INPUT' && value.part === 'Full') {
      const [y, m] = value.date.split('-');
      const picked = await pickMonthInCalendar(el, Number(y), Number(m));
      if (picked !== null) return picked;
      const fp = flatpickrOf(el);
      if (fp) {
        fp.setDate(new Date(Number(y), Number(m) - 1, 1), true);
        await sleep(60);
        return !!el.value;
      }
      // This script runs in the extension's own world, which can't see the
      // calendar object the page hung on its elements. The background worker
      // runs the same call inside the page.
      if (/flatpickr/.test(el.className) && typeof chrome !== 'undefined' && chrome.runtime) {
        el.setAttribute('data-hf-date', '1');
        let reply = null;
        try {
          reply = await chrome.runtime.sendMessage({ action: 'setDateMain', year: Number(y), month: Number(m) });
        } catch (e) { /* falls through to typing */ }
        el.removeAttribute('data-hf-date');
        if (reply && reply.ok) {
          await sleep(60);
          return true;
        }
      }
    }
    if (value.listOnly && el.tagName !== 'SELECT' && !isListboxWidget(el)) return false;
    if (el.tagName === 'SELECT') return setSelect(el, candidates, value.strict) || (!!value.other && setSelect(el, ['Other', 'Others'], true));
    if (isListboxWidget(el)) {
      const picked = await pickFromListbox(el, candidates, typed, value.strict, value.other ? ['Other', 'Others', 'Other (not listed)', 'Not listed'] : null);
      // SmartRecruiters reflects a committed choice onto the <spl-autocomplete>'s
      // value attribute. Text sitting in the box without it is not saved.
      const acHost = autocompleteHost(el);
      if (acHost && text && !acHost.getAttribute('value')) {
        if (await pickInPageWorld(el, text)) return true;
        console.warn('[History Filler] autocomplete did not commit:', text, acHost.getAttribute('label'));
      }
      if (picked) return true;
      // Typeahead with no match: a job or school the site doesn't list is
      // entered as typed. A personal answer isn't worth leaving half-typed,
      // so that one is cleared.
      if (el.tagName === 'INPUT' && !value.strict && text) return keepTyped(el, text);
      if (el.tagName === 'INPUT') setText(el, '');
      // Give the list a moment to close before the next field opens its own.
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await sleep(150);
      return false;
    }
    if (el.isContentEditable || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
      el.focus();
      document.execCommand('selectAll');
      // Blank lines start a new paragraph and single line breaks stay inside it,
      // so a letter keeps the layout it was written with.
      const multi = /\n/.test(text);
      const ok = document.execCommand(multi ? 'insertHTML' : 'insertText', false, multi ? textToHtml(text) : text);
      if (!ok) el.textContent = text;
      el.blur();
      return (el.textContent || '').trim().length > 0;
    }
    if (el.disabled || el.readOnly) return false;
    setText(el, text);
    return true;
  }

  const digits = (s) => String(s).replace(/\D/g, '');

  function mark(el, ok) {
    el.dataset.hfMarked = '1';
    el.dataset.hfOk = ok ? '1' : '0';
    el.style.outline = `2px solid ${ok ? '#2e9e5b' : '#e0932b'}`;
    el.style.outlineOffset = '1px';
    el.addEventListener('focus', () => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, { once: true });
  }

  const KEY_LABEL = {
    company: 'Company', title: 'Job title', location: 'Location', city: 'City', state: 'State',
    description: 'Description', current: 'Currently here', school: 'School', degree: 'Degree',
    field: 'Field of study', gpa: 'GPA', startFull: 'Start date', startMonth: 'Start month',
    startYear: 'Start year', endFull: 'End date', endMonth: 'End month', endYear: 'End year',
    refName: 'Reference name', refFirst: 'Reference first name', refLast: 'Reference last name',
    refTitle: 'Reference title', refCompany: 'Reference company', refPhone: 'Reference phone',
    refEmail: 'Reference email', refRelationship: 'Reference relationship',
    firstName: 'First name', preferredName: 'Preferred name', lastName: 'Last name', fullName: 'Full name', email: 'Email',
    empAddress: 'Employer street address', empZip: 'Employer ZIP', empPhone: 'Employer phone',
    empArea: 'Employer area code', empCountry: 'Employer country',
    phone: 'Phone', phoneArea: 'Phone area code', phoneCountry: 'Phone country code', address: 'Street address', zip: 'ZIP / postal code', county: 'County', country: 'Country',
    linkedin: 'LinkedIn', website: 'Website', portfolio: 'Portfolio', github: 'GitHub', skills: 'Skills',
    currentCompany: 'Current company', currentTitle: 'Current job title',
    coverLetter: 'Cover letter', salary: 'Desired salary',
  };
  const KIND_WORD = {
    emp: ['Employer', 'employers'],
    edu: ['School', 'schools'],
    ref: ['Reference', 'references'],
  };

  const MAX_PASSES = 4;
  const isDropdown = (el) => el.tagName === 'SELECT' || isListboxWidget(el);

  // Waits briefly for the page to add or remove fields after an answer.
  function settle() {
    const count = () => deepAll(CONTROL_SEL).filter(isVisible).length;
    const before = count();
    return waitFor(() => count() !== before, 1200);
  }

  async function fillBlock(block, item, opts, res, rescan) {
    const prefix = `${KIND_WORD[opts.kind][0]} ${res.blocks + 1}`;

    // The checkbox goes first: it can add or remove the end-date fields.
    const box = block.fields.current;
    if (box) {
      if (box.checked !== !!item.current) {
        realClick(box);
        await sleep(120);
        block = rescan() || block;
      }
      if (item.current) mark(block.fields.current || box, true);
    }

    // Choosing a country can add a State field, so look again after a dropdown.
    const done = new Map();
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let usedDropdown = false;
      if (pass) block = rescan() || block;
      for (const key of block.order) {
        if (key === 'current') continue;
        const el = block.fields[key];
        if (!el || !el.isConnected || done.get(key) === el) continue;
        const value = valueFor(key, item, block);
        if (!value) continue;
        done.set(key, el);
        if (!opts.overwrite && !isEmpty(el)) {
          res.skipped++;
          continue;
        }
        let ok = false;
        try {
          ok = await fillField(el, value);
        } catch (e) {
          ok = false;
        }
        if (ok && !isListboxWidget(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          // A controlled input that rejected the value snaps back. Masks may
          // reformat it, so only the digits or a non-empty value have to survive.
          await sleep(20);
          if (!el.value || (value.date && digits(el.value) === '')) ok = false;
        }
        if (ok) res.filled++;
        else res.flagged.push(`${prefix}: ${KEY_LABEL[key] || key}`);
        mark(el, ok);
        if (ok && isDropdown(el)) usedDropdown = true;
        await sleep(15);
      }
      if (!usedDropdown) break;
      await settle();
    }
    res.blocks++;
  }

  function toast(message) {
    document.querySelectorAll('[data-hf-toast]').forEach((n) => n.remove());
    const box = document.createElement('div');
    box.dataset.hfUi = '1';
    box.dataset.hfToast = '1';
    box.textContent = message;
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;max-width:360px;z-index:2147483647;'
      + 'padding:10px 14px;border-radius:8px;background:#1f2430;color:#fff;font:13px/1.4 system-ui,sans-serif;'
      + 'box-shadow:0 4px 18px rgba(0,0,0,.3);white-space:pre-line';
    document.documentElement.appendChild(box);
    setTimeout(() => box.remove(), 30000);
    box.addEventListener("click", () => box.remove());
  }

  // What identifies an entry on the page: the employer or school, plus the
  // title or degree when there is one.
  function entryKeys(kind, item) {
    const [main, extra] = kind === 'emp' ? [item.company, item.title]
      : kind === 'edu' ? [item.school, item.degree] : [item.name, null];
    return { main: norm(main), extra: norm(extra) };
  }

  // Saved entries show up as plain text (cards), not fields. This looks in the
  // part of the page around the Add button for the entry, so running again, or
  // the second pass, doesn't add it a second time. The part of the page is the
  // largest one that holds no other Add button.
  function isListed(kind, item, add) {
    const { main, extra } = entryKeys(kind, item);
    if (!add || main.length < 3) return false;
    const others = addCandidates(false, true).filter((el) => el !== add && /^\W*\+?\s*add\b/i.test(buttonText(el)));
    let box = parentOf(add);
    for (let i = 0; i < 6; i++) {
      const up = box && parentOf(box);
      if (!up || others.some((o) => up.contains(o))) break;
      box = up;
    }
    if (!box) return false;
    const text = norm(textOf(box));
    if (!text.includes(main)) return false;
    if (!extra) return true;
    const words = extra.split(' ').filter((w) => w.length > 2);
    return text.includes(extra) || (words.length > 0 && words.filter((w) => text.includes(w)).length * 4 >= words.length * 3);
  }

  // A reason the site gave for refusing a save, to pass on.
  function whyNotSaved(box) {
    const bad = [...box.querySelectorAll('[aria-invalid=true]')].map((el) => describe(el).human || el.name || el.id).filter(Boolean);
    const msg = [...box.querySelectorAll('*')].filter((n) => n.children.length === 0 && /\brequired\b|\binvalid\b/i.test(n.textContent) && isVisible(n))
      .map((n) => n.textContent.trim()).slice(0, 2);
    return [...msg, ...(bad.length ? [`check: ${bad.slice(0, 3).join(', ')}`] : [])].join('; ');
  }

  // Some sites (Workable) open one entry editor at a time with its own Save or
  // Update next to Cancel, and keep "Add" disabled until it is saved. Returns
  // the smallest container around the block's first field holding that pair.
  function editorFor(block) {
    const first = block.fields[block.order[0]];
    let box = first && parentOf(first);
    // Fields can sit inside a component's shadow root, so climb through its host.
    while (box && box.nodeType !== Node.ELEMENT_NODE) box = parentOf(box);
    for (let i = 0; box && i < 30; i++, box = parentOf(box)) {
      if (box.nodeType !== Node.ELEMENT_NODE || !box.querySelectorAll) continue;
      const buttons = [...box.querySelectorAll(BTN_SEL)]
        .filter((b) => !isOff(b) && isVisible(b) && b.type !== 'submit');
      const label = visibleLabel;
      const save = buttons.find((b) => /^(save|update|done|ok|confirm)( entry| changes)?$/i.test(label(b)));
      const cancel = buttons.some((b) => /^(cancel|discard)$/i.test(label(b)));
      if (save && cancel) return { box, save };
      if (box.matches('form,section,[role=dialog],dialog')) break;
    }
    return null;
  }

  // Fields after the editor (a profile "Summary" below the list) can run into
  // its block; they aren't part of the entry.
  function within(block, box) {
    if (!block || !box) return block;
    const inside = (el) => { for (let n = el; n; n = parentOf(n)) if (n === box) return true; return false; };
    const order = block.order.filter((k) => inside(block.fields[k]));
    return { ...block, order, fields: Object.fromEntries(order.map((k) => [k, block.fields[k]])) };
  }

  // opts: { kind: 'emp'|'edu'|'ref', items: [...], overwrite: bool, siteMaps: {host: {sig: key}} }
  async function run(opts) {
    // SmartRecruiters puts each new entry above the last, so adding the oldest
    // first leaves the most recent on top. Other sites list in the order added.
    // The popup's checkbox sets this per site.
    const chosen = (opts.orderSites || {})[location.hostname];
    const oldestFirst = chosen === undefined ? /(^|\.)smartrecruiters\.com$/.test(location.hostname) : chosen;
    if (oldestFirst && !opts.reversed) {
      opts = { ...opts, items: [...opts.items].reverse(), reversed: true };
    }
    const siteMap = (opts.siteMaps || {})[location.hostname] || {};
    const res = {
      found: false, kind: opts.kind, total: opts.items.length, blocks: 0,
      filled: 0, skipped: 0, flagged: [], stoppedBecause: null,
    };
    if (!opts.keepMarks) {
      deepAll('[data-hf-marked]').forEach((el) => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        delete el.dataset.hfMarked;
      });
    }
    let blocks = scanKind(opts.kind, siteMap);
    if (!blocks.length && !findAdd(opts.kind, blocks, false, true)) {
      res.seen = addCandidates(true).map(buttonText).filter((t) => /\badd\b|^\+$/i.test(t) && t.length < 40).slice(0, 6);
      return res;
    }
    res.found = true;

    // Entries already saved on this page no longer show as fields, so the
    // block for item i is at i - saved - listed.
    let saved = 0;
    let listed = 0;

    // An editor left open and filled with some other entry (an earlier try
    // that couldn't save) would swallow the next entry's values, so close it.
    for (const b of blocks) {
      const ed = editorFor(b);
      if (!ed || !b.order.some((k) => b.fields[k].isConnected && !isEmpty(b.fields[k]))) continue;
      const cancel = [...ed.box.querySelectorAll(BTN_SEL)].find((x) => /^(cancel|discard)$/i.test(visibleLabel(x)));
      if (cancel && !opts.overwrite) {
        realClick(cancel);
        await quiet(250, 2000);
      }
    }

    const label = (item) => String(item.company || item.school || item.name || item.title || '?').slice(0, 24);
    const note = (i, what) => (res.log = res.log || []).push(`${label(opts.items[i])}: ${what}`);
    for (let i = 0; i < opts.items.length; i++) {
      const at = i - saved - listed;
      const addNow = findAdd(opts.kind, scanKind(opts.kind, siteMap), false, true);
      if (isListed(opts.kind, opts.items[i], addNow)) {
        listed++;
        res.alreadyThere = (res.alreadyThere || 0) + 1;
        (res.log = res.log || []).push(`${label(opts.items[i])}: already there`);
        continue;
      }
      blocks = scanKind(opts.kind, siteMap);
      if (at >= blocks.length) {
        // Add can stay greyed out for a few seconds after a Save, so wait for it.
        // A click that already produced nothing won't start working by repeating it.
        const failed = (window.__hfAddFailed || {})[opts.kind];
        if (failed && Date.now() - failed < 120000) {
          res.stoppedBecause = 'clicking "Add" did not produce a new set of fields';
          note(i, 'Add gave no fields');
          break;
        }
        const add = await waitFor(() => findAdd(opts.kind, scanKind(opts.kind, siteMap)), 10000);
        if (!add) {
          res.stoppedBecause = 'no "Add" button found';
          note(i, 'no Add button');
          break;
        }
        let grown = null;
        for (let click = 0; click < 3 && !grown; click++) {
          const target = findAdd(opts.kind, scanKind(opts.kind, siteMap)) || add;
          realClick(target);
          grown = await waitFor(() => scanKind(opts.kind, siteMap).length > at, click ? 5000 : 6000);
        }
        if (!grown) {
          (window.__hfAddFailed = window.__hfAddFailed || {})[opts.kind] = Date.now();
          res.stoppedBecause = 'clicking "Add" did not produce a new set of fields';
          note(i, 'Add gave no fields');
          break;
        }
        await sleep(100);
        blocks = scanKind(opts.kind, siteMap);
      }
      const editor = editorFor(blocks[at]);
      const box = editor && editor.box;
      const block = within(blocks[at], box);
      await fillBlock(block, opts.items[i], { ...opts, siteMap }, res, () => within(scanKind(opts.kind, siteMap)[at], box));
      if (editor) {
        await sleep(150);
        // A redraw while filling may have replaced the button.
        const save = (editorFor(block) || editor).save;
        realClick(save);
        // Saved means no editor for this kind is open any more. The fields we
        // filled going away isn't enough: some sites redraw the whole editor
        // when they refuse a save, which replaces every field with a new one.
        const openEditor = () => scanKind(opts.kind, siteMap).map((b) => editorFor(b)).find(Boolean);
        let closed = await waitFor(() => !openEditor(), 6000);
        if (closed) {
          // Make sure it stays shut once the page settles.
          await quiet(300, 2500);
          closed = !openEditor();
        }
        if (!closed) {
          const still = openEditor();
          const why = whyNotSaved(still ? still.box : box);
          // What the refused editor looks like, for fixing this site: open the
          // console (F12) and copy the "[History Filler]" lines.
          console.warn('[History Filler] save refused:', why, (still ? still.box : box).outerHTML.slice(0, 20000));
          res.stoppedBecause = `${KIND_WORD[opts.kind][0]} ${i + 1} would not save${why ? ` (${why})` : ''}; check it and save it by hand`;
          note(i, 'not saved');
          break;
        }
        note(i, 'saved');
        saved++;
        await quiet(250, 2000);
        continue;
      }
      const first = block.fields[block.order[0]];
      if (first && first.closest('[role=dialog],dialog') && i < opts.items.length - 1) {
        res.stoppedBecause = 'this site uses a pop-up for each entry, so save it by hand';
        break;
      }
      await sleep(120);
    }

    if (!opts.quiet) toast(summaryLines([res]).join('\n'));
    return res;
  }

  function summaryLines(results) {
    const lines = [];
    let skipped = 0;
    const flagged = [];
    for (const r of results) {
      if (r.kind === 'contact') {
        if (r.filled) lines.push(`Filled ${r.filled} contact fields.`);
      } else if (r.kind === 'custom') {
        if (r.filled) lines.push(`Answered ${r.filled} question${r.filled === 1 ? '' : 's'} from your own answers.`);
      } else if (r.kind === 'selfid') {
        if (r.filled) lines.push(`Answered ${r.filled} question${r.filled === 1 ? '' : 's'}.`);
      } else if (r.kind === 'resume') {
        if (r.attached) lines.push(`Attached ${r.attached}.`);
      } else if (r.missing) {
        lines.push(`${KIND_WORD[r.kind][1]}: no "Add" button or fields recognised on this page`
          + `${r.seen && r.seen.length ? ` (buttons seen: ${r.seen.join(' | ')})` : ''}.`);
      } else {
        lines.push(`Filled ${r.blocks} of ${r.total} ${KIND_WORD[r.kind][1]} (${r.filled} fields).`);
        if (r.log && r.log.length) lines.push(`${KIND_WORD[r.kind][1]}: ${r.log.join('; ')}.`);
        if (r.alreadyThere) lines.push(`${r.alreadyThere} ${KIND_WORD[r.kind][1]} were already on the page.`);
        if (r.stoppedBecause) lines.push(`${KIND_WORD[r.kind][1]} stopped: ${r.stoppedBecause}.`);
      }
      skipped += r.skipped || 0;
      flagged.push(...(r.flagged || []));
    }
    if (skipped) lines.push(`${skipped} fields already had a value and were left alone.`);
    lines.push(`(History Filler build ${BUILD})`);
    if (flagged.length) lines.push(`Check the orange ones: ${[...new Set(flagged)].join(', ')}.`);
    return lines;
  }

  const US_STATES = ('AL:Alabama,AK:Alaska,AZ:Arizona,AR:Arkansas,CA:California,CO:Colorado,CT:Connecticut,'
    + 'DE:Delaware,DC:District of Columbia,FL:Florida,GA:Georgia,HI:Hawaii,ID:Idaho,IL:Illinois,IN:Indiana,'
    + 'IA:Iowa,KS:Kansas,KY:Kentucky,LA:Louisiana,ME:Maine,MD:Maryland,MA:Massachusetts,MI:Michigan,'
    + 'MN:Minnesota,MS:Mississippi,MO:Missouri,MT:Montana,NE:Nebraska,NV:Nevada,NH:New Hampshire,'
    + 'NJ:New Jersey,NM:New Mexico,NY:New York,NC:North Carolina,ND:North Dakota,OH:Ohio,OK:Oklahoma,'
    + 'OR:Oregon,PA:Pennsylvania,RI:Rhode Island,SC:South Carolina,SD:South Dakota,TN:Tennessee,TX:Texas,'
    + 'UT:Utah,VT:Vermont,VA:Virginia,WA:Washington,WV:West Virginia,WI:Wisconsin,WY:Wyoming')
    .split(',').map((s) => s.split(':'));

  // Other ways a dropdown might spell the same value.
  function altsFor(key, value) {
    const v = value.trim().toLowerCase();
    if (key === 'state') {
      const hit = US_STATES.find(([abbr, name]) => abbr.toLowerCase() === v || name.toLowerCase() === v);
      return hit ? [hit[0], hit[1]] : [];
    }
    if (key === 'country' && /^(united states( of america)?|usa?|u\.s\.a?\.?)$/.test(v)) {
      return ['United States', 'United States of America', 'USA', 'US'];
    }
    if (key === 'phoneCountry' && value === '+1') return ['1', 'United States', 'USA', /^united states\s*\+?1$/];
    if (key === 'location') return [value.split(',')[0].trim()];
    return [];
  }

  // Voluntary questions. Only answers the person picked in their profile are
  // used, so a blank answer leaves the question alone.
  const DECLINE = ['I choose not to disclose', 'Choose not to disclose', 'Prefer not to say', 'Prefer not to answer',
    'Decline to self-identify', 'Decline to answer', 'Decline to state', 'I do not wish to answer',
    "I don't wish to answer", 'I do not wish to disclose', "I don't wish to disclose", 'I do not want to answer',
    "I don't want to answer", 'Choose not to answer', 'Decline', /disclose|prefer not|decline|opt ?out|(do not|don't|dont) (wish|want)|not (to )?(answer|say|state)/];
  const YES_NO = { Yes: ['Yes', /^yes\b/], No: ['No', /^no\b/] };
  // Confirmations and notices often offer one choice, "I Acknowledge / I Agree", instead of Yes.
  const AGREE = { Yes: ['Yes', 'I Acknowledge / I Agree', /^yes\b|^(?!.*\b(not|disagree)\b).*(acknowledg|\bagree|\baccept)/i], No: ['No', /^no\b/] };
  const SELF_ANSWERS = {
    gender: {
      Man: ['Man', 'Male', /^(cis\w* )?(man|male)\b/], Woman: ['Woman', 'Female', /^(cis\w* )?(woman|female)\b/], 'Non-binary': ['Non-binary', 'Nonbinary', 'Non binary', /\bnon ?binary\b/],
    },
    race: {
      'American Indian or Alaska Native': ['American Indian or Alaska Native', 'American Indian or Alaskan Native', 'American Indian', 'Native American', /american indian|alaska|native american|indigenous/],
      Asian: ['Asian', /^asian\b/],
      'Black or African American': ['Black or African American', 'Black', /\bblack\b|african american/],
      'Hispanic or Latino': ['Hispanic or Latino', 'Hispanic or Latinx', 'Hispanic/Latino', 'Hispanic', /hispanic|latin[oax]/],
      'Middle Eastern or North African': ['Middle Eastern or North African', 'Middle Eastern', /middle east/],
      'Native Hawaiian or Pacific Islander': ['Native Hawaiian or Other Pacific Islander', 'Native Hawaiian or Pacific Islander',
        'North Hawaiian or Other Pacific Islander', 'Pacific Islander', /pacific islander|hawaiian/],
      White: ['White', 'Caucasian', /^white\b/],
    },
    orientation: {
      Heterosexual: ['Heterosexual', 'Straight', 'Heterosexual/Straight', /heterosexual|straight/],
      Gay: ['Gay', /\bgay\b/], Lesbian: ['Lesbian', /\blesbian\b/], Bisexual: ['Bisexual', /\bbisexual\b/],
      Pansexual: ['Pansexual', /\bpansexual\b/], Asexual: ['Asexual', /\basexual\b/], Queer: ['Queer', /\bqueer\b/],
    },
    hispanic: YES_NO,
    transgender: YES_NO,
    reside: YES_NO,
    workAuth: YES_NO,
    sponsorship: YES_NO,
    workNoSponsor: YES_NO,
    relocate: YES_NO,
    relocationSupport: YES_NO,
    // Questions the person taught it, by the question's own words.
    taught: YES_NO,
    over18: YES_NO,
    priorEmployment: YES_NO,
    knowEmployee: YES_NO,
    certify: AGREE,
    consent: AGREE,
    // Patterns are tried in this order, so LinkedIn wins if it's offered at all.
    heardAbout: { 'LinkedIn, then Indeed, then Other': ['LinkedIn', /linked ?in/, /\bindeed\b/, /^other\b/] },
    pronouns: {
      'He/Him': ['He/Him', /^he\b/],
      'She/Her': ['She/Her', /^she\b/],
      'They/Them': ['They/Them', /^they\b/],
    },
    veteran: {
      'Not a veteran': ['Not a veteran', 'No', /\bneither\b|\bnon ?veteran\b|\bnot a veteran\b|\bnot a protected veteran\b|^no\b/],
      'Veteran, protected status': ['Protected veteran', 'Yes', /^yes\b/, /^(?!.*\b(not|neither)\b)(?!.*non ?protected).*(protected|classifications)/],
      'Veteran, non-protected status': ['Non-protected veteran', 'Yes', /^yes\b/, /^(?!.*neither).*(non ?protected|not a protected|not protected)/],
    },
    disability: YES_NO,
  };
  const SELF_LABEL = {
    gender: 'Gender', race: 'Race / ethnicity', hispanic: 'Hispanic / Latino', orientation: 'Sexual orientation',
    transgender: 'Transgender experience', veteran: 'Veteran status', disability: 'Disability',
    relocationSupport: 'Relocation support',
    reside: 'Lives in the US', workAuth: 'Work authorization', sponsorship: 'Sponsorship',
    workNoSponsor: 'Work authorization', relocate: 'Relocation', over18: 'Over 18', pronouns: 'Pronouns',
    priorEmployment: 'Worked for this company',
    knowEmployee: 'Related to an employee', certify: 'Application is true and correct', consent: 'Privacy notice acknowledged',
    heardAbout: 'How you heard about the job',
  };
  // Order matters: "transgender" contains "gender".
  const SELF_QUESTION = [
    ['heardAbout', /how did you (first )?(hear|find|learn)|where did you (hear|find|see)|how .*(hear|found|find out) (about|of)|referral source/],
    ['workNoSponsor', /without.*sponsor/],
    ['sponsorship', /sponsor/],
    ['workAuth', /(authori[sz]ed|legally|eligible|entitled|right)\b.*\bwork|work authori[sz]ation/],
    ['reside', /\b(reside|live|living|located|based)\b.*\b(us|u s|usa|united states)\b/],
    // Needing help to move is a different question from being willing to.
    ['relocationSupport', /relocat\w*[^?]*\b(support|assistance|package|allowance|help|reimburse\w*|benefits?)\b|\b(require|need|want|request)\b[^?]*\brelocat/],
    ['relocate', /^(?!.*\b(support|assistance|package|require)\b).*relocat/],
    ['over18', /\b(18|eighteen)( years)?( of age| or older)|at least 18|over 18/],
    ['pronouns', /pronoun/],
    // About this employer, not a kind of employer: "worked at a studio" and
    // "worked with Houdini" are real questions with other answers.
    ['consent', /\b(acknowledg|agree|consent|accept)\w*\b.*\b(privacy|terms|policy|notice|conditions)\b|\b(privacy|terms)\s(notice|policy|and conditions)\b.*\b(acknowledg|agree|accept|read)\w*/],
    ['certify', /\b(certify|certifying|certification)\b.*\b(true|correct|accurate)\b|\btrue and (correct|accurate|complete)\b/],
    ['knowEmployee', /\b(related to|relationship with|relatives?|family members?|spouses?|domestic partners?)\b.*\b(works?|working|employed|employees?)\b/],
    ['priorEmployment', /\b(have|did) you\b.*\bwork(ed)?\b.*\b(for|at)\b(?! (a|an)\b)|\bpreviously (worked|employed)\b|\b(been|ever) employed (by|at)\b(?! (a|an)\b)|\b(currently|now)\b.*\b(work|working|employed)\b.*\b(for|at|by)\b(?! (a|an)\b)|\b(former|current) (employee|contractor)\b/],
    ['transgender', /transgender/],
    ['orientation', /sexual orientation/],
    ['hispanic', /(are you|do you identify).*(hispanic|latin[oax])|^(hispanic|latino)( or latin[oax])?( ethnicity)?\W*$/],
    ['gender', /\bgender\b/],
    ['race', /\brace\b|ethnic|ethinc/],
    ['veteran', /veteran/],
    ['disability', /disabilit/],
  ];

  // The text that decided each control's question.
  const questionText = new WeakMap();

  // True when the question names a company in the person's job history, so
  // "No" could be false. "Meta (Reality Labs, Aquent)" counts as all three.
  function namesPastEmployer(question, employers) {
    const q = norm(question);
    for (const job of employers || []) {
      for (const part of String(job.company || '').split(/[(),&/]/)) {
        const name = norm(part);
        if (name.length < 3) continue;
        // "Aquent Placement" should still match a question that just says "Aquent".
        const first = name.split(' ')[0];
        const useFirst = first.length >= 4 && !/^(the|new|first|global|united|american|national|group|international)$/.test(first);
        for (const n of useFirst ? [name, first] : [name]) {
          if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)) return true;
        }
      }
    }
    return false;
  }

  const selfLabel = (key) => SELF_LABEL[key] || 'A question you taught it';

  function selfCandidates(key, answer) {
    if (answer === 'Decline to answer') return DECLINE;
    const table = SELF_ANSWERS[key.startsWith('taught:') ? 'taught' : key] || {};
    return table[answer] || [answer];
  }

  // The text that asks a control's question, nearest first. A control with its
  // own label is judged by that label alone, so "AI policy" never inherits
  // "gender" from text nearby. A checkbox's label is an answer, so its question
  // is read from the group's legend or the text above the group.
  function questionTexts(el) {
    const isBox = el.type === 'checkbox' || el.type === 'radio';
    const texts = [];
    if (!isBox) {
      for (const l of [...ownLabels(el), ...backingLabels(el)]) texts.push(textOf(l));
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
          const n = byId(el, id);
          if (n && n !== el) texts.push(textOf(n));
        }
      }
      if (el.getAttribute('aria-label')) texts.push(el.getAttribute('aria-label'));
      if (!texts.some(Boolean)) texts.push(hostLabel(el));
    }
    const own = texts.some(Boolean);
    if (!own) {
      const fs = el.closest('fieldset');
      if (fs && fs.querySelector('legend')) texts.push(textOf(fs.querySelector('legend')));
      let node = el;
      // Styled-component forms (Epic) nest a dropdown nine or ten levels below its question.
      for (let level = 0; level < 12 && node && node !== document.body; level++) {
        let sib = node.previousElementSibling;
        for (let n = 0; sib && n < 40; n++, sib = sib.previousElementSibling) {
          if (!hasControls(sib)) texts.push(textOf(sib));
        }
        node = node.parentElement;
      }
    }
    // The question sits right above its options. Further away is another topic,
    // so "How did you hear about us?" doesn't inherit a heading above it.
    return own ? texts : texts.filter((t) => t && !PLACEHOLDER.test(String(t).trim())).slice(0, 2);
  }

  // Answers the person taught, by what the question says.
  let taught = {};
  const taughtKey = (text) => norm(text).slice(0, 160);

  // What a question is remembered by: the nearest text that asks it.
  function questionKey(el) {
    const first = questionTexts(el).find((t) => norm(t));
    return first ? taughtKey(first) : '';
  }

  // Which voluntary or common question a control belongs to.
  function selfKeyOf(el) {
    for (const t of questionTexts(el)) {
      const s = norm(t);
      if (!s || s.length > 400) continue;
      for (const [key, re] of SELF_QUESTION) {
        if (re.test(s)) {
          questionText.set(el, s);
          return key;
        }
      }
    }
    const q = questionKey(el);
    if (q && taught[q]) {
      questionText.set(el, q);
      return `taught:${q}`;
    }
    return null;
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // The profile's "Skills and years" and "Your own answers": what to put in
  // reply to a question, or null. { yes: true } answers a Yes/No question.
  function customAnswerFor(question, profile) {
    const q = norm(question);
    if (!q) return null;
    for (const c of profile.customAnswers || []) {
      const words = String(c.keywords || '').split(',').map(norm).filter(Boolean);
      if (words.length && c.answer && words.every((w) => q.includes(w))) return { text: String(c.answer) };
    }
    for (const t of profile.tools || []) {
      const name = norm(t.name);
      if (!name || !new RegExp(`\\b${escapeRe(name)}\\b`).test(q)) continue;
      if (/\byears?\b/.test(q)) return t.years ? { text: String(t.years).trim() } : null;
      if (/^(do|have|are|is) you\b|\bexperience (with|in|using)\b/.test(q)) return { yes: true };
    }
    return null;
  }

  async function fillCustom(opts) {
    const profile = opts.profile || {};
    const res = { kind: 'custom', found: false, filled: 0, skipped: 0, flagged: [] };
    if (!(profile.customAnswers || []).length && !(profile.tools || []).length) return res;
    const siteMap = (opts.siteMaps || {})[location.hostname] || {};
    const inBlock = new Set();
    for (const b of scan(siteMap)) Object.values(b.fields).forEach((el) => inBlock.add(el));
    const clickable = (box) => (isVisible(box) ? box : (box.closest('label') || box));
    const radios = new Map();
    for (const el of deepAll('textarea,input[type=text],input:not([type]),input[type=number],input[type=radio]')) {
      if (el.closest('[data-hf-ui]') || inBlock.has(el) || isDecoy(el)) continue;
      const isRadio = el.type === 'radio';
      if (!isVisible(isRadio ? clickable(el) : el)) continue;
      if (isRadio) {
        const id = el.name || el;
        if (!radios.has(id)) radios.set(id, []);
        radios.get(id).push(el);
        continue;
      }
      const answer = customAnswerFor(questionTexts(el).find((t) => norm(t)) || '', profile);
      if (!answer || !answer.text) continue;
      res.found = true;
      if (!opts.overwrite && !isEmpty(el)) {
        res.skipped++;
        continue;
      }
      let ok = false;
      try {
        ok = await fillField(el, { text: answer.text });
      } catch (e) {
        ok = false;
      }
      if (ok) res.filled++;
      else res.flagged.push('One of your own answers');
      mark(el, ok);
      await sleep(15);
    }
    for (const boxes of radios.values()) {
      const answer = customAnswerFor(questionTexts(boxes[0]).find((t) => norm(t)) || '', profile);
      if (!answer) continue;
      const want = answer.yes ? 'Yes' : answer.text;
      const labels = boxes.map((b) => textOf((b.labels && b.labels[0]) || b.closest('label') || b.parentElement));
      const i = matchOption(labels, [want], true);
      if (i < 0) continue;
      res.found = true;
      if (!opts.overwrite && boxes.some((b) => b.checked)) {
        res.skipped++;
        continue;
      }
      realClick(clickable(boxes[i]));
      await sleep(30);
      if (boxes[i].checked) res.filled++;
      else res.flagged.push('One of your own answers');
      mark(clickable(boxes[i]), boxes[i].checked);
    }
    return res;
  }

  async function fillSelfId(opts) {
    const saved = (opts.profile || {}).selfId || {};
    const res = { kind: 'selfid', found: false, filled: 0, skipped: 0, flagged: [] };
    const wanted = {};
    for (const [key, v] of Object.entries(saved)) {
      const list = (Array.isArray(v) ? v : [v]).filter(Boolean);
      if (list.length && SELF_LABEL[key]) wanted[key] = list;
    }
    taught = {};
    for (const [q, answer] of Object.entries(opts.answers || {})) {
      if (answer !== 'Yes' && answer !== 'No') continue;
      taught[q] = answer;
      wanted[`taught:${q}`] = [answer];
    }
    if (wanted.race) {
      // Some forms ask this apart from race, then show race once it's answered.
      wanted.hispanic = [wanted.race.includes('Decline to answer') ? 'Decline to answer'
        : wanted.race.includes('Hispanic or Latino') ? 'Yes' : 'No'];
    }
    const prior = saved.priorEmployment === undefined ? 'No' : saved.priorEmployment;
    if (prior) wanted.priorEmployment = [prior];
    wanted.knowEmployee = [saved.knowEmployee || 'No'];
    wanted.certify = [saved.certify || 'Yes'];
    wanted.consent = [saved.consent || 'Yes'];
    const heard = saved.heardAbout === undefined ? 'LinkedIn, then Indeed, then Other' : saved.heardAbout;
    if (heard) wanted.heardAbout = [heard];
    if (!Object.keys(wanted).length) return res;

    if (wanted.workAuth && wanted.sponsorship) {
      // "Are you authorized to work without sponsorship?" needs both answers.
      wanted.workNoSponsor = [wanted.workAuth[0] === 'Yes' && wanted.sponsorship[0] === 'No' ? 'Yes' : 'No'];
    }

    const clickable = (box) => (isVisible(box) ? box : (box.closest('label') || box));
    const done = new Set();
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      // Radios are grouped per question, since a page can ask about sponsorship
      // twice. Dropdowns stand alone, and checkboxes share one list per topic.
      const groups = new Map();
      const selector = `${CONTROL_SEL},input[type=checkbox],input[type=radio]`;
      for (const el of deepAll(selector)) {
        if (el.closest('[data-hf-ui]')) continue;
        const isBox = el.type === 'checkbox' || el.type === 'radio';
        // Styled boxes hide the input but show the label. Surveys for other
        // countries hide both, and must not be answered.
        if (!isVisible(isBox ? clickable(el) : el)) continue;
        const key = selfKeyOf(el);
        if (!key || !wanted[key]) continue;
        const id = !isBox ? el : el.type === 'radio' ? `${key}|${el.name}` : key;
        if (done.has(id)) continue;
        if (!groups.has(id)) groups.set(id, { key, boxes: [], single: isBox ? null : el, question: questionText.get(el) });
        if (isBox) groups.get(id).boxes.push(el);
      }

      let usedDropdown = false;
      for (const [id, g] of groups) {
        const { key } = g;
        const list = wanted[key];
        done.add(id);
        res.found = true;
        if (key === 'priorEmployment' && namesPastEmployer(g.question, (opts.profile || {}).employers)) {
          res.flagged.push(`${selfLabel(key)} (it's in your job history)`);
          mark(g.single || clickable(g.boxes[0]), false);
          continue;
        }
        if (g.boxes.length) {
          if (!opts.overwrite && g.boxes.some((b) => b.checked)) {
            res.skipped++;
            continue;
          }
          const labels = g.boxes.map((b) => textOf((b.labels && b.labels[0]) || b.closest('label') || b.parentElement));
          const answers = g.boxes[0].type === 'radio' ? list.slice(0, 1) : list;
          let ok = true;
          for (const answer of answers) {
            const i = matchOption(labels, selfCandidates(key, answer), true);
            if (i < 0) {
              ok = false;
              continue;
            }
            const box = g.boxes[i];
            if (!box.checked) {
              realClick(clickable(box));
              await sleep(30);
            }
            if (box.checked) mark(clickable(box), true);
            else ok = false;
          }
          if (ok) res.filled++;
          else res.flagged.push(selfLabel(key));
        } else {
          const node = g.single;
          if (!opts.overwrite && !isEmpty(node)) {
            res.skipped++;
            continue;
          }
          const cands = selfCandidates(key, list[0]);
          let ok = false;
          try {
            ok = await fillField(node, { text: cands[0], alts: cands.slice(1), strict: true });
          } catch (e) {
            ok = false;
          }
          if (ok) res.filled++;
          else res.flagged.push(selfLabel(key));
          mark(node, ok);
          if (ok) usedDropdown = true;
        }
        await sleep(15);
      }
      if (!usedDropdown) break;
      await settle();
    }
    return res;
  }

  const ASKED_TWICE = new Set(['firstName', 'lastName', 'email', 'country']);

  const shownValue = (c) => String(c.tagName === 'SELECT'
    ? (c.options[c.selectedIndex] || {}).text : (c.value || c.textContent || '')).trim();

  // A salary box usually has a currency picker beside it, and a number in the
  // wrong currency is worse than none. Returns 'none', 'ok', 'set' or 'failed'.
  async function ensureCurrency(amountEl, code) {
    let picker = null;
    let node = amountEl.parentElement;
    for (let level = 0; level < 4 && node && node !== document.body && !picker; level++, node = node.parentElement) {
      picker = [...node.querySelectorAll('input,select,button')]
        .find((c) => c !== amountEl && isVisible(c) && /^[A-Z]{3}\b/.test(shownValue(c))) || null;
    }
    if (!picker) return 'none';
    if (shownValue(picker).startsWith(code)) return 'ok';
    const wanted = new RegExp(`^${code.toLowerCase()}\\b`);
    if (picker.tagName === 'SELECT') return setSelect(picker, [wanted], true) ? 'set' : 'failed';
    realClick(picker);
    await sleep(300);
    const leaf = deepAll('div,li,button,span,a')
      .find((e) => e !== picker && !e.children.length && isVisible(e) && wanted.test(norm(e.textContent)));
    if (leaf) {
      realClick(leaf);
      await sleep(300);
    }
    if (shownValue(picker).startsWith(code)) return 'set';
    picker.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return 'failed';
  }

  const labelOf = (key) => (key.startsWith('links:') ? 'Links' : (KEY_LABEL[key] || key));

  // What goes in a contact box. A box asking for several links gets each one
  // you have, comma separated, with no repeats.
  function contactValue(values, key) {
    if (!key.startsWith('links:')) return values[key];
    const seen = [];
    for (const kind of key.slice(6).split('+')) {
      const v = values[kind];
      if (v && !seen.includes(v)) seen.push(v);
    }
    return seen.join(', ');
  }

  // One-off fields: name, email, address and so on. Anything inside an
  // employer, school or reference block belongs to that block instead.
  async function fillContact(opts) {
    const contact = opts.contact || {};
    const siteMap = (opts.siteMaps || {})[location.hostname] || {};
    const res = { kind: 'contact', found: false, filled: 0, skipped: 0, flagged: [] };
    let inBlock = new Set();
    const findBlocks = () => {
      inBlock = new Set();
      for (const b of scan(siteMap)) Object.values(b.fields).forEach((el) => inBlock.add(el));
    };
    findBlocks();
    const values = {
      ...contact,
      fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      preferredName: contact.preferredName || contact.firstName,
      skills: opts.skills,
    };
    values.coverLetter = String((opts.profile || {}).coverLetterText || '').trim();
    // Each stands in for the other, since one link usually beats a blank box.
    values.portfolio = contact.portfolio || contact.website;
    values.website = contact.website || contact.portfolio;
    const place = [contact.city, contact.state].filter(Boolean).join(', ');
    if (place) values.location = place;
    // "Current employer" is the job marked current, or else the most recent one: the profile lists newest first.
    const employers = (opts.profile || {}).employers || [];
    const currentJob = employers.find((job) => job.current) || employers[0];
    if (currentJob) {
      values.currentCompany = currentJob.company;
      values.currentTitle = currentJob.title;
    }
    // A site with its own "Area code" box wants the rest of the number in the
    // phone box, so split a US number only when such a box is on the page.
    const digits10 = String(contact.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits10.length === 10) {
      values.phoneArea = digits10.slice(0, 3);
      values.phoneCountry = '+1';
      const hasAreaBox = deepAll(CONTROL_SEL).some((el) => {
        const d = describe(el);
        return isVisible(el) && !inBlock.has(el) && /area code/.test(`${humanOf(d)} ${d.machine}`);
      });
      if (hasAreaBox) values.phone = `${digits10.slice(3, 6)}-${digits10.slice(6)}`;
    }
    // A form with a single address line (no visible City, State or ZIP box)
    // wants the whole address in it.
    const hasSeparatePlace = deepAll(CONTROL_SEL).some((el) => {
      if (!isVisible(el) || inBlock.has(el) || isDecoy(el)) return false;
      const d = describe(el);
      const k = classifyContactText(humanOf(d), el) || classifyContactText(d.machine, el);
      return k === 'city' || k === 'state' || k === 'zip';
    });
    if (!hasSeparatePlace && contact.address) {
      const stateZip = [contact.state, contact.zip].filter(Boolean).join(' ');
      const full = [contact.address, contact.city, stateZip].filter(Boolean).join(', ');
      if (full) values.address = full;
    }
    const used = new Map();
    const filled = new Set();
    // A button with a flag, beside a phone box that has no picker of its own.
    const phoneButtons = new Set();
    for (const tel of deepAll('input[type=tel]')) {
      if (!isVisible(tel) || inBlock.has(tel)) continue;
      let wrap = tel.parentElement;
      for (let level = 0; level < 4 && wrap && wrap !== document.body; level++, wrap = wrap.parentElement) {
        if ([...wrap.querySelectorAll('input[type=tel]')].filter(isVisible).length > 1) break;
        const button = [...wrap.querySelectorAll('button')].find((b) => opensPicker(b) && isVisible(b));
        if (button) {
          phoneButtons.add(button);
          break;
        }
      }
    }
    // Choosing a country can add a State field, so look again after a dropdown.
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let usedDropdown = false;
      let section = null;
      if (pass) findBlocks();
      for (const node of deepAll(`${CONTROL_SEL},${HEADING_SEL},button[aria-haspopup]`)) {
        if (node.closest('[data-hf-ui]') || !isVisible(node) || isDecoy(node)) continue;
        if (node.matches(HEADING_SEL) && !node.matches(CONTROL_SEL)) {
          const t = textOf(node);
          section = sectionAfter(node, t, section);
          continue;
        }
        if (node.tagName === 'BUTTON' && !phoneButtons.has(node) && !node.matches(CONTROL_SEL)) continue;
        if (inBlock.has(node) || node.type === 'checkbox' || section === 'emp' || section === 'edu' || section === 'ref') continue;
        // A dropdown already answered shows its answer where the label search looks ("LinkedIn"
        // from "How did you hear"), so don't take it for the LinkedIn box on the next pass.
        // A mark that says it failed or was empty is not an answer: a later run should try that box again.
        if (node.dataset.hfMarked && isListboxWidget(node) && node.dataset.hfOk !== '0') continue;
        const d = describe(node);
        const mapped = siteMap[signature(node, d)];
        if (mapped === 'ignore') continue;
        // "What is your location?" with a list of every country is a country question.
        const countryList = node.tagName === 'SELECT' && node.options.length > 100 && /location|country/.test(d.human);
        const key = (phoneButtons.has(node) ? 'phoneCountry' : null) || mapped
          || classifyContactText(humanOf(d), node) || classifyContactText(d.machine, node)
          || (countryList ? 'country' : null)
          // Long labels are usually screening questions and skipped above, but
          // "Link to a portfolio, personal website, or other demonstrated work"
          // still just wants the portfolio.
          || (d.raw.length < 150 && /portfolio|\breel\b|art ?station/.test(d.human) ? 'portfolio' : null);
        let value = key && contactValue(values, key);
        // Phone boxes that start with a country code ("+1", with a flag beside
        // them) read digits typed after it as part of the code, so a US number
        // typed bare turns into +31, the Netherlands. Give them the whole number.
        if (key === 'phone' && node.type === 'tel' && /^\+\d/.test(node.value.trim()) && digits10.length === 10) {
          value = `+1${digits10}`;
        }
        // The flag already shows the country wanted, so leave the list alone.
        if (key === 'phoneCountry' && phoneButtons.has(node) && /united states/i.test(node.getAttribute('aria-label') || node.textContent || '')) {
          filled.add(node);
          res.found = true;
          mark(node, true);
          continue;
        }
        if (key === 'coverLetter' && !value && !filled.has(node)) {
          // A text box is waiting for a letter we don't have.
          filled.add(node);
            res.found = true;
          res.flagged.push('Cover letter (save its text in your profile)');
          mark(node, false);
          continue;
        }
        if (key && !value && !filled.has(node) && isEmpty(node)) {
          // Recognised, but the profile has nothing for it: say so instead of
          // leaving the box blank without a word.
          filled.add(node);
          res.found = true;
          res.flagged.push(`${labelOf(key)} (empty in your profile)`);
          mark(node, false);
          continue;
        }
        if (!key || !value || filled.has(node)) continue;
        // Forms can ask twice ("First Name" and "Preferred First Name", a phone
        // country and a home country). Other kinds fill once, so a second
        // "Phone" further down isn't assumed to be yours.
        const prior = used.get(key);
        if (!ASKED_TWICE.has(key) && prior && prior.isConnected) continue;
        used.set(key, node);
        filled.add(node);
        res.found = true;
        if (!opts.overwrite && !isEmpty(node)) {
          res.skipped++;
          continue;
        }
        if (key === 'salary') {
          const code = /^[A-Za-z]{3}$/.test(String(contact.salaryCurrency || '').trim())
            ? String(contact.salaryCurrency).trim().toUpperCase() : 'USD';
          if (await ensureCurrency(node, code) === 'failed') {
            res.flagged.push(`Desired salary (set the currency to ${code} first)`);
            mark(node, false);
            continue;
          }
        }
        let ok = false;
        try {
          ok = await fillField(node, {
            text: String(value),
            alts: altsFor(key, String(value)),
            // "+1" belongs to dozens of countries, so narrow the list by name.
            // Location searches work best on the city alone.
            typed: key === 'phoneCountry' ? 'United States' : key === 'location' ? contact.city : undefined,
          });
        } catch (e) {
          ok = false;
        }
        if (ok) res.filled++;
        else res.flagged.push(labelOf(key));
        if (ok && node.tagName === 'BUTTON') node.dataset.hfPicked = String(value);
        mark(node, ok);
        if (ok && isDropdown(node)) usedDropdown = true;
        await sleep(15);
      }
      if (!usedDropdown) break;
      await settle();
    }
    return res;
  }

  // Finds the site's upload field for a file. Only a resume may use a lone
  // unlabelled upload field; a cover letter needs to be asked for.
  function findUpload(role) {
    const own = (el) => {
      const d = describe(el);
      return `${d.human} ${d.machine}`.toLowerCase();
    };
    // Drag-and-drop areas hide an unlabelled input, and only the area around it
    // says what it's for. Stop before the part of the page shared with another
    // upload, or a resume box would read the cover letter's text.
    const around = (el) => {
      const words = [];
      const hints = [];
      // Climbs out of a component to the element holding it, which is often
      // the only thing that says what the upload is for.
      const up = (n) => n.parentElement || hostOf(n);
      let node = up(el);
      for (let level = 0; level < 5 && node && node !== document.body; level++, node = up(node)) {
        if (deepAll('input[type=file]', node).length > 1) break;
        const t = textOf(node);
        if (t.length < 160) words.push(t.toLowerCase());
        hints.push(norm(`${node.id} ${node.getAttribute('class') || ''} ${node.getAttribute('data-test') || ''}`));
      }
      return { words: words.join(' '), hints: hints.join(' ') };
    };
    const NOT_RESUME = /cover|photo|picture|avatar|image/;
    const RESUME = /resume|r.sum.|\bcv\b|curriculum/;
    const labelled = {
      resume: (el) => !NOT_RESUME.test(own(el)) && RESUME.test(own(el)),
      cover: (el) => /cover/.test(own(el)),
    }[role];
    const nearby = {
      resume: (el) => {
        const a = around(el);
        return !NOT_RESUME.test(`${own(el)} ${a.words}`) && RESUME.test(`${a.words} ${a.hints}`);
      },
      cover: (el) => {
        const a = around(el);
        return /cover/.test(a.words) || /cover letter|coverletter/.test(a.hints);
      },
    }[role];
    // SuccessFactors popup boxes belong to one tile each; markUpload opens the right one.
    const all = deepAll('input[type=file]').filter((el) => !/^\d+:_file$/.test(el.id));
    // A box named for the other kind of file doesn't count: Epic tags its resume
    // box "resume-or-cover", which made an attached resume look like the letter.
    const otherKind = (el) => role === 'cover' ? RESUME.test(own(el)) && !/cover/.test(own(el)) : /cover/.test(own(el)) && !RESUME.test(own(el));
    // A box that holds a file but shows an upload error beside it was refused by the page, so it isn't attached.
    const refusedByPage = (el) => {
      let node = el.parentElement;
      for (let level = 0; level < 6 && node && node !== document.body; level++, node = node.parentElement) {
        const text = node.textContent || '';
        if (text.length < 600 && /cannot read propert|uploadfile|upload failed/i.test(text)) return true;
      }
      return false;
    };
    if (all.some((el) => el.files.length && !refusedByPage(el) && !otherKind(el) && (labelled(el) || nearby(el)))) return null; // already attached
    const open = all.filter((el) => !el.disabled && (!el.files.length || refusedByPage(el)));
    const lone = role === 'resume' && all.length === 1 && open.length === 1 && !NOT_RESUME.test(own(open[0]));
    // A field named for it beats one that only sits near the word. An "autofill
    // from resume" box only reads the file, so it comes after the real field.
    // SmartRecruiters names its parse-my-resume box "apply with resume".
    const isAutofill = (el) => {
      const a = around(el);
      return /auto ?fill/.test(`${own(el)} ${a.words}`) || /apply with resume/.test(a.hints);
    };
    const real = open.filter((el) => !isAutofill(el));
    const autofill = open.filter(isAutofill);
    return real.find(labelled) || real.find(nearby)
      || autofill.find(labelled) || autofill.find(nearby) || (lone ? open[0] : null);
  }

  // Tags the field so a script in the page's own world can find it. Upload code
  // on some sites fails on files handed over from this isolated world.
  // SuccessFactors shows each upload as a tile with no file box in it. Its "+"
  // icon opens an "Upload from Device" popup, and the file box lives in there.
  // Returns the tile's "+" icon for this kind of file, if it is still empty.
  function sapTile(role) {
    for (const icon of deepAll('[id$="_attachIcon"]')) {
      let box = icon.parentElement;
      let words = '';
      for (let level = 0; level < 8 && box && box !== document.body; level++, box = box.parentElement) {
        // The nearest text that names a kind of file: the tile's own prompt
        // ("Upload a Resume") or its label, before the row that holds both tiles.
        const t = textOf(box).toLowerCase();
        if (t.length > 300) break;
        if (/resume|r.sum.|\bcv\b|cover letter/.test(t)) {
          words = t;
          break;
        }
      }
      const isResume = /resume|r.sum.|\bcv\b/.test(words) && !/cover/.test(words);
      const isCover = /cover letter/.test(words);
      if (role === 'resume' ? !isResume : !isCover) continue;
      // A file already uploaded shows its name (the download label) instead of the prompt.
      const id = icon.id.replace(/_attachIcon$/, '');
      const shown = document.getElementById(`${id}_attachDownloadLabel`);
      if (shown && !/displayNone/.test(shown.className)) return null;
      return icon;
    }
    return null;
  }

  async function markUpload(role) {
    let target = findUpload(role);
    if (!target) {
      const icon = sapTile(role);
      if (!icon) return false;
      // Each tile has its own popup; its file box is named after the tile's
      // number plus one ("57:" opens "58:_file").
      const num = Number((/^(\d+):_attachIcon$/.exec(icon.id) || [])[1]);
      const popupBoxes = () => deepAll('input[type=file]').filter((el) => isVisible(el) && /^\d+:_file$/.test(el.id));
      const before = new Set(popupBoxes());
      icon.click();
      target = await waitFor(() => {
        const exact = Number.isFinite(num) && document.getElementById(`${num + 1}:_file`);
        if (exact && isVisible(exact)) return exact;
        return popupBoxes().find((el) => !before.has(el)) || null;
      }, 3000);
      if (!target) return false;
    }
    target.dataset.hfUpload = role;
    return true;
  }

  async function attachFile(file, role) {
    const res = { kind: 'resume', found: false, attached: null };
    if (!file || !file.base64) return res;
    const target = findUpload(role);
    if (!target) return res;
    res.found = true;
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], file.name, { type: file.type }));
    target.files = transfer.files;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    res.attached = file.name;
    return res;
  }

  // Resolves once the page has stopped changing for `calm` ms, or after `max`.
  function quiet(calm, max) {
    return new Promise((resolve) => {
      let timer;
      let cap;
      const done = () => {
        observer.disconnect();
        clearTimeout(timer);
        clearTimeout(cap);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, calm);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      timer = setTimeout(done, calm);
      cap = setTimeout(done, max);
    });
  }

  // opts: { profile, resumeFile, overwrite, siteMaps }
  async function fillPass(opts, profile) {
    const results = [];
    const contact = await fillContact({ ...opts, contact: profile.contact, skills: profile.skills });
    if (contact.found) results.push(contact);
    const selfId = await fillSelfId(opts);
    if (selfId.found) results.push(selfId);
    const custom = await fillCustom(opts);
    if (custom.found) results.push(custom);
    const lists = { emp: profile.employers, edu: profile.education, ref: profile.references };
    for (const kind of ['emp', 'edu', 'ref']) {
      const items = lists[kind] || [];
      if (!items.length) continue;
      // Finish this whole section before starting the next one. If it stopped
      // part-way (a slow save, an Add that hadn't come back yet), settle and go
      // again: entries already on the page are skipped, so only the rest is added.
      // A form that has filled some entries and then shows no Add button is full
      // (some allow only five jobs), so waiting and trying again can't help. The
      // retries never overwrite, or they would type every entry out again.
      const full = (res) => res.blocks > 0 && /no "Add" button/.test(res.stoppedBecause || '');
      let r = await run({ ...opts, kind, items, quiet: true, keepMarks: true });
      for (let again = 0; again < 3 && r.found && r.stoppedBecause && !/would not save|did not produce/.test(r.stoppedBecause) && !full(r); again++) {
        await quiet(500, 3000);
        const next = await run({ ...opts, overwrite: false, kind, items, quiet: true, keepMarks: true });
        next.log = [...(r.log || []), ...(next.log || [])];
        next.filled += r.filled;
        next.blocks += r.blocks;
        next.alreadyThere = 0;
        r = next;
      }
      if (r.found) results.push(r);
      else if (opts.reportMissing) results.push({ ...r, missing: true });
    }
    return results;
  }

  async function runAll(opts) {
    const { profile = {} } = opts;
    const results = [];
    const attached = await attachFile(opts.resumeFile, 'resume');
    if (attached.found) results.push(attached);
    const cover = await attachFile(opts.coverLetterFile, 'cover');
    if (cover.found) results.push(cover);
    // Sites that read an upload fill or rebuild the form themselves, so let
    // that finish first or it replaces what we write.
    if (results.length || opts.uploaded) await quiet(1200, 8000);

    results.push(...await fillPass(opts, profile));

    // Pages sometimes redraw and wipe a field after it was filled. Look again,
    // and fill whatever came back empty. Fields that kept their value are
    // skipped, so this is quick. It never overwrites: "Replace values already
    // in the form" applies to the first pass, and typing everything twice would
    // only confuse.
    await quiet(700, 3000);
    // Say so when a section wasn't found, but only from a frame that did fill something.
    for (const again of await fillPass({ ...opts, overwrite: false, keepMarks: true, reportMissing: results.length > 0 }, profile)) {
      const first = results.find((r) => r.kind === again.kind);
      if (!first) {
        results.push(again);
        continue;
      }
      first.filled += again.filled;
      first.flagged = again.flagged;
      if (again.blocks > first.blocks) first.blocks = again.blocks;
    }

    if (results.length) toast(summaryLines(results).join('\n'));
    return { found: results.length > 0, results, summary: summaryLines(results) };
  }

  // Click-to-map: the user clicks a field the matcher missed and says what it
  // is. Saved per site, and applied to the same field in every block.
  function teach() {
    if (document.querySelector('[data-hf-teach]')) return;
    if (!deepAll(CONTROL_SEL).some(isVisible)) return;

    const uiFont = 'font:13px/1.4 system-ui,sans-serif;';
    const banner = document.createElement('div');
    banner.dataset.hfUi = '1';
    banner.dataset.hfTeach = '1';
    banner.textContent = 'Click a field or question to teach it. Press Esc when done.';
    banner.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 14px;border-radius:8px;background:#1f2430;color:#fff;${uiFont}`;
    document.documentElement.appendChild(banner);

    let menu = null;
    const closeMenu = () => {
      if (menu) menu.remove();
      menu = null;
    };
    const stop = () => {
      closeMenu();
      banner.remove();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') stop();
    };
    const save = async (el, key) => {
      const sig = signature(el, describe(el));
      const host = location.hostname;
      const { siteMaps = {} } = await chrome.storage.local.get('siteMaps');
      siteMaps[host] = { ...(siteMaps[host] || {}), [sig]: key };
      await chrome.storage.local.set({ siteMaps });
      el.style.outline = '2px solid #2e9e5b';
      banner.textContent = `Saved as "${KEY_LABEL[key] || 'Ignore'}". Click another field, or press Esc.`;
    };
    // A yes or no for one question, remembered by its wording on every site.
    const saveAnswer = async (el, question, answer) => {
      const { answers = {} } = await chrome.storage.local.get('answers');
      answers[question] = answer;
      await chrome.storage.local.set({ answers });
      el.style.outline = '2px solid #2e9e5b';
      banner.textContent = `Saved: this question is answered ${answer} from now on, on every site. Click another field, or press Esc.`;
    };
    const makeItem = (label, onPick, bold) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.cssText = `padding:6px 10px;cursor:pointer;${bold ? 'font-weight:600;' : ''}`;
      item.addEventListener('mouseenter', () => { item.style.background = '#eef1f6'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        closeMenu();
        onPick();
      });
      return item;
    };
    const onClick = (e) => {
      if (e.target.closest('[data-hf-ui]')) return;
      const el = e.target.closest(`${CONTROL_SEL},input[type=radio]`);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      const rect = el.getBoundingClientRect();
      menu = document.createElement('div');
      menu.dataset.hfUi = '1';
      menu.style.cssText = `position:fixed;left:${Math.min(rect.left, innerWidth - 240)}px;top:${Math.min(rect.bottom + 4, innerHeight - 300)}px;z-index:2147483647;width:240px;max-height:290px;overflow:auto;background:#fff;color:#111;border:1px solid #bbb;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.25);${uiFont}`;
      const question = questionKey(el);
      if (question) {
        for (const answer of ['Yes', 'No']) {
          menu.appendChild(makeItem(`Always answer ${answer} to this question`, () => saveAnswer(el, question, answer), true));
        }
      }
      for (const [key, label] of [...Object.entries(KEY_LABEL), ['ignore', 'Ignore this field']]) {
        menu.appendChild(makeItem(label, () => save(el, key)));
      }
      document.documentElement.appendChild(menu);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  // Open-ended questions ("Why do you want to work here?") that nothing in the
  // profile already answers. Each box is tagged so its draft can be put back.
  let openCount = 0;
  const openPrefix = Math.random().toString(36).slice(2, 5);
  function findOpenQuestions(opts) {
    const profile = (opts && opts.profile) || {};
    const siteMap = ((opts && opts.siteMaps) || {})[location.hostname] || {};
    taught = {};
    for (const [q, answer] of Object.entries((opts && opts.answers) || {})) {
      if (answer === 'Yes' || answer === 'No') taught[q] = answer;
    }
    const inBlock = new Set();
    for (const b of scan(siteMap)) Object.values(b.fields).forEach((el) => inBlock.add(el));
    const questions = [];
    const boxes = deepAll('textarea,[contenteditable=true],[role=textbox]:not(input,textarea),input[type=text],input:not([type])');
    for (const el of boxes) {
      if (el.closest('[data-hf-ui]') || inBlock.has(el) || isDecoy(el) || !isVisible(el)) continue;
      if (el.disabled || el.readOnly || el.getAttribute('role') === 'combobox' || !isEmpty(el)) continue;
      const question = (questionTexts(el).find((t) => norm(t)) || '').replace(/\s+/g, ' ').replace(/[\s*✱∗]+$/, '').trim();
      if (!question) continue;
      // A one-line box is a question only when it's worded as one.
      if (isArea(el) ? question.length < 8 : !(question.endsWith('?') && question.length >= 25)) continue;
      // Contact labels are short ("Phone"); in a long question a word like
      // "mobile" doesn't make it one, the same rule fillContact follows.
      const isLabel = question.length <= 60 && !question.includes('?');
      if (selfKeyOf(el) || customAnswerFor(question, profile) || (isLabel && classifyContactText(norm(question), el))) continue;
      const id = `hf-${openPrefix}-${++openCount}`;
      el.setAttribute('data-hf-open', id);
      questions.push({ id, question: question.slice(0, 700), limit: el.maxLength > 0 ? el.maxLength : 0 });
    }
    // Only the top page's text is the posting; frames hold just the form.
    const text = window === window.top && document.body ? document.body.innerText.slice(0, 15000) : '';
    return { questions, text };
  }

  // Puts drafts into the boxes found above. Anything typed since is kept. A
  // blue outline marks a draft, so it isn't mistaken for a plain autofill.
  async function putDrafts(answers) {
    const res = { filled: 0, failed: 0 };
    for (const el of deepAll('[data-hf-open]')) {
      const text = answers[el.getAttribute('data-hf-open')];
      el.removeAttribute('data-hf-open');
      if (!text || !isEmpty(el)) continue;
      let ok = false;
      try {
        ok = await fillField(el, { text });
      } catch (e) {
        ok = false;
      }
      if (ok) {
        res.filled++;
        mark(el, true);
        el.style.outline = '2px solid #2b6fd9';
      } else {
        res.failed++;
        mark(el, false);
      }
      await sleep(15);
    }
    return res;
  }

  window.__HF = { run, runAll, markUpload, hasUpload: (role) => !!(findUpload(role) || sapTile(role)), teach, scan, findOpenQuestions, putDrafts, build: BUILD };
})();
