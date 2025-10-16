// --- Configuration and data ---
const SPAM_KEYWORDS = [
    'win', 'free', 'lottery', 'prize', 'congratulations', 'cheap', 'get rich', 'scheme', 'meds', 'money', 'urgent', 'click', 'offer', 'now', 'limited', 'exclusive', 'act fast', 'guaranteed', 'risk free', 'credit', 'loan', 'easy', 'investment', 'miracle', 'deal', 'discount', 'buy', 'order', 'cash', 'gift', 'reward', 'selected', 'winner', 'claim', 'unsubscribe'
];

const KEYWORD_WEIGHTS = SPAM_KEYWORDS.reduce((acc, k) => {
    acc[k] = 1; // simple equal weighting; adjustable
    return acc;
}, {});

// Samples removed per request

// --- Utilities ---
const $ = (id) => document.getElementById(id);
const debounce = (fn, wait = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
};

function wordCount(text) {
    return (text.match(/\b\w+\b/g) || []).length;
}

function analyzeLocally(text, sensitivity = 50) {
    const lower = text.toLowerCase();
    const found = [];
    let score = 0;
    for (const kw of SPAM_KEYWORDS) {
        if (lower.includes(kw)) {
            found.push(kw);
            score += KEYWORD_WEIGHTS[kw] || 1;
        }
    }
    // Map score and sensitivity to confidence
    const base = found.length > 0 ? Math.min(100, 35 + found.length * 12 + score * 3) : 5;
    const confidence = Math.round(base * (0.5 + sensitivity / 200));
    const isSpam = found.length > 0 && confidence >= 15;
    return { isSpam, confidence: Math.min(confidence, 100), found };
}

async function analyzeOnServer(text) {
    const res = await fetch('/check_spam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: text })
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    const confidence = data.probability != null ? Math.round(Number(data.probability) * 100) : (data.result === 'Spam' ? 85 : 15);
    return { isSpam: data.result === 'Spam', confidence, found: Array.isArray(data.found_keywords) ? data.found_keywords : [] };
}

function renderResult({ isSpam, confidence, found }, originalText) {
    // Highlight found keywords
    let highlighted = originalText;
    for (const kw of [...new Set(found)]) {
        const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlighted = highlighted.replace(regex, '<span class="spam-keyword">$1</span>');
    }
    const resultHtml = [
        `<div>Result: <strong>${isSpam ? 'Spam' : 'Not Spam'}</strong></div>`,
        `<div>Confidence: <strong>${confidence}%</strong></div>`,
        found.length ? `<div>Spam keywords detected:</div><div>${highlighted}</div>` : `<div>No spam keywords detected.</div>`
    ].join('');
    $('result').innerHTML = resultHtml;

    // Risk meter
    const bar = $('riskBar');
    bar.style.width = `${Math.max(5, confidence)}%`;
    bar.dataset.level = confidence;
    $('confidenceLabel').textContent = `Confidence: ${confidence}%`;
    const riskLevel = confidence >= 80 ? 'Very High' : confidence >= 60 ? 'High' : confidence >= 35 ? 'Medium' : confidence >= 15 ? 'Low' : 'Very Low';
    $('riskLabel').textContent = `Risk: ${riskLevel}`;

    // Keyword list chips
    const list = $('keywordList');
    list.innerHTML = '';
    for (const kw of [...new Set(found)]) {
        const li = document.createElement('li');
        li.className = 'chip';
        li.textContent = kw;
        list.appendChild(li);
    }

    // Tips
    const tips = $('tips');
    tips.innerHTML = '';
    if (isSpam) {
        tips.innerHTML = `<ul>
            <li>Be cautious with unexpected prizes or offers.</li>
            <li>Don’t click links from unknown senders.</li>
            <li>Verify the sender’s address and domain.</li>
        </ul>`;
    } else {
        tips.textContent = 'Looks safe based on keywords. Always double check sender and links.';
    }

        // Reply ideas panel
        const replyPanel = $('replyPanel');
        const replyList = $('replyIdeas');
        replyList.innerHTML = '';
        if (!isSpam && originalText.trim()) {
            const ideas = suggestReplies(originalText);
            ideas.forEach(t => {
                const li = document.createElement('li');
                li.className = 'reply';
                li.innerHTML = `<div class="reply-text">${escapeHtml(t)}</div><button class="btn xs ghost copy-reply">Copy</button>`;
                li.querySelector('.copy-reply').addEventListener('click', async () => {
                    try { await navigator.clipboard.writeText(t); } catch {}
                });
                replyList.appendChild(li);
            });
            replyPanel.style.display = ideas.length ? 'block' : 'none';
        } else {
            replyPanel.style.display = 'none';
        }
}

function saveHistory(entry) {
    const key = 'spamHistory';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.unshift(entry);
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 50)));
}

function renderHistory() {
    const key = 'spamHistory';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const ul = $('history');
    ul.innerHTML = '';
    arr.forEach((h, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="badge ${h.isSpam ? 'bad' : 'good'}">${h.isSpam ? 'Spam' : 'Not Spam'}</span>
            <span class="snippet">${(h.text || '').slice(0, 80).replace(/</g, '&lt;').replace(/>/g, '&gt;')}${(h.text || '').length > 80 ? '…' : ''}</span>
            <span class="muted">${h.confidence}%</span>`;
        li.title = h.text;
        ul.appendChild(li);
    });
}

function exportJSON() {
    const key = 'spamHistory';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'spam-history.json'; a.click();
    URL.revokeObjectURL(url);
}

function exportCSV() {
    const key = 'spamHistory';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    const rows = [['result', 'confidence', 'text']].concat(arr.map(h => [h.isSpam ? 'Spam' : 'Not Spam', h.confidence, (h.text || '').replace(/"/g, '""')]));
    const csv = rows.map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'spam-history.csv'; a.click();
    URL.revokeObjectURL(url);
}

function exportPDF() {
    const key = 'spamHistory';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    // Ensure jsPDF is available
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        alert('PDF library failed to load.');
        return;
    }
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const lineHeight = 18;
    const maxWidth = 515; // A4 width (595pt) - margins
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Spam Checker - History', margin, y);
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    if (arr.length === 0) {
        doc.text('No history available.', margin, y);
    } else {
        arr.forEach((h, idx) => {
            const header = `${idx + 1}. ${h.isSpam ? 'Spam' : 'Not Spam'}  |  Confidence: ${h.confidence}%`;
            const text = (h.text || '').replace(/\r/g, '');
            const wrapped = doc.splitTextToSize(text, maxWidth);

            // Add new page if needed
            const spaceNeeded = lineHeight * (2 + wrapped.length);
            const pageHeight = doc.internal.pageSize.getHeight();
            if (y + spaceNeeded > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }

            doc.setTextColor(40);
            doc.setFont('helvetica', 'bold');
            doc.text(header, margin, y);
            y += lineHeight;
            doc.setTextColor(80);
            doc.setFont('helvetica', 'normal');
            wrapped.forEach(line => {
                doc.text(line, margin, y);
                y += lineHeight;
            });
            y += 6;
        });
    }

    doc.save('spam-history.pdf');
}

async function runAnalysis() {
    const text = $('emailText').value;
    const useServer = $('serverToggle').checked;
    $('spinner').style.display = 'block';
    let result;
    try {
        if (useServer) {
            result = await analyzeOnServer(text);
        } else {
            const sensitivity = Number($('sensitivity').value || '50');
            result = analyzeLocally(text, sensitivity);
        }
    } catch (e) {
        result = analyzeLocally(text);
    } finally {
        $('spinner').style.display = 'none';
    }
    renderResult(result, text);
    saveHistory({ ts: Date.now(), ...result, text });
    renderHistory();
}

function bindUI() {
    $('analyzeBtn').addEventListener('click', runAnalysis);
    $('clearBtn').addEventListener('click', () => { $('emailText').value = ''; updateStats(); renderResult({ isSpam:false, confidence:5, found:[] }, ''); });
    $('copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('emailText').value); } catch { /* ignore */ } });
    $('pasteBtn').addEventListener('click', async () => { try { const t = await navigator.clipboard.readText(); $('emailText').value = t; triggerLive(); } catch { /* ignore */ } });
        // Sample selector removed
    $('sensitivity').addEventListener('input', debounce(() => $('liveToggle').checked && runAnalysis(), 150));
    $('liveToggle').addEventListener('change', () => $('liveToggle').checked && triggerLive());
    $('serverToggle').addEventListener('change', () => $('liveToggle').checked && triggerLive());
    $('exportJsonBtn').addEventListener('click', exportJSON);
    $('exportCsvBtn').addEventListener('click', exportCSV);
        $('exportPdfBtn').addEventListener('click', exportPDF);
    $('clearHistoryBtn').addEventListener('click', () => { localStorage.removeItem('spamHistory'); renderHistory(); });
        $('copyFirstReplyBtn').addEventListener('click', async () => {
            const first = document.querySelector('#replyIdeas .reply-text');
            if (first) {
                try { await navigator.clipboard.writeText(first.textContent || ''); } catch {}
            }
        });
        // TTS
        $('speakBtn').addEventListener('click', speakSummary);
        $('stopSpeakBtn').addEventListener('click', stopSpeaking);

    $('emailText').addEventListener('input', debounce(() => { updateStats(); $('liveToggle').checked && runAnalysis(); }, 250));
    updateStats();
    renderHistory();
}

function updateStats() {
    const text = $('emailText').value;
    $('wordCount').textContent = `${wordCount(text)} words`;
    const lower = text.toLowerCase();
    const matches = SPAM_KEYWORDS.filter(k => lower.includes(k)).length;
    $('matchCount').textContent = `${matches} matches`;
}

function triggerLive() {
    if ($('liveToggle').checked) runAnalysis();
}

// Public API to keep backward compatibility
function checkSpam() { runAnalysis(); }

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const icon = document.getElementById('darkIcon');
    icon.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
}

// Init
document.addEventListener('DOMContentLoaded', bindUI);

// --- Reply ideas ---
function escapeHtml(s){
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// --- Text-to-Speech (Web Speech API) ---
const LANG_TO_BCP47 = {
    en: 'en-US',
    ta: 'ta-IN', // Tamil
    hi: 'hi-IN', // Hindi
    kn: 'kn-IN', // Kannada
    te: 'te-IN', // Telugu
};

let cachedVoices = [];
function loadVoices() {
    cachedVoices = speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(langCode) {
    const target = LANG_TO_BCP47[langCode] || 'en-US';
    // Try exact language match
    let voice = cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(target.toLowerCase()));
    if (!voice) {
        // Fallback: same primary language
        const primary = target.split('-')[0];
        voice = cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(primary));
    }
    // As a last resort, use any available voice
    return voice || cachedVoices[0] || null;
}

function buildSpeakText() {
    const resultText = document.querySelector('#result')?.textContent || '';
    const firstReply = document.querySelector('#replyIdeas .reply-text')?.textContent || '';
    const parts = [];
    if (resultText) parts.push(resultText);
    if (firstReply) parts.push('Suggested reply:', firstReply);
    return parts.join('\n');
}

function speakSummary() {
    if (!('speechSynthesis' in window)) return;
    stopSpeaking();
    const lang = $('langSelect').value || 'en';
    const utter = new SpeechSynthesisUtterance(buildSpeakText());
    const voice = pickVoice(lang);
    if (voice) utter.voice = voice;
    utter.lang = LANG_TO_BCP47[lang] || 'en-US';
    utter.rate = 1.0; // normal speed
    utter.pitch = 1.0;
    speechSynthesis.speak(utter);
}

function stopSpeaking() {
    if (!('speechSynthesis' in window)) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
}

function detectIntent(text){
    const t = text.toLowerCase();
    if (/invoice|bill|payment|due|attached/.test(t)) return 'invoice';
    if (/meeting|call|schedule|tomorrow|today|time/.test(t)) return 'meeting';
    if (/job|interview|resume|cv|position|role/.test(t)) return 'job';
    if (/support|help|issue|problem|bug|error/.test(t)) return 'support';
    if (/order|shipment|tracking|delivery|purchase/.test(t)) return 'order';
    if (/info|information|details|clarify|question/.test(t)) return 'info';
    return 'generic';
}

function suggestReplies(text){
    const intent = detectIntent(text);
    const polite = 'Hi,\n\nThanks for reaching out.';
    const sign = '\n\nBest regards,\n[Your Name]';
    switch(intent){
        case 'invoice':
            return [
                `${polite} I’ve received your invoice and will review it shortly. Could you confirm the due date and any early payment discounts?${sign}`,
                `${polite} The invoice appears to be for [amount]. Please confirm the PO/reference and the billing period.${sign}`
            ];
        case 'meeting':
            return [
                `${polite} I’m available for a meeting. Does [date/time] work? If not, please share two alternate slots.${sign}`,
                `${polite} Let’s set an agenda so we can keep it efficient. Here are a few topics I propose: [topics].${sign}`
            ];
        case 'job':
            return [
                `${polite} I’m interested in the role. I’ve attached my resume. Could you share the job description and next steps?${sign}`,
                `${polite} Thanks for considering me. I’m available for an interview on [dates].${sign}`
            ];
        case 'support':
            return [
                `${polite} Sorry to hear about the issue. Could you share steps to reproduce, screenshots, and any error messages?${sign}`,
                `${polite} I’ve logged this for investigation. I’ll follow up with an update by [timeframe].${sign}`
            ];
        case 'order':
            return [
                `${polite} Please share your order number so I can check the status. I’ll get back with tracking details.${sign}`,
                `${polite} I’m checking with the fulfillment team. I’ll update you as soon as I have the delivery ETA.${sign}`
            ];
        case 'info':
            return [
                `${polite} Here are the details: [summary/bullet points]. Let me know if you need more information.${sign}`,
                `${polite} Could you clarify which part you’d like more detail on, so I can tailor the response?${sign}`
            ];
        default:
            return [
                `${polite} I’ve read your email and will get back to you shortly with more details.${sign}`,
                `${polite} Noted—thanks for the update. I’ll follow up if I have any questions.${sign}`
            ];
    }
}
