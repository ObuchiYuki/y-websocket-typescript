"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketProvider = exports.MessageType = void 0;
const bc = __importStar(require("lib0/broadcastchannel"));
const url = __importStar(require("lib0/url"));
const encoding = __importStar(require("lib0/encoding"));
const decoding = __importStar(require("lib0/decoding"));
const observable_1 = require("lib0/observable");
const y_protocols_typescript_1 = require("y-protocols-typescript");
const ws_1 = require("ws");
// ============================================================================================ //
// MARK: Consts
var MessageType;
(function (MessageType) {
    MessageType.sync = 0;
    MessageType.queryAwareness = 3;
    MessageType.awareness = 1;
    MessageType.auth = 2;
    MessageType.toString = (type) => {
        switch (type) {
            case MessageType.sync: return "sync";
            case MessageType.queryAwareness: return "queryAwareness";
            case MessageType.awareness: return "awareness";
            case MessageType.auth: return "auth";
        }
    };
})(MessageType = exports.MessageType || (exports.MessageType = {}));
const messageReconnectTimeout = 30000;
class WebSocketProvider extends observable_1.Observable {
    get synced() { return this._synced; }
    set synced(value) {
        if (this._synced === value)
            return;
        this._synced = value;
        this.emit('sync', [value]);
        if (value)
            this.emit('synced', [value]);
    }
    // ============================================================================================ //
    // MARK: Init
    constructor({ serverUrl, roomname, params = {}, doc, config = {} }) {
        var _a, _b, _c, _d, _e, _f, _g;
        super();
        this.webSocketConnected = false;
        this.webSocketConnecting = false;
        this.webSocketUnsuccessfulReconnects = 0;
        this.webSocketLastMessageReceived = 0;
        this.socket = null;
        this.broadcastConnected = false;
        this._synced = false;
        this._shouldConnect = true;
        while (serverUrl[serverUrl.length - 1] === '/') {
            serverUrl = serverUrl.slice(0, serverUrl.length - 1);
        }
        this.broadcastChannel = serverUrl + '/' + roomname;
        const encodedParams = url.encodeQueryParams(params);
        this.url = serverUrl + '/' + roomname + (encodedParams.length === 0 ? '' : '?' + encodedParams);
        this.roomname = roomname;
        this.document = doc;
        this.awareness = new y_protocols_typescript_1.Awareness(doc);
        this._config = {
            connectOnLaunch: (_a = config.connectOnLaunch) !== null && _a !== void 0 ? _a : true,
            webSocketClass: (_b = config.WebSocketClass) !== null && _b !== void 0 ? _b : ws_1.WebSocket,
            resyncInterval: (_c = config.resyncInterval) !== null && _c !== void 0 ? _c : -1,
            maxBackoffTime: (_d = config.maxBackoffTime) !== null && _d !== void 0 ? _d : 2500,
            enableBroadcast: (_e = config.enableBroadcast) !== null && _e !== void 0 ? _e : true
        };
        this._shouldConnect = this._config.connectOnLaunch;
        this._resyncTimer = this.makeResyncTimer((_f = config.resyncInterval) !== null && _f !== void 0 ? _f : -1);
        this._broadcastSubscriber = this.makeBroadcastSubscriber();
        this._updateHandler = this.makeUpdateHandler();
        this._awarenessUpdateHandler = this.makeAwarenessHandler(this.awareness);
        this._unloadHandler = this.makeUnloadHandler();
        this._checkTimer = this.makeCheckTimer();
        if ((_g = this._config.connectOnLaunch) !== null && _g !== void 0 ? _g : true) {
            this.connectWebSocket();
        }
    }
    // ============================================================================================ //
    // MARK: Methods
    destroy() {
        if (this._resyncTimer != null) {
            clearInterval(this._resyncTimer);
        }
        clearInterval(this._checkTimer);
        this.disconnect();
        if (typeof window !== 'undefined') {
            window.removeEventListener('unload', this._unloadHandler);
        }
        else if (typeof process !== 'undefined') {
            process.off('exit', this._unloadHandler);
        }
        this.awareness.off('update', this._awarenessUpdateHandler);
        this.document.off('update', this._updateHandler);
        super.destroy();
    }
    disconnect() {
        this._shouldConnect = false;
        this.disconnectBroadcast();
        if (this.socket != null) {
            this.socket.close();
        }
    }
    connectWebSocket() {
        this._shouldConnect = true;
        if (!this.webSocketConnected && this.socket === null) {
            this.setupWebsocket();
            this.connectBroadcast();
        }
    }
    // ============================================================================================ //
    // MARK: Read Message
    readMessage(buffer, emitSynced) {
        const decoder = decoding.createDecoder(buffer);
        const encoder = encoding.createEncoder();
        const messageType = decoding.readVarUint(decoder);
        if (messageType == MessageType.sync) {
            this.readMessageSync(encoder, decoder, emitSynced);
        }
        else if (messageType == MessageType.queryAwareness) {
            this.readMessageQueryAwareness(encoder);
        }
        else if (messageType == MessageType.awareness) {
            this.readMessageAwareness(decoder);
        }
        else if (messageType == MessageType.auth) {
            this.readMessageAuth(decoder);
        }
        else {
            console.error('Unable to compute message', messageType);
        }
        return encoder;
    }
    readMessageSync(encoder, decoder, emitSynced) {
        encoding.writeVarUint(encoder, MessageType.sync);
        const syncMessageType = y_protocols_typescript_1.sync.readSyncMessage(decoder, encoder, this.document, this);
        if (emitSynced && syncMessageType === y_protocols_typescript_1.sync.MessageType.syncStep2 && !this.synced) {
            this.synced = true;
        }
    }
    readMessageQueryAwareness(encoder) {
        encoding.writeVarUint(encoder, MessageType.awareness);
        const data = this.awareness.encodeUpdate(Array.from(this.awareness.states.keys()));
        if (data != null) {
            encoding.writeVarUint8Array(encoder, data);
        }
    }
    readMessageAwareness(decoder) {
        this.awareness.applyUpdate(decoding.readVarUint8Array(decoder), this);
    }
    readMessageAuth(decoder) {
        y_protocols_typescript_1.auth.readAuthMessage(decoder, this.document, (_, reason) => {
            console.warn(`Permission denied to access ${this.url}.\n${reason}`);
        });
    }
    // ============================================================================================ //
    // MARK: Private methods
    setupWebsocket() {
        if (!this._shouldConnect || this.socket != null)
            return;
        const socket = new this._config.webSocketClass(this.url);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;
        this.webSocketConnecting = true;
        this.webSocketConnected = false;
        this.synced = false;
        socket.onmessage = (event) => {
            this.webSocketLastMessageReceived = Date.now();
            const data = new Uint8Array(event.data);
            const encoder = this.readMessage(data, true);
            if (encoding.length(encoder) > 1) {
                socket.send(encoding.toUint8Array(encoder));
            }
        };
        socket.onerror = (event) => {
            this.emit('connection-error', [event, this]);
        };
        socket.onclose = (event) => {
            this.emit('connection-close', [event, this]);
            this.socket = null;
            this.webSocketConnecting = false;
            if (this.webSocketConnected) {
                this.webSocketConnected = false;
                this.synced = false;
                // update awareness (all users except local left)
                this.awareness.removeStates(Array.from(this.awareness.states.keys()).filter((client) => client !== this.document.clientID), this);
                this.emit('status', [{ status: 'disconnected' }]);
            }
            else {
                this.webSocketUnsuccessfulReconnects++;
            }
            const nextTime = Math.min(Math.pow(2, this.webSocketUnsuccessfulReconnects) * 100, this._config.maxBackoffTime);
            setTimeout(() => { this.setupWebsocket(); }, nextTime);
        };
        socket.onopen = () => {
            this.webSocketLastMessageReceived = Date.now();
            this.webSocketConnecting = false;
            this.webSocketConnected = true;
            this.webSocketUnsuccessfulReconnects = 0;
            this.emit('status', [{ status: 'connected' }]);
            // always send sync step 1 when connected
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MessageType.sync);
            y_protocols_typescript_1.sync.writeSyncStep1(encoder, this.document);
            socket.send(encoding.toUint8Array(encoder), error => {
                if (error != null)
                    socket.close();
            });
            // broadcast local awareness state
            if (this.awareness.localState !== null) {
                const encoderAwarenessState = encoding.createEncoder();
                encoding.writeVarUint(encoderAwarenessState, MessageType.awareness);
                const data = this.awareness.encodeUpdate([this.document.clientID]);
                if (data == null)
                    return;
                encoding.writeVarUint8Array(encoderAwarenessState, data);
                socket.send(encoding.toUint8Array(encoderAwarenessState));
            }
        };
        this.emit('status', [{ status: 'connecting' }]);
    }
    broadcastMessageBoth(buffer) {
        var _a;
        if (this.webSocketConnected) {
            (_a = this.socket) === null || _a === void 0 ? void 0 : _a.send(buffer);
        }
        if (this.broadcastConnected) {
            bc.publish(this.broadcastChannel, buffer, this);
        }
    }
    // ============================================= //
    // MARK: Broadcast connection
    connectBroadcast() {
        if (!this._config.enableBroadcast)
            return;
        if (!this.broadcastConnected) {
            bc.subscribe(this.broadcastChannel, this._broadcastSubscriber);
            this.broadcastConnected = true;
        }
        // send sync step1 to bc
        // write sync step 1
        const encoderSync = encoding.createEncoder();
        encoding.writeVarUint(encoderSync, MessageType.sync);
        y_protocols_typescript_1.sync.writeSyncStep1(encoderSync, this.document);
        bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderSync), this);
        // broadcast local state
        const encoderState = encoding.createEncoder();
        encoding.writeVarUint(encoderState, MessageType.sync);
        y_protocols_typescript_1.sync.writeSyncStep2(encoderState, this.document);
        bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderState), this);
        // write queryAwareness
        const encoderAwarenessQuery = encoding.createEncoder();
        encoding.writeVarUint(encoderAwarenessQuery, MessageType.queryAwareness);
        bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderAwarenessQuery), this);
        // broadcast local awareness state
        const encoderAwarenessState = encoding.createEncoder();
        encoding.writeVarUint(encoderAwarenessState, MessageType.awareness);
        const data = this.awareness.encodeUpdate([this.document.clientID]);
        if (data == null)
            return;
        encoding.writeVarUint8Array(encoderAwarenessState, data);
        bc.publish(this.broadcastChannel, encoding.toUint8Array(encoderAwarenessState), this);
    }
    disconnectBroadcast() {
        // broadcast message with local awareness state set to null (indicating disconnect)
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.awareness);
        const data = this.awareness.encodeUpdate([this.document.clientID], new Map());
        if (data == null)
            return;
        encoding.writeVarUint8Array(encoder, data);
        this.broadcastMessageBoth(encoding.toUint8Array(encoder));
        if (this.broadcastConnected) {
            bc.unsubscribe(this.broadcastChannel, this._broadcastSubscriber);
            this.broadcastConnected = false;
        }
    }
    // ============================================= //
    // MARK: Handler init
    makeResyncTimer(interval) {
        if (interval <= 0)
            return;
        const timer = setInterval(() => {
            var _a;
            if (((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) !== ws_1.WebSocket.OPEN)
                return;
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MessageType.sync);
            y_protocols_typescript_1.sync.writeSyncStep1(encoder, this.document);
            this.socket.send(encoding.toUint8Array(encoder));
        }, interval);
        return timer;
    }
    makeBroadcastSubscriber() {
        return (data, origin) => {
            if (origin === this)
                return;
            const encoder = this.readMessage(new Uint8Array(data), false);
            if (encoding.length(encoder) <= 1)
                return;
            bc.publish(this.broadcastChannel, encoding.toUint8Array(encoder), this);
        };
    }
    makeUpdateHandler() {
        const handler = (update, origin) => {
            if (origin === this)
                return;
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MessageType.sync);
            y_protocols_typescript_1.sync.writeUpdate(encoder, update);
            this.broadcastMessageBoth(encoding.toUint8Array(encoder));
        };
        this.document.on('update', handler);
        return handler;
    }
    makeAwarenessHandler(awareness) {
        const handler = ({ added, updated, removed }) => {
            const changedClients = added.concat(updated).concat(removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MessageType.awareness);
            const data = awareness.encodeUpdate(changedClients);
            if (data == null)
                return;
            encoding.writeVarUint8Array(encoder, data);
            this.broadcastMessageBoth(encoding.toUint8Array(encoder));
        };
        awareness.on('update', handler);
        return handler;
    }
    makeUnloadHandler() {
        const handler = () => {
            this.awareness.removeStates([this.document.clientID], 'window unload');
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('unload', handler);
        }
        else if (typeof process !== 'undefined') {
            process.on('exit', handler);
        }
        return handler;
    }
    makeCheckTimer() {
        return setInterval(() => {
            var _a;
            if (this.webSocketConnected && messageReconnectTimeout < Date.now() - this.webSocketLastMessageReceived) {
                (_a = this.socket) === null || _a === void 0 ? void 0 : _a.close();
            }
        }, messageReconnectTimeout / 10);
    }
}
exports.WebSocketProvider = WebSocketProvider;
