# History Filler

A Chrome/Edge extension that fills application forms from your resume: contact details, every employer, education and references. It clicks "Add" as many times as it needs to, and never clicks submit.

## Install

You need Chrome or Edge on a computer. The extension isn't in the Chrome Web Store, so you load it by hand, which takes about two minutes.

1. **Get the files.** Go to [github.com/tbrepo-dev/scripts](https://github.com/tbrepo-dev/scripts), click the green **Code** button, then **Download ZIP**. The ZIP holds the owner's other script folders too; you only need the `history-filler` folder inside it.
2. **Unzip it**, then copy the **`history-filler`** folder somewhere you will keep, such as `Documents\History Filler`. Chrome runs the extension straight from that folder, so don't delete or move it afterward. Open it and check that you can see a file called `manifest.json` directly inside. If it's inside another folder, use that inner folder in step 4.
3. In Chrome, go to `chrome://extensions` (in Edge, `edge://extensions`) and turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the folder from step 2.
5. Click the puzzle-piece icon in the toolbar and **pin** History Filler so its **H** button is always there.

Chrome may show a "developer mode extensions" warning when it starts. That's expected for an extension loaded this way.

**Updating:** download the ZIP again, copy the files in its `history-filler` folder over your old folder (replace everything), then click the circular reload arrow on History Filler at `chrome://extensions`. Your profile is stored in the browser, so it's kept.

**Moving to another computer or browser:** on the profile page, use **Export JSON** under Backup, then **Import JSON** on the other one.

## Set up your profile

1. Click the extension, then **Edit profile**.
2. Paste an Anthropic API key and click **Load resume** (PDF, .docx or text). Reading a resume costs a few cents at most.
3. Check what it found, and type in your references, since most resumes don't list them.

No API key? Under **Load resume**, use the Claude chat option: copy the instructions, paste them into Claude with your resume, then paste the reply back.

## Fill a form

Open the application and click **Fill everything** (or press Alt+Shift+F). Then review the page:

- **Green outline:** filled.
- **Orange outline:** it couldn't set this one, so do it by hand.

Fields that already have a value are left alone unless you tick **Replace values already in the form**.

If it misses a field, click **Teach a field**, click the field and say what it is. That's remembered for the site.

If it leaves a yes/no question empty, use **Teach a field** on the question and choose **Always answer Yes** or **No**. That's remembered by the question's wording, on every site, and can be removed on the profile page under **Common questions**.

## Draft answers to open questions

For free-text questions like "Why do you want to work here?", open the application and click **Draft answers to open questions**. It writes a first draft of each from your work history, skills and the job posting, and types them into the boxes with a **blue outline**. Read and edit every one before you submit: it is told to use only what your profile says, and to leave a question blank when your profile doesn't cover it (salary, notice period, a personal story).

- It skips anything your profile already answers (your own answers, common questions, contact details) and boxes that already have text.
- With an Anthropic API key saved on the profile page, drafting is one click and costs a few cents. Each person uses their own key.
- Without a key, the popup shows **Copy request for Claude**: paste it into a Claude chat, then paste the reply back into the popup and click **Use this reply**.
- A cover letter box is left alone: save your letter text on the profile page instead.

## Track applications in a Google Sheet

On the profile page, under **Job tracking sheet**, paste your sheet's link and set up the connector once (the steps are on that page: a short Apps Script you deploy as a web app in your own Google account, then paste its /exec link). **Check sheet** adds a Position / Company / Date Applied / Result header row at the top if the sheet doesn't have one.

After that, clicking Submit on an application the extension filled adds a row under the last one: position, company, today's date, and Result left blank. Each page is logged once, so clicking Submit again after a form error doesn't add another row. Jobs opened from **Find jobs** use the title and company from the listing; otherwise they're read from the page, so check the sheet now and then. If a row couldn't be sent, it's kept and goes in with the next one.

## Find jobs

Click the H icon, then **Find jobs**. Type a job title, pick a field, and optionally add a location such as `Los Angeles, Remote`. Tick the ones you like and click **Fill selected**. Each application opens in its own tab, filled in. It never submits: you check each tab and click submit yourself.

It searches the public job lists from Greenhouse, Lever and Ashby, which are per company. Add sites to search with **Include site to be searched** in the popup, or under **Where it looks** on the Find jobs page. Paste one link at a time: a Greenhouse, Lever or Ashby careers page, or a Google Sheet that lists jobs. Each is checked first, and one that can't be read (most other sites don't allow it) is turned down with the reason. A sheet must be shared as "Anyone with the link can view", and its first rows need headings like Title, Company and Link (the job's full web address); a Location and a date column are used when present. Its jobs are searched along with everything else, and so are the other jobs at any company it lists that uses Greenhouse, Lever or Ashby. The sheet is only read, never changed, so please respect whoever made it. No spreadsheet is built in. Many big VFX houses use other systems and can't be searched yet. It can also read three free job feeds, under **More job sources** on that page: Remotive and Remote OK (remote jobs, no sign-up) and Adzuna (needs a free key you get yourself). Their results link to the feed's own page, where you click Apply, and they're credited on each job. Adzuna's free access is for personal job searching only. LinkedIn, Indeed and ArtStation don't let tools read their listings, so the page has buttons that open your search there. **Google Jobs** is the most useful: it gathers LinkedIn, Indeed and company listings into one list and has a Remote filter. Open an application from there and "Fill everything" works on it. Only job titles are searched, so a title without the word you typed may show up as **Related** or not at all.

## Known limits

- Sites that open a pop-up for each job get one entry at a time: save it yourself and run it again.
- Workday usually needs an account before the form appears, and it hasn't been tested. Its custom widgets may need a few fields taught or done by hand.
- Greenhouse, Lever, Ashby and Netflix's careers site have been checked on live forms. Repeating employer sections have only been tested on local copies, because those live forms didn't ask for them.
- A cover letter goes in as a file where the form has an upload, and as text where it has a text box. Save the letter's text under **Cover letter**.
- **Desired base salary** only fills when you've entered one, and if the form shows a currency it sets that first. If it can't, it leaves the box empty and flags it.
- It answers the common questions you set in your profile (work authorization, sponsorship and so on), but not job-specific ones like salary. "How did you hear about this job" answers LinkedIn, then Indeed, then Other, whichever the form offers first.

## Privacy

Your profile, resume file and API key are stored unencrypted in this browser's extension storage. Your resume goes to Anthropic when you click **Load resume** with a key set. **Draft answers** sends your name, links, work history, education, skills, any cover letter text you saved, the questions and the job posting (never your email, phone or address): to Anthropic with your key, or to a Claude chat if you paste it yourself. If you set up a job tracking sheet, each application's position, company and date go to your own Apps Script connector, which writes them into your sheet. Nothing else of yours is sent anywhere. **Find jobs** reads public job lists and sends none of your details. The extension can run on any site, but only acts when you click it or press the hotkey. After it fills a page, it also notices when you click that page's Submit button, so it can add the job to your sheet if you set one up. Nothing is sent when you haven't.

## License

Proprietary, not open source. See [LICENSE](LICENSE). In short: it's free to use for your own job search today, it can't be shared or resold, and the owner may change the terms or add fees at any time. Using it means you agree to that.

## Rebuilding the resume parser

Only needed after editing `src/resume-parser.js`:

```bash
npm install
npm run build
```

Delete `node_modules` afterward. Chrome refuses to load an extension folder containing files that start with `_`, and the SDK has some.
