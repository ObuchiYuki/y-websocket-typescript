import * as Y from 'yjs';
import { Observable } from 'lib0/observable';
import { Awareness } from 'y-protocols-typescript';
import { WebSocket, ErrorEvent, CloseEvent } from "ws";
export type BroadcastSubscriber = (data: ArrayBuffer, origin: any) => void;
export type MessageType = typeof MessageType.sync | typeof MessageType.queryAwareness | typeof MessageType.awareness | typeof MessageType.auth;
export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type Config = {
    connectOnLaunch?: boolean;
    WebSocketClass?: typeof WebSocket;
    resyncInterval?: number;
    maxBackoffTime?: number;
    enableBroadcast?: boolean;
};
export declare module MessageType {
    const sync = 0;
    const queryAwareness = 3;
    const awareness = 1;
    const auth = 2;
    const toString: (type: MessageType) => "sync" | "auth" | "queryAwareness" | "awareness";
}
export interface WebSocketProvider {
    on(name: "synced", func: (synced: boolean) => void): void;
    on(name: "sync", func: (synced: boolean) => void): void;
    on(name: "connection-error", func: (event: ErrorEvent) => void): void;
    on(name: "connection-close", func: (event: CloseEvent) => void): void;
    on(name: "status", func: (status: {
        status: ConnectionStatus;
    }) => void): void;
}
export declare class WebSocketProvider extends Observable<string> {
    url: string;
    roomname: string;
    document: Y.Doc;
    awareness: Awareness;
    webSocketConnected: boolean;
    webSocketConnecting: boolean;
    webSocketUnsuccessfulReconnects: number;
    webSocketLastMessageReceived: number;
    socket: WebSocket | null;
    broadcastChannel: string;
    broadcastConnected: boolean;
    get synced(): boolean;
    set synced(value: boolean);
    private _config;
    private _synced;
    private _shouldConnect;
    private _resyncTimer;
    private _checkTimer;
    private _broadcastSubscriber;
    private _updateHandler;
    private _awarenessUpdateHandler;
    private _unloadHandler;
    constructor({ serverUrl, roomname, params, doc, config }: {
        serverUrl: string;
        roomname: string;
        params?: {
            [Key in string]: string;
        };
        doc: Y.Doc;
        config?: Config;
    });
    destroy(): void;
    disconnect(): void;
    connectWebSocket(): void;
    private readMessage;
    private readMessageSync;
    private readMessageQueryAwareness;
    private readMessageAwareness;
    private readMessageAuth;
    private setupWebsocket;
    private broadcastMessageBoth;
    private connectBroadcast;
    private disconnectBroadcast;
    private makeResyncTimer;
    private makeBroadcastSubscriber;
    private makeUpdateHandler;
    private makeAwarenessHandler;
    private makeUnloadHandler;
    private makeCheckTimer;
}
