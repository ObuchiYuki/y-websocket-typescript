import WebSocket from 'ws';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols-typescript';
export type PersistenceAdaptor = {
    bindState: (docName: string, ydoc: WSSharedDoc) => Promise<void>;
    writeState: (docName: string, ydoc: WSSharedDoc) => Promise<any>;
};
export type AwarenessUpdate = {
    added: number[];
    updated: number[];
    removed: number[];
};
export type WebSocketHandlerConfig = {
    gc: boolean;
    pingTimeout: number;
};
export type PendingMessage = {
    socket: WebSocket.WebSocket;
    message: Uint8Array;
};
export interface WSSharedDoc {
    on(name: "ready", block: () => void): void;
    on(name: "update", block: (update: Uint8Array) => void): void;
}
export declare class WSSharedDoc extends Y.Doc {
    name: string;
    sockets: Map<WebSocket.WebSocket, Set<number>>;
    awareness: Awareness;
    get documentReady(): boolean;
    set documentReady(value: boolean);
    private _pendingMessages;
    private _documentReady;
    static gc: boolean;
    static pingTimeout: number;
    static documents: Map<string, WSSharedDoc>;
    static persistenceAdaptor: PersistenceAdaptor | null;
    private constructor();
    register(socket: WebSocket): void;
    private setupSync;
    private setupAwareness;
    private setupPingPong;
    static getDocument(documentName: string): WSSharedDoc;
    private send;
    private close;
    private updateHandler;
    /** conn: Origin is the connection that made the change */
    private awarenessChangeHandler;
    private pendMessage;
    private listenMessage;
}
