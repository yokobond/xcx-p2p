import log from '../../util/log';

/**
 * Signaling channel using Google Sheets as the backend.
 */
class SheetSignalingChannel extends EventTarget {
    constructor () {
        super();
        this._connected = false;
        this._id = Math.random().toString(36)
            .substr(2, 9);
        this._pollInterval = null;
        this._signalName = null;

        // Replace with your Google Apps Script web app URL
        this._serverUrl = 'https://script.google.com/macros/s/AKfycbx3RFGGAckbU-okJ2Cvnse7KmexGVUO8qcWvlevJczsx0wpl_a-Kxe_fi7ul0z4zISG/exec';
    }

    get connected () {
        return this._connected;
    }

    connect (signalName) {
        if (this._connected) return;
        this._signalName = signalName;
        this._connected = true;
        this.startPolling();
        this.dispatchEvent(new Event('connected'));
    }

    disconnect () {
        if (!this._connected) return;
        this._connected = false;
        this.stopPolling();
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
        try {
            await fetch(this._serverUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    signalName: this._signalName,
                    fromId: this._id,
                    message: message
                })
            });
            log.debug('Message sent:', message);
        } catch (err) {
            log.warn('Error sending message:', err);
        }
    }

    async pollMessages () {
        if (!this._connected) return;
        try {
            const url = `${this._serverUrl}?signalName=${encodeURIComponent(this._signalName)}` +
                        `&recipientId=${encodeURIComponent(this._id)}`;
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-cache'
            });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            const messages = await response.json();
            for (const msg of messages) {
                this.dispatchEvent(new MessageEvent('message', {
                    data: msg.message
                }));
                log.debug('Message received:', msg.message);
            }
        } catch (err) {
            log.warn('Error polling messages:', err);
        }
    }
}

export default SheetSignalingChannel;
