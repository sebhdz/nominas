import { getProfessorKey } from '../lib/professor-key.js';
import { createTurnstile } from './turnstile.js';

const API_BASE_URL = 'https://vd3xlkw2cplwb2azb27434xd6y0wfmxh.lambda-url.us-east-2.on.aws';
const STORAGE_TOKEN_KEY = 'nominas_voter_token';
const STORAGE_SALARY_KEY = 'nominas_user_votes';
const STORAGE_REC_KEY = 'nominas_user_recommendations';

let currentProfKey = null;
let currentSalaryStats = { deserves_more: 0, is_fair: 0, deserves_less: 0, total_votes: 0 };
let currentRecStats = { recommends_yes: 0, recommends_no: 0, total_recommendations: 0, recommend_percentage: null };
let currentSalaryChoice = null;
let currentRecChoice = null;
let abortController = null;
let challenge = null;
let verified = false;
let loaded = false;
let pending = false;
let generation = 0;
let verificationMessage = '';
let verificationBusy = false;
let loadingOpinions = false;
let backgroundChallenge = false;

export function startBackgroundVerification() {
  if (challenge) return;
  startVerification(getEl('background-turnstile'), true);
}

function startVerification(container, background = false) {
  backgroundChallenge = background;
  challenge = createTurnstile(container, (passed, message, retryAllowed, busy) => {
    if (backgroundChallenge && !passed && currentProfKey) {
      challenge.destroy();
      startVerification(getEl('vote-turnstile'));
      return;
    }
    verified = passed;
    verificationMessage = message;
    verificationBusy = busy;
    const retry = getEl('retry-verification');
    if (retry) retry.hidden = !retryAllowed;
    updateVoteButtons();
  });
  challenge.start();
}

function updateVoteButtons() {
  for (const id of ['vote-recommend-yes', 'vote-recommend-no', 'vote-more', 'vote-fair', 'vote-less']) {
    const button = getEl(id);
    if (button) button.disabled = !verified || !loaded || pending;
  }
  const message = verificationMessage || (loadingOpinions ? 'Cargando opiniones…' : '');
  const busy = verificationMessage ? verificationBusy : loadingOpinions;
  const status = getEl('vote-verification-status');
  if (status) {
    status.hidden = !message;
    status.setAttribute('aria-busy', String(busy));
  }
  const label = getEl('vote-verification-message');
  if (label) label.textContent = message;
  const spinner = getEl('vote-verification-spinner');
  if (spinner) spinner.hidden = !busy;
}

const getEl = id => (typeof document !== 'undefined' ? (document.getElementById ? document.getElementById(id) : document.querySelector?.(`#${id}`)) : null);

function getVoterToken() {
  try {
    let token = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_TOKEN_KEY) : null;
    if (!token) {
      token = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `voter_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return 'anonymous_fallback_token';
  }
}

function getLocalMap(key) {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalChoice(key, profKey, choice) {
  try {
    if (typeof localStorage === 'undefined') return;
    const map = getLocalMap(key);
    if (choice) map[profKey] = choice;
    else delete map[profKey];
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

function renderUI() {
  const btnRecYes = getEl('vote-recommend-yes');
  const btnRecNo = getEl('vote-recommend-no');
  const countRecYes = getEl('count-rec-yes');
  const countRecNo = getEl('count-rec-no');
  const badgeRec = getEl('recommend-badge');

  if (countRecYes) countRecYes.textContent = String(currentRecStats.recommends_yes || 0);
  if (countRecNo) countRecNo.textContent = String(currentRecStats.recommends_no || 0);

  const totalRec = currentRecStats.total_recommendations || 0;
  if (badgeRec) {
    if (totalRec === 0) {
      badgeRec.textContent = 'Sin opiniones';
    } else {
      const pct = currentRecStats.recommend_percentage ?? Math.round(((currentRecStats.recommends_yes || 0) / totalRec) * 100);
      badgeRec.textContent = `${pct}% lo recomienda (${totalRec === 1 ? '1 opinión' : `${totalRec} opiniones`})`;
    }
  }

  if (btnRecYes) btnRecYes.setAttribute('aria-pressed', String(currentRecChoice === 'yes'));
  if (btnRecNo) btnRecNo.setAttribute('aria-pressed', String(currentRecChoice === 'no'));

  const countMore = getEl('count-more');
  const countFair = getEl('count-fair');
  const countLess = getEl('count-less');
  const totalSalaryLabel = getEl('perception-total');

  const barMore = getEl('bar-more');
  const barFair = getEl('bar-fair');
  const barLess = getEl('bar-less');

  const btnMore = getEl('vote-more');
  const btnFair = getEl('vote-fair');
  const btnLess = getEl('vote-less');

  if (countMore && countFair && countLess) {
    const totalSal = currentSalaryStats.total_votes || 0;
    countMore.textContent = String(currentSalaryStats.deserves_more || 0);
    countFair.textContent = String(currentSalaryStats.is_fair || 0);
    countLess.textContent = String(currentSalaryStats.deserves_less || 0);

    if (totalSalaryLabel) {
      totalSalaryLabel.textContent = totalSal === 1 ? '1 opinión' : `${totalSal} opiniones`;
    }

    const pctMore = totalSal > 0 ? ((currentSalaryStats.deserves_more / totalSal) * 100).toFixed(1) : 0;
    const pctFair = totalSal > 0 ? ((currentSalaryStats.is_fair / totalSal) * 100).toFixed(1) : 0;
    const pctLess = totalSal > 0 ? ((currentSalaryStats.deserves_less / totalSal) * 100).toFixed(1) : 0;

    if (barMore?.style) barMore.style.width = `${pctMore}%`;
    if (barFair?.style) barFair.style.width = `${pctFair}%`;
    if (barLess?.style) barLess.style.width = `${pctLess}%`;

    if (btnMore) btnMore.setAttribute('aria-pressed', String(currentSalaryChoice === 'more'));
    if (btnFair) btnFair.setAttribute('aria-pressed', String(currentSalaryChoice === 'fair'));
    if (btnLess) btnLess.setAttribute('aria-pressed', String(currentSalaryChoice === 'less'));
  }
}

export async function loadPerception(universityId, fullName) {
  resetPerception();
  const requestGeneration = generation;
  abortController = new AbortController();
  loadingOpinions = true;
  updateVoteButtons();
  // A pending interactive widget outside a modal would be inaccessible.
  // Keep successful background checks; otherwise continue inside the profile.
  if (backgroundChallenge && !verified) {
    challenge.destroy();
    challenge = null;
  }
  if (!challenge) startVerification(getEl('vote-turnstile'));

  currentProfKey = getProfessorKey(universityId, fullName);
  const salaryMap = getLocalMap(STORAGE_SALARY_KEY);
  const recMap = getLocalMap(STORAGE_REC_KEY);

  currentSalaryChoice = salaryMap[currentProfKey] || null;
  currentRecChoice = recMap[currentProfKey] || null;

  currentSalaryStats = { deserves_more: 0, is_fair: 0, deserves_less: 0, total_votes: 0 };
  currentRecStats = { recommends_yes: 0, recommends_no: 0, total_recommendations: 0, recommend_percentage: null };

  const salStatusEl = getEl('perception-status');
  const recStatusEl = getEl('recommend-status');
  if (salStatusEl) salStatusEl.textContent = 'Cargando opiniones…';
  if (recStatusEl) recStatusEl.textContent = '';
  renderUI();

  try {
    const res = await fetch(`${API_BASE_URL}/votes/${currentProfKey}`, {
      signal: abortController.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (generation !== requestGeneration) return;
    loadingOpinions = false;
    loaded = true;
    updateVoteButtons();

    currentSalaryStats = {
      deserves_more: data.deserves_more || 0,
      is_fair: data.is_fair || 0,
      deserves_less: data.deserves_less || 0,
      total_votes: data.total_votes || 0,
    };
    currentRecStats = {
      recommends_yes: data.recommends_yes || 0,
      recommends_no: data.recommends_no || 0,
      total_recommendations: data.total_recommendations || 0,
      recommend_percentage: data.recommend_percentage ?? null,
    };

    if (salStatusEl) salStatusEl.textContent = '';
    renderUI();
  } catch (err) {
    if (err.name === 'AbortError' || generation !== requestGeneration) return;
    loadingOpinions = false;
    updateVoteButtons();
    if (salStatusEl) salStatusEl.textContent = 'No se pudieron sincronizar las opiniones recientes.';
  }
}

export function resetPerception() {
  generation += 1;
  // Reset record state, preserving this page's widget and verification result.
  loaded = pending = false;
  loadingOpinions = false;
  updateVoteButtons();
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  currentProfKey = null;
  currentSalaryChoice = null;
  currentRecChoice = null;
  currentSalaryStats = { deserves_more: 0, is_fair: 0, deserves_less: 0, total_votes: 0 };
  currentRecStats = { recommends_yes: 0, recommends_no: 0, total_recommendations: 0, recommend_percentage: null };
}

async function castVote(choice, category = 'salary') {
  if (!currentProfKey || pending || !loaded || !verified) return;
  const requestGeneration = generation;
  const profKey = currentProfKey;
  pending = true;
  updateVoteButtons();

  const isRec = category === 'recommend';
  const statusEl = getEl(isRec ? 'recommend-status' : 'perception-status');

  const previousChoice = isRec ? currentRecChoice : currentSalaryChoice;
  const previousStats = isRec ? { ...currentRecStats } : { ...currentSalaryStats };
  const targetChoice = previousChoice === choice ? 'cancel' : choice;

  if (isRec) {
    if (previousChoice === 'yes') { currentRecStats.recommends_yes -= 1; currentRecStats.total_recommendations -= 1; }
    if (previousChoice === 'no') { currentRecStats.recommends_no -= 1; currentRecStats.total_recommendations -= 1; }

    if (targetChoice === 'yes') { currentRecStats.recommends_yes += 1; currentRecStats.total_recommendations += 1; }
    if (targetChoice === 'no') { currentRecStats.recommends_no += 1; currentRecStats.total_recommendations += 1; }

    currentRecStats.recommends_yes = Math.max(0, currentRecStats.recommends_yes);
    currentRecStats.recommends_no = Math.max(0, currentRecStats.recommends_no);
    currentRecStats.total_recommendations = Math.max(0, currentRecStats.total_recommendations);
    currentRecChoice = targetChoice === 'cancel' ? null : targetChoice;
    setLocalChoice(STORAGE_REC_KEY, profKey, currentRecChoice);
  } else {
    if (previousChoice === 'more') { currentSalaryStats.deserves_more -= 1; currentSalaryStats.total_votes -= 1; }
    if (previousChoice === 'fair') { currentSalaryStats.is_fair -= 1; currentSalaryStats.total_votes -= 1; }
    if (previousChoice === 'less') { currentSalaryStats.deserves_less -= 1; currentSalaryStats.total_votes -= 1; }

    if (targetChoice === 'more') { currentSalaryStats.deserves_more += 1; currentSalaryStats.total_votes += 1; }
    if (targetChoice === 'fair') { currentSalaryStats.is_fair += 1; currentSalaryStats.total_votes += 1; }
    if (targetChoice === 'less') { currentSalaryStats.deserves_less += 1; currentSalaryStats.total_votes += 1; }

    currentSalaryStats.deserves_more = Math.max(0, currentSalaryStats.deserves_more);
    currentSalaryStats.is_fair = Math.max(0, currentSalaryStats.is_fair);
    currentSalaryStats.deserves_less = Math.max(0, currentSalaryStats.deserves_less);
    currentSalaryStats.total_votes = Math.max(0, currentSalaryStats.total_votes);
    currentSalaryChoice = targetChoice === 'cancel' ? null : targetChoice;
    setLocalChoice(STORAGE_SALARY_KEY, profKey, currentSalaryChoice);
  }

  renderUI();
  if (statusEl) statusEl.textContent = 'Enviando opinión…';

  try {
    const res = await fetch(`${API_BASE_URL}/votes/${profKey}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        choice: targetChoice,
        category,
        voter_token: getVoterToken(),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (generation !== requestGeneration) {
      setLocalChoice(isRec ? STORAGE_REC_KEY : STORAGE_SALARY_KEY, profKey, data.user_choice || null);
      return;
    }

    if (isRec) {
      currentRecStats = {
        recommends_yes: data.recommends_yes || 0,
        recommends_no: data.recommends_no || 0,
        total_recommendations: data.total_recommendations || 0,
        recommend_percentage: data.recommend_percentage ?? null,
      };
      currentRecChoice = data.user_choice || null;
      setLocalChoice(STORAGE_REC_KEY, profKey, currentRecChoice);
    } else {
      currentSalaryStats = {
        deserves_more: data.deserves_more || 0,
        is_fair: data.is_fair || 0,
        deserves_less: data.deserves_less || 0,
        total_votes: data.total_votes || 0,
      };
      currentSalaryChoice = data.user_choice || null;
      setLocalChoice(STORAGE_SALARY_KEY, profKey, currentSalaryChoice);
    }

    renderUI();
    if (statusEl) statusEl.textContent = targetChoice === 'cancel' ? 'Opinión retirada' : 'Opinión registrada';
  } catch {
    if (generation !== requestGeneration) {
      setLocalChoice(isRec ? STORAGE_REC_KEY : STORAGE_SALARY_KEY, profKey, previousChoice);
      return;
    }
    if (isRec) {
      currentRecChoice = previousChoice;
      currentRecStats = previousStats;
      setLocalChoice(STORAGE_REC_KEY, profKey, currentRecChoice);
    } else {
      currentSalaryChoice = previousChoice;
      currentSalaryStats = previousStats;
      setLocalChoice(STORAGE_SALARY_KEY, profKey, currentSalaryChoice);
    }
    renderUI();
    if (statusEl) statusEl.textContent = 'No se pudo registrar tu opinión. Intenta nuevamente.';
  } finally {
    if (generation === requestGeneration) {
      pending = false;
      updateVoteButtons();
    }
  }
}

export function setupPerceptionListeners() {
  getEl('retry-verification')?.addEventListener('click', () => challenge?.reset());
  const btnRecYes = getEl('vote-recommend-yes');
  const btnRecNo = getEl('vote-recommend-no');

  if (btnRecYes) btnRecYes.addEventListener('click', () => castVote('yes', 'recommend'));
  if (btnRecNo) btnRecNo.addEventListener('click', () => castVote('no', 'recommend'));

  const btnMore = getEl('vote-more');
  const btnFair = getEl('vote-fair');
  const btnLess = getEl('vote-less');

  if (btnMore) btnMore.addEventListener('click', () => castVote('more', 'salary'));
  if (btnFair) btnFair.addEventListener('click', () => castVote('fair', 'salary'));
  if (btnLess) btnLess.addEventListener('click', () => castVote('less', 'salary'));
}
