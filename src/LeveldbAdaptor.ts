import * as Y from 'yjs'
import { LeveldbPersistence } from "y-leveldb"

import { WSSharedDoc, PersistenceAdaptor } from "./WSSharedDoc"

export class LeveldbAdaptor implements PersistenceAdaptor {
    leveldb: LeveldbPersistence

    constructor(public path: string) {
        this.leveldb = new LeveldbPersistence(path)
    }   

    async bindState(documentName: string, document: WSSharedDoc) {
        const persistedDocument = await this.leveldb.getYDoc(documentName)
        const newUpdates = Y.encodeStateAsUpdate(document)
        this.leveldb.storeUpdate(documentName, newUpdates)
        Y.applyUpdate(document, Y.encodeStateAsUpdate(persistedDocument))

        document.on('update', update => {
            this.leveldb.storeUpdate(documentName, update)
        })
    }
    async writeState(documentName: string, document: WSSharedDoc) {

    }
}
