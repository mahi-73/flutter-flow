// Ask for browser notification permission on load
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// ---------------- Timer State & Ring ----------------
let currentModeDuration = 25 * 60;
let timeLeft = currentModeDuration;
let timerId = null;

let sessionsCount = parseInt(localStorage.getItem('focusflow_sessions')) || 0;
let totalFocusSeconds = parseInt(localStorage.getItem('focusflow_total_focus_seconds')) || 0;
const dailyGoalTarget = 4;

const timerDisplay = document.getElementById('timerDisplay');
const timerProgress = document.getElementById('timer-progress');
const ringCircumference = 2 * Math.PI * 65; // ~408.4 for radius 65
timerProgress.style.strokeDasharray = ringCircumference;

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const streakDisplay = document.getElementById('streak-display');
const totalTimeDisplay = document.getElementById('total-time-display');
const goalLabel = document.getElementById('goal-label');
const goalDotsContainer = document.getElementById('goal-dots');

const focusBtn = document.getElementById('focus-mode');
const shortBreakBtn = document.getElementById('short-break');
const longBreakBtn = document.getElementById('long-break');
const customMinInput = document.getElementById('custom-min');
const setCustomBtn = document.getElementById('set-custom-btn');
const modeButtons = [focusBtn, shortBreakBtn, longBreakBtn];

function updateTotalTimeDisplay() {
  const hours = Math.floor(totalFocusSeconds / 3600);
  const minutes = Math.floor((totalFocusSeconds % 3600) / 60);
  if (hours > 0) {
    totalTimeDisplay.textContent = `⏱️ Total Focus: ${hours}h ${minutes}m`;
  } else {
    totalTimeDisplay.textContent = `⏱️ Total Focus: ${minutes}m`;
  }
}

function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  timerDisplay.textContent = formatted;
  document.title = `(${formatted}) FocusFlow`;

  const progressFraction = timeLeft / currentModeDuration;
  const offset = ringCircumference * (1 - progressFraction);
  timerProgress.style.strokeDashoffset = offset;
}

function updateStreakDisplay() {
  streakDisplay.textContent = `🍅 Total: ${sessionsCount}`;
  const completedToday = sessionsCount % dailyGoalTarget;
  goalLabel.textContent = `Daily Goal: ${completedToday}/${dailyGoalTarget} Completed`;

  goalDotsContainer.innerHTML = '';
  for (let i = 0; i < dailyGoalTarget; i++) {
    const dot = document.createElement('div');
    dot.className = 'goal-dot' + (i < completedToday ? ' completed' : '');
    goalDotsContainer.appendChild(dot);
  }
}

function setMode(duration, activeBtn) {
  clearInterval(timerId);
  timerId = null;
  currentModeDuration = duration;
  timeLeft = duration;
  updateDisplay();

  modeButtons.forEach(btn => btn?.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
}

focusBtn.addEventListener('click', () => setMode(25 * 60, focusBtn));
shortBreakBtn.addEventListener('click', () => setMode(5 * 60, shortBreakBtn));
longBreakBtn.addEventListener('click', () => setMode(15 * 60, longBreakBtn));

setCustomBtn.addEventListener('click', () => {
  const customMin = parseInt(customMinInput.value);
  if (customMin && customMin > 0) {
    setMode(customMin * 60, null);
    customMinInput.value = '';
  }
});

function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 1.2);
  } catch (e) {
    console.error('Audio chime error:', e);
  }
}

startBtn.addEventListener('click', () => {
  if (timerId === null) {
    timerId = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();

        if (currentModeDuration >= 20 * 60) {
          totalFocusSeconds++;
          if (totalFocusSeconds % 10 === 0) {
            localStorage.setItem('focusflow_total_focus_seconds', totalFocusSeconds);
          }
          updateTotalTimeDisplay();
        }
      } else {
        clearInterval(timerId);
        timerId = null;
        playChime();

        let hitDailyGoal = false;
        if (currentModeDuration >= 20 * 60) {
          sessionsCount++;
          localStorage.setItem('focusflow_sessions', sessionsCount);
          updateStreakDisplay();
          if (sessionsCount % dailyGoalTarget === 0) {
            hitDailyGoal = true;
            launchConfetti();
          }
        }

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("FocusFlow", {
            body: hitDailyGoal ? "Daily Goal achieved! Fantastic job!" : "Time is up! Great session.",
            icon: "🍅"
          });
        }

        setTimeout(() => {
          const note = prompt("Session Complete! What did you accomplish? (Leave blank to skip)");
          if (note && note.trim() !== '') {
            addJournalEntry(note.trim());
          }
        }, 300);
      }
    }, 1000);
  }
});

pauseBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
});

resetBtn.addEventListener('click', () => {
  clearInterval(timerId);
  timerId = null;
  timeLeft = currentModeDuration;
  updateDisplay();
});

// ---------------- Ambient Sounds (Rain & Binaural) ----------------
let rainCtx = null, rainGain = null, rainSource = null, isRainPlaying = false;
let binCtx = null, binGain = null, oscL = null, oscR = null, isBinPlaying = false;

const rainBtn = document.getElementById('rain-btn');
const rainVolume = document.getElementById('rain-volume');
const binBtn = document.getElementById('binaural-btn');
const binVolume = document.getElementById('binaural-volume');

function toggleRain() {
  if (!isRainPlaying) {
    rainCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = rainCtx.sampleRate * 2;
    const buffer = rainCtx.createBuffer(1, bufferSize, rainCtx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
      b6 = white * 0.115926;
    }

    rainSource = rainCtx.createBufferSource();
    rainSource.buffer = buffer;
    rainSource.loop = true;

    rainGain = rainCtx.createGain();
    rainGain.gain.setValueAtTime(parseFloat(rainVolume.value), rainCtx.currentTime);

    rainSource.connect(rainGain);
    rainGain.connect(rainCtx.destination);
    rainSource.start();

    rainBtn.textContent = 'Pause';
    isRainPlaying = true;
  } else {
    if (rainSource) { rainSource.stop(); rainSource.disconnect(); }
    if (rainCtx) { rainCtx.close(); }
    rainBtn.textContent = 'Play';
    isRainPlaying = false;
  }
}

function toggleBinaural() {
  if (!isBinPlaying) {
    binCtx = new (window.AudioContext || window.webkitAudioContext)();
    binGain = binCtx.createGain();
    binGain.gain.setValueAtTime(parseFloat(binVolume.value), binCtx.currentTime);

    const merger = binCtx.createChannelMerger(2);

    oscL = binCtx.createOscillator();
    oscL.type = 'sine';
    oscL.frequency.setValueAtTime(200, binCtx.currentTime);

    oscR = binCtx.createOscillator();
    oscR.type = 'sine';
    oscR.frequency.setValueAtTime(240, binCtx.currentTime);

    oscL.connect(merger, 0, 1);
    oscR.connect(merger, 0, 0);
    merger.connect(binGain);
    binGain.connect(binCtx.destination);

    oscL.start();
    oscR.start();

    binBtn.textContent = 'Pause';
    isBinPlaying = true;
  } else {
    if (oscL) oscL.stop();
    if (oscR) oscR.stop();
    if (binCtx) binCtx.close();
    binBtn.textContent = 'Play';
    isBinPlaying = false;
  }
}

rainBtn.addEventListener('click', toggleRain);
binBtn.addEventListener('click', toggleBinaural);

rainVolume.addEventListener('input', (e) => {
  if (rainGain && rainCtx) rainGain.gain.setValueAtTime(parseFloat(e.target.value), rainCtx.currentTime);
});
binVolume.addEventListener('input', (e) => {
  if (binGain && binCtx) binGain.gain.setValueAtTime(parseFloat(e.target.value), binCtx.currentTime);
});

// ---------------- Task Management & Priority ----------------
const taskInput = document.getElementById('task-input');
const prioritySelect = document.getElementById('priority-select');
const addTaskBtn = document.getElementById('add-task-btn');
const taskList = document.getElementById('task-list');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const taskActionsRow = document.getElementById('task-actions-row');
const progressLabel = document.getElementById('progress-label');
const progressBarFill = document.getElementById('progress-bar-fill');

let tasks = [];
try {
  tasks = JSON.parse(localStorage.getItem('focusflow_tasks')) || [];
} catch (e) {
  tasks = [];
}

function saveTasks() {
  localStorage.setItem('focusflow_tasks', JSON.stringify(tasks));
  updateProgress();
}

function updateProgress() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.done).length;
  progressLabel.textContent = `${completed} of ${total} tasks completed`;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  progressBarFill.style.width = `${percentage}%`;
}

function renderTasks() {
  taskList.innerHTML = '';

  if (tasks.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'empty-state';
    emptyLi.textContent = 'No tasks yet. Add one above!';
    taskList.appendChild(emptyLi);
    taskActionsRow.style.display = 'none';
    updateProgress();
    return;
  }

  const hasCompleted = tasks.some(t => t.done);
  taskActionsRow.style.display = hasCompleted ? 'block' : 'none';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const contentDiv = document.createElement('div');
    contentDiv.className = 'task-content';

    const badge = document.createElement('span');
    badge.className = `priority-tag priority-${task.priority || 'med'}`;
    badge.textContent = task.priority || 'med';

    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = task.text;

    contentDiv.appendChild(badge);
    contentDiv.appendChild(span);

    contentDiv.addEventListener('click', () => {
      task.done = !task.done;
      saveTasks();
      renderTasks();
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'delete-btn';
    delBtn.type = 'button';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tasks.splice(index, 1);
      saveTasks();
      renderTasks();
    });

    li.appendChild(contentDiv);
    li.appendChild(delBtn);
    taskList.appendChild(li);
  });

  updateProgress();
}

function addTask() {
  const taskText = taskInput.value.trim();
  if (taskText === '') return;

  tasks.push({
    text: taskText,
    priority: prioritySelect.value,
    done: false
  });
  saveTasks();
  renderTasks();
  taskInput.value = '';
}

clearCompletedBtn.addEventListener('click', () => {
  tasks = tasks.filter(t => !t.done);
  saveTasks();
  renderTasks();
});

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

// ---------------- Study Journal Log ----------------
const journalList = document.getElementById('journal-list');
const journalActionsRow = document.getElementById('journal-actions-row');
const clearJournalBtn = document.getElementById('clear-journal-btn');

let journalEntries = [];
try {
  journalEntries = JSON.parse(localStorage.getItem('focusflow_journal')) || [];
} catch (e) {
  journalEntries = [];
}

function renderJournal() {
  journalList.innerHTML = '';
  if (journalEntries.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'empty-state';
    emptyLi.textContent = 'Completed sessions will log here.';
    journalList.appendChild(emptyLi);
    journalActionsRow.style.display = 'none';
    return;
  }

  journalActionsRow.style.display = 'block';
  journalEntries.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="journal-entry-time">${entry.time}</span> <span class="task-text">${entry.note}</span>`;
    journalList.appendChild(li);
  });
}

function addJournalEntry(note) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  journalEntries.unshift({ time: timeStr, note });
  localStorage.setItem('focusflow_journal', JSON.stringify(journalEntries));
  renderJournal();
}

clearJournalBtn.addEventListener('click', () => {
  journalEntries = [];
  localStorage.removeItem('focusflow_journal');
  renderJournal();
});

// ---------------- Export Study Report (.txt) ----------------
const exportBtn = document.getElementById('export-report-btn');

exportBtn.addEventListener('click', () => {
  const today = new Date().toLocaleDateString();
  const hours = Math.floor(totalFocusSeconds / 3600);
  const minutes = Math.floor((totalFocusSeconds % 3600) / 60);

  const completedTasks = tasks.filter(t => t.done).map(t => `- [x] [${t.priority.toUpperCase()}] ${t.text}`);
  const pendingTasks = tasks.filter(t => !t.done).map(t => `- [ ] [${t.priority.toUpperCase()}] ${t.text}`);

  const journalLines = journalEntries.map(j => `[${j.time}] ${j.note}`);

  let content = `==============================\n`;
  content += ` FOCUSFLOW STUDY REPORT\n`;
  content += ` Date: ${today}\n`;
  content += `==============================\n\n`;

  content += `⏱️ STATS:\n`;
  content += `- Total Focused Time: ${hours}h ${minutes}m\n`;
  content += `- Completed Pomodoro Sessions: ${sessionsCount} 🍅\n\n`;

  content += `✅ COMPLETED TASKS (${completedTasks.length}):\n`;
  content += (completedTasks.length > 0 ? completedTasks.join('\n') : '- None') + '\n\n';

  content += `⏳ PENDING TASKS (${pendingTasks.length}):\n`;
  content += (pendingTasks.length > 0 ? pendingTasks.join('\n') : '- None') + '\n\n';

  content += `📝 SESSION JOURNAL:\n`;
  content += (journalLines.length > 0 ? journalLines.join('\n') : '- No reflection notes recorded.') + '\n\n';

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusflow-report-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---------------- Confetti Burst Animation ----------------
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#38bdf8', '#f43f5e', '#fbbf24'];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      r: Math.random() * 6 + 4,
      dx: (Math.random() - 0.5) * 14,
      dy: (Math.random() - 0.7) * 16,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: 0.35,
      alpha: 1
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    particles.forEach(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.dy += p.gravity;
      p.alpha -= 0.012;

      if (p.alpha > 0) {
        active = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    if (active) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  animate();
}

// ---------------- Keyboard Shortcuts ----------------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (timerId === null) {
      startBtn.click();
    } else {
      pauseBtn.click();
    }
  } else if (e.key === 'r' || e.key === 'R') {
    resetBtn.click();
  }
});

// Initial setup calls
updateDisplay();
updateStreakDisplay();
updateTotalTimeDisplay();
renderTasks();
renderJournal();
