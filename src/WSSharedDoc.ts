// MARK: ==== import ====

import WebSocket from 'ws'
import debounce from 'lodash/debounce'

import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

import { sync, Awareness } from 'y-protocols-typescript'

import { callbackHandler, isCallbackSet } from './Callback'

// ================================================================================================ // 
// MARK: - Types -
export type PersistenceAdaptor = {
    bindState: (docName: string, ydoc: WSSharedDoc) => Promise<void>, writeState: (docName: string, ydoc: WSSharedDoc) => Promise<any>
}
export type AwarenessUpdate = { 
    added: number[], updated: number[], removed: number[]
}
export type WebSocketHandlerConfig = {
    gc: boolean, pingTimeout: number
}
export type PendingMessage = { 
    socket: WebSocket.WebSocket, message: Uint8Array 
}

// ================================================================================================ // 
// MARK: - Const -
const CALLBACK_DEBOUNCE_WAIT = parseInt(process.env.CALLBACK_DEBOUNCE_WAIT ?? "") || 2000
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT ?? "") || 10000

const messageSync = 0
const messageAwareness = 1

// ================================================================================================ // 
// MARK: - WSSharedDoc -
export interface WSSharedDoc {
    on(name: "ready", block: () => void): void;
    on(name: "update", block: (update: Uint8Array) => void): void;
}
export class WSSharedDoc extends Y.Doc {
    name: string
    // [WebSocket: controlled user ids] 
    sockets: Map<WebSocket.WebSocket, Set<number>>
    awareness: Awareness

    get documentReady() { return this._documentReady }
    set documentReady(value: boolean) { this._documentReady = value; if (value) this.emit("ready", [value]) }

    private _pendingMessages: PendingMessage[] = []
    private _documentReady = false

    static gc = true
    static pingTimeout = 30000
    static documents: Map<string, WSSharedDoc> = new Map()
    static persistenceAdaptor: PersistenceAdaptor|null = null

    private constructor(name: string) {
        super({ gc: WSSharedDoc.gc })
        this.sockets = new Map()
        this.name = name
        this.on('update', (update: Uint8Array) => {
            this.updateHandler(update)
        })

        this.awareness = new Awareness(this)
        this.awareness.localState = null
        this.awareness.on('update', (update, origin) => {
            this.awarenessChangeHandler(update, origin)
        })

        if (isCallbackSet) {
            this.on('update', (update) => {
                debounce(callbackHandler, CALLBACK_DEBOUNCE_WAIT, { maxWait: CALLBACK_DEBOUNCE_MAXWAIT })(this)
            })
        }
    }

    register(socket: WebSocket) {
        this.sockets.set(socket, new Set())
        socket.binaryType = "arraybuffer"

        socket.on("message", (message: ArrayBuffer) => {
            this.listenMessage(socket, new Uint8Array(message))
        })
        socket.on("close", () => { 
            this.close(socket) 
        })

        this.setupPingPong(socket)
        this.setupSync(socket)
        this.setupAwareness(socket)
    }
    
    private setupSync(socket: WebSocket.WebSocket) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        sync.writeSyncStep1(encoder, this)
        this.send(socket, encoding.toUint8Array(encoder))
    }

    private setupAwareness(socket: WebSocket.WebSocket) {
        const awarenessStates = this.awareness.states
        if (awarenessStates.size > 0) {
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, messageAwareness)
            const data = this.awareness.encodeUpdate(Array.from(awarenessStates.keys()))
            if (data == null) return
            encoding.writeVarUint8Array(encoder, data)
            this.send(socket, encoding.toUint8Array(encoder))
        }        
    }

    private setupPingPong(socket: WebSocket.WebSocket) {
        let pongReceived = true
        const pingInterval = setInterval(() => {
            if (!pongReceived) { // on dead
                if (this.sockets.has(socket)) { this.close(socket) }
                clearInterval(pingInterval)
            } else if (this.sockets.has(socket)) {
                pongReceived = false
                try { // resend ping
                    socket.ping()
                } catch (e) { // on ping error
                    this.close(socket)
                    clearInterval(pingInterval)
                }
            }
        }, WSSharedDoc.pingTimeout)

        socket.on('close', () => clearInterval(pingInterval))
        socket.on('pong', () => pongReceived = true )
    }

    // return cached or make new
    static getDocument(documentName: string): WSSharedDoc {
        const cached = WSSharedDoc.documents.get(documentName)
        if (cached != null) return cached
        const newValue = new WSSharedDoc(documentName)
        WSSharedDoc.documents.set(documentName, newValue)

        WSSharedDoc.persistenceAdaptor?.bindState(documentName, newValue)
            .then(() => {
                newValue.documentReady = true
            })

        return newValue
    }
    
    private send(socket: WebSocket.WebSocket, message: Uint8Array) {
        if (socket.readyState !== WebSocket.CONNECTING && socket.readyState !== WebSocket.OPEN) {
            this.close(socket)
        }
        try {
            socket.send(message, (error?: Error) => {
                if (error != null) this.close(socket) 
            })
        } catch (e) {
            this.close(socket)
        }
    }

    private close(socket: WebSocket.WebSocket) { 
        try {
            const controlledIds = this.sockets.get(socket)
            if (controlledIds == null) return
            
            this.sockets.delete(socket)
            this.awareness.removeStates(Array.from(controlledIds), null)
            
            // if persisted, we store state and destroy ydocument
            if (this.sockets.size === 0 && WSSharedDoc.persistenceAdaptor != null) {
                WSSharedDoc.persistenceAdaptor.writeState(this.name, this).then(() => {
                    this.destroy()
                })
        
                WSSharedDoc.documents.delete(this.name)
            }

        } finally {
            socket.close()
        }
    }

    private updateHandler(update: Uint8Array) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        sync.writeUpdate(encoder, update)
        const message = encoding.toUint8Array(encoder)

        this.sockets.forEach((_, socket) => this.send(socket, message))
    }

    /** conn: Origin is the connection that made the change */
    private awarenessChangeHandler({ added, updated, removed }: AwarenessUpdate, socket: unknown)  {
        const changedClients = added.concat(updated, removed)
        if (socket instanceof WebSocket.WebSocket) {
            const controlledIDs = this.sockets.get(socket)
            if (controlledIDs !== undefined) {
                added.forEach(clientID => { controlledIDs.add(clientID) })
                removed.forEach(clientID => { controlledIDs.delete(clientID) })
            }
        }
        // broadcast awareness update
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageAwareness)
        const data = this.awareness.encodeUpdate(changedClients)
        if (data == null) return
        encoding.writeVarUint8Array(encoder, data)
        const buff = encoding.toUint8Array(encoder)
        this.sockets.forEach((_, c) => {
            this.send(c, buff)
        })
    }

    private pendMessage(socket: WebSocket.WebSocket, message: Uint8Array) {
        console.assert(this.documentReady == false)
        
        if (this._pendingMessages.length == 0) {
            const readyHandler = () => {
                for (const { socket, message } of this._pendingMessages) {
                    if (socket.readyState == WebSocket.OPEN) {
                        this.listenMessage(socket, message)
                    } else {
                        socket.close()
                    }
                }
                this._pendingMessages = []
                this.off("ready", readyHandler)
            }
            this.on("ready", readyHandler)
        }

        this._pendingMessages.push({ socket, message })
    }

    private listenMessage(socket: WebSocket.WebSocket, message: Uint8Array) {
        if (!this.documentReady) {
            this.pendMessage(socket, message)
            return
        }

        try {
            const encoder = encoding.createEncoder()
            const decoder = decoding.createDecoder(message)
            const messageType = decoding.readVarUint(decoder)

            if (messageType === messageSync) {
                encoding.writeVarUint(encoder, messageSync)
                
                sync.readSyncMessage(decoder, encoder, this, null)
                
                if (encoding.length(encoder) > 1) {
                    this.send(socket, encoding.toUint8Array(encoder))
                }
            } else if (messageType === messageAwareness) {
                this.awareness.applyUpdate(decoding.readVarUint8Array(decoder), socket)
            } else {
                console.error(`Not implemented ${messageType}`)
            }
        } catch (err) {
            console.error(err)
            this.emit('error', [err])
        }
    }

}

