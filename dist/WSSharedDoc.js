"use strict";
// MARK: ==== import ====
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSSharedDoc = void 0;
const ws_1 = __importDefault(require("ws"));
const debounce_1 = __importDefault(require("lodash/debounce"));
const Y = __importStar(require("yjs"));
const lib0 = __importStar(require("lib0-typescript"));
const y_protocols_typescript_1 = require("y-protocols-typescript");
const Callback_1 = require("./Callback");
// ================================================================================================ // 
// MARK: - Const -
const CALLBACK_DEBOUNCE_WAIT = parseInt((_a = process.env.CALLBACK_DEBOUNCE_WAIT) !== null && _a !== void 0 ? _a : "") || 2000;
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt((_b = process.env.CALLBACK_DEBOUNCE_MAXWAIT) !== null && _b !== void 0 ? _b : "") || 10000;
const messageSync = 0;
const messageAwareness = 1;
class WSSharedDoc extends Y.Doc {
    get documentReady() { return this._documentReady; }
    set documentReady(value) { this._documentReady = value; if (value)
        this.emit("ready", [value]); }
    constructor(name) {
        super({ gc: WSSharedDoc.gc });
        this._pendingMessages = [];
        this._documentReady = false;
        this.sockets = new Map();
        this.name = name;
        this.on('update', (update) => {
            this.updateHandler(update);
        });
        this.awareness = new y_protocols_typescript_1.Awareness(this);
        this.awareness.localState = null;
        this.awareness.on('update', (update, origin) => {
            this.awarenessChangeHandler(update, origin);
        });
        if (Callback_1.isCallbackSet) {
            this.on('update', (update) => {
                (0, debounce_1.default)(Callback_1.callbackHandler, CALLBACK_DEBOUNCE_WAIT, { maxWait: CALLBACK_DEBOUNCE_MAXWAIT })(this);
            });
        }
    }
    register(socket) {
        this.sockets.set(socket, new Set());
        socket.binaryType = "arraybuffer";
        socket.on("message", (message) => {
            this.listenMessage(socket, new Uint8Array(message));
        });
        socket.on("close", () => {
            this.close(socket);
        });
        this.setupPingPong(socket);
        this.setupSync(socket);
        this.setupAwareness(socket);
    }
    setupSync(socket) {
        const encoder = new lib0.Encoder();
        encoder.writeVarUint(messageSync);
        y_protocols_typescript_1.sync.writeSyncStep1(encoder, this);
        this.send(socket, encoder.toUint8Array());
    }
    setupAwareness(socket) {
        const awarenessStates = this.awareness.states;
        if (awarenessStates.size > 0) {
            const encoder = new lib0.Encoder();
            encoder.writeVarUint(messageAwareness);
            const data = this.awareness.encodeUpdate(Array.from(awarenessStates.keys()));
            if (data == null)
                return;
            encoder.writeVarUint8Array(data);
            this.send(socket, encoder.toUint8Array());
        }
    }
    setupPingPong(socket) {
        let pongReceived = true;
        const pingInterval = setInterval(() => {
            if (!pongReceived) { // on dead
                if (this.sockets.has(socket)) {
                    this.close(socket);
                }
                clearInterval(pingInterval);
            }
            else if (this.sockets.has(socket)) {
                pongReceived = false;
                try { // resend ping
                    socket.ping();
                }
                catch (e) { // on ping error
                    this.close(socket);
                    clearInterval(pingInterval);
                }
            }
        }, WSSharedDoc.pingTimeout);
        socket.on('close', () => clearInterval(pingInterval));
        socket.on('pong', () => pongReceived = true);
    }
    // return cached or make new
    static getDocument(documentName) {
        var _a;
        const cached = WSSharedDoc.documents.get(documentName);
        if (cached != null)
            return cached;
        const newValue = new WSSharedDoc(documentName);
        WSSharedDoc.documents.set(documentName, newValue);
        (_a = WSSharedDoc.persistenceAdaptor) === null || _a === void 0 ? void 0 : _a.bindState(documentName, newValue).then(() => {
            newValue.documentReady = true;
        });
        return newValue;
    }
    send(socket, message) {
        if (socket.readyState !== ws_1.default.CONNECTING && socket.readyState !== ws_1.default.OPEN) {
            this.close(socket);
        }
        try {
            socket.send(message, (error) => {
                if (error != null)
                    this.close(socket);
            });
        }
        catch (e) {
            this.close(socket);
        }
    }
    close(socket) {
        try {
            const controlledIds = this.sockets.get(socket);
            if (controlledIds == null)
                return;
            this.sockets.delete(socket);
            this.awareness.removeStates(Array.from(controlledIds), null);
            // if persisted, we store state and destroy ydocument
            if (this.sockets.size === 0 && WSSharedDoc.persistenceAdaptor != null) {
                WSSharedDoc.persistenceAdaptor.writeState(this.name, this).then(() => {
                    this.destroy();
                });
                WSSharedDoc.documents.delete(this.name);
            }
        }
        finally {
            socket.close();
        }
    }
    updateHandler(update) {
        const encoder = new lib0.Encoder();
        encoder.writeVarUint(messageSync);
        y_protocols_typescript_1.sync.writeUpdate(encoder, update);
        const message = encoder.toUint8Array();
        this.sockets.forEach((_, socket) => this.send(socket, message));
    }
    /** conn: Origin is the connection that made the change */
    awarenessChangeHandler({ added, updated, removed }, socket) {
        const changedClients = added.concat(updated, removed);
        if (socket instanceof ws_1.default.WebSocket) {
            const controlledIDs = this.sockets.get(socket);
            if (controlledIDs !== undefined) {
                added.forEach(clientID => { controlledIDs.add(clientID); });
                removed.forEach(clientID => { controlledIDs.delete(clientID); });
            }
        }
        // broadcast awareness update
        const encoder = new lib0.Encoder();
        encoder.writeVarUint(messageAwareness);
        const data = this.awareness.encodeUpdate(changedClients);
        if (data == null)
            return;
        encoder.writeVarUint8Array(data);
        const buff = encoder.toUint8Array();
        this.sockets.forEach((_, c) => {
            this.send(c, buff);
        });
    }
    pendMessage(socket, message) {
        console.assert(this.documentReady == false);
        if (this._pendingMessages.length == 0) {
            const readyHandler = () => {
                for (const { socket, message } of this._pendingMessages) {
                    if (socket.readyState == ws_1.default.OPEN) {
                        this.listenMessage(socket, message);
                    }
                    else {
                        socket.close();
                    }
                }
                this._pendingMessages = [];
                this.off("ready", readyHandler);
            };
            this.on("ready", readyHandler);
        }
        this._pendingMessages.push({ socket, message });
    }
    listenMessage(socket, message) {
        if (!this.documentReady) {
            this.pendMessage(socket, message);
            return;
        }
        try {
            const encoder = new lib0.Encoder();
            const decoder = new lib0.Decoder(message);
            const messageType = decoder.readVarUint();
            if (messageType === messageSync) {
                encoder.writeVarUint(messageSync);
                y_protocols_typescript_1.sync.readSyncMessage(decoder, encoder, this, null);
                if (encoder.length > 1) {
                    this.send(socket, encoder.toUint8Array());
                }
            }
            else if (messageType === messageAwareness) {
                this.awareness.applyUpdate(decoder.readVarUint8Array(), socket);
            }
            else {
                console.error(`Not implemented ${messageType}`);
            }
        }
        catch (err) {
            console.error(err);
            this.emit('error', [err]);
        }
    }
}
exports.WSSharedDoc = WSSharedDoc;
WSSharedDoc.gc = true;
WSSharedDoc.pingTimeout = 30000;
WSSharedDoc.documents = new Map();
WSSharedDoc.persistenceAdaptor = null;
