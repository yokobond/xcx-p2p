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

        /**
         * The signaling state of the channel.
         * @type {string<'disconnected'|'connected'|'offering'|'answering'>}
         */
        this.signalingState = 'disconnected';

        /**
         * The name of the signaling session.
         * @type {string}
         */
        this.signalName = null;

        // Replace with your Google Apps Script web app URL
        this._serverUrl = 'https://script.google.com/macros/s/AKfycbx3RFGGAckbU-okJ2Cvnse7KmexGVUO8qcWvlevJczsx0wpl_a-Kxe_fi7ul0z4zISG/exec';
    }

    get connected () {
        return this._connected;
    }

    connect (signalName) {
        if (this._connected) return;
        this.signalName = signalName;
        this.signalingState = 'connected';
        this._connected = true;
        this.dispatchEvent(new Event('connected'));
    }

    disconnect () {
        if (!this._connected) return;
        this.signalingState = 'disconnected';
        this._connected = false;
        this.stopPolling();
        this.dispatchEvent(new Event('disconnected'));
    }

    /**
     * Start polling for messages.
     * @returns {void}
     */
    startPolling () {
        if (this._pollInterval) return;
        this._pollInterval = setInterval(() => this.pollMessages(), 1000);
        log.debug('Polling started');
    }

    /**
     * Stop polling for messages.
     * @returns {void}
     */
    stopPolling () {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
            log.debug('Polling stopped');
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
                    signalName: this.signalName,
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
            const url = `${this._serverUrl}?signalName=${encodeURIComponent(this.signalName)}` +
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
                const messageData = msg.message;
                this.dispatchEvent(new MessageEvent('message', {
                    data: messageData
                }));
                log.debug('Message received:', messageData);
            }
        } catch (err) {
            log.warn('Error polling messages:', err);
        }
    }

    /**
     * Start offering a signaling session.
     * @param {object} offer - The offer to send.
     * @returns {Promise} - A promise that resolves when the offer is sent.
     */
    async startOffering (offer) {
        if (this.signalingState !== 'connected') return;
        this.startPolling();
        await this.send(offer);
        log.log(`Offering signal ${this.signalName} from ${this._id}`);
    }
    
    startAnswering () {
        if (this.signalingState !== 'connected') return;
        this.startPolling();
    }

    stopNegotiation () {
        this.stopPolling();
    }

    async deleteOwnMessages () {
        if (!this._connected) return;
        try {
            const url = `${this._serverUrl}?action=delete` +
                `&signalName=${encodeURIComponent(this.signalName)}` +
                `&fromId=${encodeURIComponent(this._id)}`;
            await fetch(url, {
                method: 'GET',
                cache: 'no-cache'
            });
            log.debug('Own messages deleted');
        } catch (err) {
            log.warn('Error deleting own messages:', err);
        }
    }

    async isOffering () {
        if (!this._connected) return false;
        try {
            const url = `${this._serverUrl}?action=isOffering` +
                `&signalName=${encodeURIComponent(this.signalName)}` +
                `&recipientId=${encodeURIComponent(this._id)}`;
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors', // Changed from no-cors to cors
                cache: 'no-cache',
                headers: {
                    Accept: 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            const data = await response.json();
            return data.isOffering || false;
        } catch (err) {
            log.warn('Error checking if offering:', err);
            return false;
        }
    }

}

export default SheetSignalingChannel;
