import http from 'http'
import { WSSharedDoc } from "./WSSharedDoc"

// ================================================================================================ // 
// MARK: - Type -
type CallbackData = { 
    room: string,
    data: { [Key in string]: { type: string, content: object } } 
}

// ================================================================================================ // 
// MARK: - Const -
const CALLBACK_URL = process.env.CALLBACK_URL ? new URL(process.env.CALLBACK_URL) : null
const CALLBACK_TIMEOUT = parseInt(process.env.CALLBACK_TIMEOUT ?? "") || 5000
const CALLBACK_OBJECTS: { [Key in string]: unknown } = process.env.CALLBACK_OBJECTS ? JSON.parse(process.env.CALLBACK_OBJECTS) : {}

export const isCallbackSet = CALLBACK_URL != null

// ================================================================================================ // 
// MARK: - Handler -

export const callbackHandler = (document: WSSharedDoc) => {
    if (CALLBACK_URL == null) return
    
    const room = document.name
    const dataToSend: CallbackData = { room: room, data: {} }
    
    for (const objectName in CALLBACK_OBJECTS) {
        const objectType = CALLBACK_OBJECTS[objectName]
        if (!isInternalYObjectType(objectType)) continue
        dataToSend.data[objectName] = {
            type: objectType, content: getContent(objectName, objectType, document).toJSON()
        }
    }

    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend)
}

const callbackRequest = (url: URL, timeout: number, data: CallbackData) => {
    const json = JSON.stringify(data)
    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: timeout,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': json.length
        }
    }
    const req = http.request(options)
    req.on('timeout', () => {
        console.warn('Callback request timed out.')
        req.destroy()
    })
    req.on('error', (error) => {
        console.error('Callback request error.', error)
        req.destroy()
    })
    req.write(json)
    req.end()
}

type _InternalYContentType = {
    toJSON(): any
}
type _InternalYObjectType = "Array"|"Map"|"Text"|"XmlFragment"
function isInternalYObjectType(value: unknown): value is _InternalYObjectType {
    if (value === "Array") return true
    if (value === "Map") return true
    if (value === "Text") return true
    if (value === "XmlFragment") return true
    return false
}

const getContent = (objName: string, objType: _InternalYObjectType, document: WSSharedDoc): _InternalYContentType => {
    switch (objType) {
        case 'Array': return document.getArray(objName)
        case 'Map': return document.getMap(objName)
        case 'Text': return document.getText(objName)
        case 'XmlFragment': return document.getXmlFragment(objName)
        // case 'XmlElement': return doc.getXmlElement(objName)
        default : return { toJSON() { return {} } }
    }
}
