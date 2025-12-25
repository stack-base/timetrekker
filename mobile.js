import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- CONFIG ---
const FIREBASE_CONFIG = { apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U", authDomain: "timetrekker-app.firebaseapp.com", projectId: "timetrekker-app", storageBucket: "timetrekker-app.firebasestorage.app", messagingSenderId: "83185163190", appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17", measurementId: "G-FLZ02E1Y5L" };
const APP_ID = 'timetrekker-v1';
const SOUNDS = { 
    none: '', 
    rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', 
    cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg', 
    forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' 
};

// --- INIT ---
const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);
try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

// --- HELPERS ---
const $ = id => document.getElementById(id);
const haptic = () => { try { if(navigator.vibrate) navigator.vibrate(10); } catch(e){} };
const esc = str => { 
    if(!str) return ''; 
    const d = document.createElement('div'); 
    d.textContent = str; 
    return d.innerHTML; 
};

// *** CRITICAL FIX: Robust Date Parser ***
const parseDate = (d) => {
    if (!d) return new Date(); // Fallback to now
    if (d.toDate) return d.toDate(); // Firestore Timestamp
    if (d.seconds) return new Date(d.seconds * 1000); // Raw seconds object
    return new Date(d); // String or Date object
};

const getDayStr = d => {
    const date = parseDate(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};

// --- STATE ---
const state = {
    user: null, tasks: [], logs: [], projects: new Set(['Inbox']),
    view: 'tasks', filter: 'today',
    timer: { 
        status: 'idle', mode: 'focus', endTime: null, remaining: 1500, total: 1500, taskId: null,
        settings: { focus: 25, short: 5, long: 15, strictMode: false, autoStartPomo: false }
    },
    sound: 'none',
    chartFocus: null
};

// --- AUTH & DATA ---
onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        $('loading-screen').classList.add('opacity-0');
        setTimeout(() => $('loading-screen').classList.add('hidden'), 500);

        // UI Init
        $('user-avatar').textContent = (u.email||'U').charAt(0).toUpperCase();
        $('date-display').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        $('settings-name').textContent = u.displayName || 'User';
        $('settings-email').textContent = u.email;

        // --- Data Subscriptions ---
        // 1. Tasks
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), s => {
            try {
                state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
                state.projects = new Set(['Inbox']);
                state.tasks.forEach(t => { if(t.project) state.projects.add(t.project); });
                app.renderTasks();
                // If tasks update, analytics might change (completed counts)
                app.renderAnalyticsStats();
            } catch(e) { console.error("Task sync error", e); }
        });
        
        // 2. Timer
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid, 'timer', 'active'), s => {
            try {
                if(s.exists()) {
                    const d = s.data();
                    state.timer = { ...state.timer, ...d, endTime: d.endTime ? d.endTime.toMillis() : null };
                    if(d.settings) state.timer.settings = { ...state.timer.settings, ...d.settings };
                    app.updateTimerUI();
                    app.syncSettingsUI();
                    if(state.timer.status === 'running') startTimerLoop(); else stopTimerLoop();
                }
            } catch(e) { console.error("Timer sync error", e); }
        });

        // 3. Logs (Analytics)
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions'), s => {
            try {
                state.logs = s.docs.map(d => d.data()).sort((a,b) => {
                    const da = parseDate(a.completedAt).getTime();
                    const db = parseDate(b.completedAt).getTime();
                    return db - da; 
                });
                app.renderAnalyticsStats();
                if(state.view === 'analytics') app.renderAnalyticsChart();
            } catch(e) { console.error("Logs sync error", e); }
        });

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
    $('play-icon').className = "ph-fill ph-pause text-3xl ml-1";
    const audio = $('audio-player');
    if(audio && audio.paused && state.sound !== 'none') audio.play().catch(()=>{});
};

const stopTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    $('play-icon').className = "ph-fill ph-play text-3xl ml-1";
    const audio = $('audio-player');
    if(audio) audio.pause();
};

// --- APP LOGIC ---
const app = {
    
    // NAVIGATION
    navTo: (view) => {
        haptic();
        state.view = view;
        
        // Hide views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = $(`view-${view}`);
        if(target) target.classList.remove('hidden');
        
        // Nav Icons
        document.querySelectorAll('nav button').forEach(btn => {
            btn.classList.replace('text-brand', 'text-text-muted');
            btn.querySelector('i').classList.remove('ph-fill');
            btn.querySelector('i').classList.add('ph-bold');
        });
        
        // Active Icon
        const btn = $(`nav-${view}`);
        if(btn) {
            btn.classList.replace('text-text-muted', 'text-brand');
            btn.querySelector('i').classList.remove('ph-bold');
            btn.querySelector('i').classList.add('ph-fill');
        }

        if(view === 'analytics') setTimeout(() => app.renderAnalyticsChart(), 100); // Delay for layout
    },

    setFilter: (f) => {
        haptic();
        state.filter = f;
        document.querySelectorAll('#view-tasks .chip').forEach(c => {
            c.className = c.id === `chip-${f}` ? 'chip active px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap' : 'chip inactive px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap';
        });
        app.renderTasks();
    },

    // TASKS UI
    renderTasks: () => {
        const container = $('task-list');
        if(!container) return;
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
            
            // Priority Indicator
            const borderCol = t.priority === 'high' ? '#ef4444' : (t.priority === 'med' ? '#eab308' : 'transparent');
            
            el.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1" style="background-color: ${borderCol}"></div>
                <div class="check-area pt-1 pl-2" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${t.status==='done' ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center transition-colors">
                        ${t.status==='done' ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0" onclick="app.openTaskModal(state.tasks.find(x=>x.id==='${t.id}'))">
                    <h3 class="text-white font-medium truncate ${t.status==='done' ? 'line-through text-text-muted':''} text-[15px]">${esc(t.title)}</h3>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5">
                        <span class="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-text-muted font-medium border border-white/5">${esc(t.project || 'Inbox')}</span>
                        ${t.estimatedPomos > 1 ? `<span class="text-[10px] text-text-muted flex items-center"><i class="ph-bold ph-timer mr-1"></i>${t.completedPomos||0}/${t.estimatedPomos}</span>` : ''}
                    </div>
                </div>
                <button class="text-brand p-2 bg-brand/10 rounded-full" onclick="event.stopPropagation(); app.startFocus(this, '${t.id}')">
                    <i class="ph-fill ph-play"></i>
                </button>
            `;
            container.appendChild(el);
        });
    },

    // CRUD
    openTaskModal: (task = null) => {
        haptic();
        // Fill Projects
        const sel = $('inp-project');
        sel.innerHTML = '<option value="Inbox" class="bg-dark-surface">Inbox</option>';
        state.projects.forEach(p => {
            if(p!=='Inbox') {
                const opt = document.createElement('option');
                opt.value = p; opt.textContent = p; opt.className = 'bg-dark-surface';
                sel.appendChild(opt);
            }
        });

        $('subtasks-container').innerHTML = '';
        
        if(task) {
            $('modal-title').textContent = 'Edit Task';
            $('inp-id').value = task.id;
            $('inp-title').value = task.title;
            $('inp-date').value = task.dueDate || '';
            $('inp-est').value = task.estimatedPomos || 1;
            $('inp-priority').value = task.priority || 'none';
            $('inp-project').value = task.project || 'Inbox';
            $('inp-note').value = task.note || '';
            $('inp-tags').value = task.tags ? task.tags.join(', ') : '';
            if(task.subtasks) task.subtasks.forEach(s => app.addSubtaskUI(s));
        } else {
            $('modal-title').textContent = 'New Task';
            $('inp-id').value = '';
            $('inp-title').value = '';
            $('inp-date').value = getDayStr(new Date());
            $('inp-est').value = 1;
            $('inp-priority').value = 'none';
            $('inp-project').value = 'Inbox';
            $('inp-note').value = '';
            $('inp-tags').value = '';
        }

        $('modal-overlay').classList.remove('hidden');
        $('modal-sheet').classList.remove('translate-y-full');
        setTimeout(() => $('modal-overlay').classList.remove('opacity-0'), 10);
    },

    closeTaskModal: () => {
        $('modal-overlay').classList.add('opacity-0');
        $('modal-sheet').classList.add('translate-y-full');
        setTimeout(() => $('modal-overlay').classList.add('hidden'), 300);
    },

    addSubtaskUI: (val = '') => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-brand shrink-0"></div><input type="text" class="subtask-inp bg-transparent border-b border-dark-border w-full text-sm text-white py-1 outline-none focus:border-brand" value="${esc(val)}" placeholder="Subtask..."><button onclick="this.parentElement.remove()" class="text-text-muted p-2"><i class="ph-bold ph-x"></i></button>`;
        $('subtasks-container').appendChild(div);
    },

    saveTask: async () => {
        const title = $('inp-title').value;
        if(!title) return;
        
        const subtasks = Array.from(document.querySelectorAll('.subtask-inp')).map(i => i.value.trim()).filter(v=>v);
        const tags = $('inp-tags').value.split(',').map(t=>t.trim()).filter(t=>t);

        const data = {
            title, 
            dueDate: $('inp-date').value,
            estimatedPomos: parseInt($('inp-est').value) || 1,
            priority: $('inp-priority').value,
            project: $('inp-project').value,
            note: $('inp-note').value,
            subtasks, tags
        };

        const id = $('inp-id').value;
        app.closeTaskModal();
        
        try {
            if(id) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), data);
            } else {
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), { ...data, status: 'todo', completedPomos: 0, createdAt: new Date().toISOString() });
            }
            app.showToast('Task Saved');
        } catch(e) { app.showToast('Error saving'); }
    },

    toggleStatus: async (id, status) => {
        haptic();
        const newStatus = status === 'todo' ? 'done' : 'todo';
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), { 
            status: newStatus,
            completedAt: newStatus === 'done' ? new Date().toISOString() : null
        });
    },

    // TIMER LOGIC
    startFocus: async (btn, id) => {
        haptic();
        app.navTo('timer');
        const d = state.timer.settings.focus;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'running', taskId: id, remaining: d * 60, totalDuration: d * 60, 
            endTime: new Date(Date.now() + d * 60000), mode: 'focus',
            settings: state.timer.settings
        });
    },

    toggleTimer: async () => {
        haptic();
        if(state.timer.status === 'running') {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000))
            });
        } else {
            if(!state.timer.taskId && state.timer.mode === 'focus') { app.showToast('Select a task first'); return; }
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'running', endTime: new Date(Date.now() + state.timer.remaining * 1000)
            });
        }
    },

    resetTimer: async () => {
        haptic();
        const d = state.timer.settings[state.timer.mode];
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'idle', remaining: d * 60, totalDuration: d * 60, endTime: null
        });
    },

    skipTimer: () => app.completeTimer(),

    completeTimer: async () => {
        stopTimerLoop();
        haptic();
        const { mode, taskId } = state.timer;
        
        if(mode === 'focus' && taskId) {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos||0) + 1 });
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions'), { taskTitle: t.title, taskId: t.id, duration: state.timer.settings.focus, project: t.project||'Inbox', completedAt: serverTimestamp() });
            }
        }
        
        // Simple Mode switching
        const nextMode = mode === 'focus' ? 'short' : 'focus';
        const d = state.timer.settings[nextMode];
        const updates = { status: 'idle', mode: nextMode, remaining: d*60, totalDuration: d*60, endTime: null };
        
        if(state.timer.settings.autoStartPomo && nextMode === 'focus') {
            updates.status = 'running';
            updates.endTime = new Date(Date.now() + d*60000);
        }

        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), updates);
        app.showToast(mode === 'focus' ? 'Focus Complete!' : 'Break Over!');
    },

    updateTimerUI: () => {
        const { status, endTime, remaining, total, taskId, mode } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        
        $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        $('timer-mode-label').textContent = mode.toUpperCase();
        
        const offset = 289 * (1 - (s / (total || 1)));
        $('timer-ring-progress').style.strokeDashoffset = isNaN(offset) ? 0 : offset;
        $('timer-ring-progress').style.stroke = mode === 'focus' ? '#ff5757' : '#3b82f6';

        if(taskId) {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                $('timer-empty-state').classList.add('hidden');
                $('timer-active-state').classList.remove('hidden');
                $('timer-task-title').textContent = t.title;
                $('timer-project-badge').textContent = t.project || 'Inbox';
                $('timer-completed-count').textContent = t.completedPomos || 0;
                $('timer-total-count').textContent = t.estimatedPomos || 1;
            }
        } else {
             $('timer-empty-state').classList.remove('hidden');
             $('timer-active-state').classList.add('hidden');
        }
    },

    // ANALYTICS & SETTINGS
    syncSettingsUI: () => {
        const s = state.timer.settings;
        if(!s) return;
        $('lbl-focus').textContent = s.focus + 'm';
        $('lbl-short').textContent = s.short + 'm';
        $('lbl-long').textContent = s.long + 'm';
        $('tog-strict').checked = s.strictMode;
        $('tog-autoPomo').checked = s.autoStartPomo;
        app.setSoundUI(state.sound);
    },

    updateSetting: async (key, val) => {
        const s = { ...state.timer.settings };
        if(key === 'strictMode' || key === 'autoStartPomo') s[key] = val;
        else s[key] = parseInt(val);
        state.timer.settings = s;
        app.syncSettingsUI();
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { settings: s });
    },

    setSound: (type) => {
        state.sound = type;
        const audio = $('audio-player');
        audio.src = SOUNDS[type];
        if(type !== 'none' && state.timer.status === 'running') audio.play().catch(()=>{});
        else audio.pause();
        app.setSoundUI(type);
    },

    setSoundUI: (type) => {
        ['none','rain','cafe','forest'].forEach(k => {
            const btn = $(`sound-btn-${k}`);
            if(k === type) {
                btn.classList.replace('text-text-muted','text-brand');
                btn.classList.replace('bg-dark-active','bg-brand/10');
            } else {
                btn.classList.replace('text-brand','text-text-muted');
                btn.classList.replace('bg-brand/10','bg-dark-active');
            }
        });
    },

    renderAnalyticsStats: () => {
        const logs = state.logs;
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        $('ana-focus-time').textContent = Math.floor(totalMin / 60) + 'h ' + (totalMin % 60) + 'm';
        $('ana-tasks-done').textContent = state.tasks.filter(t => t.status === 'done').length;

        const list = $('analytics-log-list');
        if(logs.length > 0) {
            list.innerHTML = logs.slice(0, 5).map(l => `
                <div class="px-5 py-3 flex justify-between items-center text-sm">
                    <div class="flex flex-col truncate pr-4">
                        <span class="text-white font-medium truncate">${esc(l.taskTitle || 'Session')}</span>
                        <span class="text-[10px] text-text-muted">${l.project||'Inbox'}</span>
                    </div>
                    <span class="text-brand font-mono font-bold">${l.duration||25}m</span>
                </div>
            `).join('');
        }
    },

    renderAnalyticsChart: () => {
        const ctxF = $('chart-focus');
        if(!ctxF) return;
        
        if(state.chartFocus) state.chartFocus.destroy();
        
        const logs = state.logs;
        const labels = [], data = [];
        
        for(let i=6; i>=0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
            const ds = getDayStr(d);
            data.push(logs.filter(l => l.completedAt && getDayStr(new Date(parseDate(l.completedAt))) === ds).reduce((a,b)=>a+(b.duration||25),0));
        }
        
        state.chartFocus = new Chart(ctxF, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: '#ff5757', borderRadius: 4, barThickness: 12 }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { display: false } }, 
                scales: { 
                    x: { grid: { display: false }, ticks: { color: '#666', font: { size: 10 } } }, 
                    y: { display: false } 
                } 
            }
        });
    },

    showToast: (msg) => {
        const t = document.createElement('div');
        t.className = "bg-dark-surface border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-xl shadow-material text-center animate-[bounce_0.2s]";
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 2500);
    },
    signOut: () => signOut(auth)
};

// Make Global
window.app = app;
app.navTo('tasks');