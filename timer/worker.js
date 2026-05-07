let timerId = null;
let timeLeft = 0;
let phase = 'idle'; 

self.onmessage = function(e) {
    if (e.data.command === 'start') {
        timeLeft = 4 * 60; // 4 minutes in seconds
        phase = 'running';
        startTimer();
    }
};

function startTimer() {
    clearInterval(timerId);
    
    timerId = setInterval(() => {
        timeLeft--;
        
        if (phase === 'running') {
            // Send the current time to the main UI
            self.postMessage({ type: 'tick', timeLeft: timeLeft });
            
            if (timeLeft <= 0) {
                // 4 minutes are up
                self.postMessage({ type: 'completed' });
                phase = 'waiting_restart';
                timeLeft = 60; // Set up the 1-minute wait for the reminder
            }
        } else if (phase === 'waiting_restart') {
            // Counting down the 1 minute AFTER completion
            if (timeLeft <= 0) {
                self.postMessage({ type: 'reminder' });
                clearInterval(timerId); // Stop the background process
                phase = 'idle';
            }
        }
    }, 1000);
}