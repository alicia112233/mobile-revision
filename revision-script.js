// =============================================
// DATA & STATE
// =============================================
let questions = [];
let currentQ = 0;
let score = 0;
let wrongAns = 0;
let userAnswers = [];
let quizMode = 'active';
let timerInterval = null;
let timerSecondsLeft = 0;
let timerTotal = 0;

// 50 questions = 3600s, pro-rated linearly
function getAllocatedSeconds(count) { return Math.round((count / 50) * 3600); }

function startTimer(count) {
    clearInterval(timerInterval);
    timerSecondsLeft = getAllocatedSeconds(count);
    timerTotal = timerSecondsLeft;
    const bar = document.getElementById('timerBar');
    bar.classList.add('visible');
    document.getElementById('timerAlloc').textContent = `${count} questions`;
    updateTimerUI();
    timerInterval = setInterval(() => {
        timerSecondsLeft--;
        updateTimerUI();
        if (timerSecondsLeft <= 0) {
            clearInterval(timerInterval);
            timeUp();
        }
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); }

function updateTimerUI() {
    const m = String(Math.floor(timerSecondsLeft / 60)).padStart(2, '0');
    const s = String(timerSecondsLeft % 60).padStart(2, '0');
    const disp = document.getElementById('timerDisplay');
    const fill = document.getElementById('timerFill');
    if (!disp) return;
    disp.textContent = `${m}:${s}`;
    const pct = (timerSecondsLeft / timerTotal) * 100;
    fill.style.width = pct + '%';
    const isWarn = pct <= 30 && pct > 10;
    const isDanger = pct <= 10;
    disp.className = 'timer-display' + (isDanger ? ' danger' : isWarn ? ' warning' : '');
    fill.className = 'timer-fill' + (isDanger ? ' danger' : isWarn ? ' warning' : '');
}

function timeUp() {
    document.getElementById('timerDisplay').textContent = '00:00';
    // Auto-submit current unanswered, then show score
    if (currentQ < questions.length && (!userAnswers[currentQ])) {
        userAnswers[currentQ] = { selected: [], correct: questions[currentQ].correct, isCorrect: false };
    }
    showScore(true);
}

const TOPICS = {
    architecture: 'Architecture & ViewModel',
    room: 'Room & DAO',
    datastore: 'DataStore & LiveData',
    hilt: 'Hilt & DI',
    retrofit: 'Retrofit & OkHttp',
    coroutines: 'Coroutines',
    flow: 'Flow & StateFlow',
    services: 'Services & WorkManager',
    broadcast: 'Broadcast Receivers'
};

const CHEATSHEET = [
    { key: 'ViewModel', val: 'Survives config changes. Holds UI state. Part of Jetpack. Created via viewModel().' },
    { key: 'UDF (Unidirectional Data Flow)', val: 'Events flow UP (UI→VM), State flows DOWN (VM→UI).' },
    { key: '@Entity', val: 'Data class annotated for Room table. 1 instance = 1 row.' },
    { key: '@Dao', val: 'Interface with @Insert/@Update/@Delete/@Query methods. Must be interface/abstract class.' },
    { key: '@Database', val: 'Abstract class extending RoomDatabase. Singleton. Declares entities + version.' },
    { key: 'Repository', val: 'Best practice (not Jetpack). Single source of truth for data. Sits between VM and DAO.' },
    { key: 'DataStore', val: 'Replaces SharedPreferences. Preferences (key-value) or Proto (typed). Built on coroutines/Flow.' },
    { key: 'StateFlow vs LiveData', val: 'StateFlow needs initial state; LiveData does not. StateFlow requires repeatOnLifecycle to auto-stop.' },
    { key: 'Hilt @HiltAndroidApp', val: 'On Application class. Required for Hilt to work.' },
    { key: 'Hilt @AndroidEntryPoint', val: 'On Activity/Fragment. Enables field injection.' },
    { key: '@HiltViewModel + hiltViewModel()', val: 'For ViewModel DI. Use hiltViewModel() in composables.' },
    { key: '@Singleton', val: 'Same instance throughout app lifecycle. Applied to @Provides method.' },
    { key: 'Retrofit', val: 'REST client by Square. Uses OkHttp. Add @GET/@POST etc. to interface methods.' },
    { key: 'suspend fun', val: 'Can be paused and resumed. Can only be called from coroutine or another suspend fun.' },
    { key: 'launch{}', val: 'Fire-and-forget coroutine builder. Returns Job.' },
    { key: 'async{}', val: 'Returns Deferred. Use .await() to get result.' },
    { key: 'Dispatchers.Main', val: 'UI thread only. For updating LiveData, UI ops.' },
    { key: 'Dispatchers.IO', val: 'Disk/network ops. Room, file I/O, network calls.' },
    { key: 'Dispatchers.Default', val: 'CPU-intensive. Sorting, JSON parsing.' },
    { key: 'withContext()', val: 'Switch dispatcher without creating new coroutine. Suspending.' },
    { key: 'SupervisorJob', val: 'Child failure does NOT cancel parent or siblings.' },
    { key: 'viewModelScope', val: 'Auto-cancelled when ViewModel cleared.' },
    { key: 'lifecycleScope', val: 'Auto-cancelled when Lifecycle destroyed.' },
    { key: 'Cold Flow', val: 'Starts only when collected. One subscriber = one execution.' },
    { key: 'Hot Flow (SharedFlow/StateFlow)', val: 'Emits regardless of subscribers. StateFlow = latest value only.' },
    { key: 'flatMapLatest', val: 'Cancels previous flow when new value emitted. Use for search inputs.' },
    { key: 'LaunchedEffect', val: 'Coroutine inside composable. Runs on composition, cancelled on leave.' },
    { key: 'rememberCoroutineScope()', val: 'Coroutine scope outside composable lambda (e.g. onClick). Cancelled on leave.' },
    { key: 'Services (Started)', val: 'startService() → onCreate() → onStartCommand() → stopSelf() → onDestroy().' },
    { key: 'Services (Bound)', val: 'bindService() → onBind() returns IBinder → onUnbind() → onDestroy().' },
    { key: 'WorkManager', val: 'Persistent background work. Survives reboots. OneTimeWorkRequest / PeriodicWorkRequest.' },
    { key: 'BroadcastReceiver', val: 'Static (Manifest, always on) or Dynamic (code, only when app running). Prefer Dynamic.' },
];

function initCheatsheet() {
    const grid = document.getElementById('cheatsheetGrid');
    grid.innerHTML = CHEATSHEET.map(c => `
    <div class="cheat-item">
      <div class="cheat-key">${c.key}</div>
      <div class="cheat-val">${c.val}</div>
    </div>
  `).join('');
}

// =============================================
// AI QUESTION GENERATION
// =============================================
const QUIZ_PROXY_URL = 'http://localhost:8787/api/generate-questions';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

const LOCAL_QUESTION_POOL = [
    {
        type: 'SINGLE', topic: 'Architecture & ViewModel',
        question: 'In MVVM with Jetpack Compose, where should business logic and long-running data calls live?',
        code: null,
        options: ['Composable functions', 'ViewModel', 'XML layout files', 'Navigation graph'],
        correct: [1],
        explanation: 'Business logic belongs in the ViewModel to keep UI composables stateless and testable. Composables should primarily render state and emit events.'
    },
    {
        type: 'MULTI', topic: 'Room & DAO',
        question: 'Which statements about Room are correct?',
        code: null,
        options: ['DAO methods can be annotated with @Query', '@Entity defines a table schema', '@Database class must extend SQLiteOpenHelper directly', 'Room supports suspend DAO calls'],
        correct: [0, 1, 3],
        explanation: 'DAO uses Room annotations; @Entity maps to tables; suspend DAO methods are common with coroutines. @Database extends RoomDatabase, not SQLiteOpenHelper directly.'
    },
    {
        type: 'SINGLE', topic: 'DataStore & LiveData',
        question: 'What is a key advantage of DataStore over SharedPreferences?',
        code: null,
        options: ['Works only on main thread', 'Built on coroutines and Flow', 'Requires no context', 'Stores binary media efficiently'],
        correct: [1],
        explanation: 'DataStore is asynchronous and coroutine-based, exposing data as Flow for safer and modern state handling.'
    },
    {
        type: 'TF', topic: 'Hilt & DI',
        question: '@HiltAndroidApp should be applied to the Application class.',
        code: null,
        options: ['True', 'False'],
        correct: [0],
        explanation: 'True. Hilt generates the application-level dependency container from the Application class.'
    },
    {
        type: 'SINGLE', topic: 'Retrofit & OkHttp',
        question: 'Which annotation is typically used for a simple HTTP GET endpoint in Retrofit?',
        code: null,
        options: ['@Insert', '@GET', '@Provides', '@Inject'],
        correct: [1],
        explanation: '@GET is the Retrofit HTTP method annotation for GET requests.'
    },
    {
        type: 'SINGLE', topic: 'Coroutines',
        question: 'What does withContext(Dispatchers.IO) primarily do?',
        code: 'suspend fun loadData() {\n    withContext(Dispatchers.IO) {\n        // disk/network work\n    }\n}',
        options: ['Launches a new app process', 'Switches coroutine context for the enclosed block', 'Cancels parent scope', 'Blocks the UI thread'],
        correct: [1],
        explanation: 'withContext changes dispatcher/context for a suspend block and then returns to previous context.'
    },
    {
        type: 'MULTI', topic: 'Flow & StateFlow',
        question: 'Select valid differences between StateFlow and cold Flow.',
        code: null,
        options: ['StateFlow always has a current value', 'Cold Flow starts on collection', 'StateFlow never replays latest value', 'Cold Flow emits without collectors by default'],
        correct: [0, 1],
        explanation: 'StateFlow requires an initial/current value. Cold Flow does not run until collected. StateFlow does replay latest state to new collectors.'
    },
    {
        type: 'SINGLE', topic: 'Services & WorkManager',
        question: 'Which is best for guaranteed deferrable background work that should survive app restarts?',
        code: null,
        options: ['Activity lifecycle callbacks', 'WorkManager', 'BroadcastReceiver only', 'Thread.sleep in MainActivity'],
        correct: [1],
        explanation: 'WorkManager is designed for deferrable, guaranteed background tasks with OS-aware scheduling.'
    },
    {
        type: 'TF', topic: 'Broadcast Receivers',
        question: 'A dynamically registered BroadcastReceiver is active only while its registration owner is alive.',
        code: null,
        options: ['True', 'False'],
        correct: [0],
        explanation: 'True. Dynamic receivers are tied to runtime registration and typically lifecycle scope.'
    },
    {
        type: 'SINGLE', topic: 'Coroutines',
        question: 'Which coroutine builder returns a Deferred result?',
        code: null,
        options: ['launch', 'runBlocking', 'async', 'withContext'],
        correct: [2],
        explanation: 'async returns Deferred<T>, which can be awaited. launch returns Job.'
    },
    {
        type: 'SINGLE', topic: 'Architecture & ViewModel',
        question: 'In unidirectional data flow, what usually flows from ViewModel to UI?',
        code: null,
        options: ['Navigation XML', 'State', 'Gradle dependencies', 'DAO migrations'],
        correct: [1],
        explanation: 'UDF pattern: UI sends events upward; ViewModel exposes state downward.'
    },
    {
        type: 'MULTI', topic: 'Hilt & DI',
        question: 'Which annotations are directly involved in Hilt object provisioning/injection setup?',
        code: null,
        options: ['@Module', '@Provides', '@AndroidEntryPoint', '@Composable'],
        correct: [0, 1, 2],
        explanation: '@Module and @Provides define bindings, while @AndroidEntryPoint enables injection targets. @Composable is unrelated to DI setup.'
    },
    {
        type: 'SINGLE', topic: 'Room & DAO',
        question: 'Why is a repository commonly introduced between ViewModel and DAO?',
        code: null,
        options: ['To replace Room entirely', 'To centralize data sources and business rules', 'To avoid using suspend functions', 'To generate XML views'],
        correct: [1],
        explanation: 'Repository centralizes data orchestration (local/remote/cache), improving separation of concerns and testability.'
    },
    {
        type: 'TF', topic: 'Flow & StateFlow',
        question: 'flatMapLatest cancels previous inner flow when a new upstream value arrives.',
        code: null,
        options: ['True', 'False'],
        correct: [0],
        explanation: 'True. That is the key behavior of flatMapLatest and why it is useful in search/autocomplete pipelines.'
    },
    {
        type: 'SINGLE', topic: 'Services & WorkManager',
        question: 'What is required for a long-running user-visible task in the background on modern Android?',
        code: null,
        options: ['Foreground service notification', 'Only a coroutine scope', 'An @Entity class', 'A BroadcastReceiver callback'],
        correct: [0],
        explanation: 'Long-running user-visible background tasks generally require a foreground service with an ongoing notification.'
    }
];

const SYSTEM_PROMPT = `You are a strict university professor for INF2007 Mobile Application Development at SIT, Singapore. You are setting a finals MCQ quiz paper.

Topics: Android Architecture (MVVM, ViewModel, UDF), Room (Entity, DAO, Database, Relationships), Repository pattern, DataStore (Preferences vs Proto), LiveData vs StateFlow, Dependency Injection with Hilt (@HiltAndroidApp, @AndroidEntryPoint, @HiltViewModel, @Module, @Provides, @Singleton, @Qualifier), Retrofit (REST client, annotations), Android Threading (HandlerThread, Looper/Handler, Executors), Coroutines (launch, async, suspend, Dispatchers, withContext, structured concurrency, SupervisorJob, viewModelScope, lifecycleScope, cancellation), Flow (cold vs hot, SharedFlow, StateFlow, flatMapLatest, operators), Side effects (LaunchedEffect, rememberCoroutineScope, SideEffect, DisposableEffect), Android Services (started vs bound, foreground, PendingIntent), WorkManager, Broadcast Receivers (static vs dynamic, system broadcasts, permissions), Content Providers.

Generate EXACTLY {COUNT} MCQ questions for the topic: {TOPIC}.

Rules:
- Mix of: single-select (label: "SINGLE"), multi-select (label: "MULTI" - exactly 2-3 correct answers), and true/false (label: "TF" - options are exactly ["True","False"])
- 60% should be scenario-based with Kotlin code snippets
- Code snippets must be realistic and compilable Kotlin/Android code
- Questions should vary: some easy (definition), most medium (code reading), some hard (tricky edge cases)
- Explanations must be detailed and educational

Return ONLY valid JSON array, no markdown, no preamble:
[
  {
    "id": 1,
    "type": "SINGLE" | "MULTI" | "TF",
    "topic": "short topic name",
    "question": "question text (use \\n for line breaks if needed)",
    "code": "kotlin code snippet OR null if no code needed",
    "options": ["A", "B", "C", "D"] (for TF: ["True", "False"]),
    "correct": [0] for single (0-indexed array), [0,2] for multi, [0] or [1] for TF,
    "explanation": "detailed explanation of WHY the answer(s) are correct and WHY others are wrong"
  }
]`;

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function mapTopicToLabel(topicKey) {
    if (topicKey === 'mixed') return null;
    return TOPICS[topicKey] || null;
}

function generateLocalQuestions(topic, count) {
    const topicLabel = mapTopicToLabel(topic);
    const source = topicLabel
        ? LOCAL_QUESTION_POOL.filter(q => q.topic === topicLabel)
        : LOCAL_QUESTION_POOL;
    const basePool = source.length ? source : LOCAL_QUESTION_POOL;

    const out = [];
    let round = 0;

    while (out.length < count) {
        const shuffled = shuffle(basePool);
        shuffled.forEach((q, idx) => {
            if (out.length >= count) return;
            const clone = {
                ...q,
                id: out.length + 1,
                question: round === 0 ? q.question : `${q.question} (Variant ${round + 1})`
            };
            out.push(clone);
        });
        round++;
    }

    return out;
}

async function fetchBatchWithRetry(topicLabel, batchSize, batchNum, totalBatches, retries = 2) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            return await fetchBatch(topicLabel, batchSize, batchNum, totalBatches);
        } catch (err) {
            lastError = err;
            await new Promise(r => setTimeout(r, 500 * attempt));
        }
    }
    throw lastError || new Error('Unknown batch failure');
}

async function fetchBatch(topicLabel, batchSize, batchNum, totalBatches) {
    const prompt = SYSTEM_PROMPT
        .replace('{COUNT}', batchSize)
        .replace('{TOPIC}', topicLabel);

    const response = await fetch(QUIZ_PROXY_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            maxTokens: 4000,
            systemPrompt: prompt,
            userPrompt: `Generate exactly ${batchSize} MCQ questions about ${topicLabel}. This is batch ${batchNum} of ${totalBatches} — make sure questions are DIFFERENT from previous batches. Return ONLY the JSON array, no other text.`
        })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();

    let text = data.content?.map(b => b.type === 'text' ? b.text : '').join('') || '';
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Could not parse batch ${batchNum} from AI response`);
    return JSON.parse(match[0]);
}

async function callClaude(topic, count) {
    const topicLabel = topic === 'mixed'
        ? 'ALL topics mixed together (Architecture, Room, DataStore, Hilt, Retrofit, Coroutines, Flow, Services, Broadcast Receivers)'
        : TOPICS[topic] || topic;
    try {
        const BATCH_SIZE = 10;
        const batches = Math.ceil(count / BATCH_SIZE);
        const hintEl = document.getElementById('loadingHint');

        // Sequential loading is slower but much more reliable for larger sets like 50 questions.
        if (hintEl) hintEl.textContent = `Connecting local AI proxy...`;
        const results = [];
        for (let i = 0; i < batches; i++) {
            const batchCount = Math.min(BATCH_SIZE, count - i * BATCH_SIZE);
            if (hintEl) hintEl.textContent = `Loading batch ${i + 1}/${batches}...`;
            const batch = await fetchBatchWithRetry(topicLabel, batchCount, i + 1, batches);
            results.push(batch);
            if (hintEl) {
                const loaded = Math.min((i + 1) * BATCH_SIZE, count);
                hintEl.textContent = `${i + 1}/${batches} batches done · ${loaded} questions ready...`;
            }
        }

        // Flatten + re-index
        let all = results.flat();
        all.forEach((q, i) => { q.id = i + 1; });
        if (all.length < count) {
            const fallbackNeeded = count - all.length;
            all = all.concat(generateLocalQuestions(topic, fallbackNeeded));
            all.forEach((q, i) => { q.id = i + 1; });
        }
        return all.slice(0, count);
    } catch (e) {
        const hintEl = document.getElementById('loadingHint');
        if (hintEl) hintEl.textContent = 'Remote generation unavailable. Switching to offline question bank...';
        return generateLocalQuestions(topic, count);
    }
}

// =============================================
// QUIZ LOGIC
// =============================================
async function startQuiz() {
    const topic = document.getElementById('topicSelect').value;
    const count = parseInt(document.getElementById('countSelect').value);

    // Reset state
    questions = [];
    currentQ = 0;
    score = 0;
    wrongAns = 0;
    userAnswers = [];
    quizMode = 'active';

    // UI state
    document.getElementById('startBtn').disabled = true;
    document.getElementById('quizContainer').classList.remove('visible');
    document.getElementById('scoreCard').classList.remove('visible');
    document.getElementById('progressSection').classList.remove('visible');
    document.getElementById('errorState').classList.remove('visible');

    const loading = document.getElementById('loadingState');
    loading.classList.add('visible');

    document.getElementById('loadingHint').textContent = 'Analysing lecture slides...';

    try {
        questions = await callClaude(topic, count);
        loading.classList.remove('visible');
        document.getElementById('startBtn').disabled = false;
        document.getElementById('timerBar').classList.remove('visible');
        startTimer(count);
        renderQuestion(0);
    } catch (e) {
        loading.classList.remove('visible');
        document.getElementById('startBtn').disabled = false;
        const errEl = document.getElementById('errorState');
        errEl.textContent = `⚠ Failed to generate questions: ${e.message}. Please try again.`;
        errEl.classList.add('visible');
    }
}

function renderQuestion(idx) {
    if (idx >= questions.length) {
        showScore();
        return;
    }

    const q = questions[idx];
    const container = document.getElementById('quizContainer');

    // Progress
    const prog = document.getElementById('progressSection');
    prog.classList.add('visible');
    document.getElementById('progressLabel').textContent = `Question ${idx + 1} of ${questions.length}`;
    document.getElementById('scoreTracker').textContent = `${score} correct`;
    const pct = ((idx) / questions.length) * 100;
    document.getElementById('progressFill').style.width = pct + '%';

    const typeBadge = {
        'SINGLE': '<span class="q-type-badge badge-single">Single Select</span>',
        'MULTI': '<span class="q-type-badge badge-multi">Multi Select</span>',
        'TF': '<span class="q-type-badge badge-tf">True / False</span>'
    }[q.type] || '';

    const codeHtml = q.code ? `<div class="code-block">${highlightKotlin(q.code)}</div>` : '';
    const multiHint = q.type === 'MULTI'
        ? `<div class="multi-hint">☑ Select all that apply — multiple correct answers</div>` : '';

    const letters = ['A', 'B', 'C', 'D', 'E'];
    const optionsHtml = q.options.map((opt, i) => `
    <div class="option" id="opt-${idx}-${i}" onclick="toggleOption(${idx}, ${i})" data-idx="${i}">
      <div class="option-letter">${q.type === 'TF' ? (i === 0 ? 'T' : 'F') : letters[i]}</div>
      <div class="option-text">${opt}</div>
    </div>
  `).join('');

    container.innerHTML = `
    <div class="question-card" id="qcard-${idx}">
      <div class="q-meta">
        ${typeBadge}
        <span class="q-topic">${q.topic || ''}</span>
      </div>
      <div class="q-text">${q.question.replace(/\n/g, '<br>')}</div>
      ${codeHtml}
      ${multiHint}
      <div class="options" id="options-${idx}">
        ${optionsHtml}
      </div>
      <div class="q-actions">
        <button class="btn btn-primary" id="submitBtn" onclick="submitAnswer(${idx})" disabled>Submit Answer</button>
        <button class="btn btn-outline" onclick="skipQuestion(${idx})">Skip →</button>
      </div>
      <div class="explanation" id="explanation-${idx}"></div>
    </div>
  `;

    container.classList.add('visible');
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Track selections for this question
    window._selected = [];
}

function toggleOption(qIdx, optIdx) {
    const q = questions[qIdx];
    if (!window._selected) window._selected = [];

    const el = document.getElementById(`opt-${qIdx}-${optIdx}`);
    const locked = el.classList.contains('locked');
    if (locked) return;

    if (q.type === 'MULTI') {
        const pos = window._selected.indexOf(optIdx);
        if (pos === -1) {
            window._selected.push(optIdx);
            el.classList.add('selected');
        } else {
            window._selected.splice(pos, 1);
            el.classList.remove('selected');
        }
    } else {
        // Single / TF — only one
        const prev = window._selected[0];
        if (prev !== undefined) {
            document.getElementById(`opt-${qIdx}-${prev}`)?.classList.remove('selected');
        }
        window._selected = [optIdx];
        el.classList.add('selected');
    }

    document.getElementById('submitBtn').disabled = window._selected.length === 0;
}

function submitAnswer(qIdx) {
    const q = questions[qIdx];
    const selected = [...window._selected].sort();
    const correct = [...q.correct].sort();

    const isCorrect = JSON.stringify(selected) === JSON.stringify(correct);

    // Lock all options
    const opts = document.querySelectorAll(`#options-${qIdx} .option`);
    opts.forEach(o => o.classList.add('locked'));

    // Highlight answers
    q.options.forEach((_, i) => {
        const el = document.getElementById(`opt-${qIdx}-${i}`);
        const isCorrectOpt = correct.includes(i);
        const isSelectedOpt = selected.includes(i);

        if (isCorrectOpt && isSelectedOpt) el.classList.add('correct');
        else if (isCorrectOpt && !isSelectedOpt) el.classList.add('missed');
        else if (!isCorrectOpt && isSelectedOpt) el.classList.add('wrong');
        el.classList.remove('selected');
    });

    if (isCorrect) score++;
    else wrongAns++;

    userAnswers[qIdx] = { selected, correct, isCorrect };

    // Show explanation
    const expEl = document.getElementById(`explanation-${qIdx}`);
    expEl.innerHTML = `<strong>${isCorrect ? '✓ Correct!' : '✗ Incorrect.'}</strong> ${q.explanation}`;
    expEl.classList.add('visible');

    // Replace submit btn with Next
    document.getElementById('submitBtn').outerHTML = `<button class="btn btn-primary" onclick="nextQuestion()">Next Question →</button>`;
    document.getElementById('scoreTracker').textContent = `${score} correct`;
}

function skipQuestion(qIdx) {
    userAnswers[qIdx] = { selected: [], correct: questions[qIdx].correct, isCorrect: false };
    wrongAns++;
    currentQ++;
    renderQuestion(currentQ);
}

function nextQuestion() {
    currentQ++;
    renderQuestion(currentQ);
}

function showScore(timedOut = false) {
    stopTimer();
    document.getElementById('timerBar').classList.remove('visible');
    document.getElementById('quizContainer').classList.remove('visible');
    document.getElementById('progressSection').classList.remove('visible');

    const total = questions.length;
    const pct = Math.round((score / total) * 100);

    let emoji = '😬';
    let label = '';
    if (pct >= 90) { emoji = '🏆'; label = 'Outstanding! Distinction level.'; }
    else if (pct >= 75) { emoji = '🎓'; label = 'Great work! Merit level.'; }
    else if (pct >= 60) { emoji = '👍'; label = 'Pass. Review your weak areas.'; }
    else if (pct >= 40) { emoji = '📚'; label = 'Needs more study. Revise the slides!'; }
    else { emoji = '😬'; label = 'Uh oh. Time for a full revision session!'; }

    document.getElementById('scoreEmoji').textContent = emoji;
    document.getElementById('finalScore').textContent = `${pct}%`;
    document.getElementById('scoreLabel').textContent = `${score} / ${total} correct · ${timedOut ? '⏰ Time\'s up! ' : ''}${label}`;
    document.getElementById('correctCount').textContent = score;
    document.getElementById('wrongCount').textContent = wrongAns;

    document.getElementById('scoreCard').classList.add('visible');
    document.getElementById('scoreCard').scrollIntoView({ behavior: 'smooth' });
}

function reviewAnswers() {
    document.getElementById('scoreCard').classList.remove('visible');
    const container = document.getElementById('quizContainer');
    container.classList.add('visible');
    container.innerHTML = '';
    quizMode = 'review';

    questions.forEach((q, idx) => {
        const ua = userAnswers[idx] || { selected: [], correct: q.correct, isCorrect: false };
        const letters = ['A', 'B', 'C', 'D', 'E'];
        const codeHtml = q.code ? `<div class="code-block">${highlightKotlin(q.code)}</div>` : '';
        const typeBadge = {
            'SINGLE': '<span class="q-type-badge badge-single">Single Select</span>',
            'MULTI': '<span class="q-type-badge badge-multi">Multi Select</span>',
            'TF': '<span class="q-type-badge badge-tf">True / False</span>'
        }[q.type] || '';

        const optionsHtml = q.options.map((opt, i) => {
            const isCorrectOpt = ua.correct.includes(i);
            const isSelectedOpt = ua.selected.includes(i);
            let cls = '';
            if (isCorrectOpt && isSelectedOpt) cls = 'correct';
            else if (isCorrectOpt && !isSelectedOpt) cls = 'missed';
            else if (!isCorrectOpt && isSelectedOpt) cls = 'wrong';
            return `
        <div class="option locked ${cls}">
          <div class="option-letter">${q.type === 'TF' ? (i === 0 ? 'T' : 'F') : letters[i]}</div>
          <div class="option-text">${opt}</div>
        </div>`;
        }).join('');

        const resultIcon = ua.isCorrect ? '✓' : '✗';
        const resultColor = ua.isCorrect ? 'var(--green)' : 'var(--red)';

        container.innerHTML += `
      <div class="question-card" style="border-color:${resultColor}22">
        <div class="q-meta">
          ${typeBadge}
          <span class="q-topic">${q.topic || ''}</span>
          <span style="margin-left:auto;font-family:JetBrains Mono,monospace;font-size:0.85rem;color:${resultColor};font-weight:700">${resultIcon} Q${idx + 1}</span>
        </div>
        <div class="q-text">${q.question.replace(/\n/g, '<br>')}</div>
        ${codeHtml}
        <div class="options">${optionsHtml}</div>
        <div class="explanation visible" style="display:block;margin-top:1rem">
          <strong>${ua.isCorrect ? '✓ Correct!' : '✗ Incorrect.'}</strong> ${q.explanation}
        </div>
      </div>`;
    });

    container.innerHTML += `<div style="text-align:center;padding:1rem"><button class="btn btn-primary" onclick="startQuiz()">New Quiz</button></div>`;
    container.scrollIntoView({ behavior: 'smooth' });
}

// =============================================
// KOTLIN SYNTAX HIGHLIGHTING
// =============================================
function highlightKotlin(code) {
    if (!code) return '';
    let html = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // annotations
    html = html.replace(/(@\w+)/g, '<span class="an">$1</span>');
    // strings
    html = html.replace(/"([^"\\]|\\.)*"/g, m => `<span class="str">${m}</span>`);
    // keywords
    const kws = ['fun', 'class', 'interface', 'abstract', 'override', 'val', 'var', 'return', 'suspend', 'launch', 'async', 'await', 'if', 'else', 'when', 'null', 'true', 'false', 'companion', 'object', 'data', 'private', 'public', 'internal', 'override', 'open', 'sealed', 'enum', 'by', 'in', 'is', 'as', 'import', 'package', 'init', 'constructor', 'super', 'this', 'it'];
    kws.forEach(kw => {
        html = html.replace(new RegExp(`\\b(${kw})\\b`, 'g'), '<span class="kw">$1</span>');
    });
    // types (UpperCase words)
    html = html.replace(/\b([A-Z][a-zA-Z0-9]+)\b/g, '<span class="tp">$1</span>');
    // comments
    html = html.replace(/(\/\/[^\n]*)/g, '<span class="cm">$1</span>');
    // numbers
    html = html.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');

    return html;
}

// Init
initCheatsheet();