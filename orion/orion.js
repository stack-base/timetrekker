import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, collectionGroup, getDocs, query, orderBy, limit, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, deleteField, arrayUnion, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const C={apiKey:"AIzaSyDkKhb8m0znWyC2amv6uGpA8KmbkuW-j1U",authDomain:"timetrekker-app.firebaseapp.com",projectId:"timetrekker-app",storageBucket:"timetrekker-app.firebasestorage.app",messagingSenderId:"83185163190",appId:"1:83185163190:web:e2974c5d0f0274fe5e3f17",measurementId:"G-FLZ02E1Y5L"};
const appId='timetrekker-v1';
const fb = initializeApp(C, "OrionConsole");
const auth = getAuth(fb);
const db = getFirestore(fb);
const CACHE_KEY = 'orion_timetrekker_local_cache_v1';

const STAR_KEY = 'orion_starred_users';
const ADMIN_UIDS = ['oxnHr84lGgOkLQuxSouJaXJDx1I3']; 
Chart.defaults.font.family='-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
Chart.defaults.color='#a3a3a3';
Chart.defaults.borderColor='#2a2a2a';

const log=(msg)=>{
    const b=document.getElementById('console-log');
    if(b){b.innerHTML+=`> ${msg}<br>`;b.scrollTop=b.scrollHeight;}
};

// String Highlighter Utility
const highlightText = (text, query) => {
    if (!query || !text) return text || '';
    const str = String(text);
    const q = query.toLowerCase();
    const idx = str.toLowerCase().indexOf(q);
    if (idx === -1) return str;
    
    const matched = str.substring(idx, idx + query.length);
    const markStyle = "background: rgba(255,87,87,0.2); color: #fff; border-bottom: 1px solid var(--brand); padding: 0 2px; border-radius: 2px;";
    
    return str.substring(0, idx) + `<mark style="${markStyle}">${matched}</mark>` + str.substring(idx + query.length);
};

const state={
    sessions:[], tasks:[], usersList:[], broadcasts: [], charts:{}, view:'overview', usersMap:{}, filterUser:null, editTaskId: null,
    starred: JSON.parse(localStorage.getItem(STAR_KEY) || '[]'),
    showStarredOnly: false, lastSyncTime: null,
    userSearchQuery: '', taskSearchQuery: '', taskPresetFilter: 'all',
    sort: {
        users: { col: 'name', dir: 'asc' },
        tasks: { col: 'dueDate', dir: 'asc' },
        broadcasts: { col: 'createdAt', dir: 'desc' }
    }
};

let isInitialLoad = true;
const updateURL = () => {
    const url = new URL(window.location);
    url.searchParams.set('view', state.view);
    if (state.filterUser) url.searchParams.set('uid', state.filterUser);
    else url.searchParams.delete('uid');
    if (state.editTaskId) url.searchParams.set('edit', state.editTaskId);
    else url.searchParams.delete('edit');
    url.hash = '';
    if (window.location.search !== url.search || window.location.hash !== '') {
        window.history.pushState({}, '', url);
    }
};

const applyUrlState = () => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view') || 'overview';
    const uid = params.get('uid');
    const edit = params.get('edit');
    if (uid) {
        state.filterUser = uid;
        state.keepFilter = true;
    } else {
        state.filterUser = null;
    }
    app.setView(v, true);
    const modal = document.getElementById('admin-task-modal');
    const isModalOpen = !modal.classList.contains('hidden');
    if (edit) {
        if (!isModalOpen) {
            if (edit === 'new') app.toggleAdminTaskModal(null, uid, true);
            else app.toggleAdminTaskModal(edit, uid, true);
        }
    } else {
        if (isModalOpen) {
            app.toggleAdminTaskModal(null, null, true);
        }
    }
};
window.addEventListener('popstate', applyUrlState);

const saveCache = () => {
    try {
        const now = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify({sessions: state.sessions, tasks: state.tasks, usersList: state.usersList, broadcasts: state.broadcasts, timestamp: now}));
        state.lastSyncTime = now;
        log('<span style="color: var(--success);">Data cached successfully.</span>');
        updateStorageStats();
    } catch (e) { log('Cache Error: ' + e.message); }
};

const loadCache = () => {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        state.sessions = data.sessions || []; state.tasks = data.tasks || []; state.usersList = data.usersList || []; state.broadcasts = data.broadcasts || [];
        state.lastSyncTime = data.timestamp || Date.now();
        updateStorageStats();
        return true;
    } catch (e) { return false; }
};

const updateStorageStats = () => {
    const cache = localStorage.getItem(CACHE_KEY) || '';
    const stars = localStorage.getItem(STAR_KEY) || '';
    const totalBytes = cache.length + stars.length;
    const mb = (totalBytes / (1024 * 1024)).toFixed(2);
    const sizeStr = mb > 1 ? `${mb} MB` : `${(totalBytes / 1024).toFixed(2)} KB`;
    let ageStr = "Just now";
    if(state.lastSyncTime){
        const diffMins = Math.round((Date.now() - state.lastSyncTime) / 60000);
        ageStr = diffMins < 1 ? "Just now" : `${diffMins} mins`;
        const timeStr = new Date(state.lastSyncTime).toLocaleTimeString([], { hour12: false });
        const elTime = document.getElementById('last-sync-time');
        if(elTime) elTime.innerText = timeStr;
    }
    const count = state.sessions.length + state.tasks.length + state.usersList.length + state.broadcasts.length;
    const elSize = document.getElementById('stat-storage-size');
    const elItems = document.getElementById('stat-items-count');
    const elAge = document.getElementById('stat-cache-age');
    const elBadge = document.getElementById('cache-badge');
    if(elSize) elSize.innerText = sizeStr;
    if(elItems) elItems.innerText = `${count} objects`;
    if(elAge) elAge.innerText = ageStr;
    if(elBadge) elBadge.innerText = `CACHED (${ageStr} ago)`;
};

const showLoginModal=()=>{
    if(document.getElementById('dev-login-modal'))return;
    const div=document.createElement('div');
    div.id='dev-login-modal';
    div.className='modal-overlay';
    div.innerHTML=`<div class="modal-box"><h2 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 1.5rem; display: flex; align-items: center;"><i class="ph-bold ph-lock-key" style="margin-right: 0.5rem;"></i> Orion Login</h2><form id="dev-login-form"><div class="input-group"><label>Email</label><input type="email" id="dev-email" class="input-control" placeholder="access@orion.com" required></div><div class="input-group"><label>Password</label><input type="password" id="dev-pass" class="input-control" placeholder="••••••••" required></div><div id="login-error" style="color: var(--danger); font-size: 0.8125rem; display: none; margin-bottom: 1rem;"></div><button type="submit" class="btn btn-primary" style="width: 100%;">Access Orion</button></form></div>`;
    document.body.appendChild(div);
    document.getElementById('dev-login-form').onsubmit=async(e)=>{
        e.preventDefault();
        const email=document.getElementById('dev-email').value;
        const pass=document.getElementById('dev-pass').value;
        const btn=e.target.querySelector('button');
        const err=document.getElementById('login-error');
        try{
            btn.innerText='Authenticating...'; btn.disabled=true;
            await signInWithEmailAndPassword(auth,email,pass);
        }catch(error){
            btn.innerText='Access Orion'; btn.disabled=false;
            err.innerText=error.message; err.style.display='block';
        }
    };
};

function showUnauthorizedScreen() {
    document.body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; width: 100vw; background-color: var(--bg-main); color: var(--text-main);">
            <div style="background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <div style="font-size: 48px; color: var(--danger); margin-bottom: 16px;"><i class="ph-bold ph-shield-warning"></i></div>
                <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #ffffff;">Clearance Required</h2>
                <p style="margin: 0 0 24px 0; font-size: 13px; color: var(--text-muted); line-height: 1.5;">This console is restricted to authorized administrators. Your account lacks access.</p>
                <button class="btn btn-outline" onclick="app.signOut()">Return to Login</button>
            </div>
        </div>
    `;
};

onAuthStateChanged(auth, async u => {
    const modal = document.getElementById('dev-login-modal');
    const orionApp = document.getElementById('orion-app');
    if (u) {
        if (modal) modal.remove();
        if (ADMIN_UIDS.includes(u.uid)) {
            try {
                await requireClearance();
                if (orionApp) orionApp.style.display = 'flex';
                log(`Authenticated and Authorized as ${u.email}`);
                app.refreshData(false);
            } catch (e) {
                showUnauthorizedScreen(); 
            }
        } else {
            log(`Unauthorized access attempt by ${u.email}`);
            showUnauthorizedScreen();
        }
    } else {
        if (orionApp) orionApp.style.display = 'none';
        log('No user detected. Showing login prompt...');
        showLoginModal();
    }
});

function populateTargetSelectors() {
    const taskTarget = document.getElementById('admin-task-target');
    const broadcastTarget = document.getElementById('admin-broadcast-target');
    const defaultBroadcastOpt = `<option value="all">Global Broadcast (All Users)</option>`;
    const defaultTaskOpt = `<option value="all">All Users (Broadcast Task)</option>`;
    let userOptions = '';
    const users = Object.values(state.usersMap).sort((a,b) => (a.name||a.email).localeCompare(b.name||b.email));
    users.forEach(u => {
        userOptions += `<option value="${u.uid}">${u.name||u.email} (${u.uid.slice(0,6)}...)</option>`;
    });
    if(taskTarget) taskTarget.innerHTML = defaultTaskOpt + userOptions;
    if(broadcastTarget) broadcastTarget.innerHTML = defaultBroadcastOpt + userOptions;
};

const requireClearance = () => {
    return new Promise((resolve, reject) => {
        if (document.getElementById('pin-clearance-modal')) {
            document.getElementById('pin-clearance-modal').remove();
        }

        const user = auth.currentUser;
        if (Object.keys(state.usersMap).length === 0) {
            loadCache();
        }
        const localUser = user ? state.usersMap[user.uid] : null;
        
        const dName = localUser?.name || user?.displayName || 'Administrator';
        const dEmail = user?.email || 'System Account';
        const dAvatar = localUser?.avatar || user?.photoURL || null;

        let avatarHtml = '';
        if (dAvatar) {
            avatarHtml = `<img src="${dAvatar}" alt="Profile" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`;
        } else {
            const initial = dName.charAt(0).toUpperCase();
            avatarHtml = `<div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(to bottom right, var(--info), #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #fff; border: 2px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">${initial}</div>`;
        }

        const modalHtml = `
        <style>
            #pin-clearance-modal .auth-box {
                width: 100%;
                max-width: 400px;
                padding: 36px 40px;
                text-align: center;
                border-radius: 8px;
                border: 1px solid var(--border);
                background: var(--bg-card);
                box-shadow: 0 8px 24px rgba(0,0,0,0.8);
            }
            @media (max-width: 768px) {
                #pin-clearance-modal .auth-box {
                    max-width: 100%;
                    height: 100dvh;
                    border-radius: 0;
                    border: none;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding: 24px;
                }
            }
        </style>
        
        <div id="pin-clearance-modal" class="modal-overlay" style="z-index: 99999; backdrop-filter: none; background: rgba(0,0,0,0.7); padding: 0;">
            <div class="auth-box">
                <div style="display: flex; flex-direction: row; justify-content: center; align-items: center; margin-bottom: 60px; gap: 12px;">
                    <img src="https://stack-base.github.io/media/brand/orion/orion_icon.png" alt="Orion Logo" style="width: 36px; height: 36px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    <div style="font-size: 1.75rem; font-weight: 700; color: #fff; letter-spacing: -0.02em;">Orion</div>
                </div>
                <h3 style="font-size: 1.5rem; font-weight: 400; color: #e8eaed; margin-bottom: 24px; letter-spacing: 0;">Verify it's you</h3>
                <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--border);">
                    <div style="margin-bottom: 12px;">${avatarHtml}</div>
                    <div style="font-size: 0.9375rem; color: #e8eaed; font-weight: 500; letter-spacing: -0.01em; margin-bottom: 4px;">${dName}</div>
                    <div style="font-size: 0.8125rem; color: #9aa0a6; display: flex; align-items: center; justify-content: center; gap: 4px;">
                        <i class="ph-bold ph-user-circle"></i> ${dEmail}
                    </div>
                </div>
                <p style="font-size: 0.875rem; color: #9aa0a6; margin-bottom: 24px; line-height: 1.5;">To continue, first verify that it's you.</p>
                <div style="text-align: left; margin-bottom: 32px; position: relative;">
                    <input type="password" id="clearance-pin-input" style="width: 100%; padding: 13px 15px; border: 1px solid #5f6368; border-radius: 4px; background: transparent; color: #e8eaed; font-size: 1rem; outline: none; transition: all 0.2s;" placeholder="Enter passcode" autocomplete="off" onfocus="this.style.border='2px solid #8ab4f8'; this.style.padding='12px 14px';" onblur="this.style.border='1px solid #5f6368'; this.style.padding='13px 15px';">
                    <div id="pin-error-msg" style="color: #f28b82; font-size: 0.75rem; margin-top: 8px; display: none; align-items: center;">
                        <i class="ph-bold ph-warning-circle" style="margin-right: 6px; font-size: 1rem;"></i> Wrong passcode. Try again.
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <button id="cancel-pin-btn" style="background: transparent; border: none; color: #8ab4f8; font-weight: 500; font-size: 0.875rem; cursor: pointer; padding: 8px 8px; margin-left: -8px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(138, 180, 248, 0.08)'" onmouseout="this.style.background='transparent'">Cancel</button>
                    <button id="verify-pin-btn" style="background: #8ab4f8; color: #202124; border: none; border-radius: 4px; padding: 8px 24px; font-weight: 500; font-size: 0.875rem; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#9ec1f9'" onmouseout="this.style.background='#8ab4f8'">Next</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('pin-clearance-modal');
        const input = document.getElementById('clearance-pin-input');
        const verifyBtn = document.getElementById('verify-pin-btn');
        const cancelBtn = document.getElementById('cancel-pin-btn');
        const errorMsg = document.getElementById('pin-error-msg');

        input.focus();

        const cleanup = () => modal.remove();

        cancelBtn.onclick = () => { cleanup(); reject(new Error("Cancelled")); };

        const attemptVerify = async () => {
            // Show loading state on the button
            verifyBtn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i>';
            verifyBtn.disabled = true;

            try {
                // Fetch the admin's user document from Firestore
                const adminDocRef = doc(db, 'artifacts', appId, 'users', user.uid);
                const adminSnap = await getDoc(adminDocRef);

                // Check if document exists and the PIN matches the 'clearancePin' field
                if (adminSnap.exists() && adminSnap.data().clearancePin === input.value) {
                    cleanup(); 
                    resolve(true);
                } else {
                    errorMsg.innerHTML = '<i class="ph-bold ph-warning-circle" style="margin-right: 6px; font-size: 1rem;"></i> Wrong passcode. Try again.';
                    errorMsg.style.display = 'flex';
                    input.value = ''; 
                    input.focus();
                    
                    // Trigger shake animation
                    modal.querySelector('.auth-box').style.transform = 'translateX(4px)';
                    setTimeout(() => modal.querySelector('.auth-box').style.transform = 'translateX(-4px)', 50);
                    setTimeout(() => modal.querySelector('.auth-box').style.transform = 'translateX(0)', 100);
                }
            } catch (error) {
                console.error("Error verifying clearance:", error);
                errorMsg.innerHTML = '<i class="ph-bold ph-warning-circle" style="margin-right: 6px; font-size: 1rem;"></i> Verification failed.';
                errorMsg.style.display = 'flex';
            } finally {
                // Reset button state
                verifyBtn.innerHTML = 'Next';
                verifyBtn.disabled = false;
            }
        };

        verifyBtn.onclick = attemptVerify;
        input.onkeyup = (e) => {
            errorMsg.style.display = 'none';
            if (e.key === 'Enter') attemptVerify();
        };
    });
};

const app={
    toggleMobileMenu: () => {
        document.getElementById('sidebar').classList.toggle('open');
    },
    signOut:async()=>{try{await signOut(auth);window.location.reload();}catch(e){log(e.message);}},
    hardRefresh: () => { if(confirm('Reload app? Unsaved changes may be lost.')) window.location.reload(true); },
    setView:(v, skipUrlUpdate = false)=>{
        state.view=v;
        if(v==='tasks'&&!state.keepFilter)state.filterUser=null;
        state.keepFilter=false;
        if (!skipUrlUpdate) {
            state.editTaskId = null;
            updateURL();
        }
        document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));
        document.getElementById(`view-${v}`).classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
        const navTarget = document.getElementById(`nav-${v}`);
        if(navTarget) navTarget.classList.add('active');
        
        const titles = {'overview': 'Overview', 'users': 'Users', 'tasks': 'Tasks', 'broadcasts': 'Broadcasts', 'data': 'Data Management'};
        document.getElementById('page-title').innerText = titles[v] || 'Orion';
        
        if(v === 'data'){
            document.getElementById('standard-header').classList.add('hidden');
            document.getElementById('data-header').classList.remove('hidden');
            updateStorageStats();
        } else {
            document.getElementById('data-header').classList.add('hidden');
            document.getElementById('standard-header').classList.remove('hidden');
        }
        if(window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
        }
        if(v==='users')renderUsersTable();
        if(v==='tasks')renderTasksTable();
        if(v==='broadcasts')renderBroadcastsTable();
    },
    generatePDFReport: async () => {
        if (!window.jspdf) {
            alert("PDF library is still loading or failed to load. Please check your internet connection.");
            return;
        }
        try { await requireClearance(); } catch(e) { return; }
        const btn = document.querySelector('button[onclick="app.generatePDFReport()"]');
        if (!btn) return;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin" style="margin-right: 0.5rem;"></i> Compiling data...';
        btn.disabled = true;
        let orionLogoBase64 = null;
        let ttLogoBase64 = null;
        try {
            const [resOrion, resTT] = await Promise.all([
                fetch('https://stack-base.github.io/media/brand/orion/orion_icon.png'),
                fetch('https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png')
            ]);
            const [blobOrion, blobTT] = await Promise.all([resOrion.blob(), resTT.blob()]);
            const toBase64 = (blob) => new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            orionLogoBase64 = await toBase64(blobOrion);
            ttLogoBase64 = await toBase64(blobTT);
        } catch (e) {
            console.warn("Could not fetch brand logos for PDF.", e);
        }
        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
                const now = new Date();
                const margin = 14; 
                const pageWidth = doc.internal.pageSize.width;
                const contentWidth = pageWidth - (margin * 2);
                const textMain = [15, 23, 42];
                const textMuted = [100, 116, 139];
                const brandColor = [74, 75, 168];
                const usersCount = Object.keys(state.usersMap).length;
                const totalTasks = state.tasks.length;
                const completedTasks = state.tasks.filter(t => t.status === 'done').length;
                const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const priorityCounts = { high: 0, med: 0, low: 0, none: 0 };
                state.tasks.forEach(t => priorityCounts[t.priority || 'none']++);
                const totalSessions = state.sessions.length;
                const totalFocusMinutes = state.sessions.reduce((acc, s) => acc + (s.duration || 25), 0);
                const totalFocusHours = (totalFocusMinutes / 60).toFixed(1);
                const avgFocusPerUser = usersCount ? Math.round(totalFocusMinutes / usersCount) : 0;
                const projectStats = {};
                state.sessions.forEach(s => {
                    const p = s.project || 'Inbox';
                    if (!projectStats[p]) projectStats[p] = { count: 0, minutes: 0 };
                    projectStats[p].count += 1;
                    projectStats[p].minutes += (s.duration || 25);
                });
                const sortedProjs = Object.entries(projectStats).sort((a,b) => b[1].count - a[1].count);
                const topProjectName = sortedProjs.length > 0 ? sortedProjs[0][0] : 'None';
                
                const drawSectionHeader = (title, subtitle, y) => {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(...textMain);
                    doc.text(title.toUpperCase(), margin + 4, y);
                    
                    let endY = y;
                    if (subtitle) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(9);
                        doc.setTextColor(...textMuted);
                        doc.text(subtitle, margin + 4, y + 5);
                        endY = y + 5;
                    }
                    
                    doc.setDrawColor(...brandColor);
                    doc.setLineWidth(1.5);
                    doc.line(margin, y - 4, margin, endY + 1);
                    
                    return endY + 12;
                };

                const drawKPICard = (x, y, w, h, label, value, subtext, accentColor) => {
                    doc.setFillColor(248, 249, 250); 
                    doc.rect(x, y, w, h, 'F'); 
            
                    doc.setDrawColor(...accentColor);
                    doc.setLineWidth(1.5);
                    doc.line(x, y, x + w, y);
            
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(108, 117, 125); 
                    doc.text(label.toUpperCase(), x + 5, y + 8);
                    
                    doc.setFontSize(22);
                    doc.setTextColor(20, 25, 35); 
                    doc.text(value.toString(), x + 5, y + 18);
                    
                    if (subtext) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);
                        doc.setTextColor(40, 45, 55);
                        doc.text(subtext, x + 5, y + 26);
                    }
                };

                const tableStyles = {
                    theme: 'striped',
                    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: [60, 60, 60] },
                    margin: { left: margin, right: margin }
                };
                let currentY = 0;
                doc.setFillColor(...brandColor);
                doc.rect(0, 0, pageWidth, 4, 'F');
                currentY = 28;
                const midX = pageWidth / 2;
                let orionTitleX = margin;
                if (orionLogoBase64) {
                    doc.addImage(orionLogoBase64, 'PNG', margin, currentY - 8.5, 10.5, 10.5);
                    orionTitleX = margin + 12; 
                }
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(25);
                doc.setTextColor(...textMain);
                doc.setCharSpace(-0.52);
                doc.text(`Orion`, orionTitleX, currentY);
                doc.setCharSpace(0);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(midX, currentY - 8, midX, currentY + 2);
                const rightStartX = midX + 8;
                let ttTitleX = rightStartX;
                if (ttLogoBase64) {
                    doc.addImage(ttLogoBase64, 'PNG', rightStartX, currentY - 10, 13, 13);
                    ttTitleX = rightStartX + 15;
                }

                doc.setFont('helvetica', 'bold'); 
                doc.setCharSpace(-0.40); 
                doc.setFontSize(25);
                doc.text(`TimeTrekker`, ttTitleX, currentY);
                doc.setCharSpace(0);
                currentY += 12;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(...textMuted);
                doc.text(`System Telemetry & Operational Throughput Report  •  Generated ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, currentY);
                currentY += 6;
                doc.setFontSize(10);
                doc.text(`Target Environment: TimeTrekker`, margin, currentY);
                currentY += 20;
                currentY = drawSectionHeader('EXECUTIVE SUMMARY', 'High-level metrics and system health', currentY);
                
                const cardW = (contentWidth - 8) / 3;
                const cardH = 32; 
                let cX = margin;
                let cY = currentY;
                
                drawKPICard(cX, cY, cardW, cardH, 'TOTAL ACTIVE USERS', usersCount, 'Global users directory', [244, 67, 54]); 
                drawKPICard(cX + cardW + 4, cY, cardW, cardH, 'TOTAL TASKS', totalTasks, `${completionRate}% Completion Rate`, [66, 133, 244]); 
                drawKPICard(cX + (cardW * 2) + 8, cY, cardW, cardH, 'HIGH PRIORITY', priorityCounts.high, 'Active directives', [249, 168, 37]); 
                
                cY += cardH + 6; 
                
                drawKPICard(cX, cY, cardW, cardH, 'LOGGED SESSIONS', totalSessions, 'Focus sessions recorded', [38, 166, 154]); 
                drawKPICard(cX + cardW + 4, cY, cardW, cardH, 'AGGREGATED HOURS', totalFocusHours, 'Deep work sustained', [126, 87, 194]); 
                drawKPICard(cX + (cardW * 2) + 8, cY, cardW, cardH, 'PRIMARY VECTOR', topProjectName.substring(0,15), 'Dominant focus category', [33, 33, 33]); 
                
                currentY = cY + cardH + 15;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...textMain);
                doc.text("System Telemetry Analysis", margin, currentY);
                currentY += 6;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(51, 65, 85);
                const p1 = `This intelligence brief provides a comprehensive, data-driven analysis of platform utilization, user engagement, and operational throughput for the TimeTrekker environment. Managed via the Orion framework and spanning the entirety of the cached lifecycle, this report evaluates the activities of ${usersCount} registered users. The overarching engagement profile remains robust, characterized by ${totalSessions} distinct focus sessions that have culminated in ${totalFocusHours} aggregate hours of uninterrupted deep work. This volume indicates an average engagement depth of ${avgFocusPerUser} focus minutes per user, underscoring the platform's efficacy in sustaining prolonged user attention.`;
                const p2 = `Operational throughput is measured via the Task Master framework. To date, the system has tracked the lifecycle of ${totalTasks} discrete directives. Of these, ${completedTasks} have been successfully executed and archived, resulting in a global completion rate of ${completionRate}%. This metric serves as a key indicator of user productivity and system friction. Categorical distribution of these efforts highlights "${topProjectName}" as the dominant focus vector, capturing the highest concentration of user sessions.`;
                const p3 = `Furthermore, task triage behaviors reveal significant reliance on the platform for critical operations. The table below delineates the explicit prioritization hierarchy established by the active user base, offering insight into the urgency and classification of pending system directives.`;
                const splitP1 = doc.splitTextToSize(p1, contentWidth);
                doc.text(splitP1, margin, currentY, { lineHeightFactor: 1.5 });
                currentY += (splitP1.length * 4.5) + 4;
                const splitP2 = doc.splitTextToSize(p2, contentWidth);
                doc.text(splitP2, margin, currentY, { lineHeightFactor: 1.5 });
                currentY += (splitP2.length * 4.5) + 4;
                const splitP3 = doc.splitTextToSize(p3, contentWidth);
                doc.text(splitP3, margin, currentY, { lineHeightFactor: 1.5 });
                currentY += (splitP3.length * 4.5) + 8;
                doc.autoTable({
                    startY: currentY,
                    head: [['Priority Classification', 'Active Directives', 'System Weight (%)']],
                    body: [
                        ['HIGH Priority', priorityCounts.high.toString(), `${totalTasks ? Math.round((priorityCounts.high/totalTasks)*100) : 0}%`],
                        ['MEDIUM Priority', priorityCounts.med.toString(), `${totalTasks ? Math.round((priorityCounts.med/totalTasks)*100) : 0}%`],
                        ['LOW Priority', priorityCounts.low.toString(), `${totalTasks ? Math.round((priorityCounts.low/totalTasks)*100) : 0}%`],
                        ['Unassigned / None', priorityCounts.none.toString(), `${totalTasks ? Math.round((priorityCounts.none/totalTasks)*100) : 0}%`]
                    ],
                    ...tableStyles,
                    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
                    tableWidth: contentWidth * 0.75, 
                    margin: { left: margin }
                });

                // --- PAGE 2: Telemetry Visuals & Density Map ---
                doc.addPage();
                currentY = 25;
                currentY = drawSectionHeader('TELEMETRY VISUALS', 'Graphical representation of global system activity', currentY);
                
                // --- MANUAL DENSITY MAP DRAWING ---
                const densityCardH = 40;
                doc.setFillColor(248, 250, 252); 
                doc.setDrawColor(226, 232, 240); 
                doc.setLineWidth(0.5);
                doc.roundedRect(margin, currentY, contentWidth, densityCardH, 3, 3, 'FD');
                doc.setFont('helvetica', 'bold'); 
                doc.setFontSize(8); 
                doc.setTextColor(...textMain);
                doc.text('GLOBAL SESSION DENSITY (365 DAYS)', margin + 6, currentY + 8);

                const dCounts = {};
                let dMax = 0;
                state.sessions.forEach(s => {
                    if(!s.completedAt) return;
                    const dt = new Date(typeof s.completedAt==='number' ? s.completedAt : s.completedAt.seconds*1000);
                    const dStr = dt.toISOString().split('T')[0];
                    dCounts[dStr] = (dCounts[dStr]||0) + 1;
                    if(dCounts[dStr] > dMax) dMax = dCounts[dStr];
                });
                
                const mapEnd = new Date();
                const mapStart = new Date(mapEnd);
                mapStart.setDate(mapStart.getDate() - 364);
                while(mapStart.getDay() !== 0) mapStart.setDate(mapStart.getDate() - 1); 
                
                const totalMapDays = Math.round((mapEnd - mapStart)/86400000) + 1;
                const totalMapCols = Math.ceil(totalMapDays / 7);
                
                const mapGap = 0.6;
                const mapCellW = Math.floor(((contentWidth - 12 - (totalMapCols*mapGap)) / totalMapCols) * 10) / 10;
                const mapCellH = mapCellW;
                
                const actualGridWidth = totalMapCols * (mapCellW + mapGap);
                const mapStartX = margin + ((contentWidth - actualGridWidth) / 2);
                const mapStartY = currentY + 12;
                
                let mapCurr = new Date(mapStart);
                for(let c=0; c<totalMapCols; c++){
                    for(let r=0; r<7; r++){
                        if(mapCurr > mapEnd) break;
                        const dateStr = mapCurr.toISOString().split('T')[0];
                        const cnt = dCounts[dateStr] || 0;
                        
                        let tier = 0;
                        if(cnt > 0){
                            const rt = cnt / (dMax || 1);
                            if(rt > 0.75) tier = 4;
                            else if(rt > 0.50) tier = 3;
                            else if(rt > 0.25) tier = 2;
                            else tier = 1;
                        }
                        
                        if (tier === 0) doc.setFillColor(235, 235, 235); 
                        else if (tier === 1) doc.setFillColor(255, 213, 213); 
                        else if (tier === 2) doc.setFillColor(255, 171, 171); 
                        else if (tier === 3) doc.setFillColor(255, 129, 129); 
                        else doc.setFillColor(255, 87, 87); 

                        doc.roundedRect(mapStartX + c*(mapCellW + mapGap), mapStartY + r*(mapCellH + mapGap), mapCellW, mapCellH, 0.3, 0.3, 'F');
                        mapCurr.setDate(mapCurr.getDate() + 1);
                    }
                }
                currentY += densityCardH + 6;

                // --- CHART INJECTION UTILS ---
                const addChartCard = (canvasId, chartRef, title, x, y, w, h) => {
                    const canvas = document.getElementById(canvasId);
                    if (!canvas || !chartRef) return false;
                    try {
                        const oldRatio = chartRef.options.devicePixelRatio || window.devicePixelRatio;
                        chartRef.options.devicePixelRatio = 4; 
                        chartRef.update('none');
                        const imgData = canvas.toDataURL('image/png');
                        chartRef.options.devicePixelRatio = oldRatio;
                        chartRef.update('none');
                        
                        doc.setFillColor(248, 250, 252); 
                        doc.setDrawColor(226, 232, 240); 
                        doc.setLineWidth(0.5);
                        doc.roundedRect(x, y, w, h, 3, 3, 'FD');

                        doc.setFont('helvetica', 'bold'); 
                        doc.setFontSize(8); 
                        doc.setTextColor(...textMain);
                        doc.text(title, x + 6, y + 8);

                        const imgPadding = 6;
                        const availableW = w - (imgPadding * 2);
                        const availableH = h - 14; 
                        const ratio = canvas.width / canvas.height;

                        let imgW = availableW;
                        let imgH = imgW / ratio;

                        if (imgH > availableH) {
                            imgH = availableH;
                            imgW = imgH * ratio;
                        }

                        const imgX = x + imgPadding + ((availableW - imgW) / 2);
                        const imgY = y + 11 + ((availableH - imgH) / 2);

                        doc.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH, undefined, 'FAST');
                        return true;
                    } catch(e) {
                        console.error(`Export failed for ${canvasId}`, e);
                        return false;
                    }
                };

                const addChartWithLegendCard = (canvasId, chartRef, title, legendData, x, y, w, h) => {
                    const canvas = document.getElementById(canvasId);
                    if (!canvas || !chartRef) return false;
                    try {
                        const oldRatio = chartRef.options.devicePixelRatio || window.devicePixelRatio;
                        chartRef.options.devicePixelRatio = 4; 
                        chartRef.update('none');
                        const imgData = canvas.toDataURL('image/png');
                        chartRef.options.devicePixelRatio = oldRatio;
                        chartRef.update('none');
                        
                        doc.setFillColor(248, 250, 252); 
                        doc.setDrawColor(226, 232, 240); 
                        doc.setLineWidth(0.5);
                        doc.roundedRect(x, y, w, h, 3, 3, 'FD');

                        doc.setFont('helvetica', 'bold'); 
                        doc.setFontSize(8); 
                        doc.setTextColor(...textMain);
                        doc.text(title, x + 6, y + 8);

                        const leftW = w / 2;
                        const imgPadding = 6;
                        const availableW = leftW - (imgPadding * 2);
                        const availableH = h - 14; 
                        const ratio = canvas.width / canvas.height;

                        let imgW = availableW;
                        let imgH = imgW / ratio;

                        if (imgH > availableH) { imgH = availableH; imgW = imgH * ratio; }

                        const imgX = x + imgPadding + ((availableW - imgW) / 2);
                        const imgY = y + 11 + ((availableH - imgH) / 2);

                        doc.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH, undefined, 'FAST');

                        const rightX = x + leftW;
                        const startY = y + 20;
                        const rowHeight = 9;
                        
                        legendData.forEach((item, i) => {
                            const itemY = startY + (i * rowHeight);
                            
                            doc.setFillColor(item.color);
                            doc.circle(rightX + 6, itemY - 1.2, 2.5, 'F');
                            
                            doc.setFont('helvetica', 'bold');
                            doc.setFontSize(8);
                            doc.setTextColor(...textMain);
                            doc.text(item.label.toUpperCase(), rightX + 12, itemY);
                            
                            doc.setFont('helvetica', 'normal');
                            doc.setTextColor(...textMuted);
                            doc.text(item.value, x + w - 10, itemY, { align: 'right' });
                            
                            if (i < legendData.length - 1) {
                                doc.setDrawColor(226, 232, 240);
                                doc.setLineWidth(0.2);
                                doc.line(rightX + 4, itemY + 3.5, x + w - 10, itemY + 3.5);
                            }
                        });

                        return true;
                    } catch(e) { return false; }
                };

                const fullCardH = 75;
                const pieCardH = 65;

                if (addChartCard('activityChart', state.charts.activity, 'FOCUS ACTIVITY CONTINUUM (7-DAY TREND)', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;
                if (addChartCard('taskBarChart', state.charts.taskCompletion, 'TASK COMPLETION VOLUME (7-DAY TREND)', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;
                
                doc.addPage();
                currentY = 25;
                if (addChartCard('todayTimelineChart', state.charts.todayTimeline, "TODAY'S MINUTE-BY-MINUTE TIMELINE", margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;

                if (addChartCard('hourlyChart', state.charts.hourly, 'HOURLY PRODUCTIVITY (ALL TIME)', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;
                if (addChartCard('weekdayChart', state.charts.weekday, 'WEEKLY PERFORMANCE (ALL TIME)', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;

                doc.addPage();
                currentY = 25;
                if (addChartCard('genderChart', state.charts.gender, 'USER DEMOGRAPHICS: GENDER', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;
                if (addChartCard('countryChart', state.charts.country, 'GLOBAL REACH: TOP COUNTRIES', margin, currentY, contentWidth, fullCardH)) currentY += fullCardH + 6;

                const projColors = ['#ff5757','#3b82f6','#10b981','#f59e0b','#8b5cf6'];
                const projLegend = sortedProjs.slice(0,5).map((p, i) => ({
                    color: projColors[i],
                    label: p[0].length > 25 ? p[0].substring(0, 25) + '...' : p[0],
                    value: `${p[1].count} sessions`
                }));
                if (addChartWithLegendCard('projectDistChart', state.charts.proj, 'PROJECT CATEGORY DISTRIBUTION', projLegend, margin, currentY, contentWidth, pieCardH)) currentY += pieCardH + 6;
                
                doc.addPage();
                currentY = 25;
                const priColors = ['#ef4444', '#eab308', '#3b82f6', '#525252'];
                const priLegend = [
                    { color: priColors[0], label: 'High Priority', value: `${priorityCounts.high} tasks` },
                    { color: priColors[1], label: 'Medium Priority', value: `${priorityCounts.med} tasks` },
                    { color: priColors[2], label: 'Low Priority', value: `${priorityCounts.low} tasks` },
                    { color: priColors[3], label: 'No Priority', value: `${priorityCounts.none} tasks` }
                ];
                if (addChartWithLegendCard('priorityChart', state.charts.priority, 'GLOBAL TASK PRIORITIES', priLegend, margin, currentY, contentWidth, pieCardH)) currentY += pieCardH + 12;

                // 1. Force a new page
                doc.addPage();
                // 2. Reset the Y-axis to the top of the new page
                currentY = 25;

                // --- GLOBAL IDENTITY LEDGER ---
                currentY = drawSectionHeader('GLOBAL IDENTITY LEDGER', 'Complete list of registered users', currentY);
                
                const userTableBody = Object.values(state.usersMap)
                    .sort((a, b) => (a.name || a.email || '').toLowerCase().localeCompare((b.name || b.email || '').toLowerCase()))
                    .map(u => {
                    const genderStr = u.gender ? u.gender.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown';
                    return [
                        `${u.name || 'Unknown'}\nGender: ${genderStr}`, // Gender appended dynamically here
                        `${u.email || 'No Email'}\n${u.phone || 'No Phone'}`,
                        u.country || '-',
                        u.tasks.toString(),
                        `${Math.floor(u.focus / 60)}h ${u.focus % 60}m`,
                        u.lastActive ? new Date(u.lastActive).toLocaleDateString() : 'Never'
                    ];
                });
                
                doc.autoTable({
                    startY: currentY,
                    head: [['Account Name', 'Contact Info', 'Locale', 'Total Tasks', 'Focus Time', 'Last Active']],
                    body: userTableBody,
                    ...tableStyles,
                    headStyles: { fillColor: [255, 87, 87], textColor: [255, 255, 255], fontStyle: 'bold' }
                });
                
                if (sortedProjs.length > 0) {
                    doc.addPage();
                    currentY = 25;
                    currentY = drawSectionHeader('PROJECT ANALYTICS MATRIX', 'Resource allocation per project category', currentY);
                    const projectTableBody = sortedProjs.map(([name, stats]) => [
                        name,
                        stats.count.toString(),
                        `${Math.floor(stats.minutes / 60)}h ${stats.minutes % 60}m`
                    ]);
                    doc.autoTable({
                        startY: currentY,
                        head: [['Project / Category Name', 'Total Sessions Logged', 'Aggregate Time Spent']],
                        body: projectTableBody,
                        ...tableStyles,
                        headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontStyle: 'bold' } 
                    });
                }
                doc.addPage();
                currentY = 25;
                currentY = drawSectionHeader('TASK MASTER LIST', 'Global ledger of pending and completed directives', currentY);
                const taskTableBody = state.tasks.map(t => {
                    const u = state.usersMap[t._uid];
                    return [
                        t.title || 'Untitled',
                        u ? (u.name || u.email) : t._uid,
                        t.project || 'Inbox',
                        (t.priority || 'none').toUpperCase(),
                        `${t.completedSessionIds ? t.completedSessionIds.length : 0} / ${t.estimatedPomos || 1}`,
                        t.status === 'done' ? 'Completed' : 'Pending'
                    ];
                });
                doc.autoTable({
                    startY: currentY,
                    head: [['Task Directive', 'Assigned Owner', 'Project Tag', 'Priority', 'Pomos', 'Status']],
                    body: taskTableBody,
                    ...tableStyles,
                    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' } 
                });
                if (state.sessions.length > 0) {
                    doc.addPage();
                    currentY = 25;
                    currentY = drawSectionHeader('SESSION TELEMETRY LEDGER', 'Raw chronological feed of focus blocks', currentY);
                    const sessionTableBody = state.sessions.map(s => {
                        const u = state.usersMap[s._uid];
                        let dateStr = 'Unknown';
                        if (s.completedAt) {
                            const d = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
                            dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                        }
                        return [
                            dateStr,
                            u ? (u.name || u.email) : s._uid,
                            s.taskTitle || 'Unknown Task',
                            s.project || 'Inbox',
                            `${s.duration || 25} min`
                        ];
                    });
                    doc.autoTable({
                        startY: currentY,
                        head: [['Completion Timestamp', 'User', 'Task Title', 'Project', 'Duration']],
                        body: sessionTableBody,
                        ...tableStyles,
                        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' } 
                    });
                }
                if (state.broadcasts && state.broadcasts.length > 0) {
                    doc.addPage();
                    currentY = 25;
                    currentY = drawSectionHeader('BROADCAST ARCHIVE', 'Historical broadcasts dispatch records', currentY);
                    const broadcastBody = state.broadcasts.map(b => {
                        const target = b.target === 'all' ? 'GLOBAL' : (state.usersMap[b.target] ? state.usersMap[b.target].name : b.target);
                        return [
                            b.createdAt ? new Date(b.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown',
                            b.type.toUpperCase(),
                            target,
                            b.message.length > 60 ? b.message.substring(0, 60) + '...' : b.message,
                            b.readBy ? b.readBy.length.toString() : '0'
                        ];
                    });
                    doc.autoTable({
                        startY: currentY,
                        head: [['Dispatch Date', 'Class', 'Target Scope', 'Message Payload', 'Views']],
                        body: broadcastBody,
                        ...tableStyles,
                        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' } 
                    });
                }
                doc.addPage();
                currentY = 25;
                currentY = drawSectionHeader('DECLARATION & ADMINISTRATIVE NOTES', 'Ecosystem definitions, disclaimers, and confidentiality terms', currentY);
                currentY += 10;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(...textMain);
                doc.text("Ecosystem Architecture", margin, currentY);
                currentY += 8;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...textMain);
                doc.text("StackBase:", margin, currentY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(51, 65, 85);
                let defStackBase = doc.splitTextToSize("The parent organization and foundational infrastructure provider responsible for the development, deployment, and maintenance of both the application and the Orion framework.", contentWidth - 25);
                doc.text(defStackBase, margin + 25, currentY);
                currentY += (defStackBase.length * 4.5) + 4;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...textMain);
                doc.text("TimeTrekker:", margin, currentY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(51, 65, 85);
                let defTT = doc.splitTextToSize("The primary target environment. A productivity and focus-management application that serves as the source of all raw user activity and telemetry data contained within this report.", contentWidth - 25);
                doc.text(defTT, margin + 25, currentY);
                currentY += (defTT.length * 4.5) + 4;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...textMain);
                doc.text("Orion:", margin, currentY);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(51, 65, 85);
                let defOrion = doc.splitTextToSize("The centralized administrative framework and analytical engine. Orion Intelligence programmatically aggregates, processes, and formats the raw data from application to generate this brief.", contentWidth - 25);
                doc.text(defOrion, margin + 25, currentY);
                currentY += (defOrion.length * 4.5) + 12;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(...textMain);
                doc.text("Automated Generation Disclaimer", margin, currentY);
                currentY += 8;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(51, 65, 85);
                const disclaimerText = "This report was generated programmatically by Orion Intelligence based on the available database cache at the time of export. While every effort is made to ensure data integrity and accurate aggregation, the analytical summaries are automated. StackBase, TimeTrekker, and associated administrative personnel assume no liability for discrepancies, omissions, or operational actions taken based on this automated telemetry.";
                const splitDisclaimer = doc.splitTextToSize(disclaimerText, contentWidth);
                doc.text(splitDisclaimer, margin, currentY, { lineHeightFactor: 1.5 });
                currentY += (splitDisclaimer.length * 4.5) + 12;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(220, 38, 38);
                doc.text("Confidentiality Note", margin, currentY);
                currentY += 8;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(51, 65, 85);
                const confText = "This document contains highly sensitive operational and user engagement data. It is strictly confidential and intended solely for internal administrative review. It is NOT authorized for public distribution, external sharing, or official compliance use until formally reviewed, signed, and stamped by an authorized administrator.";
                const splitConf = doc.splitTextToSize(confText, contentWidth);
                doc.text(splitConf, margin, currentY, { lineHeightFactor: 1.5 });
                const sigY = doc.internal.pageSize.height - 60;
                doc.setDrawColor(203, 213, 225);
                doc.setLineWidth(0.5);
                doc.line(margin, sigY, margin + 60, sigY);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...textMuted);
                doc.text("AUTHORIZED SIGNATURE", margin, sigY + 5);
                doc.line(margin + 75, sigY, margin + 115, sigY);
                doc.text("DATE", margin + 75, sigY + 5);
                doc.line(margin + 130, sigY, pageWidth - margin, sigY);
                doc.text("OFFICIAL STAMP / SEAL", margin + 130, sigY + 5);
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    const footerY = doc.internal.pageSize.height - 12;
                    if (orionLogoBase64) doc.addImage(orionLogoBase64, 'PNG', margin, footerY - 4, 4.5, 4.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Orion  //  TimeTrekker Report — CONFIDENTIAL & PROPRIETARY`, margin + (orionLogoBase64 ? 5 : 0), footerY - 0.5);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`PAGE ${i} OF ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
                }
                const filename = `Orion_TimeTrekker_Report_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.pdf`;
                doc.save(filename);
                log(`<span style="color: var(--success);">Intelligence Report (${filename}) generated successfully.</span>`);
            } catch (err) {
                console.error(err);
                alert("An error occurred while generating the PDF: " + err.message);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }, 150); 
    },
    handleSort: (view, col) => {
        if (state.sort[view].col === col) {
            state.sort[view].dir = state.sort[view].dir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sort[view].col = col;
            state.sort[view].dir = 'asc';
        }
        document.querySelectorAll(`#view-${view} th.sortable`).forEach(th => {
            th.classList.remove('active');
            const icon = th.querySelector('i');
            if (icon) icon.className = 'ph-bold ph-caret-up-down';
        });
        const activeTh = document.getElementById(`sort-${view}-${col}`);
        if (activeTh) {
            activeTh.parentElement.classList.add('active');
            activeTh.className = state.sort[view].dir === 'asc' ? 'ph-bold ph-caret-up' : 'ph-bold ph-caret-down';
        }
        if(view === 'users') renderUsersTable();
        if(view === 'tasks') renderTasksTable();
        if(view === 'broadcasts') renderBroadcastsTable();
    },
    filterTasksByUser:(uid)=>{ 
        state.filterUser=uid; 
        state.keepFilter=true; 
        app.setView('tasks');
    },
    viewAsUser:(uid)=>{ window.open(`https://stack-base.github.io/timetrekker/application?uid=${uid}`,'_blank'); },
    clearTaskFilter:()=>{ 
        state.filterUser=null; 
        updateURL();
        renderTasksTable(); 
    },
    filterTasks: (q) => {
        state.taskSearchQuery = q;
        renderTasksTable(); 
    },
    setTaskPreset: (val) => {
        state.taskPresetFilter = val;
        renderTasksTable();
    },
    filterUsers: (q) => {
        state.userSearchQuery = q.toLowerCase();
        renderUsersTable();
    },
    toggleStar: (uid) => {
        if (state.starred.includes(uid)) state.starred = state.starred.filter(id => id !== uid);
        else state.starred.push(uid);
        localStorage.setItem(STAR_KEY, JSON.stringify(state.starred));
        renderUsersTable();
    },
    toggleStarredFilter: () => {
        state.showStarredOnly = !state.showStarredOnly;
        const btn = document.getElementById('btn-star-filter');
        if (state.showStarredOnly) {
            btn.style.background = 'rgba(245, 158, 11, 0.1)'; btn.style.color = 'var(--warning)'; btn.style.borderColor = 'rgba(245, 158, 11, 0.2)';
            btn.innerHTML = `<i class="ph-fill ph-star" style="margin-right: 0.5rem;"></i> Starred Only`;
        } else {
            btn.style = '';
            btn.innerHTML = `<i class="ph-bold ph-star" style="margin-right: 0.5rem;"></i> Show Starred Only`;
        }
        renderUsersTable();
    },
    exportData: async () => {
        try { await requireClearance(); } catch(e) { return; }
        const exportObj = { meta: { version: '1.0', exportDate: new Date().toISOString() }, cache: localStorage.getItem(CACHE_KEY), starred: localStorage.getItem(STAR_KEY) };
        const blob = new Blob([JSON.stringify(exportObj)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `orion_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        log('<span style="color: var(--info);">Backup downloaded successfully.</span>');
    },
    handleFileImport: (input) => {
        if (!input.files || !input.files[0]) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.cache) localStorage.setItem(CACHE_KEY, data.cache);
                if (data.starred) { localStorage.setItem(STAR_KEY, data.starred); state.starred = JSON.parse(data.starred); }
                log('<span style="color: var(--success);">Import successful. Reloading data...</span>');
                app.refreshData(false);
                alert('Data imported successfully!');
            } catch (err) { alert('Error parsing JSON file.'); }
        };
        reader.readAsText(input.files[0]); input.value = '';
    },
    exportCSV: (type) => {
        let data = [];
        if (type === 'users') data = state.usersList;
        else if (type === 'tasks') data = state.tasks;
        else if (type === 'sessions') data = state.sessions;
        if (!data || !data.length) return alert(`No ${type} data available to export.`);
        const headers = Array.from(new Set(data.flatMap(Object.keys)));
        const csvRows = [
            headers.join(','), 
            ...data.map(row => headers.map(fieldName => {
                let val = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName];
                if (typeof val === 'object') val = JSON.stringify(val);
                val = val.toString().replace(/"/g, '""');
                return `"${val}"`;
            }).join(','))
        ];
        const csvString = csvRows.join('\r\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = `orion_${type}_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        URL.revokeObjectURL(url);
        log(`<span style="color: var(--info);">CSV Export generated for ${type}.</span>`);
    },
    handleCSVImport: (input) => {
        if (!input.files || !input.files[0]) return;
        const targetType = document.getElementById('csv-import-target').value;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== '');
                const headers = rows[0].split(',').map(h => h.replace(/(^"|"$)/g, '').trim());
                const parsedData = rows.slice(1).map(row => {
                    const values = [];
                    let inQuotes = false;
                    let currentValue = "";
                    for (let i = 0; i < row.length; i++) {
                        const char = row[i];
                        if (char === '"' && row[i+1] === '"') { currentValue += '"'; i++; } 
                        else if (char === '"') { inQuotes = !inQuotes; } 
                        else if (char === ',' && !inQuotes) { values.push(currentValue); currentValue = ""; } 
                        else { currentValue += char; }
                    }
                    values.push(currentValue); 
                    const obj = {};
                    headers.forEach((header, index) => {
                        let val = values[index];
                        try { if (val.startsWith('{') || val.startsWith('[')) val = JSON.parse(val); } catch(e){}
                        obj[header] = val;
                    });
                    return obj;
                });
                if (targetType === 'users') {
                    state.usersList = [...state.usersList, ...parsedData];
                } else if (targetType === 'tasks') {
                    state.tasks = [...state.tasks, ...parsedData];
                }
                saveCache(); 
                app.refreshData(false); 
                alert(`Successfully imported ${parsedData.length} rows into ${targetType}!`);
                log(`<span style="color: var(--success);">CSV Import merged into ${targetType}.</span>`);
            } catch (err) { 
                alert('Error parsing CSV file. Ensure it is formatted correctly.'); 
                console.error(err);
            }
        };
        reader.readAsText(input.files[0]); 
        input.value = ''; 
    },
    clearLocalData: () => {
        if(confirm('Clear all cached data?')){
            localStorage.removeItem(CACHE_KEY); localStorage.removeItem(STAR_KEY);
            state.starred = []; window.location.reload();
        }
    },
    toggleUserProfileModal: (uid = null) => {
        const modal = document.getElementById('user-profile-modal');
        if (modal.classList.contains('hidden')) {
            const u = state.usersMap[uid];
            if (!u) return;
            document.getElementById('modal-user-uid').value = uid;
            document.getElementById('modal-input-name').value = u.name || '';
            document.getElementById('modal-input-email').value = u.email || '';
            document.getElementById('modal-input-photo').value = u.avatar || '';
            
            document.getElementById('modal-input-phone').value = u.phone || '';
            document.getElementById('modal-input-country').value = u.country || '';
            document.getElementById('modal-input-gender').value = u.gender || '';

            document.getElementById('modal-user-name-display').innerText = u.name || 'Unknown User';
            document.getElementById('modal-user-email-display').innerText = u.email || 'No Email';
            document.getElementById('modal-user-uid-display').innerText = `UID: ${uid}`;
            document.getElementById('modal-user-provider').innerText = u.provider.replace('.com', '').toUpperCase();
            const avatarContainer = document.getElementById('modal-user-avatar');
            if (u.avatar) {
                avatarContainer.innerHTML = `<img src="${u.avatar}" onclick="app.showFullscreenAvatar('${u.avatar}', '${uid}')" style="width: 100%; height: 100%; object-fit: cover; cursor: zoom-in;" title="Click to view full image and details">`;
            } else {
                avatarContainer.innerHTML = (u.name || u.email || '?').charAt(0).toUpperCase();
                avatarContainer.style.background = 'linear-gradient(to bottom right, var(--info), #8b5cf6)';
            }
            const resetBtn = document.getElementById('btn-reset-password');
            resetBtn.onclick = () => app.triggerPasswordReset(u.email);
            const revertBtn = document.getElementById('btn-revert-profile');
            const revertDetails = document.getElementById('revert-details-container');
            const origName = document.getElementById('revert-orig-name');
            const origPhoto = document.getElementById('revert-orig-photo');
            if (u.originalProfile) {
                revertBtn.disabled = false;
                revertBtn.style.opacity = '1';
                revertBtn.style.cursor = 'pointer';
                origName.innerText = u.originalProfile.displayName || 'No Name';
                if (u.originalProfile.photoURL) {
                    origPhoto.src = u.originalProfile.photoURL;
                    origPhoto.style.display = 'block';
                } else {
                    origPhoto.style.display = 'none';
                }
                revertDetails.style.display = 'block';
            } else {
                revertBtn.disabled = true;
                revertBtn.style.opacity = '0.5';
                revertBtn.style.cursor = 'not-allowed';
                revertDetails.style.display = 'none';
            }
            modal.classList.remove('hidden');
            setTimeout(() => modal.style.opacity = '1', 10);
        } else {
            modal.style.opacity = '0';
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    },
    handleSaveUserProfile: async (e) => {
        e.preventDefault();
        const uid = document.getElementById('modal-user-uid').value;
        const u = state.usersMap[uid];
        const btn = document.getElementById('modal-save-profile-btn');
        btn.innerText = 'Saving...'; btn.disabled = true;
        const updatedData = {
            displayName: document.getElementById('modal-input-name').value,
            photoURL: document.getElementById('modal-input-photo').value,
            phone: document.getElementById('modal-input-phone').value,
            country: document.getElementById('modal-input-country').value.toUpperCase(),
            gender: document.getElementById('modal-input-gender').value,
            updatedAt: serverTimestamp()
        };
        if (!u.originalProfile) {
            updatedData.originalProfile = {
                displayName: u.name || '',
                photoURL: u.avatar || ''
            };
        }
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'users', uid), updatedData);
            log(`<span style="color:var(--success)">Profile updated for user ${uid}</span>`);
            app.toggleUserProfileModal();
            app.refreshData(true);
        } catch (err) {
            alert('Failed to update profile: ' + err.message);
        } finally {
            btn.innerText = 'Save Changes'; btn.disabled = false;
        }
    },
    handleRevertProfile: async () => {
        const uid = document.getElementById('modal-user-uid').value;
        const u = state.usersMap[uid];
        if (!u || !u.originalProfile) return;
        if (!confirm('Are you sure you want to revert this user to their original profile?')) return;
        
        try { await requireClearance(); } catch(e) { return; }
        
        const btn = document.getElementById('btn-revert-profile');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Reverting...'; btn.disabled = true;
        const revertData = {
            displayName: u.originalProfile.displayName || '',
            photoURL: u.originalProfile.photoURL || '',
            originalProfile: deleteField(),
            updatedAt: serverTimestamp()
        };
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'users', uid), revertData);
            log(`<span style="color:var(--success)">Profile reverted to original for user ${uid}</span>`);
            app.toggleUserProfileModal();
            app.refreshData(true);
        } catch (err) {
            alert('Failed to revert profile: ' + err.message);
            btn.innerHTML = originalText; btn.disabled = false;
        }
    },
    triggerPasswordReset: async (email) => {
        if (!email) return alert("User has no email address on file.");
        if (!confirm(`Send password reset email to ${email}?`)) return;
        
        try { await requireClearance(); } catch(e) { return; }
        
        try {
            await sendPasswordResetEmail(auth, email);
            log(`<span style="color:var(--info)">Password reset email sent to ${email}</span>`);
            alert(`Password reset link sent to ${email}`);
        } catch (error) {
            alert('Error sending reset email: ' + error.message);
            log(`<span style="color:var(--danger)">Reset Error: ${error.message}</span>`);
        }
    },
    toggleAdminTaskModal: (taskId = null, uid = null, skipUrlUpdate = false) => {
        const modal = document.getElementById('admin-task-modal');
        const form = document.getElementById('admin-task-form');
        if (modal.classList.contains('hidden')) {
            state.editTaskId = taskId || 'new';
            if (uid) state.filterUser = uid;
            if (!skipUrlUpdate) updateURL();
            populateTargetSelectors();
            form.reset();
            const targetSelect = document.getElementById('admin-task-target');
            document.getElementById('admin-task-date').value = new Date().toISOString().split('T')[0];
            if (taskId && taskId !== 'new' && uid) {
                const t = state.tasks.find(x => x.id === taskId && x._uid === uid);
                if (t) {
                    document.getElementById('admin-modal-title').innerText = "Edit Task";
                    document.getElementById('admin-save-task-btn').innerText = "Save Changes";
                    document.getElementById('admin-task-id').value = taskId;
                    targetSelect.value = uid;
                    targetSelect.disabled = true; 
                    document.getElementById('admin-task-title').value = t.title || '';
                    document.getElementById('admin-task-note').value = t.note || '';
                    document.getElementById('admin-task-est').value = t.estimatedPomos || 1;
                    document.getElementById('admin-task-dur').value = t.pomoDuration || 25;
                    document.getElementById('admin-task-priority').value = t.priority || 'none';
                    document.getElementById('admin-task-date').value = t.dueDate || '';
                }
            } else {
                document.getElementById('admin-modal-title').innerText = "New Task";
                document.getElementById('admin-save-task-btn').innerText = "Create Task";
                document.getElementById('admin-task-id').value = '';
                targetSelect.disabled = false;
                if (state.filterUser) targetSelect.value = state.filterUser;
            }
            modal.classList.remove('hidden');
            setTimeout(() => modal.style.opacity = '1', 10);
        } else {
            state.editTaskId = null;
            if (!skipUrlUpdate) updateURL();
            modal.style.opacity = '0';
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    },
    handleAdminSaveTask: async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('admin-task-id').value;
        const target = document.getElementById('admin-task-target').value;
        const btn = document.getElementById('admin-save-task-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Saving...'; btn.disabled = true;
        const data = {
            title: document.getElementById('admin-task-title').value,
            note: document.getElementById('admin-task-note').value,
            estimatedPomos: parseInt(document.getElementById('admin-task-est').value) || 1,
            pomoDuration: parseInt(document.getElementById('admin-task-dur').value) || 25,
            priority: document.getElementById('admin-task-priority').value,
            dueDate: document.getElementById('admin-task-date').value,
            updatedByAdmin: true,
            updatedAt: serverTimestamp()
        };
        try {
            if (taskId) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', target, 'tasks', taskId), data);
                log(`<span style="color:var(--success)">Task updated for user ${target}</span>`);
            } else {
                data.status = 'todo';
                data.createdAt = new Date().toISOString();
                data.project = 'Inbox';
                data.completedSessionIds = [];
                if (target === 'all') {
                    if(!confirm(`Deploy this task to ALL ${state.usersList.length} users?`)) {
                        btn.innerText = originalText; btn.disabled = false; return;
                    }
                    const batch = writeBatch(db);
                    state.usersList.forEach(u => {
                        const newRef = doc(collection(db, 'artifacts', appId, 'users', u.id, 'tasks'));
                        batch.set(newRef, data);
                    });
                    await batch.commit();
                    log(`<span style="color:var(--success)">Task broadcasted to all users.</span>`);
                } else {
                    await addDoc(collection(db, 'artifacts', appId, 'users', target, 'tasks'), data);
                    log(`<span style="color:var(--success)">Task created for user ${target}</span>`);
                }
            }
            app.toggleAdminTaskModal();
            app.refreshData(true);
        } catch(err) {
            alert('Failed to save task: ' + err.message);
        } finally {
            btn.innerText = originalText; btn.disabled = false;
        }
    },
    deleteAdminTask: async (taskId, uid) => {
        if (!confirm('Are you sure you want to permanently delete this task?')) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', uid, 'tasks', taskId));
            log(`<span style="color:var(--warning)">Task deleted for user ${uid}</span>`);
            app.refreshData(true);
        } catch (e) { alert('Error deleting task.'); }
    },
    toggleBroadcastModal: () => {
        const modal = document.getElementById('admin-broadcast-modal');
        const form = document.getElementById('admin-broadcast-form');
        if (modal.classList.contains('hidden')) {
            populateTargetSelectors();
            form.reset();
            modal.classList.remove('hidden');
            setTimeout(() => modal.style.opacity = '1', 10);
        } else {
            modal.style.opacity = '0';
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
    },
    resendBroadcast: (id) => {
        const b = state.broadcasts.find(x => x.id === id);
        if (!b) return;
        document.getElementById('admin-broadcast-target').value = b.target || 'all';
        document.getElementById('admin-broadcast-type').value = b.type || 'info';
        document.getElementById('admin-broadcast-message').value = b.message || '';
        document.getElementById('admin-broadcast-btn-text').value = b.btnText || '';
        document.getElementById('admin-broadcast-btn-url').value = b.btnUrl || '';
        document.getElementById('admin-broadcast-expiry').value = ''; 
        document.getElementById('admin-broadcast-id').value = '';
        document.getElementById('admin-broadcast-title').innerText = "Resend Broadcast";
        document.getElementById('admin-save-broadcast-btn').innerText = "Send New Broadcast";
        const modal = document.getElementById('admin-broadcast-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.style.opacity = '1', 10);
    },
    handleSaveBroadcast: async (e) => {
        e.preventDefault();
        const target = document.getElementById('admin-broadcast-target').value;
        const type = document.getElementById('admin-broadcast-type').value;
        const message = document.getElementById('admin-broadcast-message').value.trim();
        const btnText = document.getElementById('admin-broadcast-btn-text').value.trim();
        const btnUrl = document.getElementById('admin-broadcast-btn-url').value.trim();
        const expiry = document.getElementById('admin-broadcast-expiry').value;
        const btn = document.getElementById('admin-save-broadcast-btn');
        btn.innerText = 'Sending...'; btn.disabled = true;
        const payload = {
            target: target,
            type: type,
            message: message,
            createdAt: serverTimestamp(),
            createdBy: 'admin',
            readBy: []
        };
        if (btnText && btnUrl) {
            payload.btnText = btnText;
            payload.btnUrl = btnUrl;
        }
        if (expiry) {
            payload.expiresAt = new Date(expiry).toISOString();
        }
        try {
            await addDoc(collection(db, 'artifacts', appId, 'broadcasts'), payload);
            log(`<span style="color:var(--success)">Broadcast sent successfully.</span>`);
            app.toggleBroadcastModal();
            app.refreshData(true);
        } catch(err) {
            alert('Failed to send broadcast: ' + err.message);
        } finally {
            btn.innerText = 'Send Broadcast'; btn.disabled = false;
        }
    },
    deleteBroadcast: async (id) => {
        if (!confirm('Delete this broadcast message?')) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'broadcasts', id));
            log(`<span style="color:var(--warning)">Broadcast message removed.</span>`);
            app.refreshData(true);
        } catch (e) { alert('Error deleting broadcast.'); }
    },
    refreshData: async (forceRefresh = true) => {
        try {
            if (!forceRefresh && loadCache()) {
                renderAll();
                if (isInitialLoad) { isInitialLoad = false; applyUrlState(); }
                return;
            }
            log('Fetching LIVE data from Firestore...');
            const qLogs = query(collectionGroup(db, 'monthly_logs'));
            const snapLogs = await getDocs(qLogs);
            let allSessions = [];
            snapLogs.docs.forEach(d => {
                const uid = d.ref.parent?.parent?.id || 'unknown';
                const data = d.data();
                if (data.sessions && Array.isArray(data.sessions)) {
                    data.sessions.forEach(s => {
                        allSessions.push({ ...s, _uid: uid });
                    });
                }
            });
            allSessions.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
            state.sessions = allSessions.slice(0, 500);
            const qTasks = query(collectionGroup(db, 'tasks'), limit(500));
            const snapTasks = await getDocs(qTasks);
            state.tasks = snapTasks.docs.map(d => { 
                const uid = d.ref.parent?.parent?.id || 'unknown'; 
                return { id: d.id, ...d.data(), _uid: uid }; 
            });
            const qUsers = query(collection(db, 'artifacts', appId, 'users'));
            const snapUsers = await getDocs(qUsers);
            state.usersList = snapUsers.docs.map(d => ({ id: d.id, ...d.data() }));
            const qBroadcasts = query(collection(db, 'artifacts', appId, 'broadcasts'), orderBy('createdAt', 'desc'));
            const snapBroadcasts = await getDocs(qBroadcasts);
            state.broadcasts = snapBroadcasts.docs.map(d => ({ id: d.id, ...d.data() }));
            saveCache(); renderAll();
            if (isInitialLoad) {
                isInitialLoad = false;
                applyUrlState();
            }
        } catch (e) { 
            log(`ERROR: ${e.message}`); 
        }
    },
    showFullscreenAvatar: (url, uid) => {
        const overlay = document.getElementById('fullscreen-avatar-overlay');
        const img = document.getElementById('fullscreen-avatar-img');
        const originalBtnContainer = document.getElementById('fs-original-pic-container');
        const originalBtn = document.getElementById('fs-btn-original-pic');
        const originalBtnText = document.getElementById('fs-btn-original-text');
        if (!url || !uid) return;
        const highResCurrent = url.replace(/=s\d+-c/g, '=s1024-c');
        const u = state.usersMap[uid];
        if(u) {
            document.getElementById('fs-user-name').innerText = u.name || 'Unknown User';
            document.getElementById('fs-user-email').innerText = u.email || 'No Email';
            document.getElementById('fs-user-provider').innerText = u.provider || 'UNKNOWN';
            document.getElementById('fs-user-uid').innerText = uid;
            
            const fsPhone = document.getElementById('fs-user-phone');
            if (fsPhone) fsPhone.innerText = u.phone || 'N/A';
            const fsCountry = document.getElementById('fs-user-country');
            if (fsCountry) fsCountry.innerText = u.country || 'N/A';
            const fsGender = document.getElementById('fs-user-gender');
            if (fsGender) fsGender.innerText = u.gender || 'N/A';

            if (u.originalProfile && u.originalProfile.photoURL && u.originalProfile.photoURL !== url) {
                const highResOriginal = u.originalProfile.photoURL.replace(/=s\d+-c/g, '=s1024-c');
                originalBtnContainer.style.display = 'block';
                let showingOriginal = false;
                originalBtnText.innerText = 'View Original Avatar';
                originalBtn.onclick = () => {
                    showingOriginal = !showingOriginal;
                    if (showingOriginal) {
                        img.src = highResOriginal;
                        originalBtnText.innerText = 'View Current Avatar';
                    } else {
                        img.src = highResCurrent;
                        originalBtnText.innerText = 'View Original Avatar';
                    }
                };
            } else {
                originalBtnContainer.style.display = 'none';
            }
        }
        img.src = highResCurrent;
        overlay.classList.remove('hidden');
    },
    exportSingleUser: () => {
        const uid = document.getElementById('modal-user-uid').value;
        const user = state.usersList.find(u => u.id === uid) || state.usersMap[uid];
        const tasks = state.tasks.filter(t => t._uid === uid);
        const sessions = state.sessions.filter(s => s._uid === uid);
        if (!user) return alert("User data not found.");
        const exportObj = {
            meta: { version: '1.0', exportDate: new Date().toISOString(), type: 'single_user', originalUid: uid },
            userProfile: user,
            tasks: tasks,
            sessions: sessions
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = `orion_user_${uid.slice(0,6)}_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        log(`<span style="color: var(--info);">Exported data package for user ${uid}.</span>`);
    },
    importSingleUser: async (input) => {
        const targetUid = document.getElementById('modal-user-uid').value;
        const importMode = document.getElementById('single-user-import-mode')?.value || 'both'; 
        if (!input.files || !input.files[0]) return;
        const targetUser = state.usersMap[targetUid];
        const targetLabel = targetUser ? `${targetUser.name || targetUser.email} (${targetUid})` : targetUid;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.meta?.type !== 'single_user') {
                    input.value = '';
                    return alert("Invalid file type. Please upload a specific user JSON export.");
                }
                if (data.meta.originalUid !== targetUid) {
                    const origUid = data.meta.originalUid;
                    const origName = data.userProfile ? (data.userProfile.displayName || data.userProfile.name || data.userProfile.email) : 'Unknown User';
                    const origLabel = `${origName} (${origUid})`;
                    if (!confirm(`Warning: This backup belongs to:\n${origLabel}\n\nImporting will reassign this data to the current user:\n${targetLabel}\n\nContinue?`)) {
                        input.value = '';
                        return;
                    }
                }
                const importBtn = input.nextElementSibling;
                const originalHtml = importBtn.innerHTML;
                importBtn.innerHTML = 'Uploading...';
                importBtn.disabled = true;
                const batch = writeBatch(db);
                let tasksCount = 0;
                let sessionsCount = 0;
                if (importMode === 'tasks' || importMode === 'both') {
                    const newTasks = data.tasks || [];
                    newTasks.forEach(t => {
                        const taskData = { ...t };
                        delete taskData._uid; 
                        delete taskData.id;   
                        if (typeof taskData.createdAt === 'string') taskData.createdAt = new Date(taskData.createdAt).getTime();
                        if (typeof taskData.completedAt === 'string') taskData.completedAt = new Date(taskData.completedAt).getTime();
                        const newRef = doc(collection(db, 'artifacts', appId, 'users', targetUid, 'tasks'));
                        batch.set(newRef, taskData);
                        tasksCount++;
                    });
                }
                if (importMode === 'sessions' || importMode === 'both') {
                    const newSessions = data.sessions || [];
                    if (newSessions.length > 0) {
                        const sessionsByMonth = {};
                        newSessions.forEach(s => {
                            const sData = { ...s };
                            delete sData._uid; 
                            if (typeof sData.completedAt === 'string') {
                                sData.completedAt = new Date(sData.completedAt).getTime();
                            }
                            let d = new Date();
                            if (sData.completedAt) d = new Date(sData.completedAt);
                            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            if (!sessionsByMonth[monthStr]) sessionsByMonth[monthStr] = [];
                            sessionsByMonth[monthStr].push(sData);
                        });
                        Object.keys(sessionsByMonth).forEach(monthStr => {
                            const logRef = doc(db, 'artifacts', appId, 'users', targetUid, 'monthly_logs', monthStr);
                            batch.set(logRef, {
                                month: monthStr, 
                                sessions: arrayUnion(...sessionsByMonth[monthStr]),
                                importedAt: serverTimestamp()
                            }, { merge: true }); 
                        });
                        sessionsCount = newSessions.length;
                    }
                }
                if (tasksCount === 0 && sessionsCount === 0) {
                    alert("No matching data found in file for the selected import mode.");
                    importBtn.innerHTML = originalHtml;
                    importBtn.disabled = false;
                    return;
                }
                await batch.commit();
                await app.refreshData(true); 
                importBtn.innerHTML = originalHtml;
                importBtn.disabled = false;
                let successMessage = `Success! Pushed to Live Database for ${targetUser?.name || 'User'}:\n`;
                if (tasksCount > 0) successMessage += `✓ ${tasksCount} Tasks\n`;
                if (sessionsCount > 0) successMessage += `✓ ${sessionsCount} Sessions\n`;
                alert(successMessage);
            } catch (err) {
                alert('Error parsing JSON file or writing to the database.');
                console.error(err);
                input.nextElementSibling.innerHTML = '<i class="ph-bold ph-upload-simple" style="margin-right: 4px;"></i> Import';
                input.nextElementSibling.disabled = false;
            }
        };
        reader.readAsText(input.files[0]);
        input.value = ''; 
    },
    resetUserData: async (btn) => {
        const targetUid = document.getElementById('modal-user-uid').value;
        if (!targetUid) return;
        const u = state.usersMap[targetUid];
        const userName = u ? (u.name || u.email) : targetUid;
        if (!confirm(`DANGER: Are you absolutely sure you want to permanently delete ALL tasks and sessions for ${userName}? This cannot be undone.`)) {
            return;
        }
        
        try { await requireClearance(); } catch(e) { return; }
        
        try {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = 'Deleting...';
            btn.disabled = true;
            const tasksQ = query(collection(db, 'artifacts', appId, 'users', targetUid, 'tasks'));
            const logsQ = query(collection(db, 'artifacts', appId, 'users', targetUid, 'monthly_logs'));
            const [tasksSnap, logsSnap] = await Promise.all([getDocs(tasksQ), getDocs(logsQ)]);
            const batch = writeBatch(db);
            tasksSnap.forEach(d => batch.delete(d.ref));
            logsSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
            state.tasks = state.tasks.filter(t => t._uid !== targetUid);
            state.sessions = state.sessions.filter(s => s._uid !== targetUid);
            saveCache();
            await app.refreshData(true);
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            alert(`Successfully deleted ${tasksSnap.size} tasks and ${logsSnap.size} session logs for ${userName}.`);
            log(`<span style="color: var(--warning);">Reset data (deleted ${tasksSnap.size} tasks, ${logsSnap.size} logs) for user ${targetUid.slice(0,6)}...</span>`);
        } catch (err) {
            alert('Error resetting user data: ' + err.message);
            console.error(err);
            btn.innerHTML = `<i class="ph-bold ph-trash" style="margin-right: 4px;"></i> Delete Data`;
            btn.disabled = false;
        }
    },
};

window.app = app;

function processUsers(){
    const map={};
    state.usersList.forEach(u=>{ 
        map[u.id]={ 
            uid:u.id, 
            name:u.displayName||u.name||u.email.split('@')[0], 
            email:u.email, 
            avatar:u.photoURL, 
            provider:u.providerId||'Unknown', 
            tasks:0, focus:0, 
            lastActive:u.lastLogin ? (u.lastLogin.seconds ? u.lastLogin.seconds*1000 : u.lastLogin) : 0, 
            profileLoaded:true,
            originalProfile: u.originalProfile || null,
            phone: u.phone || '',
            country: u.country || '',
            gender: u.gender || ''
        }; 
    });
    state.tasks.forEach(t=>{ if(!map[t._uid])map[t._uid]={uid:t._uid,tasks:0,focus:0,lastActive:0,profileLoaded:false,name:'Anonymous',email:t._uid}; map[t._uid].tasks++; });
    state.sessions.forEach(s=>{
        if(!map[s._uid])map[s._uid]={uid:s._uid,tasks:0,focus:0,lastActive:0,profileLoaded:false,name:'Anonymous',email:s._uid};
        map[s._uid].focus+=(s.duration||25);
        const t=s.completedAt ? (s.completedAt.seconds ? s.completedAt.seconds*1000 : s.completedAt) : 0;
        if(t>map[s._uid].lastActive)map[s._uid].lastActive=t;
    });
    state.usersMap=map;
}

function renderUsersTable(){
    const tbody=document.getElementById('users-table-body');
    let users=Object.values(state.usersMap);
    if(state.showStarredOnly) users = users.filter(u => state.starred.includes(u.uid));
    
    const q = state.userSearchQuery ? state.userSearchQuery.toLowerCase() : '';
    if(q) {
        users = users.filter(u => {
            const searchStr = `${u.name||''} ${u.email||''} ${u.phone||''} ${u.country||''} ${u.gender||''} ${u.provider||''}`.toLowerCase();
            return searchStr.includes(q);
        });
    }

    const { col, dir } = state.sort.users;
    users.sort((a, b) => {
        let valA = a[col] || '', valB = b[col] || '';
        if (col === 'name') { valA = (a.name||a.email).toLowerCase(); valB = (b.name||b.email).toLowerCase(); }
        if (col === 'country') { valA = (a.country||'').toLowerCase(); valB = (b.country||'').toLowerCase(); }
        if (col === 'gender') { valA = (a.gender||'').toLowerCase(); valB = (b.gender||'').toLowerCase(); }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    if(users.length===0){ tbody.innerHTML=`<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1rem;">No user data found.</td></tr>`; return; }
    
    tbody.innerHTML=users.map(u=>{
        const last=u.lastActive?new Date(u.lastActive).toLocaleDateString()+' '+new Date(u.lastActive).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Never';
        const h=Math.floor(u.focus/60);
        const isStarred = state.starred.includes(u.uid);
        const starIconClass = isStarred ? "ph-fill ph-star" : "ph-bold ph-star";
        const starColor = isStarred ? "color: var(--warning);" : "color: var(--text-muted);";
        let avatarHTML=u.avatar?`<img src="${u.avatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">`:`<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(to bottom right, var(--info), #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff;">${(u.name||u.email||'?').charAt(0).toUpperCase()}</div>`;
        
        const hlName = highlightText(u.name||'No Name', q);
        const hlEmail = highlightText(u.email||'No Email', q);
        const hlPhone = highlightText(u.phone||'', q);
        const hlCountry = highlightText(u.country||'-', q);
        const hlProvider = highlightText(u.provider, q);

        const phoneStr = u.phone ? `<div style="font-size: 0.75rem; color: var(--text-faint); margin-top: 4px;"><i class="ph-bold ph-phone" style="margin-right: 4px;"></i>${hlPhone}</div>` : '';

        return `
        <tr>
            <td style="text-align: center;"><button onclick="app.toggleStar('${u.uid}')" style="background:none; border:none; cursor:pointer;"><i class="${starIconClass}" style="font-size: 1.125rem; ${starColor}"></i></button></td>
            <td>${avatarHTML}</td>
            <td>
                <div style="color: #fff; font-weight: 500; font-size: 0.875rem;">${hlName}</div>
                <div style="font-size: 0.8125rem; color: var(--text-muted);">${hlEmail}</div>
                ${phoneStr}
            </td>
            <td><span style="padding: 4px 8px; border-radius: 4px; background: var(--bg-main); border: 1px solid var(--border); font-size: 0.8125rem; color: var(--text-muted);">${hlProvider}</span></td>
            <td><div style="font-weight: 500; color: #fff; font-size: 0.875rem;">${hlCountry}</div></td>
            <td><div style="text-transform: capitalize; color: var(--text-muted); font-size: 0.875rem;">${u.gender ? u.gender.replace(/-/g, ' ') : '-'}</div></td>
            <td>
                <div class="flex flex-col gap-1">
                    <span style="font-size: 0.8125rem; color: var(--text-muted);"><strong style="color: #fff;">${u.tasks}</strong> tasks</span><br>
                    <span style="font-size: 0.8125rem; color: var(--brand);"><strong style="color: var(--brand);">${h}h ${u.focus%60}m</strong> focus</span>
                </div>
            </td>
            <td style="color: var(--text-muted); font-size: 0.8125rem;">${last}</td>
            <td style="text-align: right;">
                <div class="flex items-center justify-end" style="gap: 0.5rem;">
                    <button onclick="app.toggleUserProfileModal('${u.uid}')" class="btn btn-outline text-xs" title="Manage Profile"><i class="ph-bold ph-user-gear" style="margin-right: 4px;"></i> Manage</button>
                    <button onclick="app.viewAsUser('${u.uid}')" class="btn text-xs" style="background: var(--brand-dim); color: var(--brand); border: 1px solid rgba(255,87,87,0.2);" title="Simulate User View"><i class="ph-bold ph-app-window" style="margin-right: 4px;"></i> App</button>
                    <button onclick="app.filterTasksByUser('${u.uid}')" class="btn btn-outline text-xs" title="View User Tasks"><i class="ph-bold ph-list-magnifying" style="margin-right: 4px;"></i> Tasks</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

const fmtTime=(m)=>{ const h=Math.floor(m/60); const rm=m%60; if(h===0&&rm===0)return'0m'; return h>0?`${h}h ${rm}m`:`${rm}m`; };

const getDateLabel=(dateStr)=>{
    if(!dateStr)return'No Due Date';
    const today=new Date().toISOString().split('T')[0];
    const tomorrow=new Date(Date.now()+86400000).toISOString().split('T')[0];
    if(dateStr<today)return'Overdue'; if(dateStr===today)return'Today'; if(dateStr===tomorrow)return'Tomorrow'; return dateStr;
};

function renderTasksTable() {
    const tbody = document.getElementById('tasks-table-body');
    let filteredTasks = state.tasks;

    if (state.filterUser) {
        filteredTasks = filteredTasks.filter(t => t._uid === state.filterUser);
        const u = state.usersMap[state.filterUser];
        document.getElementById('tasks-header-title').innerHTML = `Tasks for <span style="color: var(--brand);">${u ? (u.name || u.email) : 'User'}</span>`;
        document.getElementById('clear-filter-btn').classList.remove('hidden');
    } else {
        document.getElementById('tasks-header-title').innerText = "Global Task Master List";
        document.getElementById('clear-filter-btn').classList.add('hidden');
    }

    const preset = state.taskPresetFilter || 'all';
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayTs = Date.now() - (24 * 60 * 60 * 1000);

    const getTs = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return new Date(val).getTime();
        if (val.seconds) return val.seconds * 1000;
        return 0;
    };

    if (preset === 'high') {
        filteredTasks = filteredTasks.filter(t => t.priority === 'high');
    } else if (preset === 'overdue') {
        filteredTasks = filteredTasks.filter(t => t.dueDate && t.dueDate < todayStr && t.status !== 'done');
    } else if (preset === 'recent') {
        filteredTasks = filteredTasks.filter(t => Math.max(getTs(t.createdAt), getTs(t.updatedAt)) > yesterdayTs);
    }

    const tq = state.taskSearchQuery ? state.taskSearchQuery.toLowerCase() : '';
    if (tq) {
        filteredTasks = filteredTasks.filter(t => {
            const uName = state.usersMap[t._uid] ? (state.usersMap[t._uid].name || state.usersMap[t._uid].email) : '';
            const searchStr = `${t.title||''} ${t.project||''} ${t.subtasks ? t.subtasks.join(' ') : ''} ${uName}`.toLowerCase();
            return searchStr.includes(tq);
        });
    }

    if (filteredTasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1rem;">No tasks match the current filters.</td></tr>`;
        return;
    }

    const { col, dir } = state.sort.tasks;
    filteredTasks.sort((a, b) => {
        let valA = a[col] || '', valB = b[col] || '';
        if (col === 'priority') {
            const pMap = { high: 3, med: 2, low: 1, none: 0 };
            valA = pMap[a.priority || 'none']; valB = pMap[b.priority || 'none'];
        }
        if (col === 'dueDate') {
            valA = a.dueDate || '9999-99-99'; valB = b.dueDate || '9999-99-99';
        }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    const renderFlat = col !== 'dueDate';
    let html = '';
    
    if (!renderFlat) {
        const groups = {}; 
        const sortOrder = ['Overdue', 'Today', 'Tomorrow', 'No Due Date'];
        filteredTasks.forEach(t => { 
            const l = getDateLabel(t.dueDate); 
            if (!groups[l]) groups[l] = []; 
            groups[l].push(t); 
        });
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idxA = sortOrder.indexOf(a), idxB = sortOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB; 
            if (idxA !== -1) return -1; 
            if (idxB !== -1) return 1;
            if (a === 'No Due Date') return 1; 
            if (b === 'No Due Date') return -1; 
            return a.localeCompare(b);
        });
        
        sortedKeys.forEach(label => {
            html += `<tr style="background: rgba(20,20,20,0.5);"><td colspan="6" style="padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 700; color: var(--brand); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border);">${label}</td></tr>`;
            html += groups[label].map(t => generateTaskRowHtml(t, tq)).join('');
        });
    } else {
        html += filteredTasks.map(t => generateTaskRowHtml(t, tq)).join('');
    }
    
    tbody.innerHTML = html;
}

function generateTaskRowHtml(t, query = '') {
    const icon=t.status==='done'?'<i class="ph-fill ph-check-circle" style="color: var(--success); font-size: 1.125rem;"></i>':'<i class="ph-regular ph-circle" style="color: var(--text-muted); font-size: 1.125rem;"></i>';
    const priBadge={
        high:'<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);">HIGH</span>',
        med:'<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);">MED</span>',
        low:'<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(59, 130, 246, 0.1); color: var(--info); border: 1px solid rgba(59, 130, 246, 0.2);">LOW</span>',
        none:'<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: var(--bg-card); color: var(--text-faint); border: 1px solid var(--border);">NONE</span>'
    }[t.priority||'none'];
    
    const dur = t.pomoDuration || 25; 
    const estPomos = t.estimatedPomos || 1; 
    const donePomos = t.completedSessionIds ? t.completedSessionIds.length : 0;
    
    const u = state.usersMap[t._uid]; 
    const rawUName = u ? (u.name || u.email) : 'Unknown';

    const hlTitle = highlightText(t.title || 'Untitled', query);
    const hlProject = highlightText(t.project || 'Inbox', query);
    const hlUser = highlightText(rawUName, query);

    const userTag = !state.filterUser ? `<div style="font-size: 11px; color: var(--text-faint); margin-top: 4px;"><i class="ph-bold ph-user"></i> ${hlUser}</div>` : '';
    const subHtml = (t.subtasks && t.subtasks.length > 0) ? `<div style="margin-top: 8px;">${t.subtasks.map(s => `<div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center;"><i class="ph-bold ph-caret-right" style="margin-right: 4px; color: var(--text-faint);"></i>${highlightText(s, query)}</div>`).join('')}</div>` : '';
    
    return `
    <tr class="task-row">
        <td style="vertical-align: top; padding-top: 1.25rem;">${icon}</td>
        <td style="vertical-align: top;">
            <div style="color: #fff; font-weight: 500; font-size: 0.875rem;">${hlTitle}</div>${subHtml}
            <div style="display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap;">
                <span style="background: var(--bg-main); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); font-size: 11px; color: var(--text-muted);">${hlProject}</span>
                ${userTag}
            </div>
        </td>
        <td style="vertical-align: top; padding-top: 1.25rem;">${priBadge}</td>
        <td style="vertical-align: top; padding-top: 1.25rem;">
            <div style="font-size: 0.8125rem; color: #fff; font-family: monospace;"><span style="color: var(--brand); font-weight: 700;">${donePomos}</span> / ${estPomos}</div>
            <div style="width: 64px; height: 4px; background: var(--bg-main); border-radius: 999px; margin-top: 4px; overflow: hidden;"><div style="height: 100%; background: var(--brand); width:${Math.min((donePomos/estPomos)*100,100)}%;"></div></div>
        </td>
        <td style="vertical-align: top; padding-top: 1.25rem;">
            <div style="font-size: 0.8125rem; color: var(--text-muted);">${fmtTime(donePomos*dur)} / ${fmtTime(estPomos*dur)}</div>
        </td>
        <td style="vertical-align: top; padding-top: 1.25rem; text-align: right;">
            <div style="color: var(--text-muted); font-size: 0.8125rem; font-family: monospace; margin-bottom: 0.5rem;">${t.dueDate||'-'}</div>
            <div class="flex items-center justify-end gap-1">
                <button onclick="app.toggleAdminTaskModal('${t.id}', '${t._uid}')" class="btn btn-icon text-xs"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                <button onclick="app.deleteAdminTask('${t.id}', '${t._uid}')" class="btn btn-icon text-xs text-danger hover:text-danger"><i class="ph-bold ph-trash text-sm"></i></button>
            </div>
        </td>
    </tr>`;
}

function renderBroadcastsTable(){
    const tbody=document.getElementById('broadcasts-table-body');
    if(!state.broadcasts || state.broadcasts.length === 0) {
        tbody.innerHTML=`<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">No broadcasts found.</td></tr>`;
        return;
    }
    const { col, dir } = state.sort.broadcasts;
    let sortedBroadcasts = [...state.broadcasts];
    sortedBroadcasts.sort((a, b) => {
        let valA = a[col], valB = b[col];
        if (col === 'createdAt') { 
            valA = a.createdAt ? a.createdAt.seconds : 0; 
            valB = b.createdAt ? b.createdAt.seconds : 0; 
        }
        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
    tbody.innerHTML=sortedBroadcasts.map(b=>{
        const d = b.createdAt ? new Date(b.createdAt.seconds * 1000).toLocaleString() : 'Just now';
        let typeBadge = '';
        if(b.type === 'info') typeBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(59, 130, 246, 0.1); color: var(--info); border: 1px solid rgba(59, 130, 246, 0.2);">INFO</span>`;
        else if(b.type === 'warning') typeBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);">WARNING</span>`;
        else if(b.type === 'alert') typeBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);">ALERT</span>`;
        else typeBadge = `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2);">SUCCESS</span>`;
        let targetLbl = b.target === 'all' ? 'GLOBAL' : (state.usersMap[b.target] ? state.usersMap[b.target].name || state.usersMap[b.target].email : b.target);
        const icon = b.type === 'alert' ? 'ph-warning-circle' : 'ph-megaphone';
        const reads = b.readBy ? b.readBy.length : 0;
        const isExpired = b.expiresAt && new Date(b.expiresAt) < new Date();
        const statusBadge = isExpired 
            ? `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);">EXPIRED</span>` 
            : `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; background: rgba(16, 185, 129, 0.1); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2);">ACTIVE</span>`;
        let btnIndicator = b.btnText ? `<div style="font-size:11px; color:var(--brand); margin-top:4px;"><i class="ph-bold ph-link"></i> ${b.btnText}</div>` : '';
        return `
        <tr>
            <td style="vertical-align: top;"><i class="ph-fill ${icon}" style="color: var(--text-muted); font-size: 1.25rem;"></i></td>
            <td style="vertical-align: top;">
                <div style="color: #fff; font-weight: 500; font-size: 0.875rem; max-width: 400px; white-space: pre-wrap;">${b.message}</div>
                ${btnIndicator}
            </td>
            <td style="vertical-align: top; padding-top: 1.25rem;">
                <span style="color: var(--text-muted); font-size: 0.8125rem; font-family: monospace;">${targetLbl}</span>
                <div style="margin-top: 8px;">${typeBadge}</div>
            </td>
            <td style="vertical-align: top; padding-top: 1.25rem;">
                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">
                    ${statusBadge}
                    <div style="font-size:11px; color:var(--text-muted);"><i class="ph-bold ph-eye"></i> <strong style="color:#fff;">${reads}</strong> views</div>
                    <span style="color: var(--text-faint); font-size: 0.75rem;">Sent: ${d}</span>
                </div>
            </td>
            <td style="vertical-align: top; padding-top: 1.25rem; text-align: right;">
                <div class="flex items-center justify-end gap-1">
                    <button onclick="app.resendBroadcast('${b.id}')" class="btn btn-icon text-xs text-info" title="Duplicate & Resend"><i class="ph-bold ph-paper-plane-right text-sm"></i></button>
                    <button onclick="app.deleteBroadcast('${b.id}')" class="btn btn-icon text-xs text-danger" title="Delete"><i class="ph-bold ph-trash text-sm"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function updateKPIs(){
    const totalTime=state.sessions.reduce((a,b)=>a+(b.duration||25),0);
    document.getElementById('kpi-users').innerText=Object.keys(state.usersMap).length;
    document.getElementById('kpi-focus').innerText=`${Math.floor(totalTime/60)}h`;
    document.getElementById('kpi-tasks').innerText=state.tasks.length;
    document.getElementById('kpi-avg').innerText=`${state.sessions.length?Math.round(totalTime/state.sessions.length):0}m`;
    const rate=state.tasks.length?Math.round((state.tasks.filter(t=>t.status==='done').length/state.tasks.length)*100):0;
    const priRate=state.tasks.length?Math.round((state.tasks.filter(t=>t.priority==='high').length/state.tasks.length)*100):0;
    document.getElementById('health-completion').innerText=`${rate}%`; document.getElementById('bar-completion').style.width=`${rate}%`;
    document.getElementById('health-priority').innerText=`${priRate}%`; document.getElementById('bar-priority').style.width=`${priRate}%`;
}

function updateFeed(){
    const b=document.getElementById('live-feed-body');
    if(state.sessions.length===0){b.innerHTML=`<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem; font-style: italic;">No recent activity.</td></tr>`;return;}
    b.innerHTML=state.sessions.slice(0,20).map(s=>{
        const d=new Date(s.completedAt ? (typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000) : new Date().getTime());
        return `<tr><td style="color: var(--text-muted);">${d.toLocaleDateString()} <span style="color: var(--text-faint);">${d.toLocaleTimeString()}</span></td><td style="color: #fff; font-weight: 500;">${s.taskTitle||'Unknown Task'}</td><td style="color: var(--brand);">${s.duration||25}m</td></tr>`;
    }).join('');
}

function updateCharts() {
    const now = new Date();
    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date(); d.setDate(now.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });
    const displayLabels = last7Days.map(dKey => new Date(dKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

    const cOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#2a2a2a', drawBorder: false } }, x: { grid: { display: false, drawBorder: false } } } };

    const focusData = last7Days.map(dateKey => {
        return state.sessions.filter(s => {
            if(!s.completedAt) return false;
            const sDate = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
            return sDate.toISOString().split('T')[0] === dateKey;
        }).reduce((acc, s) => acc + (s.duration || 25), 0);
    });

    if(state.charts.activity) state.charts.activity.destroy();
    state.charts.activity = new Chart(document.getElementById('activityChart').getContext('2d'), {
        type: 'bar',
        data: { labels: displayLabels, datasets: [{ label: 'Focus Minutes', data: focusData, backgroundColor: 'rgba(255, 87, 87, 0.9)', borderRadius: 4 }] },
        options: cOpts
    });

    const taskData = last7Days.map(dateKey => {
        return state.tasks.filter(t => {
            if(t.status !== 'done' || !t.completedAt) return false;
            let tDate = new Date(typeof t.completedAt === 'string' ? t.completedAt : (t.completedAt.seconds ? t.completedAt.seconds * 1000 : t.completedAt));
            return tDate.toISOString().split('T')[0] === dateKey;
        }).length;
    });

    if(state.charts.taskCompletion) state.charts.taskCompletion.destroy();
    state.charts.taskCompletion = new Chart(document.getElementById('taskBarChart').getContext('2d'), {
        type: 'bar',
        data: { labels: displayLabels, datasets: [{ label: 'Tasks Completed', data: taskData, backgroundColor: 'rgba(59, 130, 246, 0.9)', borderRadius: 4 }] },
        options: cOpts
    });

    const todayHours = Array(24).fill(0);
    const todayStr = now.toISOString().split('T')[0];
    state.sessions.forEach(s => {
        if(!s.completedAt) return;
        const sDate = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
        if(sDate.toISOString().split('T')[0] === todayStr) {
            todayHours[sDate.getHours()] += (s.duration || 25);
        }
    });

    if(state.charts.todayTimeline) state.charts.todayTimeline.destroy();
    state.charts.todayTimeline = new Chart(document.getElementById('todayTimelineChart').getContext('2d'), {
        type: 'line',
        data: { labels: Array.from({ length: 24 }, (_, i) => i + 'h'), datasets: [{ label: 'Minutes', data: todayHours, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.4, borderWidth: 2 }] },
        options: cOpts
    });

    const allHours = Array(24).fill(0);
    state.sessions.forEach(s => {
        if(!s.completedAt) return;
        const sDate = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
        allHours[sDate.getHours()] += (s.duration || 25);
    });

    if(state.charts.hourly) state.charts.hourly.destroy();
    state.charts.hourly = new Chart(document.getElementById('hourlyChart').getContext('2d'), {
        type: 'bar',
        data: { labels: Array.from({ length: 24 }, (_, i) => i), datasets: [{ label: 'Minutes', data: allHours, backgroundColor: '#10b981', borderRadius: 4 }] },
        options: cOpts
    });

    const weekdays = Array(7).fill(0);
    state.sessions.forEach(s => {
        if(!s.completedAt) return;
        const sDate = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
        const wd = sDate.getDay();
        weekdays[wd === 0 ? 6 : wd - 1] += (s.duration || 25);
    });

    if(state.charts.weekday) state.charts.weekday.destroy();
    state.charts.weekday = new Chart(document.getElementById('weekdayChart').getContext('2d'), {
        type: 'bar',
        data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ label: 'Minutes', data: weekdays, backgroundColor: '#f59e0b', borderRadius: 4 }] },
        options: cOpts
    });

    const projs = {};
    state.sessions.forEach(s => { const p = s.project || 'Inbox'; projs[p] = (projs[p] || 0) + 1; });
    const sortedProj = Object.entries(projs).sort((a,b) => b[1] - a[1]).slice(0,5);

    if(state.charts.proj) state.charts.proj.destroy();
    state.charts.proj = new Chart(document.getElementById('projectDistChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: sortedProj.map(x=>x[0]), datasets: [{ data: sortedProj.map(x=>x[1]), backgroundColor: ['#ff5757','#3b82f6','#10b981','#f59e0b','#8b5cf6'], borderWidth: 2, borderColor: '#1e1e1e', hoverOffset: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
    
    document.getElementById('top-projects-list').innerHTML = sortedProj.map((p,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;padding:0.5rem;border-radius:4px;transition:background 0.2s;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <div style="display:flex;align-items:center;">
                <span style="width:8px;height:8px;border-radius:50%;margin-right:12px;background:${['#ff5757','#3b82f6','#10b981','#f59e0b','#8b5cf6'][i]}"></span>
                <span style="color:#fff;">${p[0]}</span>
            </div>
            <span style="color:var(--text-muted);font-family:monospace;">${p[1]} sessions</span>
        </div>
    `).join('');

    const pri = { high: 0, med: 0, low: 0, none: 0 };
    state.tasks.forEach(t => pri[t.priority || 'none']++);
    const totalTasksPri = state.tasks.length || 1;

    if(state.charts.priority) state.charts.priority.destroy();
    state.charts.priority = new Chart(document.getElementById('priorityChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['High', 'Medium', 'Low', 'None'], datasets: [{ data: [pri.high, pri.med, pri.low, pri.none], backgroundColor: ['#ef4444', '#eab308', '#3b82f6', '#525252'], borderWidth: 2, borderColor: '#1e1e1e', hoverOffset: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });

    const priData = [
        { label: 'High Priority', count: pri.high, color: '#ef4444' },
        { label: 'Medium Priority', count: pri.med, color: '#eab308' },
        { label: 'Low Priority', count: pri.low, color: '#3b82f6' },
        { label: 'No Priority', count: pri.none, color: '#525252' }
    ];
    document.getElementById('priority-rank-list').innerHTML = priData.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;padding:0.6rem;border-radius:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:8px;height:8px;border-radius:50%;background-color:${p.color};"></div>
                <span style="color:var(--text-muted);">${p.label}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="color:#fff;font-family:monospace;font-weight:700;">${p.count}</span>
                <span style="color:var(--text-faint);font-size:0.75rem;width:32px;text-align:right;">${Math.round((p.count/totalTasksPri)*100)}%</span>
            </div>
        </div>
    `).join('');

    const tagsCount = {};
    state.tasks.forEach(t => { if(t.tags) t.tags.forEach(tag => tagsCount[tag] = (tagsCount[tag] || 0) + 1); });
    const sortedTags = Object.entries(tagsCount).sort((a,b) => b[1] - a[1]).slice(0, 10);
    
    const tagList = document.getElementById('tag-rank-list');
    if (sortedTags.length > 0) {
        tagList.innerHTML = sortedTags.map((t, i) => `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.875rem;">
                <div style="display:flex;align-items:center;">
                    <span style="color:var(--text-faint);width:20px;font-weight:700;">${i+1}.</span>
                    <span style="background:var(--hover);color:#fff;padding:4px 8px;border-radius:4px;border:1px solid var(--border);">${t[0]}</span>
                </div>
                <span style="color:var(--text-muted);font-family:monospace;">${t[1]} tasks</span>
            </div>
        `).join('');
    } else {
        tagList.innerHTML = '<p class="text-xs text-muted" style="font-style:italic;">No tags data available.</p>';
    }

    const genderCounts = { male: 0, female: 0, 'non-binary': 0, other: 0, 'prefer-not-to-say': 0, unknown: 0 };
    Object.values(state.usersMap).forEach(u => {
        const g = u.gender ? u.gender.toLowerCase() : 'unknown';
        if (genderCounts[g] !== undefined) {
            genderCounts[g]++;
        } else {
            genderCounts['unknown']++; 
        }
    });

    const genderLabels = [];
    const genderData = [];
    const genderColors = [];
    const gColorMap = {
        male: '#3b82f6',             
        female: '#ec4899',           
        'non-binary': '#8b5cf6',     
        other: '#f59e0b',            
        'prefer-not-to-say': '#64748b', 
        unknown: '#334155'           
    };

    Object.keys(genderCounts).forEach(k => {
        if (genderCounts[k] > 0) {
            genderLabels.push(k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
            genderData.push(genderCounts[k]);
            genderColors.push(gColorMap[k] || '#525252');
        }
    });

    if(state.charts.gender) state.charts.gender.destroy();
    const genderCtx = document.getElementById('genderChart');
    if (genderCtx) {
        state.charts.gender = new Chart(genderCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: genderLabels,
                datasets: [{
                    data: genderData,
                    backgroundColor: genderColors,
                    borderWidth: 2,
                    borderColor: '#1e1e1e',
                    hoverOffset: 5
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '65%', 
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { color: '#a3a3a3', font: { size: 11 }, padding: 15 } 
                    } 
                } 
            }
        });
    }

    const countryCounts = {};
    Object.values(state.usersMap).forEach(u => {
        const c = u.country ? u.country.toUpperCase() : 'UNKNOWN';
        countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    const sortedCountries = Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);

    const countryLabels = sortedCountries.map(c => c[0]);
    const countryData = sortedCountries.map(c => c[1]);

    if(state.charts.country) state.charts.country.destroy();
    const countryCtx = document.getElementById('countryChart');
    if (countryCtx) {
        state.charts.country = new Chart(countryCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: countryLabels,
                datasets: [{
                    label: 'Users',
                    data: countryData,
                    backgroundColor: '#10b981', 
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#2a2a2a', drawBorder: false },
                        ticks: { precision: 0 } 
                    },
                    x: { grid: { display: false, drawBorder: false } }
                }
            }
        });
    }

    const grid = document.getElementById('pomo-timeline-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(now.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const dayLogs = state.sessions.filter(s => {
            if(!s.completedAt) return false;
            const sDate = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
            return sDate.toISOString().split('T')[0] === dStr;
        });

        const row = document.createElement('div');
        row.style.cssText = "display:flex;align-items:center;height:24px;border-radius:4px;transition:background 0.2s;";
        row.onmouseover = () => row.style.background = 'var(--hover)';
        row.onmouseout = () => row.style.background = 'transparent';

        const lbl = document.createElement('div');
        lbl.style.cssText = "width:72px;font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0;";
        lbl.textContent = i === 0 ? "Today" : (i === 1 ? "Yesterday" : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

        const bars = document.createElement('div');
        bars.style.cssText = "flex:1;height:100%;position:relative;background:var(--bg-main);border-radius:4px;margin-left:8px;overflow:hidden;border:1px solid var(--border);";

        for (let j = 1; j < 6; j++) {
            const l = document.createElement('div');
            l.style.cssText = "position:absolute;top:0;bottom:0;border-left:1px solid var(--border);opacity:0.3;";
            l.style.left = `${(j * 4 / 24) * 100}%`;
            bars.appendChild(l);
        }

        dayLogs.forEach(l => {
            const ld = new Date(typeof l.completedAt === 'number' ? l.completedAt : l.completedAt.seconds * 1000);
            const sm = (ld.getHours() * 60) + ld.getMinutes();
            const dur = l.duration || 25;
            const lp = ((sm - dur) / 1440) * 100;
            const wp = (dur / 1440) * 100;

            const b = document.createElement('div');
            b.style.cssText = "position:absolute;top:4px;bottom:4px;border-radius:2px;background:var(--brand);opacity:0.8;z-index:10;transition:background 0.2s;";
            b.style.left = `${lp}%`;
            b.style.width = `${Math.max(wp, 0.5)}%`;
            b.title = `${l.taskTitle || 'Session'} | ${ld.getHours()}:${ld.getMinutes().toString().padStart(2, '0')} - ${dur}m`;
            b.onmouseover = () => b.style.background = '#fff';
            b.onmouseout = () => b.style.background = 'var(--brand)';
            bars.appendChild(b);
        });

        row.appendChild(lbl);
        row.appendChild(bars);
        grid.appendChild(row);
    }
}

function renderDensityMap() {
    const container = document.getElementById('density-heatmap-container');
    if (!container) return;
    container.innerHTML = '';

    const dailyCounts = {};
    let maxCount = 0;
    
    state.sessions.forEach(s => {
        if (!s.completedAt) return;
        const d = new Date(typeof s.completedAt === 'number' ? s.completedAt : s.completedAt.seconds * 1000);
        const dStr = d.toISOString().split('T')[0];
        
        dailyCounts[dStr] = (dailyCounts[dStr] || 0) + 1;
        if (dailyCounts[dStr] > maxCount) maxCount = dailyCounts[dStr];
    });

    const today = new Date();
    const daysToShow = 365;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysToShow + 1);
    
    while (startDate.getDay() !== 0) {
        startDate.setDate(startDate.getDate() - 1);
    }

    const totalDays = Math.round((today - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const totalCols = Math.ceil(totalDays / 7);

    let currDate = new Date(startDate);
    
    for (let c = 0; c < totalCols; c++) {
        const col = document.createElement('div');
        col.className = 'density-col';
        
        for (let r = 0; r < 7; r++) {
            if (currDate > today) break;
            
            const cell = document.createElement('div');
            const dStr = currDate.toISOString().split('T')[0];
            const count = dailyCounts[dStr] || 0;
            
            let tier = 0;
            if (count > 0) {
                const ratio = count / (maxCount || 1);
                if (ratio > 0.75) tier = 4;
                else if (ratio > 0.50) tier = 3;
                else if (ratio > 0.25) tier = 2;
                else tier = 1;
            }
            
            cell.className = `density-cell tier-${tier}`;
            
            const displayDate = currDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            cell.title = count === 0 
                ? `No sessions on ${displayDate}` 
                : `${count} session${count > 1 ? 's' : ''} on ${displayDate}`;
                
            col.appendChild(cell);
            currDate.setDate(currDate.getDate() + 1);
        }
        container.appendChild(col);
    }
}

function renderAll(){
    processUsers(); 
    updateKPIs(); 
    updateCharts(); 
    updateFeed(); 
    renderDensityMap(); 
    if(state.view==='users') renderUsersTable();
    if(state.view==='tasks') renderTasksTable();
    if(state.view==='broadcasts') renderBroadcastsTable();
    updateStorageStats();
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./orion_sw.js')
            .then(registration => {
                console.log('Orion ServiceWorker registered successfully with scope: ', registration.scope);
            })
            .catch(error => {
                console.log('Orion ServiceWorker registration failed: ', error);
            });
    });
}