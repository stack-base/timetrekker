const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');

// Initialize the Web Worker
const worker = new Worker('worker.js');

// Ask for Notification Permissions on load
if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
}

// Function to format seconds into MM:SS
function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Function to trigger OS notifications
function sendNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            // Updated to use your custom TimeTrekker icon URL
            icon: "https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png" 
        });
    } else {
        // Fallback if notifications are blocked
        alert(`${title}\n${body}`);
    }
}

// Listen for messages from the background worker
worker.onmessage = function(e) {
    const data = e.data;

    if (data.type === 'tick') {
        timerDisplay.textContent = formatTime(data.timeLeft);
    } 
    else if (data.type === 'completed') {
        timerDisplay.textContent = "00:00";
        sendNotification("Timer Complete!", "Your 4-minute timer is up. Want to start again?");
        startBtn.disabled = false;
        startBtn.textContent = "Start Again";
    } 
    else if (data.type === 'reminder') {
        sendNotification("Reminder", "It's been 1 minute since your last timer ended. Time to restart!");
    }
};

// Start Button Click Handler
startBtn.addEventListener('click', () => {
    // Request permission again just in case they ignored it the first time
    if (Notification.permission === "default") {
        Notification.requestPermission();
    }
    
    startBtn.disabled = true;
    startBtn.textContent = "Running...";
    timerDisplay.textContent = "04:00";
    
    // Tell the background worker to start counting
    worker.postMessage({ command: 'start' });
});