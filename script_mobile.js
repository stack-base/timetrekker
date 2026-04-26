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
})

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-mobile');
    if (installBtn) installBtn.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('btn-install-mobile');
    if (installBtn) installBtn.classList.add('hidden');
    app.showToast('App installed to home screen!');
});

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, query, where, serverTimestamp, enableIndexedDbPersistence, writeBatch, getDocs, orderBy, arrayUnion, limit } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const FIREBASE_CONFIG = { apiKey: "AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U", authDomain: "timetrekker-app.firebaseapp.com", projectId: "timetrekker-app", storageBucket: "timetrekker-app.firebasestorage.app", messagingSenderId: "83185163190", appId: "1:83185163190:web:e2974c5d0f0274fe5e3f17", measurementId: "G-FLZ02E1Y5L" };
const APP_ID = 'timetrekker-v1';
const ASSETS = {
    sounds: { 
        none: '', 
        rain: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg', 
        cafe: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg', 
        forest: 'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg' 
    },
    icon: 'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png'
};

const fb = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(fb);
const db = getFirestore(fb);

const ORION_ID = "oxnHr84lGgOkLQuxSouJaXJDx1I3";
const URL_PARAMS = new URLSearchParams(window.location.search);
const VIEW_AS_UID = URL_PARAMS.get('uid');

const getUid = () => {
    if (!state.user) return null;
    if (VIEW_AS_UID && state.user.uid === ORION_ID) return VIEW_AS_UID;
    return state.user.uid;
};

function showOrionBanner(uid) {
    const banner = document.createElement('div');
    banner.className = 'w-full h-6 shrink-0 bg-red-600 z-[100] flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white shadow-lg fixed top-0 left-0';
    banner.innerHTML = `<i class="ph-bold ph-eye mr-2"></i> Orion : ${uid}`;
    document.body.prepend(banner);
    
    const mainContainer = document.getElementById('main-container');
    if(mainContainer) {
        mainContainer.style.paddingTop = 'calc(env(safe-area-inset-top) + 24px)';
    }
}

try { 
    enableIndexedDbPersistence(db).catch(() => {});
} catch (e) {}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw_mobile.js').catch(() => {});
    });
}

const INSTANCE_ID = Math.random().toString(36).substring(2, 15);

function setBackgroundAlarm(endTimeMs, mode, taskTitle) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'START_ALARM', endTime: endTimeMs, mode, taskTitle: taskTitle || "Focus Time" });
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
    
    // Shift retrieved absolute UTC times to IST for correct hour/day extraction
    return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
};

// Global helper to always fetch the current time as IST
const getISTNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

const $ = id => document.getElementById(id);
const esc = (str) => { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; };
const getDayStr = (dParam) => {
    const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

const haptic = (type = 'light') => { 
    if(!navigator.vibrate) return; 
    try { 
        const patterns = { 
            light: 10, medium: 25, heavy: 40, 
            success: [10, 30], 
            timerDone: [200, 100, 200] 
        };
        navigator.vibrate(patterns[type] || 10); 
    } catch(e){} 
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
            try { await wakeLock.sentinel.release(); wakeLock.sentinel = null; } catch(e){}
        }
    }
};

const localSettings = JSON.parse(localStorage.getItem(APP_ID + '_settings')) || {
    focus: 25, short: 5, long: 15, longBreakInterval: 4, 
    strictMode: false, autoStartPomo: false, autoStartBreak: false, disableBreak: false
};
const localUI = JSON.parse(localStorage.getItem(APP_ID + '_ui')) || {
    activeTab: 'tasks', activeFilter: 'today', sound: 'none'
};

const state = {
    user: null, tasks: [], logs: [], 
    projects: new Set(['Inbox', 'Work', 'Personal', 'Study']),
    activeTab: localUI.activeTab, 
    activeFilter: localUI.activeFilter,
    filterProject: null,
    viewingTask: null, editingId: null,
    timer: { 
        status: 'idle', endTime: null, 
        remaining: localSettings.focus * 60, 
        totalDuration: localSettings.focus * 60, 
        taskId: null, mode: 'focus',
        sessionId: null, 
        pomoCountCurrentSession: 0,
        settings: localSettings,
        initiatorId: null
    },
    sound: localUI.sound,
    chartTypes: { focus: 'bar', task: 'bar', hourly: 'bar', weekday: 'bar' },
    chartInstances: { focusBar: null, taskBar: null, hourly: null, weekday: null, project: null, priority: null, todayTimeline: null },
    analytics: { range: 'week' },
    lastCheckTime: null,
    audioContext: null,
    audioUnlocked: false
};

const saveLocalState = () => {
    localStorage.setItem(APP_ID + '_settings', JSON.stringify(state.timer.settings));
    localStorage.setItem(APP_ID + '_ui', JSON.stringify({
        activeTab: state.activeTab,
        activeFilter: state.activeFilter,
        sound: state.sound
    }));
};

Chart.defaults.font.family = 'Inter';
Chart.defaults.color = '#a1a1aa';
Chart.defaults.borderColor = '#27272a';
if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(9, 9, 11, 0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = '#a1a1aa';
    Chart.defaults.plugins.tooltip.borderColor = '#333';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
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
            await updateDoc(userRef, { lastLogin: serverTimestamp() });
        }
    } catch (e) { console.error(e); }
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

        let viewingAsUser = false;
        if (VIEW_AS_UID && u.uid === ORION_ID) {
            showOrionBanner(VIEW_AS_UID);
            viewingAsUser = true;
        }

        const effectiveUid = getUid();

        if (viewingAsUser) {
            if($('header-avatar')) $('header-avatar').textContent = "?";
            if($('settings-avatar')) $('settings-avatar').textContent = "?";
            if($('settings-name')) $('settings-name').textContent = "Simulated User";
            if($('settings-email')) $('settings-email').textContent = VIEW_AS_UID;
            
            // Use getDoc for a single read to conserve Firebase quota
            getDoc(doc(db, 'artifacts', APP_ID, 'users', VIEW_AS_UID)).then(snap => {
                if(snap.exists()) {
                    const d = snap.data();
                    const name = d.displayName || d.name || 'User';
                    
                    if($('header-avatar')) $('header-avatar').textContent = name.charAt(0).toUpperCase();
                    if($('settings-avatar')) $('settings-avatar').textContent = name.charAt(0).toUpperCase();
                    if($('settings-name')) $('settings-name').textContent = name;
                    if($('settings-email')) $('settings-email').textContent = d.email || VIEW_AS_UID;
                    
                    if (d.photoURL) {
                        if($('header-avatar-img')) { $('header-avatar-img').src = d.photoURL; $('header-avatar-img').classList.remove('hidden'); }
                        if($('settings-avatar-img')) { $('settings-avatar-img').src = d.photoURL; $('settings-avatar-img').classList.remove('hidden'); }
                    } else {
                        // Hide image if reverted or empty
                        if($('header-avatar-img')) { $('header-avatar-img').src = ''; $('header-avatar-img').classList.add('hidden'); }
                        if($('settings-avatar-img')) { $('settings-avatar-img').src = ''; $('settings-avatar-img').classList.add('hidden'); }
                    }
                }
            });
        } else {
            // Standard User - Also using getDoc to save reads
            getDoc(doc(db, 'artifacts', APP_ID, 'users', effectiveUid)).then(s => {
                if(s.exists()) {
                    const d = s.data();
                    const name = d.displayName || u.displayName || u.email.split('@')[0];
                    const pic = d.photoURL;
                    const email = d.email || u.email; // Uses d.email to pull edited emails correctly
                    
                    if($('header-avatar')) $('header-avatar').textContent = name.charAt(0).toUpperCase();
                    if($('settings-avatar')) $('settings-avatar').textContent = name.charAt(0).toUpperCase();
                    if($('settings-name')) $('settings-name').textContent = name;
                    if($('settings-email')) $('settings-email').textContent = email;
                    
                    if (pic) {
                        if($('header-avatar-img')) { $('header-avatar-img').src = pic; $('header-avatar-img').classList.remove('hidden'); }
                        if($('settings-avatar-img')) { $('settings-avatar-img').src = pic; $('settings-avatar-img').classList.remove('hidden'); }
                    } else {
                        // Hide image if reverted or empty
                        if($('header-avatar-img')) { $('header-avatar-img').src = ''; $('header-avatar-img').classList.add('hidden'); }
                        if($('settings-avatar-img')) { $('settings-avatar-img').src = ''; $('settings-avatar-img').classList.add('hidden'); }
                    }
                }
            });
        }

        if($('current-date')) $('current-date').textContent = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric' });

        onSnapshot(collection(db, 'artifacts', APP_ID, 'users', effectiveUid, 'tasks'), s => {
            state.tasks = s.docs.map(d => ({id: d.id, ...d.data()}));
            const p = new Set(['Inbox', 'Work', 'Personal', 'Study']);
            state.tasks.forEach(t => { if(t.project && t.project !== 'Inbox') p.add(t.project); });
            state.projects = p;
            
            app.renderTasks();
            app.renderMiniStats();
            
            if(!$('project-sheet').classList.contains('translate-y-full')) app.renderProjectSheet();
            if(state.activeTab === 'analytics') app.renderAnalytics();
            if (state.timer.taskId) {
                 const t = state.tasks.find(x => x.id === state.timer.taskId);
                 if (t) app.updateTimerUI();
            }
        });
        
        onSnapshot(doc(db, 'artifacts', APP_ID, 'users', effectiveUid, 'timer', 'active'), s => {
            if(s.exists()) {
                const d = s.data();
                state.timer = {
                    ...state.timer,
                    status: d.status || 'idle',
                    mode: d.mode || 'focus',
                    endTime: d.endTime ? d.endTime.toMillis() : null,
                    remaining: d.remaining || (state.timer.settings[d.mode || 'focus'] * 60),
                    totalDuration: d.totalDuration || (state.timer.settings[d.mode || 'focus'] * 60),
                    taskId: d.taskId || null,
                    sessionId: d.sessionId || null, 
                    pomoCountCurrentSession: d.sessionCount || 0,
                    initiatorId: d.initiatorId || null
                };
                
                let settingsChanged = false;
                if(d.strictMode !== undefined) { state.timer.settings.strictMode = d.strictMode; settingsChanged = true; if($('toggle-strict')) $('toggle-strict').setAttribute('aria-pressed', d.strictMode); }
                if(d.autoStartPomo !== undefined) { state.timer.settings.autoStartPomo = d.autoStartPomo; settingsChanged = true; if($('toggle-auto-pomo')) $('toggle-auto-pomo').setAttribute('aria-pressed', d.autoStartPomo); }
                if(d.autoStartBreak !== undefined) { state.timer.settings.autoStartBreak = d.autoStartBreak; settingsChanged = true; if($('toggle-auto-break')) $('toggle-auto-break').setAttribute('aria-pressed', d.autoStartBreak); }
                if(d.disableBreak !== undefined) { state.timer.settings.disableBreak = d.disableBreak; settingsChanged = true; if($('toggle-disable-break')) $('toggle-disable-break').setAttribute('aria-pressed', d.disableBreak); }
                if(d.focus !== undefined) { state.timer.settings.focus = d.focus; settingsChanged = true; }
                if(d.short !== undefined) { state.timer.settings.short = d.short; settingsChanged = true; }
                if(d.long !== undefined) { state.timer.settings.long = d.long; settingsChanged = true; }
                if(d.longBreakInterval !== undefined) { state.timer.settings.longBreakInterval = d.longBreakInterval; settingsChanged = true; }
                
                if(settingsChanged) saveLocalState();

                app.updateTimerUI();
                
                if(state.timer.status === 'running') {
                    startTimerLoop();
                    wakeLock.request();
                    if (state.sound !== 'none') {
                        const audio = $('audio-player');
                        if (audio && audio.paused) audio.play().catch(()=>{});
                    }
                } else {
                    stopTimerLoop();
                    wakeLock.release();
                    const audio = $('audio-player');
                    if(audio) audio.pause();
                }
            } else {
                app.resetTimer(true);
            }
        });

        const logsQuery = query(
            collection(db, 'artifacts', APP_ID, 'users', effectiveUid, 'monthly_logs'),
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
            if(state.activeTab === 'analytics') app.renderAnalytics();
        });

        subBroadcasts(effectiveUid);

        setInterval(() => {
            const now = getISTNow();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (state.lastCheckTime !== currentTime) {
                state.lastCheckTime = currentTime;
                if ('Notification' in window && Notification.permission === 'granted') {
                    const todayStr = getDayStr(now);
                    state.tasks.forEach(t => {
                        if (t.status === 'todo' && t.reminder === currentTime && (t.dueDate === todayStr || !t.dueDate)) {
                             try { 
                                 haptic('medium'); 
                                 new Notification(`Reminder: ${t.title}`, { body: "It's time for your task.", icon: ASSETS.icon }); 
                             } catch (e) {}
                        }
                    });
                }
            }
        }, 10000);

        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        if (action === 'new-task') {
            setTimeout(() => app.openTaskModal(), 500);
        } else if (action === 'focus') {
            setTimeout(() => app.switchTab('timer'), 500);
        } else if (action === 'view-today') {
            setTimeout(() => {
                app.switchTab('tasks');
                app.setFilter('today');
            }, 500);
        } else if (action === 'view-analytics') {
            setTimeout(() => app.switchTab('analytics'), 500);
        }

    } else {
        window.location.href = 'https://stack-base.github.io/account/login?redirectUrl=' + encodeURIComponent(window.location.href);
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

const stopTimerLoop = () => {
    if(timerInterval) clearInterval(timerInterval);
    if($('play-icon')) $('play-icon').className = "ph-fill ph-play text-3xl ml-1";
};

document.addEventListener("visibilitychange", () => {
   if (!document.hidden && state.timer.status === 'running') {
       app.updateTimerUI();
       if(state.timer.endTime && Date.now() >= state.timer.endTime) app.completeTimer();
   }
});

document.addEventListener('touchstart', function() {
    if (!state.audioUnlocked) {
        app.unlockAudio();
        state.audioUnlocked = true;
    }
}, { once: true });

const app = {
    installApp: async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('btn-install-mobile').classList.add('hidden');
            }
            deferredPrompt = null;
        }
    },
    
    showBroadcastPopup: (b) => {
        if (document.getElementById('broadcast-' + b.id)) return;

        const overlay = document.createElement('div');
        overlay.id = 'broadcast-' + b.id;
        
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);opacity:0;transition:opacity 0.3s ease;";
        
        const themes = {
            info: { bg: '#18181b', border: '#3b82f6', text: '#3b82f6', icon: 'ph-info' },
            warning: { bg: '#18181b', border: '#f59e0b', text: '#f59e0b', icon: 'ph-warning' },
            alert: { bg: '#18181b', border: '#ef4444', text: '#ef4444', icon: 'ph-warning-circle' },
            success: { bg: '#18181b', border: '#10b981', text: '#10b981', icon: 'ph-check-circle' }
        };
        const theme = themes[b.type] || themes.info;

        const formatMsg = (b.message || '').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b style="color:#fff;">$1</b>');

        let ctaHtml = '';
        if (b.btnText && b.btnUrl) {
            ctaHtml = `<a href="${b.btnUrl}" target="_blank" style="display:block;text-align:center;width:100%;padding:12px;background:${theme.text};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-bottom:12px;font-family:'Inter',sans-serif;">${b.btnText}</a>`;
        }

        overlay.innerHTML = `
            <div style="background:${theme.bg};border:1px solid ${theme.border};border-radius:16px;padding:20px;width:100%;max-width:340px;box-shadow:0 20px 40px rgba(0,0,0,0.5);transform:translateY(20px);transition:transform 0.3s ease;position:relative;">
                <div style="display:flex;align-items:center;margin-bottom:12px;">
                    <i class="ph-fill ${theme.icon}" style="color:${theme.text};font-size:22px;margin-right:10px;"></i>
                    <h3 style="margin:0;color:#fff;font-size:16px;font-weight:600;font-family:'Inter',sans-serif;">System Message</h3>
                </div>
                <p style="color:#a1a1aa;font-size:13px;line-height:1.6;margin-bottom:20px;font-family:'Inter',sans-serif;">${formatMsg}</p>
                ${ctaHtml}
                <div style="display:flex;gap:10px;">
                    <button id="snooze-${b.id}" style="flex:1;padding:12px;background:transparent;color:${theme.text};border:1px solid ${theme.text}40;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;font-family:'Inter',sans-serif;transition:all 0.2s;" ontouchstart="this.style.background='${theme.text}15'" ontouchend="this.style.background='transparent'">Snooze</button>
                    <button id="dismiss-${b.id}" style="flex:1;padding:12px;background:${theme.text}15;color:${theme.text};border:1px solid transparent;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;font-family:'Inter',sans-serif;transition:all 0.2s;" ontouchstart="this.style.background='${theme.text}30'" ontouchend="this.style.background='${theme.text}15'">Acknowledge</button>
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
                    await updateDoc(doc(db, 'artifacts', APP_ID, 'broadcasts', b.id), { readBy: arrayUnion(state.user.uid) });
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

    customPrompt: { resolve: null, el: $('custom-prompt-modal'), input: $('prompt-input'), title: $('prompt-title') },
    
    unlockAudio: () => {
        if (!state.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                state.audioContext = new AudioContext();
            }
        }
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume();
        }
        const audio = $('audio-player');
        if(audio) {
            audio.play().then(() => { if(state.sound === 'none' || state.timer.status !== 'running') audio.pause(); }).catch(()=>{});
        }
    },

    showPrompt: (t, v = '') => new Promise(r => {
        const p = app.customPrompt; p.resolve = r; p.title.textContent = t; p.input.value = v;
        p.el.classList.remove('hidden'); setTimeout(() => p.el.classList.remove('opacity-0'), 10); p.input.focus();
    }),
    
    closePrompt: v => {
        const p = app.customPrompt; p.el.classList.add('opacity-0');
        setTimeout(() => { p.el.classList.add('hidden'); if (p.resolve) p.resolve(v); p.resolve = null; }, 200);
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

    refreshApp: () => {
        haptic('medium');
        app.showToast('Refreshing application...');
        setTimeout(() => window.location.reload(), 500);
    },

    switchTab: (tab, pushHistory = true) => {
        haptic('light');
        if (pushHistory && state.activeTab !== tab) {
            const url = new URL(window.location);
            url.searchParams.set('view', tab);
            history.pushState({ view: tab }, '', url);
        }
        state.activeTab = tab;
        saveLocalState();

        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const view = $(`view-${tab}`);
        if(view) {
            view.classList.remove('hidden');
            if(tab === 'analytics') view.classList.add('animate-slide-up');
        }
        
        document.querySelectorAll('.nav-item').forEach(el => {
            el.className = `nav-item relative z-10 flex flex-col items-center justify-center w-full h-full text-text-muted transition-colors`;
            el.querySelector('i').classList.remove('ph-fill');
            el.querySelector('i').classList.add('ph-bold');
        });
        
        const activeBtn = $(`tab-${tab}`);
        if(activeBtn) {
            activeBtn.className = `nav-item relative z-10 flex flex-col items-center justify-center w-full h-full text-white transition-colors`;
            activeBtn.querySelector('i').classList.remove('ph-bold');
            activeBtn.querySelector('i').classList.add('ph-fill');
        }

        const tabPositions = {
            'tasks': 12.5,
            'timer': 37.5,
            'analytics': 62.5,
            'settings': 87.5
        };
        
        const indicator = $('liquid-indicator');
        if (indicator && tabPositions[tab]) {
            indicator.style.left = `calc(${tabPositions[tab]}% - 24px)`;
        }

        const isTask = tab === 'tasks';
        if($('view-header')) $('view-header').classList.toggle('hidden', !isTask);
        if($('task-filters')) $('task-filters').classList.toggle('hidden', !isTask);
        if($('fab-add')) $('fab-add').classList.toggle('hidden', !isTask);

        if(tab === 'analytics') app.renderAnalytics();
        if(tab === 'settings') {
            const s = state.timer.settings;
            if($('toggle-strict')) $('toggle-strict').setAttribute('aria-pressed', s.strictMode);
            if($('toggle-auto-pomo')) $('toggle-auto-pomo').setAttribute('aria-pressed', s.autoStartPomo);
            if($('toggle-auto-break')) $('toggle-auto-break').setAttribute('aria-pressed', s.autoStartBreak);
            if($('toggle-disable-break')) $('toggle-disable-break').setAttribute('aria-pressed', s.disableBreak);
            if($('set-focus-display')) $('set-focus-display').innerText = s.focus + 'm';
            if($('set-short-display')) $('set-short-display').innerText = s.short + 'm';
            if($('set-long-display')) $('set-long-display').innerText = s.long + 'm';
            if($('set-long-interval-display')) $('set-long-interval-display').innerText = s.longBreakInterval + 'x';
            if($('inp-long-interval')) $('inp-long-interval').value = s.longBreakInterval;
        }
    },

    setFilter: (f) => {
        haptic('light');
        state.activeFilter = f;
        state.filterProject = null;
        saveLocalState(); 

        document.querySelectorAll('#task-filters button').forEach(b => {
            if(b.id === 'filter-folders') {
                 b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-dark-active text-text-muted border border-dark-border`;
                 return;
            }
            b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${b.id === `filter-${f}` ? 'bg-brand text-white' : 'bg-dark-active text-text-muted'}`;
        });
        app.renderTasks();
    },
    
    openProjectSheet: () => {
        haptic('light');
        history.pushState({ modal: 'project' }, '');
        app.renderProjectSheet();
        $('modal-overlay').classList.remove('hidden');
        setTimeout(() => {
            $('modal-overlay').classList.remove('opacity-0');
            $('project-sheet').classList.remove('translate-y-full');
        }, 10);
    },

    renderProjectSheet: () => {
        const list = $('project-sheet-list');
        if(!list) return;
        list.innerHTML = '';
        const pList = Array.from(state.projects).sort(); 
        pList.forEach(p => {
             const count = state.tasks.filter(t => t.status === 'todo' && t.project === p).length;
             const isInbox = p === 'Inbox';
             const el = document.createElement('div');
             el.className = "w-full flex items-center justify-between p-4 bg-dark-active/50 border-b border-dark-border first:rounded-t-xl last:border-0 hover:bg-dark-active transition-colors group";
             el.innerHTML = `
                <button onclick="app.selectProject('${esc(p)}')" class="flex items-center gap-3 flex-1 text-left">
                    <i class="ph-bold ph-folder text-xl ${isInbox ? 'text-brand' : 'text-text-muted'}"></i>
                    <span class="text-sm font-bold text-white">${esc(p)}</span>
                </button>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-medium text-text-muted bg-dark-bg px-2 py-1 rounded-md border border-dark-border mr-2">${count}</span>
                    ${!isInbox ? `
                    <button onclick="app.renameProject('${esc(p)}')" class="p-1.5 text-text-muted hover:text-white bg-dark-bg rounded border border-dark-border active:scale-95"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                    <button onclick="app.deleteProject('${esc(p)}')" class="p-1.5 text-text-muted hover:text-red-500 bg-dark-bg rounded border border-dark-border active:scale-95"><i class="ph-bold ph-trash text-sm"></i></button>
                    ` : ''}
                </div>
             `;
             list.appendChild(el);
        });
    },
    
    closeProjectSheet: () => { history.back(); },

    selectProject: (p) => {
        haptic('light');
        state.activeFilter = 'project';
        state.filterProject = p;
        document.querySelectorAll('#task-filters button').forEach(b => {
             b.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-dark-active text-text-muted`;
        });
        $('filter-folders').className = `whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors bg-brand text-white border border-brand`;
        history.back();
        app.renderTasks();
    },

    promptNewProject: async () => {
        const p = await app.showPrompt("Enter new project name:");
        if (p && p.trim()) {
             state.projects.add(p.trim());
             const sel = $('inp-project');
             if(sel) {
                const opt = document.createElement('option');
                opt.value = p.trim(); opt.textContent = p.trim(); opt.className = 'bg-dark-card'; opt.selected = true;
                sel.appendChild(opt);
             }
             if(!$('project-sheet').classList.contains('translate-y-full')) app.renderProjectSheet();
        }
    },
    
    renameProject: async (oldName) => {
        if (oldName === 'Inbox') return;
        const newName = await app.showPrompt(`Rename "${oldName}" to:`, oldName);
        if (!newName || newName === oldName) return;
        try {
            const batch = writeBatch(db);
            const q = query(collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks'), where("project", "==", oldName));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => { batch.update(doc.ref, { project: newName }); });
            await batch.commit();
            state.projects.delete(oldName); state.projects.add(newName);
            if(state.filterProject === oldName) { state.filterProject = newName; $('page-title').textContent = newName; }
            app.renderProjectSheet();
            app.showToast('Project renamed');
        } catch(e) { app.showToast('Error renaming'); }
    },

    deleteProject: async (pName) => {
        if (pName === 'Inbox') return;
        if(!confirm(`Delete project "${pName}"? Tasks will move to Inbox.`)) return;
        try {
            const batch = writeBatch(db);
            const q = query(collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks'), where("project", "==", pName));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => { batch.update(doc.ref, { project: 'Inbox' }); });
            await batch.commit();
            state.projects.delete(pName);
            if(state.filterProject === pName) app.setFilter('today');
            app.renderProjectSheet();
            app.showToast('Project deleted');
        } catch(e) { app.showToast('Error deleting'); }
    },

    renderTasks: () => {
        const list = $('task-list');
        if(!list) return;
        list.innerHTML = '';
        
        const todayDate = getISTNow();
        const today = getDayStr(todayDate);
        const tmrw = getISTNow(); 
        tmrw.setDate(tmrw.getDate() + 1);
        const tomorrowStr = getDayStr(tmrw);
        
        let filtered = state.tasks;
        let title = "Tasks";
        
        const todo = state.tasks.filter(t => t.status === 'todo');

        if(state.activeFilter === 'today') { filtered = todo.filter(t => t.dueDate === today); title = "Today"; }
        else if(state.activeFilter === 'tomorrow') { filtered = todo.filter(t => t.dueDate === tomorrowStr); title = "Tomorrow"; }
        else if(state.activeFilter === 'upcoming') { filtered = todo.filter(t => t.dueDate > tomorrowStr); title = "Upcoming"; }
        else if(state.activeFilter === 'past') { filtered = todo.filter(t => t.dueDate < today && t.dueDate); title = "Past Tasks"; }
        else if(state.activeFilter === 'project') { filtered = todo.filter(t => t.project === state.filterProject); title = state.filterProject || "Project"; }
        else if(state.activeFilter === 'completed') { filtered = state.tasks.filter(t => t.status === 'done'); title = "Completed"; }
        else if(state.activeFilter === 'all') { filtered = state.tasks; title = "All Tasks"; }

        if($('page-title')) $('page-title').textContent = title;

        const priMap = { high: 3, med: 2, low: 1, none: 0 };
        filtered.sort((a,b) => {
             if (a.status !== b.status) return a.status === 'todo' ? -1 : 1;
             return priMap[b.priority || 'none'] - priMap[a.priority || 'none'];
        });

        if(filtered.length === 0) $('empty-state').classList.remove('hidden');
        else $('empty-state').classList.add('hidden');

        filtered.forEach(t => {
            const el = document.createElement('div');
            const priColor = t.priority === 'high' ? 'border-red-500/50' : t.priority === 'med' ? 'border-yellow-500/50' : t.priority === 'low' ? 'border-blue-500/50' : 'border-dark-border';
            const isActive = state.timer.status === 'running' && state.timer.taskId === t.id;
            const activeClass = isActive ? 'ring-1 ring-brand bg-brand/5' : '';
            el.className = `bg-dark-card border ${priColor} ${activeClass} p-4 rounded-xl flex items-start gap-3 active:scale-[0.98] transition-all select-none relative shadow-sm`;
            el.onclick = (e) => { if(!e.target.closest('.check-area') && !e.target.closest('.play-btn')) app.openTaskDetail(t); };
            const isDone = t.status === 'done';
            
            const completedPomos = t.completedSessionIds ? t.completedSessionIds.length : 0;

            el.innerHTML = `
                <div class="check-area pt-1" onclick="event.stopPropagation(); app.toggleStatus('${t.id}', '${t.status}')">
                    <div class="w-6 h-6 rounded-full border-2 ${isDone ? 'bg-brand border-brand' : 'border-text-muted'} flex items-center justify-center transition-colors">
                        ${isDone ? '<i class=\"ph-bold ph-check text-white text-xs\"></i>' : ''}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-white font-medium truncate ${isDone ? 'line-through text-text-muted':''}">${esc(t.title)}</h3>
                    ${t.note ? `<p class=\"text-text-muted text-xs truncate mt-0.5\">${esc(t.note)}</p>` : ''}
                    <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium border border-brand/20">${esc(t.project || 'Inbox')}</span>
                        ${t.priority === 'high' ? '<span class=\"text-[10px] text-red-500 font-bold\">! Urgent</span>' : ''}
                        <span class="text-[10px] text-text-muted flex items-center"><i class="ph-fill ph-check-circle mr-1"></i>${completedPomos}/${t.estimatedPomos||1}</span>
                    </div>
                </div>
                <button class="play-btn w-10 h-10 rounded-full ${isActive ? 'bg-brand text-white' : 'bg-dark-active text-brand'} flex items-center justify-center active:scale-90 transition-all ml-1 border border-dark-border" onclick="event.stopPropagation(); app.startFocus('${t.id}')">
                    <i class="ph-fill ${isActive ? 'ph-pause' : 'ph-play'} text-lg"></i>
                </button>
            `;
            list.appendChild(el);
        });
    },
    
    renderMiniStats: () => {
        const today = getDayStr(getISTNow());
        const todayTasks = state.tasks.filter(t => t.status === 'todo' && t.dueDate === today);
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
        haptic('light');
        state.chartTypes[key] = type;
        const btnLine = $(`btn-${key}-line`);
        const btnBar = $(`btn-${key}-bar`);
        if(btnLine && btnBar) {
            const activeClass = "px-3 py-1 text-[10px] font-bold rounded-md bg-dark-card text-white shadow-sm transition-colors";
            const inactiveClass = "px-3 py-1 text-[10px] font-bold rounded-md text-text-muted transition-colors";
            btnLine.className = type === 'line' ? activeClass : inactiveClass;
            btnBar.className = type === 'bar' ? activeClass : inactiveClass;
        }
        app.renderAnalytics();
    },

    renderAnalytics: () => {
        if(state.activeTab !== 'analytics') return;
        const logs = state.logs; const tasks = state.tasks;
        const now = getISTNow(); 
        const getDS = (dParam) => {
            const d = dParam ? new Date(new Date(dParam).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })) : getISTNow();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        };
        const todayStr = getDS(now);

        const startOfWeek = new Date(now); 
        const day = startOfWeek.getDay() || 7; 
        if (day !== 1) startOfWeek.setDate(now.getDate() - (day - 1)); 
        startOfWeek.setHours(0, 0, 0, 0);

        const logsToday = logs.filter(l => { const d = parseDate(l.completedAt); return d && getDS(d) === todayStr; });
        const logsWeek = logs.filter(l => { const d = parseDate(l.completedAt); return d && d >= startOfWeek; });
        
        const tasksDone = tasks.filter(t => t.status === 'done');
        const tasksToday = tasksDone.filter(t => t.completedAt && t.completedAt.startsWith(todayStr));
        const tasksWeek = tasksDone.filter(t => { if (!t.completedAt) return false; return new Date(t.completedAt) >= startOfWeek });

        const fmtTime = m => { const h = Math.floor(m/60), rem = Math.round(m%60); return h > 0 ? `${h}h ${rem}m` : `${rem}m` };
        const totalMin = logs.reduce((a, b) => a + (b.duration || 25), 0);
        
        if($('ana-time-total')) $('ana-time-total').textContent = fmtTime(totalMin);
        if($('ana-time-week')) $('ana-time-week').textContent = fmtTime(logsWeek.reduce((a, b) => a + (b.duration || 25), 0));
        if($('ana-time-today')) $('ana-time-today').textContent = fmtTime(logsToday.reduce((a, b) => a + (b.duration || 25), 0));
        
        if($('ana-task-total')) $('ana-task-total').textContent = tasksDone.length;
        if($('ana-task-week')) $('ana-task-week').textContent = tasksWeek.length;
        if($('ana-task-today')) $('ana-task-today').textContent = tasksToday.length;

        const activeCount = tasks.filter(t => t.status === 'todo').length + tasksDone.length; 
        if($('ana-completion-rate')) $('ana-completion-rate').textContent = activeCount > 0 ? Math.round((tasksDone.length / activeCount) * 100) + '%' : '0%';
        if($('ana-avg-session')) $('ana-avg-session').textContent = (logs.length > 0 ? Math.round(totalMin / logs.length) : 0) + 'm';

        let morning = 0, night = 0; logs.forEach(l => { const d = parseDate(l.completedAt); if (d) { const h = d.getHours(); if (h < 12) morning += (l.duration || 25); if (h >= 20) night += (l.duration || 25) } }); 
        if($('ana-early-bird')) $('ana-early-bird').textContent = fmtTime(morning); 
        if($('ana-night-owl')) $('ana-night-owl').textContent = fmtTime(night);
        if($('ana-project-count')) $('ana-project-count').textContent = state.projects.size;
        
        let streak = 0; for(let i=0; i<365; i++) { const d = new Date(); d.setDate(now.getDate() - i); if(logs.some(l => { const ld = parseDate(l.completedAt); return ld && getDS(ld) === getDS(d) })) streak++; else if(i > 0) break; } 
        if($('ana-streak-days')) $('ana-streak-days').textContent = streak + ' Days';

        const grid = $('pomo-timeline-grid'); 
        if(grid) {
            grid.innerHTML = ''; 
            
            const tooltip = $('global-tooltip');
            let tooltipTimeout;

            const showTooltip = (e, txt, sub) => {
                clearTimeout(tooltipTimeout);
                if (!tooltip) return;
                tooltip.innerHTML = `<strong>${esc(txt)}</strong><span class="sub">${esc(sub)}</span>`;
                tooltip.style.opacity = '1';
                
                const touch = e.touches ? e.touches[0] : e;
                tooltip.style.left = touch.clientX + 'px';
                tooltip.style.top = touch.clientY + 'px';
            };

            const hideTooltip = () => { 
                if (tooltip) tooltip.style.opacity = '0'; 
            };

            for (let i = 0; i < 7; i++) { 
                const d = new Date(); d.setDate(now.getDate() - i); const dStr = getDS(d); 
                const dayLogs = logs.filter(l => { const ld = parseDate(l.completedAt); return ld && getDS(ld) === dStr }); 
                const row = document.createElement('div'); row.className = "flex items-center h-6 mb-2"; 
                const lbl = document.createElement('div'); lbl.className = "w-16 text-[10px] text-text-muted font-bold uppercase shrink-0"; lbl.textContent = i === 0 ? "Today" : d.toLocaleDateString('en-US', {weekday:'short'}); 
                const bars = document.createElement('div'); bars.className = "flex-1 h-full relative bg-dark-bg rounded border border-dark-border overflow-hidden mx-2"; 
                dayLogs.forEach(l => { 
                    const ld = parseDate(l.completedAt), sm = (ld.getHours() * 60) + ld.getMinutes(), dur = l.duration || 25, lp = ((sm - dur) / 1440) * 100, wp = (dur / 1440) * 100; 
                    const b = document.createElement('div'); b.className = "absolute top-1 bottom-1 rounded-sm bg-brand opacity-80 active:bg-white transition-colors"; b.style.left = `${lp}%`; b.style.width = `${Math.max(wp, 1)}%`; 
                    
                    b.addEventListener('touchstart', (e) => {
                        e.preventDefault(); 
                        const timeString = `${ld.getHours()}:${ld.getMinutes().toString().padStart(2, '0')} - ${dur} mins`;
                        showTooltip(e, l.taskTitle || 'Focus Session', timeString);
                        tooltipTimeout = setTimeout(hideTooltip, 2500);
                    });
                    
                    bars.appendChild(b) 
                }); 
                row.appendChild(lbl); row.appendChild(bars); grid.appendChild(row) 
            }
        }

        const r = state.analytics.range; 
        let lbl = [], dpFocus = [], dpTask = [], dlb = r === 'week' ? 7 : (r === 'month' ? 30 : 12); 
        if (r === 'year') { 
            for (let i = 11; i >= 0; i--) { 
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1); lbl.push(d.toLocaleString('default', { month: 'short' })); 
                const mLogs = logs.filter(l => { const ld = parseDate(l.completedAt); return ld && ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear() }); 
                dpFocus.push((mLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
                const mTasks = tasksDone.filter(t => t.completedAt && new Date(t.completedAt).getMonth() === d.getMonth() && new Date(t.completedAt).getFullYear() === d.getFullYear()); 
                dpTask.push(mTasks.length); 
            } 
        } else { 
            for (let i = dlb - 1; i >= 0; i--) { 
                const d = new Date(); d.setDate(now.getDate() - i); const dStr = getDS(d); 
                lbl.push(d.toLocaleDateString('en-US', { weekday: 'short', day: r === 'month' ? 'numeric' : undefined })); 
                const dLogs = logs.filter(l => { const ld = parseDate(l.completedAt); return ld && getDS(ld) === dStr }); 
                dpFocus.push((dLogs.reduce((a, b) => a + (b.duration || 25), 0) / 60).toFixed(1)); 
                const dTasks = tasksDone.filter(t => t.completedAt && t.completedAt.startsWith(dStr)); 
                dpTask.push(dTasks.length); 
            } 
        }

        const createChart = (ctxId, chartKey, data, color, label, instanceKey) => {
            const el = $(ctxId); if(!el) return;
            const ctx = el.getContext('2d');
            const type = state.chartTypes[chartKey];
            const isLine = type === 'line';
            
            const getGradient = (c) => {
                const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, c + '90'); g.addColorStop(1, c + '05'); return g;
            }

            if(state.chartInstances[instanceKey]) state.chartInstances[instanceKey].destroy();
            state.chartInstances[instanceKey] = new Chart(ctx, {
                type: type,
                data: { 
                    labels: lbl, 
                    datasets: [{ 
                        label: label, 
                        data: data, 
                        backgroundColor: isLine ? getGradient(color) : color, 
                        borderColor: color, 
                        borderRadius: 3, 
                        tension: 0.4, 
                        fill: isLine, 
                        pointRadius: isLine ? 0 : 0,
                        pointHoverRadius: 6,
                        borderWidth: isLine ? 2 : 0
                    }] 
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, 
                    plugins: { 
                        legend: { display: false }, 
                        tooltip: { 
                            callbacks: { 
                                title: (context) => `Timeframe: ${context[0].label}`,
                                label: (context) => {
                                    const value = context.raw;
                                    const lbl = context.dataset.label || '';
                                    if (lbl.includes('Tasks') || instanceKey.includes('task')) return `${value} tasks completed`;
                                    if (lbl.includes('Hours') || instanceKey.includes('focus') || instanceKey.includes('Focus')) return `${value} hours of deep focus`;
                                    return `${value} minutes focused`;
                                } 
                            } 
                        } 
                    }, 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, display: true, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 6 } }, 
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#71717a' } } 
                    } 
                }
            });
        };

        createChart('focusBarChart', 'focus', dpFocus, '#ff5757', 'Hours', 'focusBar');
        createChart('taskBarChart', 'task', dpTask, '#3b82f6', 'Tasks', 'taskBar');

        // --- ADD TODAY TIMELINE CHART LOGIC ---
        const todayHours = Array(24).fill(0);
        logsToday.forEach(l => { 
            const d = parseDate(l.completedAt); 
            if (d) todayHours[d.getHours()] += (l.duration || 25); 
        });

        if($('todayTimelineChart')) {
             if(state.chartInstances.todayTimeline) state.chartInstances.todayTimeline.destroy();
             const ctx = $('todayTimelineChart').getContext('2d');
             const getGradient = (c) => { const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, c + '90'); g.addColorStop(1, c + '05'); return g; }
             state.chartInstances.todayTimeline = new Chart(ctx, {
                type: 'line',
                data: { 
                    labels: Array.from({length:24},(_,i)=>i), 
                    datasets: [{ data: todayHours, backgroundColor: getGradient('#8b5cf6'), borderColor: '#8b5cf6', fill: true, borderWidth: 2, pointRadius:0, tension:0.4 }] 
                },
                options: {
                    responsive: true, maintainAspectRatio: false, 
                    plugins: {
                        legend:{display:false}, 
                        tooltip: { 
                            callbacks: { 
                                title: (context) => `Time: ${context[0].label}:00`,
                                label: c => `${c.raw} minutes focused` 
                            } 
                        }
                    },
                    scales: {
                        x: { display: true, grid: { display: false }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 8 } },
                        y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 5 }, beginAtZero: true }
                    }
                }
             });
        }
        // --------------------------------------

        const hours = Array(24).fill(0); logs.forEach(l => { const d = parseDate(l.completedAt); if (d) hours[d.getHours()] += (l.duration || 25) });
        const createHourly = () => {
             const type = state.chartTypes.hourly; const isLine = type === 'line'; const color = '#10b981';
             if(state.chartInstances.hourly) state.chartInstances.hourly.destroy();
             const ctx = $('hourlyChart').getContext('2d');
             const getGradient = (c) => { const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, c + '90'); g.addColorStop(1, c + '05'); return g; }
             state.chartInstances.hourly = new Chart(ctx, { 
                type: type, 
                data: { labels: Array.from({length:24},(_,i)=>i), datasets: [{ data: hours, backgroundColor: isLine ? getGradient(color) : color, borderColor: color, borderRadius: 2, fill: isLine, borderWidth: isLine?2:0, pointRadius:0, tension:0.4 }] }, 
                options: { 
                    responsive: true, maintainAspectRatio: false, 
                    plugins: {
                        legend:{display:false},
                        tooltip: { 
                            callbacks: { 
                                title: (context) => `Hour: ${context[0].label}:00`,
                                label: c => `${c.raw} minutes focused` 
                            } 
                        }
                    }, 
                    scales: {
                        x: { display: true, grid: { display: false }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 8 } },
                        y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 5 } }
                    } 
                } 
             });
        };
        if($('hourlyChart')) createHourly();

        const weekdays = Array(7).fill(0); logs.forEach(l => { const d = parseDate(l.completedAt); if (d) { weekdays[d.getDay() == 0 ? 6 : d.getDay() - 1] += (l.duration || 25) } });
        const createWeekday = () => {
             const type = state.chartTypes.weekday; const isLine = type === 'line'; const color = '#f59e0b';
             if(state.chartInstances.weekday) state.chartInstances.weekday.destroy();
             const ctx = $('weekdayChart').getContext('2d');
             const getGradient = (c) => { const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, c + '90'); g.addColorStop(1, c + '05'); return g; }
             state.chartInstances.weekday = new Chart(ctx, { 
                type: type, 
                data: { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets: [{ data: weekdays, backgroundColor: isLine ? getGradient(color) : color, borderColor: color, borderRadius: 3, fill: isLine, borderWidth: isLine?2:0, pointRadius:0, tension:0.4 }] }, 
                options: { 
                    responsive: true, maintainAspectRatio: false, 
                    plugins: {
                        legend:{display:false},
                        tooltip: { 
                            callbacks: { 
                                title: (context) => `Day: ${context[0].label}`,
                                label: c => `${c.raw} minutes focused` 
                            } 
                        }
                    }, 
                    scales: {
                        x: { grid: { display: false }, ticks: { color: '#71717a', font: { size: 9 } } },
                        y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#71717a', font: { size: 9 }, maxTicksLimit: 5 } }
                    } 
                } 
            });
        };
        if($('weekdayChart')) createWeekday();

        const maxHour = hours.indexOf(Math.max(...hours)); const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const maxDay = weekdays.indexOf(Math.max(...weekdays));
        if($('insight-text')) $('insight-text').textContent = logs.length > 3 ? `You are most productive at ${maxHour}:00 and on ${days[maxDay]}s.` : "Keep tracking to get insights.";

        // --- UNIFIED DOUGHNUT CHART OPTIONS ---
        const doughnutOptions = {
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%', 
            plugins: { 
                legend: { display: false }, 
                tooltip: { 
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

        const pm = {}; logs.forEach(l => { const p = l.project || 'Inbox'; pm[p] = (pm[p] || 0) + (l.duration || 25) }); const sp = Object.entries(pm).sort((a, b) => b[1] - a[1]);
        if($('projectChart')) {
            if (state.chartInstances.project) state.chartInstances.project.destroy();
            state.chartInstances.project = new Chart($('projectChart').getContext('2d'), { 
                type: 'doughnut', 
                data: { labels: sp.map(x => x[0]), datasets: [{ data: sp.map(x => x[1]), backgroundColor: ['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 0 }] }, 
                options: doughnutOptions 
            });
        }
        if($('project-legend')) $('project-legend').innerHTML = sp.map((p,i) => `<div class="flex justify-between items-center"><div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:${['#ff5757', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'][i%5]}"></div><span class="text-text-muted truncate max-w-[80px]">${p[0]}</span></div><span class="text-white font-mono">${Math.round(p[1])}m</span></div>`).join('');

        const pri = { high: 0, med: 0, low: 0, none: 0 }; tasksDone.forEach(t => pri[t.priority || 'none']++);
        if($('priorityChart')) {
            if (state.chartInstances.priority) state.chartInstances.priority.destroy();
            state.chartInstances.priority = new Chart($('priorityChart').getContext('2d'), { 
                type: 'doughnut', 
                data: { labels: ['High', 'Med', 'Low', 'None'], datasets: [{ data: [pri.high, pri.med, pri.low, pri.none], backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#525252'], borderWidth: 0 }] }, 
                options: doughnutOptions 
            });
        }

        const tc = {}; 
        tasksDone.forEach(t => { if (t.tags) t.tags.forEach(g => tc[g] = (tc[g] || 0) + 1) });
        const st = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (st.length > 0) {
            if($('tag-rank-list')) $('tag-rank-list').innerHTML = st.map((x, i) => `<div class="flex items-center justify-between text-xs"><div class="flex items-center"><span class="w-4 text-text-faint mr-2">${i + 1}.</span><span class="text-white bg-dark-active px-2 py-0.5 rounded border border-dark-border">${esc(x[0])}</span></div><span class="text-text-muted">${x[1]} tasks</span></div>`).join('');
        } else {
             if($('tag-rank-list')) $('tag-rank-list').innerHTML = '<p class="text-xs text-text-muted italic">No tags data available.</p>';
        }

        if($('mobile-logs')) $('mobile-logs').innerHTML = logs.slice(0, 20).map(l => { 
            const d = parseDate(l.completedAt) || new Date(); 
            const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            return `<div class="px-4 py-3 flex justify-between items-center text-sm border-b border-dark-border/50 last:border-0">
                <div>
                    <div class="text-white truncate max-w-[150px] font-medium">${esc(l.taskTitle || 'Focus Session')}</div>
                    <div class="flex items-center gap-2 text-[10px] text-text-muted mt-1">
                        <span>${dateStr}</span><span>•</span><span>${timeStr}</span><span>•</span><span>${esc(l.project || 'Inbox')}</span>
                    </div>
                </div>
                <span class="text-brand font-mono">${Math.round(l.duration||25)}m</span>
            </div>` 
        }).join('');
    },
    
    openTaskDetail: (t) => {
        haptic('light');
        history.pushState({ modal: 'detail' }, '');

        state.viewingTask = t;
        $('dt-title').textContent = t.title;
        $('dt-project').textContent = t.project || 'Inbox';
        
        const total = parseInt(t.estimatedPomos) || 1;
        const completed = t.completedSessionIds ? t.completedSessionIds.length : 0;
        const left = Math.max(0, total - completed);
        const dur = parseInt(t.pomoDuration) || 25;
        
        const timeTotal = total * dur;
        const timeSpent = completed * dur;
        const timeLeft = left * dur;

        const fmtTime = m => {
             const h = Math.floor(m/60);
             const rem = m%60;
             return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
        };

        $('dt-pomo-done').textContent = completed;
        $('dt-pomo-total').textContent = total;
        $('dt-pomo-left').textContent = left;
        $('dt-time-spent').textContent = fmtTime(timeSpent);
        $('dt-time-left').textContent = fmtTime(timeLeft);
        $('dt-time-total').textContent = fmtTime(timeTotal);
        $('dt-date').textContent = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'No Date';

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

    closeDetailSheet: () => { history.back(); },
    startFocusFromDetail: () => {
        if(state.viewingTask) {
            app.startFocus(state.viewingTask.id);
            $('detail-sheet').classList.add('translate-y-full');
            $('modal-overlay').classList.add('opacity-0');
            setTimeout(() => { $('modal-overlay').classList.add('hidden'); }, 300);
        }
    },

    editCurrentTask: () => {
        if(state.viewingTask) {
            const t = state.viewingTask;
            $('detail-sheet').classList.add('translate-y-full');
            setTimeout(() => app.openTaskModal(t), 300);
        }
    },

    deleteCurrentTask: async () => {
        if(state.viewingTask && confirm('Delete this task?')) {
            haptic('heavy');
            try {
                await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', state.viewingTask.id));
                history.back(); 
                app.showToast('Task deleted');
            } catch(e) { app.showToast('Error deleting'); }
        }
    },

    openTaskModal: (task = null) => {
        haptic('light');
        history.pushState({ modal: 'form' }, '');

        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}

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
            $('inp-est').value = task.estimatedPomos || 1;
            $('disp-est').textContent = task.estimatedPomos || 1;
            $('inp-duration').value = task.pomoDuration || 25;
            app.updateDurationDisplay(task.pomoDuration || 25);

            $('inp-date').value = task.dueDate || '';
            $('inp-project').value = task.project || 'Inbox';
            app.setPriority(task.priority || 'none');
            app.highlightDateButton(task.dueDate);

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
            $('inp-est').value = 1;
            $('disp-est').textContent = 1;
            $('inp-duration').value = 25;
            app.updateDurationDisplay(25);

            $('inp-date').value = getDayStr(getISTNow());
            app.highlightDateButton(getDayStr(getISTNow()));
            
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
            if(!task) $('inp-title').focus();
        }, 10);
    },

    setQuickDate: (type) => {
        haptic('light');
        const d = getISTNow();
        if(type === 'tomorrow') d.setDate(d.getDate() + 1);
        const str = getDayStr(d);
        $('inp-date').value = str;
        app.highlightDateButton(str);
    },

    highlightDateButton: (dateStr) => {
        const todayDate = getISTNow();
        const today = getDayStr(todayDate);
        const tmrw = getISTNow(); 
        tmrw.setDate(tmrw.getDate() + 1);
        const tmrwStr = getDayStr(tmrw);
        const setBtn = (id, active) => { $(id).className = active ? "flex-1 py-2 rounded-lg bg-brand text-white border border-brand text-xs font-bold shadow-md transition-all" : "flex-1 py-2 rounded-lg bg-dark-card border border-dark-border text-xs font-medium text-text-muted transition-all active:scale-95"; };
        setBtn('btn-date-today', dateStr === today);
        setBtn('btn-date-tomorrow', dateStr === tmrwStr);
        if(dateStr && dateStr !== today && dateStr !== tmrwStr) {
            const d = new Date(dateStr);
            $('lbl-date-pick').textContent = d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
            $('btn-date-pick').classList.add('text-brand', 'border-brand');
        } else {
            $('lbl-date-pick').textContent = 'Pick';
            $('btn-date-pick').classList.remove('text-brand', 'border-brand');
        }
    },

    setPriority: (level) => {
        haptic('light');
        $('inp-priority').value = level;
        ['none', 'low', 'med', 'high'].forEach(l => {
            const btn = $(`btn-pri-${l}`);
            const isActive = l === level;
            btn.className = "h-9 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1 active:scale-95 ";
            if(isActive) {
                btn.className += "border-transparent text-white shadow-md ";
                if(l === 'high') btn.className += "bg-red-500";
                else if(l === 'med') btn.className += "bg-yellow-500";
                else if(l === 'low') btn.className += "bg-blue-500";
                else btn.className += "bg-brand";
            } else {
                btn.className += "border-dark-border bg-dark-card ";
                if(l === 'high') btn.className += "text-red-500";
                else if(l === 'med') btn.className += "text-yellow-500";
                else if(l === 'low') btn.className += "text-blue-500";
                else btn.className += "text-text-muted";
            }
        });
    },

    adjustEst: (delta) => {
        haptic('light');
        let val = parseInt($('inp-est').value) || 1;
        val += delta;
        if(val < 1) val = 1; if(val > 50) val = 50; 
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

    addSubtaskInput: (val = '') => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 animate-slide-up group pl-1';
        div.innerHTML = `
            <div class="w-1.5 h-1.5 rounded-full bg-dark-border group-focus-within:bg-brand transition-colors shrink-0"></div>
            <input type="text" value="${esc(val)}" class="subtask-input w-full bg-transparent border-b border-dark-border focus:border-brand text-sm text-white py-1.5 outline-none transition-colors" placeholder="Checklist item..." onkeydown="app.handleSubtaskKey(event, this)">
            <button onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-500 px-2"><i class="ph-bold ph-x"></i></button>
        `;
        $('subtask-list').appendChild(div);
        if(!val) div.querySelector('input').focus();
    },

    handleSubtaskKey: (e, input) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            app.addSubtaskInput();
        }
    },
    
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

        history.back();
        
        try {
            if(state.editingId) {
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', state.editingId), data);
                haptic('success');
                app.showToast('Task updated');
            } else {
                await addDoc(collection(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks'), {
                    ...data,
                    status: 'todo',
                    createdAt: new Date().toISOString(),
                    completedSessionIds: []
                });
                haptic('success');
                app.showToast('Task added');
            }
        } catch(e) { app.showToast('Error saving'); }
    },
    
    closeTaskModal: () => { history.back(); },
    
    closeAllSheets: () => {
        if(!$('modal-overlay').classList.contains('hidden')) history.back();
    },

    toggleStatus: async (id, s) => {
        haptic('light');
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'tasks', id), { 
                status: s === 'todo' ? 'done' : 'todo',
                completedAt: s === 'todo' ? new Date().toISOString() : null
            });
        } catch(e) { app.showToast("Connection error"); }
    },

    startFocus: async (id) => {
        const t = state.tasks.find(x => x.id === id);
        if(!t) return;
        haptic('medium');
        app.switchTab('timer');
        
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}

        if(state.timer.taskId === id && state.timer.status === 'running') return;

        const durationMin = t.pomoDuration || state.timer.settings.focus;
        const d = durationMin * 60;
        const sessionId = `${t.id}_${Date.now()}`;
        const endTimeMs = Date.now() + d * 1000;
        
        setBackgroundAlarm(endTimeMs, 'focus', t.title);

        await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
            status: 'running', 
            mode: 'focus', 
            taskId: t.id, 
            sessionId: sessionId,
            remaining: d, 
            totalDuration: d, 
            endTime: new Date(endTimeMs),
            initiatorId: INSTANCE_ID
        });
        
        app.updateSetting('focus', durationMin);
        app.unlockAudio(); 
    },

    toggleTimer: async () => {
        haptic('medium');
        app.unlockAudio(); 
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(e){}
        
        if(state.timer.status === 'running') {
            if(state.timer.settings.strictMode && state.timer.mode === 'focus' && !confirm("Strict Mode active! Quit?")) return;
            
            clearBackgroundAlarm();
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
                status: 'paused', endTime: null, remaining: Math.max(0, Math.ceil((state.timer.endTime - Date.now()) / 1000))
            });
        } else {
            if(!state.timer.taskId && state.timer.mode === 'focus') { app.showToast('Select a task'); app.switchTab('tasks'); return; }
            
            const endTimeMs = Date.now() + state.timer.remaining * 1000;
            const activeTask = state.timer.taskId ? state.tasks.find(x => x.id === state.timer.taskId) : null;
            setBackgroundAlarm(endTimeMs, state.timer.mode, activeTask ? activeTask.title : 'Focus');

            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
                status: 'running', endTime: new Date(endTimeMs), initiatorId: INSTANCE_ID
            });
        }
    },

    resetTimer: async (r = false) => {
        if (!r) {
            haptic('medium');
            clearBackgroundAlarm();
            const d = state.timer.settings[state.timer.mode] * 60;
            await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
                status: 'idle', remaining: d, totalDuration: d, endTime: null, mode: state.timer.mode, taskId: state.timer.taskId || null
            });
        }
    },

    skipTimer: () => app.completeTimer(true),

    completeTimer: async (isManual = false) => {
        if(state.timer.status === 'idle') return;

        if (!isManual && state.timer.initiatorId && state.timer.initiatorId !== INSTANCE_ID) {
            stopTimerLoop();
            return;
        }

        stopTimerLoop();
        clearBackgroundAlarm();
        haptic('timerDone');
        
        try {
            if(state.audioContext) {
                 const o = state.audioContext.createOscillator();
                 const g = state.audioContext.createGain();
                 o.connect(g); g.connect(state.audioContext.destination);
                 o.frequency.value = 523.25; 
                 o.start(); o.stop(state.audioContext.currentTime + 0.5);
            }
        } catch(e) {}
        
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Timer Complete", { icon: ASSETS.icon }); } catch (e) {}

        if(state.timer.mode === 'focus') {
            if(state.timer.taskId) {
                const t = state.tasks.find(x => x.id === state.timer.taskId);
                if(t) {
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
                                    app.toggleStatus(t.id, 'todo'); 
                                    app.showToast("Task marked as done!");
                                }
                            }, 800); 
                        }

                    } catch(e) { console.error(e); }
                }
            }
            
            if (state.timer.settings.disableBreak) {
                await app.setTimerMode('focus'); 
                if (state.timer.settings.autoStartPomo) app.toggleTimer();
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
        const updates = { status: 'idle', mode: m, remaining: v * 60, totalDuration: v * 60, endTime: null, taskId: state.timer.taskId || null, sessionId: null };
        if (sessionCount !== null) updates.sessionCount = sessionCount;
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), updates);
    },

    updateTimerUI: () => {
        const { status, endTime, remaining, totalDuration, taskId, mode } = state.timer;
        const s = status === 'running' && endTime ? Math.max(0, Math.ceil((endTime - Date.now()) / 1000)) : remaining;
        const m = Math.floor(s/60), sc = s%60;
        
        if($('timer-display')) $('timer-display').textContent = `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
        if($('timer-mode')) {
            $('timer-mode').textContent = mode === 'focus' ? 'FOCUS' : mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK';
            $('timer-mode').className = `text-xs font-bold tracking-widest uppercase mt-3 ${mode==='focus'?'text-brand':'text-blue-500'}`;
        }
        
        const offset = 283 * (1 - (s / (totalDuration || 1)));
        if($('timer-progress')) {
            $('timer-progress').style.strokeDashoffset = isNaN(offset) ? 0 : offset;
            $('timer-progress').style.stroke = mode === 'focus' ? '#ff5757' : '#3b82f6';
        }

        if(taskId && mode === 'focus') {
            const t = state.tasks.find(x => x.id === taskId);
            if(t) {
                if($('focus-empty')) $('focus-empty').classList.add('hidden');
                if($('focus-active')) $('focus-active').classList.remove('hidden');
                if($('timer-task-title')) $('timer-task-title').innerHTML = `${esc(t.title)} <i class="ph-bold ph-caret-down text-sm text-text-muted ml-0.5"></i>`;
                if($('timer-badge')) $('timer-badge').textContent = t.project || 'Inbox';
                if($('timer-completed')) $('timer-completed').textContent = t.completedSessionIds ? t.completedSessionIds.length : 0;
                if($('timer-total')) $('timer-total').textContent = t.estimatedPomos || 1;
                document.title = `${m}:${sc.toString().padStart(2,'0')} - ${t.title}`;
            }
        } else if (mode !== 'focus') {
            if($('focus-empty')) { 
                $('focus-empty').classList.remove('hidden'); 
                const breakType = mode === 'short' ? 'Short Break' : 'Long Break';
                
                $('focus-empty').className = "text-center mb-6 block w-full"; 
                $('focus-empty').onclick = null;
                $('focus-empty').innerHTML = `<span class="text-blue-400 font-bold tracking-wide uppercase text-sm block mb-1">${breakType}</span><span class="text-xs text-text-muted">Time to rest your mind</span>`; 
            }
            if($('focus-active')) $('focus-active').classList.add('hidden');
            document.title = `${m}:${sc.toString().padStart(2,'0')} - Break`;
        } else {
             if($('focus-empty')) { 
                 $('focus-empty').classList.remove('hidden'); 
                 
                 $('focus-empty').className = "flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-dark-card border border-dark-border rounded-full text-text-muted text-sm hover:text-white transition-colors animate-pulse mb-6 active:scale-95 shadow-sm";
                 $('focus-empty').onclick = app.openTaskSelectSheet;
                 $('focus-empty').innerHTML = `<i class="ph-bold ph-list-dashes text-lg"></i> Select a Task to Focus <i class="ph-bold ph-caret-down text-xs ml-1"></i>`; 
             }
             if($('focus-active')) $('focus-active').classList.add('hidden');
             document.title = "TimeTrekker";
        }
    },

    setSound: (t) => {
        state.sound = t;
        saveLocalState(); 
        const audio = $('audio-player');
        if(audio) audio.src = ASSETS.sounds[t];
        ['none','rain','cafe','forest'].forEach(x => {
            if($(`btn-sound-${x}`)) $(`btn-sound-${x}`).className = x===t ? 'text-brand p-1' : 'text-text-muted hover:text-white transition-colors p-1';
        });
        if(state.timer.status === 'running' && t !== 'none') {
            app.unlockAudio(); 
            audio.play().catch(()=>{});
        }
        else audio.pause();
    },

    toggleSettingBtn: (key, btn) => {
        haptic('light');
        const newState = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', newState);
        app.updateSetting(key, newState);
    },

    _saveSetting: debounce((uid, k, v) => {
         updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'timer', 'active'), { [k]: v }).catch(()=>{});
    }, 500),

    updateSetting: (k, v) => {
        const val = ['strictMode','autoStartPomo','autoStartBreak','disableBreak'].includes(k) ? v : parseInt(v);
        state.timer.settings[k] = val;
        saveLocalState(); 
        
        if($('set-focus-display')) $('set-focus-display').innerText = state.timer.settings.focus + 'm';
        if($('set-short-display')) $('set-short-display').innerText = state.timer.settings.short + 'm';
        if($('set-long-display')) $('set-long-display').innerText = state.timer.settings.long + 'm';
        if($('set-long-interval-display')) $('set-long-interval-display').innerText = state.timer.settings.longBreakInterval + 'x';
        
        if(state.user) app._saveSetting(getUid(), k, val);
    },

    showToast: (msg) => {
        const t = document.createElement('div');
        t.className = "bg-dark-active border border-dark-border text-white text-xs font-bold px-4 py-3 rounded-lg shadow-xl text-center animate-slide-up backdrop-blur";
        t.textContent = msg;
        $('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },

    signOut: () => signOut(auth).then(() => window.location.href = 'https://stack-base.github.io/account/login?redirectUrl=' + encodeURIComponent(window.location.href)),

    openTaskSelectSheet: () => {
        haptic('light');
        history.pushState({ modal: 'taskSelect' }, '');

        const list = $('task-select-list');
        list.innerHTML = '';

        const todos = state.tasks.filter(t => t.status === 'todo');
        if (todos.length === 0) {
            list.innerHTML = '<div class="p-8 text-center text-text-muted text-sm border border-dashed border-dark-border rounded-xl">No active tasks available.<br>Add some tasks first!</div>';
        } else {
            todos.forEach(t => {
                const isActive = state.timer.taskId === t.id;
                const el = document.createElement('button');
                el.className = `w-full text-left p-4 rounded-xl flex items-center justify-between transition-colors active:scale-95 border ${isActive ? 'bg-brand/10 border-brand/30' : 'bg-dark-card border-dark-border hover:bg-dark-active'}`;
                el.onclick = () => app.selectTimerTask(t.id);
                el.innerHTML = `
                    <div class="flex-1 min-w-0 pr-4">
                        <div class="text-sm font-bold truncate ${isActive ? 'text-brand' : 'text-white'}">${esc(t.title)}</div>
                        <div class="text-[10px] text-text-muted mt-1 uppercase tracking-wide font-medium">
                            <i class="ph-bold ph-folder mr-0.5"></i> ${esc(t.project || 'Inbox')} &nbsp;•&nbsp; 
                            <i class="ph-bold ph-check-circle mr-0.5"></i> ${t.completedSessionIds ? t.completedSessionIds.length : 0}/${t.estimatedPomos || 1} Pomos
                        </div>
                    </div>
                    ${isActive ? '<i class="ph-fill ph-check-circle text-brand text-xl shadow-lg shadow-brand/20 rounded-full"></i>' : '<div class="w-5 h-5 rounded-full border-2 border-text-muted/50"></div>'}
                `;
                list.appendChild(el);
            });
        }

        $('modal-overlay').classList.remove('hidden');
        setTimeout(() => {
            $('modal-overlay').classList.remove('opacity-0');
            $('task-select-sheet').classList.remove('translate-y-full');
        }, 10);
    },

    closeTaskSelectSheet: () => { history.back(); },

    selectTimerTask: async (taskId) => {
        haptic('medium');
        history.back(); 
        
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', getUid(), 'timer', 'active'), {
                taskId: taskId
            });
            app.showToast('Task updated');
        } catch(e) {
            app.showToast('Error selecting task');
        }
    }
};

$('prompt-cancel-btn').addEventListener('click', () => app.closePrompt(null));
$('prompt-confirm-btn').addEventListener('click', () => app.closePrompt(app.customPrompt.input.value));
$('prompt-input').addEventListener('keypress', e => { if (e.key === 'Enter') app.closePrompt(app.customPrompt.input.value); });
document.addEventListener('click', (e) => { if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); });

if (!history.state) history.replaceState({ view: 'root' }, '');
window.addEventListener('popstate', (e) => {
    if (!$('task-select-sheet').classList.contains('translate-y-full')) { 
        $('task-select-sheet').classList.add('translate-y-full');
        $('modal-overlay').classList.add('opacity-0');
        setTimeout(() => { $('modal-overlay').classList.add('hidden'); }, 300);
        return; 
    }
    if (!$('modal-sheet').classList.contains('translate-y-full')) { 
        $('modal-sheet').classList.add('translate-y-full');
        $('modal-overlay').classList.add('opacity-0');
        setTimeout(() => { $('modal-overlay').classList.add('hidden'); state.editingId = null; }, 300);
        return; 
    }
    if (!$('detail-sheet').classList.contains('translate-y-full')) { 
        $('detail-sheet').classList.add('translate-y-full');
        $('modal-overlay').classList.add('opacity-0');
        setTimeout(() => { $('modal-overlay').classList.add('hidden'); state.viewingTask = null; }, 300);
        return; 
    }
    if (!$('project-sheet').classList.contains('translate-y-full')) { 
        $('project-sheet').classList.add('translate-y-full');
        $('modal-overlay').classList.add('opacity-0');
        setTimeout(() => { $('modal-overlay').classList.add('hidden'); }, 300);
        return; 
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view') || 'tasks';
    app.switchTab(view, false);
});

window.app = app;

const validTabs = ['tasks', 'timer', 'analytics', 'settings'];
const urlParams = new URLSearchParams(window.location.search);
const viewParam = urlParams.get('view') || 'today';

let initialTab = 'tasks';
let initialFilter = 'today';

if (validTabs.includes(viewParam)) {
    initialTab = viewParam;
} else {
    initialTab = 'tasks';
    initialFilter = viewParam;
}

app.switchTab(initialTab, false);
if (initialTab === 'tasks') {
    app.setFilter(initialFilter);
}