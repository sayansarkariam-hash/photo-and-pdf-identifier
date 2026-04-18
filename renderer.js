// DOM Elements
const views = {
    scan: document.getElementById('scan-view'),
    dashboard: document.getElementById('dashboard-view')
};

const elems = {
    btnSelect: document.getElementById('btn-select'),
    btnBack: document.getElementById('btn-back'),
    btnCleanup: document.getElementById('btn-cleanup'),
    selectedPath: document.getElementById('selected-path'),
    progressContainer: document.getElementById('progress-container'),
    progressStatus: document.getElementById('progress-status'),
    progressCount: document.getElementById('progress-count'),
    progressFill: document.getElementById('progress-fill'),
    groupsContainer: document.getElementById('groups-container'),
    statGroups: document.getElementById('stat-groups'),
    statDupes: document.getElementById('stat-dupes'),
    statSpace: document.getElementById('stat-space'),
    emptyState: document.getElementById('empty-state'),
    toast: document.getElementById('toast')
};

// Application State
let appState = {
    duplicatesData: [], // Array of groups
    toDeleteData: new Set(), // Set of paths selected for deletion
    totalSavedBytes: 0,
    currentPath: '',
    scanMode: 'photo' // 'photo' or 'pdf'
};

// Navigation
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Mode Selection Logic
const modeOptions = document.querySelectorAll('.mode-option');
modeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        modeOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        appState.scanMode = opt.dataset.mode;
    });
});

// Event Listeners
elems.btnSelect.addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return;

    appState.currentPath = folderPath;
    elems.selectedPath.textContent = folderPath;
    elems.selectedPath.classList.remove('hidden');
    elems.progressContainer.classList.remove('hidden');
    elems.btnSelect.classList.add('hidden');
    
    document.getElementById('mode-selector').classList.add('hidden');
    
    // Start scanning
    const groups = await window.electronAPI.scanFolder(folderPath, appState.scanMode);
    renderDashboard(groups);
});

elems.btnBack.addEventListener('click', () => {
    // Reset view
    elems.btnSelect.classList.remove('hidden');
    elems.progressContainer.classList.add('hidden');
    elems.selectedPath.classList.add('hidden');
    elems.progressFill.style.width = '0%';
    document.getElementById('mode-selector').classList.remove('hidden');
    showView('scan');
});

elems.btnCleanup.addEventListener('click', async () => {
    const fileCount = appState.toDeleteData.size;
    if (fileCount === 0) return;
    
    if (confirm(`Are you sure you want to move ${fileCount} files to the Recycle Bin?`)) {
        elems.btnCleanup.disabled = true;
        elems.btnCleanup.textContent = 'Trashing...';
        
        const filesArray = Array.from(appState.toDeleteData);
        await window.electronAPI.deleteFiles(filesArray);
        
        showToast(`Successfully moved ${fileCount} files to recycle bin!`);
        
        elems.btnCleanup.disabled = false;
        elems.btnCleanup.textContent = 'Cleanup Now';
        
        // Return home
        elems.btnBack.click();
    }
});

// IPC IPC Progress handler
window.electronAPI.onScanProgress((event, data) => {
    const { status, total, current, mode } = data;
    const typeLabel = mode === 'photo' ? 'Images' : 'PDFs';
    const actionLabel = mode === 'photo' ? 'Analyzing Image Visually...' : 'Computing Content Hashes...';

    if (status === 'discovered') {
        elems.progressStatus.textContent = `Discovered ${typeLabel}`;
        elems.progressCount.textContent = `${total} ${typeLabel.toLowerCase()} found in directory. Hash computing starts now.`;
        elems.progressFill.style.width = '5%';
    } else if (status === 'hashing') {
        elems.progressStatus.textContent = actionLabel;
        elems.progressCount.textContent = `Processed ${current} of ${total} files`;
        elems.progressFill.style.width = `${Math.max(5, (current / total) * 95)}%`;
    } else if (status === 'grouping') {
        elems.progressStatus.textContent = 'Identifying Duplicates...';
        elems.progressFill.style.width = `100%`;
    }
});

// Render Dashboard
function renderDashboard(groups) {
    appState.duplicatesData = groups;
    appState.toDeleteData.clear();
    elems.groupsContainer.innerHTML = '';
    
    if (groups.length === 0) {
        elems.emptyState.classList.remove('hidden');
        elems.statGroups.textContent = '0';
        elems.statDupes.textContent = '0';
        elems.statSpace.textContent = '0 MB';
        elems.btnCleanup.style.display = 'none';
        showView('dashboard');
        return;
    }
    
    elems.emptyState.classList.add('hidden');
    elems.btnCleanup.style.display = 'block';
    
    let totalFilesToDelete = 0;
    
    groups.forEach((group, groupIndex) => {
        // Group logic: By default, index 0 is highest resolution (sorted in main.js)
        // Set index > 0 to be marked for deletion.
        const groupEl = document.createElement('div');
        groupEl.className = 'group';
        
        const headerEl = document.createElement('div');
        headerEl.className = 'group-header';
        headerEl.innerHTML = `
            <h3>Duplicate Match #${groupIndex + 1}</h3>
            <span class="group-badge">${group.length} ${appState.scanMode === 'photo' ? 'Photos' : 'PDFs'}</span>
        `;
        groupEl.appendChild(headerEl);
        
        const gridEl = document.createElement('div');
        gridEl.className = 'image-grid';
        
        group.forEach((img, imgIndex) => {
            const isBest = imgIndex === 0;
            if (!isBest) {
                appState.toDeleteData.add(img.path);
                totalFilesToDelete++;
            }
            
            const cardEl = document.createElement('div');
            cardEl.className = `image-card ${isBest ? 'kept' : 'marked-delete'}`;
            // Store path in dataset
            cardEl.dataset.path = img.path;
            
            const isPDF = img.isPDF;
            
            cardEl.innerHTML = `
                ${isBest ? `<div class="best-tag">${isPDF ? 'Original ★' : 'Highest Res ★'}</div>` : ''}
                <div class="status-label">${isBest ? 'Keep ✓' : 'Trash 🗑️'}</div>
                <div class="img-wrapper">
                    ${isPDF ? `
                        <div class="pdf-placeholder">
                            <div class="pdf-icon-lg">📄</div>
                            <div class="pdf-label">PDF Document</div>
                        </div>
                    ` : `<img src="${img.url}" loading="lazy" alt="Thumbnail">`}
                </div>
                <div class="img-info">
                    <div class="top-row">
                        ${isPDF ? '' : `<span class="res">${img.width}x${img.height}</span>`}
                        <span class="size">${formatBytes(img.sizeBytes)}</span>
                    </div>
                    <span class="path" title="${img.path}">${img.path}</span>
                </div>
            `;
            
            // Toggle inclusion logic
            cardEl.addEventListener('click', () => {
                const path = cardEl.dataset.path;
                if (appState.toDeleteData.has(path)) {
                    // Switch to kept
                    appState.toDeleteData.delete(path);
                    cardEl.classList.remove('marked-delete');
                    cardEl.classList.add('kept');
                    cardEl.querySelector('.status-label').innerHTML = 'Keep ✓';
                } else {
                    // Switch to marked
                    appState.toDeleteData.add(path);
                    cardEl.classList.remove('kept');
                    cardEl.classList.add('marked-delete');
                    cardEl.querySelector('.status-label').innerHTML = 'Trash 🗑️';
                }
                updateDashboardStats();
            });
            
            gridEl.appendChild(cardEl);
        });
        
        groupEl.appendChild(gridEl);
        elems.groupsContainer.appendChild(groupEl);
    });

    updateDashboardStats();
    showView('dashboard');
}

function updateDashboardStats() {
    elems.statGroups.textContent = appState.duplicatesData.length;
    
    const count = appState.toDeleteData.size;
    elems.statDupes.textContent = count;
    elems.btnCleanup.textContent = `Delete Selected (${count})`;
    elems.btnCleanup.disabled = count === 0;
    
    // Calculate total recoverable space matching specifically selected files
    let bytesRecoverable = 0;
    appState.duplicatesData.forEach(group => {
        group.forEach(img => {
            if (appState.toDeleteData.has(img.path)) {
                bytesRecoverable += img.sizeBytes;
            }
        });
    });
    
    elems.statSpace.textContent = formatBytes(bytesRecoverable);
}

function showToast(msg) {
    elems.toast.textContent = msg;
    elems.toast.classList.remove('hidden');
    elems.toast.classList.add('show');
    setTimeout(() => {
        elems.toast.classList.remove('show');
        setTimeout(() => elems.toast.classList.add('hidden'), 300);
    }, 3000);
}
