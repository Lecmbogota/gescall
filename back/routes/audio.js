const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

// Configure multer for temporary file storage
const upload = multer({
    dest: '/tmp/audio-uploads/',
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'];
        if (allowedTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.wav')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de audio (WAV, MP3)'));
        }
    }
});

// SSH Configuration from environment
const sshConfig = {
    host: process.env.VICIDIAL_SSH_HOST || '209.38.233.46',
    port: 22,
    username: process.env.VICIDIAL_SSH_USER || 'root',
    password: process.env.VICIDIAL_SSH_PASSWORD,
    readyTimeout: 20000,
    keepaliveInterval: 5000,
    tryKeyboard: true, // Try keyboard-interactive auth
    debug: (msg) => console.log('[SSH DEBUG]', msg), // Log SSH debug info
};

const soundsPath = process.env.ASTERISK_SOUNDS_PATH || '/var/lib/asterisk/sounds';

/**
 * Execute SSH command
 */
function sshExec(command) {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }

                let output = '';
                let errorOutput = '';

                stream.on('close', (code) => {
                    conn.end();
                    if (code === 0) {
                        resolve(output.trim());
                    } else {
                        reject(new Error(errorOutput || `Command failed with code ${code}`));
                    }
                });

                stream.on('data', (data) => {
                    output += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });
            });
        });

        conn.on('error', (err) => {
            reject(err);
        });

        conn.connect(sshConfig);
    });
}

/**
 * Upload file via SFTP
 */
function sftpUpload(localPath, remotePath) {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
            conn.sftp((err, sftp) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }

                sftp.fastPut(localPath, remotePath, (err) => {
                    conn.end();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(true);
                    }
                });
            });
        });

        conn.on('error', (err) => {
            reject(err);
        });

        conn.connect(sshConfig);
    });
}

/**
 * Delete file via SFTP
 */
function sftpDelete(remotePath) {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
            conn.sftp((err, sftp) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }

                sftp.unlink(remotePath, (err) => {
                    conn.end();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(true);
                    }
                });
            });
        });

        conn.on('error', (err) => {
            reject(err);
        });

        conn.connect(sshConfig);
    });
}

/**
 * GET /api/audio
 * List audio files from Vicidial server
 */
/**
 * GET /api/audio
 * List audio files from Vicidial server
 */
router.get('/', async (req, res) => {
    try {
        // List wav files in sounds directory
        // Use find -printf to get name, size and modified time in one go
        // Filter: Only gc_ files, sorted by date DESC, max 200. Follow symlinks (-L)
        const command = `find -L ${soundsPath} -maxdepth 1 -name "gc_*" -printf "%f|%s|%T@\\n" | sort -t '|' -k3 -nr | head -200`;

        console.log('[Audio] Executing list command');
        const output = await sshExec(command);

        if (!output) {
            return res.json({
                success: true,
                data: [],
            });
        }

        const lines = output.split('\n').filter(f => f.trim());
        const audioFiles = [];

        for (const line of lines) {
            const [filename, size, mtime] = line.split('|');

            if (filename) {
                // strict filter: ONLY show files starting with 'gc_' as requested
                if (!filename.startsWith('gc_')) continue;

                audioFiles.push({
                    filename,
                    path: path.join(soundsPath, filename),
                    size: parseInt(size) || 0,
                    modified: mtime ? new Date(parseFloat(mtime) * 1000).toISOString() : null,
                    type: path.extname(filename).toLowerCase().replace('.', ''),
                });
            }
        }

        res.json({
            success: true,
            data: audioFiles,
            total: audioFiles.length,
        });
    } catch (error) {
        console.error('[Audio] List error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * POST /api/audio/upload
 * Upload audio file to Vicidial server
 */
router.post('/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se recibió ningún archivo',
            });
        }

        const localPath = req.file.path;
        const originalName = req.file.originalname;
        const { campaign, isNodeUpload } = req.body;

        if (!campaign) {
            fs.unlinkSync(localPath);
            return res.status(400).json({
                success: false,
                error: 'Se requiere especificar la campaña',
            });
        }

        // 1. Define filenames
        // Final filename: gc_campaignname.wav or gc_campaignname_timestamp.wav
        // Enforce lowercase and only alphanumeric chars for campaign name part
        const safeCampaign = campaign.toLowerCase().replace(/[^a-z0-9]/g, '');
        const finalFilename = isNodeUpload === 'true'
            ? `gc_${safeCampaign}_${Date.now()}.wav`
            : `gc_${safeCampaign}.wav`;

        // Temp filename logic keeps original name for reference in temp
        let baseName = originalName.toLowerCase().replace(/\.[^/.]+$/, "");
        baseName = baseName.replace(/[^a-z0-9.-]/g, '_');
        const tempFilename = `temp_upload_${Date.now()}_${baseName}${path.extname(originalName)}`;

        const remoteTempPath = path.join(soundsPath, tempFilename);
        const remoteFinalPath = path.join(soundsPath, finalFilename);

        console.log(`[Audio] Uploading temp file: ${remoteTempPath} for Campaign: ${campaign}`);

        // 2. Upload original file to temp path
        await sftpUpload(localPath, remoteTempPath);

        console.log(`[Audio] Converting to WAV 8kHz Mono: ${remoteFinalPath}`);

        try {
            // 3. Convert using remote 'sox'
            // Format: 8000Hz, 1 channel (mono), signed-integer, 16-bit
            await sshExec(`sox "${remoteTempPath}" -r 8000 -c 1 -e signed-integer -b 16 "${remoteFinalPath}"`);

            // 4. Delete temp file
            await sftpDelete(remoteTempPath);

            // 5. Set permissions
            await sshExec(`chmod 644 "${remoteFinalPath}"`);

            // Clean up local temp file
            fs.unlinkSync(localPath);

            console.log(`[Audio] Conversion successful: ${finalFilename}`);

            res.json({
                success: true,
                message: 'Audio subido y convertido exitosamente',
                data: {
                    filename: finalFilename,
                    path: remoteFinalPath,
                },
            });
        } catch (conversionError) {
            console.error('[Audio] Conversion error:', conversionError);

            // Try to cleanup remote temp file
            try { await sftpDelete(remoteTempPath); } catch (e) { }

            throw new Error(`Error en la conversión de audio: ${conversionError.message}`);
        }
    } catch (error) {
        console.error('[Audio] Upload error:', error);

        // Clean up temp file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * DELETE /api/audio/:filename
 * Delete audio file from Vicidial server
 */
router.delete('/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: prevent path traversal
        if (filename.includes('/') || filename.includes('..')) {
            return res.status(400).json({
                success: false,
                error: 'Nombre de archivo inválido',
            });
        }

        // Security: ONLY allow deleting gescall files
        if (!filename.startsWith('gc_')) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para eliminar este archivo de sistema',
            });
        }

        const remotePath = path.join(soundsPath, filename);

        console.log(`[Audio] Deleting: ${remotePath}`);

        await sftpDelete(remotePath);

        console.log(`[Audio] Delete successful: ${filename}`);

        res.json({
            success: true,
            message: 'Audio eliminado exitosamente',
        });
    } catch (error) {
        console.error('[Audio] Delete error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/audio/:filename/info
 * Get audio file info
 */
router.get('/:filename/info', async (req, res) => {
    try {
        const { filename } = req.params;

        // Security: prevent path traversal
        if (filename.includes('/') || filename.includes('..')) {
            return res.status(400).json({
                success: false,
                error: 'Nombre de archivo inválido',
            });
        }

        const remotePath = path.join(soundsPath, filename);

        // Get file info using soxi (sox info) or file command
        let info = {};
        try {
            const soxiOutput = await sshExec(`soxi "${remotePath}" 2>/dev/null || echo "No soxi"`);
            if (!soxiOutput.includes('No soxi')) {
                // Parse soxi output
                const lines = soxiOutput.split('\n');
                lines.forEach(line => {
                    const [key, ...value] = line.split(':');
                    if (key && value.length) {
                        info[key.trim().toLowerCase().replace(/\s+/g, '_')] = value.join(':').trim();
                    }
                });
            }
        } catch (e) {
            // soxi not available, get basic info
            const statOutput = await sshExec(`stat -c '%s' "${remotePath}"`);
            info.size = parseInt(statOutput) || 0;
        }

        res.json({
            success: true,
            data: {
                filename,
                path: remotePath,
                ...info,
            },
        });
    } catch (error) {
        console.error('[Audio] Info error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/audio/:filename/stream
 * Stream audio file from Vicidial server
 */
router.get('/:filename/stream', (req, res) => {
    const { filename } = req.params;

    // Security check
    if (filename.includes('/') || filename.includes('..')) {
        return res.status(400).send('Invalid filename');
    }

    const remotePath = path.join(soundsPath, filename);
    const conn = new Client();

    conn.on('ready', () => {
        conn.sftp((err, sftp) => {
            if (err) {
                conn.end();
                console.error('[Audio] Stream SFTP error:', err);
                return res.status(500).send('SFTP Error');
            }

            // Check if file exists and get size
            console.log(`[Audio Debug] Attempting to stream: "${remotePath}"`);

            sftp.stat(remotePath, (err, stats) => {
                if (err) {
                    conn.end();
                    console.error(`[Audio Debug] Stat error for "${remotePath}":`, err);
                    return res.status(404).send(`File not found: ${err.message}`);
                }

                // Set headers
                const ext = path.extname(filename).toLowerCase();
                let contentType = 'audio/wav';
                if (ext === '.mp3') contentType = 'audio/mpeg';
                else if (ext === '.gsm') contentType = 'audio/x-gsm';

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', stats.size);
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

                // Create read stream
                const stream = sftp.createReadStream(remotePath);

                stream.on('error', (streamErr) => {
                    console.error('[Audio] Stream read error:', streamErr);
                    conn.end();
                });

                stream.on('end', () => {
                    console.log(`[Audio] Stream finished: ${filename}`);
                    conn.end();
                });

                // Pipe to response
                stream.pipe(res);
            });
        });
    });

    conn.on('error', (err) => {
        console.error('[Audio] Stream connection error:', err);
        if (!res.headersSent) {
            res.status(500).send('Connection Error');
        }
    });

    conn.connect(sshConfig);
});

// ─────────────────── CALL RECORDINGS ───────────────────

/**
 * GET /api/audio/recordings/:filename
 * Stream call recording from Asterisk
 */
router.get('/recordings/:filename', (req, res) => {
    const { filename } = req.params;

    if (filename.includes('/') || filename.includes('..')) {
        return res.status(400).send('Invalid filename');
    }

    const recordingsPath = '/var/spool/asterisk/recording';
    const remotePath = path.join(recordingsPath, filename);
    const conn = new Client();

    conn.on('ready', () => {
        conn.sftp((err, sftp) => {
            if (err) {
                conn.end();
                console.error('[Audio] Recordings SFTP error:', err);
                return res.status(500).send('SFTP Error');
            }

            sftp.stat(remotePath, (err, stats) => {
                if (err) {
                    conn.end();
                    return res.status(404).json({ success: false, error: 'Recording not found' });
                }

                res.setHeader('Content-Type', 'audio/wav');
                res.setHeader('Content-Length', stats.size);
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

                const stream = sftp.createReadStream(remotePath);
                stream.on('error', () => conn.end());
                stream.on('end', () => conn.end());

                stream.pipe(res);
            });
        });
    });

    conn.on('error', (err) => {
        console.error('[Audio] Recordings SSH error:', err);
        if (!res.headersSent) res.status(500).send('Connection Error');
    });

    conn.connect(sshConfig);
});

// ─────────────────── MOH Classes ───────────────────

/**
 * GET /api/audio/moh-classes
 * List available Asterisk MOH classes (local execution). Includes system classes and campaign-specific ones.
 */
router.get('/moh-classes', async (req, res) => {
    try {
        const { execSync } = require('child_process');
        let output = '';
        try {
            output = execSync('asterisk -rx "moh show classes"', { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (e) {
            output = '';
        }
        const classes = [];

        if (output) {
            const lines = output.split('\n');
            for (const line of lines) {
                const match = line.match(/^Class:\s*(\S+)/);
                if (match) {
                    const name = match[1];
                    const isCustom = name.startsWith('gescall_');
                    classes.push({
                        name,
                        value: name,
                        label: isCustom ? `Personalizado (${name})` : name,
                        isSystem: !isCustom
                    });
                }
            }
        }

        if (classes.filter(c => c.isSystem).length === 0) {
            classes.unshift(
                { name: 'default', value: 'default', label: 'Por defecto', isSystem: true },
                { name: 'none', value: 'none', label: 'Ninguna (silencio)', isSystem: true }
            );
        }

        res.json({ success: true, data: classes });
    } catch (error) {
        console.error('[Audio] MOH classes error:', error.message);
        res.json({
            success: true,
            data: [
                { name: 'default', value: 'default', label: 'Por defecto', isSystem: true },
                { name: 'none', value: 'none', label: 'Ninguna (silencio)', isSystem: true }
            ]
        });
    }
});

/**
 * POST /api/audio/moh/upload
 * Upload custom MOH audio: converts to 8kHz mono PCM, creates per-campaign
 * MOH class in Asterisk, reloads res_musiconhold, and updates the campaign.
 */
router.post('/moh/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
        }

        const localPath = req.file.path;
        const { campaign } = req.body;

        if (!campaign) {
            try { fs.unlinkSync(localPath); } catch (e) {}
            return res.status(400).json({ success: false, error: 'Se requiere especificar la campaña' });
        }

        const safeCampaign = campaign.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        const mohClassName = `gescall_${safeCampaign}`;
        const mohDir = `/var/lib/asterisk/moh/${mohClassName}`;
        const finalFilename = `moh_${Date.now()}.wav`;
        const finalPath = path.join(mohDir, finalFilename);

        const { execSync } = require('child_process');

        // 1. Create campaign MOH directory and clean old files
        if (!fs.existsSync(mohDir)) {
            fs.mkdirSync(mohDir, { recursive: true });
        }
        // Remove existing WAV files in this campaign's MOH dir (single-file MOH)
        try {
            const existing = fs.readdirSync(mohDir).filter(f => f.endsWith('.wav'));
            for (const f of existing) fs.unlinkSync(path.join(mohDir, f));
        } catch (e) {}

        console.log(`[Audio MOH] Converting ${localPath} → ${finalPath} for MOH class ${mohClassName}`);

        // 2. Convert to 8kHz mono 16-bit PCM WAV using ffmpeg
        try {
            execSync(
                `ffmpeg -y -i "${localPath}" -ar 8000 -ac 1 -sample_fmt s16 "${finalPath}"`,
                { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
        } catch (ffmpegErr) {
            // If ffmpeg conversion fails, copy as-is
            try { fs.copyFileSync(localPath, finalPath); } catch (e2) {}
            console.warn('[Audio MOH] ffmpeg conversion failed, copied raw:', ffmpegErr.message);
        }
        fs.chmodSync(finalPath, 0o644);

        // 3. Clean up temp file
        try { fs.unlinkSync(localPath); } catch (e) {}

        // 4. Update musiconhold.conf to add/ensure the campaign MOH class
        const mohConfPath = '/etc/asterisk/musiconhold.conf';
        let mohConf = '';
        try { mohConf = fs.readFileSync(mohConfPath, 'utf8'); } catch (e) {}

        const classHeader = `[${mohClassName}]`;
        if (!mohConf.includes(classHeader)) {
            const classBlock = `
${classHeader}
mode=files
directory=moh/${mohClassName}
sort=alpha
`;
            fs.appendFileSync(mohConfPath, classBlock);
            console.log(`[Audio MOH] Added MOH class ${mohClassName} to musiconhold.conf`);
        }

        // 5. Reload res_musiconhold module
        try {
            execSync('asterisk -rx "moh reload"', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
            console.log('[Audio MOH] MOH module reloaded');
        } catch (e) {
            console.warn('[Audio MOH] MOH reload warning:', e.message);
        }

        // 6. Update the campaign's moh_class in the database
        const pgDb = require('../config/pgDatabase');
        await pgDb.query(
            'UPDATE gescall_campaigns SET moh_class = $1, moh_custom_file = $2 WHERE campaign_id = $3',
            [mohClassName, finalFilename, campaign]
        );

        console.log(`[Audio MOH] Campaign ${campaign} MOH class set to ${mohClassName}, file: ${finalFilename}`);

        res.json({
            success: true,
            message: 'Audio MOH subido y configurado exitosamente',
            data: {
                filename: finalFilename,
                path: finalPath,
                moh_class: mohClassName,
                moh_custom_file: finalFilename
            }
        });
    } catch (error) {
        console.error('[Audio MOH] Upload error:', error);
        try { if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/audio/moh/:campaign
 * Remove custom MOH audio and revert to system default
 */
router.delete('/moh/:campaign', async (req, res) => {
    try {
        const { campaign } = req.params;
        const safeCampaign = campaign.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        const mohClassName = `gescall_${safeCampaign}`;
        const mohDir = `/var/lib/asterisk/moh/${mohClassName}`;

        // Remove MOH files
        if (fs.existsSync(mohDir)) {
            fs.rmSync(mohDir, { recursive: true, force: true });
            console.log(`[Audio MOH] Removed MOH dir: ${mohDir}`);
        }

        // Remove class from musiconhold.conf
        const mohConfPath = '/etc/asterisk/musiconhold.conf';
        try {
            let mohConf = fs.readFileSync(mohConfPath, 'utf8');
            const classHeader = `[${mohClassName}]`;
            if (mohConf.includes(classHeader)) {
                // Remove the class block
                const re = new RegExp(`\\n*\\[${mohClassName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\][^\\[]*`, 's');
                mohConf = mohConf.replace(re, '');
                fs.writeFileSync(mohConfPath, mohConf);
                console.log(`[Audio MOH] Removed MOH class ${mohClassName} from musiconhold.conf`);
            }
        } catch (e) {
            console.warn('[Audio MOH] Could not update musiconhold.conf:', e.message);
        }

        // Reload
        const { execSync } = require('child_process');
        try { execSync('asterisk -rx "moh reload"', { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) {}

        // Revert campaign to system default
        const pgDb = require('../config/pgDatabase');
        await pgDb.query(
            'UPDATE gescall_campaigns SET moh_class = NULL, moh_custom_file = NULL WHERE campaign_id = $1',
            [campaign]
        );

        res.json({ success: true, message: 'Audio MOH removido, usando música por defecto' });
    } catch (error) {
        console.error('[Audio MOH] Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
