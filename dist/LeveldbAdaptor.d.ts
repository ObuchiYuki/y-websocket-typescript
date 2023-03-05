import { LeveldbPersistence } from "y-leveldb";
import { WSSharedDoc, PersistenceAdaptor } from "./WSSharedDoc";
export declare class LeveldbAdaptor implements PersistenceAdaptor {
    path: string;
    leveldb: LeveldbPersistence;
    constructor(path: string);
    bindState(documentName: string, document: WSSharedDoc): Promise<void>;
    writeState(documentName: string, document: WSSharedDoc): Promise<void>;
}
