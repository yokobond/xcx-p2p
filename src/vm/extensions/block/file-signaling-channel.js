import log from '../../util/log';

/**
 * File-based signaling channel for WebRTC connections.
 */
class FileSignalingChannel extends EventTarget {
    constructor () {
        super();
        this.filePrefix = 'webrtc-signal-';
        this._connected = false;
        this._id = Math.random().toString(36)
            .substr(2, 9);
        this._pollInterval = null;
        this._signalDirHandle = null;
    }

    get connected () {
        return this._connected;
    }

    async connect (signalName) {
        if (this._connected) return;
        try {
            // Request permission to access a directory
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'downloads'
            });

            // Create/get subdirectory with signalName
            try {
                this._signalDirHandle = await dirHandle.getDirectoryHandle(signalName, {
                    create: true // Creates if doesn't exist
                });
            } catch (err) {
                log.warn(`Failed to create subdirectory ${signalName}:`, err);
                throw err;
            }

            this._connected = true;
            this.startPolling();
            this.dispatchEvent(new Event('connected'));
        } catch (err) {
            log.warn('Failed to access directory:', err);
            throw err;
        }
    }

    disconnect () {
        if (!this._connected) return;
        this._connected = false;
        this.stopPolling();
        this._signalDirHandle = null;
        this.dispatchEvent(new Event('disconnected'));
    }

    startPolling () {
        if (this._pollInterval) return;
        this._pollInterval = setInterval(() => this.pollMessages(), 1000);
    }

    stopPolling () {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }

    async send (message) {
        if (!this._connected) throw new Error('Not connected');
        const signalData = {
            from: this._id,
            type: message.type,
            data: message,
            timestamp: Date.now()
        };
        const filename = `${this.filePrefix}${message.type}-${this._id}.json`;
        await this.saveToFile(signalData, filename);
    }

    async pollMessages () {
        const files = await this.listSignalFiles();
        for (const file of files) {
            if (!file.includes(this._id)) { // Don't process own messages
                const message = await this.loadFromFile(file);
                if (message && message.data) {
                    this.dispatchEvent(new MessageEvent('message', {
                        data: message.data
                    }));
                    await this.deleteFile(file); // Clean up processed message
                }
            }
        }
    }

    async listSignalFiles () {
        if (!this._signalDirHandle) return [];
        const files = [];
        for await (const entry of this._signalDirHandle.values()) {
            if (entry.kind === 'file' &&
                entry.name.startsWith(this.filePrefix) &&
                entry.name.endsWith('.json')) {
                files.push(entry.name);
            }
        }
        return files;
    }

    async saveToFile (data, filename) {
        if (!this._signalDirHandle) return;
        try {
            const fileHandle = await this._signalDirHandle.getFileHandle(filename, {create: true});
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data));
            await writable.close();
        } catch (err) {
            log.warn('Error saving file:', err);
        }
    }

    async loadFromFile (filename) {
        if (!this._signalDirHandle) return null;
        try {
            const fileHandle = await this._signalDirHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (err) {
            log.warn('Error loading file:', err);
            return null;
        }
    }

    async deleteFile (filename) {
        if (!this._signalDirHandle) return;
        try {
            await this._signalDirHandle.removeEntry(filename);
        } catch (err) {
            log.warn('Error deleting file:', err);
        }
    }
}

export default FileSignalingChannel;
