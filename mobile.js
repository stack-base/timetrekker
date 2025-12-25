import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- CONFIGURATION ---
const FIREBASE_CONFIG = { apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U", authDomain: "timetrekker-app.firebaseapp.com", projectId: "timetrekker-app", storageBucket: "timetrekker-app.firebasestorage.app", messagingSenderId: "83185163190", appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17", measurementId: "G-FLZ02E1Y5L" };
const APP_ID = 'timetrekker-v1';

// --- INIT ---
const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);
try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

// --- UTILS ---
const $ = id => document.getElementById(id);
const haptic = (type = 'light') => { if(!navigator.vibrate) return; try { navigator.vibrate(type === 'heavy' ? 40 : 10); } catch(e){} };
const getDayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const esc = (str) => { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; };

const sounds = { 
    none: '', 
    rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', 
    cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg', 
    forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' 
};

// --- STATE ---
const state = {
    user: null, tasks: [], logs: [], 
    projects: new Set(['Inbox', 'Work', 'Personal', 'Study']),
    activeTab: 'tasks', activeFilter: 'today',
    timer: { 
        status: 'idle', endTime: null, remaining: 1500, total: 1500, taskId: null, mode: 'focus',
        pomoCountCurrentSession: 0,
        settings: { focus: 25, short: 5, long: 15, longBreakInterval: 4, strictMode: false, autoStartPomo: false, autoStartBreak: false, disableBreak: false }
    },
    sound: 'none',
    editingId: null, viewingTask: null,
    chartInstances: { focusBar: null, taskBar: null, hourly: null, weekday: null, project: null, priority: null },
    analytics: { range: 'week' },
    lastCheckTime: null
};

// --- CHART CONFIG ---
Chart.defaults.font.family = 'Inter';
Chart.defaults.color = '#a1a1aa';
Chart.defaults.borderColor = '#27272a';
Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.03)';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(9, 9, 11, 0.95)';
Chart.defaults.plugins.tooltip.titleColor = '#fff';
Chart.defaults.plugins.tooltip.bodyColor = '#a1a1aa';
Chart.defaults.plugins.tooltip.borderColor = '#333';
Chart.defaults.plugins.tooltip.borderWidth = 1;

// --- AUTH & DATA ---
async function syncUserProfile(u) {
    if (!u) return;
    try {
        const userRef = doc(db, 'artifacts', APP_ID, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        const profileData = { displayName: u.displayName || u.email.split('@')[0], email: u.email, photoURL: u.photoURL, lastLogin: serverTimestamp(), uid: u.uid };
        if (!userSnap.exists()) await setDoc(userRef, { ...profileData, createdAt: serverTimestamp() });
        else await setDoc(userRef, profileData, { merge: true });
    } catch (e) { console.error("Profile Sync Error", e); }
}

onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        syncUserProfile(u);
        
        // Listen to User Profile for Avatar Sync
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid), s => {
            if(s.exists()) {
                const d = s.data();
                const name = d.displayName || u.email.split('@')[0];
                const pic = d.photoURL;
                
                $('header-avatar').textContent = name.charAt(0).toUpperCase();
                $('settings-avatar').textContent = name.charAt(0).toUpperCase();
                $('settings-name').textContent = name;
                $('settings-email').textContent = u.email;

                if (pic) {
                    $('header-avatar-img').src = pic; $('header-avatar-img').classList.remove('hidden');
                    $('settings-avatar-img').src = pic; $('settings-avatar-img').classList.remove('hidden');
                } else {
                    $('header-avatar-img').classList.add('hidden');
                    $('settings-avatar-img').classList.add('hidden');
                }
            }
        });

        $('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        // Tasks Listener
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), s => {
            state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
            state.projects = new Set(['Inbox', 'Work', 'Personal', 'Study']);
            state.tasks.forEach(t => { if(t.project) state.projects.add(t.project); });
            app.renderTasks();
            app.renderMiniStats(); // Update mini stats on tasks view
            if(state.activeTab === 'analytics') app.renderAnalytics();
        });
        
        // Timer Listener
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid, 'timer', 'active'), s => {
            if(s.exists()) {
                const d = s.data();
                state.timer = {
                    ...state.timer,
                    status: d.status || 'idle',
                    mode: d.mode || 'focus',
                    endTime: d.endTime ? d.endTime.toMillis() : null,
                    remaining: d.remaining || (state.timer.settings[d.mode || 'focus'] * 60),
                    total: d.totalDuration || (state.timer.settings[d.mode || 'focus'] * 60),
                    taskId: d.taskId,
                    pomoCountCurrentSession: d.sessionCount || 0
                };
                if(d.strictMode !== undefined) state.timer.settings.strictMode = d.strictMode;
                app.updateTimerUI();
                if(state.timer.status === 'running') startTimerLoop(); else stopTimerLoop();
            } else {
                app.resetTimer(true);
            }
        });

        // Logs Listener
        onSnapshot(query(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions')), s => {
            state.logs = s.docs.map(d => d.data()).sort((a,b) => (b.completedAt?.seconds||0) - (a.completedAt?.seconds||0));
            if(state.activeTab === 'analytics') app.renderAnalytics();
        });

        // Reminders
        setInterval(() => {
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (state.lastCheckTime !== currentTime) {
                state.lastCheckTime = currentTime;
                if ('Notification' in window && Notification.permission === 'granted') {
                    const todayStr = getDayStr(now);
                    state.tasks.forEach(t => {
                        if (t.status === 'todo' && t.reminder === currentTime && (t.dueDate === todayStr || !t.dueDate)) {
                             try { haptic(); new Notification(`Reminder: ${t.title}`, { body: "It's time for your task." }); } catch (e) {}
                        }
                    });
                }
            }
        }, 10000);

    } else {
        // Redirect logic fixed to include redirectUrl parameter
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
    if(audio && state.sound !== 'none' && audio.paused) audio.play().catch(() => {});
};

const stopTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    $('play-icon').className = "ph-fill ph-play text-3xl ml-1";
    const audio = $('audio-player');
    if(audio) audio.pause();
};

// --- APP CONTROLLER ---
const app = {
    // NAVIGATION
    switchTab: (tab) => {
        haptic();
        state.activeTab = tab;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const view = $(`view-${tab}`);
        if(view) view.classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(el => {
            el.className = `nav-item flex flex-col items-center justify-center w-full h-full text-text-muted transition-colors`;
            el.querySelector('i').classList.remove('ph-fill');
            el.querySelector('i').classList.add('ph-bold');
        });
        
        const activeBtn = $(`tab-${tab}`);
        if(activeBtn) {
            activeBtn.className = `nav-item flex flex-col items-center justify-center w-full h-full text-brand transition-colors`;
            activeBtn.querySelector('i').classList.remove('ph-bold');
            activeBtn.querySelector('i').classList.add('ph-fill');
        }

        const isTask = tab === 'tasks';
        $('view-header').classList.toggle('hidden', !isTask);
        $('task-filters').classList.toggle('hidden', !isTask);
        $('fab-add').classList.toggle('hidden', !isTask);

        if(tab === 'analytics') app.renderAnalytics();
        if(tab === 'settings') {
            const s = state.timer.settings;
            $('toggle-strict').checked = s.strictMode;
            $('toggle-auto-pomo').checked = s.autoStartPomo;
            $('toggle-auto-break').checked = s.autoStartBreak;
            $('toggle-disable-break').checked = s.disableBreak;
            $('set-focus-display').innerText = s.focus + 'm';
            $('set-short-display').innerText = s.short + 'm';
            $('set-long-display').innerText = s.long + 'm';
            $('set-long-interval-display').innerText = s.longBreakInterval + 'x';
            $('inp-long-interval').value = s.longBreakInterval;
        }
    },

    setFilter: (f) => {
        haptic();
        state.activeFilter = f;
        document.querySelectorAll('#task-filters button').forEach(b => {
            b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${b.id === `filter-${f}` ? 'bg-brand text-white' : 'bg-dark-active text-text-muted'}`;
        });
        app.renderTasks();
    },
    
    setRange: (r) => {
        state.analytics.range = r; haptic();
        ['week', 'month', 'year'].forEach(k => { $(`btn-range-${k}`).className = k === r ? "flex-1 py-1.5 rounded text-xs font-medium bg-brand text-white shadow-sm transition-all" : "flex-1 py-1.5 rounded text-xs font-medium text-text-muted hover:text-white transition-all" }); 
        app.renderAnalytics();
    },

    // TASK UI
    renderTasks: () => {
        const list = $('task-list');
        if(!list) return;
        list.innerHTML = '';
        const today = getDayStr(new Date());
        let filtered = state.tasks;
        if(state.activeFilter === 'today') filtered = state.tasks.filter(t => t.status === 'todo' && t.dueDate === today);
        else if(state.activeFilter === 'upcoming') filtered = state.tasks.filter(t => t.status === 'todo' && t.dueDate > today);
        else if(state.activeFilter === 'project') filtered = state.tasks.filter(t => t.status === 'todo').sort((a,b) => (a.project||'').localeCompare(b.project||''));
        else if(state.activeFilter === 'completed') filtered = state.tasks.filter(t => t.status === 'done');
        
        if(filtered.length === 0) $('empty-state').classList.remove('hidden');
        else $('empty-state').classList.add('hidden');

        filtered.forEach(t => {
            const el = document.createElement('div');
            const priColor = t.priority === 'high' ? 'border-red-500/50' : t.priority === 'med' ? 'border-yellow-500/50' : t.priority === 'low' ? 'border-blue-500/50' : 'border-dark-border';
            el.className = `bg-dark-card border ${priColor} p-4 rounded-xl flex items-start gap-3 active:scale-[0.98] transition-transform select-none relative shadow-sm`;
            el.onclick = (e) => {
                if(!e.target.closest('.check-area') && !e.target.closest('.play-btn')) {
                    app.openTaskDetail(t);
                }
            };

            const isDone = t.status === 'done';
            const duration = t.pomoDuration || 25;
            
            el.innerHTML = `
                <div class="check-area pt-1" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${isDone ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center">
                        ${isDone ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-medium truncate ${isDone ? 'line-through text-text-muted':''}">${esc(t.title)}</h3>
                    ${t.note ? `<p class="text-text-muted text-xs truncate mt-0.5">${esc(t.note)}</p>` : ''}
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium border border-brand/20">${esc(t.project || 'Inbox')}</span>
                        ${t.priority === 'high' ? '<span class="text-[10px] text-red-500 font-bold">! Urgent</span>' : ''}
                        ${duration !== 25 ? `<span class="text-[10px] text-text-muted flex items-center"><i class="ph-fill ph-clock mr-1"></i>${duration}m</span>` : ''}
                    </div>
                </div>
                <button class="play-btn w-10 h-10 rounded-full bg-dark-active flex items-center justify-center text-brand active:scale-90 transition-transform ml-1 border border-dark-border" onclick="event.stopPropagation(); app.startFocus('${t.id}')">
                    <i class="ph-fill ph-play text-lg"></i>
                </button>
            `;
            list.appendChild(el);
        });
    },
    
    renderMiniStats: () => {
        const today = getDayStr(new Date());
        const todayTasks = state.tasks.filter(t => t.status === 'todo' && t.dueDate === today);
        const estMin = todayTasks.reduce((a, b) => a + ((parseInt(b.estimatedPomos) || 1) * (parseInt(b.pomoDuration) || 25)), 0);
        const h = Math.floor(estMin / 60); const m = estMin % 60;
        
        if($('mini-est-time')) $('mini-est-time').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
        if($('mini-tasks-left')) $('mini-tasks-left').textContent = todayTasks.length;
    },

    // --- ANALYTICS ---
    renderAnalytics: () => {
        if(state.activeTab !== 'analytics') return;
        const logs = state.logs; const tasks = state.tasks;
        const now = new Date(); const getDS = d => getDayStr(d); const todayStr = getDS(now);
        
        // 1. Calculations
        const startOfWeek = new Date(now); const day = startOfWeek.getDay() || 7; if (day !== 1) startOfWeek.setDate(now.getDate() - (day - 1)); startOfWeek.setHours(0, 0, 0, 0);
        
        const logsToday = logs.filter(l => l.completedAt && getDS(new Date(l.completedAt.seconds * 1000)) === todayStr);
        const logsWeek = logs.filter(l => l.completedAt && new Date(l.completedAt.seconds * 1000) >= startOfWeek);
        const tasksDone = tasks.filter(t => t.status === 'done');
        
        const fmtTime = m => { const h = Math.floor(m/60), rem = Math.round(m%60); return h > 0 ? `${h}h ${rem}m` : `${rem}m` };
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        
        // 2. Metrics Population
        $('ana-time-total').textContent = fmtTime(totalMin);
        $('ana-task-total').textContent = tasksDone.length;
        $('ana-project-count').textContent = state.projects.size;
        
        const activeCount = tasks.filter(t => t.status === 'todo').length + tasksDone.length; 
        $('ana-completion-rate').textContent = activeCount > 0 ? Math.round((tasksDone.length / activeCount) * 100) + '%' : '0%';
        $('ana-avg-session').textContent = (logs.length > 0 ? Math.round(totalMin / logs.length) : 0) + 'm';

        let morning = 0, night = 0; logs.forEach(l => { if (l.completedAt) { const h = new Date(l.completedAt.seconds * 1000).getHours(); if (h < 12) morning += (l.duration || 25); if (h >= 20) night += (l.duration || 25) } }); 
        $('ana-early-bird').textContent = fmtTime(morning); $('ana-night-owl').textContent = fmtTime(night);
        
        let streak = 0; for(let i=0; i<365; i++) { const d = new Date(); d.setDate(now.getDate() - i); if(logs.some(l => l.completedAt && getDS(new Date(l.completedAt.seconds*1000)) === getDS(d))) streak++; else if(i > 0) break; } 
        $('ana-streak-days').textContent = streak + ' Days';

        // 3. Timeline Grid
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

        // 4. Charts Logic
        const r = state.analytics.range; 
        let lbl = [], dpFocus = [], dpTask = [], dlb = r === 'week' ? 7 : (r === 'month' ? 30 : 12); 
        if (r === 'year') { 
            for (let i = 11; i >= 0; i--) { 
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1); lbl.push(d.toLocaleString('default', { month: 'short' })); 
                const mLogs = logs.filter(l => l.completedAt && new Date(l.completedAt.seconds * 1000).getMonth() === d.getMonth()); 
                dpFocus.push((mLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
                const mTasks = tasksDone.filter(t => t.completedAt && new Date(t.completedAt).getMonth() === d.getMonth()); 
                dpTask.push(mTasks.length); 
            } 
        } else { 
            for (let i = dlb - 1; i >= 0; i--) { 
                const d = new Date(); d.setDate(now.getDate() - i); const dStr = getDS(d); 
                lbl.push(d.toLocaleDateString('en-US', { weekday: 'short' })); 
                const dLogs = logs.filter(l => l.completedAt && getDS(new Date(l.completedAt.seconds * 1000)) === dStr); 
                dpFocus.push((dLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
                const dTasks = tasksDone.filter(t => t.completedAt && t.completedAt.startsWith(dStr)); 
                dpTask.push(dTasks.length); 
            } 
        }

        const createChart = (ctxId, type, data, color, label, instanceKey) => {
            const ctx = $(ctxId).getContext('2d');
            if(state.chartInstances[instanceKey]) state.chartInstances[instanceKey].destroy();
            state.chartInstances[instanceKey] = new Chart(ctx, {
                type: type,
                data: { labels: lbl, datasets: [{ label: label, data: data, backgroundColor: color, borderColor: color, borderRadius: 3, tension: 0.4, fill: type === 'line', pointRadius: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, display: false }, x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#71717a' } } } }
            });
        };

        createChart('focusBarChart', 'bar', dpFocus, '#ff5757', 'Hours', 'focusBar');
        createChart('taskBarChart', 'bar', dpTask, '#3b82f6', 'Tasks', 'taskBar');

        const hours = Array(24).fill(0); logs.forEach(l => { if (l.completedAt) hours[new Date(l.completedAt.seconds * 1000).getHours()] += (l.duration || 25) });
        if(state.chartInstances.hourly) state.chartInstances.hourly.destroy();
        state.chartInstances.hourly = new Chart($('hourlyChart').getContext('2d'), { type: 'bar', data: { labels: Array.from({length:24},(_,i)=>i), datasets: [{ data: hours, backgroundColor: '#10b981', borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}}, scales: {x:{display:false}, y:{display:false}} } });

        const weekdays = Array(7).fill(0); logs.forEach(l => { if (l.completedAt) { const d = new Date(l.completedAt.seconds * 1000).getDay(); weekdays[d == 0 ? 6 : d - 1] += (l.duration || 25) } });
        if(state.chartInstances.weekday) state.chartInstances.weekday.destroy();
        state.chartInstances.weekday = new Chart($('weekdayChart').getContext('2d'), { type: 'bar', data: { labels: ['M','T','W','T','F','S','S'], datasets: [{ data: weekdays, backgroundColor: '#f59e0b', borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}}, scales: {x:{grid:{display:false}}, y:{display:false}} } });

        // Insights
        const maxHour = hours.indexOf(Math.max(...hours)); const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const maxDay = weekdays.indexOf(Math.max(...weekdays));
        $('insight-text').textContent = logs.length > 3 ? `You are most productive at ${maxHour}:00 and on ${days[maxDay]}s.` : "Keep tracking to get insights.";

        // Projects & Priorities
        const pm = {}; logs.forEach(l => { const p = l.project || 'Inbox'; pm[p] = (pm[p] || 0) + (l.duration || 25) }); const sp = Object.entries(pm).sort((a, b) => b[1] - a[1]);
        if (state.chartInstances.project) state.chartInstances.project.destroy();
        state.chartInstances.project = new Chart($('projectChart').getContext('2d'), { type: 'doughnut', data: { labels: sp.map(x => x[0]), datasets: [{ data: sp.map(x => x[1]), backgroundColor: ['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } } });
        $('project-legend').innerHTML = sp.map((p,i) => `<div class="flex justify-between items-center"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:${['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][i%5]}"></div><span class="text-text-muted truncate max-w-[80px]">${p[0]}</span></div><span class="text-white font-mono">${Math.round(p[1])}m</span></div>`).join('');

        const pri = { high: 0, med: 0, low: 0, none: 0 }; tasksDone.forEach(t => pri[t.priority || 'none']++);
        if (state.chartInstances.priority) state.chartInstances.priority.destroy();
        state.chartInstances.priority = new Chart($('priorityChart').getContext('2d'), { type: 'doughnut', data: { labels: ['High', 'Med', 'Low', 'None'], datasets: [{ data: [pri.high, pri.med, pri.low, pri.none], backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#525252'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } } });

        // Lists
        const tagsMap = {}; tasksDone.forEach(t => { if(t.tags) t.tags.forEach(tag => tagsMap[tag] = (tagsMap[tag]||0)+1); }); const sortedTags = Object.entries(tagsMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if(sortedTags.length > 0) $('tags-list').innerHTML = sortedTags.map(t => `<span class="px-2 py-1 bg-dark-active rounded text-[10px] text-white border border-dark-border">${t[0]} (${t[1]})</span>`).join('');

        $('mobile-logs').innerHTML = logs.slice(0, 10).map(l => { const d = l.completedAt ? new Date(l.completedAt.seconds * 1000) : new Date(); return `<div class="px-4 py-3 flex justify-between items-center text-sm"><div><div class="text-white truncate max-w-[150px] font-medium">${esc(l.taskTitle || 'Focus Session')}</div><div class="flex items-center gap-2 text-[10px] text-text-muted"><span>${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}</span><span>•</span><span>${esc(l.project || 'Inbox')}</span></div></div><span class="text-brand font-mono">${Math.round(l.duration||25)}m</span></div>` }).join('');
    },
    
    // --- DETAILS & MODALS ---
    openTaskDetail: (t) => {
        haptic();
        state.viewingTask = t;
        $('dt-title').textContent = t.title;
        $('dt-project').textContent = t.project || 'Inbox';
        $('dt-date').textContent = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'No Date';
        $('dt-est').textContent = t.estimatedPomos || 1;
        
        const noteEl = $('dt-note');
        if(t.note) { noteEl.textContent = t.note; noteEl.classList.remove('hidden'); }
        else { noteEl.classList.add('hidden'); }

        const priEl = $('dt-priority');
        if(t.priority && t.priority !== 'none') {
            priEl.textContent = t.priority + ' Priority';
            priEl.className = `bg-dark-active px-2 py-0.5 rounded text-[10px] font-bold border border-dark-border uppercase tracking-wide ${t.priority==='high'?'text-red-500':t.priority==='med'?'text-yellow-500':'text-blue-500'}`;
            priEl.classList.remove('hidden');
        } else { priEl.classList.add('hidden'); }

        const subCon = $('dt-subtasks-container');
        const subList = $('dt-subtasks-list');
        subList.innerHTML = '';
        if(t.subtasks && t.subtasks.length > 0) {
            subCon.classList.remove('hidden');
            t.subtasks.forEach(s => {
                const row = document.createElement('div');
                row.className = "flex items-center text-sm text-text-muted";
                row.innerHTML = `<i class="ph-bold ph-caret-right text-xs mr-2 text-text-muted"></i><span>${esc(s)}</span>`;
                subList.appendChild(row);
            });
        } else { subCon.classList.add('hidden'); }

        const tagCon = $('dt-tags-container');
        tagCon.innerHTML = '';
        if(t.tags && t.tags.length > 0) {
            tagCon.classList.remove('hidden');
            t.tags.forEach(tag => {
                const sp = document.createElement('span');
                sp.className = "bg-dark-active border border-dark-border text-xs px-2 py-1 rounded text-text-muted";
                sp.textContent = tag;
                tagCon.appendChild(sp);
            });
        } else { tagCon.classList.add('hidden'); }

        $('modal-overlay').classList.remove('hidden');
        setTimeout(() => {
            $('modal-overlay').classList.remove('opacity-0');
            $('detail-sheet').classList.remove('translate-y-full');
        }, 10);
    },

    closeDetailSheet: () => {
        $('detail-sheet').classList.add('translate-y-full');
        if(!state.editingId) {
             $('modal-overlay').classList.add('opacity-0');
             setTimeout(() => { 
                 $('modal-overlay').classList.add('hidden'); 
                 state.viewingTask = null;
             }, 300);
        } else {
             state.viewingTask = null;
        }
    },

    startFocusFromDetail: () => {
        if(state.viewingTask) {
            app.startFocus(state.viewingTask.id);
            app.closeDetailSheet();
        }
    },

    editCurrentTask: () => {
        if(state.viewingTask) {
            const t = state.viewingTask;
            $('detail-sheet').classList.add('translate-y-full');
            state.viewingTask = null;
            setTimeout(() => app.openTaskModal(t), 200);
        }
    },

    deleteCurrentTask: async () => {
        if(state.viewingTask && confirm('Delete this task?')) {
            await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', state.viewingTask.id));
            app.closeDetailSheet();
        }
    },

    // --- ENHANCED FORM MODAL LOGIC ---
    
    // 1. Open Modal with New UI State
    openTaskModal: (task = null) => {
        haptic();
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}

        // Populate Projects
        const sel = $('inp-project');
        sel.innerHTML = '';
        state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p; opt.className = 'bg-dark-card text-white';
            sel.appendChild(opt);
        });

        $('subtask-list').innerHTML = '';

        if (task) {
            state.editingId = task.id;
            $('sheet-title').textContent = "Edit Task";
            $('btn-save-task').textContent = "Save Changes";
            
            $('inp-title').value = task.title;
            
            // Effort UI
            $('inp-est').value = task.estimatedPomos || 1;
            $('disp-est').textContent = task.estimatedPomos || 1;
            $('inp-duration').value = task.pomoDuration || 25;
            app.updateDurationDisplay(task.pomoDuration || 25); // Updates display and total calc

            // Context UI
            $('inp-date').value = task.dueDate || '';
            $('inp-project').value = task.project || 'Inbox';
            app.setPriority(task.priority || 'none'); // Visual Toggle
            app.highlightDateButton(task.dueDate);    // Visual Toggle

            $('inp-note').value = task.note || '';
            $('inp-tags').value = task.tags ? task.tags.join(', ') : '';
            $('inp-repeat').value = task.repeat || 'none';
            $('inp-reminder').value = task.reminder || '';
            
            if(task.subtasks) task.subtasks.forEach(s => app.addSubtaskInput(s));
        } else {
            state.editingId = null;
            $('sheet-title').textContent = "New Task";
            $('btn-save-task').textContent = "Create Task";
            
            $('inp-title').value = '';
            
            // Defaults
            $('inp-est').value = 1;
            $('disp-est').textContent = 1;
            $('inp-duration').value = 25;
            app.updateDurationDisplay(25);

            $('inp-date').value = getDayStr(new Date());
            app.highlightDateButton(getDayStr(new Date()));
            
            $('inp-project').value = 'Inbox';
            app.setPriority('none');
            
            $('inp-note').value = '';
            $('inp-tags').value = '';
            $('inp-repeat').value = 'none';
            $('inp-reminder').value = '';
        }

        $('modal-overlay').classList.remove('hidden');
        setTimeout(() => {
            $('modal-overlay').classList.remove('opacity-0');
            $('modal-sheet').classList.remove('translate-y-full');
            // Auto focus title on new task
            if(!task) $('inp-title').focus();
        }, 10);
    },

    // 2. UI Helper: Date Chips
    setQuickDate: (type) => {
        haptic();
        const d = new Date();
        if(type === 'tomorrow') d.setDate(d.getDate() + 1);
        const str = getDayStr(d);
        $('inp-date').value = str;
        app.highlightDateButton(str);
    },

    highlightDateButton: (dateStr) => {
        const today = getDayStr(new Date());
        const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
        const tmrwStr = getDayStr(tmrw);

        const setBtn = (id, active) => {
            $(id).className = active 
                ? "flex-1 py-2 rounded-lg bg-brand text-white border border-brand text-xs font-bold shadow-md transition-all" 
                : "flex-1 py-2 rounded-lg bg-dark-card border border-dark-border text-xs font-medium text-text-muted transition-all active:scale-95";
        };

        setBtn('btn-date-today', dateStr === today);
        setBtn('btn-date-tomorrow', dateStr === tmrwStr);
        
        // Update label for custom picker
        if(dateStr && dateStr !== today && dateStr !== tmrwStr) {
            const d = new Date(dateStr);
            $('lbl-date-pick').textContent = d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
            $('btn-date-pick').classList.add('text-brand', 'border-brand');
        } else {
            $('lbl-date-pick').textContent = 'Pick';
            $('btn-date-pick').classList.remove('text-brand', 'border-brand');
        }
    },

    // 3. UI Helper: Priority Buttons
    setPriority: (level) => {
        haptic();
        $('inp-priority').value = level;
        ['none', 'low', 'med', 'high'].forEach(l => {
            const btn = $(`btn-pri-${l}`);
            const isActive = l === level;
            
            // Reset base classes
            btn.className = "h-9 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 active:scale-95 ";
            
            if(isActive) {
                btn.className += "border-transparent text-white shadow-md ";
                if(l === 'high') btn.className += "bg-red-500";
                else if(l === 'med') btn.className += "bg-yellow-500";
                else if(l === 'low') btn.className += "bg-blue-500";
                else btn.className += "bg-brand"; // None selected state styling
            } else {
                btn.className += "border-dark-border bg-dark-card ";
                if(l === 'high') btn.className += "text-red-500";
                else if(l === 'med') btn.className += "text-yellow-500";
                else if(l === 'low') btn.className += "text-blue-500";
                else btn.className += "text-text-muted";
            }
        });
    },

    // 4. UI Helper: Effort Stepper & Slider
    adjustEst: (delta) => {
        haptic();
        let val = parseInt($('inp-est').value) || 1;
        val += delta;
        if(val < 1) val = 1; if(val > 50) val = 50; // Increased to 50
        $('inp-est').value = val;
        $('disp-est').textContent = val;
        app.updateTotalCalc();
    },

    updateDurationDisplay: (val) => {
        $('disp-duration').innerText = val + 'm';
        app.updateTotalCalc();
    },

    updateTotalCalc: () => {
        const est = parseInt($('inp-est').value) || 1;
        const dur = parseInt($('inp-duration').value) || 25;
        const total = est * dur;
        const h = Math.floor(total/60);
        const m = total % 60;
        $('total-calc-display').textContent = h > 0 ? `${h}h ${m}m Total` : `${m}m Total`;
    },

    // 5. UI Helper: Smart Subtasks
    addSubtaskInput: (val = '') => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 animate-slide-up group pl-1';
        div.innerHTML = `
            <div class="w-1.5 h-1.5 rounded-full bg-dark-border group-focus-within:bg-brand transition-colors shrink-0"></div>
            <input type="text" value="${esc(val)}" class="subtask-input w-full bg-transparent border-b border-dark-border focus:border-brand text-sm text-white py-1.5 outline-none transition-colors" placeholder="Checklist item..." onkeydown="app.handleSubtaskKey(event, this)">
            <button onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-500 px-2"><i class="ph-bold ph-x"></i></button>
        `;
        $('subtask-list').appendChild(div);
    },

    handleSubtaskKey: (e, input) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            app.addSubtaskInput();
            // Focus the new input (last child's input)
            const list = $('subtask-list');
            const newInputs = list.querySelectorAll('input');
            newInputs[newInputs.length - 1].focus();
        }
    },

    promptNewProject: () => {
        const p = prompt("Enter new project name:");
        if (p && p.trim()) {
             state.projects.add(p.trim());
             const sel = $('inp-project');
             const opt = document.createElement('option');
             opt.value = p.trim(); opt.textContent = p.trim(); opt.className = 'bg-dark-card'; opt.selected = true;
             sel.appendChild(opt);
        }
    },
    
    // --- SAVE LOGIC ---
    saveTask: async () => {
        const title = $('inp-title').value;
        if(!title) {
            app.showToast("Title required");
            $('inp-title').focus();
            return;
        }
        
        const subtasks = Array.from(document.querySelectorAll('.subtask-input')).map(i => i.value.trim()).filter(x => x);
        const tags = $('inp-tags').value.split(',').map(t => t.trim()).filter(x => x);

        const data = {
            title, 
            estimatedPomos: parseInt($('inp-est').value) || 1,
            pomoDuration: parseInt($('inp-duration').value) || 25,
            dueDate: $('inp-date').value,
            priority: $('inp-priority').value,
            project: $('inp-project').value || 'Inbox',
            note: $('inp-note').value,
            repeat: $('inp-repeat').value,
            reminder: $('inp-reminder').value,
            tags, subtasks
        };

        app.closeTaskModal();
        
        try {
            if(state.editingId) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', state.editingId), data);
                app.showToast('Task updated');
            } else {
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), {
                    ...data,
                    status: 'todo',
                    createdAt: new Date().toISOString(),
                    completedPomos: 0
                });
                app.showToast('Task added');
            }
        } catch(e) { app.showToast('Error saving'); }
    },
    
    closeTaskModal: () => {
        $('modal-sheet').classList.add('translate-y-full');
        $('modal-overlay').classList.add('opacity-0');
        setTimeout(() => {
            $('modal-overlay').classList.add('hidden');
            state.editingId = null;
        }, 300);
    },
    
    closeAllSheets: () => {
        app.closeDetailSheet();
        app.closeTaskModal();
    },

    toggleStatus: async (id, s) => {
        haptic();
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), { 
            status: s === 'todo' ? 'done' : 'todo',
            completedAt: s === 'todo' ? new Date().toISOString() : null
        });
    },
    deleteTask: async (id) => {
        if(confirm('Delete task?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id));
    },

    // TIMER
    startFocus: async (id) => {
        const t = state.tasks.find(x => x.id === id);
        if(!t) return;

        app.switchTab('timer');
        const durationMin = t.pomoDuration || state.timer.settings.focus;
        const d = durationMin * 60;
        
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'running', mode: 'focus', taskId: t.id, remaining: d, totalDuration: d, endTime: new Date(Date.now() + d*1000)
        });
    },
    toggleTimer: async () => {
        haptic('medium');
        if(state.timer.status === 'running') {
            if(state.timer.settings.strictMode && state.timer.mode === 'focus' && !confirm("Strict Mode active! Quit?")) return;
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000))
            });
        } else {
            if(!state.timer.taskId && state.timer.mode === 'focus') { app.showToast('Select a task'); app.switchTab('tasks'); return; }
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'running', endTime: new Date(Date.now() + state.timer.remaining * 1000)
            });
        }
    },
    resetTimer: async (r = false) => {
        if (!r) {
            haptic();
            const d = state.timer.settings[state.timer.mode] * 60;
            await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'idle', remaining: d, totalDuration: d, endTime: null, mode: state.timer.mode, taskId: state.timer.taskId || null
            });
        }
    },
    skipTimer: () => app.completeTimer(),
    completeTimer: async () => {
        stopTimerLoop();
        if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if(AudioContext) {
                const c = new AudioContext(); const o = c.createOscillator();
                o.connect(c.destination); o.frequency.value = 523.25; o.start(); o.stop(c.currentTime + .3);
            }
        } catch(e) {}
        
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Timer Complete"); } catch (e) {}

        if(state.timer.mode === 'focus' && state.timer.taskId) {
            const t = state.tasks.find(x => x.id === state.timer.taskId);
            if(t) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos||0) + 1 });
                const durMin = state.timer.total / 60;
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions'), { taskTitle: t.title, taskId: t.id, project: t.project, duration: durMin, completedAt: serverTimestamp() });
            }
            
            if (state.timer.settings.disableBreak) {
                await app.setTimerMode('focus'); if (state.timer.settings.autoStartPomo) app.toggleTimer();
            } else {
                const newCount = (state.timer.pomoCountCurrentSession || 0) + 1; 
                let nextMode = 'short';
                if (newCount >= state.timer.settings.longBreakInterval) nextMode = 'long';
                await app.setTimerMode(nextMode, nextMode === 'long' ? 0 : newCount);
                if (state.timer.settings.autoStartBreak) app.toggleTimer();
            }
        } else {
            await app.setTimerMode('focus', state.timer.pomoCountCurrentSession);
            if (state.timer.settings.autoStartPomo) app.toggleTimer();
        }
        
        app.showToast('Timer Complete');
    },
    setTimerMode: async (m, sessionCount = null) => {
        const v = state.timer.settings[m]; 
        const updates = { status: 'idle', mode: m, remaining: v * 60, totalDuration: v * 60, endTime: null, taskId: state.timer.taskId || null };
        if (sessionCount !== null) updates.sessionCount = sessionCount;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), updates);
    },
    updateTimerUI: () => {
        const { status, endTime, remaining, total, taskId, mode } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        
        $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        $('timer-mode').textContent = mode === 'focus' ? 'FOCUS' : mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK';
        $('timer-mode').className = `text-xs font-bold tracking-widest uppercase mt-3 ${mode==='focus'?'text-brand':'text-blue-500'}`;
        
        const offset = 283 * (1 - (s / (total || 1)));
        $('timer-progress').style.strokeDashoffset = isNaN(offset) ? 0 : offset;
        $('timer-progress').style.stroke = mode === 'focus' ? '#ff5757' : '#3b82f6';

        if(taskId && mode === 'focus') {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                $('focus-empty').classList.add('hidden');
                $('focus-active').classList.remove('hidden');
                $('timer-task-title').textContent = t.title;
                $('timer-badge').textContent = t.project || 'Inbox';
                $('timer-completed').textContent = t.completedPomos || 0;
                $('timer-total').textContent = t.estimatedPomos || 1;
                document.title = `${m}:${sc.toString().padStart(2,'0')} - ${t.title}`;
            }
        } else if (mode !== 'focus') {
            $('focus-empty').classList.remove('hidden');
            $('focus-active').classList.add('hidden');
            $('focus-empty').textContent = "Rest your mind";
            document.title = `${m}:${sc.toString().padStart(2,'0')} - Break`;
        } else {
            $('focus-empty').classList.remove('hidden');
            $('focus-active').classList.add('hidden');
            $('focus-empty').textContent = "Select a task to focus";
            document.title = "TimeTrekker";
        }
    },
    setSound: (t) => {
        state.sound = t;
        $('audio-player').src = sounds[t];
        ['none','rain','cafe','forest'].forEach(x => {
            $(`btn-sound-${x}`).className = x===t ? 'text-brand p-1' : 'text-text-muted hover:text-white transition-colors p-1';
        });
        if(state.timer.status === 'running' && t !== 'none') $('audio-player').play().catch(()=>{});
        else $('audio-player').pause();
    },

    // SETTINGS & ANALYTICS
    updateSetting: (k, v) => {
        state.timer.settings[k] = ['strictMode','autoStartPomo','autoStartBreak','disableBreak'].includes(k) ? v : parseInt(v);
        if(k === 'longBreakInterval') $('set-long-interval-display').innerText = v + 'x';
        else if(!['strictMode','autoStartPomo','autoStartBreak','disableBreak'].includes(k)) $(`set-${k}-display`).innerText = v + 'm';
    },

    showToast: (msg) => {
        const t = document.createElement('div');
        t.className = "bg-dark-active border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-lg shadow-xl text-center animate-slide-up backdrop-blur";
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },
    // Updated signOut to include redirectUrl param
    signOut: () => signOut(auth).then(() => window.location.href = 'https://stack-base.github.io/account/login.html?redirectUrl=' + encodeURIComponent(window.location.href))
};

window.app = app;
app.switchTab('tasks');