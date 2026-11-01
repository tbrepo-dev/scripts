// Test forms, picked with ?form=classic|react|bare. Each exposes what the app
// actually holds as window.__state so a test can check more than the DOM.
const form = new URLSearchParams(location.search).get('form') || 'classic';
const root = document.getElementById('root');

// Plain HTML: personal details before the jobs (a City that must not be touched),
// type=month dates, a "current" checkbox that disables the end date, one block
// to start with, then an education section with its own Add button.
function classic() {
  let n = 0;
  const jobHtml = () => {
    const i = n++;
    return `<div class="job"><h3>Employer ${i + 1}</h3>
      <label>Company <input id="company_${i}" name="employments[${i}][company]"></label>
      <label>Job Title <input id="jobtitle_${i}"></label>
      <label>City <input id="city_${i}"></label>
      <label>Supervisor phone <input id="sup_${i}"></label>
      <label>Start date <input type="month" id="start_${i}"></label>
      <label>End date <input type="month" id="end_${i}"></label>
      <label><input type="checkbox" id="cur_${i}"> I currently work here</label>
      <label>Description <textarea id="desc_${i}"></textarea></label></div>`;
  };
  root.innerHTML = `
    <h2>Personal information</h2>
    <label>First name <input id="first"></label>
    <label>Last name <input id="last"></label>
    <label>Email <input id="email" type="email"></label>
    <label>Phone <input id="phone"></label>
    <label>Upload your resume <input type="file" id="resume"></label>
    <label>Cover letter <input type="file" id="coverletter"></label>
    <label>City <input id="personal_city" value=""></label>
    <label>Current company <input id="lone_company"></label>
    <label>LinkedIn URL <input id="linkedin"></label>
    <h2>Employment history</h2>
    <div id="jobs">${jobHtml()}</div>
    <button type="button" id="addJob">+ Add Employer</button>
    <h2>Education</h2>
    <div id="schools"><div class="job">
      <label>School <input id="school_0"></label>
      <label>Degree <select id="degree_0"><option value="">Select</option><option>Bachelor's Degree</option><option>Master's Degree</option></select></label>
      <label>Start date <input type="month" id="eduStart_0"></label>
      <label>End date <input type="month" id="eduEnd_0"></label>
    </div></div>
    <button type="button" id="addSchool">Add another school</button>
    <h2>References</h2>
    <div id="refs"></div>
    <button type="button" id="addRef">Add Reference</button>
    <label>Do you have a company car? <input id="q1"></label>`;
  let r = 0;
  document.getElementById('addRef').onclick = () => {
    const i = r++;
    document.getElementById('refs').insertAdjacentHTML('beforeend', `<div class="job">
      <label>First name <input id="refFirst_${i}"></label>
      <label>Last name <input id="refLast_${i}"></label>
      <label>Company <input id="refCo_${i}"></label>
      <label>Phone <input id="refPhone_${i}"></label>
      <label>Relationship <input id="refRel_${i}"></label></div>`);
  };
  let s = 1;
  document.getElementById('addSchool').onclick = () => {
    const i = s++;
    document.getElementById('schools').insertAdjacentHTML('beforeend', `<div class="job">
      <label>School <input id="school_${i}"></label>
      <label>Degree <select id="degree_${i}"><option value="">Select</option><option>Bachelor's Degree</option><option>Master's Degree</option></select></label>
      <label>Start date <input type="month" id="eduStart_${i}"></label>
      <label>End date <input type="month" id="eduEnd_${i}"></label>
    </div>`);
  };
  document.getElementById('addJob').onclick = () => {
    document.getElementById('jobs').insertAdjacentHTML('beforeend', jobHtml());
  };
  document.addEventListener('change', (e) => {
    if (e.target.id && e.target.id.startsWith('cur_')) {
      const end = document.getElementById(`end_${e.target.id.split('_')[1]}`);
      end.disabled = e.target.checked;
    }
  });
}

// Real React with controlled inputs: month/year selects with no useful names,
// a MM/YYYY text box, a listbox widget, and Add that renders after a delay.
function react() {
  const h = React.createElement;
  const blank = () => ({ company: '', title: '', sm: '', sy: '', end: '', lb: '', current: false, location: '' });
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 30 }, (_, i) => String(2026 - i));

  function Listbox({ value, onPick, label }) {
    const [open, setOpen] = React.useState(false);
    return h('div', null,
      h('button', { type: 'button', 'aria-haspopup': 'listbox', 'aria-label': label, onClick: () => setOpen(!open) }, value || 'Select'),
      open && h('div', { role: 'listbox' }, months.map((m) => h('div', {
        key: m, role: 'option', onMouseDown: () => { onPick(m); setOpen(false); },
      }, m))));
  }

  function App() {
    const [jobs, setJobs] = React.useState([blank()]);
    window.__state = jobs;
    const set = (i, k) => (e) => {
      const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
      setJobs((all) => all.map((j, x) => (x === i ? { ...j, [k]: v } : j)));
    };
    return h('div', null,
      h('h2', null, 'Work Experience'),
      jobs.map((j, i) => h('div', { className: 'job', key: i },
        h('h4', null, `Work Experience ${i + 1}`),
        h('label', null, 'Employer', h('input', { value: j.company, onChange: set(i, 'company') })),
        h('label', null, 'Position', h('input', { value: j.title, onChange: set(i, 'title') })),
        h('label', null, 'Location', h('input', { value: j.location, onChange: set(i, 'location') })),
        h('div', null, h('span', null, 'Start date'),
          h('div', null,
            h('select', { value: j.sm, onChange: set(i, 'sm') }, h('option', { value: '' }, 'Month'), months.map((m, x) => h('option', { key: m, value: String(x + 1) }, m))),
            h('select', { value: j.sy, onChange: set(i, 'sy') }, h('option', { value: '' }, 'Year'), years.map((y) => h('option', { key: y, value: y }, y))))),
        h('label', null, h('input', { type: 'checkbox', checked: j.current, onChange: set(i, 'current') }), 'Present'),
        !j.current && h('label', null, 'End date (MM/YYYY)', h('input', { value: j.end, onChange: set(i, 'end') })),
        h(Listbox, { label: 'Promotion month', value: j.lb, onPick: set(i, 'lb') }))),
      h('button', { type: 'button', onClick: () => setTimeout(() => setJobs((a) => [...a, blank()]), 300) }, 'Add Another'));
  }
  ReactDOM.createRoot(root).render(h(App));
}

// No blocks until Add is clicked, no <label>s: text in sibling divs, camelCase
// ids (the way Workday names things), and a generic "Add" under a heading.
function bare() {
  let n = 0;
  root.innerHTML = `
    <h2>Skills</h2><button type="button" id="addSkill">Add</button>
    <h2>Work History</h2><div id="list"></div><button type="button" id="add">Add</button>
    <h2>References</h2><button type="button" id="addRef">Add</button>`;
  window.__wrongClicks = 0;
  document.getElementById('addSkill').onclick = () => window.__wrongClicks++;
  document.getElementById('addRef').onclick = () => window.__wrongClicks++;
  document.getElementById('add').onclick = () => {
    const i = n++;
    document.getElementById('list').insertAdjacentHTML('beforeend', `<div class="job">
      <div><div>Company Name</div><div><input id="workExperience-${i}--companyName"></div></div>
      <div><div>Title</div><div><input id="workExperience-${i}--jobTitle"></div></div>
      <div><input id="workExperience-${i}--startDate-dateSectionMonth-input" aria-label="Month" placeholder="MM"><input id="workExperience-${i}--startDate-dateSectionYear-input" aria-label="Year" placeholder="YYYY"></div>
      <div><input id="workExperience-${i}--endDate-dateSectionMonth-input" aria-label="Month" placeholder="MM"><input id="workExperience-${i}--endDate-dateSectionYear-input" aria-label="Year" placeholder="YYYY"></div>
    </div>`);
  };
}

// Contact details split the way many sites do: a dropdown that spells the
// state out, a country dropdown, and a separate area code box.
function contact() {
  const states = ['Alabama', 'Georgia', 'Virginia', 'West Virginia'].map((s) => `<option>${s}</option>`).join('');
  root.innerHTML = `
    <h2>Contact information</h2>
    <label>First name <input id="first"></label>
    <label>Street Address <input id="street"></label>
    <label>Address line 2 <input id="line2"></label>
    <label>City <input id="city"></label>
    <label>State <select id="state"><option value="">Select</option>${states}</select></label>
    <label>Zip code <input id="zip"></label>
    <label>Country <select id="country"><option value="">Select</option><option>Canada</option><option>United States</option></select></label>
    <label>Country code <select id="cc"><option value="">Select</option><option>+44</option><option>+1</option></select></label>
    <label>Area code <input id="area"></label>
    <label>Phone number <input id="phone7"></label>`;
}

// Same contact details, but with one plain phone box and an abbreviation state list.
function contactSimple() {
  root.innerHTML = `
    <h2>Contact</h2>
    <label>Phone <input id="phone"></label>
    <label>State <select id="state"><option value="">Select</option><option>GA</option><option>VA</option></select></label>`;
}

// Each job asks for the employer's address and phone, split up, with a
// supervisor phone that must stay empty and personal details that must not move.
function jobcontact() {
  let n = 0;
  const states = ['Alabama', 'Georgia', 'Massachusetts'].map((s) => `<option>${s}</option>`).join('');
  const job = () => {
    const i = n++;
    return `<div class="job">
      <label>Employer Name <input id="co_${i}"></label>
      <label>Job Title <input id="ti_${i}"></label>
      <label>Street Address <input id="ad_${i}"></label>
      <label>Address line 2 <input id="ad2_${i}"></label>
      <label>City <input id="ci_${i}"></label>
      <label>State <select id="st_${i}"><option value="">Select</option>${states}</select></label>
      <label>Zip Code <input id="zi_${i}"></label>
      <label>Country <select id="cn_${i}"><option value="">Select</option><option>Canada</option><option>United States</option></select></label>
      <label>Area code <input id="ar_${i}"></label>
      <label>Phone Number <input id="ph_${i}"></label>
      <label>Supervisor phone <input id="su_${i}"></label>
      <label>Supervisor email address <input id="se_${i}"></label>
      <label>Start date <input type="month" id="sd_${i}"></label>
      <label>End date <input type="month" id="ed_${i}"></label></div>`;
  };
  root.innerHTML = `
    <h2>Personal information</h2>
    <label>Street address <input id="my_address"></label>
    <label>City <input id="my_city"></label>
    <label>Phone <input id="my_phone"></label>
    <label>Current company <input id="my_company"></label>
    <h2>Employment history</h2>
    <div id="jobs">${job()}</div>
    <button type="button" id="addJob">Add Employer</button>`;
  document.getElementById('addJob').onclick = () => {
    document.getElementById('jobs').insertAdjacentHTML('beforeend', job());
  };
}

// Voluntary questions the way many sites ask them: long question text above
// two columns of checkboxes, and long questions above plain dropdowns.
function selfid() {
  const group = (q, items) => `<div class="q"><div>${q}</div><div style="columns:2">${items
    .map((l) => `<label style="display:block"><input type="checkbox"> ${l}</label>`).join('')}</div></div>`;
  const dropdown = (id, q, items) => `<div class="q"><div>${q}</div><select id="${id}"><option value="">Select</option>${items
    .map((l) => `<option>${l}</option>`).join('')}</select></div>`;
  root.innerHTML = `
    <h2>Voluntary self-identification</h2>
    ${group('Which gender identities do you most identify with? Please select all that apply. *',
    ['Agender', 'Gender non-conforming', 'Genderfluid', 'Genderqueer', 'I choose not to disclose', 'Man', 'Non-binary', 'Not Listed', 'Woman'])}
    ${group('Which race or ethnicity best describes you? Please select all that apply. *',
    ['American Indian or Alaskan Native', 'Asian', 'Black or African American', 'Hispanic or Latinx', 'I choose not to disclose',
      'Middle Eastern or North African', 'North Hawaiian or Other Pacific Islander', 'White'])}
    ${group('Which sexual orientations do you most identify with? Please select all that apply. *',
    ['Asexual', 'Bisexual', 'Gay', 'Heterosexual', 'I choose not to disclose', 'Lesbian', 'Not Listed', 'Pansexual', 'Queer'])}
    ${dropdown('vet', 'Are you a US veteran, and if so, do you belong to any of the categories of protected statuses listed <a href="#">here</a>? *',
    ['I am not a veteran', 'I identify as a veteran', 'I choose not to disclose'])}
    ${dropdown('trans', 'Are you a person of transgender experience? *', ['Yes', 'No', 'I choose not to disclose'])}
    ${dropdown('dis', 'Would you consider yourself to be a person with a disability? For more information on this question, please click <a href="#">here</a>. *',
    ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'])}`;
}

// Dropdowns built like the Netflix application: a text input with
// role=combobox, labelled by a separate element, whose list is rebuilt (new
// elements) a moment after each keystroke. Flags and dial codes sit in the
// country-code entries.
function dropdowns() {
  const countries = ['Afghanistan', 'Canada', 'Mexico', 'United Kingdom', 'United States', 'United States Minor Outlying Islands', 'Uruguay'];
  const codes = [['🇨🇦', '+1', 'Canada'], ['🇬🇧', '+44', 'United Kingdom'], ['🇧🇸', '+1 242', 'Bahamas'],
    ['🇺🇸', '+1', 'United States'], ['🇲🇽', '+52', 'Mexico']].map(([f, c, n]) => `${f} (${c}) ${n}`);
  const vet = ['I am a US veteran in a non-protected status', 'I am a US veteran in a protected status',
    'I am neither a protected or non-protected US veteran', 'I choose not to disclose'];
  const states = ['Alabama', 'Georgia', 'Michigan', 'Virginia', 'West Virginia'];
  root.innerHTML = `
    <h2>Contact Information</h2>
    <div>Phone</div>
    <div><input id="cc" role="combobox" aria-label="Country code" placeholder="Select country code" aria-controls="list_cc" aria-expanded="false" autocomplete="off">
      <ul id="list_cc" role="listbox"></ul>
      <input id="phone" aria-label="Phone Number"></div>
    <div><span id="l_country">Country</span>
      <input id="country" role="combobox" aria-labelledby="l_country" placeholder="Select" aria-controls="list_country" aria-expanded="false" autocomplete="off">
      <ul id="list_country" role="listbox"></ul></div>
    <div id="state_slot"></div>
    <div><label>City <input id="city"></label></div>
    <h2>Work Experience</h2>
    <label>Employer <input id="job_co"></label>
    <label>Job Title <input id="job_ti"></label>
    <label>Country <select id="job_country"><option value="">Select</option><option>Canada</option><option>United States</option></select></label>
    <div id="job_state_slot"></div>
    <label>Start date <input type="month" id="job_start"></label>
    <h2>Self-ID Questions</h2>
    <div><div id="l_vet">Are you a US veteran, and if so, do you belong to any of the categories of protected statuses listed here?</div>
      <input id="vet" role="combobox" aria-labelledby="l_vet" placeholder="Select" aria-controls="list_vet" aria-expanded="false" autocomplete="off">
      <ul id="list_vet" role="listbox"></ul></div>`;
  const widget = (inputId, listId, items, onPick) => {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    const build = (query) => items.filter((t) => t.toLowerCase().includes(query.toLowerCase())).map((text) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.textContent = text;
      b.addEventListener('click', () => {
        input.value = text;
        input.dataset.picked = text;
        list.replaceChildren();
        input.setAttribute('aria-expanded', 'false');
        if (onPick) onPick(text);
      });
      li.append(b);
      return li;
    });
    input.addEventListener('click', () => {
      input.setAttribute('aria-expanded', 'true');
      list.replaceChildren(...build(''));
    });
    input.addEventListener('input', () => {
      input.dataset.picked = '';
      setTimeout(() => list.replaceChildren(...build(input.value)), 120);
    });
  };
  widget('cc', 'list_cc', codes);
  // State only exists once a country is chosen, and arrives a moment later.
  widget('country', 'list_country', countries, (picked) => {
    if (picked !== 'United States') return;
    setTimeout(() => {
      document.getElementById('state_slot').innerHTML = `<span id="l_state">State</span>
        <input id="state" role="combobox" aria-labelledby="l_state" placeholder="Select" aria-controls="list_state" aria-expanded="false" autocomplete="off">
        <ul id="list_state" role="listbox"></ul>`;
      widget('state', 'list_state', states);
    }, 300);
  });
  document.getElementById('job_country').addEventListener('change', (e) => {
    if (e.target.value !== 'United States') return;
    setTimeout(() => {
      document.getElementById('job_state_slot').innerHTML = `<label>State <select id="job_state"><option value="">Select</option>${states.map((s) => `<option>${s}</option>`).join('')}</select></label>`;
    }, 300);
  });
  widget('vet', 'list_vet', vet);
}

// Other common wordings of the voluntary questions, as plain dropdowns.
function wordings() {
  const dropdown = (id, q, items) => `<div><div>${q}</div><select id="${id}"><option value="">Select</option>${items
    .map((l) => `<option>${l}</option>`).join('')}</select></div>`;
  root.innerHTML = `
    <h2>Voluntary self-identification</h2>
    ${dropdown('vet', 'Veteran status', window.__vetWords || ['I am not a protected veteran',
    'I identify as one or more of the classifications of a protected veteran', "I don't wish to answer"])}
    ${dropdown('dis', 'Voluntary disability disclosure', ['Yes, I have a disability, or have a history/record of having a disability',
    'No, I do not have a disability, or a history/record of having a disability', 'I do not wish to answer'])}
    ${dropdown('race', 'Race / Ethnicity', ['Black or African-American (Not Hispanic or Latino)', 'Hispanic / Latino',
    'White (Not Hispanic or Latino)', 'Two or More Races', 'Decline to self identify'])}
    ${dropdown('gen', 'Gender', ['Male', 'Female', 'Prefer not to say'])}`;
}

// Things seen on live Greenhouse and Lever forms: a job ad with an "Experience"
// heading above the form, one-off "current" fields, an unrelated dropdown beside
// text that mentions gender, a Hispanic question that reveals race, and hidden
// surveys for other countries.
function livepage() {
  const radios = (name, items) => items.map((l) => `<label><input type="radio" name="${name}" style="position:absolute;opacity:0;width:0;height:0"> ${l}</label>`).join('');
  root.innerHTML = `
    <h2>About the role</h2><p>We value people of any gender.</p>
    <h3>Experience</h3><p>Five years of it.</p>
    <h2>Apply for this job</h2>
    <label>First Name* <input id="first"></label>
    <label>Current location <input id="loc" name="location"></label>
    <label>Current company <input id="co" name="org"></label>
    <label>Current title <input id="ti"></label>
    <div>We value people of any gender.</div>
    <div><label for="ai">AI Policy for Application*</label><select id="ai"><option value="">Select</option><option>Yes</option><option>No</option></select></div>
    <h2>Voluntary Self-Identification</h2>
    <div><label for="hisp">Are you Hispanic/Latino?</label><select id="hisp"><option value="">Select</option><option>Yes</option><option>No</option><option>Decline To Self Identify</option></select></div>
    <div id="race_slot"></div>
    <div><div>Gender</div><div>${radios('g_visible', ['Woman', 'Man', 'Prefer not to say'])}</div></div>
    <div style="display:none"><div>Gender</div><div>${radios('g_hidden', ['Woman', 'Man', 'Prefer not to say'])}</div></div>
    <h2>Demographic Survey</h2>
    <label>What is your location? <select id="where"><option value="">Select...</option>${Array.from({ length: 110 }, (_, i) => `<option>Country ${i}</option>`).join('')}<option value="US">United States</option></select></label>
    <div id="survey" style="display:none"><div>Are you a veteran/have you served in the military?</div><div>${radios('vet_q', ['Yes', 'No', 'Prefer not to disclose'])}</div></div>`;
  document.getElementById('where').addEventListener('change', () => {
    setTimeout(() => { document.getElementById('survey').style.display = ''; }, 300);
  });
  document.getElementById('hisp').addEventListener('change', (e) => {
    if (e.target.value !== 'No') return;
    setTimeout(() => {
      document.getElementById('race_slot').innerHTML = '<label for="race">Race</label><select id="race"><option value="">Select</option><option>Asian</option><option>White (Not Hispanic or Latino)</option></select>';
    }, 300);
  });
}

// Built like the Assured form on Ashby: each question's label sits above a
// fieldset's option rows, long lists included. Then Greenhouse-style dropdowns
// asking about sponsorship twice, and questions that must stay untouched.
function questions() {
  const radios = (name, q, items) => `<fieldset style="border:0"><label>${q}</label>${items.map((l, i) => `<div><span><input type="radio" name="${name}" id="${name}${i}"></span><label for="${name}${i}">${l}</label></div>`).join('')}</fieldset>`;
  const dropdown = (id, q, items) => `<div><label for="${id}">${q}</label><select id="${id}"><option value="">Select</option>${items.map((l) => `<option>${l}</option>`).join('')}</select></div>`;
  root.innerHTML = `
    <h2>Apply</h2>
    <div><label for="res">Resume</label><input type="file" id="res"></div>
    <div><label for="cov">Cover Letter</label><input type="file" id="cov"></div>
    ${radios('reside', 'Do you currently reside in the US?*', ['Yes', 'No'])}
    ${radios('spon', 'Do you now, or will you ever, require employment sponsorship to work in the country where this job is located?*', ['Yes', 'No'])}
    ${radios('pron', 'What are your preferred pronouns?', ['He/Him', 'She/Her', 'They/Them', 'Other', 'Choose not to answer'])}
    ${radios('gen', 'Gender', ['Male', 'Female', 'Non-binary', 'I prefer to self-describe', 'I choose not to answer'])}
    ${radios('hear', 'How did you hear about us?', ['Yes', 'No', 'A friend', 'LinkedIn', 'Other'])}
    ${dropdown('visa1', 'Do you require visa sponsorship?', ['Yes', 'No'])}
    ${dropdown('visa2', 'Will you now or will you in the future require employment visa sponsorship?', ['Yes', 'No'])}
    ${dropdown('auth', 'Are you legally authorized to work in the United States?', ['Yes, I am', 'No, I am not'])}
    ${dropdown('nosp', 'Can you work in the US without sponsorship?', ['Yes', 'No'])}
    ${dropdown('reloc', 'Are you open to relocation for this role?', ['Yes', 'No'])}
    ${dropdown('age', 'Are you at least 18 years of age?', ['Yes', 'No'])}
    ${dropdown('other', 'Have you ever interviewed with us before?', ['Yes', 'No'])}
    ${dropdown('p1', 'Are you currently working for Netflix as a contractor? (e.g. independent, vendor, or temporary worker)', ['Yes', 'No'])}
    ${dropdown('p2', "Have you worked for Netflix or any of Netflix's subsidiaries in the past?", ['Yes', 'No'])}
    ${dropdown('p3', 'Have you ever worked for Meta or its affiliates?', ['Yes', 'No'])}
    ${dropdown('p4', 'Have you ever been employed by Contoso?', ['Yes', 'No'])}
    ${dropdown('s1', 'Have you worked with Houdini before?', ['Yes', 'No'])}
    ${dropdown('s2', 'Have you worked at a VFX studio?', ['Yes', 'No'])}
    ${dropdown('s3', 'Are you currently employed?', ['Yes', 'No'])}
    ${dropdown('arb', 'Please read the arbitration agreement below', ['I agree', 'I do not agree'])}`;
}

// Built like the Assured form's dropdowns: the label points at a wrapper, the
// input has no id and says "Start typing...", and the list is empty until you
// type, then shows matches only.
function typeahead() {
  const race = ['Black or African American', 'East Asian', 'Hispanic, LatinX or Spanish', 'I choose not to answer',
    'Indigenous peoples of America', 'Middle Eastern', 'Pacific Islander', 'South Asian', 'Southeast Asian', 'White'];
  const widget = (id, label, items) => `<div><label for="w_${id}">${label}</label>
    <div id="w_${id}"><div><input data-t="${id}" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" placeholder="Start typing..." autocomplete="off"></div>
    <div id="l_${id}" role="listbox"></div></div></div>`;
  root.innerHTML = `
    <h2>Apply</h2>
    <div><label for="site">Website, Portfolio, Github...</label><input id="site"></div>
    <div><label for="gh">GitHub URL</label><input id="gh"></div>
    <div><label for="web">Other website</label><input id="web"></div>
    <h2>Voluntary</h2>
    ${widget('race', 'I identify my ethincity as:', race)}
    ${widget('vet', 'Are you a veteran:', ['Yes', 'No', 'I choose not to answer'])}
    ${widget('place', 'Country', ['Canada', 'United States'])}`;
  const data = { race, vet: ['Yes', 'No', 'I choose not to answer'], place: ['Canada', 'United States'] };
  for (const input of document.querySelectorAll('input[data-t]')) {
    const list = document.getElementById(`l_${input.dataset.t}`);
    input.addEventListener('input', () => {
      input.dataset.picked = '';
      setTimeout(() => {
        const q = input.value.toLowerCase();
        list.replaceChildren(...data[input.dataset.t].filter((t) => t.toLowerCase().includes(q)).map((text) => {
          const o = document.createElement('div');
          o.setAttribute('role', 'option');
          o.textContent = text;
          o.addEventListener('click', () => {
            input.value = text;
            input.dataset.picked = text;
            list.replaceChildren();
          });
          return o;
        }));
      }, 100);
    });
  }
}

// Upload areas: Netflix's hidden unlabelled inputs inside drop zones, and
// Ashby's "autofill" box sitting above the real resume field.
function uploads() {
  const zone = (cls, head, inner) => `<div class="row"><div>${head}</div><div class="${cls}"><span>Drag &amp; drop file</span><button type="button">Select file</button><input type="file" style="display:none">${inner || ''}</div></div>`;
  root.innerHTML = `<h2>Resume</h2>
    ${zone('upload-resume-dropzone', 'Upload your resume/CV')}
    <h2>Additional Documents</h2>
    ${zone('file-upload-Additional_Documents', 'If applicable, please provide relevant work samples (e.g. art portfolios, design portfolios, etc.)')}`;
}

// SmartRecruiters: every field inside a web component's shadow root, the label
// both as a host attribute and as a <label for> inside, and a "apply with
// resume" parse box above the real resume drop zone.
function shadow() {
  if (!customElements.get('x-input')) {
    customElements.define('x-input', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        const id = this.getAttribute('fid');
        const type = this.getAttribute('type') || 'text';
        this.attachShadow({ mode: 'open' }).innerHTML = `<label for="${id}">${this.getAttribute('label')}*</label><input id="${id}" type="${type}">`;
      }
    });
    customElements.define('x-dropzone', class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        this.attachShadow({ mode: 'open' }).innerHTML = '<div>Choose a file or drop it here</div><input type="file">';
      }
    });
  }
  root.innerHTML = `
    <div>Easy Apply. Choose an option to autocomplete your application.</div>
    <x-dropzone data-test="apply-with-resume-container"></x-dropzone>
    <h2>Personal information</h2>
    <x-input fid="first-name-input" label="First name"></x-input>
    <x-input fid="last-name-input" label="Last name"></x-input>
    <x-input fid="email-input" type="email" label="Email"></x-input>
    <x-input fid="confirm-email-input" type="email" label="Confirm your email"></x-input>
    <h2>Resume</h2>
    <x-dropzone data-test="resume-upload"></x-dropzone>`;
}

function uploadsAshby() {
  root.innerHTML = `
    <div><div>Autofill from resume</div><p>Upload your resume here to autofill.</p><input type="file"></div>
    <div><label for="r">Resume</label><input type="file" id="r"></div>
    <div><label for="c">Cover Letter</label><input type="file" id="c"></div>`;
}

function uploadsCover() {
  root.innerHTML = `
    <div class="row"><div>Your cover letter</div><div class="dz"><input type="file" style="display:none"></div></div>
    <div class="row"><div>Your CV</div><div class="dz"><input type="file" style="display:none"></div></div>
    <div class="row"><div>Headshot photo</div><div class="dz bg-cover"><input type="file" style="display:none"></div></div>`;
}

// Link boxes: one that asks for several kinds, one for a single kind, and a
// label that sits four levels above its box.
function links() {
  root.innerHTML = `
    <h2>Links</h2>
    <div><label for="a">Website, Portfolio, Github...</label><input id="a"></div>
    <div><div>URL (LinkedIn, Github, Portfolio):</div><div><div><div><div><input id="b"></div></div></div></div></div>
    <div><label for="c">LinkedIn Profile</label><input id="c"></div>
    <div><label for="d">GitHub URL</label><input id="d"></div>
    <div><label for="e">Personal website</label><input id="e"></div>
    <div><label for="f">Portfolio URL</label><input id="f"></div>`;
}

// A form that clears some fields a moment after a resume goes in, the way a
// site re-reading the upload does. State appears after Country.
function wipes() {
  root.innerHTML = `
    <h2>Resume</h2>
    <div><label for="r">Resume</label><input type="file" id="r"></div>
    <h2>Contact Information</h2>
    <label for="first">First name</label><input id="first">
    <label for="country">Country</label><select id="country"><option value="">Select</option><option>United States</option></select>
    <div id="slot"></div>
    <label for="site">Portfolio URL</label><input id="site">`;
  document.getElementById('country').addEventListener('change', () => {
    setTimeout(() => {
      document.getElementById('slot').innerHTML = '<label for="state">State</label><select id="state"><option value="">Select</option><option>Georgia</option></select>';
    }, 250);
  });
  document.getElementById('r').addEventListener('change', () => {
    // The site's own parsing lands later and clears things.
    setTimeout(() => {
      for (const id of ['first', 'site', 'country']) document.getElementById(id).value = '';
      const state = document.getElementById('state');
      if (state) state.value = '';
      document.getElementById('first').dataset.wiped = '1';
    }, 2200);
  });
}

// Built like Scopely's Greenhouse form: names and country asked twice, and
// "how did you hear" with different option lists.
function askedTwice() {
  const dd = (id, q, items) => `<div><label for="${id}">${q}</label><select id="${id}"><option value="">Select...</option>${items.map((l) => `<option>${l}</option>`).join('')}</select></div>`;
  root.innerHTML = `
    <h2>Apply for this job</h2>
    <div><label for="f1">First Name*</label><input id="f1"></div>
    <div><label for="l1">Last Name*</label><input id="l1"></div>
    <div><label for="e1">Email*</label><input id="e1"></div>
    ${dd('c1', 'Country', ['Canada', 'United States'])}
    <div><label for="p1">Phone</label><input id="p1"></div>
    <div><label for="f2">Preferred First Name*</label><input id="f2"></div>
    <div><label for="l2">Preferred Last Name*</label><input id="l2"></div>
    ${dd('c2', 'Country*', ['Canada', 'United States'])}
    <div><label for="ci">City*</label><input id="ci"></div>
    <div><label for="pc">Preferred city</label><input id="pc"></div>
    ${dd('rs', 'Will you require relocation support?*', ['Yes', 'No'])}
    ${dd('ro', 'Are you open to relocation?', ['Yes', 'No'])}
    ${dd('h1', 'How did you hear about Scopely?', ['Friend', 'Indeed Job Board', 'LinkedIn Post', 'Other'])}
    ${dd('h2', 'Where did you hear about this job?', ['Friend', 'Indeed', 'Other'])}
    ${dd('h3', 'How did you find this role?', ['Friend', 'Other (please specify)'])}
    ${dd('h4', 'How did you first learn of us?', ['Friend', 'Billboard'])}
    <div><label for="p9">Phone (alternate)</label><input id="p9"></div>`;
}

// Built like a PeopleForce application: a flag button that opens a list drawn
// elsewhere on the page, a rich-text cover letter over a hidden textarea, and a
// salary box beside a currency picker. The consent boxes must stay untouched.
function peopleforce(currency) {
  const codes = [['Ukraine', '+380'], ['Andorra', '+376'], ['Canada', '+1'], ['United States Virgin Islands', '+1340'], ['United States', '+1'], ['Mexico', '+52']];
  root.innerHTML = `
    <div><label for="pf_name">Full name</label><input id="pf_name"></div>
    <div><label for="pf_email">Email</label><input id="pf_email"></div>
    <div><label for="pf_phone_h">Phone numbers</label>
      <div><div><button type="button" id="flagBtn" aria-haspopup="dialog" aria-expanded="false"><i></i></button><input type="tel" id="pf_tel"></div></div>
      <input type="tel" id="pf_phone_h" name="phone" style="display:none"></div>
    <div><label for="pf_cover">Cover letter</label>
      <div id="coverBox"><div class="fr-box"><div class="fr-wrapper"><div class="fr-element fr-view" contenteditable="true"><br></div></div></div>
      <textarea id="pf_cover" style="display:none"></textarea></div></div>
    <div><label for="pf_comp">Desired base compensation</label>
      <div><div><input id="pf_comp" type="text"></div><div><div><input id="cur" type="text" readonly value="${currency}" style="cursor:pointer"></div></div></div></div>
    <label><input type="checkbox" id="gdpr1"> I agree to the processing of my personal data</label>
    <label><input type="checkbox" id="gdpr2"> I consent to the storage of my data for 24 months</label>`;
  const area = document.getElementById('pf_cover');
  document.querySelector('.fr-element').addEventListener('input', (e) => { area.value = e.target.innerHTML; });
  const dial = { value: '' };
  const tel = document.getElementById('pf_tel');
  tel.addEventListener('input', () => { document.getElementById('pf_phone_h').value = `${dial.value}${tel.value}`; });
  const btn = document.getElementById('flagBtn');
  btn.addEventListener('click', () => {
    if (document.getElementById('flagList')) return;
    btn.setAttribute('aria-expanded', 'true');
    const list = document.createElement('div');
    list.id = 'flagList';
    list.setAttribute('role', 'listbox');
    for (const [name, code] of codes) {
      const o = document.createElement('div');
      o.setAttribute('role', 'option');
      o.innerHTML = `<div><span>${name}</span></div><span>${code}</span>`;
      o.addEventListener('click', () => {
        btn.dataset.country = name;
        dial.value = code.replace('+', '+');
        btn.querySelector('i').outerHTML = `<img alt="${name}" src="data:image/svg+xml,%3csvg/%3e">`;
        btn.setAttribute('aria-expanded', 'false');
        list.remove();
      });
      list.append(o);
    }
    document.body.append(list);
  });
  const cur = document.getElementById('cur');
  cur.addEventListener('click', () => {
    if (document.getElementById('curList')) return;
    const list = document.createElement('div');
    list.id = 'curList';
    for (const name of ['EUR - Euro', 'UAH - Ukrainian Hryvnia', 'USD - United States Dollar']) {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<div><div class="tw-truncate">${name}</div></div>`;
      item.addEventListener('click', () => { cur.value = name; list.remove(); });
      list.append(item);
    }
    cur.parentElement.append(list);
  });
}

// Yes/no questions nothing built-in recognizes, as a dropdown and as radios.
function taughtq() {
  const dd = (id, q) => `<div><label for="${id}">${q}</label><select id="${id}"><option value="">Select...</option><option>Yes</option><option>No</option></select></div>`;
  root.innerHTML = `
    <h2>Questions</h2>
    ${dd('t1', 'Do you consent to a background check?*')}
    ${dd('t2', 'Are you comfortable with occasional travel?')}
    <fieldset><legend>Can you work weekends?</legend>
      <label><input type="radio" name="wk" id="wk1">Yes</label><label><input type="radio" name="wk" id="wk2">No</label></fieldset>
    ${dd('t3', 'Have you ever changed your name?')}
    ${dd('rs', 'Will you require relocation support?*')}
    ${dd('ro', 'Are you open to relocation?')}
    ${dd('rs2', 'Do you need relocation assistance?')}
    ${dd('ro2', 'Would you be willing to relocate?')}`;
}

// Workable: Education and Experience are <p> rows under a "Profile" heading,
// each with "+ Add". Add opens one editor; every Add is disabled until it is
// saved with Update, which turns it into a summary card.
function workable() {
  const h = React.createElement;
  const FIELDS = {
    experience: [['title', 'Title'], ['company', 'Company'], ['industry', 'Industry'], ['summary', 'Summary', 'area'],
      ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date']],
    education: [['school', 'School'], ['field_of_study', 'Field of study'], ['degree', 'Degree'],
      ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date']],
  };
  window.__state = { experience: [], education: [] };
  function App() {
    const [saved, setSaved] = React.useState({ experience: [], education: [] });
    const [editing, setEditing] = React.useState(null);
    const [draft, setDraft] = React.useState({});
    window.__state = saved;
    const save = () => {
      const required = editing === 'experience' ? 'title' : 'school';
      if (!draft[required]) return;
      setSaved((s) => ({ ...s, [editing]: [...s[editing], draft] }));
      setEditing(null);
    };
    const field = ([name, label, type]) => h('div', { key: name }, h('label', null,
      h('span', null, h('span', { id: `${name}_label` }, h('strong', null, label))),
      type === 'area'
        ? h('textarea', { id: name, name, rows: 5, value: draft[name] || '', onChange: (e) => setDraft({ ...draft, [name]: e.target.value }) })
        : h('input', { id: type === 'date' ? undefined : name, name, type: 'text', placeholder: type === 'date' ? 'MM/YYYY' : undefined,
          inputMode: type === 'date' ? 'tel' : undefined, value: draft[name] || '',
          onChange: (e) => setDraft({ ...draft, [name]: e.target.value }) })));
    const section = (kind, label) => h('div', { 'data-ui': kind },
      h('div', null, h('p', { id: `${kind}_label` }, label, ' ', h('small', null, '(Optional)')),
        h('button', { type: 'button', 'data-ui': 'add-section', 'aria-label': `Add ${label}`, disabled: !!editing,
          onClick: () => { setDraft({}); setEditing(kind); } }, '+ Add')),
      h('ul', null,
        saved[kind].map((d, i) => h('li', { key: i }, h('div', null, d.title || d.school), h('div', null, d.company || d.degree),
          h('button', { type: 'button' }, 'Edit'))),
        editing === kind && h('li', { key: 'edit' }, h('div', { 'data-ui': 'editor' }, FIELDS[kind].map(field),
          kind === 'experience' && h('label', null, h('input', { type: 'checkbox', name: 'current',
            checked: !!draft.current, onChange: (e) => setDraft({ ...draft, current: e.target.checked }) }), 'I currently work here'),
          h('div', null, h('button', { type: 'button', 'data-ui': 'save-section', onClick: save }, 'Update'),
            h('button', { type: 'button', 'data-ui': 'cancel-section', onClick: () => setEditing(null) }, 'Cancel'))))));
    return h('div', null,
      h('h2', null, 'Personal information'),
      h('label', null, 'First name ', h('input', { id: 'firstname', name: 'firstname' })),
      h('section', null, h('div', null, h('h2', null, 'Profile')),
        section('education', 'Education'), section('experience', 'Experience'),
        h('label', null, 'Summary ', h('textarea', { id: 'summary', name: 'summary' }))),
      h('button', { type: 'submit' }, 'Submit application'));
  }
  ReactDOM.createRoot(root).render(h(App));
}

// The Experience / Education rows from a real report: bold titles in plain
// divs, a "+ Add" with an icon, nothing else until Add is pressed. Variants:
// button (a real <button>), div (a clickable div), shadow (inside a shadow
// root), modal (the editor opens in a dialog).
function rows(variant) {
  window.__state = { Experience: [], Education: [] };
  const FIELDS = {
    Experience: [['Job title', 'jt'], ['Company', 'co'], ['Start date', 'sd', 'MM/YYYY'], ['End date', 'ed', 'MM/YYYY']],
    Education: [['School', 'sc'], ['Degree', 'dg'], ['Start date', 'sd', 'MM/YYYY'], ['End date', 'ed', 'MM/YYYY']],
  };
  const host = variant === 'shadow' ? root.attachShadow({ mode: 'open' }) : root;
  const css = document.createElement('style');
  css.textContent = '.row{display:flex;justify-content:space-between;padding:16px;border-top:1px solid #ddd}.t{font-weight:700;font-size:20px}'
    + '.add{border:1px solid #d9480f;color:#d9480f;border-radius:8px;padding:4px 10px;background:#fff;cursor:pointer}.dlg{position:fixed;inset:20% 20%;background:#fff;border:1px solid #000;padding:12px}';
  host.append(css);
  const wrap = document.createElement('div');
  host.append(wrap);
  wrap.innerHTML = '<label>First name <input id="fn"></label>';
  for (const kind of ['Experience', 'Education']) {
    const sec = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'row';
    head.innerHTML = `<div class="t">${kind}</div>`;
    const add = document.createElement(variant === 'div' ? 'div' : 'button');
    add.className = 'add';
    if (variant !== 'div') add.type = 'button';
    add.innerHTML = '<svg width="12" height="12"><path d="M6 0v12M0 6h12" stroke="currentColor"/></svg> <span>Add</span>';
    head.append(add);
    const list = document.createElement('div');
    sec.append(head, list);
    wrap.append(sec);
    add.addEventListener('click', () => {
      if (add.dataset.open) return;
      add.dataset.open = '1';
      const ed = document.createElement('div');
      if (variant === 'modal') ed.className = 'dlg', ed.setAttribute('role', 'dialog');
      const entry = {};
      for (const [label, id, ph] of FIELDS[kind]) {
        const l = document.createElement('label');
        l.textContent = label;
        const inp = document.createElement('input');
        inp.placeholder = ph || '';
        inp.addEventListener('input', () => { entry[id] = inp.value; });
        l.append(inp);
        ed.append(l);
      }
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      save.onclick = () => {
        window.__state[kind].push(entry);
        ed.remove();
        delete add.dataset.open;
        const card = document.createElement('div');
        card.textContent = Object.values(entry).join(' / ');
        list.append(card);
      };
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => { ed.remove(); delete add.dataset.open; };
      ed.append(save, cancel);
      (variant === 'modal' ? wrap : list).append(ed);
    });
  }
}

// SAP SuccessFactors style: Title, Company, Office location and School are
// search-as-you-type boxes. Typing offers suggestions; Escape throws the typed
// text away; text only counts once the box is left or a suggestion is picked.
// Save refuses an empty Title (or School).
function sf(slow) {
  window.__state = { Experience: [], Education: [] };
  const SUGGEST = {
    company: ['Acme Platforms, Inc.', 'Northwind Studio', 'Riverside State University', 'Contoso VFX'],
    school: ['Riverside State University', 'Riverside Area Technical College', 'Lakeside State University'],
    degree: ["Master of Social Work", "Bachelor of Arts"],
    title: ['Senior Artist', 'Technical Artist'],
    location: [],
  };
  const FIELDS = {
    Experience: [['Title*', 'title', 'combo'], ['Company', 'company', 'combo'], ['Office location', 'location', 'combo'],
      ['Description', 'desc', 'area'], ['From*', 'from', 'date'], ['To*', 'to', 'date']],
    Education: [['School*', 'school', 'combo'], ['Degree', 'degree', 'combo'], ['From*', 'from', 'date'], ['To*', 'to', 'date']],
  };
  root.innerHTML = '<style>.row{display:flex;justify-content:space-between;padding:12px;border-top:1px solid #ddd}.t{font-weight:700}'
    + '.list{border:1px solid #888;background:#fff;position:absolute;z-index:5}.list div{padding:2px 8px;cursor:pointer}.err{color:#c00}</style>';
  let uid = 0;
  for (const kind of ['Experience', 'Education']) {
    const sec = document.createElement('section');
    sec.innerHTML = `<div class="row"><div class="t">${kind}</div><button type="button" class="add"><span>+</span> Add</button></div><div class="cards"></div>`;
    root.append(sec);
    const add = sec.querySelector('.add');
    const cards = sec.querySelector('.cards');
    add.onclick = () => {
      if (add.disabled || sec.querySelector('.editor')) return;
      const ed = document.createElement('div');
      ed.className = 'editor';
      const entry = {};
      const committed = {};
      const lock = (on) => document.querySelectorAll('.add').forEach((b) => { b.disabled = on; });
      if (slow) lock(true);
      for (const [label, id, type] of FIELDS[kind]) {
        const lab = document.createElement('label');
        lab.style.display = 'block';
        lab.append(label + ' ');
        if (type === 'area') {
          const ta = document.createElement('textarea');
          ta.oninput = () => { entry[id] = ta.value; };
          lab.append(ta);
        } else {
          const inp = document.createElement('input');
          const n = uid++;
          if (type === 'combo') {
            inp.setAttribute('role', 'combobox');
            inp.setAttribute('aria-autocomplete', 'list');
            inp.setAttribute('aria-controls', `lb${n}`);
            inp.setAttribute('aria-expanded', 'false');
            const list = document.createElement('div');
            list.id = `lb${n}`;
            list.className = 'list';
            list.setAttribute('role', 'listbox');
            list.hidden = true;
            const close = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
            inp.addEventListener('input', (e) => {
              if (e.inputType !== 'insertText') return;
              const q = inp.value.toLowerCase();
              const hits = SUGGEST[id].filter((s) => s.toLowerCase().includes(q));
              list.innerHTML = '';
              for (const h of hits) {
                const o = document.createElement('div');
                o.setAttribute('role', 'option');
                o.textContent = h;
                o.addEventListener('mousedown', (ev) => ev.preventDefault());
                o.addEventListener('click', () => { inp.value = h; committed[id] = h; entry[id] = h; close(); });
                list.append(o);
              }
              list.hidden = !hits.length;
              inp.setAttribute('aria-expanded', String(!list.hidden));
            });
            inp.addEventListener('keydown', (e) => {
              if (e.key === 'Escape') { inp.value = committed[id] || ''; close(); }
            });
            inp.addEventListener('blur', () => {
              if (inp.value.trim()) { committed[id] = inp.value; entry[id] = inp.value; } else { delete committed[id]; delete entry[id]; }
              setTimeout(close, 0);
            });
            lab.append(inp, list);
          } else {
            inp.placeholder = 'MM/YYYY';
            inp.oninput = () => { entry[id] = inp.value; };
            lab.append(inp);
          }
        }
        ed.append(lab);
      }
      const err = document.createElement('div');
      err.className = 'err';
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      save.onclick = () => {
        const need = kind === 'Experience' ? 'title' : 'school';
        if (!committed[need]) { err.textContent = `${need === 'title' ? 'Title' : 'School'} is required.`; return; }
        window.__state[kind].push({ ...entry, ...committed });
        ed.remove();
        if (slow) setTimeout(() => lock(false), 1500);
        const card = document.createElement('div');
        card.textContent = [committed.title || committed.school, committed.company || committed.degree].filter(Boolean).join(' at ');
        cards.append(card);
      };
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => { ed.remove(); if (slow) lock(false); };
      ed.append(err, save, cancel);
      if (slow) setTimeout(() => sec.append(ed), 600); else sec.append(ed);
    };
  }
}

({ classic, react, bare, workable, sf, sfSlow: () => sf(true), rowsButton: () => rows('button'), rowsDiv: () => rows('div'), rowsShadow: () => rows('shadow'), rowsModal: () => rows('modal'), contact, contactSimple, jobcontact, selfid, dropdowns, wordings, livepage, questions, typeahead, uploads, shadow, uploadsAshby, uploadsCover, links, wipes, askedTwice, taughtq,
  peopleforce: () => peopleforce('EUR - Euro'), peopleforceUsd: () => peopleforce('USD - United States Dollar') })[form]();

window.__profile = {
  contact: { firstName: 'Sam', lastName: 'Rivera', email: 'sam@example.com', phone: '555-0100', city: 'Oakland' },
  ref: [
    { name: 'Pat Lee', company: 'Framestore', phone: '555-0111', relationship: 'Former supervisor' },
    { name: 'Jo Van Dyke', company: 'Weta Workshop', phone: '555-0122', relationship: 'Colleague' },
  ],
  emp: [
    { company: 'Industrial Light', title: 'Senior Compositor', location: 'San Francisco, CA', start: '2021-03', current: true, description: 'Lead compositor on features.' },
    { company: 'Weta Workshop', title: 'Compositor', location: 'Wellington, NZ', start: '2017-06', end: '2021-02', description: 'Shot work.' },
    { company: 'Framestore', title: 'Junior Compositor', location: 'London, UK', start: '2014-09', end: '2017-05' },
  ],
  edu: [
    { school: 'Art Center', degree: "Bachelor's", start: '2010-09', end: '2014-05' },
    { school: 'Night College', degree: "Master's", start: '2015-01', end: '2016-12' },
  ],
};
