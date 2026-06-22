// State Management
let dueQuestions = [];
let currentQuestionIndex = 0;
let isAnswered = false;
let studyMode = 'due'; // 'due' or 'all'
let allQuestions = []; // Stores all questions for management view
let selectedQuestionIds = new Set();
let sessionAnswersStudy = {};
let sessionRatingsStudy = {};

// Kurul State Management
let kurulQuestions = [];
let currentKurulIndex = 0;
let isKurulAnswered = false;
let activeKurul = null; // Stores currently active kurul info { file_name, yil, kurul_adi }
let sessionAnswersKurul = {};
let sessionRatingsKurul = {};

// Final State Management
let finalQuestions = [];
let currentFinalIndex = 0;
let isFinalAnswered = false;
let activeFinal = null; // Stores currently active final info { file_name, yil, kurul_adi }
let sessionAnswersFinal = {};
let sessionRatingsFinal = {};

// Similarity Prefetch Caches
let similarityCache = {};
let kurulSimilarityCache = {};
let finalSimilarityCache = {};

// Bulk Answer Key State Management
let loadedAnswerKeyQuestions = [];
let localAnswerKeyChanges = {};
let currentAnswerKeyExam = null;

// DOM Elements
const panels = {
    dashboard: document.getElementById('panel-dashboard'),
    add: document.getElementById('panel-add'),
    study: document.getElementById('panel-study'),
    manage: document.getElementById('panel-manage'),
    kurul: document.getElementById('panel-kurul'),
    final: document.getElementById('panel-final'),
    logs: document.getElementById('panel-logs'),
    answerKey: document.getElementById('panel-answer-key')
};

const navItems = {
    dashboard: document.getElementById('btn-nav-dashboard'),
    add: document.getElementById('btn-nav-add'),
    study: document.getElementById('btn-nav-study'),
    manage: document.getElementById('btn-nav-manage'),
    kurul: document.getElementById('btn-nav-kurul'),
    final: document.getElementById('btn-nav-final'),
    logs: document.getElementById('btn-nav-logs'),
    answerKey: document.getElementById('btn-nav-answer-key')
};

// Application Init
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupSmartParser();
    setupAddForm();
    setupTabsAndBulk();
    setupStudyPanel();
    setupManagementPanel();
    setupBackupRestore();
    setupKeyboardShortcuts();
    
    // Yeni özelliklerin kurulumları
    setupKurulPanel();
    setupFinalPanel();
    setupLogsPanel();
    setupCorrectionModal();
    setupStudyFilters();
    setupSimilaritySlider();
    setupBulkAnswerKeyPanel();
    setupSidebarToggle();
    setupGoToQuestionFeature();
    
    // Load dashboard stats on start
    refreshDashboardStats();
});

// 1. Navigation Logic
function setupNavigation() {
    Object.keys(navItems).forEach(key => {
        navItems[key].addEventListener('click', () => {
            switchPanel(key);
        });
    });
    
    document.getElementById('btn-start-study').addEventListener('click', () => {
        switchPanel('study');
    });

    const freeStudyDashBtn = document.getElementById('btn-start-free-study-dashboard');
    if (freeStudyDashBtn) {
        freeStudyDashBtn.addEventListener('click', () => {
            studyMode = 'all';
            switchPanel('study');
        });
    }

    document.getElementById('btn-empty-go-dashboard').addEventListener('click', () => {
        switchPanel('dashboard');
    });
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const appContainer = document.querySelector('.app-container');
    
    if (!toggleBtn || !sidebar || !appContainer) return;
    
    // Read state from localStorage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        appContainer.classList.add('sidebar-collapsed');
    }
    
    toggleBtn.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        appContainer.classList.toggle('sidebar-collapsed', collapsed);
        localStorage.setItem('sidebarCollapsed', collapsed);
    });
}

function switchPanel(panelKey) {
    // Hide all panels, deactivate all nav items
    Object.keys(panels).forEach(key => {
        if (panels[key] && navItems[key]) {
            panels[key].classList.remove('active');
            navItems[key].classList.remove('active');
        }
    });
    
    // Show selected panel, activate nav item
    if (panels[panelKey] && navItems[panelKey]) {
        panels[panelKey].classList.add('active');
        navItems[panelKey].classList.add('active');
    }
    
    // Panel specific loaders
    if (panelKey === 'dashboard') {
        refreshDashboardStats();
    } else if (panelKey === 'study') {
        if (studyMode === 'all') {
            document.getElementById('study-filter-card').classList.remove('hidden');
            document.getElementById('study-progress-container').classList.add('hidden');
            document.getElementById('study-active-card').classList.add('hidden');
            document.getElementById('study-empty-state').classList.add('hidden');
        } else {
            startStudySession();
        }
    } else if (panelKey === 'manage') {
        loadManagementQuestions();
    } else if (panelKey === 'kurul') {
        loadKurulList();
    } else if (panelKey === 'final') {
        loadFinalList();
    } else if (panelKey === 'logs') {
        loadLogsList();
    } else if (panelKey === 'answerKey') {
        initAnswerKeyOptions();
    }
}

// 2. Dashboard Loader
let difficultyChartInstance = null;
let detailedChartInstance = null;

async function refreshDashboardStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        if (response.ok) {
            document.getElementById('stat-total-questions').textContent = stats.total_questions;
            document.getElementById('stat-due-questions').textContent = stats.due_questions;
            document.getElementById('stat-avg-ease').textContent = stats.avg_ease_factor;
            
            const badge = document.getElementById('badge-due-count');
            const studyBtn = document.getElementById('btn-start-study');
            const freeStudyBtn = document.getElementById('btn-start-free-study-dashboard');
            const btnSpan = studyBtn.querySelector('span');
            
            if (stats.due_questions > 0) {
                badge.textContent = stats.due_questions;
                badge.classList.remove('hidden');
                document.getElementById('dashboard-action-text').textContent = `${stats.due_questions} sorunun tekrar vakti geldi! Kendini test etmeye hazır mısın?`;
                studyBtn.classList.remove('hidden');
                btnSpan.textContent = "Tekrara Başla";
                studyMode = 'due';
                if (freeStudyBtn) {
                    freeStudyBtn.classList.remove('hidden');
                }
            } else {
                badge.classList.add('hidden');
                if (freeStudyBtn) {
                    freeStudyBtn.classList.add('hidden');
                }
                if (stats.total_questions > 0) {
                    document.getElementById('dashboard-action-text').textContent = "Bugünlük zorunlu tekrarlar bitti. Ancak istersen tüm soruları kapsayan serbest çalışmaya başlayabilirsin.";
                    studyBtn.classList.remove('hidden');
                    btnSpan.textContent = "Serbest Çalışmaya Başla";
                    studyMode = 'all';
                } else {
                    document.getElementById('dashboard-action-text').textContent = "Henüz veritabanında soru yok. Soru ekleyerek başlayabilirsin!";
                    studyBtn.classList.add('hidden');
                }
            }
        }
        
        const advResponse = await fetch('/api/stats/advanced');
        if (advResponse.ok) {
            const advStats = await advResponse.json();
            document.getElementById('stat-today-kurul').textContent = advStats.today.kurul_solved;
            document.getElementById('stat-today-reviews').textContent = advStats.today.total_reviews;
            document.getElementById('stat-today-success').textContent = `%${advStats.today.success_rate}`;
            
            renderDifficultyChart(advStats.difficulty_breakdown);
            renderDetailedDifficultyChart(advStats.detailed_difficulty);
        }
    } catch (error) {
        console.error("Stats fetch error:", error);
        showToast("İstatistikler yüklenemedi.", "error");
    }
}

function renderDifficultyChart(breakdown) {
    const ctx = document.getElementById('chart-difficulty').getContext('2d');
    
    if (difficultyChartInstance) {
        difficultyChartInstance.destroy();
    }
    
    difficultyChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Zor (<1.8)', 'Orta (1.8-2.4)', 'Kolay (>2.4)'],
            datasets: [{
                data: [breakdown.hard, breakdown.medium, breakdown.easy],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.6)',
                    'rgba(245, 158, 11, 0.6)',
                    'rgba(16, 185, 129, 0.6)'
                ],
                borderColor: [
                    '#ef4444',
                    '#f59e0b',
                    '#10b981'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

function renderDetailedDifficultyChart(breakdown) {
    const ctx = document.getElementById('chart-difficulty-detailed').getContext('2d');
    
    if (detailedChartInstance) {
        detailedChartInstance.destroy();
    }
    
    const labels = Object.keys(breakdown);
    const data = Object.values(breakdown);
    
    // Create modern linear gradient for line fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.01)');
    
    detailedChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Soru Sayısı',
                data: data,
                fill: true,
                backgroundColor: gradient,
                borderColor: '#a78bfa',
                borderWidth: 2.5,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: 'rgba(255, 255, 255, 0.7)',
                pointRadius: 2,
                pointHoverRadius: 5,
                pointHitRadius: 10,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Soru Sayısı: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        precision: 0,
                        font: {
                            family: 'Inter',
                            size: 10
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        autoSkip: true,
                        maxTicksLimit: 10,
                        maxRotation: 0,
                        font: {
                            family: 'Inter',
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// 3. Smart Parser & Add Question Form
function setupSmartParser() {
    const pasteArea = document.getElementById('smart-paste');
    
    pasteArea.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        if (!text) return;
        
        // Find positions of option markers A, B, C, D, E (supporting A) or A. format)
        const markerA = text.search(/(?:^|[\s\n])A[\.\)]/i);
        const markerB = text.search(/(?:^|[\s\n])B[\.\)]/i);
        const markerC = text.search(/(?:^|[\s\n])C[\.\)]/i);
        const markerD = text.search(/(?:^|[\s\n])D[\.\)]/i);
        const markerE = text.search(/(?:^|[\s\n])E[\.\)]/i);
        
        // Ensure markers are in logical sequence
        if (markerA !== -1 && markerB !== -1 && markerC !== -1 && markerD !== -1 && markerE !== -1 &&
            markerA < markerB && markerB < markerC && markerC < markerD && markerD < markerE) {
            
            // Extract question stem
            const questionStem = text.substring(0, markerA).trim();
            
            // Extract options
            const optA = text.substring(markerA, markerB).replace(/^(?:[\s\n])*A[\.\)]\s*/i, '').trim();
            const optB = text.substring(markerB, markerC).replace(/^(?:[\s\n])*B[\.\)]\s*/i, '').trim();
            const optC = text.substring(markerC, markerD).replace(/^(?:[\s\n])*C[\.\)]\s*/i, '').trim();
            const optD = text.substring(markerD, markerE).replace(/^(?:[\s\n])*D[\.\)]\s*/i, '').trim();
            let optE = text.substring(markerE).replace(/^(?:[\s\n])*E[\.\)]\s*/i, '').trim();
            
            // Populate form fields
            document.getElementById('input-question').value = questionStem;
            document.getElementById('input-option-a').value = optA;
            document.getElementById('input-option-b').value = optB;
            document.getElementById('input-option-c').value = optC;
            document.getElementById('input-option-d').value = optD;
            
            // Check for correct answer tags at the end (e.g. Cevap: A)
            const answerRegex = /(?:cevap|doğru\s+cevap|yanıt|şıkları)\s*[:\-]?\s*\b([A-E])\b/i;
            const ansMatch = optE.match(answerRegex);
            if (ansMatch) {
                const correctLetter = ansMatch[1].toUpperCase();
                document.getElementById('select-correct').value = correctLetter;
                
                // Remove the answer string from option E
                const ansIndex = optE.search(answerRegex);
                optE = optE.substring(0, ansIndex).trim();
            } else {
                // If answer was not in E but somewhere else in the original text, search original text
                const globalAnsMatch = text.match(answerRegex);
                if (globalAnsMatch) {
                    document.getElementById('select-correct').value = globalAnsMatch[1].toUpperCase();
                } else {
                    document.getElementById('select-correct').value = "";
                }
            }
            
            document.getElementById('input-option-e').value = optE;
            showToast("Soru başarıyla ayrıştırıldı!");
        }
    });
}

function setupAddForm() {
    const form = document.getElementById('form-add-question');
    const clearBtn = document.getElementById('btn-clear-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            question_text: document.getElementById('input-question').value,
            option_a: document.getElementById('input-option-a').value,
            option_b: document.getElementById('input-option-b').value,
            option_c: document.getElementById('input-option-c').value,
            option_d: document.getElementById('input-option-d').value,
            option_e: document.getElementById('input-option-e').value,
            correct_option: document.getElementById('select-correct').value
        };
        
        try {
            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showToast("Soru başarıyla eklendi.");
                resetForm();
                // Focus paste area for next entry
                document.getElementById('smart-paste').focus();
            } else {
                const err = await response.json();
                showToast(err.error || "Soru eklenemedi.", "error");
            }
        } catch (error) {
            console.error("Save error:", error);
            showToast("Bağlantı hatası oluştu.", "error");
        }
    });
    
    clearBtn.addEventListener('click', resetForm);
}

function resetForm() {
    document.getElementById('smart-paste').value = "";
    document.getElementById('input-question').value = "";
    document.getElementById('input-option-a').value = "";
    document.getElementById('input-option-b').value = "";
    document.getElementById('input-option-c').value = "";
    document.getElementById('input-option-d').value = "";
    document.getElementById('input-option-e').value = "";
    document.getElementById('select-correct').value = "";
}

// Bulk parsed questions cache
let parsedBulkQuestions = [];

function setupTabsAndBulk() {
    const tabSingle = document.getElementById('tab-btn-single');
    const tabBulk = document.getElementById('tab-btn-bulk');
    const contentSingle = document.getElementById('add-content-single');
    const contentBulk = document.getElementById('add-content-bulk');
    
    tabSingle.addEventListener('click', () => {
        tabSingle.classList.add('active');
        tabSingle.style.borderBottomColor = 'var(--color-primary)';
        tabSingle.style.color = 'var(--color-primary-hover)';
        tabBulk.classList.remove('active');
        tabBulk.style.borderBottomColor = 'transparent';
        tabBulk.style.color = 'var(--text-muted)';
        contentSingle.classList.remove('hidden');
        contentBulk.classList.add('hidden');
    });
    
    tabBulk.addEventListener('click', () => {
        tabBulk.classList.add('active');
        tabBulk.style.borderBottomColor = 'var(--color-primary)';
        tabBulk.style.color = 'var(--color-primary-hover)';
        tabSingle.classList.remove('active');
        tabSingle.style.borderBottomColor = 'transparent';
        tabSingle.style.color = 'var(--text-muted)';
        contentBulk.classList.remove('hidden');
        contentSingle.classList.add('hidden');
    });
    
    // Bulk parser
    const parseBtn = document.getElementById('btn-parse-bulk');
    parseBtn.addEventListener('click', parseBulkInput);
    
    // Bulk save
    const saveBulkBtn = document.getElementById('btn-bulk-save-all');
    saveBulkBtn.addEventListener('click', saveBulkQuestions);
    
    // Bulk cancel
    const cancelBulkBtn = document.getElementById('btn-bulk-cancel');
    cancelBulkBtn.addEventListener('click', clearBulkImport);
}

function splitQuestions(text) {
    if (text.includes('---')) {
        return text.split(/(?:^|[\r\n]+)---(?:[\r\n]+|$)/).map(b => b.trim()).filter(b => b.length > 0);
    }
    
    // Split by question numbers at the beginning of lines: e.g. "1.", "2."
    const numRegex = /(?:^|[\r\n]+)\s*(\d+)[\.\)]\s*/g;
    let matches = [];
    let match;
    numRegex.lastIndex = 0;
    while ((match = numRegex.exec(text)) !== null) {
        matches.push({
            index: match.index,
            length: match[0].length,
            number: match[1]
        });
    }
    
    if (matches.length > 1) {
        let blocks = [];
        for (let i = 0; i < matches.length; i++) {
            let start = matches[i].index + matches[i].length;
            let end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
            blocks.push(text.substring(start, end).trim());
        }
        return blocks.filter(b => b.length > 0);
    }
    
    // Split by double newline or fallback
    return text.split(/[\r\n]{2,}/).map(b => b.trim()).filter(b => b.length > 0);
}

function parseBulkInput() {
    const text = document.getElementById('bulk-paste').value.trim();
    if (!text) {
        showToast("Lütfen önce metin alanına soru yapıştırın.", "error");
        return;
    }
    
    const blocks = splitQuestions(text);
    parsedBulkQuestions = [];
    
    blocks.forEach((block, index) => {
        const cleanedBlock = block.trim();
        if (!cleanedBlock) return;
        
        // Match option markers A, B, C, D, E
        const markerA = cleanedBlock.search(/(?:^|[\s\n])A[\.\)]/i);
        const markerB = cleanedBlock.search(/(?:^|[\s\n])B[\.\)]/i);
        const markerC = cleanedBlock.search(/(?:^|[\s\n])C[\.\)]/i);
        const markerD = cleanedBlock.search(/(?:^|[\s\n])D[\.\)]/i);
        const markerE = cleanedBlock.search(/(?:^|[\s\n])E[\.\)]/i);
        
        if (markerA !== -1 && markerB !== -1 && markerC !== -1 && markerD !== -1 && markerE !== -1 &&
            markerA < markerB && markerB < markerC && markerC < markerD && markerD < markerE) {
            
            const questionStem = cleanedBlock.substring(0, markerA).trim();
            const optA = cleanedBlock.substring(markerA, markerB).replace(/^(?:[\s\n])*A[\.\)]\s*/i, '').trim();
            const optB = cleanedBlock.substring(markerB, markerC).replace(/^(?:[\s\n])*B[\.\)]\s*/i, '').trim();
            const optC = cleanedBlock.substring(markerC, markerD).replace(/^(?:[\s\n])*C[\.\)]\s*/i, '').trim();
            const optD = cleanedBlock.substring(markerD, markerE).replace(/^(?:[\s\n])*D[\.\)]\s*/i, '').trim();
            let optE = cleanedBlock.substring(markerE).replace(/^(?:[\s\n])*E[\.\)]\s*/i, '').trim();
            
            let correctLetter = "A"; // default
            const answerRegex = /(?:cevap|doğru\s+cevap|yanıt|şıkları)\s*[:\-]?\s*\b([A-E])\b/i;
            const ansMatch = optE.match(answerRegex);
            if (ansMatch) {
                correctLetter = ansMatch[1].toUpperCase();
                const ansIndex = optE.search(answerRegex);
                optE = optE.substring(0, ansIndex).trim();
            } else {
                const globalAnsMatch = cleanedBlock.match(answerRegex);
                if (globalAnsMatch) {
                    correctLetter = globalAnsMatch[1].toUpperCase();
                }
            }
            
            parsedBulkQuestions.push({
                question_text: questionStem,
                option_a: optA,
                option_b: optB,
                option_c: optC,
                option_d: optD,
                option_e: optE,
                correct_option: correctLetter,
                checked: true
            });
        }
    });
    
    renderBulkPreview();
}

function renderBulkPreview() {
    const container = document.getElementById('bulk-preview-container');
    const list = document.getElementById('bulk-preview-list');
    const countBadge = document.getElementById('bulk-preview-count');
    
    list.innerHTML = "";
    
    if (parsedBulkQuestions.length === 0) {
        showToast("Sorular ayrıştırılamadı. Formatı kontrol edin (A-E şıkları ve Cevap bulunmalı).", "error");
        container.classList.add('hidden');
        return;
    }
    
    countBadge.textContent = `${parsedBulkQuestions.length} Soru`;
    container.classList.remove('hidden');
    
    parsedBulkQuestions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = "card";
        item.style.borderColor = "var(--border-color)";
        item.style.padding = "1.5rem";
        item.style.background = "rgba(255, 255, 255, 0.01)";
        item.style.display = "flex";
        item.style.gap = "1.25rem";
        item.style.alignItems = "flex-start";
        
        item.innerHTML = `
            <input type="checkbox" id="bulk-chk-${idx}" checked style="width: 22px; height: 22px; accent-color: var(--color-success); margin-top: 0.25rem; cursor: pointer;">
            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 0.85rem;">
                <div style="font-weight: 500; font-size: 0.95rem; white-space: pre-line;">${q.question_text}</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                    <div><strong>A:</strong> ${q.option_a}</div>
                    <div><strong>B:</strong> ${q.option_b}</div>
                    <div><strong>C:</strong> ${q.option_c}</div>
                    <div><strong>D:</strong> ${q.option_d}</div>
                    <div><strong>E:</strong> ${q.option_e}</div>
                </div>
                <div style="font-size: 0.95rem; display: flex; align-items: center; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; margin-top: 0.25rem;">
                    <span>Doğru Cevap:</span>
                    <select id="bulk-correct-${idx}" style="background: rgba(10, 12, 16, 0.8); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); color: var(--text-main); padding: 0.25rem 0.6rem; outline: none; cursor: pointer; font-weight: 600;">
                        <option value="A" ${q.correct_option === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${q.correct_option === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${q.correct_option === 'C' ? 'selected' : ''}>C</option>
                        <option value="D" ${q.correct_option === 'D' ? 'selected' : ''}>D</option>
                        <option value="E" ${q.correct_option === 'E' ? 'selected' : ''}>E</option>
                    </select>
                </div>
            </div>
        `;
        
        // Listen to checkbox changes
        item.querySelector('input').addEventListener('change', (e) => {
            q.checked = e.target.checked;
        });
        
        list.appendChild(item);
    });
}

async function saveBulkQuestions() {
    // Update correct options from selects before sending
    parsedBulkQuestions.forEach((q, idx) => {
        const selectEl = document.getElementById(`bulk-correct-${idx}`);
        if (selectEl) {
            q.correct_option = selectEl.value;
        }
    });

    const selectedQuestions = parsedBulkQuestions.filter(q => q.checked);
    if (selectedQuestions.length === 0) {
        showToast("Lütfen kaydetmek için en az bir soru seçin.", "error");
        return;
    }
    
    try {
        const response = await fetch('/api/questions/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selectedQuestions)
        });
        
        if (response.ok) {
            const res = await response.json();
            showToast(`${res.saved_count} soru başarıyla kaydedildi!`);
            clearBulkImport();
            refreshDashboardStats();
        } else {
            showToast("Sorular yüklenemedi.", "error");
        }
    } catch (error) {
        console.error("Bulk save error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

function clearBulkImport() {
    document.getElementById('bulk-paste').value = "";
    document.getElementById('bulk-preview-container').classList.add('hidden');
    parsedBulkQuestions = [];
}

function setupBackupRestore() {
    const restoreInput = document.getElementById('restore-file-input');
    
    restoreInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const confirmRestore = confirm("UYARI: Geri yükleme işlemi veritabanınızdaki mevcut TÜM soruları ve tekrarlama ilerlemenizi tamamen silecek ve yedeği yükleyecektir. Devam etmek istiyor musunuz?");
        if (!confirmRestore) {
            restoreInput.value = "";
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                const response = await fetch('/api/restore', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    showToast("Yedek başarıyla yüklendi! Veritabanı geri yüklendi.");
                    refreshDashboardStats();
                    if (panels.manage.classList.contains('active')) {
                        loadManagementQuestions();
                    }
                } else {
                    const err = await response.json();
                    showToast(err.error || "Geri yükleme başarısız.", "error");
                }
            } catch (error) {
                console.error("JSON parse error on restore:", error);
                showToast("Geçersiz yedek dosyası formatı.", "error");
            } finally {
                restoreInput.value = "";
            }
        };
        reader.readAsText(file);
    });
}

// 4. Study / SRS Session Logic
async function startStudySession() {
    try {
        let url = '/api/questions/due';
        if (studyMode === 'all') {
            const kurul = document.getElementById('filter-study-kurul').value;
            const diffMin = document.getElementById('filter-study-difficulty-min').value;
            const diffMax = document.getElementById('filter-study-difficulty-max').value;
            const yil = document.getElementById('filter-study-yil').value;
            const sort = document.getElementById('filter-study-sort').value;
            
            url = `/api/questions/due?all=true&kurul=${encodeURIComponent(kurul)}&difficulty_min=${encodeURIComponent(diffMin)}&difficulty_max=${encodeURIComponent(diffMax)}&yil=${encodeURIComponent(yil)}&sort=${encodeURIComponent(sort)}`;
        }
        
        const response = await fetch(url);
        dueQuestions = await response.json();
        
        if (response.ok) {
            currentQuestionIndex = 0;
            isAnswered = false;
            sessionAnswersStudy = {};
            sessionRatingsStudy = {};
            similarityCache = {};
            
            // Hide filters and show progress card
            document.getElementById('study-filter-card').classList.add('hidden');
            document.getElementById('study-progress-container').classList.remove('hidden');
            
            const modeBadge = document.getElementById('study-mode-badge');
            if (studyMode === 'all') {
                modeBadge.textContent = "Serbest Çalışma";
                modeBadge.style.background = "rgba(16, 185, 129, 0.2)";
                modeBadge.style.borderColor = "var(--color-success)";
                modeBadge.style.color = "#6ee7b7";
            } else {
                modeBadge.textContent = "Günlük Tekrar";
                modeBadge.style.background = "rgba(139, 92, 246, 0.2)";
                modeBadge.style.borderColor = "var(--color-primary)";
                modeBadge.style.color = "var(--color-primary-hover)";
            }
            
            displayActiveQuestion();
        }
    } catch (error) {
        console.error("Session load error:", error);
        showToast("Sorular yüklenemedi.", "error");
    }
}

async function prefetchStudySimilarity(index) {
    if (index < 0 || index >= dueQuestions.length) return;
    if (similarityCache[index]) return;
    
    similarityCache[index] = { loading: true };
    try {
        const question = dueQuestions[index];
        const threshold = parseFloat(document.getElementById('similarity-threshold-slider')?.value || 70) / 100;
        const response = await fetch('/api/questions/similarity-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: question.question_text,
                question_id: question.id,
                kurul_adi: question.kurul_adi || null,
                yil: question.yil || null,
                soru_numarasi: question.soru_numarasi || null,
                option_a: question.option_a || "",
                option_b: question.option_b || "",
                option_c: question.option_c || "",
                option_d: question.option_d || "",
                option_e: question.option_e || "",
                threshold: threshold
            })
        });
        if (response.ok) {
            similarityCache[index] = await response.json();
            // If the user is still on this question, render it immediately
            if (currentQuestionIndex === index) {
                renderStudySimilarity(similarityCache[index]);
            }
        } else {
            similarityCache[index] = null;
        }
    } catch (e) {
        console.error("Study prefetch error:", e);
        similarityCache[index] = null;
    }
}

function renderStudySimilarity(similarList) {
    if (similarList && similarList.length > 0) {
        const triggerBtn = document.getElementById('btn-similarity-trigger');
        triggerBtn.classList.remove('hidden');
        triggerBtn.textContent = `Benzer Soru Bulundu (%${similarList[0].ratio}) 🔍`;
        
        document.getElementById('similarity-container').classList.remove('hidden');
        
        const listEl = document.getElementById('similarity-list');
        listEl.innerHTML = "";
        similarList.forEach(item => {
            const row = document.createElement('div');
            row.style.padding = '0.5rem';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.style.fontSize = '0.85rem';
            
            const sourceText = item.kurul_adi
                ? `${item.kurul_adi.toUpperCase()} (${item.yil}) Soru #${item.soru_numarasi}`
                : `Genel Tekrar`;
            
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 0.25rem;">
                    <span style="color: var(--color-primary-hover);">${item.source || 'Soru'} - Benzerlik: %${item.ratio}</span>
                </div>
                <div class="similar-detail ${isAnswered ? '' : 'hidden'}" style="margin-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 0.25rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                        <span style="color: var(--text-muted); font-size: 0.8rem;">ID: ${item.id ? '#' + item.id : 'JSON'} | Kaynak: ${sourceText}</span>
                        <span style="color: var(--color-success); font-weight: 600;">Cevap: ${item.correct_option}</span>
                    </div>
                    <div style="color: var(--text-main); margin-bottom: 0.25rem; white-space: pre-line;">${item.question_text}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.25rem;">
                        <div>A) ${item.option_a}</div>
                        <div>B) ${item.option_b}</div>
                        <div>C) ${item.option_c}</div>
                        <div>D) ${item.option_d}</div>
                        <div>E) ${item.option_e}</div>
                    </div>
                </div>
            `;
            listEl.appendChild(row);
        });
    }
}

async function displayActiveQuestion() {
    const activeCard = document.getElementById('study-active-card');
    const emptyState = document.getElementById('study-empty-state');
    
    // Reset similarity
    document.getElementById('btn-similarity-trigger').classList.add('hidden');
    document.getElementById('similarity-container').classList.add('hidden');
    document.getElementById('similarity-list').innerHTML = "";
    
    if (dueQuestions.length === 0 || currentQuestionIndex >= dueQuestions.length) {
        activeCard.classList.add('hidden');
        emptyState.classList.remove('hidden');
        document.getElementById('study-progress-text').textContent = "Tamamlandı";
        document.getElementById('study-progress-bar').style.width = "100%";
        
        const emptyDesc = document.getElementById('empty-state-desc');
        const freeStudyBtn = document.getElementById('btn-start-free-study');
        
        if (studyMode === 'all') {
            emptyDesc.textContent = "Tüm soruları başarıyla tekrar ettiniz! Harika bir çalışma seansıydı.";
            freeStudyBtn.classList.add('hidden');
        } else {
            emptyDesc.textContent = "Şu an tekrar etmen gereken hiçbir soru kalmadı. Kendini tebrik edebilirsin!";
            freeStudyBtn.classList.remove('hidden');
        }
        
        refreshDashboardStats();
        return;
    }
    
    activeCard.classList.remove('hidden');
    emptyState.classList.add('hidden');
    
    const progressPercent = (dueQuestions.length > 0) ? (currentQuestionIndex / dueQuestions.length) * 100 : 0;
    document.getElementById('study-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('study-progress-text').textContent = `Soru ${currentQuestionIndex + 1} / ${dueQuestions.length}`;
    
    const question = dueQuestions[currentQuestionIndex];
    document.getElementById('study-question-text').textContent = question.question_text;
    document.getElementById('study-opt-a').textContent = question.option_a;
    document.getElementById('study-opt-b').textContent = question.option_b;
    document.getElementById('study-opt-c').textContent = question.option_c;
    document.getElementById('study-opt-d').textContent = question.option_d;
    document.getElementById('study-opt-e').textContent = question.option_e;
    
    const badgeText = question.kurul_adi 
        ? `${question.kurul_adi.toUpperCase()} (${question.yil}) - Soru #${question.soru_numarasi}` 
        : `Genel Tekrar (${question.yil || 'final'})`;
    document.getElementById('study-question-badge').textContent = badgeText;
    
    const optionButtons = document.querySelectorAll('#study-options-container .option-btn');
    optionButtons.forEach(btn => {
        btn.className = "option-btn";
        btn.disabled = false;
    });
    
    // Reset rating buttons highlight
    const ratingButtons = document.querySelectorAll('#study-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => btn.style.boxShadow = '');
    
    document.getElementById('study-feedback-panel').classList.add('hidden');
    
    // Enable/disable navigation buttons
    const prevBtn = document.getElementById('btn-study-prev');
    const nextBtn = document.getElementById('btn-study-next');
    if (prevBtn) prevBtn.disabled = (currentQuestionIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentQuestionIndex >= dueQuestions.length - 1);
    
    if (sessionAnswersStudy[currentQuestionIndex] !== undefined) {
        isAnswered = true;
        optionButtons.forEach(btn => btn.disabled = true);
        
        const choice = sessionAnswersStudy[currentQuestionIndex];
        const correctChoice = question.correct_option;
        const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
        const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
        
        if (selectedBtn) {
            if (choice === correctChoice) {
                selectedBtn.classList.add('selected-correct');
                document.getElementById('study-feedback-msg').textContent = "Doğru Cevap! 🎉";
                document.getElementById('study-feedback-msg').className = "feedback-message text-success";
            } else {
                selectedBtn.classList.add('selected-wrong');
                if (correctBtn) correctBtn.classList.add('reveal-correct');
                document.getElementById('study-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
                document.getElementById('study-feedback-msg').className = "feedback-message text-danger";
            }
        }
        
        document.getElementById('study-feedback-panel').classList.remove('hidden');
        
        if (sessionRatingsStudy[currentQuestionIndex] !== undefined) {
            const ratedVal = sessionRatingsStudy[currentQuestionIndex];
            const ratedBtn = Array.from(ratingButtons).find(btn => parseInt(btn.dataset.rating) === ratedVal);
            if (ratedBtn) {
                ratedBtn.style.boxShadow = '0 0 12px var(--color-primary)';
            }
        }
    } else {
        isAnswered = false;
    }
    
    // Render from prefetch cache or fetch if not present
    const cachedData = similarityCache[currentQuestionIndex];
    if (cachedData) {
        if (!cachedData.loading) {
            renderStudySimilarity(cachedData);
        }
    } else {
        prefetchStudySimilarity(currentQuestionIndex);
    }
    
    // Prefetch next question
    if (currentQuestionIndex + 1 < dueQuestions.length) {
        prefetchStudySimilarity(currentQuestionIndex + 1);
    }
}

function setupStudyPanel() {
    const optionsContainer = document.getElementById('study-options-container');
    optionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn || isAnswered) return;
        
        handleChoiceSelection(btn.dataset.choice);
    });
    
    // Stop study session button
    document.getElementById('btn-stop-study').addEventListener('click', () => {
        switchPanel('dashboard');
    });
    
    // Start free study from the empty session screen
    document.getElementById('btn-start-free-study').addEventListener('click', () => {
        studyMode = 'all';
        startStudySession();
    });
    
    // Prev / Next Question Buttons
    document.getElementById('btn-study-prev').addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            displayActiveQuestion();
        }
    });
    document.getElementById('btn-study-next').addEventListener('click', () => {
        if (currentQuestionIndex < dueQuestions.length - 1) {
            currentQuestionIndex++;
            displayActiveQuestion();
        }
    });
    
    // Rating / rescheduling buttons
    const ratingButtons = document.querySelectorAll('#study-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const rating = parseInt(btn.dataset.rating);
            submitQuestionReview(rating);
        });
    });

    // Similarity panel toggle controls
    const simCloseBtn = document.getElementById('btn-close-similarity');
    if (simCloseBtn) {
        simCloseBtn.addEventListener('click', () => {
            document.getElementById('similarity-container').classList.add('hidden');
        });
    }
    const simTriggerBtn = document.getElementById('btn-similarity-trigger');
    if (simTriggerBtn) {
        simTriggerBtn.addEventListener('click', () => {
            document.getElementById('similarity-container').classList.remove('hidden');
        });
    }
}

function handleChoiceSelection(choice) {
    isAnswered = true;
    sessionAnswersStudy[currentQuestionIndex] = choice;
    const question = dueQuestions[currentQuestionIndex];
    const optionButtons = document.querySelectorAll('#study-options-container .option-btn');
    
    // Disable all options
    optionButtons.forEach(btn => btn.disabled = true);
    
    const correctChoice = question.correct_option;
    const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
    const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
    
    if (choice === correctChoice) {
        selectedBtn.classList.add('selected-correct');
        document.getElementById('study-feedback-msg').textContent = "Doğru Cevap! 🎉";
        document.getElementById('study-feedback-msg').className = "feedback-message text-success";
    } else {
        selectedBtn.classList.add('selected-wrong');
        if (correctBtn) correctBtn.classList.add('reveal-correct');
        document.getElementById('study-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
        document.getElementById('study-feedback-msg').className = "feedback-message text-danger";
    }
    
    // Reveal similarity details once answered
    document.querySelectorAll('#similarity-list .similar-detail').forEach(el => el.classList.remove('hidden'));

    // Show rating panel
    document.getElementById('study-feedback-panel').classList.remove('hidden');
}

async function submitQuestionReview(rating) {
    const question = dueQuestions[currentQuestionIndex];
    sessionRatingsStudy[currentQuestionIndex] = rating;
    
    try {
        const response = await fetch(`/api/questions/${question.id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating })
        });
        
        if (response.ok) {
            if (rating === 1) {
                // Keep the card in this study session by appending it to the end of the array
                dueQuestions.push(question);
                showToast("Tekrarlanacak sorulara geri eklendi.");
            } else {
                showToast("Cevap kaydedildi.");
            }
            
            // Advance to next question
            currentQuestionIndex++;
            displayActiveQuestion();
        } else {
            showToast("Veri kaydedilemedi.", "error");
        }
    } catch (error) {
        console.error("Save review error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

// 4.5 Question Management Logic
function setupManagementPanel() {
    const searchInput = document.getElementById('manage-search');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderManagementQuestions(allQuestions);
            return;
        }
        
        const filtered = allQuestions.filter(q => {
            return q.question_text.toLowerCase().includes(query) ||
                   q.option_a.toLowerCase().includes(query) ||
                   q.option_b.toLowerCase().includes(query) ||
                   q.option_c.toLowerCase().includes(query) ||
                   q.option_d.toLowerCase().includes(query) ||
                   q.option_e.toLowerCase().includes(query);
        });
        renderManagementQuestions(filtered);
    });

    // Select/Deselect All Checkbox
    const selectAllCheckbox = document.getElementById('checkbox-select-all');
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const currentVisibleCheckboxes = document.querySelectorAll('.question-select-checkbox');
        currentVisibleCheckboxes.forEach(cb => {
            const id = parseInt(cb.dataset.id);
            cb.checked = isChecked;
            if (isChecked) {
                selectedQuestionIds.add(id);
            } else {
                selectedQuestionIds.delete(id);
            }
        });
        updateBulkActionsBar();
    });

    // Bulk Delete Action
    const btnBulkDelete = document.getElementById('btn-bulk-delete');
    btnBulkDelete.addEventListener('click', async () => {
        if (selectedQuestionIds.size === 0) return;
        try {
            const response = await fetch('/api/questions/delete-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedQuestionIds) })
            });
            if (response.ok) {
                showToast(`${selectedQuestionIds.size} soru başarıyla silindi.`);
                selectedQuestionIds.clear();
                document.getElementById('checkbox-select-all').checked = false;
                updateBulkActionsBar();
                loadManagementQuestions();
                refreshDashboardStats();
            } else {
                showToast("Sorular silinemedi.", "error");
            }
        } catch (error) {
            console.error("Bulk delete error:", error);
            showToast("Bağlantı hatası.", "error");
        }
    });

    // Bulk Reset Action
    const btnBulkReset = document.getElementById('btn-bulk-reset-progress');
    btnBulkReset.addEventListener('click', async () => {
        if (selectedQuestionIds.size === 0) return;
        try {
            const response = await fetch('/api/questions/reset-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedQuestionIds) })
            });
            if (response.ok) {
                showToast(`${selectedQuestionIds.size} sorunun ilerlemesi sıfırlandı.`);
                selectedQuestionIds.clear();
                document.getElementById('checkbox-select-all').checked = false;
                updateBulkActionsBar();
                loadManagementQuestions();
                refreshDashboardStats();
            } else {
                showToast("İlerlemeler sıfırlanamadı.", "error");
            }
        } catch (error) {
            console.error("Bulk reset error:", error);
            showToast("Bağlantı hatası.", "error");
        }
    });
    
    // Modal Close Triggers
    document.getElementById('edit-modal-close').addEventListener('click', () => {
        document.getElementById('edit-modal').classList.add('hidden');
    });
    
    document.getElementById('btn-edit-cancel').addEventListener('click', () => {
        document.getElementById('edit-modal').classList.add('hidden');
    });
    
    // Form Submit Trigger
    document.getElementById('form-edit-question').addEventListener('submit', (e) => {
        e.preventDefault();
        submitEditQuestion();
    });
}

async function loadManagementQuestions() {
    try {
        const response = await fetch('/api/questions');
        allQuestions = await response.json();
        
        if (response.ok) {
            // Reset search input
            document.getElementById('manage-search').value = "";
            selectedQuestionIds.clear();
            updateBulkActionsBar();
            renderManagementQuestions(allQuestions);
        }
    } catch (error) {
        console.error("Load all questions error:", error);
        showToast("Sorular yüklenemedi.", "error");
    }
}

function renderManagementQuestions(questions) {
    const listContainer = document.getElementById('manage-questions-list');
    listContainer.innerHTML = "";
    
    if (questions.length === 0) {
        listContainer.innerHTML = `
            <div class="card" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                <p>Herhangi bir soru bulunamadı.</p>
            </div>
        `;
        // Ensure actions bar counts are updated even if empty
        updateBulkActionsBar();
        return;
    }
    
    questions.forEach(q => {
        const card = document.createElement('div');
        card.className = "card question-item-card";
        card.style.marginBottom = "1rem";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.gap = "1.25rem";
        card.style.borderColor = "var(--border-color)";
        
        // Formatted date
        const reviewDate = new Date(q.next_review).toLocaleDateString('tr-TR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        
        const isChecked = selectedQuestionIds.has(q.id) ? 'checked' : '';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <input type="checkbox" class="question-select-checkbox" data-id="${q.id}" ${isChecked} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-primary);">
                    <span style="font-size: 0.8rem; background: rgba(255, 255, 255, 0.05); padding: 0.25rem 0.5rem; border-radius: 4px; color: var(--text-muted); font-family: monospace; font-weight: 600;">Soru ID: #${q.id}</span>
                </div>
                <div style="display: flex; gap: 0.75rem;">
                    <button class="btn btn-secondary btn-edit" data-id="${q.id}" style="padding: 0.4rem 0.9rem; font-size: 0.85rem;">Düzenle</button>
                    <button class="btn btn-danger btn-delete" data-id="${q.id}" style="padding: 0.4rem 0.9rem; font-size: 0.85rem; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.25); color: #fca5a5;">Sil</button>
                </div>
            </div>
            <div style="font-size: 1rem; line-height: 1.6; font-weight: 500; white-space: pre-line;">${q.question_text}</div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.75rem; font-size: 0.9rem; color: var(--text-muted);">
                <div style="padding: 0.5rem; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03);"><strong style="color: var(--color-primary-hover);">A:</strong> ${q.option_a}</div>
                <div style="padding: 0.5rem; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03);"><strong style="color: var(--color-primary-hover);">B:</strong> ${q.option_b}</div>
                <div style="padding: 0.5rem; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03);"><strong style="color: var(--color-primary-hover);">C:</strong> ${q.option_c}</div>
                <div style="padding: 0.5rem; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03);"><strong style="color: var(--color-primary-hover);">D:</strong> ${q.option_d}</div>
                <div style="padding: 0.5rem; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03);"><strong style="color: var(--color-primary-hover);">E:</strong> ${q.option_e}</div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
                <span>Doğru Cevap: <strong style="color: var(--color-success); font-size: 1rem; margin-left: 0.25rem;">${q.correct_option}</strong></span>
                <span>Sıradaki Tekrar: <strong style="color: var(--text-light);">${reviewDate}</strong> (Aralık: <strong>${q.interval} gün</strong>, Kolaylık: <strong>${q.ease_factor}</strong>)</span>
            </div>
        `;
        
        // Checkbox change event
        card.querySelector('.question-select-checkbox').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
                selectedQuestionIds.add(q.id);
            } else {
                selectedQuestionIds.delete(q.id);
            }
            updateBulkActionsBar();
        });
        
        // Edit button click event
        card.querySelector('.btn-edit').addEventListener('click', () => {
            openEditModal(q);
        });
        
        // Delete button click event
        card.querySelector('.btn-delete').addEventListener('click', () => {
            deleteQuestion(q.id);
        });
        
        listContainer.appendChild(card);
    });
    
    // Update bulk actions bar select-all state based on rendered items
    updateBulkActionsBar();
}

function openEditModal(q) {
    document.getElementById('edit-question-id').value = q.id;
    document.getElementById('edit-question').value = q.question_text;
    document.getElementById('edit-option-a').value = q.option_a;
    document.getElementById('edit-option-b').value = q.option_b;
    document.getElementById('edit-option-c').value = q.option_c;
    document.getElementById('edit-option-d').value = q.option_d;
    document.getElementById('edit-option-e').value = q.option_e;
    document.getElementById('edit-select-correct').value = q.correct_option;
    
    document.getElementById('edit-modal').classList.remove('hidden');
}

async function deleteQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast("Soru silindi.");
            selectedQuestionIds.delete(id);
            updateBulkActionsBar();
            loadManagementQuestions();
            refreshDashboardStats();
            similarityCache = {};
            kurulSimilarityCache = {};
            finalSimilarityCache = {};
        } else {
            showToast("Soru silinemedi.", "error");
        }
    } catch (error) {
        console.error("Delete error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

function updateBulkActionsBar() {
    const countSpan = document.getElementById('selected-count');
    const btnBulkDelete = document.getElementById('btn-bulk-delete');
    const btnBulkReset = document.getElementById('btn-bulk-reset-progress');
    const selectAllCheckbox = document.getElementById('checkbox-select-all');
    
    if (!countSpan || !btnBulkDelete || !btnBulkReset || !selectAllCheckbox) return;
    
    countSpan.textContent = selectedQuestionIds.size;
    
    if (selectedQuestionIds.size > 0) {
        btnBulkDelete.disabled = false;
        btnBulkReset.disabled = false;
    } else {
        btnBulkDelete.disabled = true;
        btnBulkReset.disabled = true;
    }
    
    // Update select all checkbox checked state based on visible question cards
    const currentVisibleCheckboxes = document.querySelectorAll('.question-select-checkbox');
    if (currentVisibleCheckboxes.length > 0) {
        let allChecked = true;
        currentVisibleCheckboxes.forEach(cb => {
            if (!cb.checked) allChecked = false;
        });
        selectAllCheckbox.checked = allChecked;
    } else {
        selectAllCheckbox.checked = false;
    }
}

async function submitEditQuestion() {
    const id = document.getElementById('edit-question-id').value;
    const data = {
        question_text: document.getElementById('edit-question').value,
        option_a: document.getElementById('edit-option-a').value,
        option_b: document.getElementById('edit-option-b').value,
        option_c: document.getElementById('edit-option-c').value,
        option_d: document.getElementById('edit-option-d').value,
        option_e: document.getElementById('edit-option-e').value,
        correct_option: document.getElementById('edit-select-correct').value
    };
    
    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast("Soru güncellendi.");
            document.getElementById('edit-modal').classList.add('hidden');
            loadManagementQuestions();
            similarityCache = {};
            kurulSimilarityCache = {};
            finalSimilarityCache = {};
        } else {
            const err = await response.json();
            showToast(err.error || "Soru güncellenemedi.", "error");
        }
    } catch (error) {
        console.error("Update error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

// 5. Keyboard Shortcuts
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        // 1. Prevent shortcuts if typing in input fields
        const activeEl = document.activeElement;
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') {
            // Ctrl + Enter shortcut inside Add Question form
            if (e.key === 'Enter' && e.ctrlKey && panels.add.classList.contains('active')) {
                e.preventDefault();
                // Trigger form submit
                document.getElementById('form-add-question').requestSubmit();
            }
            return;
        }
        
        // 2. Study screen keyboard navigation
        if (panels.study.classList.contains('active') && dueQuestions.length > 0 && currentQuestionIndex < dueQuestions.length) {
            
            // Answer stage (A, B, C, D, E keys)
            if (!isAnswered) {
                const key = e.key.toUpperCase();
                if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
                    e.preventDefault();
                    handleChoiceSelection(key);
                }
            } 
            // Rating stage (1-11 keys)
            else {
                if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
                    e.preventDefault();
                    submitQuestionReview(parseInt(e.key));
                } else if (e.key === '0') {
                    e.preventDefault();
                    submitQuestionReview(10);
                } else if (e.key === '-' || e.key === 'p' || e.key === 'P') {
                    e.preventDefault();
                    submitQuestionReview(11);
                }
            }
        }

        // 3. Kurul screen keyboard navigation
        if (panels.kurul.classList.contains('active') && kurulQuestions.length > 0 && currentKurulIndex < kurulQuestions.length) {
            
            // Answer stage (A, B, C, D, E keys)
            if (!isKurulAnswered) {
                const key = e.key.toUpperCase();
                if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
                    e.preventDefault();
                    handleKurulChoiceSelection(key);
                }
            } 
            // Rating stage (1-11 keys)
            else {
                if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
                    e.preventDefault();
                    submitKurulQuestionReview(parseInt(e.key));
                } else if (e.key === '0') {
                    e.preventDefault();
                    submitKurulQuestionReview(10);
                } else if (e.key === '-' || e.key === 'p' || e.key === 'P') {
                    e.preventDefault();
                    submitKurulQuestionReview(11);
                }
            }
        }

        // 3.5. Final screen keyboard navigation
        if (panels.final.classList.contains('active') && finalQuestions.length > 0 && currentFinalIndex < finalQuestions.length) {
            
            // Answer stage (A, B, C, D, E keys)
            if (!isFinalAnswered) {
                const key = e.key.toUpperCase();
                if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
                    e.preventDefault();
                    handleFinalChoiceSelection(key);
                }
            } 
            // Rating stage (1-11 keys)
            else {
                if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
                    e.preventDefault();
                    submitFinalQuestionReview(parseInt(e.key));
                } else if (e.key === '0') {
                    e.preventDefault();
                    submitFinalQuestionReview(10);
                } else if (e.key === '-' || e.key === 'p' || e.key === 'P') {
                    e.preventDefault();
                    submitFinalQuestionReview(11);
                }
            }
        }
    });
}

// 6. Alert / Toast System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Add simple inline icon
    const icon = type === 'success' 
        ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 18px; height: 18px; color: var(--color-success);"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 18px; height: 18px; color: var(--color-danger);"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>`;
        
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    
    // Remove toast after 3s
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
}

// Append CSS fadeout dynamically if not in file
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
    }
    .text-success { color: var(--color-success) !important; }
    .text-danger { color: var(--color-danger) !important; }
`;
document.head.appendChild(style);

// ==========================================
// 7. Committee (Kurul) Exam Solve Logic
// ==========================================
function setupKurulPanel() {
    // Stop kurul solving button
    document.getElementById('btn-stop-kurul').addEventListener('click', () => {
        const confirmStop = confirm("Sınavı sonlandırmak istediğinize emin misiniz? İlerlemeniz kaydedilecektir.");
        if (confirmStop) {
            document.getElementById('kurul-active-container').classList.add('hidden');
            document.getElementById('kurul-selection-container').classList.remove('hidden');
            loadKurulList();
        }
    });
    
    // Prev / Next Question Buttons
    document.getElementById('btn-kurul-prev').addEventListener('click', () => {
        if (currentKurulIndex > 0) {
            currentKurulIndex--;
            displayKurulQuestion();
        }
    });
    document.getElementById('btn-kurul-next').addEventListener('click', () => {
        if (currentKurulIndex < kurulQuestions.length - 1) {
            currentKurulIndex++;
            displayKurulQuestion();
        }
    });
    
    // Choice selection buttons inside kurul active solving panel
    const optionsContainer = document.getElementById('kurul-options-container');
    optionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn || isKurulAnswered) return;
        handleKurulChoiceSelection(btn.dataset.choice);
    });
    
    // Rating buttons inside kurul active solving panel
    const ratingButtons = document.querySelectorAll('#kurul-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const rating = parseInt(btn.dataset.rating);
            submitKurulQuestionReview(rating);
        });
    });
    
    // Close button for kurul similarity container
    const simCloseBtn = document.getElementById('btn-kurul-close-similarity');
    if (simCloseBtn) {
        simCloseBtn.addEventListener('click', () => {
            document.getElementById('kurul-similarity-container').classList.add('hidden');
        });
    }
}

async function loadKurulList() {
    try {
        const response = await fetch('/api/kurullar');
        const kurullar = await response.json();
        
        const listEl = document.getElementById('kurul-list');
        listEl.innerHTML = "";
        
        if (!response.ok || kurullar.length === 0) {
            listEl.innerHTML = `<div style="color: var(--text-muted);">Mevcut kurul bulunmamaktadır.</div>`;
            return;
        }
        
        kurullar.forEach(kurul => {
            const card = document.createElement('div');
            card.className = "card kurul-item-card";
            card.innerHTML = `
                <div>
                    <h4 style="font-size: 1.15rem; margin-bottom: 0.5rem; color: var(--text-light);">${kurul.name}</h4>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Toplam ${kurul.count} Soru</p>
                </div>
                <button class="btn btn-primary btn-start-kurul-exam" data-file="${kurul.file_name}" data-yil="${kurul.yil}" data-name="${kurul.id}" style="width: 100%; font-size: 0.9rem; padding: 0.6rem 1rem;">
                    <span>Sınavı Başlat</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 16px; height: 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                </button>
            `;
            
            card.querySelector('.btn-start-kurul-exam').addEventListener('click', (e) => {
                const file = e.currentTarget.dataset.file;
                const yil = e.currentTarget.dataset.yil;
                const name = e.currentTarget.dataset.name;
                startKurulSolving(file, yil, name);
            });
            
            listEl.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading kurullar:", error);
        showToast("Kurul listesi yüklenemedi.", "error");
    }
}

async function startKurulSolving(file, yil, name) {
    try {
        const response = await fetch(`/api/kurullar/${file}/${yil}/questions`);
        kurulQuestions = await response.json();
        
        if (response.ok && kurulQuestions.length > 0) {
            currentKurulIndex = 0;
            isKurulAnswered = false;
            sessionAnswersKurul = {};
            sessionRatingsKurul = {};
            kurulSimilarityCache = {};
            const kurulCode = file.replace("sorular_", "").replace(".json", "");
            activeKurul = {
                file_name: file,
                yil: yil,
                kurul_adi: kurulCode
            };
            
            document.getElementById('kurul-selection-container').classList.add('hidden');
            document.getElementById('kurul-active-container').classList.remove('hidden');
            
            document.getElementById('kurul-name-badge').textContent = `${kurulCode.toUpperCase()} (${yil})`;
            
            displayKurulQuestion();
        } else {
            showToast("Kurul soruları yüklenemedi.", "error");
        }
    } catch (error) {
        console.error("Error loading kurul questions:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

async function prefetchKurulSimilarity(index) {
    if (index < 0 || index >= kurulQuestions.length) return;
    if (kurulSimilarityCache[index]) return;
    
    kurulSimilarityCache[index] = { loading: true };
    try {
        const question = kurulQuestions[index];
        const threshold = parseFloat(document.getElementById('similarity-threshold-slider')?.value || 70) / 100;
        const response = await fetch('/api/questions/similarity-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: question.soru_koku,
                question_id: question.db_id,
                kurul_adi: activeKurul.kurul_adi,
                yil: activeKurul.yil,
                soru_numarasi: question.soru_numarasi,
                option_a: question.secenekler.A || "",
                option_b: question.secenekler.B || "",
                option_c: question.secenekler.C || "",
                option_d: question.secenekler.D || "",
                option_e: question.secenekler.E || "",
                threshold: threshold
            })
        });
        if (response.ok) {
            kurulSimilarityCache[index] = await response.json();
            if (currentKurulIndex === index) {
                renderKurulSimilarity(kurulSimilarityCache[index]);
            }
        } else {
            kurulSimilarityCache[index] = null;
        }
    } catch (e) {
        console.error("Kurul prefetch error:", e);
        kurulSimilarityCache[index] = null;
    }
}

function renderKurulSimilarity(similarList) {
    const simContainer = document.getElementById('kurul-similarity-container');
    if (similarList && similarList.length > 0 && simContainer) {
        simContainer.classList.remove('hidden');
        const listEl = document.getElementById('kurul-similarity-list');
        listEl.innerHTML = "";
        similarList.forEach(item => {
            const row = document.createElement('div');
            row.style.padding = '0.5rem';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.style.fontSize = '0.85rem';
            
            const sourceText = item.kurul_adi
                ? `${item.kurul_adi.toUpperCase()} (${item.yil}) Soru #${item.soru_numarasi}`
                : `Genel Tekrar`;
                
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 0.25rem;">
                    <span style="color: var(--color-primary-hover);">${item.source || 'Soru'} - Benzerlik: %${item.ratio}</span>
                </div>
                <div class="similar-detail ${isKurulAnswered ? '' : 'hidden'}" style="margin-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 0.25rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                        <span style="color: var(--text-muted); font-size: 0.8rem;">ID: ${item.id ? '#' + item.id : 'JSON'} | Kaynak: ${sourceText}</span>
                        <span style="color: var(--color-success); font-weight: 600;">Cevap: ${item.correct_option}</span>
                    </div>
                    <div style="color: var(--text-main); margin-bottom: 0.25rem; white-space: pre-line;">${item.question_text}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.25rem;">
                        <div>A) ${item.option_a}</div>
                        <div>B) ${item.option_b}</div>
                        <div>C) ${item.option_c}</div>
                        <div>D) ${item.option_d}</div>
                        <div>E) ${item.option_e}</div>
                    </div>
                </div>
            `;
            listEl.appendChild(row);
        });
    }
}

async function displayKurulQuestion() {
    const activeContainer = document.getElementById('kurul-active-container');
    const selectionContainer = document.getElementById('kurul-selection-container');
    
    // Reset similarity
    const simContainer = document.getElementById('kurul-similarity-container');
    if (simContainer) {
        simContainer.classList.add('hidden');
        document.getElementById('kurul-similarity-list').innerHTML = "";
    }
    
    if (kurulQuestions.length === 0 || currentKurulIndex >= kurulQuestions.length) {
        showToast("Kurul sınavı tamamlandı! Tebrikler.");
        activeContainer.classList.add('hidden');
        selectionContainer.classList.remove('hidden');
        loadKurulList();
        refreshDashboardStats();
        return;
    }
    
    isKurulAnswered = false;
    
    const progressPercent = (currentKurulIndex / kurulQuestions.length) * 100;
    document.getElementById('kurul-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('kurul-progress-text').textContent = `Soru ${currentKurulIndex + 1} / ${kurulQuestions.length}`;
    
    const question = kurulQuestions[currentKurulIndex];
    document.getElementById('kurul-question-text').textContent = question.soru_koku;
    
    document.getElementById('kurul-opt-a').textContent = question.secenekler.A;
    document.getElementById('kurul-opt-b').textContent = question.secenekler.B;
    document.getElementById('kurul-opt-c').textContent = question.secenekler.C;
    document.getElementById('kurul-opt-d').textContent = question.secenekler.D;
    document.getElementById('kurul-opt-e').textContent = question.secenekler.E;
    
    const badgeText = `${activeKurul.kurul_adi.toUpperCase()} (${activeKurul.yil}) - Soru #${question.soru_numarasi}`;
    document.getElementById('kurul-question-badge').textContent = badgeText;
    
    const optionButtons = document.querySelectorAll('#kurul-options-container .option-btn');
    optionButtons.forEach(btn => {
        btn.className = "option-btn";
        btn.disabled = false;
    });
    
    // Reset rating buttons highlight
    const ratingButtons = document.querySelectorAll('#kurul-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => btn.style.boxShadow = '');
    
    document.getElementById('kurul-feedback-panel').classList.add('hidden');
    
    // Enable/disable navigation buttons
    const prevBtn = document.getElementById('btn-kurul-prev');
    const nextBtn = document.getElementById('btn-kurul-next');
    if (prevBtn) prevBtn.disabled = (currentKurulIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentKurulIndex >= kurulQuestions.length - 1);
    
    if (sessionAnswersKurul[currentKurulIndex] !== undefined) {
        isKurulAnswered = true;
        optionButtons.forEach(btn => btn.disabled = true);
        
        const choice = sessionAnswersKurul[currentKurulIndex];
        const correctChoice = question.db_correct_option || question.cevap;
        const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
        const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
        
        if (selectedBtn) {
            if (choice === correctChoice) {
                selectedBtn.classList.add('selected-correct');
                document.getElementById('kurul-feedback-msg').textContent = "Doğru Cevap! 🎉";
                document.getElementById('kurul-feedback-msg').className = "feedback-message text-success";
            } else {
                selectedBtn.classList.add('selected-wrong');
                if (correctBtn) correctBtn.classList.add('reveal-correct');
                document.getElementById('kurul-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
                document.getElementById('kurul-feedback-msg').className = "feedback-message text-danger";
            }
        }
        
        document.getElementById('kurul-feedback-panel').classList.remove('hidden');
        
        if (sessionRatingsKurul[currentKurulIndex] !== undefined) {
            const ratedVal = sessionRatingsKurul[currentKurulIndex];
            const ratedBtn = Array.from(ratingButtons).find(btn => parseInt(btn.dataset.rating) === ratedVal);
            if (ratedBtn) {
                ratedBtn.style.boxShadow = '0 0 12px var(--color-primary)';
            }
        }
    } else {
        isKurulAnswered = false;
    }
    
    // Render similarity from prefetch cache or fetch if not present
    const cachedData = kurulSimilarityCache[currentKurulIndex];
    if (cachedData) {
        if (!cachedData.loading) {
            renderKurulSimilarity(cachedData);
        }
    } else {
        prefetchKurulSimilarity(currentKurulIndex);
    }
    
    // Prefetch next kurul question similarity
    if (currentKurulIndex + 1 < kurulQuestions.length) {
        prefetchKurulSimilarity(currentKurulIndex + 1);
    }
}

function handleKurulChoiceSelection(choice) {
    isKurulAnswered = true;
    sessionAnswersKurul[currentKurulIndex] = choice;
    const question = kurulQuestions[currentKurulIndex];
    const optionButtons = document.querySelectorAll('#kurul-options-container .option-btn');
    
    optionButtons.forEach(btn => btn.disabled = true);
    
    const correctChoice = question.db_correct_option || question.cevap;
    const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
    const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
    
    if (choice === correctChoice) {
        selectedBtn.classList.add('selected-correct');
        document.getElementById('kurul-feedback-msg').textContent = "Doğru Cevap! 🎉";
        document.getElementById('kurul-feedback-msg').className = "feedback-message text-success";
    } else {
        selectedBtn.classList.add('selected-wrong');
        correctBtn.classList.add('reveal-correct');
        document.getElementById('kurul-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
        document.getElementById('kurul-feedback-msg').className = "feedback-message text-danger";
    }
    
    // Reveal similarity details once answered
    document.querySelectorAll('#kurul-similarity-list .similar-detail').forEach(el => el.classList.remove('hidden'));

    document.getElementById('kurul-feedback-panel').classList.remove('hidden');
}

async function submitKurulQuestionReview(rating) {
    const question = kurulQuestions[currentKurulIndex];
    sessionRatingsKurul[currentKurulIndex] = rating;
    
    const payload = {
        question_text: question.soru_koku,
        option_a: question.secenekler.A,
        option_b: question.secenekler.B,
        option_c: question.secenekler.C,
        option_d: question.secenekler.D,
        option_e: question.secenekler.E,
        correct_option: question.db_correct_option || question.cevap,
        rating: rating,
        kurul_adi: activeKurul.kurul_adi,
        yil: activeKurul.yil,
        soru_numarasi: question.soru_numarasi
    };
    
    try {
        const response = await fetch('/api/questions/review-kurul', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            showToast("İlerleme kaydedildi.");
            currentKurulIndex++;
            displayKurulQuestion();
        } else {
            showToast("Veri kaydedilemedi.", "error");
        }
    } catch (error) {
        console.error("Save kurul review error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

// ==========================================
// 8. Logs / Undo History Logic
// ==========================================
function setupLogsPanel() {
    // Triggered automatically on navbar navigation switchPanel
}

async function loadLogsList() {
    try {
        const response = await fetch('/api/logs');
        const logs = await response.json();
        
        const tbody = document.getElementById('logs-list-table');
        tbody.innerHTML = "";
        
        if (!response.ok || logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 2rem 0; text-align: center; color: var(--text-muted);">Henüz işlem kaydı bulunmamaktadır.</td></tr>`;
            return;
        }
        
        logs.forEach(log => {
            const logDate = new Date(log.timestamp + 'Z').toLocaleDateString('tr-TR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            
            let oldData = null;
            let newData = null;
            try {
                if (log.old_data) oldData = JSON.parse(log.old_data);
                if (log.new_data) newData = JSON.parse(log.new_data);
            } catch (e) {
                console.error("JSON parse error on logs list details:", e);
            }
            
            let detail = "Bilinmeyen işlem";
            const qText = (newData ? newData.question_text : (oldData ? oldData.question_text : ""));
            const textSnippet = qText.length > 40 ? qText.substring(0, 40) + "..." : qText;
            
            if (log.action_type === 'INSERT') {
                detail = `Yeni soru eklendi: "${textSnippet}"`;
            } else if (log.action_type === 'DELETE') {
                detail = `Soru silindi: "${textSnippet}"`;
            } else if (log.action_type === 'UPDATE') {
                detail = `Soru güncellendi: "${textSnippet}"`;
            } else if (log.action_type === 'REVIEW') {
                const oldInt = oldData ? oldData.interval : 0;
                const newInt = newData ? newData.interval : 0;
                const oldEase = oldData ? oldData.ease_factor : 2.5;
                const newEase = newData ? newData.ease_factor : 2.5;
                detail = `Tekrar puanlaması yapıldı (Aralık: ${oldInt} ➔ ${newInt} gün, Kolaylık: ${oldEase} ➔ ${newEase})`;
            } else if (log.action_type === 'CORRECT_ANSWER') {
                const oldCorr = oldData ? oldData.correct_option : "?";
                const newCorr = newData ? newData.correct_option : "?";
                detail = `Cevap anahtarı düzeltildi: ${oldCorr} ➔ ${newCorr}`;
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 1rem 0.75rem; color: var(--text-muted); font-size: 0.85rem;">${logDate}</td>
                <td style="padding: 1rem 0.75rem;"><span class="badge" style="background: rgba(139, 92, 246, 0.15); color: var(--color-primary-hover); font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(139, 92, 246, 0.25);">${log.action_type}</span></td>
                <td style="padding: 1rem 0.75rem; font-family: monospace; color: var(--text-muted);">#${log.target_id}</td>
                <td style="padding: 1rem 0.75rem; color: var(--text-main); font-size: 0.9rem;">${detail}</td>
                <td style="padding: 1rem 0.75rem; text-align: right;">
                    <button class="btn btn-secondary btn-undo-action" data-id="${log.id}" style="padding: 0.3rem 0.75rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" style="width: 12px; height: 12px;">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                        </svg>
                        Geri Al
                    </button>
                </td>
            `;
            
            tr.querySelector('.btn-undo-action').addEventListener('click', (e) => {
                const logId = e.currentTarget.dataset.id;
                undoAction(logId);
            });
            
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error loading logs:", error);
        const tbody = document.getElementById('logs-list-table');
        tbody.innerHTML = `<tr><td colspan="5" style="padding: 2rem 0; text-align: center; color: var(--color-danger);">Loglar yüklenemedi.</td></tr>`;
    }
}

async function undoAction(logId) {
    try {
        const response = await fetch(`/api/logs/${logId}/undo`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showToast("İşlem başarıyla geri alındı!");
            loadLogsList();
            refreshDashboardStats();
            if (panels.manage.classList.contains('active')) {
                loadManagementQuestions();
            }
        } else {
            const err = await response.json();
            showToast(err.error || "Geri alma başarısız oldu.", "error");
        }
    } catch (error) {
        console.error("Undo error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

// ==========================================
// 9. Answer Key Correction & Study Filters
// ==========================================
function setupCorrectionModal() {
    const modal = document.getElementById('correction-modal');
    const closeBtn = document.getElementById('correction-modal-close');
    const cancelBtn = document.getElementById('btn-correction-cancel');
    const submitBtn = document.getElementById('btn-correction-submit');
    
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    document.getElementById('btn-correct-answer-trigger').addEventListener('click', () => {
        const question = dueQuestions[currentQuestionIndex];
        if (!question) return;
        
        document.getElementById('correct-question-id').value = question.id;
        document.getElementById('correct-kurul-adi').value = question.kurul_adi || "";
        document.getElementById('correct-yil').value = question.yil || "";
        document.getElementById('correct-soru-numarasi').value = question.soru_numarasi || "";
        document.getElementById('select-correct-correction').value = question.correct_option;
        
        modal.classList.remove('hidden');
    });
    
    document.getElementById('btn-kurul-correct-answer-trigger').addEventListener('click', () => {
        const question = kurulQuestions[currentKurulIndex];
        if (!question) return;
        
        document.getElementById('correct-question-id').value = question.db_id || "";
        document.getElementById('correct-kurul-adi').value = activeKurul.kurul_adi;
        document.getElementById('correct-yil').value = activeKurul.yil;
        document.getElementById('correct-soru-numarasi').value = question.soru_numarasi;
        document.getElementById('select-correct-correction').value = question.db_correct_option || question.cevap;
        
        modal.classList.remove('hidden');
    });

    document.getElementById('btn-final-correct-answer-trigger').addEventListener('click', () => {
        const question = finalQuestions[currentFinalIndex];
        if (!question) return;
        
        document.getElementById('correct-question-id').value = question.db_id || "";
        document.getElementById('correct-kurul-adi').value = activeFinal.kurul_adi;
        document.getElementById('correct-yil').value = activeFinal.yil;
        document.getElementById('correct-soru-numarasi').value = question.soru_numarasi;
        document.getElementById('select-correct-correction').value = question.db_correct_option || question.cevap;
        
        modal.classList.remove('hidden');
    });
    
    submitBtn.addEventListener('click', async () => {
        const questionId = document.getElementById('correct-question-id').value;
        const kurulAdi = document.getElementById('correct-kurul-adi').value;
        const yil = document.getElementById('correct-yil').value;
        const soruNumarasi = document.getElementById('correct-soru-numarasi').value;
        const correctOption = document.getElementById('select-correct-correction').value;
        
        const payload = {
            correct_option: correctOption
        };
        
        if (questionId) payload.question_id = parseInt(questionId);
        if (kurulAdi) payload.kurul_adi = kurulAdi;
        if (yil) payload.yil = yil;
        if (soruNumarasi) payload.soru_numarasi = parseInt(soruNumarasi);
        
        try {
            const response = await fetch('/api/questions/correct-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                showToast("Cevap anahtarı başarıyla güncellendi.");
                modal.classList.add('hidden');
                
                if (panels.study.classList.contains('active') && dueQuestions[currentQuestionIndex]) {
                    dueQuestions[currentQuestionIndex].correct_option = correctOption;
                    displayActiveQuestion();
                } else if (panels.kurul.classList.contains('active') && kurulQuestions[currentKurulIndex]) {
                    kurulQuestions[currentKurulIndex].db_correct_option = correctOption;
                    displayKurulQuestion();
                } else if (panels.final.classList.contains('active') && finalQuestions[currentFinalIndex]) {
                    finalQuestions[currentFinalIndex].db_correct_option = correctOption;
                    displayFinalQuestion();
                }
            } else {
                const err = await response.json();
                showToast(err.error || "Düzeltme kaydedilemedi.", "error");
            }
        } catch (error) {
            console.error("Correction error:", error);
            showToast("Bağlantı hatası.", "error");
        }
    });
}

function setupStudyFilters() {
    const cancelBtn = document.getElementById('btn-cancel-free-study');
    const applyBtn = document.getElementById('btn-apply-free-study');
    
    cancelBtn.addEventListener('click', () => {
        document.getElementById('study-filter-card').classList.add('hidden');
        switchPanel('dashboard');
    });
    
    applyBtn.addEventListener('click', () => {
        startStudySession();
    });
    
    // Initialize dual range slider for difficulty (ease_factor)
    const minSlider = document.getElementById('filter-study-difficulty-min');
    const maxSlider = document.getElementById('filter-study-difficulty-max');
    const rangeFill = document.getElementById('study-slider-range-fill');
    const label = document.getElementById('study-difficulty-range-val');
    
    if (minSlider && maxSlider && rangeFill && label) {
        const updateSlider = () => {
            const minVal = parseFloat(minSlider.value);
            const maxVal = parseFloat(maxSlider.value);
            
            const totalRange = 1.7; // 3.0 - 1.3
            const minPercent = ((minVal - 1.3) / totalRange) * 100;
            const maxPercent = ((maxVal - 1.3) / totalRange) * 100;
            
            rangeFill.style.left = minPercent + '%';
            rangeFill.style.width = (maxPercent - minPercent) + '%';
            
            label.textContent = `${minVal.toFixed(1)} - ${maxVal.toFixed(1)}`;
        };
        
        minSlider.addEventListener('input', () => {
            if (parseFloat(minSlider.value) > parseFloat(maxSlider.value)) {
                minSlider.value = maxSlider.value;
            }
            updateSlider();
        });
        
        maxSlider.addEventListener('input', () => {
            if (parseFloat(maxSlider.value) < parseFloat(minSlider.value)) {
                maxSlider.value = minSlider.value;
            }
            updateSlider();
        });
        
        // Render initial positions
        updateSlider();
    }
    
    populateFilterKurulSelect();
}

async function populateFilterKurulSelect() {
    try {
        const [kurulRes, finalRes] = await Promise.all([
            fetch('/api/kurullar'),
            fetch('/api/finaller')
        ]);
        
        const kurullar = await kurulRes.json();
        const finaller = await finalRes.json();
        
        const select = document.getElementById('filter-study-kurul');
        if (!select) return;
        select.innerHTML = '<option value="">Tümü</option>';
        
        const addedNames = new Set();
        
        const addOption = (exam) => {
            const code = exam.file_name.replace("sorular_", "").replace(".json", "");
            if (!addedNames.has(code)) {
                addedNames.add(code);
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = code.toUpperCase();
                select.appendChild(opt);
            }
        };
        
        if (kurulRes.ok && kurullar.length > 0) {
            kurullar.forEach(addOption);
        }
        if (finalRes.ok && finaller.length > 0) {
            finaller.forEach(addOption);
        }
    } catch (e) {
        console.error("Error populating filter select:", e);
    }
}

function setupSimilaritySlider() {
    const slider = document.getElementById('similarity-threshold-slider');
    const valueLabel = document.getElementById('similarity-threshold-value');
    
    if (!slider || !valueLabel) return;
    
    let savedVal = localStorage.getItem('similarityThreshold');
    if (!savedVal) {
        savedVal = "70";
    }
    
    slider.value = savedVal;
    
    const updateLabels = (val) => {
        valueLabel.textContent = `%${val}`;
        document.querySelectorAll('.similarity-threshold-text').forEach(el => {
            el.textContent = `%${val}`;
        });
    };
    
    updateLabels(savedVal);
    
    slider.addEventListener('input', (e) => {
        const val = e.target.value;
        updateLabels(val);
        localStorage.setItem('similarityThreshold', val);
    });

    slider.addEventListener('change', () => {
        similarityCache = {};
        kurulSimilarityCache = {};
        finalSimilarityCache = {};
        
        // Re-evaluate currently active question
        if (panels.study.classList.contains('active') && dueQuestions[currentQuestionIndex]) {
            prefetchStudySimilarity(currentQuestionIndex);
        } else if (panels.kurul.classList.contains('active') && kurulQuestions[currentKurulIndex]) {
            prefetchKurulSimilarity(currentKurulIndex);
        } else if (panels.final.classList.contains('active') && finalQuestions[currentFinalIndex]) {
            prefetchFinalSimilarity(currentFinalIndex);
        }
    });
}

// ==========================================
// 7.5. Final Exam Solve Logic
// ==========================================
function setupFinalPanel() {
    // Stop final solving button
    document.getElementById('btn-stop-final').addEventListener('click', () => {
        const confirmStop = confirm("Sınavı sonlandırmak istediğinize emin misiniz? İlerlemeniz kaydedilecektir.");
        if (confirmStop) {
            document.getElementById('final-active-container').classList.add('hidden');
            document.getElementById('final-selection-container').classList.remove('hidden');
            loadFinalList();
        }
    });
    
    // Prev / Next Question Buttons
    document.getElementById('btn-final-prev').addEventListener('click', () => {
        if (currentFinalIndex > 0) {
            currentFinalIndex--;
            displayFinalQuestion();
        }
    });
    document.getElementById('btn-final-next').addEventListener('click', () => {
        if (currentFinalIndex < finalQuestions.length - 1) {
            currentFinalIndex++;
            displayFinalQuestion();
        }
    });
    
    // Choice selection buttons inside final active solving panel
    const optionsContainer = document.getElementById('final-options-container');
    optionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.option-btn');
        if (!btn || isFinalAnswered) return;
        handleFinalChoiceSelection(btn.dataset.choice);
    });
    
    // Rating buttons inside final active solving panel
    const ratingButtons = document.querySelectorAll('#final-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const rating = parseInt(btn.dataset.rating);
            submitFinalQuestionReview(rating);
        });
    });
    
    // Close button for final similarity container
    const simCloseBtn = document.getElementById('btn-final-close-similarity');
    if (simCloseBtn) {
        simCloseBtn.addEventListener('click', () => {
            document.getElementById('final-similarity-container').classList.add('hidden');
        });
    }
}

async function loadFinalList() {
    try {
        const response = await fetch('/api/finaller');
        const finaller = await response.json();
        
        const listEl = document.getElementById('final-list');
        listEl.innerHTML = "";
        
        if (!response.ok || finaller.length === 0) {
            listEl.innerHTML = `<div style="color: var(--text-muted); padding: 1rem;">Mevcut final sınavı bulunmamaktadır.</div>`;
            return;
        }
        
        finaller.forEach(final => {
            const card = document.createElement('div');
            card.className = "card kurul-item-card";
            card.innerHTML = `
                <div>
                    <h4 style="font-size: 1.15rem; margin-bottom: 0.5rem; color: var(--text-light);">${final.name}</h4>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Toplam ${final.count} Soru</p>
                </div>
                <button class="btn btn-primary btn-start-final-exam" data-file="${final.file_name}" data-yil="${final.yil}" data-name="${final.id}" style="width: 100%; font-size: 0.9rem; padding: 0.6rem 1rem;">
                    <span>Sınavı Başlat</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 16px; height: 16px;">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                </button>
            `;
            
            card.querySelector('.btn-start-final-exam').addEventListener('click', (e) => {
                const file = e.currentTarget.dataset.file;
                const yil = e.currentTarget.dataset.yil;
                const name = e.currentTarget.dataset.name;
                startFinalSolving(file, yil, name);
            });
            
            listEl.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading finaller:", error);
        showToast("Final listesi yüklenemedi.", "error");
    }
}

async function startFinalSolving(file, yil, name) {
    try {
        const response = await fetch(`/api/finaller/${file}/${yil}/questions`);
        finalQuestions = await response.json();
        
        if (response.ok && finalQuestions.length > 0) {
            currentFinalIndex = 0;
            isFinalAnswered = false;
            sessionAnswersFinal = {};
            sessionRatingsFinal = {};
            finalSimilarityCache = {};
            const finalCode = file.replace("sorular_", "").replace(".json", "");
            activeFinal = {
                file_name: file,
                yil: yil,
                kurul_adi: finalCode
            };
            
            document.getElementById('final-selection-container').classList.add('hidden');
            document.getElementById('final-active-container').classList.remove('hidden');
            
            document.getElementById('final-name-badge').textContent = `${finalCode.toUpperCase()} (${yil})`;
            
            displayFinalQuestion();
        } else {
            showToast("Final soruları yüklenemedi.", "error");
        }
    } catch (error) {
        console.error("Error loading final questions:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

async function prefetchFinalSimilarity(index) {
    if (index < 0 || index >= finalQuestions.length) return;
    if (finalSimilarityCache[index]) return;
    
    finalSimilarityCache[index] = { loading: true };
    try {
        const question = finalQuestions[index];
        const threshold = parseFloat(document.getElementById('similarity-threshold-slider')?.value || 70) / 100;
        const response = await fetch('/api/questions/similarity-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_text: question.soru_koku,
                question_id: question.db_id,
                kurul_adi: activeFinal.kurul_adi,
                yil: activeFinal.yil,
                soru_numarasi: question.soru_numarasi,
                option_a: question.secenekler.A || "",
                option_b: question.secenekler.B || "",
                option_c: question.secenekler.C || "",
                option_d: question.secenekler.D || "",
                option_e: question.secenekler.E || "",
                threshold: threshold
            })
        });
        if (response.ok) {
            finalSimilarityCache[index] = await response.json();
            if (currentFinalIndex === index) {
                renderFinalSimilarity(finalSimilarityCache[index]);
                if (sessionAnswersFinal[index] !== undefined) {
                    document.querySelectorAll('#final-similarity-list .similar-detail').forEach(el => el.classList.remove('hidden'));
                }
            }
        } else {
            finalSimilarityCache[index] = null;
        }
    } catch (e) {
        console.error("Final prefetch error:", e);
        finalSimilarityCache[index] = null;
    }
}

function renderFinalSimilarity(similarList) {
    const simContainer = document.getElementById('final-similarity-container');
    if (similarList && similarList.length > 0 && simContainer) {
        simContainer.classList.remove('hidden');
        const listEl = document.getElementById('final-similarity-list');
        listEl.innerHTML = "";
        similarList.forEach(item => {
            const row = document.createElement('div');
            row.style.padding = '0.5rem';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.style.fontSize = '0.85rem';
            
            const sourceText = item.kurul_adi
                ? `${item.kurul_adi.toUpperCase()} (${item.yil}) Soru #${item.soru_numarasi}`
                : `Genel Tekrar`;
                
            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 0.25rem;">
                    <span style="color: var(--color-primary-hover);">${item.source || 'Soru'} - Benzerlik: %${item.ratio}</span>
                </div>
                <div class="similar-detail ${isFinalAnswered ? '' : 'hidden'}" style="margin-top: 0.25rem; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 0.25rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                        <span style="color: var(--text-muted); font-size: 0.8rem;">ID: ${item.id ? '#' + item.id : 'JSON'} | Kaynak: ${sourceText}</span>
                        <span style="color: var(--color-success); font-weight: 600;">Cevap: ${item.correct_option}</span>
                    </div>
                    <div style="color: var(--text-main); margin-bottom: 0.25rem; white-space: pre-line;">${item.question_text}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem; display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.25rem;">
                        <div>A) ${item.option_a}</div>
                        <div>B) ${item.option_b}</div>
                        <div>C) ${item.option_c}</div>
                        <div>D) ${item.option_d}</div>
                        <div>E) ${item.option_e}</div>
                    </div>
                </div>
            `;
            listEl.appendChild(row);
        });
    }
}

async function displayFinalQuestion() {
    const activeContainer = document.getElementById('final-active-container');
    const selectionContainer = document.getElementById('final-selection-container');
    
    // Reset similarity
    const simContainer = document.getElementById('final-similarity-container');
    if (simContainer) {
        simContainer.classList.add('hidden');
        document.getElementById('final-similarity-list').innerHTML = "";
    }
    
    if (finalQuestions.length === 0 || currentFinalIndex >= finalQuestions.length) {
        showToast("Final sınavı tamamlandı! Tebrikler.");
        activeContainer.classList.add('hidden');
        selectionContainer.classList.remove('hidden');
        loadFinalList();
        refreshDashboardStats();
        return;
    }
    
    isFinalAnswered = false;
    
    const progressPercent = (currentFinalIndex / finalQuestions.length) * 100;
    document.getElementById('final-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('final-progress-text').textContent = `Soru ${currentFinalIndex + 1} / ${finalQuestions.length}`;
    
    const question = finalQuestions[currentFinalIndex];
    document.getElementById('final-question-text').textContent = question.soru_koku;
    
    document.getElementById('final-opt-a').textContent = question.secenekler.A;
    document.getElementById('final-opt-b').textContent = question.secenekler.B;
    document.getElementById('final-opt-c').textContent = question.secenekler.C;
    document.getElementById('final-opt-d').textContent = question.secenekler.D;
    document.getElementById('final-opt-e').textContent = question.secenekler.E;
    
    const badgeText = `${activeFinal.kurul_adi.toUpperCase()} (${activeFinal.yil}) - Soru #${question.soru_numarasi}`;
    document.getElementById('final-question-badge').textContent = badgeText;
    
    const optionButtons = document.querySelectorAll('#final-options-container .option-btn');
    optionButtons.forEach(btn => {
        btn.className = "option-btn";
        btn.disabled = false;
    });
    
    // Reset rating buttons highlight
    const ratingButtons = document.querySelectorAll('#final-feedback-panel .btn-rate');
    ratingButtons.forEach(btn => btn.style.boxShadow = '');
    
    document.getElementById('final-feedback-panel').classList.add('hidden');
    
    // Enable/disable navigation buttons
    const prevBtn = document.getElementById('btn-final-prev');
    const nextBtn = document.getElementById('btn-final-next');
    if (prevBtn) prevBtn.disabled = (currentFinalIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentFinalIndex >= finalQuestions.length - 1);
    
    if (sessionAnswersFinal[currentFinalIndex] !== undefined) {
        isFinalAnswered = true;
        optionButtons.forEach(btn => btn.disabled = true);
        
        const choice = sessionAnswersFinal[currentFinalIndex];
        const correctChoice = question.db_correct_option || question.cevap;
        const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
        const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
        
        if (selectedBtn) {
            if (choice === correctChoice) {
                selectedBtn.classList.add('selected-correct');
                document.getElementById('final-feedback-msg').textContent = "Doğru Cevap! 🎉";
                document.getElementById('final-feedback-msg').className = "feedback-message text-success";
            } else {
                selectedBtn.classList.add('selected-wrong');
                if (correctBtn) correctBtn.classList.add('reveal-correct');
                document.getElementById('final-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
                document.getElementById('final-feedback-msg').className = "feedback-message text-danger";
            }
        }
        
        document.getElementById('final-feedback-panel').classList.remove('hidden');
        
        if (sessionRatingsFinal[currentFinalIndex] !== undefined) {
            const ratedVal = sessionRatingsFinal[currentFinalIndex];
            const ratedBtn = Array.from(ratingButtons).find(btn => parseInt(btn.dataset.rating) === ratedVal);
            if (ratedBtn) {
                ratedBtn.style.boxShadow = '0 0 12px var(--color-primary)';
            }
        }
    } else {
        isFinalAnswered = false;
    }
    
    // Render similarity from prefetch cache or fetch if not present
    const cachedData = finalSimilarityCache[currentFinalIndex];
    if (cachedData) {
        if (!cachedData.loading) {
            renderFinalSimilarity(cachedData);
            if (sessionAnswersFinal[currentFinalIndex] !== undefined) {
                document.querySelectorAll('#final-similarity-list .similar-detail').forEach(el => el.classList.remove('hidden'));
            }
        }
    } else {
        prefetchFinalSimilarity(currentFinalIndex);
    }
    
    // Prefetch next final question similarity
    if (currentFinalIndex + 1 < finalQuestions.length) {
        prefetchFinalSimilarity(currentFinalIndex + 1);
    }
}

function handleFinalChoiceSelection(choice) {
    isFinalAnswered = true;
    sessionAnswersFinal[currentFinalIndex] = choice;
    const question = finalQuestions[currentFinalIndex];
    const optionButtons = document.querySelectorAll('#final-options-container .option-btn');
    
    optionButtons.forEach(btn => btn.disabled = true);
    
    const correctChoice = question.db_correct_option || question.cevap;
    const selectedBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === choice);
    const correctBtn = Array.from(optionButtons).find(btn => btn.dataset.choice === correctChoice);
    
    if (choice === correctChoice) {
        selectedBtn.classList.add('selected-correct');
        document.getElementById('final-feedback-msg').textContent = "Doğru Cevap! 🎉";
        document.getElementById('final-feedback-msg').className = "feedback-message text-success";
    } else {
        selectedBtn.classList.add('selected-wrong');
        correctBtn.classList.add('reveal-correct');
        document.getElementById('final-feedback-msg').textContent = `Yanlış Cevap. Doğru Şık: ${correctChoice}`;
        document.getElementById('final-feedback-msg').className = "feedback-message text-danger";
    }
    
    // Reveal similarity details once answered
    document.querySelectorAll('#final-similarity-list .similar-detail').forEach(el => el.classList.remove('hidden'));

    document.getElementById('final-feedback-panel').classList.remove('hidden');
}

async function submitFinalQuestionReview(rating) {
    const question = finalQuestions[currentFinalIndex];
    sessionRatingsFinal[currentFinalIndex] = rating;
    
    const payload = {
        question_text: question.soru_koku,
        option_a: question.secenekler.A,
        option_b: question.secenekler.B,
        option_c: question.secenekler.C,
        option_d: question.secenekler.D,
        option_e: question.secenekler.E,
        correct_option: question.db_correct_option || question.cevap,
        rating: rating,
        kurul_adi: activeFinal.kurul_adi,
        yil: activeFinal.yil,
        soru_numarasi: question.soru_numarasi
    };
    
    try {
        const response = await fetch('/api/questions/review-kurul', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            showToast("İlerleme kaydedildi.");
            currentFinalIndex++;
            displayFinalQuestion();
        } else {
            showToast("Veri kaydedilemedi.", "error");
        }
    } catch (error) {
        console.error("Save final review error:", error);
        showToast("Bağlantı hatası.", "error");
    }
}

// ==========================================
// 10. Bulk Answer Key Management Panel Logic
// ==========================================
function setupBulkAnswerKeyPanel() {
    const typeSelect = document.getElementById('select-edit-key-type');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            initAnswerKeyOptions();
            document.getElementById('answer-key-editor-card').classList.add('hidden');
        });
    }
    
    const loadBtn = document.getElementById('btn-load-answer-key');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadAnswerKeyData);
    }
    
    const saveBtn = document.getElementById('btn-save-bulk-answer-key');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveBulkAnswerKeyChanges);
    }
}

async function initAnswerKeyOptions() {
    const examType = document.getElementById('select-edit-key-type').value;
    const selectExam = document.getElementById('select-edit-key-exam');
    if (!selectExam) return;
    
    selectExam.innerHTML = '<option value="">Yükleniyor...</option>';
    
    try {
        const url = examType === 'final' ? '/api/finaller' : '/api/kurullar';
        const response = await fetch(url);
        const exams = await response.json();
        
        selectExam.innerHTML = '';
        if (exams.length === 0) {
            selectExam.innerHTML = '<option value="">Mevcut sınav bulunamadı</option>';
            return;
        }
        
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Bir sınav seçin...';
        selectExam.appendChild(defaultOpt);
        
        exams.forEach(exam => {
            const opt = document.createElement('option');
            opt.value = `${exam.file_name}|${exam.yil}`;
            opt.textContent = exam.name;
            selectExam.appendChild(opt);
        });
    } catch (e) {
        console.error("Error loading exams for answer key:", e);
        selectExam.innerHTML = '<option value="">Yükleme hatası</option>';
    }
}

async function loadAnswerKeyData() {
    const examType = document.getElementById('select-edit-key-type').value;
    const examSelect = document.getElementById('select-edit-key-exam').value;
    
    if (!examSelect) {
        showToast("Lütfen bir sınav seçin.", "error");
        return;
    }
    
    const [fileName, yil] = examSelect.split('|');
    currentAnswerKeyExam = {
        file_name: fileName,
        yil: yil,
        exam_type: examType
    };
    
    try {
        const url = examType === 'final' 
            ? `/api/finaller/${fileName}/${yil}/questions` 
            : `/api/kurullar/${fileName}/${yil}/questions`;
            
        const response = await fetch(url);
        loadedAnswerKeyQuestions = await response.json();
        
        if (response.ok) {
            localAnswerKeyChanges = {}; // Reset changes
            renderAnswerKeyEditor();
        } else {
            showToast("Sınav soruları yüklenemedi.", "error");
        }
    } catch (e) {
        console.error("Error loading answer key questions:", e);
        showToast("Bağlantı hatası oluştu.", "error");
    }
}

function renderAnswerKeyEditor() {
    const card = document.getElementById('answer-key-editor-card');
    const title = document.getElementById('answer-key-exam-title');
    const list = document.getElementById('answer-key-questions-list');
    
    if (!card || !title || !list) return;
    
    const examSelectEl = document.getElementById('select-edit-key-exam');
    const examName = examSelectEl.options[examSelectEl.selectedIndex].textContent;
    title.textContent = `${examName} - Cevap Anahtarı`;
    list.innerHTML = '';
    
    loadedAnswerKeyQuestions.forEach(q => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-color)';
        
        const initialAnswer = q.db_correct_option || q.cevap;
        const currentAnswer = localAnswerKeyChanges[q.soru_numarasi] || initialAnswer;
        
        const snippet = q.soru_koku.length > 120 
            ? q.soru_koku.substring(0, 120) + '...' 
            : q.soru_koku;
            
        tr.innerHTML = `
            <td style="padding: 1rem 0.75rem; font-weight: 600; color: var(--color-primary-hover);">Soru ${q.soru_numarasi}</td>
            <td style="padding: 1rem 0.75rem; color: var(--text-muted); font-size: 0.9rem; max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${q.soru_koku}">${snippet}</td>
            <td style="padding: 1rem 0.75rem; text-align: center;">
                <div style="display: flex; gap: 0.25rem; justify-content: center;">
                    <button class="key-choice-btn ${currentAnswer === 'A' ? 'active' : ''}" data-choice="A" data-num="${q.soru_numarasi}">A</button>
                    <button class="key-choice-btn ${currentAnswer === 'B' ? 'active' : ''}" data-choice="B" data-num="${q.soru_numarasi}">B</button>
                    <button class="key-choice-btn ${currentAnswer === 'C' ? 'active' : ''}" data-choice="C" data-num="${q.soru_numarasi}">C</button>
                    <button class="key-choice-btn ${currentAnswer === 'D' ? 'active' : ''}" data-choice="D" data-num="${q.soru_numarasi}">D</button>
                    <button class="key-choice-btn ${currentAnswer === 'E' ? 'active' : ''}" data-choice="E" data-num="${q.soru_numarasi}">E</button>
                </div>
            </td>
        `;
        
        // Listen to A-E clicks in this row
        tr.querySelectorAll('.key-choice-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const choice = e.currentTarget.dataset.choice;
                const num = parseInt(e.currentTarget.dataset.num);
                
                // Highlight clicked button and clear others in row
                tr.querySelectorAll('.key-choice-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                localAnswerKeyChanges[num] = choice;
            });
        });
        
        list.appendChild(tr);
    });
    
    card.classList.remove('hidden');
}

async function saveBulkAnswerKeyChanges() {
    if (!currentAnswerKeyExam) return;
    
    const updates = Object.entries(localAnswerKeyChanges).map(([num, choice]) => ({
        soru_numarasi: parseInt(num),
        correct_option: choice
    }));
    
    if (updates.length === 0) {
        showToast("Herhangi bir değişiklik yapılmadı.", "error");
        return;
    }
    
    const confirmSave = confirm(`${updates.length} sorunun cevap anahtarını güncellemek istediğinize emin misiniz?`);
    if (!confirmSave) return;
    
    const payload = {
        file_name: currentAnswerKeyExam.file_name,
        yil: currentAnswerKeyExam.yil,
        exam_type: currentAnswerKeyExam.exam_type,
        updates: updates
    };
    
    try {
        const response = await fetch('/api/answer-key/bulk-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const res = await response.json();
        if (response.ok) {
            showToast(`Cevap anahtarı başarıyla güncellendi!`);
            localAnswerKeyChanges = {}; // Reset changes
            loadAnswerKeyData(); // Reload exam grid
        } else {
            showToast(res.error || "Güncelleme başarısız oldu.", "error");
        }
    } catch (e) {
        console.error("Error saving bulk answer key:", e);
        showToast("Bağlantı hatası oluştu.", "error");
    }
}

// 9. Go to Question Feature
function setupGoToQuestionFeature() {
    makeProgressTextInteractive(
        'study-progress-text',
        () => currentQuestionIndex,
        (val) => { currentQuestionIndex = val; },
        () => dueQuestions.length,
        displayActiveQuestion
    );
    makeProgressTextInteractive(
        'kurul-progress-text',
        () => currentKurulIndex,
        (val) => { currentKurulIndex = val; },
        () => kurulQuestions.length,
        displayKurulQuestion
    );
    makeProgressTextInteractive(
        'final-progress-text',
        () => currentFinalIndex,
        (val) => { currentFinalIndex = val; },
        () => finalQuestions.length,
        displayFinalQuestion
    );
}

function makeProgressTextInteractive(elementId, getIndex, setIndex, getTotal, renderFn) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.style.cursor = 'pointer';
    el.title = 'İstediğiniz soruya gitmek için tıklayın';
    
    // Add hover transition using element styles
    el.style.transition = 'color 0.2s';
    el.addEventListener('mouseenter', () => {
        if (!el.querySelector('input')) {
            el.style.color = 'var(--color-primary-hover)';
        }
    });
    el.addEventListener('mouseleave', () => {
        el.style.color = '';
    });

    el.addEventListener('click', (e) => {
        if (el.querySelector('input')) return;

        const currentVal = getIndex() + 1;
        const totalVal = getTotal();
        if (totalVal <= 0) return;

        el.innerHTML = `Soru <input type="number" id="${elementId}-input" min="1" max="${totalVal}" value="${currentVal}" style="width: 70px; background: rgba(10, 12, 16, 0.8); border: 1px solid var(--color-primary); color: var(--text-main); border-radius: var(--border-radius-sm); padding: 0.15rem 0.35rem; font-size: 0.9rem; text-align: center; outline: none; margin: 0 0.25rem;"> / ${totalVal}`;
        
        const input = document.getElementById(`${elementId}-input`);
        if (!input) return;

        input.focus();
        input.select();

        input.addEventListener('click', (evt) => {
            evt.stopPropagation();
        });

        let finished = false;
        const finishEdit = (applyChange) => {
            if (finished) return;
            finished = true;
            
            if (applyChange) {
                let targetPage = parseInt(input.value);
                if (!isNaN(targetPage)) {
                    if (targetPage < 1) targetPage = 1;
                    if (targetPage > totalVal) targetPage = totalVal;
                    setIndex(targetPage - 1);
                    renderFn();
                    return;
                }
            }
            el.textContent = `Soru ${getIndex() + 1} / ${totalVal}`;
        };

        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') {
                finishEdit(true);
            } else if (evt.key === 'Escape') {
                finishEdit(false);
            }
        });

        input.addEventListener('blur', () => {
            finishEdit(true);
        });
    });
}

