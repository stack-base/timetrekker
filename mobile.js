import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

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
const haptic = () => { try { if(navigator.vibrate) navigator.vibrate(10); } catch(e){} };
const getDayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const sounds = { 
    none: '', 
    rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', 
    cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg', 
    forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' 
};

// --- STATE ---
const state = {
    user: null, tasks: [], logs: [], 
    projects: new Set(['Inbox']),
    activeTab: 'tasks', activeFilter: 'today',
    timer: { 
        status: 'idle', endTime: null, remaining: 1500, total: 1500, taskId: null, mode: 'focus',
        settings: { focus: 25, short: 5, long: 15, strictMode: false, autoStartPomo: false }
    },
    sound: 'none',
    editingId: null, // Tracks if we are editing an existing task
    chartInstance: null,
    chartView: 'weekly'
};

// --- AUTH & DATA ---
onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        // Header Avatar
        $('header-avatar').textContent = (u.displayName || u.email || 'U').charAt(0).toUpperCase();
        $('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        // Settings Profile population
        $('settings-avatar').textContent = (u.displayName || u.email || 'U').charAt(0).toUpperCase();
        $('settings-name').textContent = u.displayName || 'User Account';
        $('settings-email').textContent = u.email;

        // Tasks Listener
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), s => {
            state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
            state.projects = new Set(['Inbox', 'Work', 'Personal', 'Study']);
            state.tasks.forEach(t => { if(t.project) state.projects.add(t.project); });
            app.renderTasks();
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
                    taskId: d.taskId
                };
                // Sync Settings
                if(d.strictMode !== undefined) state.timer.settings.strictMode = d.strictMode;
                
                app.updateTimerUI();
                if(state.timer.status === 'running') startTimerLoop(); else stopTimerLoop();
            }
        });

        // Logs Listener
        onSnapshot(query(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions')), s => {
            state.logs = s.docs.map(d => d.data()).sort((a,b) => (b.completedAt?.seconds||0) - (a.completedAt?.seconds||0));
            if(state.activeTab === 'analytics') app.renderAnalytics();
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
            $('toggle-strict').checked = state.timer.settings.strictMode;
            $('toggle-auto-pomo').checked = state.timer.settings.autoStartPomo;
            $('set-focus-display').innerText = state.timer.settings.focus + 'm';
            $('set-short-display').innerText = state.timer.settings.short + 'm';
            $('set-long-display').innerText = state.timer.settings.long + 'm';
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
            // Priority Coloring
            const priColor = t.priority === 'high' ? 'border-red-500/50' : t.priority === 'med' ? 'border-yellow-500/50' : t.priority === 'low' ? 'border-blue-500/50' : 'border-dark-border';
            
            el.className = `bg-dark-card border ${priColor} p-4 rounded-xl flex items-start gap-3 active:scale-[0.98] transition-transform select-none relative`;
            // CLICK OPENS DETAILS NOW, NOT TIMER
            el.onclick = (e) => {
                if(!e.target.closest('.check-area') && !e.target.closest('.play-btn') && !e.target.closest('.del-btn')) app.openTaskModal(t);
            };

            const isDone = t.status === 'done';
            const subtext = t.subtasks && t.subtasks.length > 0 ? `${t.subtasks.length} subtasks` : '';
            const tags = t.tags && t.tags.length > 0 ? t.tags.map(tag => `<span class="bg-dark-active px-1.5 py-0.5 rounded text-[10px] text-text-muted border border-white/5">${tag}</span>`).join('') : '';

            el.innerHTML = `
                <div class="check-area pt-1" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${isDone ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center">
                        ${isDone ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-medium truncate ${isDone ? 'line-through text-text-muted':''}">${t.title}</h3>
                    ${t.note ? `<p class="text-text-muted text-xs truncate mt-0.5">${t.note}</p>` : ''}
                    
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium border border-brand/20">${t.project || 'Inbox'}</span>
                        ${subtext ? `<span class="text-[10px] text-text-muted flex items-center"><i class="ph-bold ph-list-dashes mr-1"></i>${subtext}</span>` : ''}
                        ${tags}
                    </div>
                </div>
                
                <button class="play-btn w-8 h-8 rounded-full bg-dark-active flex items-center justify-center text-brand active:scale-90 transition-transform ml-1" onclick="event.stopPropagation(); app.startFocus(state.tasks.find(x=>x.id==='${t.id}'))">
                    <i class="ph-fill ph-play"></i>
                </button>
            `;
            list.appendChild(el);
        });
    },

    // MODAL (Now functions as View/Edit)
    openTaskModal: (task = null) => {
        haptic();
        const sel = $('inp-project');
        sel.innerHTML = '';
        state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p; opt.className = 'bg-dark-card';
            sel.appendChild(opt);
        });

        $('subtask-list').innerHTML = '';

        if (task) {
            // Edit Mode
            state.editingId = task.id;
            $('sheet-title').textContent = "Edit Task";
            $('btn-save-task').textContent = "Save Changes";
            $('modal-focus-btn').classList.remove('hidden');
            
            $('inp-title').value = task.title;
            $('inp-est').value = task.estimatedPomos || 1;
            $('inp-date').value = task.dueDate || '';
            $('inp-project').value = task.project || 'Inbox';
            $('inp-priority').value = task.priority || 'none';
            $('inp-note').value = task.note || '';
            $('inp-tags').value = task.tags ? task.tags.join(', ') : '';
            $('inp-repeat').value = task.repeat || 'none';
            $('inp-reminder').value = task.reminder || '';
            
            if(task.subtasks) task.subtasks.forEach(s => app.addSubtaskInput(s));
        } else {
            // New Task Mode
            state.editingId = null;
            $('sheet-title').textContent = "New Task";
            $('btn-save-task').textContent = "Create Task";
            $('modal-focus-btn').classList.add('hidden');
            
            $('inp-title').value = '';
            $('inp-est').value = 1;
            $('inp-date').value = getDayStr(new Date());
            $('inp-project').value = 'Inbox';
            $('inp-priority').value = 'none';
            $('inp-note').value = '';
            $('inp-tags').value = '';
            $('inp-repeat').value = 'none';
            $('inp-reminder').value = '';
        }

        $('modal-overlay').classList.remove('hidden');
        setTimeout(() => {
            $('modal-overlay').classList.remove('opacity-0');
            $('modal-sheet').classList.remove('translate-y-full');
        }, 10);
    },

    closeTaskModal: () => {
        $('modal-overlay').classList.add('opacity-0');
        $('modal-sheet').classList.add('translate-y-full');
        setTimeout(() => {
            $('modal-overlay').classList.add('hidden');
            state.editingId = null;
        }, 300);
    },

    addSubtaskInput: (val = '') => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 animate-slide-up';
        div.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-brand shrink-0"></div><input type="text" value="${val}" class="subtask-input w-full bg-transparent border-b border-dark-border text-xs text-white py-1 outline-none" placeholder="Subtask...">`;
        $('subtask-list').appendChild(div);
    },
    
    saveTask: async () => {
        const title = $('inp-title').value;
        if(!title) return;
        
        const subtasks = Array.from(document.querySelectorAll('.subtask-input')).map(i => i.value.trim()).filter(x => x);
        const tags = $('inp-tags').value.split(',').map(t => t.trim()).filter(x => x);

        const data = {
            title, 
            estimatedPomos: parseInt($('inp-est').value) || 1,
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
                // Update
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', state.editingId), data);
                app.showToast('Task updated');
            } else {
                // Create
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
    startFocus: async (t) => {
        app.switchTab('timer');
        const d = state.timer.settings.focus * 60;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'running', mode: 'focus', taskId: t.id, remaining: d, totalDuration: d, endTime: new Date(Date.now() + d*1000)
        });
    },
    startFocusFromModal: () => {
        if(state.editingId) {
            const t = state.tasks.find(x => x.id === state.editingId);
            if(t) {
                app.closeTaskModal();
                app.startFocus(t);
            }
        }
    },
    toggleTimer: async () => {
        haptic();
        if(state.timer.status === 'running') {
            if(state.timer.settings.strictMode && !confirm("Strict Mode: Stop timer?")) return;
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
    resetTimer: async () => {
        const d = state.timer.settings[state.timer.mode] * 60;
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'idle', remaining: d, totalDuration: d, endTime: null
        });
    },
    skipTimer: () => app.completeTimer(),
    completeTimer: async () => {
        stopTimerLoop();
        if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
        
        if(state.timer.mode === 'focus' && state.timer.taskId) {
            const t = state.tasks.find(x => x.id === state.timer.taskId);
            if(t) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos||0) + 1 });
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions'), { taskTitle: t.title, taskId: t.id, project: t.project, duration: state.timer.total/60, completedAt: serverTimestamp() });
            }
        }
        
        const nextMode = state.timer.mode === 'focus' ? 'short' : 'focus';
        const d = state.timer.settings[nextMode] * 60;
        const autoStart = nextMode === 'focus' && state.timer.settings.autoStartPomo;
        
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: autoStart ? 'running' : 'idle',
            mode: nextMode,
            remaining: d, totalDuration: d,
            endTime: autoStart ? new Date(Date.now() + d*1000) : null
        });
        
        app.showToast(nextMode === 'focus' ? 'Break over, Focus!' : 'Take a break');
    },
    updateTimerUI: () => {
        const { status, endTime, remaining, total, taskId, mode } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        
        $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        $('timer-mode').textContent = mode === 'focus' ? 'FOCUS' : 'BREAK';
        $('timer-mode').className = `text-xs font-bold tracking-widest uppercase mt-2 ${mode==='focus'?'text-brand':'text-blue-500'}`;
        
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
            }
        } else if (mode !== 'focus') {
            $('focus-empty').classList.remove('hidden');
            $('focus-active').classList.add('hidden');
            $('focus-empty').textContent = "Rest your mind";
        }
    },
    setSound: (t) => {
        state.sound = t;
        $('audio-player').src = sounds[t];
        ['none','rain','cafe','forest'].forEach(x => {
            $(`btn-sound-${x}`).className = x===t ? 'text-brand' : 'text-text-muted hover:text-white transition-colors';
        });
        if(state.timer.status === 'running' && t !== 'none') $('audio-player').play();
        else $('audio-player').pause();
    },

    // SETTINGS & ANALYTICS
    updateSetting: (k, v) => {
        state.timer.settings[k] = ['strictMode','autoStartPomo'].includes(k) ? v : parseInt(v);
        if(!['strictMode','autoStartPomo'].includes(k)) $(`set-${k}-display`).innerText = v + 'm';
    },

    toggleChart: (type) => {
        state.chartView = type;
        $('chart-btn-weekly').className = type === 'weekly' ? 'px-3 py-1 text-[10px] rounded font-bold bg-dark-bg text-white shadow' : 'px-3 py-1 text-[10px] rounded font-bold text-text-muted hover:text-white';
        $('chart-btn-hourly').className = type === 'hourly' ? 'px-3 py-1 text-[10px] rounded font-bold bg-dark-bg text-white shadow' : 'px-3 py-1 text-[10px] rounded font-bold text-text-muted hover:text-white';
        app.renderAnalytics();
    },

    renderAnalytics: () => {
        if(state.activeTab !== 'analytics') return;
        
        const logs = state.logs;
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        $('stat-focus-time').textContent = Math.floor(totalMin / 60) + 'h ' + (totalMin % 60) + 'm';
        $('stat-tasks-done').textContent = state.tasks.filter(t => t.status === 'done').length;

        const list = $('mobile-logs');
        if(list) {
            list.innerHTML = logs.slice(0, 10).map(l => `
                <div class="px-4 py-3 flex justify-between items-center text-sm">
                    <div>
                        <div class="text-white truncate max-w-[150px] font-medium">${l.taskTitle || 'Focus Session'}</div>
                        <div class="text-[10px] text-text-muted">${l.project || 'Inbox'}</div>
                    </div>
                    <span class="text-brand font-mono">${Math.round(l.duration||25)}m</span>
                </div>
            `).join('');
        }

        const ctx = $('mobileChart');
        if(ctx) {
            const isWeek = state.chartView === 'weekly';
            let labels = [], data = [], color = isWeek ? '#ff5757' : '#10b981';
            
            if(isWeek) {
                for(let i=6; i>=0; i--) {
                    const d = new Date(); d.setDate(d.getDate() - i);
                    labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
                    const ds = getDayStr(d);
                    const dayLogs = logs.filter(l => l.completedAt && getDayStr(new Date(l.completedAt.seconds*1000)) === ds);
                    data.push(dayLogs.reduce((a,b)=>a+(b.duration||25),0));
                }
            } else {
                labels = Array.from({length:24}, (_,i)=>i);
                data = Array(24).fill(0);
                logs.forEach(l => { if(l.completedAt) data[new Date(l.completedAt.seconds*1000).getHours()] += (l.duration||25); });
            }

            if(state.chartInstance) state.chartInstance.destroy();
            state.chartInstance = new Chart(ctx, {
                type: isWeek ? 'bar' : 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Minutes',
                        data: data,
                        backgroundColor: color,
                        borderColor: color,
                        borderRadius: 4,
                        tension: 0.4,
                        fill: !isWeek
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#27272a' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    },
    
    showToast: (msg) => {
        const t = document.createElement('div');
        t.className = "bg-dark-active border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-lg shadow-xl text-center animate-slide-up backdrop-blur";
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 2500);
    },
    signOut: () => signOut(auth)
};

window.app = app;
app.switchTab('tasks');