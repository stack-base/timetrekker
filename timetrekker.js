import{initializeApp}from'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import{getAuth,onAuthStateChanged,signOut}from'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import{getFirestore,collection,addDoc,updateDoc,deleteDoc,doc,setDoc,getDoc,onSnapshot,query,where,getDocs,writeBatch,orderBy,serverTimestamp,enableIndexedDbPersistence}from'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const C={apiKey:"AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U",authDomain:"timetrekker-app.firebaseapp.com",projectId:"timetrekker-app",storageBucket:"timetrekker-app.firebasestorage.app",messagingSenderId:"83185163190",appId:"1:83185163190:web:e2974c5d0f0274fe5e3f17",measurementId:"G-FLZ02E1Y5L"};
const appId='timetrekker-v1';

const fb=initializeApp(C);
const auth=getAuth(fb);
const db=getFirestore(fb);
try { enableIndexedDbPersistence(db).catch((err) => { console.warn('Persistence disabled', err.code); }); } catch(e){}

const D=document,$=id=>D.getElementById(id);
const esc = (str) => { if (!str) return ''; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; };

// --- STATE MANAGEMENT ---
const state = {
    user: null, tasks: [], logs: [], projects: new Set(['Inbox', 'Work', 'Personal', 'Study']),
    view: 'today', filterProject: null, selectedTaskId: null, editingTaskId: null,
    
    // UPDATED TIMER STATE
    timer: {
        mode: 'focus', status: 'idle', endTime: null, remaining: 1500, totalDuration: 1500, activeTaskId: null, interval: null,
        pomoCountCurrentSession: 0, 
        settings: {
            focus: 25, short: 5, long: 15, strictMode: false,
            longBreakInterval: 4,  // NEW
            autoStartPomo: false,  // NEW
            autoStartBreak: false, // NEW
            disableBreak: false    // NEW
        }
    },
    newEst: 1, sound: 'none',
    charts: { focusBar: null, taskBar: null, project: null, hourly: null, weekday: null, priority: null },
    chartTypes: { focus: 'bar', task: 'bar', hourly: 'bar', weekday: 'bar' },
    analytics: { range: 'week', metric: 'time' },
    lastCheckTime: null
};

const sounds={none:'',rain:'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',cafe:'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',forest:'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg'};
const els={taskList:$('task-list'),taskViewContainer:$('task-view-container'),analyticsViewContainer:$('analytics-view-container'),pageTitle:$('page-title'),emptyState:$('empty-state'),modal:$('add-task-modal'),modalPanel:$('add-task-panel'),modalTitle:$('modal-title'),saveTaskBtn:$('save-task-btn'),estDisplay:$('est-display'),dateInput:$('task-date'),timerDisplay:$('timer-display'),timerProgress:$('timer-progress'),timerMode:$('timer-mode'),playIcon:$('play-icon'),focusActive:$('focus-active'),focusEmpty:$('focus-empty'),focusTitle:$('focus-task-title'),focusProject:$('focus-project-badge'),focusCompleted:$('focus-completed'),focusTotal:$('focus-total'),timerPanel:$('timer-panel'),navCounts:{all:$('count-all'),today:$('count-today'),tomorrow:$('count-tomorrow'),upcoming:$('count-upcoming'),past:$('count-past')},
stats:{pomosToday:$('stat-pomos-today'),tasksToday:$('stat-tasks-today'),estRemain:$('stat-est-remaining'),focusTime:$('stat-focus-time'),tasksRemain:$('stat-tasks-remaining'),estTime:$('stat-est-time')},
analytics:{
    timeTotal:$('ana-time-total'),timeWeek:$('ana-time-week'),timeToday:$('ana-time-today'),
    taskTotal:$('ana-task-total'),taskWeek:$('ana-task-week'),taskToday:$('ana-task-today'),
    completionRate:$('ana-completion-rate'),avgSession:$('ana-avg-session'),
    earlyBird:$('ana-early-bird'),nightOwl:$('ana-night-owl'),streakDays:$('ana-streak-days'),
    projectCount:$('ana-project-count'),insightText:$('insight-text'),
    timelineGrid:$('pomo-timeline-grid'),focusBarChart:$('focusBarChart'),taskBarChart:$('taskBarChart'),
    projectChart:$('projectChart'),hourlyChart:$('hourlyChart'),weekdayChart:$('weekdayChart'),priorityChart:$('priorityChart'),
    projList:$('project-rank-list'),tagList:$('tag-rank-list'),sessionLogBody:$('session-log-body')
},projectList:$('project-list'),subtasksContainer:$('subtasks-container'),audio:$('audio-player'),currentDate:$('current-date-display'),sidebarOverlay:$('sidebar-overlay'),sidebar:$('sidebar'),headerActions:$('header-actions'),
settingsModal:$('global-settings-modal'),settingsPanel:$('settings-panel'),settingsTitle:$('settings-view-title'),strictToggle:$('strict-mode-toggle'),
settingsAvatar:$('settings-avatar'),settingsName:$('settings-name'),settingsEmail:$('settings-email'),
// New Task Elements
taskPomoDisplay:$('task-pomo-display'),totalTimeCalc:$('total-time-calc'),taskRepeat:$('task-repeat'),taskReminder:$('task-reminder')
};

Chart.defaults.font.family='Inter';
Chart.defaults.color='#a3a3a3';
Chart.defaults.borderColor='#333333';
Chart.defaults.scale.grid.color='rgba(255,255,255,0.03)';
Chart.defaults.plugins.tooltip.backgroundColor='rgba(0, 0, 0, 0.95)';
Chart.defaults.plugins.tooltip.titleColor='#fff';
Chart.defaults.plugins.tooltip.bodyColor='#a3a3a3';
Chart.defaults.plugins.tooltip.borderColor='#333';
Chart.defaults.plugins.tooltip.borderWidth=1;

// --- NEW FUNCTION TO SYNC USER PROFILE ---
async function syncUserProfile(u) {
    if (!u) return;
    try {
        const userRef = doc(db, 'artifacts', appId, 'users', u.uid);
        const userSnap = await getDoc(userRef);

        // We update if the doc doesn't exist OR to keep data fresh (e.g. changed profile pic)
        // Using setDoc with merge:true ensures we don't overwrite existing custom fields if you add them later
        const profileData = {
            displayName: u.displayName || u.email.split('@')[0],
            email: u.email,
            photoURL: u.photoURL,
            providerId: u.providerData.length > 0 ? u.providerData[0].providerId : 'password',
            lastLogin: serverTimestamp(),
            uid: u.uid // Store UID inside document for easier searching
        };

        if (!userSnap.exists()) {
            console.log('Creating new user profile in Firestore...');
            await setDoc(userRef, { ...profileData, createdAt: serverTimestamp() });
        } else {
            // Optional: Update lastLogin every time they visit
            await setDoc(userRef, profileData, { merge: true });
        }
    } catch (e) {
        console.error("Error syncing user profile:", e);
    }
}

onAuthStateChanged(auth, u => {
    if(u){
        state.user=u;
        
        // TRIGGER SYNC HERE
        syncUserProfile(u);

        const p=$('user-profile-display');
        if(p){
            p.classList.remove('hidden');p.classList.add('flex');
            $('user-name-text').textContent=u.displayName||u.email.split('@')[0];
            $('user-email-text').textContent=u.email;
            $('user-avatar-initials').textContent=(u.displayName||u.email).charAt(0).toUpperCase();
            els.settingsName.textContent=u.displayName||u.email.split('@')[0];
            els.settingsEmail.textContent=u.email;
            els.settingsAvatar.textContent=(u.displayName||u.email).charAt(0).toUpperCase();
        }
        subTasks(u.uid);
        subLogs(u.uid);
        subTimer(u.uid);
        els.currentDate.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
        
        // Reminder Check Loop - FIXED FOR ANDROID WEBVIEW
        setInterval(() => {
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (state.lastCheckTime !== currentTime) {
                state.lastCheckTime = currentTime;
                if('Notification' in window && Notification.permission === 'granted'){
                     const todayStr = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
                     state.tasks.forEach(t => {
                        if (t.status === 'todo' && t.reminder === currentTime && (t.dueDate === todayStr || !t.dueDate)) {
                            try{new Notification(`Reminder: ${t.title}`, { body: "It's time for your task.", icon: 'https://stack-base.github.io/media/brand/stackbase/stackbase-icon.png' });}catch(e){}
                        }
                    });
                }
            }
        }, 10000); // Check every 10s to ensure we catch the minute change

    } else {
        window.location.href='https://stack-base.github.io/account/login.html?redirectUrl=https://stack-base.github.io/timetrekker/application';
    }
});

const subTasks=uid=>onSnapshot(collection(db,'artifacts',appId,'users',uid,'tasks'), s=>{
    const t=[], p=new Set(['Inbox','Work','Personal','Study']);
    s.forEach(d=>{ const x=d.data(); t.push({id:d.id,...x}); if(x.project && x.project!=='Inbox') p.add(x.project); });
    state.tasks=t; state.projects=p; updateProjectsUI(); updateCounts(); renderTasks();
    if(state.timer.activeTaskId) updateTimerUI(t.find(x=>x.id===state.timer.activeTaskId));
    if(state.view==='analytics') updateAnalytics();
});

const subTimer = uid => onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'timer', 'active'), s => {
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
            pomoCountCurrentSession: d.sessionCount || 0 // NEW: Load session count
        };
        app.setTimerModeUI(state.timer.mode);
        if (state.timer.activeTaskId) { state.selectedTaskId = state.timer.activeTaskId; updateTimerUI(state.tasks.find(x => x.id === state.timer.activeTaskId)); } else updateTimerUI(null);
        if (state.timer.status === 'running') { startLocalInterval(); updateTimerVisuals(); if (state.sound !== 'none' && els.audio.paused) els.audio.play().catch(e => { }); } else { stopLocalInterval(); updateTimerVisuals(); if (!els.audio.paused) els.audio.pause(); }
    } else app.resetTimer(true);
});

const subLogs=uid=>onSnapshot(query(collection(db,'artifacts',appId,'users',uid,'focus_sessions')), s=>{
    const l=[]; s.forEach(d=>l.push({id:d.id,...d.data()})); l.sort((a,b)=>(b.completedAt?.seconds||0)-(a.completedAt?.seconds||0)); state.logs=l;
    if(state.view==='analytics') updateAnalytics();
});

const startLocalInterval=()=>{ if(state.timer.interval) clearInterval(state.timer.interval); state.timer.interval=setInterval(()=>{ updateTimerVisuals(); if(state.timer.status==='running'&&state.timer.endTime&&Date.now()>=state.timer.endTime) app.completeTimer(); },100); els.playIcon.className="ph-fill ph-pause text-3xl ml-1"; };
const stopLocalInterval=()=>{ if(state.timer.interval) clearInterval(state.timer.interval); state.timer.interval=null; els.playIcon.className="ph-fill ph-play text-3xl ml-1"; };
const updateTimerVisuals=()=>{
    const{status,endTime,remaining,totalDuration}=state.timer;
    const s=status==='running'&&endTime?Math.max(0,Math.ceil((endTime-Date.now())/1000)):remaining;
    const m=Math.floor(s/60), sc=s%60;
    els.timerDisplay.textContent=`${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
    els.timerProgress.style.strokeDashoffset=289*(1-(s/(totalDuration||1)));
    D.title=`${m}:${sc.toString().padStart(2,'0')} - TimeTrekker`;
};

const app={
    customPrompt:{resolve:null,el:$('custom-prompt-modal'),input:$('prompt-input'),title:$('prompt-title')},
    showPrompt:(t,v='')=>new Promise(r=>{const p=app.customPrompt;p.resolve=r;p.title.textContent=t;p.input.value=v;p.el.classList.remove('hidden');setTimeout(()=>p.el.classList.remove('opacity-0'),10);p.input.focus()}),
    closePrompt:v=>{const p=app.customPrompt;p.el.classList.add('opacity-0');setTimeout(()=>{p.el.classList.add('hidden');if(p.resolve)p.resolve(v);p.resolve=null},200)},
    setView:v=>{state.view=v;state.filterProject=null;els.pageTitle.textContent=(v==='all'?'All Tasks':v.charAt(0).toUpperCase()+v.slice(1));updateNavStyles(v);app.toggleSidebar(false);if(v==='analytics'){els.taskViewContainer.classList.add('hidden');els.analyticsViewContainer.classList.remove('hidden');els.headerActions.classList.add('invisible');updateAnalytics()}else{els.taskViewContainer.classList.remove('hidden');els.analyticsViewContainer.classList.add('hidden');els.headerActions.classList.remove('invisible');renderTasks();updateCounts()}},
    setProjectView:p=>{state.view='project';state.filterProject=p;els.pageTitle.textContent=p;updateNavStyles('project',p);app.toggleSidebar(false);els.taskViewContainer.classList.remove('hidden');els.analyticsViewContainer.classList.add('hidden');els.headerActions.classList.remove('invisible');renderTasks();updateCounts()},
    setRange:r=>{state.analytics.range=r;['week','month','year'].forEach(k=>{$(`btn-range-${k}`).className=k===r?"px-4 py-1.5 rounded text-xs font-medium bg-brand text-white shadow-sm transition-all":"px-4 py-1.5 rounded text-xs font-medium text-text-muted hover:text-white transition-all"});updateAnalytics()},
    toggleChartType:(k,t)=>{state.chartTypes[k]=t;['bar','line'].forEach(x=>{$(`btn-${k}-${x}`).classList.toggle('active',x===t)});updateAnalytics()},
    toggleFocusPanel:f=>{const p=els.timerPanel,i=!p.classList.contains('translate-x-full');(f!==null?f:!i)?p.classList.remove('translate-x-full'):p.classList.add('translate-x-full')},
    toggleSidebar:f=>{const s=els.sidebar,o=els.sidebarOverlay,h=s.classList.contains('-translate-x-full'),show=(typeof f==='boolean')?f:h;if(show){s.classList.remove('-translate-x-full');o.classList.remove('hidden');requestAnimationFrame(()=>o.classList.remove('opacity-0'))}else{s.classList.add('-translate-x-full');o.classList.add('opacity-0');setTimeout(()=>o.classList.add('hidden'),300)}},
    promptNewProject:async()=>{const n=await app.showPrompt("Enter project name:");if(n){state.projects.add(n);updateProjectsUI()}},
    renameProject:async(o,e)=>{e.stopPropagation();const n=await app.showPrompt(`Rename "${o}" to:`,o);if(!n||n===o)return;const b=writeBatch(db);(await getDocs(query(collection(db,'artifacts',appId,'users',state.user.uid,'tasks'),where("project","==",o)))).forEach(d=>b.update(d.ref,{project:n}));await b.commit();state.projects.delete(o);state.projects.add(n);state.filterProject===o?app.setProjectView(n):updateProjectsUI()},
    deleteProject:async(p,e)=>{e.stopPropagation();if(!confirm(`Delete "${p}"?`))return;const b=writeBatch(db);(await getDocs(query(collection(db,'artifacts',appId,'users',state.user.uid,'tasks'),where("project","==",p)))).forEach(d=>b.update(d.ref,{project:'Inbox'}));await b.commit();state.projects.delete(p);state.filterProject===p?app.setView('today'):updateProjectsUI()},
    addSubtaskUI:(v='')=>{const d=D.createElement('div');d.className='flex items-center space-x-2 animate-fade-in';d.innerHTML=`<div class="w-1.5 h-1.5 rounded-full bg-brand shrink-0"></div><input type="text" class="subtask-input flex-1 bg-transparent border-b border-dark-border focus:border-brand text-sm text-white py-1 outline-none transition-colors" placeholder="Subtask..." value="${esc(v)}"><button type="button" onclick="this.parentElement.remove()" class="text-text-muted hover:text-red-400"><i class="ph-bold ph-x"></i></button>`;els.subtasksContainer.appendChild(d)},
    toggleDropdown:t=>{const d=$(`${t}-options`);D.querySelectorAll('[id$="-options"]').forEach(x=>{if(x.id!==`${t}-options`)x.classList.add('hidden')});d.classList.toggle('hidden');if(!d.classList.contains('hidden'))d.classList.add('animate-fade-in')},
    selectOption:(t,v,d)=>{$(`selected-${t}`).innerText=d;$(`task-${t}`).value=v;$(`${t}-options`).classList.add('hidden')},
    
    // --- FIXED FOR ANDROID WEBVIEW ---
    toggleAddTaskModal:(t=null)=>{
        try { if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{}); } catch(e){}
        if(els.modal.classList.contains('hidden')){els.subtasksContainer.innerHTML='';const po=$('project-options');po.innerHTML='';state.projects.forEach(p=>{const b=D.createElement('button');b.type='button';b.onclick=()=>app.selectOption('project',p,p);b.className="w-full text-left px-3 py-2 text-sm text-text-muted hover:bg-dark-hover hover:text-white transition-colors flex items-center";b.innerHTML=`<i class="ph-bold ph-folder mr-2"></i> ${esc(p)}`;po.appendChild(b)});if(t){state.editingTaskId=t.id;els.modalTitle.innerText="Edit Task";els.saveTaskBtn.innerText="Save Changes";$('task-title').value=t.title;$('task-note').value=t.note||'';$('task-tags').value=t.tags?t.tags.join(', '):'';state.newEst=t.estimatedPomos||1;els.estDisplay.innerText=state.newEst;els.taskPomoDisplay.innerText=t.pomoDuration||25;els.dateInput.value=t.dueDate||'';app.selectOption('priority',t.priority||'none',{high:'High Priority (! Urgent)',med:'Medium Priority',low:'Low Priority',none:'None'}[t.priority||'none']);app.selectOption('project',t.project||'Inbox',t.project||'Inbox');app.selectOption('repeat',t.repeat||'none',t.repeat?t.repeat.charAt(0).toUpperCase()+t.repeat.slice(1):'None');els.taskReminder.value=t.reminder||'';if(t.subtasks)t.subtasks.forEach(s=>app.addSubtaskUI(s))}else{state.editingTaskId=null;els.modalTitle.innerText="New Task";els.saveTaskBtn.innerText="Save Task";state.newEst=1;els.estDisplay.innerText="1";els.taskPomoDisplay.innerText=25;els.dateInput.value=new Date().toISOString().split('T')[0];$('task-title').value='';$('task-note').value='';$('task-tags').value='';app.selectOption('priority','none','None');app.selectOption('project','Inbox','Inbox');app.selectOption('repeat','none','None');els.taskReminder.value=''}app.updateTotalEst();els.modal.classList.remove('hidden');setTimeout(()=>els.modal.classList.remove('opacity-0'),10);setTimeout(()=>els.modalPanel.classList.replace('scale-95','scale-100'),10);$('task-title').focus()}else{els.modal.classList.add('opacity-0');els.modalPanel.classList.replace('scale-100','scale-95');setTimeout(()=>els.modal.classList.add('hidden'),200)}},
    
    adjustEst:d=>{let v=state.newEst+d;if(v<1)v=1;if(v>50)v=50;state.newEst=v;els.estDisplay.innerText=v;app.updateTotalEst()},
    adjustPomoDuration:d=>{let c=parseInt(els.taskPomoDisplay.innerText),v=c+d;if(v<5)v=5;if(v>60)v=60;els.taskPomoDisplay.innerText=v;app.updateTotalEst()},
    updateTotalEst:()=>{const d=parseInt(els.taskPomoDisplay.innerText),n=state.newEst,t=d*n,h=Math.floor(t/60),m=t%60;els.totalTimeCalc.innerText=h>0?`${h}h ${m}m`:`${m}m`},
    editTask:(id,e)=>{e.stopPropagation();const t=state.tasks.find(x=>x.id===id);if(t)app.toggleAddTaskModal(t)},
    handleSaveTask:async e=>{e.preventDefault();const title=$('task-title').value;if(!title)return;const subtasks=Array.from(D.querySelectorAll('.subtask-input')).map(i=>i.value.trim()).filter(v=>v),tags=$('task-tags').value.split(',').map(t=>t.trim()).filter(t=>t),data={title,dueDate:els.dateInput.value,estimatedPomos:state.newEst,pomoDuration:parseInt(els.taskPomoDisplay.innerText),priority:$('task-priority').value,project:$('task-project').value,note:$('task-note').value,repeat:els.taskRepeat.value,reminder:els.taskReminder.value,subtasks,tags};const ref=collection(db,'artifacts',appId,'users',state.user.uid,'tasks');try{state.editingTaskId?await updateDoc(doc(ref,state.editingTaskId),data):await addDoc(ref,{...data,completedPomos:0,status:'todo',createdAt:new Date().toISOString()});app.toggleAddTaskModal()}catch(err){app.showToast("Error saving")}},
    toggleTaskStatus:async(id,s)=>{try{await updateDoc(doc(db,'artifacts',appId,'users',state.user.uid,'tasks',id),{status:s==='todo'?'done':'todo',completedAt:s==='todo'?new Date().toISOString():null})}catch(e){app.showToast("Connection error")}},
    deleteTask:async(id,e)=>{e.stopPropagation();if(confirm('Delete task?'))try{await deleteDoc(doc(db,'artifacts',appId,'users',state.user.uid,'tasks',id))}catch(e){app.showToast("Error deleting")}},
    startTask:async(id,e)=>{e.stopPropagation();const t=state.tasks.find(x=>x.id===id);if(!t)return;state.selectedTaskId=id;renderTasks();updateTimerUI(t);if(window.innerWidth<1280)app.toggleFocusPanel(true);if(state.timer.status!=='running'){const d=t.pomoDuration||25;try{await setDoc(doc(db,'artifacts',appId,'users',state.user.uid,'timer','active'),{status:'running',mode:'focus',taskId:id,remaining:d*60,totalDuration:d*60,endTime:new Date(Date.now()+d*60000)});app.updateSettings('focus',d)}catch(e){app.showToast("Failed to start")}}},
    selectTask:id=>{state.selectedTaskId=id;renderTasks();const t=state.tasks.find(x=>x.id===id);updateTimerUI(t);if(state.timer.status!=='running')updateDoc(doc(db,'artifacts',appId,'users',state.user.uid,'timer','active'),{taskId:id}).catch(()=>{});if(window.innerWidth<1280)app.toggleFocusPanel(true)},
    showToast:(m,t='error')=>{const c=$('toast-container'),e=D.createElement('div');e.className=`px-4 py-2 rounded shadow text-white text-sm font-medium animate-fade-in ${t==='error'?'bg-red-500':'bg-green-600'}`;e.innerText=m;c.appendChild(e);setTimeout(()=>{e.style.opacity='0';setTimeout(()=>e.remove(),300)},3000)},
    
    // --- FIXED FOR ANDROID WEBVIEW ---
    toggleTimer:async()=>{
        try { if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{}); } catch(e){}
        if(state.timer.status==='running'){if(state.timer.settings.strictMode&&state.timer.mode==='focus'&&!confirm("Strict Mode active! Quit?"))return;await updateDoc(doc(db,'artifacts',appId,'users',state.user.uid,'timer','active'),{status:'paused',endTime:null,remaining:Math.max(0,Math.ceil((state.timer.endTime-Date.now())/1000))}).catch(()=>{})}else{if(!state.timer.activeTaskId&&state.timer.mode==='focus'){app.showToast("Select task!","error");return}await updateDoc(doc(db,'artifacts',appId,'users',state.user.uid,'timer','active'),{status:'running',endTime:new Date(Date.now()+state.timer.remaining*1000)}).catch(()=>{})}},
    
    resetTimer:async(r=false)=>{if(!r){const d=state.timer.settings[state.timer.mode];await setDoc(doc(db,'artifacts',appId,'users',state.user.uid,'timer','active'),{status:'idle',endTime:null,remaining:d*60,totalDuration:d*60,mode:state.timer.mode,taskId:state.timer.activeTaskId||null}).catch(()=>{})}},
    skipTimer:()=>app.completeTimer(),
    completeTimer: async () => {
        if (state.timer.status === 'idle') return;
        stopLocalInterval();
        
        // Sound & Notification
        const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator();
        o.connect(c.destination); o.frequency.value = 523.25; o.start(); o.stop(c.currentTime + .2);
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification("Timer Complete") } catch (e) { }

        // Logic
        if (state.timer.mode === 'focus') {
            // Task Completion Update
            if (state.timer.activeTaskId) {
                const t = state.tasks.find(x => x.id === state.timer.activeTaskId);
                if (t) {
                    try {
                        await updateDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'tasks', t.id), { completedPomos: (t.completedPomos || 0) + 1 });
                        await addDoc(collection(db, 'artifacts', appId, 'users', state.user.uid, 'focus_sessions'), { taskId: t.id, taskTitle: t.title, project: t.project || 'Inbox', duration: state.timer.totalDuration / 60, completedAt: serverTimestamp() })
                    } catch (e) { }
                }
            }
            
            // Check flow
            if (state.timer.settings.disableBreak) {
                // Break Disabled: Loop Focus
                await app.setTimerMode('focus');
                if (state.timer.settings.autoStartPomo) app.toggleTimer();
            } else {
                // Handle Break
                const newCount = (state.timer.pomoCountCurrentSession || 0) + 1;
                let nextMode = 'short';
                
                if (newCount >= state.timer.settings.longBreakInterval) {
                    nextMode = 'long';
                }
                
                // Update mode and session count
                await app.setTimerMode(nextMode, nextMode === 'long' ? 0 : newCount);
                if (state.timer.settings.autoStartBreak) app.toggleTimer();
            }
        } else {
            // Break is over -> Back to Focus
            await app.setTimerMode('focus', state.timer.pomoCountCurrentSession); // Keep count unless it was long break (handled previously)
            if (state.timer.settings.autoStartPomo) app.toggleTimer();
        }
    },
    setTimerMode: async (m, sessionCount = null) => {
        const v = state.timer.settings[m];
        const updates = { 
            status: 'idle', mode: m, remaining: v * 60, totalDuration: v * 60, endTime: null, 
            taskId: state.timer.activeTaskId || null 
        };
        if(sessionCount !== null) updates.sessionCount = sessionCount;
        
        await setDoc(doc(db, 'artifacts', appId, 'users', state.user.uid, 'timer', 'active'), updates).catch(() => { });
    },
    setTimerModeUI:m=>{els.timerMode.innerText=m==='focus'?'FOCUS':m==='short'?'SHORT BREAK':'LONG BREAK';els.timerMode.className=`text-xs font-bold tracking-widest uppercase mt-4 ${m==='focus'?'text-brand':'text-blue-400'}`},
    setSound:t=>{
        state.sound=t;els.audio.src=sounds[t];
        D.querySelectorAll('.sound-option').forEach(b=>b.className=b.className.replace('text-brand','text-text-muted'));
        const a=$(`sound-${t}`);if(a)a.className=a.className.replace('text-text-muted','text-brand');
        D.querySelectorAll('[id^="check-sound-"]').forEach(i=>i.classList.add('hidden'));
        const check = $(`check-sound-${t}`); if(check) check.classList.remove('hidden');
        t==='none'?els.audio.pause():(state.timer.status==='running'&&els.audio.play().catch(()=>{}));
    },
    toggleGlobalSettings: () => {
        if (els.settingsModal.classList.contains('hidden')) {
            els.settingsModal.classList.remove('hidden'); setTimeout(() => els.settingsModal.classList.remove('opacity-0'), 10); setTimeout(() => els.settingsPanel.classList.replace('scale-95', 'scale-100'), 10);
            app.switchSettingsTab('timer');
            
            // Initialize Inputs
            $('strict-mode-toggle').checked = state.timer.settings.strictMode;
            $('auto-pomo-toggle').checked = state.timer.settings.autoStartPomo;
            $('auto-break-toggle').checked = state.timer.settings.autoStartBreak;
            $('disable-break-toggle').checked = state.timer.settings.disableBreak;
            $('set-longBreakInterval-val-g').innerText = state.timer.settings.longBreakInterval;
            
            app.setSound(state.sound);
        } else {
            els.settingsModal.classList.add('opacity-0'); els.settingsPanel.classList.replace('scale-100', 'scale-95'); setTimeout(() => els.settingsModal.classList.add('hidden'), 200);
        }
    },
    switchSettingsTab:t=>{
        D.querySelectorAll('.settings-tab-btn').forEach(b=>{
            const active = b.id === `tab-btn-${t}`;
            b.className = active ? 'settings-tab-btn flex-shrink-0 w-auto md:w-full flex items-center px-4 md:px-3 py-2 text-sm font-medium rounded whitespace-nowrap text-brand bg-brand/10 hover:bg-brand/20 transition-colors' : 'settings-tab-btn flex-shrink-0 w-auto md:w-full flex items-center px-4 md:px-3 py-2 text-sm font-medium rounded whitespace-nowrap text-text-muted hover:text-white hover:bg-dark-hover transition-colors';
        });
        D.querySelectorAll('.settings-content').forEach(c=>c.classList.add('hidden')); $(`settings-tab-${t}`).classList.remove('hidden'); els.settingsTitle.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    },
    updateSettings: (k, v) => {
        if (['strictMode', 'autoStartPomo', 'autoStartBreak', 'disableBreak'].includes(k)) {
            state.timer.settings[k] = v; // Boolean values
        } else {
            state.timer.settings[k] = parseInt(v); // Numeric values
            const d = $(`set-${k}-val`); if (d) d.innerText = v;
            const dg = $(`set-${k}-val-g`); if (dg) dg.innerText = v;
        }
    },
    signOut:()=>signOut(auth).then(()=>window.location.href='https://stack-base.github.io/account/login.html?redirectUrl=https://stack-base.github.io/timetrekker/application')
};
window.app=app;

function createGradient(ctx,color){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,color+'90');g.addColorStop(1,color+'05');return g}
function updateAnalytics(){
    if((!state.logs.length&&!state.tasks.length)&&state.view==='analytics')return;
    const getDayStr=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),now=new Date(),todayStr=getDayStr(now),startOfWeek=new Date(now);const day=startOfWeek.getDay()||7;if(day!==1)startOfWeek.setDate(now.getDate()-(day-1));startOfWeek.setHours(0,0,0,0);
    const logsToday=state.logs.filter(l=>l.completedAt&&getDayStr(new Date(l.completedAt.seconds*1000))===todayStr),logsWeek=state.logs.filter(l=>l.completedAt&&new Date(l.completedAt.seconds*1000)>=startOfWeek),tasksDone=state.tasks.filter(t=>t.status==='done'),tasksToday=tasksDone.filter(t=>t.completedAt&&t.completedAt.startsWith(todayStr)),tasksWeek=tasksDone.filter(t=>{if(!t.completedAt)return false;return new Date(t.completedAt)>=startOfWeek});
    const fmtTime=m=>{const h=Math.floor(m/60),rem=Math.round(m%60);return h>0?`${h}h ${rem}m`:`${rem}m`};
    els.analytics.timeTotal.textContent=fmtTime(state.logs.reduce((a,b)=>a+(b.duration||25),0));els.analytics.timeWeek.textContent=fmtTime(logsWeek.reduce((a,b)=>a+(b.duration||25),0));els.analytics.timeToday.textContent=fmtTime(logsToday.reduce((a,b)=>a+(b.duration||25),0));els.analytics.taskTotal.textContent=tasksDone.length;els.analytics.taskWeek.textContent=tasksWeek.length;els.analytics.taskToday.textContent=tasksToday.length;
    const activeTasks=state.tasks.filter(t=>t.status==='todo').length+tasksDone.length;els.analytics.completionRate.textContent=activeTasks>0?Math.round((tasksDone.length/activeTasks)*100)+'%':'0%';els.analytics.avgSession.textContent=(state.logs.length>0?Math.round(state.logs.reduce((a,b)=>a+(b.duration||25),0)/state.logs.length):0)+'m';
    let morning=0,night=0;state.logs.forEach(l=>{if(l.completedAt){const h=new Date(l.completedAt.seconds*1000).getHours();if(h<12)morning+=(l.duration||25);if(h>=20)night+=(l.duration||25)}});els.analytics.earlyBird.textContent=fmtTime(morning);els.analytics.nightOwl.textContent=fmtTime(night);els.analytics.projectCount.textContent=state.projects.size;
    let cs=0;for(let i=0;i<365;i++){const d=new Date();d.setDate(now.getDate()-i);if(state.logs.some(l=>l.completedAt&&getDayStr(new Date(l.completedAt.seconds*1000))===getDayStr(d)))cs++;else if(i>0)break}els.analytics.streakDays.textContent=cs+' Days';
    const hours=Array(24).fill(0);state.logs.forEach(l=>{if(l.completedAt)hours[new Date(l.completedAt.seconds*1000).getHours()]+=(l.duration||25)});
    const weekdays=Array(7).fill(0);state.logs.forEach(l=>{if(l.completedAt){const d=new Date(l.completedAt.seconds*1000).getDay();weekdays[d==0?6:d-1]+=(l.duration||25)}});
    const maxHour=hours.indexOf(Math.max(...hours)),maxDayIdx=weekdays.indexOf(Math.max(...weekdays)),days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];if(state.logs.length>5)els.analytics.insightText.textContent=`You are most productive around ${maxHour}:00 and your best day is ${days[maxDayIdx]}. Keep it up!`;
    const grid=els.analytics.timelineGrid;grid.innerHTML='';const tooltip=$('global-tooltip'),showTooltip=(e,txt,sub)=>{tooltip.innerHTML=`<strong>${esc(txt)}</strong><span class="sub">${esc(sub)}</span>`;tooltip.style.opacity='1';tooltip.style.left=e.pageX+'px';tooltip.style.top=e.pageY+'px'},hideTooltip=()=>{tooltip.style.opacity='0'};
    for(let i=0;i<14;i++){const d=new Date();d.setDate(now.getDate()-i);const dStr=getDayStr(d),dayLogs=state.logs.filter(l=>l.completedAt&&getDayStr(new Date(l.completedAt.seconds*1000))===dStr),row=D.createElement('div');row.className="flex items-center h-8 hover:bg-dark-hover rounded transition-colors";const lbl=D.createElement('div');lbl.className="w-24 text-[10px] text-text-muted font-bold uppercase tracking-wider pl-2 flex-shrink-0";lbl.textContent=i===0?"Today":(i===1?"Yesterday":d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));const bars=D.createElement('div');bars.className="flex-1 h-full relative bg-dark-bg rounded mx-2 overflow-hidden border border-dark-border";for(let j=1;j<6;j++){const l=D.createElement('div');l.className="absolute top-0 bottom-0 border-l border-dark-border opacity-30";l.style.left=`${(j*4/24)*100}%`;bars.appendChild(l)}dayLogs.forEach(l=>{const ld=new Date(l.completedAt.seconds*1000),sm=(ld.getHours()*60)+ld.getMinutes(),dur=l.duration||25,lp=((sm-dur)/1440)*100,wp=(dur/1440)*100,b=D.createElement('div');b.className="absolute top-1.5 bottom-1.5 rounded-sm bg-brand opacity-80 z-10 hover:bg-white transition-colors cursor-pointer";b.style.left=`${lp}%`;b.style.width=`${Math.max(wp,0.5)}%`;b.addEventListener('mousemove',(e)=>showTooltip(e,l.taskTitle||'Focus Session',`${ld.getHours()}:${ld.getMinutes().toString().padStart(2,'0')} - ${dur} mins`));b.addEventListener('mouseleave',hideTooltip);bars.appendChild(b)});row.appendChild(lbl);row.appendChild(bars);grid.appendChild(row)}
    const r=state.analytics.range;let lbl=[],dpFocus=[],dpTask=[],dlb=r==='week'?7:(r==='month'?30:12);if(r==='year'){for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);lbl.push(d.toLocaleString('default',{month:'short'}));const mLogs=state.logs.filter(l=>{if(!l.completedAt)return!1;const ld=new Date(l.completedAt.seconds*1000);return ld.getMonth()===d.getMonth()&&ld.getFullYear()===d.getFullYear()});dpFocus.push((mLogs.reduce((a,b)=>a+(b.duration||25),0)/60).toFixed(1));const mTasks=state.tasks.filter(t=>{if(t.status!=='done'||!t.completedAt)return!1;const td=new Date(t.completedAt);return td.getMonth()===d.getMonth()&&td.getFullYear()===d.getFullYear()});dpTask.push(mTasks.length)}}else{for(let i=dlb-1;i>=0;i--){const d=new Date();d.setDate(now.getDate()-i);const dStr=getDayStr(d);lbl.push(d.toLocaleDateString('en-US',{weekday:'short',day:r==='month'?'numeric':undefined}));const dLogs=state.logs.filter(l=>l.completedAt&&getDayStr(new Date(l.completedAt.seconds*1000))===dStr);dpFocus.push((dLogs.reduce((a,b)=>a+(b.duration||25),0)/60).toFixed(1));const dTasks=state.tasks.filter(t=>t.status==='done'&&t.completedAt&&t.completedAt.startsWith(dStr));dpTask.push(dTasks.length)}}
    const cOpts={responsive:!0,maintainAspectRatio:!1,scales:{y:{beginAtZero:!0,grid:{color:'rgba(255,255,255,0.03)',borderDash:[4,4]}},x:{grid:{display:!1}}},plugins:{legend:{display:!1}},elements:{bar:{borderRadius:4,hoverBackgroundColor:'#fff'},line:{tension:0.4}},interaction:{mode:'index',intersect:!1}};
    const gC=(ctx,t,l,d,c,tl)=>{const i=t==='line';return{type:t,data:{labels:l,datasets:[{label:tl,data:d,backgroundColor:i?createGradient(ctx,c):c,borderColor:c,borderRadius:4,fill:i,borderWidth:i?2:0,pointRadius:i?0:0,pointHoverRadius:6}]},options:{...cOpts,plugins:{...cOpts.plugins,tooltip:{callbacks:{label:x=>x.raw+' '+(tl.includes('Hours')?'hrs':(tl.includes('Tasks')?'tasks':'mins'))}}}}}};
    if(state.charts.focusBar)state.charts.focusBar.destroy();const ctxF=els.analytics.focusBarChart.getContext('2d');state.charts.focusBar=new Chart(ctxF,gC(ctxF,state.chartTypes.focus,lbl,dpFocus,'#ff5757','Focus Hours'));
    if(state.charts.taskBar)state.charts.taskBar.destroy();const ctxT=els.analytics.taskBarChart.getContext('2d');state.charts.taskBar=new Chart(ctxT,gC(ctxT,state.chartTypes.task,lbl,dpTask,'#3b82f6','Tasks Done'));
    if(state.charts.hourly)state.charts.hourly.destroy();const ctxH=els.analytics.hourlyChart.getContext('2d');state.charts.hourly=new Chart(ctxH,gC(ctxH,state.chartTypes.hourly,Array.from({length:24},(_,i)=>i),hours,'#10b981','Minutes'));
    if(state.charts.weekday)state.charts.weekday.destroy();const ctxW=els.analytics.weekdayChart.getContext('2d');state.charts.weekday=new Chart(ctxW,gC(ctxW,state.chartTypes.weekday,['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],weekdays,'#f59e0b','Minutes'));
    const pm={};state.logs.forEach(l=>{const p=l.project||'Inbox';pm[p]=(pm[p]||0)+(l.duration||25)});const sp=Object.entries(pm).sort((a,b)=>b[1]-a[1]);if(state.charts.project)state.charts.project.destroy();state.charts.project=new Chart(els.analytics.projectChart.getContext('2d'),{type:'doughnut',data:{labels:sp.map(x=>x[0]),datasets:[{data:sp.map(x=>x[1]),backgroundColor:['#ff5757','#8b5cf6','#3b82f6','#10b981','#f59e0b'],borderColor:'#000000',borderWidth:4,hoverOffset:4}]},options:{responsive:!0,maintainAspectRatio:!1,cutout:'75%',plugins:{legend:{display:!1},tooltip:{callbacks:{label:c=>c.label+': '+Math.round(c.raw)+'m'}}}}});els.analytics.projList.innerHTML=sp.map(x=>`<div class="flex justify-between text-xs text-text-muted"><span>${esc(x[0])}</span><span>${Math.round(x[1])}m</span></div>`).join('');
    const pri={high:0,med:0,low:0,none:0};tasksDone.forEach(t=>pri[t.priority||'none']++);if(state.charts.priority)state.charts.priority.destroy();state.charts.priority=new Chart(els.analytics.priorityChart.getContext('2d'),{type:'doughnut',data:{labels:['High','Med','Low','None'],datasets:[{data:[pri.high,pri.med,pri.low,pri.none],backgroundColor:['#ef4444','#eab308','#3b82f6','#525252'],borderColor:'#000000',borderWidth:4,hoverOffset:4}]},options:{responsive:!0,maintainAspectRatio:!1,cutout:'75%',plugins:{legend:{display:!1}}}});
    const tc={};tasksDone.forEach(t=>{if(t.tags)t.tags.forEach(g=>tc[g]=(tc[g]||0)+1)});const st=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,5);if(st.length>0)els.analytics.tagList.innerHTML=st.map((x,i)=>`<div class="flex items-center justify-between text-xs"><div class="flex items-center"><span class="w-4 text-text-faint mr-2">${i+1}.</span><span class="text-white bg-dark-hover px-1.5 py-0.5 rounded">${esc(x[0])}</span></div><span class="text-text-muted">${x[1]} tasks</span></div>`).join('');
    els.analytics.sessionLogBody.innerHTML=state.logs.slice(0,20).map(l=>{const d=l.completedAt?new Date(l.completedAt.seconds*1000):new Date();return `<tr><td class="text-text-muted">${d.toLocaleDateString()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}</td><td class="font-medium text-white">${esc(l.taskTitle)}</td><td><span class="px-2 py-0.5 rounded-full text-[10px] bg-dark-hover border border-dark-border text-text-muted">${esc(l.project)}</span></td><td class="text-brand font-mono">${l.duration||25}m</td></tr>`}).join('');
}

$('prompt-cancel-btn').addEventListener('click',()=>app.closePrompt(null));$('prompt-confirm-btn').addEventListener('click',()=>app.closePrompt(app.customPrompt.input.value));$('prompt-input').addEventListener('keypress',e=>{if(e.key==='Enter')app.closePrompt(app.customPrompt.input.value)});D.addEventListener('click',e=>{if(!e.target.closest('#project-dropdown')&&!e.target.closest('#priority-dropdown')&&!e.target.closest('#repeat-dropdown')){D.getElementById('project-options').classList.add('hidden');D.getElementById('priority-options').classList.add('hidden');D.getElementById('repeat-options').classList.add('hidden')}});
function updateNavStyles(v,p){D.querySelectorAll('.nav-btn').forEach(b=>{const i=b.id===`nav-${v}`;b.classList.toggle('bg-brand',i);b.classList.toggle('bg-opacity-10',i);b.classList.toggle('text-brand',i);b.classList.toggle('text-text-muted',!i);if(i)b.classList.remove('hover:text-white');else b.classList.add('hover:text-white')});D.querySelectorAll('.project-btn').forEach(b=>{const i=v==='project'&&b.dataset.proj===p;b.classList.toggle('text-brand',i);b.classList.toggle('bg-brand',i);b.classList.toggle('bg-opacity-10',i);b.classList.toggle('text-text-muted',!i)})}
function updateProjectsUI(){els.projectList.innerHTML='';state.projects.forEach(p=>{const d=D.createElement('div');d.innerHTML=`<div class="group relative flex items-center"><button onclick="app.setProjectView('${esc(p)}')" data-proj="${esc(p)}" class="project-btn w-full flex items-center justify-between px-3 py-2 rounded text-text-muted hover:bg-dark-hover hover:text-white transition-colors text-sm group shrink-0"><div class="flex items-center min-w-0"><i class="ph-bold ph-hash mr-3 opacity-50 shrink-0"></i><span class="truncate font-medium">${esc(p)}</span></div></button><div class="absolute right-2 flex opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"><button onclick="app.renameProject('${esc(p)}', event)" class="text-text-muted hover:text-white p-1"><i class="ph-bold ph-pencil-simple"></i></button><button onclick="app.deleteProject('${esc(p)}', event)" class="text-text-muted hover:text-red-400 p-1 ml-1"><i class="ph-bold ph-trash"></i></button></div></div>`;els.projectList.appendChild(d)})}
function updateCounts(){
    const getDayStr=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const t=getDayStr(new Date()), tm=getDayStr(new Date(Date.now()+864e5));
    
    els.navCounts.all.textContent = state.tasks.length; 

    const tasksTodo=state.tasks.filter(x=>x.status==='todo');
    let tasksViewTodo;
    if(state.view === 'all') tasksViewTodo = state.tasks;
    else if(state.view==='today') tasksViewTodo = tasksTodo.filter(x=>x.dueDate===t);
    else if(state.view==='tomorrow') tasksViewTodo = tasksTodo.filter(x=>x.dueDate===tm);
    else if(state.view==='upcoming') tasksViewTodo = tasksTodo.filter(x=>x.dueDate>tm);
    else if(state.view==='project') tasksViewTodo = tasksTodo.filter(x=>x.project===state.filterProject);
    else tasksViewTodo = tasksTodo.filter(x=>x.dueDate===t); 

    els.navCounts.today.textContent=state.tasks.filter(x=>x.dueDate===t&&x.status==='todo').length;
    els.navCounts.tomorrow.textContent=state.tasks.filter(x=>x.dueDate===tm&&x.status==='todo').length;
    els.navCounts.upcoming.textContent=state.tasks.filter(x=>x.dueDate>tm&&x.status==='todo').length;
    els.navCounts.past.textContent=state.tasks.filter(x=>x.dueDate<t&&x.status==='todo').length;
    
    const tp=state.tasks.reduce((a,b)=>a+(b.completedPomos||0),0);
    els.stats.pomosToday.textContent=tp;
    els.stats.tasksToday.textContent=state.tasks.filter(x=>x.status==='done'&&x.dueDate===t).length;
    
    els.stats.estRemain.textContent=tasksViewTodo.reduce((a,b)=>a+(parseInt(b.estimatedPomos)||0),0);
    const fm=tp*state.timer.settings.focus;
    els.stats.focusTime.textContent=`${Math.floor(fm/60)}h ${fm%60}m`;
    els.stats.tasksRemain.textContent=tasksViewTodo.length;
    
    const totalEstMin=tasksViewTodo.reduce((a,b)=>a+((parseInt(b.estimatedPomos)||1)*(b.pomoDuration||25)),0);
    els.stats.estTime.textContent=Math.floor(totalEstMin/60)>0?`${Math.floor(totalEstMin/60)}h ${totalEstMin%60}m`:`${totalEstMin}m`;
}
function renderTasks(){
    const getDayStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        t = getDayStr(new Date()),
        tm = getDayStr(new Date(Date.now() + 864e5));
    let l = [];
    if (state.view === 'all') l = state.tasks;
    else if (state.view === 'today') l = state.tasks.filter(x => x.dueDate === t && x.status === 'todo');
    else if (state.view === 'tomorrow') l = state.tasks.filter(x => x.dueDate === tm && x.status === 'todo');
    else if (state.view === 'upcoming') l = state.tasks.filter(x => x.dueDate > tm && x.status === 'todo');
    else if (state.view === 'past') l = state.tasks.filter(x => x.dueDate < t && x.status === 'todo');
    else if (state.view === 'completed') l = state.tasks.filter(x => x.status === 'done');
    else if (state.view === 'project') l = state.tasks.filter(x => x.project === state.filterProject && x.status === 'todo');

    const pm = { high: 3, med: 2, low: 1, none: 0 };
    
    l.sort((a, b) => {
        if(a.status !== b.status) return a.status === 'todo' ? -1 : 1; 
        return pm[b.priority] - pm[a.priority];
    });

    els.taskList.innerHTML = '';
    if (l.length === 0) els.emptyState.classList.remove('hidden');
    else els.emptyState.classList.add('hidden');

    l.forEach(x => {
        const isSel = x.id === state.selectedTaskId,
              pc = Math.min(100, ((x.completedPomos || 0) / (x.estimatedPomos || 1)) * 100),
              sty = isSel ? { high: 'bg-dark-card border-red-500 shadow-sm z-10', med: 'bg-dark-card border-yellow-500 shadow-sm z-10', low: 'bg-dark-card border-blue-500 shadow-sm z-10', none: 'bg-dark-card border-brand shadow-sm z-10' }[x.priority || 'none'] : 'bg-dark-card border-dark-border hover:border-text-faint';

        const dur = x.pomoDuration || 25;
        const cP = x.completedPomos || 0;
        const eP = x.estimatedPomos || 1;
        const rP = Math.max(0, eP - cP); 
        
        const cMin = cP * dur;   
        const rMin = rP * dur;   
        
        const fmt = m => { const h = Math.floor(m / 60), rm = m % 60; return h > 0 ? `${h}h ${rm}m` : `${rm}m`; };

        const el = D.createElement('div');
        el.className = `group flex items-start p-4 rounded-lg border transition-all duration-200 ease-out cursor-pointer relative ${sty}`;
        el.onclick = () => app.selectTask(x.id);
        el.innerHTML = `<div class="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${x.priority === 'high' ? 'bg-red-500' : x.priority === 'med' ? 'bg-yellow-500' : 'bg-transparent'}"></div>
        <label class="custom-checkbox flex-shrink-0 mt-0.5 w-5 h-5 mr-4 cursor-pointer relative z-10" onclick="event.stopPropagation()">
            <input type="checkbox" class="hidden" ${x.status === 'done' ? 'checked' : ''} onchange="app.toggleTaskStatus('${x.id}','${x.status}')">
            <div class="w-5 h-5 border-2 border-text-faint rounded-full flex items-center justify-center transition-all hover:border-brand bg-dark-bg">
                <svg class="w-3 h-3 text-white hidden pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
        </label>
        <div class="flex-1 min-w-0 pr-20">
            <div class="flex items-center justify-between"><h3 class="text-base font-medium text-white truncate ${x.status === 'done' ? 'line-through text-text-muted' : ''}">${esc(x.title)}</h3></div>
            ${x.note ? `<p class="text-xs text-text-muted line-clamp-1 mt-0.5 truncate">${esc(x.note)}</p>` : ''}
            ${x.subtasks && x.subtasks.length > 0 ? `<div class="mt-3 space-y-1 border-t border-dashed border-dark-border pt-2">${x.subtasks.map(s => `<div class="flex items-start text-xs text-text-muted"><i class="ph-bold ph-caret-right text-[10px] mt-0.5 mr-1.5 text-text-faint"></i><span>${esc(s)}</span></div>`).join('')}</div>` : ''}
            
            <div class="flex flex-wrap items-center mt-2 gap-y-2 gap-x-4">
                <div class="flex items-center text-xs text-text-muted"><i class="ph-bold ph-folder mr-1.5 text-text-faint"></i><span>${esc(x.project)}</span></div>
                
                <div class="flex items-center text-xs text-text-muted" title="Pomos: Completed / Remaining">
                    <i class="ph-fill ph-check-circle text-brand mr-1.5 text-[10px]"></i>
                    <span>${cP} / ${rP} rem</span>
                </div>
                <div class="flex items-center text-xs text-text-muted" title="Time: Completed / Remaining">
                    <i class="ph-fill ph-clock text-brand mr-1.5 text-[10px]"></i>
                    <span class="${pc >= 100 ? 'text-brand' : ''}">${fmt(cMin)} / ${fmt(rMin)} left</span>
                </div>

                ${x.repeat && x.repeat !== 'none' ? `<div class="flex items-center text-xs text-text-muted"><i class="ph-bold ph-arrows-clockwise mr-1.5 text-text-faint"></i><span>${x.repeat.charAt(0).toUpperCase() + x.repeat.slice(1)}</span></div>` : ''}
                ${x.reminder ? `<div class="flex items-center text-xs text-text-muted"><i class="ph-bold ph-bell mr-1.5 text-text-faint"></i><span>${x.reminder}</span></div>` : ''}
                ${x.tags && x.tags.length ? `<div class="flex gap-1 ml-auto">${x.tags.map(t => `<span class="px-1.5 py-0.5 rounded text-[10px] bg-brand/10 text-brand border border-brand/20">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>
        </div>
        <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all z-20">
            <button onclick="app.startTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-brand hover:bg-brand hover:text-white transition-colors rounded"><i class="ph-fill ph-play"></i></button>
            <button onclick="app.editTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-white hover:bg-dark-hover transition-colors rounded"><i class="ph-bold ph-pencil-simple"></i></button>
            <button onclick="app.deleteTask('${x.id}',event)" class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-dark-hover transition-colors rounded"><i class="ph-bold ph-trash"></i></button>
        </div>`;
        els.taskList.appendChild(el)
    })
}
updateTimerUI(null);
app.setView('today');