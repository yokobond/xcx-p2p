import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
// import Cast from '../../util/cast';
import log from '../../util/log';
import translations from './translations.json';
import blockIcon from './block-icon.png';
import SignalingChannel from './file-signaling-channel';

/**
 * Formatter which is used for translation.
 * This will be replaced which is used in the runtime.
 * @param {object} messageData - format-message object
 * @returns {string} - message for the locale
 */
let formatMessage = messageData => messageData.default;

/**
 * Setup format-message for this extension.
 */
const setupTranslations = () => {
    const localeSetup = formatMessage.setup();
    if (localeSetup && localeSetup.translations[localeSetup.locale]) {
        Object.assign(
            localeSetup.translations[localeSetup.locale],
            translations[localeSetup.locale]
        );
    }
};

const EXTENSION_ID = 'xcxP2P';

/**
 * URL to get this extension as a module.
 * When it was loaded as a module, 'extensionURL' will be replaced a URL which is retrieved from.
 * @type {string}
 */
let extensionURL = 'https://yokobond.github.io/xcx-p2p/dist/xcxP2P.mjs';

/**
 * Class for the extension blocks.
 */
class ExtensionBlocks {
    /**
     * A translation object which is used in this class.
     * @param {FormatObject} formatter - translation object
     */
    static set formatMessage (formatter) {
        formatMessage = formatter;
        if (formatMessage) setupTranslations();
    }

    /**
     * @return {string} - the name of this extension.
     */
    static get EXTENSION_NAME () {
        return formatMessage({
            id: 'xcxP2P.name',
            default: 'P2P',
            description: 'name of the extension'
        });
    }

    /**
     * @return {string} - the ID of this extension.
     */
    static get EXTENSION_ID () {
        return EXTENSION_ID;
    }

    /**
     * URL to get this extension.
     * @type {string}
     */
    static get extensionURL () {
        return extensionURL;
    }

    /**
     * Set URL to get this extension.
     * The extensionURL will be changed to the URL of the loading server.
     * @param {string} url - URL
     */
    static set extensionURL (url) {
        extensionURL = url;
    }

    /**
     * Construct a set of blocks for P2P.
     * @param {Runtime} runtime - the Scratch 3.0 runtime.
     */
    constructor (runtime) {
        /**
         * The Scratch 3.0 runtime.
         * @type {Runtime}
         */
        this.runtime = runtime;

        if (runtime.formatMessage) {
            // Replace 'formatMessage' to a formatter which is used in the runtime.
            formatMessage = runtime.formatMessage;
        }

        this.signalingChannel = new SignalingChannel();
        this.signalingChannel.addEventListener('message', async event => {
            const message = event.data;
            try {
                if (message.type === 'offer') {
                    await this.peerConnection.setRemoteDescription(message);
                    const answer = await this.peerConnection.createAnswer();
                    await this.peerConnection.setLocalDescription(answer);
                    await this.signalingChannel.send(answer);
                    log.log('Remote description set and answer sent:', message);
                } else if (message.type === 'answer') {
                    await this.peerConnection.setRemoteDescription(message);
                    log.log('Remote description set:', message);
                } else if (message.type === 'candidate') {
                    await this.peerConnection.addIceCandidate(message.candidate);
                    log.log('ICE candidate added:', message.candidate);
                }
            } catch (err) {
                log.warn('Error processing signaling message:', err);
            }
        });

        this.initializePeerConnection();
    }

    initializePeerConnection () {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                {urls: 'stun:stun.l.google.com:19302'}
            ]
        });

        // Setup peer connection event handlers
        this.peerConnection.onicecandidate = ({candidate}) => {
            if (candidate) {
                this.signalingChannel.send({
                    type: 'candidate',
                    candidate: candidate
                }).catch(err => log.warn('Error sending ICE candidate:', err));
            } else {
                log.log('ICE candidate gathering complete');
                this.signalingChannel.send(this.peerConnection.localDescription);
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
        this.peerConnection.createDataChannel('channel');
    }

    setupDataChannel (dataChannel) {
        this.dataChannel = dataChannel;
        dataChannel.onopen = () => {
            log.log('Data channel opened');
        };
        dataChannel.onclose = () => {
            log.log('Data channel closed');
        };
        dataChannel.onmessage = event => {
            log.log('Received:', event.data);
        };
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        setupTranslations();
        return {
            id: ExtensionBlocks.EXTENSION_ID,
            name: ExtensionBlocks.EXTENSION_NAME,
            extensionURL: ExtensionBlocks.extensionURL,
            blockIconURI: blockIcon,
            showStatusButton: false,
            blocks: [
                {
                    opcode: 'makeSignal',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxP2P.makeSignal',
                        default: 'make signal [SIGNAL_NAME]',
                        description: 'make WebRTC signaling offer'
                    }),
                    arguments: {
                        SIGNAL_NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        }
                    },
                    func: 'makeSignal'
                },
                {
                    opcode: 'connectSignal',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxP2P.connectSignal',
                        default: 'connect signal [SIGNAL_NAME]',
                        description: 'take WebRTC signaling offer'
                    }),
                    arguments: {
                        SIGNAL_NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: 'name'
                        }
                    },
                    func: 'connectSignal'
                },
                {
                    opcode: 'disconnectPeer',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxP2P.disconnectPeer',
                        default: 'disconnect peer',
                        description: 'disconnect the WebRTC peer connection'
                    }),
                    func: 'disconnectPeer'
                }
            ],
            menus: {
            }
        };
    }

    async makeSignal (args) {
        const signalName = String(args.SIGNAL_NAME).trim();
        await this.signalingChannel.connect(signalName);
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        await this.signalingChannel.send(offer);
    }

    async connectSignal (args) {
        const signalName = String(args.SIGNAL_NAME).trim();
        await this.signalingChannel.connect(signalName);
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
            
            // Re-initialize peer connection for next use
            this.initializePeerConnection();
        }
    }
}

export {ExtensionBlocks as default, ExtensionBlocks as blockClass};
