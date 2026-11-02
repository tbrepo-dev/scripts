// Two profiles to switch between. The one in use stays in the usual keys
// (profile, resumeFile, coverLetterFile), so filling works the same either way.
// The other waits in profileSlots.saved until it's switched to.
const DEFAULT_PROFILE_NAMES = ['Profile 1', 'Profile 2'];

const blankProfile = () => ({ contact: {}, employers: [], education: [], references: [], tools: [], customAnswers: [], skills: '', selfId: {}, coverLetterText: '' });

const newProfileSlots = () => ({ active: 0, names: [...DEFAULT_PROFILE_NAMES], saved: [null, null] });

async function getProfileSlots() {
  const { profileSlots } = await chrome.storage.local.get('profileSlots');
  return profileSlots || newProfileSlots();
}

async function switchProfile(to) {
  const stored = await chrome.storage.local.get(['profileSlots', 'profile', 'resumeFile', 'coverLetterFile']);
  const slots = stored.profileSlots || newProfileSlots();
  if (to === slots.active) return;
  const current = stored.profile || blankProfile();
  // A profile's first use keeps who you are, but not the resume or work
  // history, so one kind of job's resume can't go out with the other's.
  const next = slots.saved[to] || {
    profile: { ...blankProfile(), contact: { ...current.contact }, selfId: { ...current.selfId } },
  };
  slots.saved[slots.active] = {
    profile: current,
    resumeFile: stored.resumeFile || null,
    coverLetterFile: stored.coverLetterFile || null,
  };
  slots.saved[to] = null;
  slots.active = to;
  // All at once, so nothing can read one profile's resume with the other's details.
  await chrome.storage.local.set({
    profileSlots: slots,
    profile: next.profile,
    resumeFile: next.resumeFile || null,
    coverLetterFile: next.coverLetterFile || null,
  });
}

async function renameProfile(index, name) {
  const slots = await getProfileSlots();
  slots.names[index] = name.trim() || DEFAULT_PROFILE_NAMES[index];
  await chrome.storage.local.set({ profileSlots: slots });
}

function fillProfilePick(select, slots) {
  select.textContent = '';
  slots.names.forEach((name, i) => select.add(new Option(name, String(i))));
  select.value = String(slots.active);
}
