"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.callbackHandler = exports.isCallbackSet = void 0;
const http_1 = __importDefault(require("http"));
// ================================================================================================ // 
// MARK: - Const -
const CALLBACK_URL = process.env.CALLBACK_URL ? new URL(process.env.CALLBACK_URL) : null;
const CALLBACK_TIMEOUT = parseInt((_a = process.env.CALLBACK_TIMEOUT) !== null && _a !== void 0 ? _a : "") || 5000;
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS ? JSON.parse(process.env.CALLBACK_OBJECTS) : {};
exports.isCallbackSet = CALLBACK_URL != null;
// ================================================================================================ // 
// MARK: - Handler -
const callbackHandler = (document) => {
    if (CALLBACK_URL == null)
        return;
    const room = document.name;
    const dataToSend = { room: room, data: {} };
    for (const objectName in CALLBACK_OBJECTS) {
        const objectType = CALLBACK_OBJECTS[objectName];
        if (!isInternalYObjectType(objectType))
            continue;
        dataToSend.data[objectName] = {
            type: objectType, content: getContent(objectName, objectType, document).toJSON()
        };
    }
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
};
exports.callbackHandler = callbackHandler;
const callbackRequest = (url, timeout, data) => {
    const json = JSON.stringify(data);
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
    };
    const req = http_1.default.request(options);
    req.on('timeout', () => {
        console.warn('Callback request timed out.');
        req.destroy();
    });
    req.on('error', (error) => {
        console.error('Callback request error.', error);
        req.destroy();
    });
    req.write(json);
    req.end();
};
function isInternalYObjectType(value) {
    if (value === "Array")
        return true;
    if (value === "Map")
        return true;
    if (value === "Text")
        return true;
    if (value === "XmlFragment")
        return true;
    return false;
}
const getContent = (objName, objType, document) => {
    switch (objType) {
        case 'Array': return document.getArray(objName);
        case 'Map': return document.getMap(objName);
        case 'Text': return document.getText(objName);
        case 'XmlFragment': return document.getXmlFragment(objName);
        // case 'XmlElement': return doc.getXmlElement(objName)
        default: return { toJSON() { return {}; } };
    }
};
