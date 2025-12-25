import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- CONFIG ---
const FIREBASE_CONFIG = { apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U", authDomain: "timetrekker-app.firebaseapp.com", projectId: "timetrekker-app", storageBucket: "timetrekker-app.firebasestorage.app", messagingSenderId: "83185163190", appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17", measurementId: "G-FLZ02E1Y5L" };
const APP_ID = 'timetrekker-v1';
const SOUNDS = { 
    none: '', 
    rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', 
    cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg' 
};

// --- INIT ---
const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);
// NOTE: Persistence disabled to fix "Loading..." hang on mobile
// try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

// --- UTILS ---
const $ = id => document.getElementById(id);
const haptic = () => { try { if(navigator.vibrate) navigator.vibrate(10); } catch(e){} };
const esc = str => { if(!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; };
const parseDate = (d) => {
    if (!d) return new Date(); 
    if (d.toDate) return d.toDate(); 
    if (d.seconds) return new Date(d.seconds * 1000); 
    return new Date(d);
};
const getDayStr = d => {
    const date = parseDate(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};

// --- STATE ---
const state = {
    user: null, tasks: [], logs: [], projects: new Set(['Inbox']),
    view: 'tasks', filter: 'today',
    timer: { status: 'idle', mode: 'focus', endTime: null, remaining: 1500, total: 1500, taskId: null, settings: { focus: 25 } },
    sound: 'none', chartFocus: null
};

// --- AUTH ---
onAuthStateChanged(auth, u => {
    // 1. INSTANT UNLOCK
    const loader = $('loading-screen');
    if(loader) loader.classList.add('hidden');

    if (u) {
        state.user = u;
        try {
            if($('user-avatar')) $('user-avatar').textContent = (u.email||'U').charAt(0).toUpperCase();
            if($('settings-name')) $('settings-name').textContent = u.displayName || 'User';
            if($('settings-email')) $('settings-email').textContent = u.email;
            if($('date-display')) $('date-display').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        } catch(e) {}

        // 2. Data Subs (With error suppression)
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), s => {
            try {
                state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
                state.projects = new Set(['Inbox']);
                state.tasks.forEach(t => { if(t.project) state.projects.add(t.project); });
                app.renderTasks();
                app.renderAnalyticsStats();
            } catch(e) {}
        }, err => console.log('Tasks sync skipped', err));
        
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid, 'timer', 'active'), s => {
            try {
                if(s.exists()) {
                    const d = s.data();
                    state.timer = { ...state.timer, ...d, endTime: d.endTime ? d.endTime.toMillis() : null };
                    if(d.settings) state.timer.settings = { ...state.timer.settings, ...d.settings };
                    app.updateTimerUI();
                    if(state.timer.status === 'running') startTimerLoop(); else stopTimerLoop();
                }
            } catch(e) {}
        }, err => console.log('Timer sync skipped', err));

        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions'), s => {
            try {
                state.logs = s.docs.map(d => d.data()).sort((a,b) => parseDate(b.completedAt).getTime() - parseDate(a.completedAt).getTime());
                app.renderAnalyticsStats();
                if(state.view === 'analytics') app.renderAnalyticsChart();
            } catch(e) {}
        }, err => console.log('Logs sync skipped', err));

    } else {
        window.location.href = 'https://stack-base.github.io/account/login.html?redirectUrl=' + encodeURIComponent(window.location.href);
    }
});

let timerInterval;
const startTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        app.updateTimerUI();
        if(state.timer.status === 'running' && state.timer.endTime && Date.now() >= state.timer.endTime) app.completeTimer();
    }, 100);
    const icon = $('play-icon'); if(icon) icon.className = "ph-fill ph-pause text-3xl ml-1";
    const audio = $('audio-player'); if(audio && audio.paused && state.sound !== 'none') audio.play().catch(()=>{});
};
const stopTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    const icon = $('play-icon'); if(icon) icon.className = "ph-fill ph-play text-3xl ml-1";
    const audio = $('audio-player'); if(audio) audio.pause();
};

const app = {
    navTo: (view) => {
        haptic();
        state.view = view;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = $(`view-${view}`);
        if(target) target.classList.remove('hidden');
        document.querySelectorAll('nav button').forEach(btn => {
            btn.classList.replace('text-brand', 'text-text-muted');
            btn.querySelector('i').classList.remove('ph-fill');
            btn.querySelector('i').classList.add('ph-bold');
        });
        const btn = $(`nav-${view}`);
        if(btn) {
            btn.classList.replace('text-text-muted', 'text-brand');
            btn.querySelector('i').classList.remove('ph-bold');
            btn.querySelector('i').classList.add('ph-fill');
        }
        if(view === 'analytics') setTimeout(() => app.renderAnalyticsChart(), 50);
    },
    setFilter: (f) => {
        haptic();
        state.filter = f;
        document.querySelectorAll('#view-tasks .chip').forEach(c => c.className = c.id === `chip-${f}` ? 'chip active px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap' : 'chip inactive px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap');
        app.renderTasks();
    },
    renderTasks: () => {
        const container = $('task-list'); if(!container) return;
        container.innerHTML = '';
        const today = getDayStr(new Date());
        let list = state.tasks;
        if(state.filter === 'today') list = list.filter(t => t.status === 'todo' && t.dueDate === today);
        else if(state.filter === 'upcoming') list = list.filter(t => t.status === 'todo' && t.dueDate > today);
        else if(state.filter === 'project') list = list.filter(t => t.status === 'todo').sort((a,b) => (a.project||'').localeCompare(b.project||''));
        else if(state.filter === 'completed') list = list.filter(t => t.status === 'done');
        if(list.length === 0) $('empty-state').classList.remove('hidden'); else $('empty-state').classList.add('hidden');
        list.forEach(t => {
            const el = document.createElement('div');
            el.className = `bg-dark-surface border border-dark-border p-4 rounded-[18px] flex items-start gap-3 active:scale-[0.98] transition-transform select-none relative overflow-hidden shadow-sm`;
            el.innerHTML = `
                <div class="check-area pt-1 pl-2" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${t.status==='done' ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center transition-colors">
                        ${t.status==='done' ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0" onclick="app.openTaskModal(state.tasks.find(x=>x.id==='${t.id}'))">
                    <h3 class="text-white font-medium truncate ${t.status==='done' ? 'line-through text-text-muted':''} text-[15px]">${esc(t.title)}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5">
                        <span class="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-text-muted font-medium border border-white/5">${esc(t.project || 'Inbox')}</span>
                    </div>
                </div>
                <button class="text-brand p-2 bg-brand/10 rounded-full" onclick="event.stopPropagation(); app.startFocus(this, '${t.id}')"><i class="ph-fill ph-play"></i></button>`;
            container.appendChild(el);
        });
    },
    openTaskModal: (task = null) => {
        haptic();
        const sel = $('inp-project');
        if(sel) {
            sel.innerHTML = '<option value="Inbox" class="bg-dark-surface">Inbox</option>';
            state.projects.forEach(p => { if(p!=='Inbox') { const opt = document.createElement('option'); opt.value = p; opt.textContent = p; opt.className = 'bg-dark-surface'; sel.appendChild(opt); }});
        }
        if(task) {
            $('modal-title').textContent = 'Edit Task';
            $('inp-id').value = task.id; $('inp-title').value = task.title; $('inp-date').value = task.dueDate || ''; $('inp-est').value = task.estimatedPomos || 1;
        } else {
            $('modal-title').textContent = 'New Task';
            $('inp-id').value = ''; $('inp-title').value = ''; $('inp-date').value = getDayStr(new Date()); $('inp-est').value = 1;
        }
        $('modal-overlay').classList.remove('hidden'); $('modal-sheet').classList.remove('translate-y-full'); setTimeout(() => $('modal-overlay').classList.remove('opacity-0'), 10);
    },
    closeTaskModal: () => { $('modal-overlay').classList.add('opacity-0'); $('modal-sheet').classList.add('translate-y-full'); setTimeout(() => $('modal-overlay').classList.add('hidden'), 300); },
    saveTask: async () => {
        const title = $('inp-title').value; if(!title) return;
        const data = { title, dueDate: $('inp-date').value, estimatedPomos: parseInt($('inp-est').value) || 1, project: $('inp-project').value };
        const id = $('inp-id').value; app.closeTaskModal();
        try { if(id) await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), data); else await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), { ...data, status: 'todo', completedPomos: 0, createdAt: new Date().toISOString() }); } catch(e) {}
    },
    toggleStatus: async (id, status) => { haptic(); const s = status === 'todo' ? 'done' : 'todo'; await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), { status: s, completedAt: s === 'done' ? new Date().toISOString() : null }); },
    startFocus: async (btn, id) => { haptic(); app.navTo('timer'); await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'running', taskId: id, remaining: 1500, totalDuration: 1500, endTime: new Date(Date.now() + 1500000), mode: 'focus' }); },
    toggleTimer: async () => { haptic(); if(state.timer.status === 'running') await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000)) }); else { if(!state.timer.taskId) return; await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'running', endTime: new Date(Date.now() + state.timer.remaining * 1000) }); } },
    resetTimer: async () => { haptic(); await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'idle', remaining: 1500, totalDuration: 1500, endTime: null }); },
    skipTimer: () => app.completeTimer(),
    completeTimer: async () => { stopTimerLoop(); haptic(); const t = state.tasks.find(x => x.id === state.timer.taskId); if(t) { await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos||0) + 1 }); await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions'), { taskTitle: t.title, taskId: t.id, duration: 25, completedAt: serverTimestamp() }); } await app.resetTimer(); },
    updateTimerUI: () => {
        const { status, endTime, remaining, total, taskId } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        const offset = 289 * (1 - (s / (total || 1)));
        $('timer-ring-progress').style.strokeDashoffset = isNaN(offset) ? 0 : offset;
        if(taskId) { const t = state.tasks.find(x => x.id === taskId); if(t) { $('timer-empty-state').classList.add('hidden'); $('timer-active-state').classList.remove('hidden'); $('timer-task-title').textContent = t.title; $('timer-project-badge').textContent = t.project || 'Inbox'; $('timer-completed-count').textContent = t.completedPomos || 0; $('timer-total-count').textContent = t.estimatedPomos || 1; } }
    },
    updateSetting: (k,v) => { state.timer.settings.focus = v; $('lbl-focus').textContent = v+'m'; },
    setSound: (t) => { state.sound = t; const a = $('audio-player'); a.src = SOUNDS[t]; if(t!=='none' && state.timer.status==='running') a.play().catch(()=>{}); else a.pause(); const btn = $('sound-toggle-btn'); if(t==='none') { btn.innerHTML = '<i class="ph-fill ph-speaker-slash"></i> <span>Sound Off</span>'; btn.classList.replace('text-brand','text-text-muted'); btn.classList.replace('border-brand','border-dark-border'); } else { btn.innerHTML = '<i class="ph-fill ph-speaker-high"></i> <span>Sound On</span>'; btn.classList.replace('text-text-muted','text-brand'); btn.classList.replace('border-dark-border','border-brand'); } },
    renderAnalyticsStats: () => { const l = state.logs; const min = l.reduce((a, b) => a + (b.duration || 25), 0); $('ana-focus-time').textContent = Math.floor(min / 60) + 'h ' + (min % 60) + 'm'; $('ana-tasks-done').textContent = state.tasks.filter(t => t.status === 'done').length; const ls = $('analytics-log-list'); if(ls && l.length > 0) ls.innerHTML = l.slice(0, 5).map(x => `<div class="px-5 py-3 flex justify-between items-center text-sm"><div class="flex flex-col truncate pr-4"><span class="text-white font-medium truncate">${esc(x.taskTitle||'Session')}</span></div><span class="text-brand font-mono font-bold">${x.duration||25}m</span></div>`).join(''); },
    renderAnalyticsChart: () => { const ctx = $('chart-focus'); if(!ctx || state.chartFocus) return; const l = state.logs; const labels=[], data=[]; for(let i=6; i>=0; i--) { const d=new Date(); d.setDate(d.getDate()-i); labels.push(d.toLocaleDateString('en-US',{weekday:'short'})); const ds=getDayStr(d); data.push(l.filter(x=>x.completedAt && getDayStr(parseDate(x.completedAt))===ds).reduce((a,b)=>a+(b.duration||25),0)); } state.chartFocus = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: '#ff5757', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false } } } }); },
    signOut: () => signOut(auth)
};

window.app = app;
app.navTo('tasks');