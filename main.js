const { app, BrowserWindow, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const crypto = require('crypto');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19'
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  // Register local protocol for displaying images securely
  protocol.registerFileProtocol('local', (request, callback) => {
    const url = request.url.replace('local://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error(error);
      return callback(404);
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: Select Folder
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Helper: Calculate 64-bit dHash & Get Metadata
async function getDHashAndMetadata(imagePath) {
    try {
        const image = sharp(imagePath);
        const metadata = await image.metadata();
        
        // Fast resize to 9x8, grayscale
        const { data } = await image
            .resize(9, 8, { fit: 'fill' })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
            
        let hashStr = '';
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const left = data[y * 9 + x];
                const right = data[y * 9 + x + 1];
                hashStr += left > right ? '1' : '0';
            }
        }
        
        const hash = BigInt('0b' + hashStr);
        
        let size = 0;
        try {
            const stat = await fs.stat(imagePath);
            size = stat.size;
        } catch(e) {}

        return { hash, width: metadata.width, height: metadata.height, size };
    } catch (err) {
        // Corrupted or unsupported image
        return null;
    }
}

// Helper: Calculate MD5 Hash for PDFs
async function getPDFHash(pdfPath) {
    try {
        const fileBuffer = await fs.readFile(pdfPath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const stat = await fs.stat(pdfPath);
        return { hash, size: stat.size };
    } catch (err) {
        return null;
    }
}

// Helper: Calculate Hamming Distance between two 64-bit BigInts
function hammingDistance(hash1, hash2) {
    let x = hash1 ^ hash2;
    let distance = 0;
    while (x > 0n) {
        distance += Number(x & 1n);
        x >>= 1n;
    }
    return distance;
}

// Helper: Recursive File Search
async function* getFiles(dir) {
    let dirents;
    try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
        return; // Ignore inaccessible dirs
    }
    
    for (const dirent of dirents) {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            yield* getFiles(res);
        } else {
            yield res;
        }
    }
}

// IPC: Scan Folder for duplicates
ipcMain.handle('scan-folder', async (event, folderPath, mode = 'photo') => {
    const validExts = mode === 'photo' 
        ? new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff'])
        : new Set(['.pdf']);
    
    const allFiles = [];
    
    // 1. Discover phase
    try {
        for await (const file of getFiles(folderPath)) {
            const ext = path.extname(file).toLowerCase();
            if (validExts.has(ext)) {
                allFiles.push(file);
            }
        }
    } catch (err) {
        console.error("Error traversing", err);
    }
    
    mainWindow.webContents.send('scan-progress', { 
        status: 'discovered', 
        total: allFiles.length, 
        current: 0,
        mode 
    });

    if (allFiles.length === 0) return [];

    // 2. Hash phase
    const processed = [];
    let current = 0;
    
    for (const file of allFiles) {
        const info = mode === 'photo' 
            ? await getDHashAndMetadata(file)
            : await getPDFHash(file);
            
        current++;
        if (info) {
            processed.push({ file, ...info });
        }
        
        if (current % 5 === 0 || current === allFiles.length) {
            mainWindow.webContents.send('scan-progress', { 
                status: 'hashing', 
                total: allFiles.length, 
                current,
                mode
            });
        }
    }
    
    mainWindow.webContents.send('scan-progress', { 
        status: 'grouping', 
        total: processed.length, 
        current: processed.length,
        mode
    });

    // 3. Grouping phase
    const groups = [];
    const used = new Set();
    
    if (mode === 'photo') {
        for (let i = 0; i < processed.length; i++) {
            if (used.has(i)) continue;
            const currentGroup = [processed[i]];
            used.add(i);
            
            for (let j = i + 1; j < processed.length; j++) {
                if (used.has(j)) continue;
                if (hammingDistance(processed[i].hash, processed[j].hash) <= 5) {
                    currentGroup.push(processed[j]);
                    used.add(j);
                }
            }
            
            if (currentGroup.length > 1) {
                currentGroup.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                groups.push(currentGroup.map(item => ({
                    path: item.file,
                    url: 'local://' + encodeURIComponent(item.file),
                    width: item.width,
                    height: item.height,
                    sizeBytes: item.size
                })));
            }
        }
    } else {
        // PDF mode: Exact hash matching
        const hashGroups = {};
        processed.forEach(item => {
            if (!hashGroups[item.hash]) hashGroups[item.hash] = [];
            hashGroups[item.hash].push(item);
        });
        
        Object.values(hashGroups).forEach(group => {
            if (group.length > 1) {
                // For PDFs, sort by modification time or just keep first (here we sort by size just in case, though they should be same if hash is same)
                group.sort((a, b) => b.size - a.size);
                groups.push(group.map(item => ({
                    path: item.file,
                    url: 'local://' + encodeURIComponent(item.file),
                    sizeBytes: item.size,
                    isPDF: true
                })));
            }
        });
    }
    
    // 4. Sort groups by potential space savings descending
    groups.sort((a, b) => {
        const spaceA = a.slice(1).reduce((sum, item) => sum + item.sizeBytes, 0);
        const spaceB = b.slice(1).reduce((sum, item) => sum + item.sizeBytes, 0);
        return spaceB - spaceA;
    });

    return groups;
});

// IPC: Move files to recycle bin
ipcMain.handle('delete-files', async (event, files) => {
    let deletedCount = 0;
    for (const file of files) {
        try {
            await shell.trashItem(file);
            deletedCount++;
        } catch (err) {
            console.error('Failed to trash file:', file, err);
        }
    }
    return deletedCount;
});
