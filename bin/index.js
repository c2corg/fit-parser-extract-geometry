"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGeometry = void 0;
var debug_1 = __importDefault(require("debug"));
var log = (0, debug_1.default)("fit-parser-extract-geometry");
function assertIsDefined(value) {
    if (value === undefined || value === null) {
        throw new Error('Parse error, expected value to be defined');
    }
}
var invariant = function (value) {
    assertIsDefined(value);
    return value;
};
var isDeveloperFieldDefinition = function (def) {
    return 'isDeveloperField' in def && def.isDeveloperField === true;
};
var isRecordMessage = function (message) { return message.messageType === 'record'; };
var POSITION_SCALE = 180 / Math.pow(2, 31);
var GARMIN_TIME_OFFSET = 631065600000;
var DEVELOPER_DATA_MASK = 32;
var DEFINITION_MESSAGE_MASK = 64;
var LOCAL_MESSAGE_TYPE_MASK = 15;
var COMPRESSED_HEADER_MASK = 128;
var COMPRESSED_TIME_MASK = 31;
var COMPRESSED_LOCAL_MESSAGE_NUMBER_MASK = 96;
var RECORD_GLOBAL_MESSAGE_NUMBER = 20;
var TIMESTAMP_FIELD_DEFINITION_NUMBER = 253;
var LATITUDE_FIELD_DEFINITION_NUMBER = 0;
var LONGITUDE_FIELD_DEFINITION_NUMBER = 1;
var ELEVATION_FIELD_DEFINITION_NUMBER = 2;
var BASE_TYPES = (_a = {},
    _a[0x84] = {
        name: 'uint16',
        invalidValue: 0xffff,
        size: 2,
    },
    _a[0x85] = {
        name: 'sint32',
        invalidValue: 0x7fffffff,
        size: 4,
    },
    _a[0x86] = {
        name: 'uint32',
        invalidValue: 0xffffffff,
        size: 4,
    },
    _a);
var FIT = (function () {
    function FIT() {
        this.timestamp = 0;
        this.lastTimeOffset = 0;
        this.messageTypes = [];
    }
    FIT.prototype.addEndian = function (littleEndian, bytes) {
        var result = 0;
        if (!littleEndian) {
            bytes.reverse();
        }
        for (var i = 0; i < bytes.length; i++) {
            result += (invariant(bytes[i]) << (i << 3)) >>> 0;
        }
        return result;
    };
    FIT.prototype.readData = function (blob, baseType, littleEndian, startIndex) {
        var _a = invariant(BASE_TYPES[baseType]), type = _a.name, size = _a.size;
        var tmp = [];
        for (var i = 0; i < size; i++) {
            tmp.push(invariant(blob[startIndex + i]));
        }
        var buffer = new Uint8Array(tmp).buffer;
        var dataView = new DataView(buffer);
        switch (type) {
            case 'uint16':
                return dataView.getUint16(0, littleEndian);
            case 'sint32':
                return dataView.getInt32(0, littleEndian);
            case 'uint32':
                return dataView.getUint32(0, littleEndian);
        }
        return this.addEndian(littleEndian, tmp);
    };
    FIT.prototype.isInvalidValue = function (data, baseType) {
        var invalidValue = invariant(BASE_TYPES[baseType]).invalidValue;
        return data === invalidValue;
    };
    FIT.prototype.isDefinitionMessage = function (recordHeader) {
        return (recordHeader & DEFINITION_MESSAGE_MASK) === DEFINITION_MESSAGE_MASK;
    };
    FIT.prototype.isCompressedTimestampDataMessage = function (recordHeader) {
        return (recordHeader & COMPRESSED_HEADER_MASK) === COMPRESSED_HEADER_MASK;
    };
    FIT.prototype.hasDeveloperData = function (recordHeader) {
        return (recordHeader & DEVELOPER_DATA_MASK) === DEVELOPER_DATA_MASK;
    };
    FIT.prototype.getFileTypeString = function (blob) {
        var fileTypeString = '';
        for (var i = 8; i < 12; i++) {
            fileTypeString += String.fromCharCode(invariant(blob[i]));
        }
        return fileTypeString;
    };
    FIT.prototype.readTimestamp = function (blob, startIndex, fieldDefinitions) {
        var readDataFromIndex = startIndex + 1;
        for (var i = 0; i < fieldDefinitions.length; i++) {
            var def = invariant(fieldDefinitions[i]);
            if (isDeveloperFieldDefinition(def)) {
                return null;
            }
            var size = def.size, fieldDefinitionNumber = def.fieldDefinitionNumber, littleEndian = def.littleEndian, baseType = def.baseType;
            if (fieldDefinitionNumber === TIMESTAMP_FIELD_DEFINITION_NUMBER) {
                var data = this.readData(blob, baseType, littleEndian, readDataFromIndex);
                if (this.isInvalidValue(data, baseType)) {
                    return null;
                }
                return data;
            }
            readDataFromIndex += size;
        }
        return null;
    };
    FIT.prototype.readDeveloperFieldDefinition = function (blob, startIndex, numberOfFields, fieldIndex) {
        var fieldDefinitionIndex = startIndex + 6 + numberOfFields * 3 + 1 + fieldIndex * 3;
        var size = invariant(blob[fieldDefinitionIndex + 1]);
        return {
            size: size,
            isDeveloperField: true,
        };
    };
    FIT.prototype.readFieldDefinition = function (blob, startIndex, fieldIndex, isLittleEndian) {
        var fieldDefinitionIndex = startIndex + 6 + fieldIndex * 3;
        var fieldDefinitionNumber = invariant(blob[fieldDefinitionIndex]);
        var baseType = invariant(blob[fieldDefinitionIndex + 2]);
        var size = invariant(blob[fieldDefinitionIndex + 1]);
        return {
            baseType: baseType,
            fieldDefinitionNumber: fieldDefinitionNumber,
            size: size,
            littleEndian: isLittleEndian,
        };
    };
    FIT.prototype.readDefinitionMessage = function (blob, startIndex) {
        var _this = this;
        var recordHeader = invariant(blob[startIndex]);
        var hasDeveloperData = this.hasDeveloperData(recordHeader);
        var localMessageType = recordHeader & LOCAL_MESSAGE_TYPE_MASK;
        var isLittleEndian = invariant(blob[startIndex + 2]) === 0;
        var numberOfFields = invariant(blob[startIndex + 5]);
        var numberOfDeveloperDataFields = hasDeveloperData ? invariant(blob[startIndex + 5 + numberOfFields * 3 + 1]) : 0;
        var globalMessageNumber = this.addEndian(isLittleEndian, [
            invariant(blob[startIndex + 3]),
            invariant(blob[startIndex + 4]),
        ]);
        var nextIndex = startIndex + 6 + (numberOfFields + numberOfDeveloperDataFields) * 3 + (hasDeveloperData ? 1 : 0);
        this.messageTypes[localMessageType] = {
            littleEndian: isLittleEndian,
            globalMessageNumber: globalMessageNumber,
            fieldDefinitions: __spreadArray(__spreadArray([], new Array(numberOfFields)
                .fill(undefined)
                .map(function (_, i) { return _this.readFieldDefinition(blob, startIndex, i, isLittleEndian); }), true), new Array(numberOfDeveloperDataFields)
                .fill(undefined)
                .map(function (_, i) { return _this.readDeveloperFieldDefinition(blob, startIndex, numberOfFields, i); }), true),
        };
        return {
            messageType: 'definition',
            nextIndex: nextIndex,
        };
    };
    FIT.prototype.readDataMessage = function (blob, startIndex) {
        var recordHeader = invariant(blob[startIndex]);
        var isCompressedTimestampDataMessage = this.isCompressedTimestampDataMessage(recordHeader);
        var localMessageType = isCompressedTimestampDataMessage
            ? (recordHeader & COMPRESSED_LOCAL_MESSAGE_NUMBER_MASK) >> 5
            : recordHeader & LOCAL_MESSAGE_TYPE_MASK;
        var messageType = this.messageTypes[localMessageType];
        if (!messageType) {
            throw new Error('Missing message definition for local message number');
        }
        var globalMessageNumber = messageType.globalMessageNumber, fieldDefinitions = messageType.fieldDefinitions;
        var messageSize = 0;
        var readDataFromIndex = startIndex + 1;
        var fields = {};
        if (globalMessageNumber !== RECORD_GLOBAL_MESSAGE_NUMBER) {
            var messageSize_1 = fieldDefinitions.reduce(function (total, current) { return total + current.size; }, 0);
            return {
                messageType: 'other',
                nextIndex: startIndex + messageSize_1 + 1,
            };
        }
        if (!isCompressedTimestampDataMessage) {
            var timestamp = this.readTimestamp(blob, startIndex, fieldDefinitions);
            if (timestamp !== null) {
                this.timestamp = timestamp;
                this.lastTimeOffset = this.timestamp & COMPRESSED_TIME_MASK;
            }
        }
        else {
            var timeOffset = recordHeader & COMPRESSED_TIME_MASK;
            this.timestamp += (timeOffset - this.lastTimeOffset) & COMPRESSED_TIME_MASK;
            this.lastTimeOffset = timeOffset;
            fields.timestamp = new Date(this.timestamp * 1000 + GARMIN_TIME_OFFSET);
        }
        for (var i = 0; i < fieldDefinitions.length; i++) {
            var def = invariant(fieldDefinitions[i]);
            if (isDeveloperFieldDefinition(def)) {
                messageSize += def.size;
                readDataFromIndex += def.size;
                continue;
            }
            var size = def.size, fieldDefinitionNumber = def.fieldDefinitionNumber, baseType = def.baseType, littleEndian = def.littleEndian;
            var isFieldOfInterest = [
                TIMESTAMP_FIELD_DEFINITION_NUMBER,
                LONGITUDE_FIELD_DEFINITION_NUMBER,
                LATITUDE_FIELD_DEFINITION_NUMBER,
                ELEVATION_FIELD_DEFINITION_NUMBER,
            ].includes(fieldDefinitionNumber);
            messageSize += size;
            if (!isFieldOfInterest) {
                readDataFromIndex += size;
                continue;
            }
            var data = this.readData(blob, baseType, littleEndian, readDataFromIndex);
            readDataFromIndex += size;
            if (this.isInvalidValue(data, baseType)) {
                continue;
            }
            switch (fieldDefinitionNumber) {
                case TIMESTAMP_FIELD_DEFINITION_NUMBER:
                    fields.timestamp = new Date(data * 1000 + GARMIN_TIME_OFFSET);
                    break;
                case LONGITUDE_FIELD_DEFINITION_NUMBER:
                    fields.longitude = data * POSITION_SCALE;
                    break;
                case LATITUDE_FIELD_DEFINITION_NUMBER:
                    fields.latitude = data * POSITION_SCALE;
                    break;
                case ELEVATION_FIELD_DEFINITION_NUMBER:
                    fields.altitude = data / 5 - 500;
                    this.lastAltitude = fields.altitude;
                    break;
            }
        }
        return {
            messageType: 'record',
            nextIndex: startIndex + messageSize + 1,
            message: fields,
        };
    };
    FIT.prototype.readRecord = function (blob, startIndex) {
        var recordHeader = invariant(blob[startIndex]);
        return this.isDefinitionMessage(recordHeader)
            ? this.readDefinitionMessage(blob, startIndex)
            : this.readDataMessage(blob, startIndex);
    };
    FIT.prototype.extractGeometry = function (blob) {
        var _a, _b, _c;
        if (blob.length < 12) {
            throw new Error('File to small to be a FIT file');
        }
        var headerSize = invariant(blob[0]);
        var dataLength = invariant(blob[4]) + (invariant(blob[5]) << 8) + (invariant(blob[6]) << 16) + (invariant(blob[7]) << 24);
        var fileTypeString = this.getFileTypeString(blob);
        if (headerSize !== 14 && headerSize !== 12) {
            log("Incorrect FIT header size: ".concat(headerSize));
            return [];
        }
        if (fileTypeString !== '.FIT') {
            log("Missing '.FIT' in header");
            return [];
        }
        this.messageTypes = [];
        this.timestamp = 0;
        var geometry = [];
        var loopIndex = headerSize;
        try {
            while (loopIndex < headerSize + dataLength) {
                var msg = this.readRecord(blob, loopIndex);
                loopIndex = msg.nextIndex;
                if (isRecordMessage(msg) && msg.message.longitude && msg.message.latitude) {
                    var time = (_a = msg.message.timestamp) === null || _a === void 0 ? void 0 : _a.getTime();
                    geometry.push([
                        msg.message.longitude,
                        msg.message.latitude,
                        (_c = (_b = msg.message.altitude) !== null && _b !== void 0 ? _b : this.lastAltitude) !== null && _c !== void 0 ? _c : 0,
                        time ? time / 1000 : 0,
                    ]);
                }
            }
        }
        catch (error) {
            log(error);
        }
        var first = geometry[0], second = geometry[1], other = geometry.slice(2);
        if ((first === null || first === void 0 ? void 0 : first[2]) === 0 && (second === null || second === void 0 ? void 0 : second[2]) !== 0) {
            first[2] = invariant(invariant(second)[2]);
            geometry = __spreadArray([first, invariant(second)], other, true);
        }
        return geometry;
    };
    return FIT;
}());
var extractGeometry = function (blob) { return new FIT().extractGeometry(blob); };
exports.extractGeometry = extractGeometry;
//# sourceMappingURL=index.js.map