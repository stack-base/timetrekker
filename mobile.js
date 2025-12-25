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
const haptic = () => { if(navigator.vibrate) navigator.vibrate(10); };
const getDayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// --- STATE ---
const state = {
    user: null, tasks: [], logs: [], 
    activeTab: 'tasks', activeFilter: 'today',
    timer: { status: 'idle', endTime: null, remaining: 1500, total: 1500, taskId: null },
    editingId: null, chart: null
};

// --- AUTH & DATA ---
onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        $('user-avatar').textContent = (u.email||'U').charAt(0).toUpperCase();
        $('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        // Data Subs
        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'tasks'), s => {
            state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
            app.renderTasks();
            app.renderAnalytics();
        });
        
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', u.uid, 'timer', 'active'), s => {
            if(s.exists()) {
                const d = s.data();
                state.timer = {
                    status: d.status,
                    endTime: d.endTime ? d.endTime.toMillis() : null,
                    remaining: d.remaining || 1500,
                    total: d.totalDuration || 1500,
                    taskId: d.taskId
                };
                app.updateTimerUI();
                if(state.timer.status === 'running') startTimerLoop(); else stopTimerLoop();
            }
        });

        onSnapshot(query(collection(db, 'artifacts', APP_ID, 'users', u.uid, 'focus_sessions')), s => {
            state.logs = s.docs.map(d => d.data());
            app.renderAnalytics();
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
};
const stopTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    $('play-icon').className = "ph-fill ph-play text-3xl ml-1";
};

// --- APP CONTROLLER ---
const app = {
    
    // NAVIGATION
    switchTab: (tab) => {
        haptic();
        state.activeTab = tab;
        
        // UI Toggles
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        $(`view-${tab}`).classList.remove('hidden');
        
        document.querySelectorAll('.nav-item').forEach(el => {
            el.className = `nav-item flex flex-col items-center justify-center w-full h-full text-text-muted transition-colors`;
            el.querySelector('i').classList.remove('ph-fill');
            el.querySelector('i').classList.add('ph-bold');
        });
        
        const activeBtn = $(`tab-${tab}`);
        activeBtn.className = `nav-item flex flex-col items-center justify-center w-full h-full text-brand transition-colors`;
        activeBtn.querySelector('i').classList.remove('ph-bold');
        activeBtn.querySelector('i').classList.add('ph-fill');

        // Contextual Header
        if(tab === 'tasks') {
            $('view-header').classList.remove('hidden');
            $('task-filters').classList.remove('hidden');
            $('fab-add').classList.remove('hidden');
        } else {
            $('view-header').classList.add('hidden');
            $('task-filters').classList.add('hidden');
            $('fab-add').classList.add('hidden');
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
        list.innerHTML = '';
        const today = getDayStr(new Date());
        
        let filtered = state.tasks;
        if(state.activeFilter === 'today') filtered = state.tasks.filter(t => t.status === 'todo' && t.dueDate === today);
        else if(state.activeFilter === 'upcoming') filtered = state.tasks.filter(t => t.status === 'todo' && t.dueDate > today);
        else if(state.activeFilter === 'completed') filtered = state.tasks.filter(t => t.status === 'done');
        // Project view simplified for mobile: just show all active grouped by project or list
        
        if(filtered.length === 0) $('empty-state').classList.remove('hidden');
        else $('empty-state').classList.add('hidden');

        filtered.forEach(t => {
            const el = document.createElement('div');
            el.className = `bg-dark-card border border-dark-border p-4 rounded-xl flex items-start gap-3 active:scale-[0.98] transition-transform select-none`;
            // Long press logic could go here
            el.onclick = (e) => {
                if(!e.target.closest('.check-area')) app.startFocus(t);
            };

            const isDone = t.status === 'done';
            
            el.innerHTML = `
                <div class="check-area pt-1" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${isDone ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center">
                        ${isDone ? '<i class="ph-bold ph-check text-white text-xs"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-medium truncate ${isDone ? 'line-through text-text-muted':''}">${t.title}</h3>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-dark-active text-text-muted">${t.project || 'Inbox'}</span>
                        ${t.priority === 'high' ? '<span class="text-[10px] text-red-500 font-bold">! Urgent</span>' : ''}
                    </div>
                </div>
                <button class="text-text-muted p-2" onclick="event.stopPropagation(); app.deleteTask('${t.id}')"><i class="ph-bold ph-trash"></i></button>
            `;
            list.appendChild(el);
        });
    },

    // MODAL
    openTaskModal: () => {
        haptic();
        $('modal-overlay').classList.remove('hidden');
        $('inp-date').value = getDayStr(new Date());
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
            $('inp-title').value = '';
            $('inp-note').value = '';
        }, 300);
    },
    
    // CRUD
    saveTask: async () => {
        const title = $('inp-title').value;
        if(!title) return;
        const data = {
            title, 
            estimatedPomos: parseInt($('inp-est').value) || 1,
            dueDate: $('inp-date').value,
            priority: $('inp-priority').value,
            project: 'Inbox', // Simplified for mobile v1
            note: $('inp-note').value,
            status: 'todo',
            createdAt: new Date().toISOString(),
            completedPomos: 0
        };
        app.closeTaskModal();
        await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks'), data);
        app.showToast('Task added');
    },
    toggleStatus: async (id, s) => {
        haptic();
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id), { 
            status: s === 'todo' ? 'done' : 'todo' 
        });
    },
    deleteTask: async (id) => {
        if(confirm('Delete task?')) await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', id));
    },

    // TIMER
    startFocus: async (t) => {
        app.switchTab('timer');
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'running', taskId: t.id, remaining: 1500, totalDuration: 1500, endTime: new Date(Date.now() + 1500000)
        });
    },
    toggleTimer: async () => {
        haptic();
        if(state.timer.status === 'running') {
            // Pause
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000))
            });
        } else {
            // Resume/Start
            if(!state.timer.taskId) { app.showToast('Select a task first'); app.switchTab('tasks'); return; }
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
                status: 'running', endTime: new Date(Date.now() + state.timer.remaining * 1000)
            });
        }
    },
    resetTimer: async () => {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'timer', 'active'), {
            status: 'idle', remaining: 1500, totalDuration: 1500, endTime: null
        });
    },
    completeTimer: async () => {
        stopTimerLoop();
        haptic();
        // Simple completion logic
        if(state.timer.taskId) {
            const t = state.tasks.find(x => x.id === state.timer.taskId);
            if(t) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos||0) + 1 });
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', state.user.uid, 'focus_sessions'), { taskId: t.id, duration: 25, completedAt: serverTimestamp() });
            }
        }
        app.resetTimer();
        app.showToast('Session Complete!');
    },
    updateTimerUI: () => {
        const { status, endTime, remaining, total, taskId } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        
        $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        $('timer-progress').style.strokeDashoffset = 283 * (1 - (s / (total || 1)));

        if(taskId) {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                $('focus-empty').classList.add('hidden');
                $('focus-active').classList.remove('hidden');
                $('timer-task-title').textContent = t.title;
                $('timer-badge').textContent = t.project || 'Inbox';
                $('timer-completed').textContent = t.completedPomos || 0;
                $('timer-total').textContent = t.estimatedPomos || 1;
            }
        }
    },

    // ANALYTICS & MISC
    renderAnalytics: () => {
        const logs = state.logs;
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        $('stat-focus-time').textContent = Math.floor(totalMin / 60) + 'h ' + (totalMin % 60) + 'm';
        $('stat-tasks-done').textContent = state.tasks.filter(t => t.status === 'done').length;

        const list = $('mobile-logs');
        list.innerHTML = logs.slice(0, 5).map(l => `
            <div class="px-4 py-3 flex justify-between items-center text-sm">
                <span class="text-white truncate max-w-[60%]">${l.taskTitle || 'Focus Session'}</span>
                <span class="text-brand font-mono">${l.duration||25}m</span>
            </div>
        `).join('');
    },
    showToast: (msg) => {
        const t = document.createElement('div');
        t.className = "bg-dark-active border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-lg shadow-xl text-center animate-slide-up";
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 2500);
    },
    signOut: () => signOut(auth)
};

window.app = app;
app.switchTab('tasks');