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

        /**
         * The timeout for polling messages.
         * @type {number} - The timeout ID.
         */
        this.pollingTimeout = null;

        /**
         * The duration of the offering timeout.
         * @type {number} - The duration in milliseconds.
         * @default 60000
         */
        this.offeringTimeoutDuration = 60000;

        /**
         * The duration of the answering timeout.
         * @type {number} - The duration in milliseconds.
         * @default 60000
         */
        this.answeringTimeoutDuration = 60000;

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
     * @param {number} [duration] - The duration to poll for [ms].
     * @returns {void}
     */
    startPolling (duration) {
        if (duration) {
            if (this.pollingTimeout) {
                clearTimeout(this.pollingTimeout);
            }
            this.pollingTimeout = setTimeout(() => {
                this.stopPolling();
            }, duration);
        }
        if (this._pollInterval) return;
        this._pollInterval = setInterval(() => this.pollMessages(), 1000);
        log.debug('Polling started');
    }

    /**
     * Stop polling for messages.
     * @returns {void}
     */
    stopPolling () {
        if (this.pollingTimeout) {
            clearTimeout(this.pollingTimeout);
            this.pollingTimeout = null;
        }
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
            log.debug('Polling stopped');
        }
    }

    async send (message) {
        if (!this._connected) throw new Error('Not connected');
        try {
            // Stringify the message to ensure it's sent correctly
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
                // Parse the message content if needed
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
        this.signalingState = 'offering';
        await this.send(offer);
        this.startPolling(this.offeringTimeoutDuration);
        log.log(`Offering signal ${this.signalName} from ${this._id}`);
    }

    stopOffering () {
        if (this.signalingState !== 'offering') return;
        this.stopPolling();
        log.log(`Stopped offering signal "${this.signalName}" from ${this._id}`);
        this.signalingState = 'connected';
    }
    
    startAnswering () {
        if (this.signalingState !== 'connected') return;
        this.signalingState = 'answering';
        this.startPolling(this.answeringTimeoutDuration);
    }

    stopAnswering () {
        if (this.signalingState !== 'answering') return;
        this.stopPolling();
        this.signalingState = 'connected';
    }

    stopNegotiation () {
        if (this.signalingState === 'offering') {
            this.stopOffering();
        } else if (this.signalingState === 'answering') {
            this.stopAnswering();
        }
    }

}

export default SheetSignalingChannel;
