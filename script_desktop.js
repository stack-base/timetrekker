let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

async function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;
    }
}

window.addEventListener('appinstalled', () => {
    console.log('TimeTrekker was installed');
});

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-desktop');
    if (installBtn) installBtn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('btn-install-desktop');
    if (installBtn) installBtn.classList.add('hidden');
    app.showToast('TimeTrekker installed successfully!', 'success');
});

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp, enableIndexedDbPersistence, arrayUnion, orderBy, limit } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U",
    authDomain: "timetrekker-app.firebaseapp.com",
    projectId: "timetrekker-app",
    storageBucket: "timetrekker-app.firebasestorage.app",
    messagingSenderId: "83185163190",
    appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17",
    measurementId: "G-FLZ02E1Y5L"
};

const APP_ID = 'timetrekker-v1';
const ORION_ID = "oxnHr84lGgOkLQuxSouJaXJDx1I3";

const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);

const URL_PARAMS = new URLSearchParams(window.location.search);
const VIEW_AS_UID = URL_PARAMS.get('uid');

try {
    enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw_desktop.js').catch(() => {});
    });
}

const D = document;
const $ = (id) => D.getElementById(id);

const esc = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

const haptic = (type = 'light') => {
    if (!navigator.vibrate) return;
    try {
        const patterns = { light: 10, medium: 25, heavy: 40, success: [10, 30], timerDone: [200, 100, 200] };
        navigator.vibrate(patterns[type] || 10);
    } catch (e) {}
};

const wakeLock = {
    sentinel: null,
    request: async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLock.sentinel = await navigator.wakeLock.request('screen');
            } catch (err) {}
        }
    },
    release: async () => {
        if (wakeLock.sentinel) {
            try {
                await wakeLock.sentinel.release();
                wakeLock.sentinel = null;
            } catch (e) {}
        }
    }
};

const localSettings = JSON.parse(localStorage.getItem(APP_ID + '_settings')) || {
    focus: 25, short: 5, long: 15, strictMode: false,
    longBreakInterval: 4, autoStartPomo: false, autoStartBreak: false, disableBreak: false
};

const localUI = JSON.parse(localStorage.getItem(APP_ID + '_ui')) || { view: 'today', sound: 'none' };

const INSTANCE_ID = Math.random().toString(36).substring(2, 15);

function setBackgroundAlarm(endTimeMs, mode) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'START_ALARM', endTime: endTimeMs, mode });
    }
}

function clearBackgroundAlarm() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALARM' });
    }
}

const parseDate = (val) => {
    if (!val) return null;
    let d;
    if (typeof val === 'number') d = new Date(val); 
    else if (val.seconds !== undefined) d = new Date(val.seconds * 1000);
    else if (typeof val === 'string') d = new Date(val);
    else if (val instanceof Date) d = val;
    else return null;
    return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
};

const getISTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const state = {
    user: null,
    tasks: [],
    logs: [],
    projects: new Set(['Inbox', 'Work', 'Personal', 'Study']),
    view: localUI.view,
    filterProject: null,
    selectedTaskId: null,
    editingTaskId: null,
    timer: {
        mode: 'focus', status: 'idle', endTime: null,
        remaining: localSettings.focus * 60,
        totalDuration: localSettings.focus * 60,
        activeTaskId: null, interval: null,
        sessionId: null,
        pomoCountCurrentSession: 0,
        settings: localSettings,
        initiatorId: null
    },
    newEst: 1,
    sound: localUI.sound,
    charts: { focusBar: null, taskBar: null, project: null, hourly: null, weekday: null, priority: null, todayTimeline: null },
    chartTypes: { focus: 'bar', task: 'bar', hourly: 'bar', weekday: 'bar' },
    analytics: { range: 'week', metric: 'time' },
    lastCheckTime: null
};

const getUid = () => {
    if (!state.user) return null;
    if (VIEW_AS_UID && state.user.uid === ORION_ID) return VIEW_AS_UID;
    return state.user.uid;
};

const saveLocalState = () => {
    localStorage.setItem(APP_ID + '_settings', JSON.stringify(state.timer.settings));
    localStorage.setItem(APP_ID + '_ui', JSON.stringify({
        view: state.view,
        sound: state.sound
    }));
};

const sounds = {
    none: '',
    rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
    cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg'
};

const getEls = () => ({
    taskList: $('task-list'), taskViewContainer: $('task-view-container'), analyticsViewContainer: $('analytics-view-container'),
    pageTitle: $('page-title'), emptyState: $('empty-state'), modal: $('add-task-modal'), modalPanel: $('add-task-panel'),
    modalTitle: $('modal-title'), saveTaskBtn: $('save-task-btn'), estDisplay: $('est-display'), dateInput: $('task-date'),
    timerDisplay: $('timer-display'), timerProgress: $('timer-progress'), timerMode: $('timer-mode'), playIcon: $('play-icon'),
    focusActive: $('focus-active'), focusEmpty: $('focus-empty'), focusTitle: $('focus-task-title'), focusProject: $('focus-project-badge'),
    focusCompleted: $('focus-completed'), focusTotal: $('focus-total'), timerPanel: $('timer-panel'),
    navCounts: { all: $('count-all'), today: $('count-today'), tomorrow: $('count-tomorrow'), upcoming: $('count-upcoming'), past: $('count-past') },
    stats: { pomosToday: $('stat-pomos-today'), tasksToday: $('stat-tasks-today'), estRemain: $('stat-est-remaining'), focusTime: $('stat-focus-time'), tasksRemain: $('stat-tasks-remaining'), estTime: $('stat-est-time') },
    analytics: {
        timeTotal: $('ana-time-total'), timeWeek: $('ana-time-week'), timeToday: $('ana-time-today'),
        taskTotal: $('ana-task-total'), taskWeek: $('ana-task-week'), taskToday: $('ana-task-today'),
        completionRate: $('ana-completion-rate'), avgSession: $('ana-avg-session'),
        earlyBird: $('ana-early-bird'), nightOwl: $('ana-night-owl'), streakDays: $('ana-streak-days'),
        projectCount: $('ana-project-count'), insightText: $('insight-text'),
        timelineGrid: $('pomo-timeline-grid'), focusBarChart: $('focusBarChart'), taskBarChart: $('taskBarChart'), todayTimelineChart: $('todayTimelineChart'),
        projectChart: $('projectChart'), hourlyChart: $('hourlyChart'), weekdayChart: $('weekdayChart'), priorityChart: $('priorityChart'),
        projList: $('project-rank-list'), tagList: $('tag-rank-list'), sessionLogBody: $('session-log-body')
    },
    projectList: $('project-list'), subtasksContainer: $('subtasks-container'), audio: $('audio-player'),
    currentDate: $('current-date-display'), sidebarOverlay: $('sidebar-overlay'), sidebar: $('sidebar'), headerActions: $('header-actions'),
    settingsModal: $('global-settings-modal'), settingsPanel: $('settings-panel'), settingsTitle: $('settings-view-title'),
    strictToggle: $('strict-mode-toggle'), settingsAvatar: $('settings-avatar'), settingsName: $('settings-name'), settingsEmail: $('settings-email'),
    taskPomoDisplay: $('task-pomo-display'), totalTimeCalc: $('total-time-calc'), taskRepeat: $('task-repeat'), taskReminder: $('task-reminder')
});

if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Inter';
    Chart.defaults.color = '#a3a3a3';
    Chart.defaults.borderColor = '#333333';
    if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        Chart.defaults.plugins.tooltip.titleColor = '#fff';
        Chart.defaults.plugins.tooltip.bodyColor = '#a3a3a3';
        Chart.defaults.plugins.tooltip.borderColor = '#333';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
    }
}

async function syncUserProfile(u) {
    if (!u) return;
    if (VIEW_AS_UID && u.uid === ORION_ID) return;

    try {
        const userRef = doc(db, 'artifacts', APP_ID, 'users', u.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            const newProfileData = {
                displayName: u.displayName || u.email.split('@')[0],
                email: u.email,
                photoURL: u.photoURL,
                providerId: u.providerData.length > 0 ? u.providerData[0].providerId : 'password',
                lastLogin: serverTimestamp(),
                createdAt: serverTimestamp(),
                uid: u.uid
            };
            await setDoc(userRef, newProfileData);
        } else {
            await updateDoc(userRef, {
                lastLogin: serverTimestamp()
            });
        }
    } catch (e) {}
}

function showOrionBanner(uid) {
    const banner = D.createElement('div');
    banner.className = 'fixed top-0 left-0 right-0 h-6 bg-red-600 z-[100] flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white shadow-lg';
    banner.innerHTML = `<i class="ph-bold ph-eye mr-2"></i> Orion : ${uid}`;
    D.body.prepend(banner);
    D.getElementById('sidebar').style.top = '24px';
    D.querySelector('main').style.paddingTop = '0px'; 
    D.body.style.height = 'calc(100vh - 24px)';
    D.body.style.marginTop = '24px';
}

const subBroadcasts = (uid) => {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_broadcasts') || '[]');
    const snoozed = JSON.parse(localStorage.getItem('snoozed_broadcasts') || '{}');
    const q = query(collection(db, 'artifacts', APP_ID, 'broadcasts'), orderBy('createdAt', 'desc'), limit(10));
    
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const b = { id: change.doc.id, ...change.doc.data() };
                
                if (b.expiresAt && new Date(b.expiresAt) < new Date()) return;
                if (snoozed[b.id] && new Date(snoozed[b.id]) > new Date()) return;

                if ((b.target === 'all' || b.target === uid) && !dismissed.includes(b.id)) {
                    app.showBroadcastPopup(b);
                }
            }
        });
    });
};

onAuthStateChanged(auth, u => {
    if (u) {
        state.user = u;
        syncUserProfile(u);
        const els = getEls();
        
        let viewingAsUser = false;
        if (VIEW_AS_UID) {
            if (u.uid === ORION_ID) {
                showOrionBanner(VIEW_AS_UID);
                viewingAsUser = true;
            }
        }

        const effectiveUid = getUid();
        const p = $('user-profile-display');
        
        if (p) {
            p.classList.remove('hidden'); p.classList.add('flex');
            
            if (viewingAsUser) {
                $('user-name-text').textContent = "Simulated User";
                $('user-email-text').textContent = VIEW_AS_UID;
                $('user-avatar-initials').textContent = "?";
                
                getDoc(doc(db, 'artifacts', APP_ID, 'users', VIEW_AS_UID)).then(snap => {
                    if(snap.exists()) {
                        const d = snap.data();
                        const name = d.displayName || d.name || 'User';
                        $('user-name-text').textContent = name;
                        $('user-email-text').textContent = d.email || VIEW_AS_UID;
                        if(els.settingsName) els.settingsName.textContent = name;
                        if(els.settingsEmail) els.settingsEmail.textContent = d.email || VIEW_AS_UID;
                        
                        if (d.photoURL) {
                            $('user-avatar-initials').innerHTML = `<img src="${d.photoURL}" alt="Profile" class="w-full h-full object-cover rounded">`;
                            if(els.settingsAvatar) els.settingsAvatar.innerHTML = `<img src="${d.photoURL}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
                        } else {
                            const initial = name.charAt(0).toUpperCase();
                            $('user-avatar-initials').innerHTML = initial;
                            if(els.settingsAvatar) els.settingsAvatar.innerHTML = initial;
                        }
                    }
                });
            } else {
                getDoc(doc(db, 'artifacts', APP_ID, 'users', effectiveUid)).then(s => {
                    if (s.exists()) {
                        const d = s.data();
                        const name = d.displayName || u.displayName || u.email.split('@')[0];
                        const email = d.email || u.email;
                        const pic = d.photoURL;

                        $('user-name-text').textContent = name;
                        $('user-email-text').textContent = email;
                        if(els.settingsName) els.settingsName.textContent = name;
                        if(els.settingsEmail) els.settingsEmail.textContent = email;

                        if (pic) {
                            $('user-avatar-initials').innerHTML = `<img src="${pic}" alt="Profile" class="w-full h-full object-cover rounded">`;
                            if(els.settingsAvatar) els.settingsAvatar.innerHTML = `<img src="${pic}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
                        } else {
                            const initial = name.charAt(0).toUpperCase();
                            $('user-avatar-initials').innerHTML = initial;
                            if(els.settingsAvatar) els.settingsAvatar.innerHTML = initial;
                        }
                    }
                });
            }
        } 

        subTasks(effectiveUid);
        subLogs(effectiveUid);
        subTimer(effectiveUid);
        subBroadcasts(effectiveUid); 

        if(els.currentDate) els.currentDate.textContent = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric' });

        app.setSound(state.sound);

        setInterval(() => {
            const now = getISTNow();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (state.lastCheckTime !== currentTime) {
                state.lastCheckTime = currentTime;
                if ('Notification' in window && Notification.permission === 'granted') {
                    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                    state.tasks.forEach(t => {
                        if (t.status === 'todo' && t.reminder === currentTime && (t.dueDate === todayStr || !t.dueDate)) {
                            try {
                                haptic('light');
                                new Notification(`Reminder: ${t.title}`, { body: "It's time for your task.", icon: 'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png' });
                            } catch (e) { }
                        }
                    });
                }
            }
        }, 10000);

        const action = URL_PARAMS.get('action');
        if (action === 'new-task') {
            setTimeout(() => app.toggleAddTaskModal(), 500);
        } else if (action === 'focus') {
            setTimeout(() => app.toggleFocusPanel(true), 500);
        } else if (action === 'view-today') {
            setTimeout(() => app.setView('today'), 500);
        } else if (action === 'view-analytics') {
            setTimeout(() => app.setView('analytics'), 500);
        }

    } else {
        window.location.href = 'https://stack-base.github.io/account/login?redirectUrl=' + encodeURIComponent(window.location.href);
    }
});

const subTasks = uid => onSnapshot(collection(db, 'artifacts', APP_ID, 'users', uid, 'tasks'), s => {
    const t = [], p = new Set(['Inbox', 'Work', 'Personal', 'Study']);
    s.forEach(d => { const x = d.data(); t.push({ id: d.id, ...x }); if (x.project && x.project !== 'Inbox') p.add(x.project); });
    state.tasks = t; state.projects = p;
    updateProjectsUI();
    updateCounts();
    renderTasks();
    if (state.timer.activeTaskId) {
        const activeTask = t.find(x => x.id === state.timer.activeTaskId);
        updateTimerUI(activeTask);
    }
    if (state.view === 'analytics') updateAnalytics();
}, err => {
    if(VIEW_AS_UID) app.showToast("Permission Denied: Cannot access this data.", "error");
});

const subTimer = uid => onSnapshot(doc(db, 'artifacts', APP_ID, 'users', uid, 'timer', 'active'), s => {
    if (s.exists()) {
        const d = s.data();
        state.timer = {
            ...state.timer,
            status: d.status || 'idle',
            mode: d.mode || 'focus',
            endTime: d.endTime ? d.endTime.toMillis() : null,
            remaining: d.remaining || state.timer.settings[d.mode || 'focus'] * 60,
            totalDuration: d.totalDuration || state.timer.settings[d.mode || 'focus'] * 60,
            activeTaskId: d.taskId || null,
            sessionId: d.sessionId || null,
            pomoCountCurrentSession: d.sessionCount || 0,
            initiatorId: d.initiatorId || null
        };

        let settingsChanged = false;
        if(d.strictMode !== undefined) { state.timer.settings.strictMode = d.strictMode; settingsChanged = true; }
        if(d.autoStartPomo !== undefined) { state.timer.settings.autoStartPomo = d.autoStartPomo; settingsChanged = true; }
        if(d.autoStartBreak !== undefined) { state.timer.settings.autoStartBreak = d.autoStartBreak; settingsChanged = true; }
        if(d.disableBreak !== undefined) { state.timer.settings.disableBreak = d.disableBreak; settingsChanged = true; }
        if(d.focus !== undefined) { state.timer.settings.focus = d.focus; settingsChanged = true; }
        if(d.short !== undefined) { state.timer.settings.short = d.short; settingsChanged = true; }
        if(d.long !== undefined) { state.timer.settings.long = d.long; settingsChanged = true; }
        if(d.longBreakInterval !== undefined) { state.timer.settings.longBreakInterval = d.longBreakInterval; settingsChanged = true; }

        if(settingsChanged) saveLocalState();

        const els = getEls();
        app.setTimerModeUI(state.timer.mode);

        let activeTask = null;
        if (state.timer.activeTaskId) {
             state.selectedTaskId = state.timer.activeTaskId;
             activeTask = state.tasks.find(x => x.id === state.timer.activeTaskId);
        }
        updateTimerUI(activeTask);

        if (state.timer.status === 'running') {
            startLocalInterval();
            wakeLock.request();
            updateTimerVisuals();
            if (state.sound !== 'none' && els.audio && els.audio.paused) {
                els.audio.play().catch(e => {});
            }
        } else {
            stopLocalInterval();
            wakeLock.release();
            updateTimerVisuals();
            if (els.audio && !els.audio.paused) els.audio.pause();
        }
    } else {
        app.resetTimer(true);
    }
});

const subLogs = uid => {
    const logsQuery = query(
        collection(db, 'artifacts', APP_ID, 'users', uid, 'monthly_logs'), 
        orderBy('month', 'desc'), 
        limit(12) 
    );

    onSnapshot(logsQuery, s => {
        let allSessions = [];
        s.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.sessions && Array.isArray(data.sessions)) {
                allSessions = allSessions.concat(data.sessions);
            }
        });

        allSessions.sort((a, b) => b.completedAt - a.completedAt);
        state.logs = allSessions;
        updateCounts();
        if (state.view === 'analytics') updateAnalytics();
    });
};

const startLocalInterval = () => {
    const els = getEls();
    if (state.timer.interval) clearInterval(state.timer.interval);
    state.timer.interval = setInterval(() => {
        updateTimerVisuals();
        if (state.timer.status === 'running' && state.timer.endTime && Date.now() >= state.timer.endTime) app.completeTimer();
    }, 100);
    if(els.playIcon) els.playIcon.className = "ph-fill ph-pause text-3xl ml-1";
};

const stopLocalInterval = () => {
    const els = getEls();
    if (state.timer.interval) clearInterval(state.timer.interval);
    state.timer.interval = null;
    if(els.playIcon) els.playIcon.className = "ph-fill ph-play text-3xl ml-1";
};

const updateTimerVisuals = () => {
    const els = getEls();
    if(!els.timerDisplay) return;

    const { status, endTime, remaining, totalDuration } = state.timer;
    const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
    const m = Math.floor(s / 60), sc = s % 60;

    els.timerDisplay.textContent = `${m.toString().padStart(2, '0')}:${sc.toString().padStart(2, '0')}`;
    if(els.timerProgress) els.timerProgress.style.strokeDashoffset = 289 * (1 - (s / (totalDuration || 1)));

    if(state.timer.status === 'running') D.title = `${m}:${sc.toString().padStart(2, '0')} - TimeTrekker`;
};

D.addEventListener("visibilitychange", () => {
   if (!D.hidden && state.timer.status === 'running') {
       updateTimerVisuals();
       if(state.timer.endTime && Date.now() >= state.timer.endTime) app.completeTimer();
   }
});

const _saveSetting = debounce((k, v) => {
    if(getUid()) {
        updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), { [k]: v }).catch(() => {});
    }
}, 500);

const app = {
    toggleAISummary: () => {
        const wrapper = $('ai-summary-wrapper');
        const content = $('ai-summary-content');
        if (!wrapper || !content) return;

        if (wrapper.classList.contains('grid-rows-[0fr]')) {
            haptic('light');
            
            // Instantly generate and inject the data
            app.generateAISummaryData(); 
            
            // Trigger smooth roll down
            wrapper.classList.remove('grid-rows-[0fr]');
            wrapper.classList.add('grid-rows-[1fr]');
            
            // Fade in the text smoothly as it expands
            content.classList.remove('opacity-0');
            content.classList.add('opacity-100');
        } else {
            // Trigger smooth roll up
            wrapper.classList.remove('grid-rows-[1fr]');
            wrapper.classList.add('grid-rows-[0fr]');
            
            // Fade text out
            content.classList.remove('opacity-100');
            content.classList.add('opacity-0');
        }
    },

    generateAISummaryData: () => {
        const hour = new Date().getHours();
        let timeGreeting = 'Good evening';
        if (hour < 12) timeGreeting = 'Good morning';
        else if (hour < 18) timeGreeting = 'Good afternoon';

        const userNameElement = $('user-name-text');
        const userName = userNameElement && userNameElement.textContent !== 'User' ? userNameElement.textContent : '';

        if($('ai-greeting')) {
            $('ai-greeting').innerHTML = `${timeGreeting}${userName ? ', ' + userName : ''}!`;
        }

        const getDayStr = (dParam) => {
            const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        };
        const todayStr = getDayStr();

        const todayTasks = state.tasks.filter(x => x.dueDate === todayStr && x.status === 'todo');
        const pastTasks = state.tasks.filter(x => x.dueDate && x.dueDate < todayStr && x.status === 'todo');
        const highPriorityTasks = todayTasks.filter(t => t.priority === 'high');

        const totalEstMin = todayTasks.reduce((a, b) => a + ((parseInt(b.estimatedPomos) || 1) * (b.pomoDuration || 25)), 0);
        const estTimeStr = Math.floor(totalEstMin / 60) > 0
            ? `${Math.floor(totalEstMin / 60)}h ${totalEstMin % 60}m`
            : `${totalEstMin}m`;

        let workloadTone = "light and manageable";
        if (totalEstMin > 240) workloadTone = "quite demanding";
        else if (totalEstMin > 120) workloadTone = "steady and balanced";

        let summaryHtml = "";

        if (todayTasks.length === 0 && pastTasks.length === 0) {
            summaryHtml = `Your schedule is completely clear! It's the perfect moment to review your active workflows, organize your <strong>Inbox</strong>, or simply take a well-deserved breather.`;
        } else {
            summaryHtml += `You're looking at a <strong>${workloadTone}</strong> day with <strong class="text-white">${todayTasks.length} tasks</strong> requiring roughly <strong class="text-white">${estTimeStr}</strong> of deep focus. `;

            if (highPriorityTasks.length > 0) {
                summaryHtml += `I highly recommend tackling <span class="text-red-400 font-semibold cursor-pointer hover:underline" onclick="app.selectTask('${highPriorityTasks[0].id}')">"${esc(highPriorityTasks[0].title)}"</span> first to knock out your high-impact work early. `;
            } else if (todayTasks.length > 0) {
                summaryHtml += `Consider starting with <span class="text-brand font-semibold cursor-pointer hover:underline" onclick="app.selectTask('${todayTasks[0].id}')">"${esc(todayTasks[0].title)}"</span> to build some early momentum. `;
            }

            if (pastTasks.length > 0) {
                summaryHtml += `Also, keep an eye on the <strong>${pastTasks.length} leftover tasks</strong> lingering from the past. Let's clear them out today.`;
            }
        }

        if($('ai-overview')) $('ai-overview').innerHTML = summaryHtml;

        const renderList = (tasks, emptyMsg, highlightColorClass) => {
            return tasks.length > 0
                ? tasks.map(t => `
                    <li class="flex flex-col gap-1.5 bg-dark-bg/40 p-3 rounded-lg border border-dark-border hover:border-brand/40 transition-all cursor-pointer group" onclick="app.selectTask('${t.id}')">
                        <div class="flex items-start gap-2">
                            <i class="ph-bold ph-caret-right ${highlightColorClass} mt-0.5 shrink-0 group-hover:translate-x-1 transition-transform"></i>
                            <span class="truncate font-medium text-white/90 group-hover:text-white">${esc(t.title)}</span>
                        </div>
                        <div class="flex gap-3 ml-6 text-[11px] text-text-faint uppercase font-bold tracking-wider">
                            ${t.priority === 'high' ? '<span class="text-red-400 flex items-center"><i class="ph-bold ph-warning-circle mr-1"></i> High</span>' : ''}
                            <span class="flex items-center"><i class="ph-bold ph-clock mr-1"></i> ${(t.estimatedPomos || 1) * (t.pomoDuration || 25)}m</span>
                            <span class="flex items-center"><i class="ph-bold ph-folder mr-1"></i> ${esc(t.project || 'Inbox')}</span>
                        </div>
                    </li>
                `).join('')
                : `<li class="text-text-faint italic p-4 text-center border border-dark-border border-dashed rounded-lg bg-dark-bg/20">${emptyMsg}</li>`;
        };

        if($('ai-today-list')) $('ai-today-list').innerHTML = renderList(todayTasks, "Nothing scheduled for today.", "text-brand");
        if($('ai-past-list')) $('ai-past-list').innerHTML = renderList(pastTasks, "All caught up! No overdue tasks.", "text-red-400");
    },

    showBroadcastPopup: (b) => {
        if (document.getElementById('broadcast-' + b.id)) return;

        const overlay = document.createElement('div');
        overlay.id = 'broadcast-' + b.id;
        
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);opacity:0;transition:opacity 0.3s ease;";
        
        const themes = {
            info: { bg: '#1e1e1e', border: '#3b82f6', text: '#3b82f6', icon: 'ph-info' },
            warning: { bg: '#1e1e1e', border: '#f59e0b', text: '#f59e0b', icon: 'ph-warning' },
            alert: { bg: '#1e1e1e', border: '#ef4444', text: '#ef4444', icon: 'ph-warning-circle' },
            success: { bg: '#1e1e1e', border: '#10b981', text: '#10b981', icon: 'ph-check-circle' }
        };
        const theme = themes[b.type] || themes.info;

        const formatMsg = (b.message || '').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b style="color:#fff;">$1</b>');

        let ctaHtml = '';
        if (b.btnText && b.btnUrl) {
            ctaHtml = `<a href="${b.btnUrl}" target="_blank" style="display:block;text-align:center;width:100%;padding:10px;background:${theme.text};color:#fff;border-radius:6px;text-decoration:none;font-weight:600;margin-bottom:12px;font-family:'Inter',sans-serif;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">${b.btnText}</a>`;
        }

        overlay.innerHTML = `
            <div style="background:${theme.bg};border:1px solid ${theme.border};border-radius:12px;padding:24px;width:90%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.5);transform:translateY(20px);transition:transform 0.3s ease;position:relative;">
                <div style="display:flex;align-items:center;margin-bottom:16px;">
                    <i class="ph-fill ${theme.icon}" style="color:${theme.text};font-size:24px;margin-right:12px;"></i>
                    <h3 style="margin:0;color:#fff;font-size:18px;font-weight:600;font-family:'Inter',sans-serif;">System Message</h3>
                </div>
                <p style="color:#e5e7eb;font-size:14px;line-height:1.6;margin-bottom:24px;font-family:'Inter',sans-serif;">${formatMsg}</p>
                ${ctaHtml}
                <div style="display:flex;gap:12px;">
                    <button id="snooze-${b.id}" style="flex:1;padding:10px;background:transparent;color:${theme.text};border:1px solid ${theme.text}40;border-radius:6px;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;transition:all 0.2s;" onmouseover="this.style.background='${theme.text}15'" onmouseout="this.style.background='transparent'">Snooze</button>
                    <button id="dismiss-${b.id}" style="flex:1;padding:10px;background:${theme.text}20;color:${theme.text};border:1px solid transparent;border-radius:6px;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;transition:all 0.2s;" onmouseover="this.style.background='${theme.text}30'" onmouseout="this.style.background='${theme.text}20'">Acknowledge</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.querySelector('div').style.transform = 'translateY(0)';
        });

        document.getElementById(`dismiss-${b.id}`).onclick = async () => {
            const dismissed = JSON.parse(localStorage.getItem('dismissed_broadcasts') || '[]');
            dismissed.push(b.id);
            localStorage.setItem('dismissed_broadcasts', JSON.stringify(dismissed));
            
            if(state.user) {
                try {
                    await updateDoc(doc(db, 'artifacts', APP_ID, 'broadcasts', b.id), {
                        readBy: arrayUnion(state.user.uid)
                    });
                } catch(e){}
            }
            closeOverlay();
        };

        document.getElementById(`snooze-${b.id}`).onclick = () => {
            const snoozed = JSON.parse(localStorage.getItem('snoozed_broadcasts') || '{}');
            snoozed[b.id] = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
            localStorage.setItem('snoozed_broadcasts', JSON.stringify(snoozed));
            closeOverlay();
        };

        function closeOverlay() {
            overlay.style.opacity = '0';
            overlay.querySelector('div').style.transform = 'translateY(-20px)';
            setTimeout(() => overlay.remove(), 300);
        }
    },

    installApp: async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('btn-install-desktop').classList.add('hidden');
            }
            deferredPrompt = null;
        }
    },
    
    customPrompt: { resolve: null, el: $('custom-prompt-modal'), input: $('prompt-input'), title: $('prompt-title') },
    
    showPrompt: (t, v = '') => new Promise(r => {
        const p = app.customPrompt; p.resolve = r; p.title.textContent = t; p.input.value = v;
        p.el.classList.remove('hidden'); setTimeout(() => p.el.classList.remove('opacity-0'), 10); p.input.focus()
    }),
    
    closePrompt: v => {
        const p = app.customPrompt; p.el.classList.add('opacity-0');
        setTimeout(() => { p.el.classList.add('hidden'); if (p.resolve) p.resolve(v); p.resolve = null }, 200)
    },

    showConfirm: (title, message, confirmText = 'Yes', cancelText = 'Cancel') => new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        let okBtn = document.getElementById('confirm-ok-btn');
        let cancelBtn = document.getElementById('confirm-cancel-btn');

        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.children[0].classList.remove('scale-95');
            modal.children[0].classList.add('scale-100');
        }, 10);

        const close = (val) => {
            modal.classList.add('opacity-0');
            modal.children[0].classList.remove('scale-100');
            modal.children[0].classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                okBtn.replaceWith(okBtn.cloneNode(true));
                cancelBtn.replaceWith(cancelBtn.cloneNode(true));
                resolve(val);
            }, 200);
        };

        okBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
    }),

    setView: (v, pushHistory = true) => {
        const els = getEls();
        state.view = v; state.filterProject = null;
        saveLocalState();

        if (pushHistory) {
            const url = new URL(window.location);
            url.searchParams.set('view', v);
            window.history.pushState({ view: v }, '', url);
        }

        els.pageTitle.textContent = (v === 'all' ? 'All Tasks' : v.charAt(0).toUpperCase() + v.slice(1));
        updateNavStyles(v); app.toggleSidebar(false);
        if (v === 'analytics') {
            els.taskViewContainer.classList.add('hidden'); els.analyticsViewContainer.classList.remove('hidden'); els.headerActions.classList.add('invisible'); updateAnalytics()
        } else {
            els.taskViewContainer.classList.remove('hidden'); els.analyticsViewContainer.classList.add('hidden'); els.headerActions.classList.remove('invisible'); renderTasks(); updateCounts()
        }
    },
    setProjectView: p => {
        const els = getEls();
        state.view = 'project'; state.filterProject = p;
        els.pageTitle.textContent = p;
        updateNavStyles('project', p); app.toggleSidebar(false);
        els.taskViewContainer.classList.remove('hidden'); els.analyticsViewContainer.classList.add('hidden'); els.headerActions.classList.remove('invisible'); renderTasks(); updateCounts()
    },
    setRange: r => {
        state.analytics.range = r; haptic('light');
        ['week', 'month', 'year'].forEach(k => { $(`btn-range-${k}`).className = k === r ? "px-4 py-1.5 rounded text-xs font-medium bg-brand text-white shadow-sm transition-all" : "px-4 py-1.5 rounded text-xs font-medium text-text-muted hover:text-white transition-all" });
        updateAnalytics()
    },
    toggleChartType: (k, t) => { haptic('light'); state.chartTypes[k] = t; ['bar', 'line'].forEach(x => { $(`btn-${k}-${x}`).classList.toggle('active', x === t) }); updateAnalytics() },
    toggleFocusPanel: f => {
        const els = getEls();
        const p = els.timerPanel, i = !p.classList.contains('translate-x-full');
        (f !== null ? f : !i) ? p.classList.remove('translate-x-full') : p.classList.add('translate-x-full')
    },
    toggleSidebar: f => {
        const els = getEls();
        const s = els.sidebar, o = els.sidebarOverlay, h = s.classList.contains('-translate-x-full'), show = (typeof f === 'boolean') ? f : h;
        if (show) { s.classList.remove('-translate-x-full'); o.classList.remove('hidden'); requestAnimationFrame(() => o.classList.remove('opacity-0')) }
        else { s.classList.add('-translate-x-full'); o.classList.add('opacity-0'); setTimeout(() => o.classList.add('hidden'), 300) }
    },
    promptNewProject: async () => { const n = await app.showPrompt("Enter project name:"); if (n) { state.projects.add(n); updateProjectsUI() } },
    renameProject: async (o, e) => {
        e.stopPropagation(); const n = await app.showPrompt(`Rename "${o}" to:`, o); if (!n || n === o) return;
        const b = writeBatch(db); (await getDocs(query(collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks'), where("project", "==", o)))).forEach(d => b.update(d.ref, { project: n }));
        await b.commit(); state.projects.delete(o); state.projects.add(n);
        state.filterProject === o ? app.setProjectView(n) : updateProjectsUI()
    },
    deleteProject: async (p, e) => {
        e.stopPropagation(); if (!confirm(`Delete "${p}"?`)) return; haptic('heavy');
        const b = writeBatch(db); (await getDocs(query(collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks'), where("project", "==", p)))).forEach(d => b.update(d.ref, { project: 'Inbox' }));
        await b.commit(); state.projects.delete(p);
        state.filterProject === p ? app.setView('today') : updateProjectsUI()
    },

    addSubtaskUI: (v = '') => {
        const els = getEls();
        const d = D.createElement('div'); d.className = 'flex items-center space-x-2 animate-fade-in';
        d.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-brand shrink-0"></div><input type="text" class="subtask-input flex-1 bg-transparent border-b border-dark-border focus:border-brand text-sm text-white py-1 outline-none transition-colors" placeholder="Subtask..." value="${esc(v)}"><button type="button" onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-400"><i class="ph-bold ph-x"></i></button>`;
        els.subtasksContainer.appendChild(d)
    },
    toggleDropdown: t => {
        haptic('light');
        const d = $(`${t}-options`);
        D.querySelectorAll('[id$="-options"]').forEach(x => { if (x.id !== `${t}-options`) x.classList.add('hidden') });
        d.classList.toggle('hidden'); if (!d.classList.contains('hidden')) d.classList.add('animate-fade-in')
    },
    selectOption: (t, v, d) => { haptic('light'); $(`selected-${t}`).innerText = d; $(`task-${t}`).value = v; $(`${t}-options`).classList.add('hidden') },

    toggleAddTaskModal: (t = null) => {
        const els = getEls();
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); } catch (e) { }

        if (els.modal.classList.contains('hidden')) {
            haptic('light');
            els.subtasksContainer.innerHTML = ''; const po = $('project-options'); po.innerHTML = '';
            state.projects.forEach(p => {
                const b = D.createElement('button'); b.type = 'button'; b.onclick = () => app.selectOption('project', p, p);
                b.className = "w-full text-left px-3 py-2 text-sm text-text-muted hover:bg-dark-hover hover:text-white transition-colors flex items-center";
                b.innerHTML = `<i class="ph-bold ph-folder mr-2"></i> ${esc(p)}`; po.appendChild(b)
            });
            if (t) {
                state.editingTaskId = t.id; els.modalTitle.innerText = "Edit Task"; els.saveTaskBtn.innerText = "Save Changes";
                $('task-title').value = t.title; $('task-note').value = t.note || ''; $('task-tags').value = t.tags ? t.tags.join(', ') : '';
                state.newEst = t.estimatedPomos || 1; els.estDisplay.innerText = state.newEst; els.taskPomoDisplay.innerText = t.pomoDuration || 25;
                els.dateInput.value = t.dueDate || ''; app.selectOption('priority', t.priority || 'none', { high: 'High Priority (! Urgent)', med: 'Medium Priority', low: 'Low Priority', none: 'None' }[t.priority || 'none']);
                app.selectOption('project', t.project || 'Inbox', t.project || 'Inbox'); app.selectOption('repeat', t.repeat || 'none', t.repeat ? t.repeat.charAt(0).toUpperCase() + t.repeat.slice(1) : 'None');
                els.taskReminder.value = t.reminder || ''; if (t.subtasks) t.subtasks.forEach(s => app.addSubtaskUI(s))
            } else {
                state.editingTaskId = null; els.modalTitle.innerText = "New Task"; els.saveTaskBtn.innerText = "Save Task";
                state.newEst = 1; els.estDisplay.innerText = "1"; els.taskPomoDisplay.innerText = 25; els.dateInput.value = new Date().toISOString().split('T')[0];
                $('task-title').value = ''; $('task-note').value = ''; $('task-tags').value = ''; app.selectOption('priority', 'none', 'None');
                app.selectOption('project', 'Inbox', 'Inbox'); app.selectOption('repeat', 'none', 'None'); els.taskReminder.value = ''
            }
            app.updateTotalEst();
            els.modal.classList.remove('hidden');
            setTimeout(() => els.modal.classList.remove('opacity-0'), 10);
            setTimeout(() => {
                els.modalPanel.classList.remove('translate-y-full', 'md:scale-95');
                els.modalPanel.classList.add('translate-y-0', 'md:scale-100');
            }, 10);
            $('task-title').focus()
        } else {
            haptic('light');
            els.modal.classList.add('opacity-0');
            els.modalPanel.classList.add('translate-y-full', 'md:scale-95');
            els.modalPanel.classList.remove('translate-y-0', 'md:scale-100');
            setTimeout(() => els.modal.classList.add('hidden'), 300)
        }
    },

    adjustEst: d => { let v = state.newEst + d; if (v < 1) v = 1; if (v > 50) v = 50; state.newEst = v; $('est-display').innerText = v; app.updateTotalEst() },
    adjustPomoDuration: d => { let c = parseInt($('task-pomo-display').innerText), v = c + d; if (v < 5) v = 5; if (v > 60) v = 60; $('task-pomo-display').innerText = v; app.updateTotalEst() },
    updateTotalEst: () => { const d = parseInt($('task-pomo-display').innerText), n = state.newEst, t = d * n, h = Math.floor(t / 60), m = t % 60; $('total-time-calc').innerText = h > 0 ? `${h}h ${m}m` : `${m}m` },

    editTask: (id, e) => { e.stopPropagation(); const t = state.tasks.find(x => x.id === id); if (t) app.toggleAddTaskModal(t) },
    handleSaveTask: async e => {
        e.preventDefault();
        const els = getEls();
        const title = $('task-title').value; if (!title) return;
        const subtasks = Array.from(D.querySelectorAll('.subtask-input')).map(i => i.value.trim()).filter(v => v);
        const tags = $('task-tags').value.split(',').map(t => t.trim()).filter(t => t);
        const data = {
            title, dueDate: els.dateInput.value, estimatedPomos: state.newEst, pomoDuration: parseInt(els.taskPomoDisplay.innerText),
            priority: $('task-priority').value, project: $('task-project').value, note: $('task-note').value,
            repeat: els.taskRepeat.value, reminder: els.taskReminder.value, subtasks, tags
        };
        const ref = collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks');
        try {
            state.editingTaskId ? await updateDoc(doc(ref, state.editingTaskId), data) : await addDoc(ref, { ...data, completedSessionIds: [], status: 'todo', createdAt: new Date().toISOString() });
            haptic('success');
            app.toggleAddTaskModal()
        } catch (err) { app.showToast("Error saving") }
    },
    toggleTaskStatus: async (id, s) => {
        try {
            haptic('light');
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', id), { status: s === 'todo' ? 'done' : 'todo', completedAt: s === 'todo' ? new Date().toISOString() : null })
        } catch (e) { app.showToast("Connection error") }
    },
    deleteTask: async (id, e) => { e.stopPropagation(); if (confirm('Delete task?')) try { haptic('heavy'); await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', id)) } catch (e) { app.showToast("Error deleting") } },

    startTask: async (id, e) => {
        e.stopPropagation(); const t = state.tasks.find(x => x.id === id); if (!t) return;
        haptic('medium');
        state.selectedTaskId = id; renderTasks(); updateTimerUI(t);
        if (window.innerWidth < 1280) app.toggleFocusPanel(true);
        if (state.timer.status !== 'running') {
            const d = t.pomoDuration || 25;
            const sessionId = `${id}_${Date.now()}`;
            const endTimeMs = Date.now() + d * 60000;

            try {
                setBackgroundAlarm(endTimeMs, 'focus');
                await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
                    status: 'running',
                    mode: 'focus',
                    taskId: id,
                    sessionId: sessionId,
                    remaining: d * 60,
                    totalDuration: d * 60,
                    endTime: new Date(endTimeMs),
                    initiatorId: INSTANCE_ID
                });
                app.updateSettings('focus', d)
            } catch (e) { app.showToast("Failed to start") }
        }
    },
    selectTask: id => {
        state.selectedTaskId = id; renderTasks(); const t = state.tasks.find(x => x.id === id); updateTimerUI(t);
        if (state.timer.status !== 'running') updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), { taskId: id }).catch(() => { });
        if (window.innerWidth < 1280) app.toggleFocusPanel(true)
    },

    showToast: (m, t = 'error') => {
        const c = $('toast-container'), e = D.createElement('div');
        e.className = `px-4 py-2 rounded shadow text-white text-sm font-medium animate-fade-in ${t === 'error' ? 'bg-red-500' : 'bg-green-600'}`;
        e.innerText = m; c.appendChild(e);
        setTimeout(() => { e.style.opacity = '0'; setTimeout(() => e.remove(), 300) }, 3000)
    },

    toggleTimer: async () => {
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { }); } catch (e) { }
        haptic('medium');
        if (state.timer.status === 'running') {
            if (state.timer.settings.strictMode && state.timer.mode === 'focus' && !confirm("Strict Mode active! Quit?")) return;
            
            clearBackgroundAlarm();
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), { status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000)) }).catch(() => { })
        } else {
            if (!state.timer.activeTaskId && state.timer.mode === 'focus') { app.showToast("Select task!", "error"); return }
            
            const endTimeMs = Date.now() + state.timer.remaining * 1000;
            setBackgroundAlarm(endTimeMs, state.timer.mode);
            
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), { status: 'running', endTime: new Date(endTimeMs), initiatorId: INSTANCE_ID }).catch(() => { })
        }
    },

    resetTimer: async (r = false) => {
        if (!r) {
            haptic('light');
            const d = state.timer.settings[state.timer.mode];
            await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), { status: 'idle', endTime: null, remaining: d * 60, totalDuration: d * 60, mode: state.timer.mode, taskId: state.timer.activeTaskId || null }).catch(() => { })
        }
    },
    skipTimer: () => app.completeTimer(true),

    completeTimer: async (isManual = false) => {
        if (state.timer.status === 'idle') return;

        if (!isManual && state.timer.initiatorId && state.timer.initiatorId !== INSTANCE_ID) {
            stopLocalInterval();
            return;
        }

        stopLocalInterval();
        clearBackgroundAlarm();
        haptic('timerDone');

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if(AudioContext) {
                const c = new AudioContext(), o = c.createOscillator();
                o.connect(c.destination); o.frequency.value = 523.25; o.start(); o.stop(c.currentTime + .2);
            }
        } catch(e) {}

        try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Timer Complete", { icon: 'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png' }); } catch (e) { }

        if (state.timer.mode === 'focus') {
            if (state.timer.activeTaskId) {
                const t = state.tasks.find(x => x.id === state.timer.activeTaskId);
                if (t) {
                    try {
                        const sessionId = state.timer.sessionId || `${t.id}_${Date.now()}`;
                        
                        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', t.id), {
                            completedSessionIds: arrayUnion(sessionId)
                        });

                        const d = new Date();
                        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        const monthlyRef = doc(db, 'artifacts', APP_ID, 'users', getUid(), 'monthly_logs', monthStr);

                        await setDoc(monthlyRef, {
                            month: monthStr,
                            sessions: arrayUnion({
                                id: sessionId,
                                taskId: t.id,
                                taskTitle: t.title,
                                project: t.project || 'Inbox',
                                duration: state.timer.totalDuration / 60,
                                completedAt: Date.now() 
                            })
                        }, { merge: true });

                        const newCompletedCount = (t.completedSessionIds ? t.completedSessionIds.length : 0) + 1;
                        const estimated = t.estimatedPomos || 1;

                        if (newCompletedCount >= estimated && t.status !== 'done') {
                            setTimeout(async () => {
                                const isDone = await app.showConfirm(
                                    "Goal Reached! 🎉", 
                                    `You've completed ${newCompletedCount}/${estimated} pomodoros for "${t.title}". Mark it as done?`,
                                    "Mark Done",
                                    "Keep Working"
                                );
                                
                                if (isDone) {
                                    app.toggleTaskStatus(t.id, 'todo'); 
                                    app.showToast("Task marked as done!", "success");
                                }
                            }, 800); 
                        }

                    } catch (e) { 
                        console.error("Failed to save session:", e); 
                    }
                }
            }

            if (state.timer.settings.disableBreak) {
                await app.setTimerMode('focus'); if (state.timer.settings.autoStartPomo) app.toggleTimer();
            } else {
                const newCount = (state.timer.pomoCountCurrentSession || 0) + 1; let nextMode = 'short';
                if (newCount >= state.timer.settings.longBreakInterval) nextMode = 'long';
                await app.setTimerMode(nextMode, nextMode === 'long' ? 0 : newCount); if (state.timer.settings.autoStartBreak) app.toggleTimer();
            }
        } else {
            await app.setTimerMode('focus', state.timer.pomoCountCurrentSession); if (state.timer.settings.autoStartPomo) app.toggleTimer();
        }
    },
    setTimerMode: async (m, sessionCount = null) => {
        const v = state.timer.settings[m]; const updates = { status: 'idle', mode: m, remaining: v * 60, totalDuration: v * 60, endTime: null, taskId: state.timer.activeTaskId || null, sessionId: null };
        if (sessionCount !== null) updates.sessionCount = sessionCount;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), updates).catch(() => { });
    },
    setTimerModeUI: m => {
        const els = getEls();
        if(els.timerMode) {
            els.timerMode.innerText = m === 'focus' ? 'FOCUS' : m === 'short' ? 'SHORT BREAK' : 'LONG BREAK';
            els.timerMode.className = `text-xs font-bold tracking-widest uppercase mt-4 ${m === 'focus' ? 'text-brand' : 'text-blue-400'}`
        }
    },
    setSound: t => {
        const els = getEls();
        state.sound = t;
        saveLocalState();
        if(els.audio) els.audio.src = sounds[t];
        D.querySelectorAll('.sound-option').forEach(b => b.className = b.className.replace('text-brand', 'text-text-muted'));
        const a = $(`sound-${t}`); if (a) a.className = a.className.replace('text-text-muted', 'text-brand');
        D.querySelectorAll('[id^="check-sound-"]').forEach(i => i.classList.add('hidden'));
        const check = $(`check-sound-${t}`); if (check) check.classList.remove('hidden');
        if(els.audio) t === 'none' ? els.audio.pause() : (state.timer.status === 'running' && els.audio.play().catch(() => { }));
    },
    toggleGlobalSettings: () => {
        const els = getEls();
        if (els.settingsModal.classList.contains('hidden')) {
            haptic('light');
            els.settingsModal.classList.remove('hidden'); setTimeout(() => els.settingsModal.classList.remove('opacity-0'), 10);
            setTimeout(() => {
                els.settingsPanel.classList.remove('translate-y-full', 'md:scale-95');
                els.settingsPanel.classList.add('translate-y-0', 'md:scale-100');
            }, 10);

            app.switchSettingsTab('timer');
            $('strict-mode-toggle').checked = state.timer.settings.strictMode;
            $('auto-pomo-toggle').checked = state.timer.settings.autoStartPomo;
            $('auto-break-toggle').checked = state.timer.settings.autoStartBreak;
            $('disable-break-toggle').checked = state.timer.settings.disableBreak;
            $('set-longBreakInterval-val-g').innerText = state.timer.settings.longBreakInterval;
            app.setSound(state.sound);
        } else {
            haptic('light');
            els.settingsModal.classList.add('opacity-0');
            els.settingsPanel.classList.add('translate-y-full', 'md:scale-95');
            els.settingsPanel.classList.remove('translate-y-0', 'md:scale-100');
            setTimeout(() => els.settingsModal.classList.add('hidden'), 300);
        }
    },
    switchSettingsTab: t => {
        const els = getEls();
        D.querySelectorAll('.settings-tab-btn').forEach(b => {
            const active = b.id === `tab-btn-${t}`; b.className = active ? 'settings-tab-btn flex-shrink-0 w-auto md:w-full flex items-center px-4 md:px-3 py-2 text-sm font-medium rounded whitespace-nowrap text-brand bg-brand/10 hover:bg-brand/20 transition-colors' : 'settings-tab-btn flex-shrink-0 w-auto md:w-full flex items-center px-4 md:px-3 py-2 text-sm font-medium rounded whitespace-nowrap text-text-muted hover:text-white hover:bg-dark-hover transition-colors';
        }); D.querySelectorAll('.settings-content').forEach(c => c.classList.add('hidden')); $(`settings-tab-${t}`).classList.remove('hidden'); els.settingsTitle.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    },
    updateSettings: (k, v) => {
        if (['strictMode', 'autoStartPomo', 'autoStartBreak', 'disableBreak'].includes(k)) {
            state.timer.settings[k] = v;
        } else {
            state.timer.settings[k] = parseInt(v);
            const d = $(`set-${k}-val`); if (d) d.innerText = v;
            const dg = $(`set-${k}-val-g`); if (dg) dg.innerText = v;
        }

        saveLocalState();
        _saveSetting(k, v);
    },
    signOut: () => signOut(auth).then(() => window.location.href = 'https://stack-base.github.io/account/login?redirectUrl=' + encodeURIComponent(window.location.href))
};

window.app = app;

function createGradient(ctx, color) { const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, color + '90'); g.addColorStop(1, color + '05'); return g }

function updateAnalytics() {
    const els = getEls();
    if (state.view !== 'analytics') return;
    if (!els.analytics.timeTotal) return; 

    const getDayStr = (dParam) => {
        const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const now = getISTNow();
    const todayStr = getDayStr(now);
    const startOfWeek = new Date(now); 
    const day = startOfWeek.getDay() || 7; 
    if (day !== 1) startOfWeek.setDate(now.getDate() - (day - 1)); 
    startOfWeek.setHours(0, 0, 0, 0);

    const logsToday = state.logs.filter(l => { const d = parseDate(l.completedAt); return d && getDayStr(d) === todayStr });
    const logsWeek = state.logs.filter(l => { const d = parseDate(l.completedAt); return d && d >= startOfWeek });
    const tasksDone = state.tasks.filter(t => t.status === 'done');
    const tasksToday = tasksDone.filter(t => { const d = parseDate(t.completedAt); return d && getDayStr(d) === todayStr });
    const tasksWeek = tasksDone.filter(t => { const d = parseDate(t.completedAt); return d && d >= startOfWeek });
    
    const fmtTime = m => { const h = Math.floor(m / 60), rem = Math.round(m % 60); return h > 0 ? `${h}h ${rem}m` : `${rem}m` };

    els.analytics.timeTotal.textContent = fmtTime(state.logs.reduce((a, b) => a + (b.duration || 25), 0));
    els.analytics.timeWeek.textContent = fmtTime(logsWeek.reduce((a, b) => a + (b.duration || 25), 0));
    els.analytics.timeToday.textContent = fmtTime(logsToday.reduce((a, b) => a + (b.duration || 25), 0));
    els.analytics.taskTotal.textContent = tasksDone.length;
    els.analytics.taskWeek.textContent = tasksWeek.length;
    els.analytics.taskToday.textContent = tasksToday.length;

    const activeTasks = state.tasks.filter(t => t.status === 'todo').length + tasksDone.length;
    els.analytics.completionRate.textContent = activeTasks > 0 ? Math.round((tasksDone.length / activeTasks) * 100) + '%' : '0%';
    els.analytics.avgSession.textContent = (state.logs.length > 0 ? Math.round(state.logs.reduce((a, b) => a + (b.duration || 25), 0) / state.logs.length) : 0) + 'm';

    let morning = 0, night = 0;
    state.logs.forEach(l => { 
        const d = parseDate(l.completedAt);
        if (d) { 
            const h = d.getHours(); 
            if (h < 12) morning += (l.duration || 25); 
            if (h >= 20) night += (l.duration || 25);
        } 
    });
    els.analytics.earlyBird.textContent = fmtTime(morning);
    els.analytics.nightOwl.textContent = fmtTime(night);
    els.analytics.projectCount.textContent = state.projects.size;

    let cs = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(); d.setDate(now.getDate() - i);
        if (state.logs.some(l => { const ld = parseDate(l.completedAt); return ld && getDayStr(ld) === getDayStr(d) })) cs++;
        else if (i > 0) break;
    }
    els.analytics.streakDays.textContent = cs + ' Days';

    const grid = els.analytics.timelineGrid; 
    if(grid) {
        grid.innerHTML = ''; 
        const tooltip = $('global-tooltip');
        const showTooltip = (e, txt, sub) => { 
            tooltip.innerHTML = `<strong>${esc(txt)}</strong><span class="sub">${esc(sub)}</span>`; 
            tooltip.style.opacity = '1'; 
            tooltip.style.left = e.pageX + 'px'; 
            tooltip.style.top = e.pageY + 'px';
        };
        const hideTooltip = () => { tooltip.style.opacity = '0'; };

        for (let i = 0; i < 14; i++) { 
            const d = new Date(); 
            d.setDate(now.getDate() - i); 
            const dStr = getDayStr(d);
            const dayLogs = state.logs.filter(l => {
                const ld = parseDate(l.completedAt);
                return ld && getDayStr(ld) === dStr;
            });

            const row = D.createElement('div'); 
            row.className = "flex items-center h-8 hover:bg-dark-hover rounded transition-colors"; 
            
            const lbl = D.createElement('div'); 
            lbl.className = "w-24 text-[10px] text-text-muted font-bold uppercase tracking-wider pl-2 flex-shrink-0"; 
            lbl.textContent = i === 0 ? "Today" : (i === 1 ? "Yesterday" : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })); 
            
            const bars = D.createElement('div'); 
            bars.className = "flex-1 h-full relative bg-dark-bg rounded mx-2 overflow-hidden border border-dark-border"; 
            
            for (let j = 1; j < 6; j++) { 
                const l = D.createElement('div'); 
                l.className = "absolute top-0 bottom-0 border-l border-dark-border opacity-30"; 
                l.style.left = `${(j * 4 / 24) * 100}%`; 
                bars.appendChild(l);
            } 
            
            dayLogs.forEach(l => { 
                const ld = parseDate(l.completedAt);
                const sm = (ld.getHours() * 60) + ld.getMinutes(); 
                const dur = l.duration || 25; 
                const lp = ((sm - dur) / 1440) * 100; 
                const wp = (dur / 1440) * 100; 
                
                const b = D.createElement('div'); 
                b.className = "absolute top-1.5 bottom-1.5 rounded-sm bg-brand opacity-80 z-10 hover:bg-white transition-colors cursor-pointer"; 
                b.style.left = `${lp}%`; 
                b.style.width = `${Math.max(wp, 0.5)}%`; 
                
                b.addEventListener('mousemove', (e) => showTooltip(e, l.taskTitle || 'Focus Session', `${ld.getHours()}:${ld.getMinutes().toString().padStart(2, '0')} - ${dur} mins`)); 
                b.addEventListener('mouseleave', hideTooltip); 
                bars.appendChild(b);
            }); 
            
            row.appendChild(lbl); 
            row.appendChild(bars); 
            grid.appendChild(row);
        }
    }

    if (typeof Chart === 'undefined') return;
    
    const hours = Array(24).fill(0);
    state.logs.forEach(l => { const d = parseDate(l.completedAt); if (d) hours[d.getHours()] += (l.duration || 25) });

    const weekdays = Array(7).fill(0);
    state.logs.forEach(l => { const d = parseDate(l.completedAt); if (d) { const wd = d.getDay(); weekdays[wd == 0 ? 6 : wd - 1] += (l.duration || 25) } });

    const maxHour = hours.indexOf(Math.max(...hours));
    const maxDayIdx = weekdays.indexOf(Math.max(...weekdays));
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (state.logs.length > 5) els.analytics.insightText.textContent = `You are most productive around ${maxHour}:00 and your best day is ${days[maxDayIdx]}. Keep it up!`;

    const r = state.analytics.range;
    let lbl = [], dpFocus = [], dpTask = [], dlb = r === 'week' ? 7 : (r === 'month' ? 30 : 12);

    if (r === 'year') {
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            lbl.push(d.toLocaleString('default', { month: 'short' }));
            const mLogs = state.logs.filter(l => {
                const ld = parseDate(l.completedAt);
                if (!ld) return false;
                return ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear();
            });
            dpFocus.push(parseFloat((mLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)));
            const mTasks = state.tasks.filter(t => {
                if (t.status !== 'done') return false;
                const td = parseDate(t.completedAt);
                if (!td) return false;
                return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
            });
            dpTask.push(mTasks.length);
        }
    } else {
        for (let i = dlb - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(now.getDate() - i);
            const dStr = getDayStr(d);
            lbl.push(d.toLocaleDateString('en-US', { weekday: 'short', day: r === 'month' ? 'numeric' : undefined }));
            const dLogs = state.logs.filter(l => { const ld = parseDate(l.completedAt); return ld && getDayStr(ld) === dStr });
            dpFocus.push(parseFloat((dLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)));
            const dTasks = state.tasks.filter(t => {
                if (t.status !== 'done') return false;
                const td = parseDate(t.completedAt);
                return td && getDayStr(td) === dStr;
            });
            dpTask.push(dTasks.length);
        }
    }

    const cOpts = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.03)', borderDash: [4, 4] },
                ticks: { color: '#a3a3a3', font: { family: 'Inter', size: 11 } }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#a3a3a3', font: { family: 'Inter', size: 11 } }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                titleFont: { family: 'Inter', size: 13 },
                bodyFont: { family: 'Inter', size: 12 },
                padding: 12,
                callbacks: {
                    title: (context) => `Timeframe: ${context[0].label}`,
                    label: (context) => {
                        const value = context.raw;
                        const label = context.dataset.label;
                        if (label.includes('Tasks')) return `${value} tasks completed`;
                        if (label.includes('Hours')) return `${value} hours of deep focus`;
                        return `${value} minutes focused`;
                    }
                }
            }
        },
        elements: { bar: { borderRadius: 4, hoverBackgroundColor: '#ffffff' }, line: { tension: 0.4 } },
        interaction: { mode: 'index', intersect: false }
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                titleFont: { family: 'Inter', size: 13 },
                bodyFont: { family: 'Inter', size: 12 },
                padding: 12,
                callbacks: {
                    label: (context) => {
                        const dataset = context.dataset;
                        const total = dataset.data.reduce((acc, current) => acc + current, 0);
                        const value = context.raw;
                        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                        const isTime = context.chart.canvas.id === 'projectChart';
                        const metric = isTime ? 'm' : ' tasks';
                        return ` ${context.label}: ${Math.round(value)}${metric} (${percentage}%)`;
                    }
                }
            }
        }
    };

    const gC = (ctx, t, l, d, c, tl) => {
        const i = t === 'line';
        return {
            type: t,
            data: {
                labels: l,
                datasets: [{
                    label: tl,
                    data: d,
                    backgroundColor: i ? createGradient(ctx, c) : c,
                    borderColor: c,
                    borderRadius: 4,
                    fill: i,
                    borderWidth: i ? 2 : 0,
                    pointRadius: i ? 0 : 0,
                    pointHoverRadius: 6
                }]
            },
            options: cOpts
        }
    };

    if(els.analytics.focusBarChart) {
        if (state.charts.focusBar) state.charts.focusBar.destroy();
        const ctxF = els.analytics.focusBarChart.getContext('2d');
        state.charts.focusBar = new Chart(ctxF, gC(ctxF, state.chartTypes.focus, lbl, dpFocus, '#ff5757', 'Focus Hours'));
    }

    if(els.analytics.taskBarChart) {
        if (state.charts.taskBar) state.charts.taskBar.destroy();
        const ctxT = els.analytics.taskBarChart.getContext('2d');
        state.charts.taskBar = new Chart(ctxT, gC(ctxT, state.chartTypes.task, lbl, dpTask, '#3b82f6', 'Tasks Done'));
    }

    const todayHours = Array(24).fill(0);
    logsToday.forEach(l => { 
        const d = parseDate(l.completedAt); 
        if (d) todayHours[d.getHours()] += (l.duration || 25); 
    });

    if(els.analytics.todayTimelineChart) {
        if (state.charts.todayTimeline) state.charts.todayTimeline.destroy();
        const ctxToday = els.analytics.todayTimelineChart.getContext('2d');
        state.charts.todayTimeline = new Chart(ctxToday, gC(ctxToday, 'line', Array.from({ length: 24 }, (_, i) => i + 'h'), todayHours, '#8b5cf6', 'Minutes'));
    }

    if(els.analytics.hourlyChart) {
        if (state.charts.hourly) state.charts.hourly.destroy();
        const ctxH = els.analytics.hourlyChart.getContext('2d');
        state.charts.hourly = new Chart(ctxH, gC(ctxH, state.chartTypes.hourly, Array.from({ length: 24 }, (_, i) => i), hours, '#10b981', 'Minutes'));
    }

    if(els.analytics.weekdayChart) {
        if (state.charts.weekday) state.charts.weekday.destroy();
        const ctxW = els.analytics.weekdayChart.getContext('2d');
        state.charts.weekday = new Chart(ctxW, gC(ctxW, state.chartTypes.weekday, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], weekdays, '#f59e0b', 'Minutes'));
    }

    const pm = {}; state.logs.forEach(l => { const p = l.project || 'Inbox'; pm[p] = (pm[p] || 0) + (l.duration || 25) });
    const sp = Object.entries(pm).sort((a, b) => b[1] - a[1]);
    
    if(els.analytics.projectChart) {
        if (state.charts.project) state.charts.project.destroy();
        state.charts.project = new Chart(els.analytics.projectChart.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: sp.map(x => x[0]),
                datasets: [{
                    data: sp.map(x => x[1]),
                    backgroundColor: ['#ff5757', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'],
                    borderColor: '#000000',
                    borderWidth: 4,
                    hoverOffset: 4
                }]
            },
            options: doughnutOptions
        });
        if(els.analytics.projList) els.analytics.projList.innerHTML = sp.map(x => `<div class="flex justify-between text-xs text-text-muted"><span>${esc(x[0])}</span><span>${Math.round(x[1])}m</span></div>`).join('');
    }
    
    const pri = { high: 0, med: 0, low: 0, none: 0 };
    tasksDone.forEach(t => pri[t.priority || 'none']++);
    if(els.analytics.priorityChart) {
        if (state.charts.priority) state.charts.priority.destroy();
        state.charts.priority = new Chart(els.analytics.priorityChart.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['High', 'Med', 'Low', 'None'],
                datasets: [{
                    data: [pri.high, pri.med, pri.low, pri.none],
                    backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#525252'],
                    borderColor: '#000000',
                    borderWidth: 4,
                    hoverOffset: 4
                }]
            },
            options: doughnutOptions
        });

        const priList = document.getElementById('priority-rank-list');
        if(priList) {
            const priData = [
                { label: 'High', count: pri.high, color: '#ef4444' },
                { label: 'Medium', count: pri.med, color: '#eab308' },
                { label: 'Low', count: pri.low, color: '#3b82f6' },
                { label: 'None', count: pri.none, color: '#525252' }
            ];
            
            priList.innerHTML = priData.map(p => `
                <div class="priority-row">
                    <div class="priority-label-group">
                        <div class="priority-dot" style="background-color: ${p.color};"></div>
                        <span class="priority-name">${p.label}</span>
                    </div>
                    <span class="priority-count">${p.count} tasks</span>
                </div>
            `).join('');
        }
    }

    const tc = {}; tasksDone.forEach(t => { if (t.tags) t.tags.forEach(g => tc[g] = (tc[g] || 0) + 1) });
    const st = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    if(els.analytics.tagList) {
        if (st.length > 0) {
            els.analytics.tagList.innerHTML = st.map((x, i) => `<div class="flex items-center justify-between text-xs"><div class="flex items-center"><span class="w-4 text-text-faint mr-2">${i + 1}.</span><span class="text-white bg-dark-hover px-1.5 py-0.5 rounded">${esc(x[0])}</span></div><span class="text-text-muted">${x[1]} tasks</span></div>`).join('');
        } else {
            els.analytics.tagList.innerHTML = '<p class="text-xs text-text-muted italic">No tags data available.</p>';
        }
    }

    if(els.analytics.sessionLogBody) els.analytics.sessionLogBody.innerHTML = state.logs.slice(0, 20).map(l => { const d = parseDate(l.completedAt) || new Date(); return `<tr><td class="text-text-muted">${d.toLocaleDateString()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}</td><td class="font-medium text-white">${esc(l.taskTitle)}</td><td><span class="px-2 py-0.5 rounded-full text-[10px] bg-dark-hover border border-dark-border text-text-muted">${esc(l.project)}</span></td><td class="text-brand font-mono">${l.duration || 25}m</td></tr>` }).join('');
}

$('prompt-cancel-btn').addEventListener('click', () => app.closePrompt(null)); $('prompt-confirm-btn').addEventListener('click', () => app.closePrompt(app.customPrompt.input.value)); $('prompt-input').addEventListener('keypress', e => { if (e.key === 'Enter') app.closePrompt(app.customPrompt.input.value) }); D.addEventListener('click', e => { if (!e.target.closest('#project-dropdown') && !e.target.closest('#priority-dropdown') && !e.target.closest('#repeat-dropdown')) { D.getElementById('project-options').classList.add('hidden'); D.getElementById('priority-options').classList.add('hidden'); D.getElementById('repeat-options').classList.add('hidden') } });
function updateNavStyles(v, p) { D.querySelectorAll('.nav-btn').forEach(b => { const i = b.id === `nav-${v}`; b.classList.toggle('bg-brand', i); b.classList.toggle('bg-opacity-10', i); b.classList.toggle('text-brand', i); b.classList.toggle('text-text-muted', !i); if (i) b.classList.remove('hover:text-white'); else b.classList.add('hover:text-white') }); D.querySelectorAll('.project-btn').forEach(b => { const i = v === 'project' && b.dataset.proj === p; b.classList.toggle('text-brand', i); b.classList.toggle('bg-brand', i); b.classList.toggle('bg-opacity-10', i); b.classList.toggle('text-text-muted', !i) }) }
function updateProjectsUI() { const els = getEls(); els.projectList.innerHTML = ''; state.projects.forEach(p => { const d = D.createElement('div'); d.innerHTML = `<div class="group relative flex items-center"><button onclick="app.setProjectView('${esc(p)}')" data-proj="${esc(p)}" class="project-btn w-full flex items-center justify-between px-3 py-2 rounded text-text-muted hover:bg-dark-hover hover:text-white transition-colors text-sm group shrink-0"><div class="flex items-center min-w-0"><i class="ph-bold ph-hash mr-3 opacity-50 shrink-0"></i><span class="truncate font-medium">${esc(p)}</span></div></button><div class="absolute right-2 flex opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"><button onclick="app.renameProject('${esc(p)}', event)" class="text-text-muted hover:text-white p-1"><i class="ph-bold ph-pencil-simple"></i></button><button onclick="app.deleteProject('${esc(p)}', event)" class="text-text-muted hover:text-red-400 p-1 ml-1"><i class="ph-bold ph-trash"></i></button></div></div>`; els.projectList.appendChild(d) }) }

function updateCounts() {
    const els = getEls();
    const getDayStr = (dParam) => {
        const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const tDate = getISTNow();
    const tmDate = getISTNow();
    tmDate.setDate(tmDate.getDate() + 1);
    const t = getDayStr(tDate), tm = getDayStr(tmDate);

    els.navCounts.all.textContent = state.tasks.length;

    const tasksTodo = state.tasks.filter(x => x.status === 'todo');
    let tasksViewTodo;
    
    if (state.view === 'all') tasksViewTodo = state.tasks; 
    else if (state.view === 'today') tasksViewTodo = tasksTodo.filter(x => x.dueDate === t); 
    else if (state.view === 'tomorrow') tasksViewTodo = tasksTodo.filter(x => x.dueDate === tm); 
    else if (state.view === 'upcoming') tasksViewTodo = tasksTodo.filter(x => x.dueDate > tm); 
    else if (state.view === 'project') tasksViewTodo = tasksTodo.filter(x => x.project === state.filterProject); 
    else tasksViewTodo = tasksTodo.filter(x => x.dueDate === t);

    els.navCounts.today.textContent = state.tasks.filter(x => x.dueDate === t && x.status === 'todo').length; 
    els.navCounts.tomorrow.textContent = state.tasks.filter(x => x.dueDate === tm && x.status === 'todo').length; 
    els.navCounts.upcoming.textContent = state.tasks.filter(x => x.dueDate > tm && x.status === 'todo').length; 
    els.navCounts.past.textContent = state.tasks.filter(x => x.dueDate < t && x.status === 'todo').length;

    const tp = state.tasks.reduce((a, b) => a + (b.completedSessionIds ? b.completedSessionIds.length : 0), 0);

    els.stats.pomosToday.textContent = tp;
    els.stats.tasksToday.textContent = state.tasks.filter(x => x.status === 'done' && x.dueDate === t).length;
    els.stats.estRemain.textContent = tasksViewTodo.reduce((a, b) => a + (parseInt(b.estimatedPomos) || 0), 0);

    const logsToday = state.logs.filter(l => { const d = parseDate(l.completedAt); return d && getDayStr(d) === t });
    const fm = logsToday.reduce((acc, log) => acc + (log.duration || 25), 0);

    els.stats.focusTime.textContent = `${Math.floor(fm / 60)}h ${fm % 60}m`;
    els.stats.tasksRemain.textContent = tasksViewTodo.length;

    const totalEstMin = tasksViewTodo.reduce((a, b) => a + ((parseInt(b.estimatedPomos) || 1) * (b.pomoDuration || 25)), 0);
    els.stats.estTime.textContent = Math.floor(totalEstMin / 60) > 0 ? `${Math.floor(totalEstMin / 60)}h ${totalEstMin % 60}m` : `${totalEstMin}m`;

    // --- Updated AI Summary Visibility Check ---
    const aiWrapper = $('ai-summary-wrapper');
    if (aiWrapper && aiWrapper.classList.contains('grid-rows-[1fr]')) {
        app.generateAISummaryData();
    }
}

function renderTasks() {
    const els = getEls();
    const getDayStr = (dParam) => {
    const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const tDate = getISTNow();
    const tmDate = getISTNow();
    tmDate.setDate(tmDate.getDate() + 1);
    const t = getDayStr(tDate), tm = getDayStr(tmDate);
    let l = [];
    if (state.view === 'all') l = state.tasks; else if (state.view === 'today') l = state.tasks.filter(x => x.dueDate === t && x.status === 'todo'); else if (state.view === 'tomorrow') l = state.tasks.filter(x => x.dueDate === tm && x.status === 'todo'); else if (state.view === 'upcoming') l = state.tasks.filter(x => x.dueDate > tm && x.status === 'todo'); else if (state.view === 'past') l = state.tasks.filter(x => x.dueDate < t && x.status === 'todo'); else if (state.view === 'completed') l = state.tasks.filter(x => x.status === 'done'); else if (state.view === 'project') l = state.tasks.filter(x => x.project === state.filterProject && x.status === 'todo');
    const pm = { high: 3, med: 2, low: 1, none: 0 };
    l.sort((a, b) => { if (a.status !== b.status) return a.status === 'todo' ? -1 : 1; return pm[b.priority] - pm[a.priority] });
    els.taskList.innerHTML = '';
    if (l.length === 0) els.emptyState.classList.remove('hidden'); else els.emptyState.classList.add('hidden');
    l.forEach(x => {
        const cP = x.completedSessionIds ? x.completedSessionIds.length : 0;
        const isSel = x.id === state.selectedTaskId;
        const pc = Math.min(100, (cP / (x.estimatedPomos || 1)) * 100);
        
        const prioColors = {
            high: 'text-red-400 bg-red-500/15 border-red-500/30',
            med: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30',
            low: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
            none: 'text-text-muted bg-white/10 border-white/10'
        };
        
        const sty = isSel 
            ? 'bg-white/[0.08] border-brand/60 shadow-[0_0_20px_rgba(255,87,87,0.2)] ring-1 ring-brand/50' 
            : 'bg-white/[0.04] border-white/[0.15] hover:bg-white/[0.08] hover:border-white/30 hover:shadow-xl hover:-translate-y-0.5 backdrop-blur-md';
        
        const dur = x.pomoDuration || 25, eP = x.estimatedPomos || 1, rP = Math.max(0, eP - cP), cMin = cP * dur, rMin = rP * dur;
        const fmt = m => { const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h ${rm}m` : `${rm}m` };
        
        const el = D.createElement('div');
        el.className = `group flex flex-col p-5 rounded-2xl border transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] cursor-pointer relative overflow-hidden ${sty}`; 
        el.onclick = () => app.selectTask(x.id);
        
        el.innerHTML = `
            <div class="flex items-start gap-4">
                
                <label class="flex-shrink-0 mt-0.5 cursor-pointer relative z-10" onclick="event.stopPropagation()">
                    <input type="checkbox" class="peer sr-only" ${x.status === 'done' ? 'checked' : ''} onchange="app.toggleTaskStatus('${x.id}','${x.status}')">
                    <div class="w-6 h-6 rounded-full border-2 border-text-muted peer-checked:border-brand peer-checked:bg-brand flex items-center justify-center transition-all duration-300 hover:border-white hover:bg-white/10 peer-checked:hover:bg-brand-hover shadow-sm">
                        <svg class="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300 scale-50 peer-checked:scale-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3.5" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                </label>
                
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-base font-bold text-white tracking-tight truncate transition-colors duration-300 ${x.status === 'done' ? 'line-through text-text-muted' : ''}">${esc(x.title)}</h3>
                        </div>
                        
                        <div class="flex-shrink-0 flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300 z-20 translate-x-2 lg:group-hover:translate-x-0 bg-dark-bg/90 backdrop-blur-xl rounded-full p-1.5 border border-white/20 shadow-lg">
                            <button onclick="app.startTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-white bg-brand rounded-full hover:scale-105 hover:shadow-[0_0_15px_rgba(255,87,87,0.5)] transition-all" title="Focus"><i class="ph-fill ph-play text-sm"></i></button>
                            <button onclick="app.editTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded-full transition-all" title="Edit"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                            <button onclick="app.deleteTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full transition-all" title="Delete"><i class="ph-bold ph-trash text-sm"></i></button>
                        </div>
                    </div>
                    
                    ${x.note ? `<p class="text-sm text-text-muted mt-1.5 line-clamp-2 leading-relaxed font-normal pr-4">${esc(x.note)}</p>` : ''}
                </div>
            </div>
            
            <div class="flex flex-wrap items-center mt-4 ml-[40px] gap-2.5">
                <span class="px-2.5 py-1 rounded-md border border-white/20 bg-white/10 text-xs font-semibold tracking-wide text-white flex items-center shadow-sm">
                    <i class="ph-fill ph-folder mr-1.5 text-text-muted"></i>${esc(x.project)}
                </span>
                
                ${x.priority !== 'none' ? `<span class="px-2.5 py-1 rounded-md border ${prioColors[x.priority]} text-xs font-semibold tracking-wide flex items-center shadow-sm"><i class="ph-fill ph-warning-circle mr-1.5"></i>${x.priority.charAt(0).toUpperCase() + x.priority.slice(1)}</span>` : ''}
                
                ${x.tags && x.tags.length ? x.tags.map(t => `<span class="px-2.5 py-1 rounded-md text-xs font-semibold bg-brand/15 text-brand border border-brand/30 shadow-sm">${esc(t)}</span>`).join('') : ''}
                ${x.repeat && x.repeat !== 'none' ? `<span class="flex items-center text-xs font-medium text-text-muted"><i class="ph-bold ph-arrows-clockwise mr-1.5 text-text-muted"></i>${x.repeat.charAt(0).toUpperCase() + x.repeat.slice(1)}</span>` : ''}
                ${x.reminder ? `<span class="flex items-center text-xs font-medium text-text-muted"><i class="ph-bold ph-bell mr-1.5 text-text-muted"></i>${x.reminder}</span>` : ''}
            </div>
            
            ${x.subtasks && x.subtasks.length > 0 ? `
            <div class="mt-4 ml-[40px] pl-3.5 border-l-2 border-white/20 space-y-2.5">
                ${x.subtasks.map(s => `
                <div class="flex items-start text-sm text-text-muted group/sub font-medium">
                    <div class="w-1.5 h-1.5 rounded-full bg-text-muted mt-[7px] mr-3 flex-shrink-0 transition-colors group-hover/sub:bg-brand"></div>
                    <span class="leading-relaxed text-white/90">${esc(s)}</span>
                </div>`).join('')}
            </div>` : ''}
            
            <div class="mt-5 pt-3.5 ml-[40px] border-t border-white/15 flex flex-col gap-3">
                <div class="flex items-center justify-between text-xs font-semibold text-text-muted">
                    <div class="flex items-center gap-5">
                        <span title="Pomodoros" class="flex items-center gap-2"><i class="ph-fill ph-check-circle text-brand text-[15px]"></i> <span class="text-white">${cP}</span><span class="opacity-40">/</span>${eP}</span>
                        <span title="Duration" class="flex items-center gap-2"><i class="ph-fill ph-clock text-brand text-[15px]"></i> <span class="${pc >= 100 ? 'text-brand' : 'text-white'}">${fmt(cMin)}</span><span class="opacity-40">/</span>${fmt(eP * dur)}</span>
                    </div>
                    <span class="text-[11px] uppercase tracking-widest text-text-muted font-bold">${Math.round(pc)}%</span>
                </div>
                
                <div class="h-1.5 w-full bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/10">
                    <div class="h-full bg-gradient-to-r from-brand to-red-400 rounded-full transition-all duration-500 ease-out relative" style="width: ${pc}%">
                        <div class="absolute inset-0 bg-white/20 w-full h-full animate-pulse"></div>
                    </div>
                </div>
            </div>
        `;
        els.taskList.appendChild(el);
    })
}

function updateTimerUI(t) {
    const els = getEls();
    
    if (t && state.timer.mode === 'focus') {
        state.timer.activeTaskId = t.id;
        els.focusEmpty.classList.add('hidden');
        els.focusActive.classList.remove('hidden');
        els.focusTitle.textContent = t.title;
        els.focusProject.textContent = t.project || 'Inbox';
        els.focusProject.className = "truncate max-w-[150px] text-brand";
        els.focusCompleted.textContent = t.completedSessionIds ? t.completedSessionIds.length : 0;
        els.focusTotal.textContent = t.estimatedPomos || 1;

        if (state.timer.status === 'running') {
            const m = Math.floor(state.timer.remaining / 60);
            const s = state.timer.remaining % 60;
            D.title = `${m}:${s.toString().padStart(2, '0')} - ${t.title}`;
        } else {
            D.title = `${t.title} - TimeTrekker`;
        }
    } 
    else if (state.timer.mode !== 'focus') {
        state.timer.activeTaskId = t ? t.id : null; 
        els.focusActive.classList.add('hidden');
        els.focusEmpty.classList.remove('hidden');
        
        const breakType = state.timer.mode === 'short' ? 'Short Break' : 'Long Break';
        els.focusEmpty.innerHTML = `<p class="text-lg font-bold text-blue-400 tracking-wide uppercase">${breakType}</p><p class="text-xs text-text-muted mt-2">Time to step away and rest your mind.</p>`;
        
        if (state.timer.status === 'running') {
            const m = Math.floor(state.timer.remaining / 60);
            const s = state.timer.remaining % 60;
            D.title = `${m}:${s.toString().padStart(2, '0')} - Break`;
        } else {
            D.title = `Break - TimeTrekker`;
        }
    } 
    else {
        state.timer.activeTaskId = null;
        els.focusActive.classList.add('hidden');
        els.focusEmpty.classList.remove('hidden');
        els.focusEmpty.innerHTML = `<p class="text-sm font-medium">Select a task to start focusing</p>`;
        D.title = 'TimeTrekker';
    }
}

window.addEventListener('popstate', (e) => {
    const currentParams = new URLSearchParams(window.location.search);
    const view = currentParams.get('view') || 'today';
    if (app.setView) app.setView(view, false);
});

let initialView = URL_PARAMS.get('view') || 'today';

if (initialView === 'tasks') {
    initialView = 'today';
} else if (initialView === 'timer') {
    initialView = 'today';
    setTimeout(() => app.toggleFocusPanel(true), 100);
} else if (initialView === 'settings') {
    initialView = 'today';
    setTimeout(() => app.toggleGlobalSettings(), 100);
}

app.setView(initialView, false);