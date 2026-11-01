// Source for resume-parser.bundle.js (npm run build). Turns a resume into the
// same profile shape the editor and filler use.
import Anthropic from '@anthropic-ai/sdk';

const text = { type: ['string', 'null'] };
const month = { type: ['string', 'null'], description: 'YYYY-MM' };
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (properties) => ({ type: 'array', items: object(properties) });

const SCHEMA = object({
  contact: object({
    firstName: text, lastName: text, email: text, phone: text, address: text, city: text,
    state: text, zip: text, country: text, linkedin: text, website: text, portfolio: text, github: text,
  }),
  employers: list({
    company: text, title: text, address: text, city: text, state: text, zip: text, country: text, phone: text,
    start: month, end: month,
    current: { type: 'boolean' }, description: text,
  }),
  education: list({
    school: text, degree: text, field: text, location: text, start: month, end: month, gpa: text,
  }),
  references: list({ name: text, title: text, company: text, phone: text, email: text, relationship: text }),
  skills: { ...text, description: 'Comma-separated' },
  notes: {
    type: 'array',
    items: { type: 'string' },
    description: 'Anything the reader should double-check, such as a date with no month.',
  },
});

const INSTRUCTIONS = `Extract this resume into the JSON format. It will be used to fill out job applications in the person's name, so accuracy matters more than completeness.

- Use only what the resume states. Leave a field null rather than guessing, and never invent references, dates or contact details.
- List employers and education most recent first. Keep each role at a company as its own employer entry.
- Write dates as YYYY-MM. If a date gives only a year, use YYYY-01 and say so in notes.
- For a job marked "Present" or similar, set current to true and end to null.
- Keep descriptions close to the resume's wording, as one plain-text block with one line per bullet.
- Employer address, city, state, ZIP and phone are the workplace's, not the person's. Fill them only when the resume gives them for that job.
- Only list references whose details are written on the resume. "Available on request" means an empty list.`;

// null means "not on the resume"; the profile just leaves those keys out.
function stripNulls(value) {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, stripNulls(v)]));
  }
  return value;
}

// resume is { pdfBase64 } or { text }.
async function parse({ apiKey, resume }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const source = resume.pdfBase64
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: resume.pdfBase64 } }
    : { type: 'text', text: `<resume>\n${resume.text}\n</resume>` };

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [source, { type: 'text', text: INSTRUCTIONS }] }],
  });

  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this file.');
  if (response.stop_reason === 'max_tokens') throw new Error('This resume was too long to read in one pass.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Claude returned no result.');
  return stripNulls(JSON.parse(block.text));
}

const LETTER_PROMPT = `Transcribe this cover letter as plain text, exactly as written. Do not add, remove, correct or reword anything.

- Lines that were only broken by the width of the page belong to one paragraph, so join them into a single line.
- Put one blank line between paragraphs.
- Keep short separate lines on their own lines: the greeting, the sign-off, the name, an address or a date.
- Reply with only the letter, with no heading or commentary.`;

// A cover letter's text, laid out the way it was written, for a form with a text box.
async function extractText({ apiKey, pdfBase64 }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: LETTER_PROMPT },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this file.');
  if (response.stop_reason === 'max_tokens') throw new Error('This file was too long to read in one pass.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Claude returned no text.');
  return block.text.replace(/\r\n?/g, '\n').trim();
}

const manualPrompt = () => `${INSTRUCTIONS}

Reply with only a JSON object matching this schema, then I'll paste it into a tool:

${JSON.stringify(SCHEMA)}`;

window.ResumeParser = { parse, extractText, manualPrompt, stripNulls };
