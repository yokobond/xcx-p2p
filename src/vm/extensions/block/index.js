import BlockType from '../../extension-support/block-type';
import ArgumentType from '../../extension-support/argument-type';
import Cast from '../../util/cast';
import translations from './translations.json';
import blockIcon from './block-icon.png';
import SignalingChannel from './sheet-signaling-channel';
import SharingPeer from './sharing-peer';

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

        /**
         * The signaling channel.
         * @type {SignalingChannel}
         */
        this.signalingChannel = new SignalingChannel();

        /**
         * The peer connection manager.
         * @type {SharingPeer}
         */
        this.peer = new SharingPeer(this.signalingChannel);

        this.peer.addEventListener('dataChannelStateChanged', event => {
            if (event.detail === 'open') {
                this.signalingChannel.stopNegotiation();
                // this.runtime.startHats('xcxP2P_whenConnected');
            }
            if (event.detail === 'closed') {
                // this.runtime.startHats('xcxP2P_whenDisconnected');
            }
        });
        // Add event listener for shared events
        this.peer.addEventListener('sharedEvent', event => this.onSharedEvent(event.detail));
    }

    /**
     * The signaling state.
     * @type {string<'disconnected'|'connected'|'offering'|'answering'>}
     * @readonly
     * @returns {string} - the signaling state.
     */
    get signalingState () {
        return this.signalingChannel.signalingState;
    }

    async makeSignal (args) {
        const signalName = String(args.SIGNAL_NAME).trim();
        if (this.signalingChannel.signalName === signalName &&
            this.signalingState === 'offering') {
            return Promise.resolve('Already offering');
        }
        this.peer.disconnectPeer();
        this.peer.initializePeerConnection(true);
        const offer = await this.peer.peerConnection.createOffer();
        await this.peer.peerConnection.setLocalDescription(offer);
        await this.signalingChannel.connect(signalName);
        await this.signalingChannel.startOffering(offer);
        return `Offering signal ${signalName}`;
    }

    async connectSignal (args) {
        const signalName = String(args.SIGNAL_NAME).trim();
        if (this.signalingChannel.signalName === signalName &&
            this.signalingState === 'answering') {
            return Promise.resolve('Already answering');
        }
        this.peer.disconnectPeer();
        this.peer.initializePeerConnection(false);
        await this.signalingChannel.connect(signalName);
        this.signalingChannel.startAnswering();
        return `Answering signal ${signalName}`;
    }

    isConnected () {
        return this.peer.isConnected();
    }

    disconnectPeer () {
        this.peer.disconnectPeer();
    }

    /**
     * Return the value of the key.
     * @param {object} args - arguments for the block.
     * @param {string} args.KEY - the key.
     * @return {string} - the value of the key.
     */
    valueOf (args) {
        const key = String(args.KEY).trim();
        return this.peer.valueOf(key);
    }

    /**
     * Set the value of the key.
     * @param {object} args - arguments for the block.
     * @param {string} args.KEY - the key.
     * @param {string} args.VALUE - the value.
     * @return {string} - the result of setting the value.
     */
    setValue (args) {
        const key = String(args.KEY).trim();
        const value = Cast.toString(args.VALUE);
        return this.peer.setValue(key, value);
    }

    /**
     * Return the last event type.
     * @return {string} - the last event type.
     */
    lastEventType () {
        return this.peer.lastEventType();
    }

    /**
     * Return the last event data.
     * @return {string} - the last event data.
     */
    lastEventData () {
        return this.peer.lastEventData();
    }

    /**
     * Send the event.
     * @param {object} args - arguments for the block.
     * @param {string} args.TYPE - the event type.
     * @param {string} args.DATA - the event data.
     * @return {Promise<string>} - resolve with the result of sending the event.
     */
    sendEvent (args) {
        const type = String(args.TYPE).trim();
        const data = Cast.toString(args.DATA);
        return this.peer.sendEvent(type, data);
    }

    /**
     * Handle the shared event.
     * @param {object} event - The event data.
     */
    onSharedEvent (event) {
        this.peer.lastDataChannelEvent = event;
        this.runtime.startHats('xcxP2P_whenEventReceived');
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
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'xcxP2P.isConnected',
                        default: 'connected'
                    }),
                    func: 'isConnected'
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
                },
                '---',
                {
                    opcode: 'setValue',
                    blockType: BlockType.COMMAND,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'xcxP2P.setValue',
                        default: 'set value of [KEY] to [VALUE]',
                        description: 'set value of the key'
                    }),
                    func: 'setValue',
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'xcxP2P.setValue.defaultKey',
                                default: 'key'
                            })
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'xcxP2P.setValue.defaultValue',
                                default: 'value'
                            })
                        }
                    }
                },
                {
                    opcode: 'valueOf',
                    blockType: BlockType.REPORTER,
                    blockAllThreads: false,
                    text: formatMessage({
                        id: 'xcxP2P.valueOf',
                        default: 'value of [KEY]'
                    }),
                    func: 'valueOf',
                    arguments: {
                        KEY: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'xcxP2P.valueOf.defaultKey',
                                default: 'key'
                            })
                        }
                    }
                },
                '---',
                {
                    opcode: 'sendEvent',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'xcxP2P.sendEvent',
                        default: 'send event [TYPE] with [DATA]'
                    }),
                    arguments: {
                        TYPE: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'xcxP2P.sendEvent.defaultEvent',
                                default: 'event'
                            })
                        },
                        DATA: {
                            type: ArgumentType.STRING,
                            defaultValue: formatMessage({
                                id: 'xcxP2P.sendEvent.defaultData',
                                default: 'data'
                            })
                        }
                    }
                },
                {
                    opcode: 'whenEventReceived',
                    blockType: BlockType.EVENT,
                    text: formatMessage({
                        id: 'xcxP2P.whenEventReceived',
                        default: 'when event received'
                    }),
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: false
                },
                {
                    opcode: 'lastEventType',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'xcxP2P.lastEventType',
                        default: 'event'
                    })
                },
                {
                    opcode: 'lastEventData',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: formatMessage({
                        id: 'xcxP2P.lastEventData',
                        default: 'data of event'
                    }),
                    arguments: {
                    }
                }
            ],
            menus: {
            }
        };
    }
}

export {ExtensionBlocks as default, ExtensionBlocks as blockClass};
