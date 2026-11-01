// Finds jobs through the public job lists Greenhouse, Lever and Ashby publish.
// Those lists are per company, so searching means asking each known company.
(() => {
  const ART = 'art';
  const TECH = 'tech';

  // Every entry was checked against the live list, since a slug can belong to
  // someone unexpected ("bethesda" is a physical therapy office).
  const DEFAULT_COMPANIES = [
    ['greenhouse', 'sonypicturesimageworks', 'Sony Pictures Imageworks', ART],
    ['greenhouse', 'naughtydog', 'Naughty Dog', ART],
    ['greenhouse', 'blurstudio', 'Blur Studio', ART],
    ['greenhouse', 'laika', 'LAIKA', ART],
    ['greenhouse', 'epicgames', 'Epic Games', ART],
    ['greenhouse', 'riotgames', 'Riot Games', ART],
    ['greenhouse', 'rockstargames', 'Rockstar Games', ART],
    ['greenhouse', 'crystaldynamics', 'Crystal Dynamics', ART],
    ['greenhouse', '2k', '2K', ART],
    ['greenhouse', 'hangar13', 'Hangar 13', ART],
    ['greenhouse', 'gearbox', 'Gearbox', ART],
    ['greenhouse', 'firaxis', 'Firaxis', ART],
    ['greenhouse', 'bungie', 'Bungie', ART],
    ['greenhouse', 'hasbro', 'Hasbro', ART],
    ['greenhouse', 'sonyinteractiveentertainmentglobal', 'PlayStation', ART],
    ['greenhouse', 'scopely', 'Scopely', ART],
    ['greenhouse', 'krafton', 'KRAFTON', ART],
    ['greenhouse', 'roblox', 'Roblox', ART],
    ['ashby', 'supercell', 'Supercell', ART],
    ['ashby', 'thatgamecompany', 'thatgamecompany', ART],
    ['lever', 'jamcity', 'Jam City', ART],
    ['lever', 'kabam', 'Kabam', ART],
    ['greenhouse', 'anthropic', 'Anthropic', TECH],
    ['greenhouse', 'discord', 'Discord', TECH],
    ['greenhouse', 'figma', 'Figma', TECH],
    ['greenhouse', 'reddit', 'Reddit', TECH],
    ['greenhouse', 'twitch', 'Twitch', TECH],
    ['ashby', 'openai', 'OpenAI', TECH],
    ['ashby', 'assured', 'Assured', TECH],
    ['ashby', 'pika', 'Pika', TECH],
    ['ashby', 'runway', 'Runway', TECH],
    ['lever', 'spotify', 'Spotify', TECH],
  ].map(([platform, slug, name, group]) => ({ platform, slug, name, group }));

  // Spreadsheets of open jobs, read as plain data at search time. None ship
  // with the extension: people paste the Google Sheet links they want searched
  // (see sheetSource), and each says where its columns are or lets
  // detectColumns find them.
  const SHEETS = [];

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  // The address that goes straight to the form, where the platform has one.
  function applyLink(link) {
    const gh = /^https:\/\/(?:job-boards|boards)(\.eu)?\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i.exec(link);
    if (gh) return `https://job-boards${gh[1] || ''}.greenhouse.io/embed/job_app?for=${gh[2]}&token=${gh[3]}`;
    const clean = link.split(/[?#]/)[0].replace(/\/+$/, '');
    if (/^https:\/\/jobs(\.eu)?\.lever\.co\/[^/]+\/[^/]+$/i.test(clean)) return `${clean}/apply`;
    if (/^https:\/\/jobs\.ashbyhq\.com\/[^/]+\/[^/]+$/i.test(clean)) return `${clean}/application`;
    return link;
  }

  // "25.10.2026", "2026-10-25" or "10/25/2026" as written in the sheet.
  function sheetDate(text) {
    const s = String(text || '').trim();
    const pad = (n) => String(n).padStart(2, '0');
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : null;
  }

  // A Google Sheets link as the address of its data, or null if it isn't one.
  // The sheet has to be shared as "Anyone with the link can view".
  function sheetSource(link) {
    const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/i.exec(String(link || '').trim());
    if (!m) return null;
    const gid = /[#&?]gid=(\d+)/.exec(link);
    return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid[1]}` : ''}`;
  }

  // Finds the header row (within the first few rows) and which column holds
  // what. Headers are matched on how they end, so a heading with a paragraph of
  // instructions in front of "Link" still counts. A link column is also
  // recognised by its cells being web addresses.
  const COLUMN_WORDS = {
    company: /\b(company|studio|employer|organi[sz]ation|firm)( name)?\W*$/i,
    title: /\b(job title|title|position|role|opening|job)( name)?\W*$/i,
    link: /\b(link|url|apply|application|posting)\W*$/i,
    where: /\b(location|where|remote|country|region|city)\W*$/i,
    added: /\b(added|posted|date|updated)( on)?\W*$/i,
  };

  function detectColumns(rows) {
    const tail = (cell) => String(cell || '').trim().split(/\n/).filter(Boolean).pop() || '';
    for (let h = 0; h < Math.min(rows.length, 8); h++) {
      const cols = {};
      rows[h].forEach((cell, i) => {
        const text = tail(cell).trim().slice(-80);
        for (const [key, re] of Object.entries(COLUMN_WORDS)) {
          if (cols[key] === undefined && re.test(text)) cols[key] = i;
        }
      });
      if (cols.link === undefined) {
        const data = rows.slice(h + 1, h + 60);
        const width = Math.max(0, ...data.map((r) => r.length));
        for (let i = 0; i < width && cols.link === undefined; i++) {
          const cells = data.map((r) => String(r[i] || '').trim()).filter(Boolean);
          if (cells.length >= 3 && cells.filter((c) => /^https?:\/\//i.test(c)).length >= cells.length * 0.6) cols.link = i;
        }
      }
      if (cols.title !== undefined && cols.link !== undefined) {
        // A column headed "Remote" is a remote-only list, whatever it says in the cells.
        cols.remoteOnly = cols.where !== undefined && /remote/i.test(tail(rows[h][cols.where]));
        return { header: h, ...cols };
      }
    }
    return null;
  }

  // sheet is { name, csv } (csv from sheetSource), optionally with columns.
  async function loadSheet(sheet) {
    const response = await fetch(sheet.csv, { credentials: 'omit' });
    if (!response.ok) throw new Error(`${response.status}`);
    const text = await response.text();
    // A sheet that isn't shared answers with a Google sign-in page, not data.
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('not shared: set sharing to "Anyone with the link can view"');
    const rows = parseCsv(text);
    const c = sheet.columns || detectColumns(rows);
    if (!c) throw new Error('no Title and Link columns found: put headings like Title, Company and Link in the first rows');
    const jobs = [];
    for (const row of rows.slice((c.header || 0) + 1)) {
      const link = (row[c.link] || '').trim();
      const title = (row[c.title] || '').trim();
      if (!title || !/^https:\/\//i.test(link)) continue;
      const where = (row[c.where] || '').trim();
      const remote = c.remoteOnly || /\bremote\b/i.test(where);
      jobs.push({
        id: `sheet:${link}`,
        company: (row[c.company] || '').trim() || 'Unknown company',
        title,
        location: c.remoteOnly ? (where ? `Remote: ${where}` : 'Remote') : where || (remote ? 'Remote' : ''),
        url: link,
        applyUrl: applyLink(link),
        posted: sheetDate(row[c.added]),
        remote,
        source: sheet.name,
      });
    }
    return jobs;
  }

  // Companies a sheet shows are on a platform we can search, so their other jobs
  // can be found too. These stay quiet: a dead one isn't worth mentioning.
  function companiesInSheetJobs(jobs, known) {
    const have = new Set(known.map((c) => `${c.platform}:${c.slug}`));
    const extra = [];
    for (const job of jobs) {
      const parsed = parseCompanyUrl(job.url);
      if (!parsed) continue;
      const key = `${parsed.platform}:${parsed.slug}`;
      if (have.has(key)) continue;
      have.add(key);
      extra.push({ ...parsed, name: job.company, group: ART, quiet: true });
    }
    return extra;
  }

  const getJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  };

  const LOADERS = {
    async greenhouse(c) {
      const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs`);
      return data.jobs.map((j) => ({
        id: `greenhouse:${c.slug}:${j.id}`,
        title: j.title,
        location: (j.location && j.location.name) || '',
        url: j.absolute_url,
        // The form itself. Some companies' own job pages hide it behind more
        // clicks, but this address always goes straight to it.
        applyUrl: `https://job-boards.greenhouse.io/embed/job_app?for=${c.slug}&token=${j.id}`,
        posted: j.updated_at,
        remote: false,
      }));
    },
    async lever(c) {
      const data = await getJson(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
      return data.map((j) => ({
        id: `lever:${c.slug}:${j.id}`,
        title: j.text,
        location: (j.categories && j.categories.location) || '',
        url: j.hostedUrl,
        applyUrl: j.applyUrl,
        posted: j.createdAt,
        remote: j.workplaceType === 'remote',
      }));
    },
    async ashby(c) {
      const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}`);
      return data.jobs.filter((j) => j.isListed !== false).map((j) => ({
        id: `ashby:${c.slug}:${j.id}`,
        title: j.title,
        location: [j.location, ...(j.secondaryLocations || []).map((s) => s.location)].filter(Boolean).join(' / '),
        url: j.jobUrl,
        applyUrl: j.applyUrl,
        posted: j.publishedAt,
        remote: !!j.isRemote,
      }));
    },
  };

  // Words that describe the level of a job rather than the job.
  const LEVEL = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'associate', 'intern', 'mid', 'level']);
  // Words that many different jobs share, so they count for less on their own.
  const BROAD = new Set(['artist', 'engineer', 'designer', 'manager', 'developer', 'director', 'producer', 'specialist', 'coordinator', 'analyst']);
  const FILLER = new Set(['a', 'an', 'and', 'or', 'of', 'the', 'in', 'for', 'at', 'to', 'job', 'jobs', 'role']);
  const SAME_AS = {
    fx: ['vfx'],
    vfx: ['fx'],
    cg: ['cgi'],
    cgi: ['cg'],
    modeler: ['modeller'],
    modeller: ['modeler'],
  };
  // Related but not the same, so they rank below the word itself.
  const NEAR = {
    animator: ['animation', 'animations'],
    modeler: ['modeling', 'modelling'],
    // Rarely in a job title, but it's the tool behind these.
    houdini: ['fx', 'vfx', 'procedural'],
  };
  const NEAR_CREDIT = 0.7;
  // A different line of work, unless that's what was asked for.
  const OTHER_WORK = /engineer|scientist|recruit|accountant|counsel|sales|marketing|paralegal/;

  const words = (text) => String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  // Short words must match exactly ("fx" isn't in "effect"), longer ones may
  // start a word, so "artist" also finds the French "artiste".
  const wordMatches = (query, word) => (query.length >= 4 ? word.startsWith(query) : word === query);

  // How well a title fits, from 0 to 1. 1 means every word that matters is there.
  function scoreTitle(title, query) {
    const asked = words(query).filter((w) => !FILLER.has(w));
    if (!asked.length) return 0;
    const have = words(title);
    let total = 0;
    let got = 0;
    for (const w of asked) {
      const weight = LEVEL.has(w) ? 0.1 : BROAD.has(w) ? 0.3 : 1;
      total += weight;
      const found = (forms) => forms.some((f) => have.some((h) => wordMatches(f, h)));
      if (found([w, ...(SAME_AS[w] || [])])) got += weight;
      else if (found(NEAR[w] || [])) got += weight * NEAR_CREDIT;
    }
    const score = got / total;
    const elsewhere = OTHER_WORK.test(String(title).toLowerCase()) && !OTHER_WORK.test(String(query).toLowerCase());
    return elsewhere ? score / 2 : score;
  }

  // "Los Angeles, Remote" means either one.
  function locationMatches(job, wanted) {
    const places = String(wanted || '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (!places.length) return true;
    const here = String(job.location).toLowerCase();
    return places.some((p) => here.includes(p) || (p === 'remote' && job.remote));
  }

  function parseCompanyUrl(text) {
    const url = String(text || '').trim();
    const patterns = [
      ['greenhouse', /(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i],
      ['lever', /jobs(?:\.eu)?\.lever\.co\/([\w-]+)/i],
      ['ashby', /jobs\.ashbyhq\.com\/([\w.-]+)/i],
    ];
    for (const [platform, re] of patterns) {
      const m = re.exec(url);
      if (m && m[1].toLowerCase() !== 'embed') return { platform, slug: m[1].toLowerCase() };
    }
    return null;
  }

  // ---- Free job feeds. Each returns jobs as data and asks for credit in return:
  // a link to the job's page on the feed (which the job title is) and its name.
  const HOUR = 60 * 60 * 1000;
  const remotiveCalls = [];

  const feedJob = (feed, fields) => ({
    ...fields,
    applyUrl: fields.url,
    source: feed.name,
    credit: { label: feed.credit, href: feed.home },
    // These land on the feed's own page, where you click through to apply.
    intermediate: true,
  });

  // Reading a feed twice in a row asks them for the same answer twice, so each
  // answer is kept (in `store`, if given) for as long as its feed suggests.
  async function cached(store, key, ttl, load) {
    const hit = store && await store.get(key);
    if (hit) return hit;
    const jobs = await load();
    if (store) await store.set(key, jobs, ttl);
    return jobs;
  }

  // The one word most worth asking a keyword search for.
  function distinctiveWord(query) {
    const sig = words(query).filter((w) => !FILLER.has(w) && !LEVEL.has(w));
    const narrow = sig.filter((w) => !BROAD.has(w));
    return [...(narrow.length ? narrow : sig)].sort((a, b) => b.length - a.length)[0] || '';
  }

  const FEEDS = {
    remotive: {
      name: 'Remotive', credit: 'via Remotive', home: 'https://remotive.com',
      async load({ title, store }) {
        const term = distinctiveWord(title);
        if (!term) return [];
        return cached(store, `remotive:${term}`, 6 * HOUR, async () => {
          // They block more than 2 requests a minute.
          const now = Date.now();
          while (remotiveCalls.length && now - remotiveCalls[0] > 60000) remotiveCalls.shift();
          if (remotiveCalls.length >= 2) throw new Error('wait a minute');
          remotiveCalls.push(now);
          const data = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=100`);
          return (data.jobs || []).map((j) => feedJob(FEEDS.remotive, {
            id: `remotive:${j.id}`,
            title: j.title,
            company: j.company_name,
            location: j.candidate_required_location ? `Remote: ${j.candidate_required_location}` : 'Remote',
            url: j.url,
            posted: j.publication_date,
            remote: true,
          }));
        });
      },
    },
    remoteok: {
      name: 'Remote OK', credit: 'via Remote OK', home: 'https://remoteok.com',
      async load({ store }) {
        // One list holds every job, so it's read once and searched here.
        return cached(store, 'remoteok:all', 6 * HOUR, async () => {
          const data = await getJson('https://remoteok.com/api');
          return data.filter((j) => j && j.position).map((j) => feedJob(FEEDS.remoteok, {
            id: `remoteok:${j.id}`,
            title: j.position,
            company: j.company,
            location: j.location ? `Remote: ${j.location}` : 'Remote',
            url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`,
            posted: j.date,
            remote: true,
          }));
        });
      },
    },
    adzuna: {
      name: 'Adzuna', credit: 'Jobs by Adzuna', home: 'https://www.adzuna.com',
      async load({ title, location, settings, store }) {
        if (!settings || !settings.id || !settings.key) throw new Error('needs your key');
        const country = /^[a-z]{2}$/.test(settings.country || '') ? settings.country : 'us';
        const where = String(location || '').split(',').map((p) => p.trim()).filter((p) => p && p.toLowerCase() !== 'remote')[0] || '';
        const call = async (extra) => {
          const params = new URLSearchParams({
            app_id: settings.id, app_key: settings.key, results_per_page: '50', 'content-type': 'application/json', ...extra,
          });
          if (where) params.set('where', where);
          const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
          if (response.status === 401 || response.status === 403) throw new Error('did not accept your keys');
          if (!response.ok) throw new Error(`${response.status}`);
          return (await response.json()).results || [];
        };
        const keyed = `adzuna:${country}:${where}:${title}`;
        return cached(store, keyed, HOUR, async () => {
          // Every word must match first. If that finds little, any word will do.
          let rows = await call({ what: title });
          if (rows.length < 10) {
            const any = words(title).filter((w) => !FILLER.has(w) && !LEVEL.has(w)).join(' ');
            if (any) rows = [...rows, ...await call({ what_or: any })];
          }
          const seen = new Set();
          return rows.filter((r) => r && !seen.has(r.id) && seen.add(r.id)).map((r) => feedJob(FEEDS.adzuna, {
            id: `adzuna:${r.id}`,
            title: r.title,
            company: (r.company && r.company.display_name) || 'Unknown company',
            location: (r.location && r.location.display_name) || '',
            url: String(r.redirect_url || '').replace(/^http:\/\//i, 'https://'),
            posted: r.created,
            remote: /\bremote\b/i.test(`${r.title} ${(r.location && r.location.display_name) || ''}`),
          }));
        });
      },
    },
  };

  // A search re-reads every list, so hold on to them for a little while. That
  // keeps a second search instant and asks these sites for less.
  const CACHE_MS = 15 * 60 * 1000;
  const cache = new Map();

  async function loadCompany(company) {
    const key = `${company.platform}:${company.slug}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.jobs;
    const jobs = await LOADERS[company.platform](company);
    cache.set(key, { at: Date.now(), jobs });
    return jobs;
  }

  async function checkCompany(company) {
    return (await loadCompany(company)).length;
  }

  // options: { title, location, companies, sheets, feeds, store, skip: Set of job ids }
  // sheets: the spreadsheets the person added, each { name, csv }.
  // feeds: { remotive: true, remoteok: true, adzuna: { id, key, country } }
  async function search(options) {
    const { title, location, skip = new Set(), feeds = {}, store } = options;
    const found = [];
    const failed = [];
    const feedJobs = [];
    const feedNames = [];

    const sheetJobs = [];
    await Promise.all([...SHEETS, ...(options.sheets || [])].map(async (sheet) => {
      try {
        sheetJobs.push(...await loadSheet(sheet));
      } catch (e) {
        failed.push(`${sheet.name} (${e.message})`);
      }
    }));

    // One at a time and before the company lists, so a feed that limits how
    // often it can be asked isn't hit alongside them.
    for (const [name, setting] of Object.entries(feeds)) {
      if (!setting || !FEEDS[name]) continue;
      feedNames.push(FEEDS[name].name);
      try {
        feedJobs.push(...await FEEDS[name].load({ title, location, store, settings: setting === true ? null : setting }));
      } catch (e) {
        failed.push(`${FEEDS[name].name} (${e.message})`);
      }
    }

    const companies = [...options.companies, ...companiesInSheetJobs(sheetJobs, options.companies)];
    let next = 0;
    const worker = async () => {
      while (next < companies.length) {
        const company = companies[next++];
        try {
          for (const job of await loadCompany(company)) {
            found.push({ ...job, company: company.name });
          }
        } catch (e) {
          if (!company.quiet) failed.push(company.name);
        }
      }
    };
    await Promise.all(Array.from({ length: 10 }, worker));

    // Big studios post one job per city, and a sheet can repeat a company's own
    // list, so show each job once. Company lists come first: they're newer.
    const seen = new Set();
    const jobs = [];
    for (const job of [...found, ...feedJobs, ...sheetJobs]) {
      const score = scoreTitle(job.title, title);
      if (score < 0.1 || skip.has(job.id) || !locationMatches(job, location)) continue;
      const same = `${job.company}|${job.title}|${job.location}`.toLowerCase();
      const form = String(job.applyUrl).toLowerCase();
      if (seen.has(same) || seen.has(form)) continue;
      seen.add(same);
      seen.add(form);
      jobs.push({ ...job, score });
    }
    jobs.sort((a, b) => b.score - a.score || new Date(b.posted || 0) - new Date(a.posted || 0));
    return { jobs, failed, searched: companies.length, sheetJobs: sheetJobs.length, feeds: feedNames };
  }

  globalThis.JobSearch = {
    DEFAULT_COMPANIES, SHEETS, FEEDS, distinctiveWord, search, scoreTitle, locationMatches, parseCompanyUrl, checkCompany, parseCsv, applyLink,
    sheetSource, detectColumns, loadSheet, sheetDate,
  };
})();
