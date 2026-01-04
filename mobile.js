import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, getDocs, orderBy, limit, arrayUnion } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- CONFIGURATION ---
const FIREBASE_CONFIG = { apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U", authDomain: "timetrekker-app.firebaseapp.com", projectId: "timetrekker-app", storageBucket: "timetrekker-app.firebasestorage.app", messagingSenderId: "83185163190", appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17", measurementId: "G-FLZ02E1Y5L" };
const APP_ID = 'timetrekker-v1';
const ASSETS = {
    sounds: { none: '', rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg', forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' },
    icon: 'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png'
};

// --- CACHE & STORAGE HELPERS ---
const storage = {
    save: (key, data) => { try { localStorage.setItem(`${APP_ID}_${key}`, JSON.stringify(data)); } catch(e){} },
    load: (key) => { try { const d = localStorage.getItem(`${APP_ID}_${key}`); return d ? JSON.parse(d) : null; } catch(e){ return null; } },
    clear: () => { Object.keys(localStorage).forEach(k => { if(k.startsWith(APP_ID)) localStorage.removeItem(k); }); }
};

const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);

// Enable Offline Persistence
try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

const $ = id => document.getElementById(id);
const esc = (str) => { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; };
const getDayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const haptic = (type = 'light') => { 
    if(!navigator.vibrate) return; 
    try { navigator.vibrate({ light: 10, medium: 25, heavy: 40, success: [10, 30], timerDone: [200, 100, 200] }[type] || 10); } catch(e){} 
};

const wakeLock = {
    sentinel: null,
    request: async () => { if ('wakeLock' in navigator) { try { wakeLock.sentinel = await navigator.wakeLock.request('screen'); } catch (err) {} } },
    release: async () => { if (wakeLock.sentinel) { try { await wakeLock.sentinel.release(); wakeLock.sentinel = null; } catch(e){} } }
};

// --- STATE INITIALIZATION ---
const state = {
    user: null, 
    tasks: storage.load('tasks') || [], 
    logs: storage.load('logs') || [],   
    projects: new Set(storage.load('projects') || ['Inbox', 'Work', 'Personal', 'Study']),
    activeTab: 'tasks', 
    activeFilter: 'today',
    filterProject: null,
    viewingTask: null, editingId: null,
    timer: { 
        status: 'idle', endTime: null, remaining: 1500, totalDuration: 1500, taskId: null, mode: 'focus', sessionId: null, pomoCountCurrentSession: 0,
        settings: storage.load('timer_settings') || { focus: 25, short: 5, long: 15, longBreakInterval: 4, strictMode: false, autoStartPomo: false, autoStartBreak: false, disableBreak: false }
    },
    sound: 'none',
    chartTypes: { focus: 'bar', task: 'bar', hourly: 'bar', weekday: 'bar' },
    chartInstances: { focusBar: null, taskBar: null, hourly: null, weekday: null, project: null, priority: null },
    analytics: { range: 'week' },
    lastCheckTime: null,
    audioContext: null,
    audioUnlocked: false
};

// --- AUTH & LISTENERS ---
onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        
        // --- FIX 1: Set Date Immediately ---
        if($('current-date')) $('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // --- FIX 2: Set Profile Picture Immediately from Auth ---
        if (u.photoURL) {
            if($('header-avatar-img')) { $('header-avatar-img').src = u.photoURL; $('header-avatar-img').classList.remove('hidden'); }
            if($('settings-avatar-img')) { $('settings-avatar-img').src = u.photoURL; $('settings-avatar-img').classList.remove('hidden'); }
        }

        // --- FIX 3: Display Name Immediately ---
        const displayName = u.displayName || u.email.split('@')[0];
        if($('header-avatar')) $('header-avatar').textContent = displayName.charAt(0).toUpperCase();
        if($('settings-name')) $('settings-name').textContent = displayName;
        if($('settings-email')) $('settings-email').textContent = u.email;

        app.renderTasks(); 
        app.renderMiniStats();
        
        // 1. Sync User Profile (Low frequency)
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid), s => {
            if(s.exists()) {
                const d = s.data();
                // Update profile pic if database has a newer/different one
                if (d.photoURL && d.photoURL !== u.photoURL) {
                    if($('header-avatar-img')) { $('header-avatar-img').src = d.photoURL; $('header-avatar-img').classList.remove('hidden'); }
                    if($('settings-avatar-img')) { $('settings-avatar-img').src = d.photoURL; $('settings-avatar-img').classList.remove('hidden'); }
                }
            }
        });

        // 2. Efficient Task Listener
        const tasksQuery = query(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), where("status", "==", "todo"));
        onSnapshot(tasksQuery, s => {
            state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
            storage.save('tasks', state.tasks);
            
            const p = new Set(['Inbox', 'Work', 'Personal', 'Study']);
            state.tasks.forEach(t => { if(t.project && t.project !== 'Inbox') p.add(t.project); });
            state.projects = p;
            storage.save('projects', Array.from(p));

            if(state.activeFilter !== 'completed') app.renderTasks();
            app.renderMiniStats();
            if(state.timer.taskId) app.updateTimerUI();
            if(!$('project-sheet').classList.contains('translate-y-full')) app.renderProjectSheet();
        });
        
        // 3. Timer Listener
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid, 'timer', 'active'), s => {
            if(s.exists()) {
                const d = s.data();
                state.timer = { ...state.timer, ...d };
                ['strictMode','autoStartPomo','autoStartBreak','disableBreak','focus','short','long','longBreakInterval'].forEach(k => {
                    if (d[k] !== undefined) state.timer.settings[k] = d[k];
                });
                storage.save('timer_settings', state.timer.settings);
                app.updateTimerUI();
                if(state.timer.status === 'running') { startTimerLoop(); wakeLock.request(); } 
                else { stopTimerLoop(); wakeLock.release(); }
            } else {
                app.resetTimer(true);
            }
        });

        // 4. Delta-Sync Logs
        const lastLogTime = state.logs.length > 0 ? (state.logs[0].completedAt?.seconds || 0) : 0;
        const logsQuery = query(
            collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions'),
            where('completedAt', '>', new Date(lastLogTime * 1000)),
            orderBy('completedAt', 'desc'),
            limit(50)
        );

        onSnapshot(logsQuery, s => {
            const newLogs = s.docs.map(d => ({id: d.id, ...d.data()}));
            if(newLogs.length > 0) {
                const combined = [...newLogs, ...state.logs].sort((a,b) => (b.completedAt?.seconds||0) - (a.completedAt?.seconds||0));
                state.logs = combined.slice(0, 500); 
                storage.save('logs', state.logs);
                if(state.activeTab === 'analytics') app.renderAnalytics();
            } else if (state.activeTab === 'analytics') {
                app.renderAnalytics();
            }
        });

        setInterval(() => {
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (state.lastCheckTime !== currentTime) {
                state.lastCheckTime = currentTime;
                state.tasks.forEach(t => {
                    if (t.reminder === currentTime && (t.dueDate === getDayStr(now) || !t.dueDate)) {
                         try { haptic('medium'); new Notification(`Reminder: ${t.title}`, { body: "It's time for your task.", icon: ASSETS.icon }); } catch (e) {}
                    }
                });
            }
        }, 10000);

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
    if($('play-icon')) $('play-icon').className = "ph-fill ph-pause text-3xl ml-1";
};
const stopTimerLoop = () => { if(timerInterval) clearInterval(timerInterval); if($('play-icon')) $('play-icon').className = "ph-fill ph-play text-3xl ml-1"; };

document.addEventListener("visibilitychange", () => { if (!document.hidden && state.timer.status === 'running') { app.updateTimerUI(); if(state.timer.endTime && Date.now() >= state.timer.endTime) app.completeTimer(); }});
document.addEventListener('touchstart', function() { if (!state.audioUnlocked) { app.unlockAudio(); state.audioUnlocked = true; } }, { once: true });

const app = {
    customPrompt: { resolve: null, el: $('custom-prompt-modal'), input: $('prompt-input'), title: $('prompt-title') },
    settingsTimeout: null,

    unlockAudio: () => {
        if (!state.audioContext && (window.AudioContext || window.webkitAudioContext)) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (state.audioContext?.state === 'suspended') state.audioContext.resume();
        const audio = $('audio-player');
        if(audio) audio.play().then(() => { if(state.sound === 'none' || state.timer.status !== 'running') audio.pause(); }).catch(()=>{});
    },

    showPrompt: (t, v = '') => new Promise(r => {
        const p = app.customPrompt; p.resolve = r; p.title.textContent = t; p.input.value = v;
        p.el.classList.remove('hidden'); setTimeout(() => p.el.classList.remove('opacity-0'), 10); p.input.focus();
    }),
    closePrompt: v => {
        const p = app.customPrompt; p.el.classList.add('opacity-0');
        setTimeout(() => { p.el.classList.add('hidden'); if (p.resolve) p.resolve(v); p.resolve = null; }, 200);
    },

    refreshApp: () => { haptic('medium'); app.showToast('Refreshing...'); setTimeout(() => window.location.reload(), 500); },

    switchTab: (tab, pushHistory = true) => {
        haptic('light');
        if (pushHistory && tab !== 'tasks' && state.activeTab !== tab) history.pushState({ view: tab }, '', `#${tab}`);
        state.activeTab = tab;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const view = $(`view-${tab}`);
        if(view) { view.classList.remove('hidden'); if(tab === 'analytics') view.classList.add('animate-slide-up'); }
        
        document.querySelectorAll('.nav-item').forEach(el => { el.className = `nav-item flex flex-col items-center justify-center w-full h-full text-text-muted transition-colors`; el.querySelector('i').classList.replace('ph-fill', 'ph-bold'); });
        const activeBtn = $(`tab-${tab}`);
        if(activeBtn) { activeBtn.className = `nav-item flex flex-col items-center justify-center w-full h-full text-brand transition-colors`; activeBtn.querySelector('i').classList.replace('ph-bold', 'ph-fill'); }

        const isTask = tab === 'tasks';
        if($('view-header')) $('view-header').classList.toggle('hidden', !isTask);
        if($('task-filters')) $('task-filters').classList.toggle('hidden', !isTask);
        if($('fab-add')) $('fab-add').classList.toggle('hidden', !isTask);

        if(tab === 'analytics') app.renderAnalytics();
        if(tab === 'settings') {
            const s = state.timer.settings;
            if($('toggle-strict')) $('toggle-strict').checked = s.strictMode;
            if($('toggle-auto-pomo')) $('toggle-auto-pomo').checked = s.autoStartPomo;
            if($('toggle-auto-break')) $('toggle-auto-break').checked = s.autoStartBreak;
            if($('toggle-disable-break')) $('toggle-disable-break').checked = s.disableBreak;
            if($('set-focus-display')) $('set-focus-display').innerText = s.focus + 'm';
            if($('set-short-display')) $('set-short-display').innerText = s.short + 'm';
            if($('set-long-display')) $('set-long-display').innerText = s.long + 'm';
            if($('set-long-interval-display')) $('set-long-interval-display').innerText = s.longBreakInterval + 'x';
            if($('inp-long-interval')) $('inp-long-interval').value = s.longBreakInterval;
        }
    },

    setFilter: async (f) => {
        haptic('light');
        state.activeFilter = f;
        state.filterProject = null;
        document.querySelectorAll('#task-filters button').forEach(b => {
             const isF = b.id === `filter-${f}`;
             b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${isF ? 'bg-brand text-white' : 'bg-dark-active text-text-muted'}`;
             if(b.id === 'filter-folders') b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-dark-active text-text-muted border border-dark-border`;
        });

        if (f === 'completed') {
            const list = $('task-list');
            if(list) list.innerHTML = '<div class="py-10 text-center text-text-muted text-sm animate-pulse">Loading history from cloud...</div>';
            try {
                const q = query(
                    collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'),
                    where("status", "==", "done"),
                    orderBy("completedAt", "desc"),
                    limit(50)
                );
                const snap = await getDocs(q);
                const doneTasks = snap.docs.map(d => ({id: d.id, ...d.data()}));
                app.renderTasks(doneTasks);
            } catch(e) { app.showToast("Error loading history"); }
        } else {
            app.renderTasks();
        }
    },
    
    openProjectSheet: () => {
        haptic('light'); history.pushState({ modal: 'project' }, ''); app.renderProjectSheet();
        $('modal-overlay').classList.remove('hidden'); setTimeout(() => { $('modal-overlay').classList.remove('opacity-0'); $('project-sheet').classList.remove('translate-y-full'); }, 10);
    },

    renderProjectSheet: () => {
        const list = $('project-sheet-list'); if(!list) return; list.innerHTML = '';
        const pList = Array.from(state.projects).sort(); 
        pList.forEach(p => {
             const count = state.tasks.filter(t => t.project === p).length; 
             const isInbox = p === 'Inbox';
             const el = document.createElement('div');
             el.className = "w-full flex items-center justify-between p-4 bg-dark-active/50 border-b border-dark-border first:rounded-t-xl last:border-0 hover:bg-dark-active transition-colors group";
             el.innerHTML = `<button onclick="app.selectProject('${esc(p)}')" class="flex items-center gap-3 flex-1 text-left"><i class="ph-bold ph-folder text-xl ${isInbox ? 'text-brand' : 'text-text-muted'}"></i><span class="text-sm font-bold text-white">${esc(p)}</span></button><div class="flex items-center gap-3"><span class="text-xs font-medium text-text-muted bg-dark-bg px-2 py-1 rounded-md border border-dark-border mr-2">${count}</span>${!isInbox ? `<button onclick="app.renameProject('${esc(p)}')" class="p-1.5 text-text-muted hover:text-white bg-dark-bg rounded border border-dark-border active:scale-95"><i class="ph-bold ph-pencil-simple text-sm"></i></button><button onclick="app.deleteProject('${esc(p)}')" class="p-1.5 text-text-muted hover:text-red-500 bg-dark-bg rounded border border-dark-border active:scale-95"><i class="ph-bold ph-trash text-sm"></i></button>` : ''}</div>`;
             list.appendChild(el);
        });
    },
    closeProjectSheet: () => { history.back(); },
    selectProject: (p) => {
        haptic('light'); state.activeFilter = 'project'; state.filterProject = p;
        document.querySelectorAll('#task-filters button').forEach(b => b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-dark-active text-text-muted`);
        $('filter-folders').className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-brand text-white border border-brand`;
        history.back(); app.renderTasks();
    },
    promptNewProject: async () => {
        const p = await app.showPrompt("Enter new project name:");
        if (p && p.trim()) {
             state.projects.add(p.trim());
             const sel = $('inp-project'); if(sel) { const opt = document.createElement('option'); opt.value = p.trim(); opt.textContent = p.trim(); opt.className = 'bg-dark-card'; opt.selected = true; sel.appendChild(opt); }
             storage.save('projects', Array.from(state.projects));
             if(!$('project-sheet').classList.contains('translate-y-full')) app.renderProjectSheet();
        }
    },
    renameProject: async (oldName) => {
        if (oldName === 'Inbox') return;
        const newName = await app.showPrompt(`Rename "${oldName}" to:`, oldName);
        if (!newName || newName === oldName) return;
        try {
            const batch = writeBatch(db);
            const q = query(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), where("project", "==", oldName));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => { batch.update(doc.ref, { project: newName }); });
            await batch.commit();
            state.projects.delete(oldName); state.projects.add(newName);
            storage.save('projects', Array.from(state.projects));
            if(state.filterProject === oldName) { state.filterProject = newName; $('page-title').textContent = newName; }
            app.renderProjectSheet(); app.showToast('Project renamed');
        } catch(e) { app.showToast('Error renaming'); }
    },
    deleteProject: async (pName) => {
        if (pName === 'Inbox') return;
        if(!confirm(`Delete project "${pName}"? Tasks will move to Inbox.`)) return;
        try {
            const batch = writeBatch(db);
            const q = query(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), where("project", "==", pName));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => { batch.update(doc.ref, { project: 'Inbox' }); });
            await batch.commit();
            state.projects.delete(pName);
            storage.save('projects', Array.from(state.projects));
            if(state.filterProject === pName) app.setFilter('today');
            app.renderProjectSheet(); app.showToast('Project deleted');
        } catch(e) { app.showToast('Error deleting'); }
    },

    renderTasks: (dataSource = null) => {
        const list = $('task-list'); if(!list) return;
        list.innerHTML = '';
        
        const today = getDayStr(new Date());
        const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); const tomorrowStr = getDayStr(tmrw);
        
        let filtered = dataSource || state.tasks; 
        let title = "Tasks";
        
        if(state.activeFilter === 'today') { filtered = filtered.filter(t => t.dueDate === today); title = "Today"; }
        else if(state.activeFilter === 'tomorrow') { filtered = filtered.filter(t => t.dueDate === tomorrowStr); title = "Tomorrow"; }
        else if(state.activeFilter === 'upcoming') { filtered = filtered.filter(t => t.dueDate > tomorrowStr); title = "Upcoming"; }
        else if(state.activeFilter === 'past') { filtered = filtered.filter(t => t.dueDate < today && t.dueDate); title = "Past Tasks"; }
        else if(state.activeFilter === 'project') { filtered = filtered.filter(t => t.project === state.filterProject); title = state.filterProject || "Project"; }
        else if(state.activeFilter === 'completed') { title = "Completed (Recent)"; }

        if($('page-title')) $('page-title').textContent = title;
        if(filtered.length === 0) $('empty-state').classList.remove('hidden'); else $('empty-state').classList.add('hidden');

        const priMap = { high: 3, med: 2, low: 1, none: 0 };
        filtered.sort((a,b) => priMap[b.priority || 'none'] - priMap[a.priority || 'none']);

        filtered.forEach(t => {
            const el = document.createElement('div');
            const priColor = t.priority === 'high' ? 'border-red-500/50' : t.priority === 'med' ? 'border-yellow-500/50' : t.priority === 'low' ? 'border-blue-500/50' : 'border-dark-border';
            const isActive = state.timer.status === 'running' && state.timer.taskId === t.id;
            const isDone = t.status === 'done';
            el.className = `bg-dark-card border ${priColor} ${isActive ? 'ring-1 ring-brand bg-brand/5' : ''} p-4 rounded-xl flex items-start gap-3 active:scale-[0.98] transition-all select-none relative shadow-sm`;
            el.onclick = (e) => { if(!e.target.closest('.check-area') && !e.target.closest('.play-btn')) app.openTaskDetail(t); };
            
            el.innerHTML = `
                <div class="check-area pt-1" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${isDone ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center transition-colors">${isDone ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}</div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-medium truncate ${isDone ? 'line-through text-text-muted':''}">${esc(t.title)}</h3>
                    ${t.note ? `<p class="text-text-muted text-xs truncate mt-0.5">${esc(t.note)}</p>` : ''}
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium border border-brand/20">${esc(t.project || 'Inbox')}</span>
                        ${t.priority === 'high' ? '<span class="text-[10px] text-red-500 font-bold">! Urgent</span>' : ''}
                        <span class="text-[10px] text-text-muted flex items-center"><i class="ph-fill ph-check-circle mr-1"></i>${t.completedSessionIds?.length || 0}/${t.estimatedPomos||1}</span>
                    </div>
                </div>
                ${!isDone ? `<button class="play-btn w-10 h-10 rounded-full ${isActive ? 'bg-brand text-white' : 'bg-dark-active text-brand'} flex items-center justify-center active:scale-90 transition-all ml-1 border border-dark-border" onclick="event.stopPropagation(); app.startFocus('${t.id}')"><i class="ph-fill ${isActive ? 'ph-pause' : 'ph-play'} text-lg"></i></button>` : ''}
            `;
            list.appendChild(el);
        });
    },
    
    renderMiniStats: () => {
        const today = getDayStr(new Date());
        const todayTasks = state.tasks.filter(t => t.dueDate === today);
        const estMin = todayTasks.reduce((a, b) => a + ((parseInt(b.estimatedPomos) || 1) * (parseInt(b.pomoDuration) || 25)), 0);
        const h = Math.floor(estMin / 60); const m = estMin % 60;
        if($('mini-est-time')) $('mini-est-time').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
        if($('mini-tasks-left')) $('mini-tasks-left').textContent = todayTasks.length;
    },

    setRange: (r) => {
        state.analytics.range = r; haptic('light');
        ['week', 'month', 'year'].forEach(k => { $(`btn-range-${k}`).className = k === r ? "flex-1 py-1.5 rounded text-xs font-medium bg-brand text-white shadow-sm transition-all" : "flex-1 py-1.5 rounded text-xs font-medium text-text-muted hover:text-white transition-all" }); 
        app.renderAnalytics();
    },
    toggleChartType: (key, type) => {
        haptic('light'); state.chartTypes[key] = type;
        const btnLine = $(`btn-${key}-line`); const btnBar = $(`btn-${key}-bar`);
        const act = "px-3 py-1 text-[10px] font-bold rounded-md bg-dark-card text-white shadow-sm transition-colors"; const inact = "px-3 py-1 text-[10px] font-bold rounded-md text-text-muted transition-colors";
        if(btnLine) btnLine.className = type === 'line' ? act : inact;
        if(btnBar) btnBar.className = type === 'bar' ? act : inact;
        app.renderAnalytics();
    },

    renderAnalytics: () => {
        if(state.activeTab !== 'analytics') return;
        const logs = state.logs; 
        const now = new Date(); const getDS = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); const todayStr = getDS(now);
        const startOfWeek = new Date(now); const day = startOfWeek.getDay() || 7; if (day !== 1) startOfWeek.setDate(now.getDate() - (day - 1)); startOfWeek.setHours(0, 0, 0, 0);

        const logsToday = logs.filter(l => l.completedAt && getDS(new Date(l.completedAt.seconds * 1000)) === todayStr);
        const logsWeek = logs.filter(l => l.completedAt && new Date(l.completedAt.seconds * 1000) >= startOfWeek);
        
        const fmtTime = m => { const h = Math.floor(m/60), rem = Math.round(m%60); return h > 0 ? `${h}h ${rem}m` : `${rem}m` };
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        
        $('ana-time-total').textContent = fmtTime(totalMin);
        $('ana-time-week').textContent = fmtTime(logsWeek.reduce((a, b) => a + (b.duration || 25), 0));
        $('ana-time-today').textContent = fmtTime(logsToday.reduce((a, b) => a + (b.duration || 25), 0));
        $('ana-avg-session').textContent = (logs.length > 0 ? Math.round(totalMin / logs.length) : 0) + 'm';
        $('ana-project-count').textContent = state.projects.size;
        
        $('ana-task-total').textContent = "-"; 

        let morning = 0, night = 0; logs.forEach(l => { if (l.completedAt) { const h = new Date(l.completedAt.seconds * 1000).getHours(); if (h < 12) morning += (l.duration || 25); if (h >= 20) night += (l.duration || 25) } }); 
        $('ana-early-bird').textContent = fmtTime(morning); $('ana-night-owl').textContent = fmtTime(night);
        
        let streak = 0; for(let i=0; i<365; i++) { const d = new Date(); d.setDate(now.getDate() - i); if(logs.some(l => l.completedAt && getDS(new Date(l.completedAt.seconds*1000)) === getDS(d))) streak++; else if(i > 0) break; } 
        $('ana-streak-days').textContent = streak + ' Days';

        const grid = $('pomo-timeline-grid'); grid.innerHTML = ''; 
        for (let i = 0; i < 7; i++) { 
            const d = new Date(); d.setDate(now.getDate() - i); const dStr = getDS(d); 
            const dayLogs = logs.filter(l => l.completedAt && getDS(new Date(l.completedAt.seconds * 1000)) === dStr); 
            const row = document.createElement('div'); row.className = "flex items-center h-6 mb-2"; 
            const lbl = document.createElement('div'); lbl.className = "w-16 text-[10px] text-text-muted font-bold uppercase shrink-0"; lbl.textContent = i === 0 ? "Today" : d.toLocaleDateString('en-US', {weekday:'short'}); 
            const bars = document.createElement('div'); bars.className = "flex-1 h-full relative bg-dark-bg rounded border border-dark-border overflow-hidden mx-2"; 
            dayLogs.forEach(l => { 
                const ld = new Date(l.completedAt.seconds * 1000), sm = (ld.getHours() * 60) + ld.getMinutes(), dur = l.duration || 25, lp = ((sm - dur) / 1440) * 100, wp = (dur / 1440) * 100; 
                const b = document.createElement('div'); b.className = "absolute top-1 bottom-1 rounded-sm bg-brand opacity-80"; b.style.left = `${lp}%`; b.style.width = `${Math.max(wp, 1)}%`; bars.appendChild(b) 
            }); 
            row.appendChild(lbl); row.appendChild(bars); grid.appendChild(row) 
        }

        const r = state.analytics.range; let lbl = [], dpFocus = [], dlb = r === 'week' ? 7 : (r === 'month' ? 30 : 12); 
        if (r === 'year') { 
            for (let i = 11; i >= 0; i--) { 
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1); lbl.push(d.toLocaleString('default', { month: 'short' })); 
                const mLogs = logs.filter(l => l.completedAt && new Date(l.completedAt.seconds * 1000).getMonth() === d.getMonth()); 
                dpFocus.push((mLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
            } 
        } else { 
            for (let i = dlb - 1; i >= 0; i--) { 
                const d = new Date(); d.setDate(now.getDate() - i); const dStr = getDS(d); 
                lbl.push(d.toLocaleDateString('en-US', { weekday: 'short' })); 
                const dLogs = logs.filter(l => l.completedAt && getDS(new Date(l.completedAt.seconds * 1000)) === dStr); 
                dpFocus.push((dLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
            } 
        }

        const createChart = (ctxId, chartKey, data, color, label, instanceKey) => {
            const el = $(ctxId); if(!el) return;
            const ctx = el.getContext('2d');
            const type = state.chartTypes[chartKey];
            if(state.chartInstances[instanceKey]) state.chartInstances[instanceKey].destroy();
            state.chartInstances[instanceKey] = new Chart(ctx, {
                type: type,
                data: { labels: lbl, datasets: [{ label: label, data: data, backgroundColor: color, borderColor: color, borderRadius: 3, tension: 0.4, fill: type === 'line', pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 6 } }, x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#71717a' } } } }
            });
        };

        createChart('focusBarChart', 'focus', dpFocus, '#ff5757', 'Hours', 'focusBar');
        
        if($('taskBarChart')) $('taskBarChart').parentElement.parentElement.classList.add('hidden');

        const hours = Array(24).fill(0); logs.forEach(l => { if (l.completedAt) hours[new Date(l.completedAt.seconds * 1000).getHours()] += (l.duration || 25) });
        if($('hourlyChart')) {
             if(state.chartInstances.hourly) state.chartInstances.hourly.destroy();
             state.chartInstances.hourly = new Chart($('hourlyChart').getContext('2d'), { type: state.chartTypes.hourly, data: { labels: Array.from({length:24},(_,i)=>i), datasets: [{ data: hours, backgroundColor: '#10b981', borderColor: '#10b981', borderRadius: 2, fill: state.chartTypes.hourly==='line', pointRadius:0, tension:0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}}, scales: { x: { display: true, grid: { display: false }, ticks: { color: '#71717a', font: { size: 9 } } }, y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 } } } } } });
        }

        const weekdays = Array(7).fill(0); logs.forEach(l => { if (l.completedAt) { const d = new Date(l.completedAt.seconds * 1000).getDay(); weekdays[d == 0 ? 6 : d - 1] += (l.duration || 25) } });
        if($('weekdayChart')) {
             if(state.chartInstances.weekday) state.chartInstances.weekday.destroy();
             state.chartInstances.weekday = new Chart($('weekdayChart').getContext('2d'), { type: state.chartTypes.weekday, data: { labels: ['M','T','W','T','F','S','S'], datasets: [{ data: weekdays, backgroundColor: '#f59e0b', borderColor: '#f59e0b', borderRadius: 3, fill: state.chartTypes.weekday==='line', pointRadius:0, tension:0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}}, scales: { x: { grid: { display: false }, ticks: { color: '#71717a', font: { size: 9 } } }, y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 } } } } } });
        }

        const maxHour = hours.indexOf(Math.max(...hours)); const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const maxDay = weekdays.indexOf(Math.max(...weekdays));
        $('insight-text').textContent = logs.length > 3 ? `You are most productive at ${maxHour}:00 and on ${days[maxDay]}s.` : "Keep tracking to get insights.";

        const pm = {}; logs.forEach(l => { const p = l.project || 'Inbox'; pm[p] = (pm[p] || 0) + (l.duration || 25) }); const sp = Object.entries(pm).sort((a, b) => b[1] - a[1]);
        if($('projectChart')) {
            if (state.chartInstances.project) state.chartInstances.project.destroy();
            state.chartInstances.project = new Chart($('projectChart').getContext('2d'), { type: 'doughnut', data: { labels: sp.map(x => x[0]), datasets: [{ data: sp.map(x => x[1]), backgroundColor: ['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } } });
        }
        $('project-legend').innerHTML = sp.map((p,i) => `<div class="flex justify-between items-center"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:${['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][i%5]}"></div><span class="text-text-muted truncate max-w-[80px]">${p[0]}</span></div><span class="text-white font-mono">${Math.round(p[1])}m</span></div>`).join('');

        $('mobile-logs').innerHTML = logs.slice(0, 20).map(l => { 
            const d = l.completedAt ? new Date(l.completedAt.seconds * 1000) : new Date(); 
            return `<div class="px-4 py-3 flex justify-between items-center text-sm"><div><div class="text-white truncate max-w-[150px] font-medium">${esc(l.taskTitle || 'Focus Session')}</div><div class="flex items-center gap-2 text-[10px] text-text-muted"><span>${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span>•</span><span>${d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})}</span><span>•</span><span>${esc(l.project || 'Inbox')}</span></div></div><span class="text-brand font-mono">${Math.round(l.duration||25)}m</span></div>` 
        }).join('');
    },
    
    // ... Detail and Task modal logic ...
    openTaskDetail: (t) => {
        haptic('light'); history.pushState({ modal: 'detail' }, ''); state.viewingTask = t;
        $('dt-title').textContent = t.title; $('dt-project').textContent = t.project || 'Inbox';
        
        const total = parseInt(t.estimatedPomos) || 1; const completed = t.completedSessionIds?.length || 0; const left = Math.max(0, total - completed); const dur = parseInt(t.pomoDuration) || 25;
        const fmtTime = m => { const h = Math.floor(m/60); const rem = m%60; return h > 0 ? `${h}h ${rem}m` : `${rem}m`; };

        $('dt-pomo-done').textContent = completed; $('dt-pomo-total').textContent = total; $('dt-pomo-left').textContent = left;
        $('dt-time-spent').textContent = fmtTime(completed * dur); $('dt-time-left').textContent = fmtTime(left * dur); $('dt-time-total').textContent = fmtTime(total * dur);
        $('dt-date').textContent = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'No Date';

        const noteEl = $('dt-note'); if(t.note) { noteEl.textContent = t.note; noteEl.classList.remove('hidden'); } else { noteEl.classList.add('hidden'); }
        const priEl = $('dt-priority'); if(t.priority && t.priority !== 'none') { priEl.textContent = t.priority + ' Priority'; priEl.className = `bg-dark-active px-2 py-0.5 rounded text-[10px] font-bold border border-dark-border uppercase tracking-wide ${t.priority==='high'?'text-red-500':t.priority==='med'?'text-yellow-500':'text-blue-500'}`; priEl.classList.remove('hidden'); } else { priEl.classList.add('hidden'); }

        const subCon = $('dt-subtasks-container'); const subList = $('dt-subtasks-list'); subList.innerHTML = '';
        if(t.subtasks && t.subtasks.length > 0) { subCon.classList.remove('hidden'); t.subtasks.forEach(s => { const row = document.createElement('div'); row.className = "flex items-center text-sm text-text-muted"; row.innerHTML = `<i class="ph-bold ph-caret-right text-xs mr-2 text-text-muted"></i><span>${esc(s)}</span>`; subList.appendChild(row); }); } else { subCon.classList.add('hidden'); }

        const tagCon = $('dt-tags-container'); tagCon.innerHTML = '';
        if(t.tags && t.tags.length > 0) { tagCon.classList.remove('hidden'); t.tags.forEach(tag => { const sp = document.createElement('span'); sp.className = "bg-dark-active border border-dark-border text-xs px-2 py-1 rounded text-text-muted"; sp.textContent = tag; tagCon.appendChild(sp); }); } else { tagCon.classList.add('hidden'); }

        $('modal-overlay').classList.remove('hidden'); setTimeout(() => { $('modal-overlay').classList.remove('opacity-0'); $('detail-sheet').classList.remove('translate-y-full'); }, 10);
    },
    closeDetailSheet: () => { history.back(); },
    startFocusFromDetail: () => { if(state.viewingTask) { app.startFocus(state.viewingTask.id); $('detail-sheet').classList.add('translate-y-full'); $('modal-overlay').classList.add('opacity-0'); setTimeout(() => { $('modal-overlay').classList.add('hidden'); }, 300); } },
    editCurrentTask: () => { if(state.viewingTask) { const t = state.viewingTask; $('detail-sheet').classList.add('translate-y-full'); setTimeout(() => app.openTaskModal(t), 300); } },
    deleteCurrentTask: async () => { if(state.viewingTask && confirm('Delete this task?')) { haptic('heavy'); try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', state.viewingTask.id)); history.back(); app.showToast('Task deleted'); } catch(e) { app.showToast('Error deleting'); } } },

    openTaskModal: (task = null) => {
        haptic('light'); history.pushState({ modal: 'form' }, ''); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}
        const sel = $('inp-project'); sel.innerHTML = ''; state.projects.forEach(p => { const opt = document.createElement('option'); opt.value = p; opt.textContent = p; opt.className = 'bg-dark-card text-white'; sel.appendChild(opt); });
        $('subtask-list').innerHTML = '';
        if (task) {
            state.editingId = task.id; $('sheet-title').textContent = "Edit Task"; $('btn-save-task').textContent = "Save Changes";
            $('inp-title').value = task.title; $('inp-est').value = task.estimatedPomos || 1; $('disp-est').textContent = task.estimatedPomos || 1; $('inp-duration').value = task.pomoDuration || 25; app.updateDurationDisplay(task.pomoDuration || 25);
            $('inp-date').value = task.dueDate || ''; $('inp-project').value = task.project || 'Inbox'; app.setPriority(task.priority || 'none'); app.highlightDateButton(task.dueDate);
            $('inp-note').value = task.note || ''; $('inp-tags').value = task.tags ? task.tags.join(', ') : ''; $('inp-repeat').value = task.repeat || 'none'; $('inp-reminder').value = task.reminder || '';
            if(task.subtasks) task.subtasks.forEach(s => app.addSubtaskInput(s));
        } else {
            state.editingId = null; $('sheet-title').textContent = "New Task"; $('btn-save-task').textContent = "Create Task";
            $('inp-title').value = ''; $('inp-est').value = 1; $('disp-est').textContent = 1; $('inp-duration').value = 25; app.updateDurationDisplay(25);
            $('inp-date').value = getDayStr(new Date()); app.highlightDateButton(getDayStr(new Date()));
            $('inp-project').value = 'Inbox'; app.setPriority('none'); $('inp-note').value = ''; $('inp-tags').value = ''; $('inp-repeat').value = 'none'; $('inp-reminder').value = '';
        }
        $('modal-overlay').classList.remove('hidden'); setTimeout(() => { $('modal-overlay').classList.remove('opacity-0'); $('modal-sheet').classList.remove('translate-y-full'); if(!task) $('inp-title').focus(); }, 10);
    },
    setQuickDate: (type) => { haptic('light'); const d = new Date(); if(type === 'tomorrow') d.setDate(d.getDate() + 1); const str = getDayStr(d); $('inp-date').value = str; app.highlightDateButton(str); },
    highlightDateButton: (dateStr) => {
        const today = getDayStr(new Date()); const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); const tmrwStr = getDayStr(tmrw);
        const setBtn = (id, active) => { $(id).className = active ? "flex-1 py-2 rounded-lg bg-brand text-white border border-brand text-xs font-bold shadow-md transition-all" : "flex-1 py-2 rounded-lg bg-dark-card border border-dark-border text-xs font-medium text-text-muted transition-all active:scale-95"; };
        setBtn('btn-date-today', dateStr === today); setBtn('btn-date-tomorrow', dateStr === tmrwStr);
        if(dateStr && dateStr !== today && dateStr !== tmrwStr) { const d = new Date(dateStr); $('lbl-date-pick').textContent = d.toLocaleDateString('en-US', {month:'short', day:'numeric'}); $('btn-date-pick').classList.add('text-brand', 'border-brand'); } 
        else { $('lbl-date-pick').textContent = 'Pick'; $('btn-date-pick').classList.remove('text-brand', 'border-brand'); }
    },
    setPriority: (level) => {
        haptic('light'); $('inp-priority').value = level;
        ['none', 'low', 'med', 'high'].forEach(l => {
            const btn = $(`btn-pri-${l}`); const isActive = l === level;
            btn.className = "h-9 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 active:scale-95 ";
            if(isActive) { btn.className += "border-transparent text-white shadow-md "; if(l === 'high') btn.className += "bg-red-500"; else if(l === 'med') btn.className += "bg-yellow-500"; else if(l === 'low') btn.className += "bg-blue-500"; else btn.className += "bg-brand"; } 
            else { btn.className += "border-dark-border bg-dark-card "; if(l === 'high') btn.className += "text-red-500"; else if(l === 'med') btn.className += "text-yellow-500"; else if(l === 'low') btn.className += "text-blue-500"; else btn.className += "text-text-muted"; }
        });
    },
    adjustEst: (delta) => { haptic('light'); let val = parseInt($('inp-est').value) || 1; val += delta; if(val < 1) val = 1; if(val > 50) val = 50; $('inp-est').value = val; $('disp-est').textContent = val; app.updateTotalCalc(); },
    updateDurationDisplay: (val) => { $('disp-duration').innerText = val + 'm'; app.updateTotalCalc(); },
    updateTotalCalc: () => { const est = parseInt($('inp-est').value) || 1; const dur = parseInt($('inp-duration').value) || 25; const total = est * dur; const h = Math.floor(total/60); const m = total % 60; $('total-calc-display').textContent = h > 0 ? `${h}h ${m}m Total` : `${m}m Total`; },
    addSubtaskInput: (val = '') => { const div = document.createElement('div'); div.className = 'flex items-center gap-3 animate-slide-up group pl-1'; div.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-dark-border group-focus-within:bg-brand transition-colors shrink-0"></div><input type="text" value="${esc(val)}" class="subtask-input w-full bg-transparent border-b border-dark-border focus:border-brand text-sm text-white py-1.5 outline-none transition-colors" placeholder="Checklist item..." onkeydown="app.handleSubtaskKey(event, this)"><button onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-500 px-2"><i class="ph-bold ph-x"></i></button>`; $('subtask-list').appendChild(div); if(!val) div.querySelector('input').focus(); },
    handleSubtaskKey: (e, input) => { if(e.key === 'Enter') { e.preventDefault(); app.addSubtaskInput(); } },
    
    saveTask: async () => {
        const title = $('inp-title').value; if(!title) { app.showToast("Title required"); $('inp-title').focus(); return; }
        const subtasks = Array.from(document.querySelectorAll('.subtask-input')).map(i => i.value.trim()).filter(x => x);
        const tags = $('inp-tags').value.split(',').map(t => t.trim()).filter(x => x);
        const data = { title, estimatedPomos: parseInt($('inp-est').value) || 1, pomoDuration: parseInt($('inp-duration').value) || 25, dueDate: $('inp-date').value, priority: $('inp-priority').value, project: $('inp-project').value || 'Inbox', note: $('inp-note').value, repeat: $('inp-repeat').value, reminder: $('inp-reminder').value, tags, subtasks };
        history.back();
        try {
            if(state.editingId) { await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', state.editingId), data); haptic('success'); app.showToast('Task updated'); } 
            else { await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), { ...data, status: 'todo', createdAt: new Date().toISOString(), completedSessionIds: [] }); haptic('success'); app.showToast('Task added'); }
        } catch(e) { app.showToast('Error saving'); }
    },
    
    closeTaskModal: () => { history.back(); },
    closeAllSheets: () => { if(!$('modal-overlay').classList.contains('hidden')) history.back(); },

    toggleStatus: async (id, s) => {
        haptic('light');
        try {
            if (s === 'todo') {
                const el = document.querySelector(`div[onclick*="${id}"]`);
                if(el) el.style.opacity = '0.5';
            }
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), { 
                status: s === 'todo' ? 'done' : 'todo',
                completedAt: s === 'todo' ? serverTimestamp() : null 
            });
        } catch(e) { app.showToast("Connection error"); }
    },

    // --- TIMER & SETTINGS ---
    startFocus: async (id) => {
        const t = state.tasks.find(x => x.id === id); if(!t) return;
        haptic('medium'); app.switchTab('timer'); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}
        if(state.timer.taskId === id && state.timer.status === 'running') return;
        const durationMin = t.pomoDuration || state.timer.settings.focus; const d = durationMin * 60; const sessionId = `${t.id}_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'running', mode: 'focus', taskId: t.id, sessionId: sessionId, remaining: d, totalDuration: d, endTime: new Date(Date.now() + d*1000) });
        app.updateSetting('focus', durationMin); app.unlockAudio(); 
    },
    toggleTimer: async () => {
        haptic('medium'); app.unlockAudio(); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}
        if(state.timer.status === 'running') {
            if(state.timer.settings.strictMode && state.timer.mode === 'focus' && !confirm("Strict Mode active! Quit?")) return;
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000)) });
        } else {
            if(!state.timer.taskId && state.timer.mode === 'focus') { app.showToast('Select a task'); app.switchTab('tasks'); return; }
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'running', endTime: new Date(Date.now() + state.timer.remaining * 1000) });
        }
    },
    resetTimer: async (r = false) => {
        if (!r) { haptic('medium'); const d = state.timer.settings[state.timer.mode] * 60; await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { status: 'idle', remaining: d, totalDuration: d, endTime: null, mode: state.timer.mode, taskId: state.timer.taskId || null }); }
    },
    skipTimer: () => app.completeTimer(),
    completeTimer: async () => {
        if(state.timer.status === 'idle') return;
        stopTimerLoop(); haptic('timerDone');
        try { if(state.audioContext) { const o = state.audioContext.createOscillator(); const g = state.audioContext.createGain(); o.connect(g); g.connect(state.audioContext.destination); o.frequency.value = 523.25; o.start(); o.stop(state.audioContext.currentTime + 0.5); } } catch(e) {}
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Timer Complete", { icon: ASSETS.icon }); } catch (e) {}

        if(state.timer.mode === 'focus') {
            if(state.timer.taskId) {
                const t = state.tasks.find(x => x.id === state.timer.taskId);
                if(t) {
                    try {
                        const sessionId = state.timer.sessionId || `${t.id}_${Date.now()}`;
                        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedSessionIds: arrayUnion(sessionId) });
                        const durMin = state.timer.totalDuration / 60;
                        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions', sessionId), { taskTitle: t.title, taskId: t.id, project: t.project || 'Inbox', duration: durMin, completedAt: serverTimestamp() });
                    } catch(e) { console.error(e); }
                }
            }
            if (state.timer.settings.disableBreak) { await app.setTimerMode('focus'); if (state.timer.settings.autoStartPomo) app.toggleTimer(); } 
            else { const newCount = (state.timer.pomoCountCurrentSession || 0) + 1; let nextMode = 'short'; if (newCount >= state.timer.settings.longBreakInterval) nextMode = 'long'; await app.setTimerMode(nextMode, nextMode === 'long' ? 0 : newCount); if (state.timer.settings.autoStartBreak) app.toggleTimer(); }
        } else {
            await app.setTimerMode('focus', state.timer.pomoCountCurrentSession); if (state.timer.settings.autoStartPomo) app.toggleTimer();
        }
        app.showToast('Timer Complete');
    },
    setTimerMode: async (m, sessionCount = null) => {
        const v = state.timer.settings[m]; const updates = { status: 'idle', mode: m, remaining: v * 60, totalDuration: v * 60, endTime: null, taskId: state.timer.taskId || null, sessionId: null }; if (sessionCount !== null) updates.sessionCount = sessionCount; await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), updates);
    },
    updateTimerUI: () => {
        const { status, endTime, remaining, totalDuration, taskId, mode } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        if($('timer-display')) $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        if($('timer-mode')) { $('timer-mode').textContent = mode === 'focus' ? 'FOCUS' : mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK'; $('timer-mode').className = `text-xs font-bold tracking-widest uppercase mt-3 ${mode==='focus'?'text-brand':'text-blue-500'}`; }
        const offset = 283 * (1 - (s / (totalDuration || 1)));
        if($('timer-progress')) { $('timer-progress').style.strokeDashoffset = isNaN(offset) ? 0 : offset; $('timer-progress').style.stroke = mode === 'focus' ? '#ff5757' : '#3b82f6'; }

        if(taskId && mode === 'focus') {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                if($('focus-empty')) $('focus-empty').classList.add('hidden'); if($('focus-active')) $('focus-active').classList.remove('hidden');
                if($('timer-task-title')) $('timer-task-title').textContent = t.title; if($('timer-badge')) $('timer-badge').textContent = t.project || 'Inbox';
                if($('timer-completed')) $('timer-completed').textContent = t.completedSessionIds ? t.completedSessionIds.length : 0; if($('timer-total')) $('timer-total').textContent = t.estimatedPomos || 1;
                document.title = `${m}:${sc.toString().padStart(2,'0')} - ${t.title}`;
            } else if (!t && taskId) {
                 if($('timer-task-title')) $('timer-task-title').textContent = "Task Loading/Archived";
            }
        } else if (mode !== 'focus') {
            if($('focus-empty')) { $('focus-empty').classList.remove('hidden'); $('focus-empty').textContent = "Rest your mind"; } if($('focus-active')) $('focus-active').classList.add('hidden'); document.title = `${m}:${sc.toString().padStart(2,'0')} - Break`;
        } else {
             if($('focus-empty')) { $('focus-empty').classList.remove('hidden'); $('focus-empty').textContent = "Select a task to focus"; } if($('focus-active')) $('focus-active').classList.add('hidden'); document.title = "TimeTrekker";
        }
    },
    setSound: (t) => {
        state.sound = t; const audio = $('audio-player'); if(audio) audio.src = ASSETS.sounds[t];
        ['none','rain','cafe','forest'].forEach(x => { if($(`btn-sound-${x}`)) $(`btn-sound-${x}`).className = x===t ? 'text-brand p-1' : 'text-text-muted hover:text-white transition-colors p-1'; });
        if(state.timer.status === 'running' && t !== 'none') { app.unlockAudio(); audio.play().catch(()=>{}); } else audio.pause();
    },
    
    // Optimized Debounced Setting Update
    updateSetting: (k, v) => {
        const val = ['strictMode','autoStartPomo','autoStartBreak','disableBreak'].includes(k) ? v : parseInt(v);
        state.timer.settings[k] = val;
        storage.save('timer_settings', state.timer.settings);
        
        if (app.settingsTimeout) clearTimeout(app.settingsTimeout);
        app.settingsTimeout = setTimeout(() => {
            updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), { [k]: val }).catch(()=>{});
        }, 1000);
    },

    showToast: (msg) => { const t = document.createElement('div'); t.className = "bg-dark-active border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-lg shadow-xl text-center animate-slide-up backdrop-blur"; t.textContent = msg; $('toast-container').appendChild(t); setTimeout(() => t.remove(), 3000); },
    signOut: () => signOut(auth).then(() => window.location.href = 'https://stack-base.github.io/account/login.html?redirectUrl=' + encodeURIComponent(window.location.href))
};

// --- EVENTS ---
$('prompt-cancel-btn').addEventListener('click', () => app.closePrompt(null));
$('prompt-confirm-btn').addEventListener('click', () => app.closePrompt(app.customPrompt.input.value));
$('prompt-input').addEventListener('keypress', e => { if (e.key === 'Enter') app.closePrompt(app.customPrompt.input.value); });
document.addEventListener('click', (e) => { if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); });

if (!history.state) history.replaceState({ view: 'root' }, '');
window.addEventListener('popstate', (e) => {
    if (!$('modal-sheet').classList.contains('translate-y-full')) { $('modal-sheet').classList.add('translate-y-full'); $('modal-overlay').classList.add('opacity-0'); setTimeout(() => { $('modal-overlay').classList.add('hidden'); state.editingId = null; }, 300); return; }
    if (!$('detail-sheet').classList.contains('translate-y-full')) { $('detail-sheet').classList.add('translate-y-full'); $('modal-overlay').classList.add('opacity-0'); setTimeout(() => { $('modal-overlay').classList.add('hidden'); state.viewingTask = null; }, 300); return; }
    if (!$('project-sheet').classList.contains('translate-y-full')) { $('project-sheet').classList.add('translate-y-full'); $('modal-overlay').classList.add('opacity-0'); setTimeout(() => { $('modal-overlay').classList.add('hidden'); }, 300); return; }
    if (e.state && e.state.view) app.switchTab(e.state.view, false); else app.switchTab('tasks', false);
});

window.app = app;
app.switchTab('tasks', false);