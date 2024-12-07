import log from '../../util/log';

/**
 * Class handling the peer connection and data channel logic.
 */
class SharingPeer extends EventTarget {
    /**
     * Constructs a new PeerConnection instance.
     * @param {SignalingChannel} signalingChannel - The signaling channel to use.
     */
    constructor (signalingChannel) {
        super();
        this.signalingChannel = signalingChannel;
        this.signalingState = 'disconnected';
        this.signalName = null;

        this.peerConnection = null;

        /**
         * The data channel for sending and receiving messages.
         * @type {RTCDataChannel}
         */
        this.dataChannel = null;
        this.dataChannelName = 'xcxP2P';

        this.dataChannelValues = {};
        this.lastDataChannelEvent = null;

        this._remoteCandidatesQueue = [];

        this.signalingChannel.addEventListener('message', this.handleSignalingMessage.bind(this));

        this.initializePeerConnection();
    }

    async connect (signalName) {
        if (this.signalingChannel.signalName === signalName &&
            (this.signalingState === 'offering' || this.signalingState === 'answering')) {
            return;
        }
        await this.signalingChannel.connect(signalName);
        this.signalName = signalName;
        this.signalingState = 'connected';
    }

    async startOffering () {
        if (this.signalingState !== 'connected') {
            throw new Error('Not connected');
        }
        this.signalingState = 'offering';
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        await this.signalingChannel.startOffering(offer);
        // Remove duplicate event listener setup
    }

    startAnswering () {
        if (this.signalingState !== 'connected') {
            throw new Error('Not connected');
        }
        this.signalingState = 'answering';
        this.signalingChannel.startAnswering();
        // Remove duplicate event listener setup
    }

    initializePeerConnection (isInitiator) {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                {urls: 'stun:stun.l.google.com:19302'}
            ]
        });

        this.peerConnection.onicecandidate = ({candidate}) => {
            if (candidate) {
                this.signalingChannel.send({
                    type: 'candidate',
                    candidate: candidate
                }).catch(err => log.warn('Error sending ICE candidate:', err));
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            log.log(`Connection state: ${this.peerConnection.connectionState}`);
            if (this.peerConnection.connectionState === 'connected') {
                this.signalingChannel.disconnect();
            }
        };

        this.peerConnection.ondatachannel = event => {
            const dataChannel = event.channel;
            this.setupDataChannel(dataChannel);
        };

        if (isInitiator) {
            const dataChannel = this.peerConnection.createDataChannel(this.dataChannelName);
            this.setupDataChannel(dataChannel);
        }
    }

    /**
     * Handle signaling messages received from the signaling channel.
     * @param {MessageEvent} event - The signaling message event.
     */
    async handleSignalingMessage (event) {
        const message = event.data;
        if (!message) return;
        try {
            if (message.type === 'offer' && this.signalingState === 'answering') {
                if (this.peerConnection.signalingState !== 'stable') {
                    log.warn('Cannot handle offer in signaling state:', this.peerConnection.signalingState);
                    return;
                }
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                await this._processQueuedRemoteCandidates();
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                await this.signalingChannel.send({
                    type: 'answer',
                    sdp: answer.sdp
                });
                this.signalingChannel.stopAnswering();
            } else if (message.type === 'answer' && this.signalingState === 'offering') {
                if (this.peerConnection.signalingState !== 'have-local-offer') {
                    log.warn('Cannot handle answer in signaling state:', this.peerConnection.signalingState);
                    return;
                }
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
                await this._processQueuedRemoteCandidates();
                this.signalingChannel.stopOffering();
            } else if (message.type === 'candidate') {
                const candidate = new RTCIceCandidate(message.candidate);
                if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
                    // Remote description is set, add ICE candidate immediately
                    await this.peerConnection.addIceCandidate(candidate);
                    log.log('ICE candidate added:', candidate);
                } else {
                    // Remote description not set yet, queue the candidate
                    this._remoteCandidatesQueue.push(candidate);
                    log.log('ICE candidate queued:', candidate);
                }
            }
        } catch (err) {
            log.warn('Error processing signaling message:', err);
        }
    }

    async _processQueuedRemoteCandidates () {
        for (const candidate of this._remoteCandidatesQueue) {
            try {
                await this.peerConnection.addIceCandidate(candidate);
                log.log('Queued ICE candidate added:', candidate);
            } catch (err) {
                log.warn('Error adding queued ICE candidate:', err);
            }
        }
        this._remoteCandidatesQueue = [];
    }

    setupDataChannel (dataChannel) {
        this.dataChannel = dataChannel;
        dataChannel.onopen = () => {
            this.dispatchEvent(new CustomEvent('dataChannelStateChanged', {
                detail: this.dataChannel.readyState
            }));
            log.log(`Data channel opened: ${this.dataChannelName}`);
        };
        dataChannel.onclose = () => {
            this.dispatchEvent(new CustomEvent('dataChannelStateChanged', {
                detail: this.dataChannel ? this.dataChannel.readyState : 'closed'
            }));
            log.log('Data channel closed');
        };
        dataChannel.onmessage = event => {
            log.log('Received:', event.data);
            const message = JSON.parse(event.data);
            switch (message.type) {
            case 'SET_VALUE':
                this.dataChannelValues[message.content.key] = message.content.value;
                break;
            case 'EVENT':
                this.lastDataChannelEvent = message.content;
                this.dispatchEvent(new CustomEvent('sharedEvent', {
                    detail: message.content
                }));
                break;
            default:
                log.warn('Unknown message type:', message.type);
            }
        };
    }

    /**
     * Whether the peer is connected.
     * @returns {boolean} True if the peer is connected.
     */
    isConnected () {
        return this.peerConnection && this.peerConnection.connectionState === 'connected';
    }

    disconnectPeer () {
        if (this.dataChannel) {
            this.dataChannel.close();
            log.log('Data channel closed');
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            log.log('Peer connection closed');
            this.peerConnection = null;
        }
    }

    /**
     * State of the data channel.
     * @returns {string<'connecting'|'open'|'closing'|'closed'|'n/a'>} The state of the data channel.
     */
    dataChannelState () {
        return this.dataChannel ? this.dataChannel.readyState : 'n/a';
    }

    valueOf (key) {
        return this.dataChannelValues[key] ? this.dataChannelValues[key] : '';
    }

    setValue (key, value) {
        this.dataChannelValues[key] = value;
        if (!this.dataChannel) {
            return Promise.resolve(`local ${key} = ${value}`);
        }
        try {
            const message = {
                type: 'SET_VALUE',
                content: {
                    key: key,
                    value: value
                }
            };
            this.dataChannel.send(JSON.stringify(message));
            log.debug(`send SET_VALUE: ${key} = ${value}`);
        } catch (error) {
            return Promise.resolve(error.message);
        }
        return Promise.resolve(`send ${key} = ${value}`);
    }

    sendEvent (type, data) {
        this.dispatchEvent(new CustomEvent('sharedEvent', {
            detail: {type: type, data: data}
        }));
        if (!this.dataChannel) {
            return Promise.resolve(`local event: ${type} data: ${data}`);
        }
        try {
            const message = {
                type: 'EVENT',
                content: {
                    type: type,
                    data: data
                }
            };
            this.dataChannel.send(JSON.stringify(message));
        } catch (error) {
            return Promise.resolve(error.message);
        }
        return Promise.resolve(`send event: ${type} data: ${data}`);
    }

    lastEventType () {
        const event = this.lastDataChannelEvent;
        return event ? event.type : '';
    }

    lastEventData () {
        const event = this.lastDataChannelEvent;
        return event ? event.data : '';
    }

    stopNegotiation () {
        if (this.signalingChannel) {
            this.signalingChannel.stopNegotiation();
            this.signalingState = 'connected';
            log.log('Negotiation stopped');
        }
    }
}

export default SharingPeer;
