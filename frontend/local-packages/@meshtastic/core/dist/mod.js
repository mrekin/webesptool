import { __commonJS, __export, __toESM } from "./chunk-51aI8Tpl.js";
import crc16ccitt from "crc/calculators/crc16ccitt";

//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/names.js
/**
* Converts snake_case to protoCamelCase according to the convention
* used by protoc to convert a field name to a JSON name.
*/
function protoCamelCase(snakeCase) {
	let capNext = false;
	const b = [];
	for (let i = 0; i < snakeCase.length; i++) {
		let c = snakeCase.charAt(i);
		switch (c) {
			case "_":
				capNext = true;
				break;
			case "0":
			case "1":
			case "2":
			case "3":
			case "4":
			case "5":
			case "6":
			case "7":
			case "8":
			case "9":
				b.push(c);
				capNext = false;
				break;
			default:
				if (capNext) {
					capNext = false;
					c = c.toUpperCase();
				}
				b.push(c);
				break;
		}
	}
	return b.join("");
}
/**
* Names that cannot be used for object properties because they are reserved
* by built-in JavaScript properties.
*/
const reservedObjectProperties = new Set([
	"constructor",
	"toString",
	"toJSON",
	"valueOf"
]);
/**
* Escapes names that are reserved for ECMAScript built-in object properties.
*
* Also see safeIdentifier() from @bufbuild/protoplugin.
*/
function safeObjectProperty(name) {
	return reservedObjectProperties.has(name) ? name + "$" : name;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
/**
* Read a 64 bit varint as two JS numbers.
*
* Returns tuple:
* [0]: low bits
* [1]: high bits
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L175
*/
function varint64read() {
	let lowBits = 0;
	let highBits = 0;
	for (let shift = 0; shift < 28; shift += 7) {
		let b = this.buf[this.pos++];
		lowBits |= (b & 127) << shift;
		if ((b & 128) == 0) {
			this.assertBounds();
			return [lowBits, highBits];
		}
	}
	let middleByte = this.buf[this.pos++];
	lowBits |= (middleByte & 15) << 28;
	highBits = (middleByte & 112) >> 4;
	if ((middleByte & 128) == 0) {
		this.assertBounds();
		return [lowBits, highBits];
	}
	for (let shift = 3; shift <= 31; shift += 7) {
		let b = this.buf[this.pos++];
		highBits |= (b & 127) << shift;
		if ((b & 128) == 0) {
			this.assertBounds();
			return [lowBits, highBits];
		}
	}
	throw new Error("invalid varint");
}
/**
* Write a 64 bit varint, given as two JS numbers, to the given bytes array.
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
*/
function varint64write(lo, hi, bytes) {
	for (let i = 0; i < 28; i = i + 7) {
		const shift = lo >>> i;
		const hasNext = !(shift >>> 7 == 0 && hi == 0);
		const byte = (hasNext ? shift | 128 : shift) & 255;
		bytes.push(byte);
		if (!hasNext) return;
	}
	const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
	const hasMoreBits = !(hi >> 3 == 0);
	bytes.push((hasMoreBits ? splitBits | 128 : splitBits) & 255);
	if (!hasMoreBits) return;
	for (let i = 3; i < 31; i = i + 7) {
		const shift = hi >>> i;
		const hasNext = !(shift >>> 7 == 0);
		const byte = (hasNext ? shift | 128 : shift) & 255;
		bytes.push(byte);
		if (!hasNext) return;
	}
	bytes.push(hi >>> 31 & 1);
}
const TWO_PWR_32_DBL = 4294967296;
/**
* Parse decimal string of 64 bit integer value as two JS numbers.
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
*/
function int64FromString(dec) {
	const minus = dec[0] === "-";
	if (minus) dec = dec.slice(1);
	const base = 1e6;
	let lowBits = 0;
	let highBits = 0;
	function add1e6digit(begin, end) {
		const digit1e6 = Number(dec.slice(begin, end));
		highBits *= base;
		lowBits = lowBits * base + digit1e6;
		if (lowBits >= TWO_PWR_32_DBL) {
			highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
			lowBits = lowBits % TWO_PWR_32_DBL;
		}
	}
	add1e6digit(-24, -18);
	add1e6digit(-18, -12);
	add1e6digit(-12, -6);
	add1e6digit(-6);
	return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
}
/**
* Losslessly converts a 64-bit signed integer in 32:32 split representation
* into a decimal string.
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
*/
function int64ToString(lo, hi) {
	let bits = newBits(lo, hi);
	const negative = bits.hi & 2147483648;
	if (negative) bits = negate(bits.lo, bits.hi);
	const result = uInt64ToString(bits.lo, bits.hi);
	return negative ? "-" + result : result;
}
/**
* Losslessly converts a 64-bit unsigned integer in 32:32 split representation
* into a decimal string.
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf-javascript/blob/a428c58273abad07c66071d9753bc4d1289de426/experimental/runtime/int64.js#L10
*/
function uInt64ToString(lo, hi) {
	({lo, hi} = toUnsigned(lo, hi));
	if (hi <= 2097151) return String(TWO_PWR_32_DBL * hi + lo);
	const low = lo & 16777215;
	const mid = (lo >>> 24 | hi << 8) & 16777215;
	const high = hi >> 16 & 65535;
	let digitA = low + mid * 6777216 + high * 6710656;
	let digitB = mid + high * 8147497;
	let digitC = high * 2;
	const base = 1e7;
	if (digitA >= base) {
		digitB += Math.floor(digitA / base);
		digitA %= base;
	}
	if (digitB >= base) {
		digitC += Math.floor(digitB / base);
		digitB %= base;
	}
	return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
}
function toUnsigned(lo, hi) {
	return {
		lo: lo >>> 0,
		hi: hi >>> 0
	};
}
function newBits(lo, hi) {
	return {
		lo: lo | 0,
		hi: hi | 0
	};
}
/**
* Returns two's compliment negation of input.
* @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Signed_32-bit_integers
*/
function negate(lowBits, highBits) {
	highBits = ~highBits;
	if (lowBits) lowBits = ~lowBits + 1;
	else highBits += 1;
	return newBits(lowBits, highBits);
}
/**
* Returns decimal representation of digit1e7 with leading zeros.
*/
const decimalFrom1e7WithLeadingZeros = (digit1e7) => {
	const partial = String(digit1e7);
	return "0000000".slice(partial.length) + partial;
};
/**
* Write a 32 bit varint, signed or unsigned. Same as `varint64write(0, value, bytes)`
*
* Copyright 2008 Google Inc.  All rights reserved.
*
* See https://github.com/protocolbuffers/protobuf/blob/1b18833f4f2a2f681f4e4a25cdf3b0a43115ec26/js/binary/encoder.js#L144
*/
function varint32write(value, bytes) {
	if (value >= 0) {
		while (value > 127) {
			bytes.push(value & 127 | 128);
			value = value >>> 7;
		}
		bytes.push(value);
	} else {
		for (let i = 0; i < 9; i++) {
			bytes.push(value & 127 | 128);
			value = value >> 7;
		}
		bytes.push(1);
	}
}
/**
* Read an unsigned 32 bit varint.
*
* See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L220
*/
function varint32read() {
	let b = this.buf[this.pos++];
	let result = b & 127;
	if ((b & 128) == 0) {
		this.assertBounds();
		return result;
	}
	b = this.buf[this.pos++];
	result |= (b & 127) << 7;
	if ((b & 128) == 0) {
		this.assertBounds();
		return result;
	}
	b = this.buf[this.pos++];
	result |= (b & 127) << 14;
	if ((b & 128) == 0) {
		this.assertBounds();
		return result;
	}
	b = this.buf[this.pos++];
	result |= (b & 127) << 21;
	if ((b & 128) == 0) {
		this.assertBounds();
		return result;
	}
	b = this.buf[this.pos++];
	result |= (b & 15) << 28;
	for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++) b = this.buf[this.pos++];
	if ((b & 128) != 0) throw new Error("invalid varint");
	this.assertBounds();
	return result >>> 0;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
/**
* Int64Support for the current environment.
*/
const protoInt64 = /* @__PURE__ */ makeInt64Support();
function makeInt64Support() {
	const dv = new DataView(new ArrayBuffer(8));
	const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
	if (ok) {
		const MIN = BigInt("-9223372036854775808");
		const MAX = BigInt("9223372036854775807");
		const UMIN = BigInt("0");
		const UMAX = BigInt("18446744073709551615");
		return {
			zero: BigInt(0),
			supported: true,
			parse(value) {
				const bi = typeof value == "bigint" ? value : BigInt(value);
				if (bi > MAX || bi < MIN) throw new Error(`invalid int64: ${value}`);
				return bi;
			},
			uParse(value) {
				const bi = typeof value == "bigint" ? value : BigInt(value);
				if (bi > UMAX || bi < UMIN) throw new Error(`invalid uint64: ${value}`);
				return bi;
			},
			enc(value) {
				dv.setBigInt64(0, this.parse(value), true);
				return {
					lo: dv.getInt32(0, true),
					hi: dv.getInt32(4, true)
				};
			},
			uEnc(value) {
				dv.setBigInt64(0, this.uParse(value), true);
				return {
					lo: dv.getInt32(0, true),
					hi: dv.getInt32(4, true)
				};
			},
			dec(lo, hi) {
				dv.setInt32(0, lo, true);
				dv.setInt32(4, hi, true);
				return dv.getBigInt64(0, true);
			},
			uDec(lo, hi) {
				dv.setInt32(0, lo, true);
				dv.setInt32(4, hi, true);
				return dv.getBigUint64(0, true);
			}
		};
	}
	return {
		zero: "0",
		supported: false,
		parse(value) {
			if (typeof value != "string") value = value.toString();
			assertInt64String(value);
			return value;
		},
		uParse(value) {
			if (typeof value != "string") value = value.toString();
			assertUInt64String(value);
			return value;
		},
		enc(value) {
			if (typeof value != "string") value = value.toString();
			assertInt64String(value);
			return int64FromString(value);
		},
		uEnc(value) {
			if (typeof value != "string") value = value.toString();
			assertUInt64String(value);
			return int64FromString(value);
		},
		dec(lo, hi) {
			return int64ToString(lo, hi);
		},
		uDec(lo, hi) {
			return uInt64ToString(lo, hi);
		}
	};
}
function assertInt64String(value) {
	if (!/^-?[0-9]+$/.test(value)) throw new Error("invalid int64: " + value);
}
function assertUInt64String(value) {
	if (!/^[0-9]+$/.test(value)) throw new Error("invalid uint64: " + value);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/descriptors.js
/**
* Scalar value types. This is a subset of field types declared by protobuf
* enum google.protobuf.FieldDescriptorProto.Type The types GROUP and MESSAGE
* are omitted, but the numerical values are identical.
*/
var ScalarType;
(function(ScalarType$1) {
	ScalarType$1[ScalarType$1["DOUBLE"] = 1] = "DOUBLE";
	ScalarType$1[ScalarType$1["FLOAT"] = 2] = "FLOAT";
	ScalarType$1[ScalarType$1["INT64"] = 3] = "INT64";
	ScalarType$1[ScalarType$1["UINT64"] = 4] = "UINT64";
	ScalarType$1[ScalarType$1["INT32"] = 5] = "INT32";
	ScalarType$1[ScalarType$1["FIXED64"] = 6] = "FIXED64";
	ScalarType$1[ScalarType$1["FIXED32"] = 7] = "FIXED32";
	ScalarType$1[ScalarType$1["BOOL"] = 8] = "BOOL";
	ScalarType$1[ScalarType$1["STRING"] = 9] = "STRING";
	ScalarType$1[ScalarType$1["BYTES"] = 12] = "BYTES";
	ScalarType$1[ScalarType$1["UINT32"] = 13] = "UINT32";
	ScalarType$1[ScalarType$1["SFIXED32"] = 15] = "SFIXED32";
	ScalarType$1[ScalarType$1["SFIXED64"] = 16] = "SFIXED64";
	ScalarType$1[ScalarType$1["SINT32"] = 17] = "SINT32";
	ScalarType$1[ScalarType$1["SINT64"] = 18] = "SINT64";
})(ScalarType || (ScalarType = {}));

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/scalar.js
/**
* Returns the zero value for the given scalar type.
*/
function scalarZeroValue(type, longAsString) {
	switch (type) {
		case ScalarType.STRING: return "";
		case ScalarType.BOOL: return false;
		case ScalarType.DOUBLE:
		case ScalarType.FLOAT: return 0;
		case ScalarType.INT64:
		case ScalarType.UINT64:
		case ScalarType.SFIXED64:
		case ScalarType.FIXED64:
		case ScalarType.SINT64: return longAsString ? "0" : protoInt64.zero;
		case ScalarType.BYTES: return new Uint8Array(0);
		default: return 0;
	}
}
/**
* Returns true for a zero-value. For example, an integer has the zero-value `0`,
* a boolean is `false`, a string is `""`, and bytes is an empty Uint8Array.
*
* In proto3, zero-values are not written to the wire, unless the field is
* optional or repeated.
*/
function isScalarZeroValue(type, value) {
	switch (type) {
		case ScalarType.BOOL: return value === false;
		case ScalarType.STRING: return value === "";
		case ScalarType.BYTES: return value instanceof Uint8Array && !value.byteLength;
		default: return value == 0;
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/unsafe.js
const IMPLICIT$2 = 2;
const unsafeLocal = Symbol.for("reflect unsafe local");
/**
* Return the selected field of a oneof group.
*
* @private
*/
function unsafeOneofCase(target, oneof) {
	const c = target[oneof.localName].case;
	if (c === void 0) return c;
	return oneof.fields.find((f) => f.localName === c);
}
/**
* Returns true if the field is set.
*
* @private
*/
function unsafeIsSet(target, field) {
	const name = field.localName;
	if (field.oneof) return target[field.oneof.localName].case === name;
	if (field.presence != IMPLICIT$2) return target[name] !== void 0 && Object.prototype.hasOwnProperty.call(target, name);
	switch (field.fieldKind) {
		case "list": return target[name].length > 0;
		case "map": return Object.keys(target[name]).length > 0;
		case "scalar": return !isScalarZeroValue(field.scalar, target[name]);
		case "enum": return target[name] !== field.enum.values[0].number;
	}
	throw new Error("message field with implicit presence");
}
/**
* Returns true if the field is set, but only for singular fields with explicit
* presence (proto2).
*
* @private
*/
function unsafeIsSetExplicit(target, localName) {
	return Object.prototype.hasOwnProperty.call(target, localName) && target[localName] !== void 0;
}
/**
* Return a field value, respecting oneof groups.
*
* @private
*/
function unsafeGet(target, field) {
	if (field.oneof) {
		const oneof = target[field.oneof.localName];
		if (oneof.case === field.localName) return oneof.value;
		return void 0;
	}
	return target[field.localName];
}
/**
* Set a field value, respecting oneof groups.
*
* @private
*/
function unsafeSet(target, field, value) {
	if (field.oneof) target[field.oneof.localName] = {
		case: field.localName,
		value
	};
	else target[field.localName] = value;
}
/**
* Resets the field, so that unsafeIsSet() will return false.
*
* @private
*/
function unsafeClear(target, field) {
	const name = field.localName;
	if (field.oneof) {
		const oneofLocalName = field.oneof.localName;
		if (target[oneofLocalName].case === name) target[oneofLocalName] = { case: void 0 };
	} else if (field.presence != IMPLICIT$2) delete target[name];
	else switch (field.fieldKind) {
		case "map":
			target[name] = {};
			break;
		case "list":
			target[name] = [];
			break;
		case "enum":
			target[name] = field.enum.values[0].number;
			break;
		case "scalar":
			target[name] = scalarZeroValue(field.scalar, field.longAsString);
			break;
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/restore-json-names.js
/**
* @private
*/
function restoreJsonNames(message) {
	for (const f of message.field) if (!unsafeIsSetExplicit(f, "jsonName")) f.jsonName = protoCamelCase(f.name);
	message.nestedType.forEach(restoreJsonNames);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wire/text-format.js
/**
* Parse an enum value from the Protobuf text format.
*
* @private
*/
function parseTextFormatEnumValue(descEnum, value) {
	const enumValue = descEnum.values.find((v) => v.name === value);
	if (!enumValue) throw new Error(`cannot parse ${descEnum} default value: ${value}`);
	return enumValue.number;
}
/**
* Parse a scalar value from the Protobuf text format.
*
* @private
*/
function parseTextFormatScalarValue(type, value) {
	switch (type) {
		case ScalarType.STRING: return value;
		case ScalarType.BYTES: {
			const u = unescapeBytesDefaultValue(value);
			if (u === false) throw new Error(`cannot parse ${ScalarType[type]} default value: ${value}`);
			return u;
		}
		case ScalarType.INT64:
		case ScalarType.SFIXED64:
		case ScalarType.SINT64: return protoInt64.parse(value);
		case ScalarType.UINT64:
		case ScalarType.FIXED64: return protoInt64.uParse(value);
		case ScalarType.DOUBLE:
		case ScalarType.FLOAT: switch (value) {
			case "inf": return Number.POSITIVE_INFINITY;
			case "-inf": return Number.NEGATIVE_INFINITY;
			case "nan": return Number.NaN;
			default: return parseFloat(value);
		}
		case ScalarType.BOOL: return value === "true";
		case ScalarType.INT32:
		case ScalarType.UINT32:
		case ScalarType.SINT32:
		case ScalarType.FIXED32:
		case ScalarType.SFIXED32: return parseInt(value, 10);
	}
}
/**
* Parses a text-encoded default value (proto2) of a BYTES field.
*/
function unescapeBytesDefaultValue(str) {
	const b = [];
	const input = {
		tail: str,
		c: "",
		next() {
			if (this.tail.length == 0) return false;
			this.c = this.tail[0];
			this.tail = this.tail.substring(1);
			return true;
		},
		take(n) {
			if (this.tail.length >= n) {
				const r = this.tail.substring(0, n);
				this.tail = this.tail.substring(n);
				return r;
			}
			return false;
		}
	};
	while (input.next()) switch (input.c) {
		case "\\":
			if (input.next()) switch (input.c) {
				case "\\":
					b.push(input.c.charCodeAt(0));
					break;
				case "b":
					b.push(8);
					break;
				case "f":
					b.push(12);
					break;
				case "n":
					b.push(10);
					break;
				case "r":
					b.push(13);
					break;
				case "t":
					b.push(9);
					break;
				case "v":
					b.push(11);
					break;
				case "0":
				case "1":
				case "2":
				case "3":
				case "4":
				case "5":
				case "6":
				case "7": {
					const s = input.c;
					const t = input.take(2);
					if (t === false) return false;
					const n = parseInt(s + t, 8);
					if (Number.isNaN(n)) return false;
					b.push(n);
					break;
				}
				case "x": {
					const s = input.c;
					const t = input.take(2);
					if (t === false) return false;
					const n = parseInt(s + t, 16);
					if (Number.isNaN(n)) return false;
					b.push(n);
					break;
				}
				case "u": {
					const s = input.c;
					const t = input.take(4);
					if (t === false) return false;
					const n = parseInt(s + t, 16);
					if (Number.isNaN(n)) return false;
					const chunk = new Uint8Array(4);
					const view = new DataView(chunk.buffer);
					view.setInt32(0, n, true);
					b.push(chunk[0], chunk[1], chunk[2], chunk[3]);
					break;
				}
				case "U": {
					const s = input.c;
					const t = input.take(8);
					if (t === false) return false;
					const tc = protoInt64.uEnc(s + t);
					const chunk = new Uint8Array(8);
					const view = new DataView(chunk.buffer);
					view.setInt32(0, tc.lo, true);
					view.setInt32(4, tc.hi, true);
					b.push(chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7]);
					break;
				}
			}
			break;
		default: b.push(input.c.charCodeAt(0));
	}
	return new Uint8Array(b);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/nested-types.js
/**
* Iterate over all types - enumerations, extensions, services, messages -
* and enumerations, extensions and messages nested in messages.
*/
function* nestedTypes(desc) {
	switch (desc.kind) {
		case "file":
			for (const message of desc.messages) {
				yield message;
				yield* nestedTypes(message);
			}
			yield* desc.enums;
			yield* desc.services;
			yield* desc.extensions;
			break;
		case "message":
			for (const message of desc.nestedMessages) {
				yield message;
				yield* nestedTypes(message);
			}
			yield* desc.nestedEnums;
			yield* desc.nestedExtensions;
			break;
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/registry.js
function createFileRegistry(...args) {
	const registry = createBaseRegistry();
	if (!args.length) return registry;
	if ("$typeName" in args[0] && args[0].$typeName == "google.protobuf.FileDescriptorSet") {
		for (const file of args[0].file) addFile(file, registry);
		return registry;
	}
	if ("$typeName" in args[0]) {
		const input = args[0];
		const resolve = args[1];
		const seen = new Set();
		function recurseDeps(file) {
			const deps = [];
			for (const protoFileName of file.dependency) {
				if (registry.getFile(protoFileName) != void 0) continue;
				if (seen.has(protoFileName)) continue;
				const dep = resolve(protoFileName);
				if (!dep) throw new Error(`Unable to resolve ${protoFileName}, imported by ${file.name}`);
				if ("kind" in dep) registry.addFile(dep, false, true);
				else {
					seen.add(dep.name);
					deps.push(dep);
				}
			}
			return deps.concat(...deps.map(recurseDeps));
		}
		for (const file of [input, ...recurseDeps(input)].reverse()) addFile(file, registry);
	} else for (const fileReg of args) for (const file of fileReg.files) registry.addFile(file);
	return registry;
}
/**
* @private
*/
function createBaseRegistry() {
	const types = new Map();
	const extendees = new Map();
	const files = new Map();
	return {
		kind: "registry",
		types,
		extendees,
		[Symbol.iterator]() {
			return types.values();
		},
		get files() {
			return files.values();
		},
		addFile(file, skipTypes, withDeps) {
			files.set(file.proto.name, file);
			if (!skipTypes) for (const type of nestedTypes(file)) this.add(type);
			if (withDeps) for (const f of file.dependencies) this.addFile(f, skipTypes, withDeps);
		},
		add(desc) {
			if (desc.kind == "extension") {
				let numberToExt = extendees.get(desc.extendee.typeName);
				if (!numberToExt) extendees.set(desc.extendee.typeName, numberToExt = new Map());
				numberToExt.set(desc.number, desc);
			}
			types.set(desc.typeName, desc);
		},
		get(typeName) {
			return types.get(typeName);
		},
		getFile(fileName) {
			return files.get(fileName);
		},
		getMessage(typeName) {
			const t = types.get(typeName);
			return (t === null || t === void 0 ? void 0 : t.kind) == "message" ? t : void 0;
		},
		getEnum(typeName) {
			const t = types.get(typeName);
			return (t === null || t === void 0 ? void 0 : t.kind) == "enum" ? t : void 0;
		},
		getExtension(typeName) {
			const t = types.get(typeName);
			return (t === null || t === void 0 ? void 0 : t.kind) == "extension" ? t : void 0;
		},
		getExtensionFor(extendee, no) {
			var _a;
			return (_a = extendees.get(extendee.typeName)) === null || _a === void 0 ? void 0 : _a.get(no);
		},
		getService(typeName) {
			const t = types.get(typeName);
			return (t === null || t === void 0 ? void 0 : t.kind) == "service" ? t : void 0;
		}
	};
}
const EDITION_PROTO2$1 = 998;
const EDITION_PROTO3$1 = 999;
const TYPE_STRING = 9;
const TYPE_GROUP = 10;
const TYPE_MESSAGE = 11;
const TYPE_BYTES = 12;
const TYPE_ENUM = 14;
const LABEL_REPEATED = 3;
const LABEL_REQUIRED = 2;
const JS_STRING = 1;
const IDEMPOTENCY_UNKNOWN = 0;
const EXPLICIT = 1;
const IMPLICIT$1 = 2;
const LEGACY_REQUIRED$1 = 3;
const PACKED = 1;
const DELIMITED = 2;
const OPEN = 1;
const featureDefaults = {
	998: {
		fieldPresence: 1,
		enumType: 2,
		repeatedFieldEncoding: 2,
		utf8Validation: 3,
		messageEncoding: 1,
		jsonFormat: 2,
		enforceNamingStyle: 2,
		defaultSymbolVisibility: 1
	},
	999: {
		fieldPresence: 2,
		enumType: 1,
		repeatedFieldEncoding: 1,
		utf8Validation: 2,
		messageEncoding: 1,
		jsonFormat: 1,
		enforceNamingStyle: 2,
		defaultSymbolVisibility: 1
	},
	1e3: {
		fieldPresence: 1,
		enumType: 1,
		repeatedFieldEncoding: 1,
		utf8Validation: 2,
		messageEncoding: 1,
		jsonFormat: 1,
		enforceNamingStyle: 2,
		defaultSymbolVisibility: 1
	},
	1001: {
		fieldPresence: 1,
		enumType: 1,
		repeatedFieldEncoding: 1,
		utf8Validation: 2,
		messageEncoding: 1,
		jsonFormat: 1,
		enforceNamingStyle: 1,
		defaultSymbolVisibility: 2
	}
};
/**
* Create a descriptor for a file, add it to the registry.
*/
function addFile(proto, reg) {
	var _a, _b;
	const file = {
		kind: "file",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		edition: getFileEdition(proto),
		name: proto.name.replace(/\.proto$/, ""),
		dependencies: findFileDependencies(proto, reg),
		enums: [],
		messages: [],
		extensions: [],
		services: [],
		toString() {
			return `file ${proto.name}`;
		}
	};
	const mapEntriesStore = new Map();
	const mapEntries = {
		get(typeName) {
			return mapEntriesStore.get(typeName);
		},
		add(desc) {
			var _a$1;
			assert(((_a$1 = desc.proto.options) === null || _a$1 === void 0 ? void 0 : _a$1.mapEntry) === true);
			mapEntriesStore.set(desc.typeName, desc);
		}
	};
	for (const enumProto of proto.enumType) addEnum(enumProto, file, void 0, reg);
	for (const messageProto of proto.messageType) addMessage(messageProto, file, void 0, reg, mapEntries);
	for (const serviceProto of proto.service) addService(serviceProto, file, reg);
	addExtensions(file, reg);
	for (const mapEntry of mapEntriesStore.values()) addFields(mapEntry, reg, mapEntries);
	for (const message of file.messages) {
		addFields(message, reg, mapEntries);
		addExtensions(message, reg);
	}
	reg.addFile(file, true);
}
/**
* Create descriptors for extensions, and add them to the message / file,
* and to our cart.
* Recurses into nested types.
*/
function addExtensions(desc, reg) {
	switch (desc.kind) {
		case "file":
			for (const proto of desc.proto.extension) {
				const ext = newField(proto, desc, reg);
				desc.extensions.push(ext);
				reg.add(ext);
			}
			break;
		case "message":
			for (const proto of desc.proto.extension) {
				const ext = newField(proto, desc, reg);
				desc.nestedExtensions.push(ext);
				reg.add(ext);
			}
			for (const message of desc.nestedMessages) addExtensions(message, reg);
			break;
	}
}
/**
* Create descriptors for fields and oneof groups, and add them to the message.
* Recurses into nested types.
*/
function addFields(message, reg, mapEntries) {
	const allOneofs = message.proto.oneofDecl.map((proto) => newOneof(proto, message));
	const oneofsSeen = new Set();
	for (const proto of message.proto.field) {
		const oneof = findOneof(proto, allOneofs);
		const field = newField(proto, message, reg, oneof, mapEntries);
		message.fields.push(field);
		message.field[field.localName] = field;
		if (oneof === void 0) message.members.push(field);
		else {
			oneof.fields.push(field);
			if (!oneofsSeen.has(oneof)) {
				oneofsSeen.add(oneof);
				message.members.push(oneof);
			}
		}
	}
	for (const oneof of allOneofs.filter((o) => oneofsSeen.has(o))) message.oneofs.push(oneof);
	for (const child of message.nestedMessages) addFields(child, reg, mapEntries);
}
/**
* Create a descriptor for an enumeration, and add it our cart and to the
* parent type, if any.
*/
function addEnum(proto, file, parent, reg) {
	var _a, _b, _c, _d, _e;
	const sharedPrefix = findEnumSharedPrefix(proto.name, proto.value);
	const desc = {
		kind: "enum",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		file,
		parent,
		open: true,
		name: proto.name,
		typeName: makeTypeName(proto, parent, file),
		value: {},
		values: [],
		sharedPrefix,
		toString() {
			return `enum ${this.typeName}`;
		}
	};
	desc.open = isEnumOpen(desc);
	reg.add(desc);
	for (const p of proto.value) {
		const name = p.name;
		desc.values.push(desc.value[p.number] = {
			kind: "enum_value",
			proto: p,
			deprecated: (_d = (_c = p.options) === null || _c === void 0 ? void 0 : _c.deprecated) !== null && _d !== void 0 ? _d : false,
			parent: desc,
			name,
			localName: safeObjectProperty(sharedPrefix == void 0 ? name : name.substring(sharedPrefix.length)),
			number: p.number,
			toString() {
				return `enum value ${desc.typeName}.${name}`;
			}
		});
	}
	((_e = parent === null || parent === void 0 ? void 0 : parent.nestedEnums) !== null && _e !== void 0 ? _e : file.enums).push(desc);
}
/**
* Create a descriptor for a message, including nested types, and add it to our
* cart. Note that this does not create descriptors fields.
*/
function addMessage(proto, file, parent, reg, mapEntries) {
	var _a, _b, _c, _d;
	const desc = {
		kind: "message",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		file,
		parent,
		name: proto.name,
		typeName: makeTypeName(proto, parent, file),
		fields: [],
		field: {},
		oneofs: [],
		members: [],
		nestedEnums: [],
		nestedMessages: [],
		nestedExtensions: [],
		toString() {
			return `message ${this.typeName}`;
		}
	};
	if (((_c = proto.options) === null || _c === void 0 ? void 0 : _c.mapEntry) === true) mapEntries.add(desc);
	else {
		((_d = parent === null || parent === void 0 ? void 0 : parent.nestedMessages) !== null && _d !== void 0 ? _d : file.messages).push(desc);
		reg.add(desc);
	}
	for (const enumProto of proto.enumType) addEnum(enumProto, file, desc, reg);
	for (const messageProto of proto.nestedType) addMessage(messageProto, file, desc, reg, mapEntries);
}
/**
* Create a descriptor for a service, including methods, and add it to our
* cart.
*/
function addService(proto, file, reg) {
	var _a, _b;
	const desc = {
		kind: "service",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		file,
		name: proto.name,
		typeName: makeTypeName(proto, void 0, file),
		methods: [],
		method: {},
		toString() {
			return `service ${this.typeName}`;
		}
	};
	file.services.push(desc);
	reg.add(desc);
	for (const methodProto of proto.method) {
		const method = newMethod(methodProto, desc, reg);
		desc.methods.push(method);
		desc.method[method.localName] = method;
	}
}
/**
* Create a descriptor for a method.
*/
function newMethod(proto, parent, reg) {
	var _a, _b, _c, _d;
	let methodKind;
	if (proto.clientStreaming && proto.serverStreaming) methodKind = "bidi_streaming";
	else if (proto.clientStreaming) methodKind = "client_streaming";
	else if (proto.serverStreaming) methodKind = "server_streaming";
	else methodKind = "unary";
	const input = reg.getMessage(trimLeadingDot(proto.inputType));
	const output = reg.getMessage(trimLeadingDot(proto.outputType));
	assert(input, `invalid MethodDescriptorProto: input_type ${proto.inputType} not found`);
	assert(output, `invalid MethodDescriptorProto: output_type ${proto.inputType} not found`);
	const name = proto.name;
	return {
		kind: "rpc",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		parent,
		name,
		localName: safeObjectProperty(name.length ? safeObjectProperty(name[0].toLowerCase() + name.substring(1)) : name),
		methodKind,
		input,
		output,
		idempotency: (_d = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.idempotencyLevel) !== null && _d !== void 0 ? _d : IDEMPOTENCY_UNKNOWN,
		toString() {
			return `rpc ${parent.typeName}.${name}`;
		}
	};
}
/**
* Create a descriptor for a oneof group.
*/
function newOneof(proto, parent) {
	return {
		kind: "oneof",
		proto,
		deprecated: false,
		parent,
		fields: [],
		name: proto.name,
		localName: safeObjectProperty(protoCamelCase(proto.name)),
		toString() {
			return `oneof ${parent.typeName}.${this.name}`;
		}
	};
}
function newField(proto, parentOrFile, reg, oneof, mapEntries) {
	var _a, _b, _c;
	const isExtension = mapEntries === void 0;
	const field = {
		kind: "field",
		proto,
		deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
		name: proto.name,
		number: proto.number,
		scalar: void 0,
		message: void 0,
		enum: void 0,
		presence: getFieldPresence(proto, oneof, isExtension, parentOrFile),
		listKind: void 0,
		mapKind: void 0,
		mapKey: void 0,
		delimitedEncoding: void 0,
		packed: void 0,
		longAsString: false,
		getDefaultValue: void 0
	};
	if (isExtension) {
		const file = parentOrFile.kind == "file" ? parentOrFile : parentOrFile.file;
		const parent = parentOrFile.kind == "file" ? void 0 : parentOrFile;
		const typeName = makeTypeName(proto, parent, file);
		field.kind = "extension";
		field.file = file;
		field.parent = parent;
		field.oneof = void 0;
		field.typeName = typeName;
		field.jsonName = `[${typeName}]`;
		field.toString = () => `extension ${typeName}`;
		const extendee = reg.getMessage(trimLeadingDot(proto.extendee));
		assert(extendee, `invalid FieldDescriptorProto: extendee ${proto.extendee} not found`);
		field.extendee = extendee;
	} else {
		const parent = parentOrFile;
		assert(parent.kind == "message");
		field.parent = parent;
		field.oneof = oneof;
		field.localName = oneof ? protoCamelCase(proto.name) : safeObjectProperty(protoCamelCase(proto.name));
		field.jsonName = proto.jsonName;
		field.toString = () => `field ${parent.typeName}.${proto.name}`;
	}
	const label = proto.label;
	const type = proto.type;
	const jstype = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.jstype;
	if (label === LABEL_REPEATED) {
		const mapEntry = type == TYPE_MESSAGE ? mapEntries === null || mapEntries === void 0 ? void 0 : mapEntries.get(trimLeadingDot(proto.typeName)) : void 0;
		if (mapEntry) {
			field.fieldKind = "map";
			const { key, value } = findMapEntryFields(mapEntry);
			field.mapKey = key.scalar;
			field.mapKind = value.fieldKind;
			field.message = value.message;
			field.delimitedEncoding = false;
			field.enum = value.enum;
			field.scalar = value.scalar;
			return field;
		}
		field.fieldKind = "list";
		switch (type) {
			case TYPE_MESSAGE:
			case TYPE_GROUP:
				field.listKind = "message";
				field.message = reg.getMessage(trimLeadingDot(proto.typeName));
				assert(field.message);
				field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
				break;
			case TYPE_ENUM:
				field.listKind = "enum";
				field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
				assert(field.enum);
				break;
			default:
				field.listKind = "scalar";
				field.scalar = type;
				field.longAsString = jstype == JS_STRING;
				break;
		}
		field.packed = isPackedField(proto, parentOrFile);
		return field;
	}
	switch (type) {
		case TYPE_MESSAGE:
		case TYPE_GROUP:
			field.fieldKind = "message";
			field.message = reg.getMessage(trimLeadingDot(proto.typeName));
			assert(field.message, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
			field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
			field.getDefaultValue = () => void 0;
			break;
		case TYPE_ENUM: {
			const enumeration = reg.getEnum(trimLeadingDot(proto.typeName));
			assert(enumeration !== void 0, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
			field.fieldKind = "enum";
			field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
			field.getDefaultValue = () => {
				return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatEnumValue(enumeration, proto.defaultValue) : void 0;
			};
			break;
		}
		default: {
			field.fieldKind = "scalar";
			field.scalar = type;
			field.longAsString = jstype == JS_STRING;
			field.getDefaultValue = () => {
				return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatScalarValue(type, proto.defaultValue) : void 0;
			};
			break;
		}
	}
	return field;
}
/**
* Parse the "syntax" and "edition" fields, returning one of the supported
* editions.
*/
function getFileEdition(proto) {
	switch (proto.syntax) {
		case "":
		case "proto2": return EDITION_PROTO2$1;
		case "proto3": return EDITION_PROTO3$1;
		case "editions":
			if (proto.edition in featureDefaults) return proto.edition;
			throw new Error(`${proto.name}: unsupported edition`);
		default: throw new Error(`${proto.name}: unsupported syntax "${proto.syntax}"`);
	}
}
/**
* Resolve dependencies of FileDescriptorProto to DescFile.
*/
function findFileDependencies(proto, reg) {
	return proto.dependency.map((wantName) => {
		const dep = reg.getFile(wantName);
		if (!dep) throw new Error(`Cannot find ${wantName}, imported by ${proto.name}`);
		return dep;
	});
}
/**
* Finds a prefix shared by enum values, for example `my_enum_` for
* `enum MyEnum {MY_ENUM_A=0; MY_ENUM_B=1;}`.
*/
function findEnumSharedPrefix(enumName, values) {
	const prefix = camelToSnakeCase(enumName) + "_";
	for (const value of values) {
		if (!value.name.toLowerCase().startsWith(prefix)) return void 0;
		const shortName = value.name.substring(prefix.length);
		if (shortName.length == 0) return void 0;
		if (/^\d/.test(shortName)) return void 0;
	}
	return prefix;
}
/**
* Converts lowerCamelCase or UpperCamelCase into lower_snake_case.
* This is used to find shared prefixes in an enum.
*/
function camelToSnakeCase(camel) {
	return (camel.substring(0, 1) + camel.substring(1).replace(/[A-Z]/g, (c) => "_" + c)).toLowerCase();
}
/**
* Create a fully qualified name for a protobuf type or extension field.
*
* The fully qualified name for messages, enumerations, and services is
* constructed by concatenating the package name (if present), parent
* message names (for nested types), and the type name. We omit the leading
* dot added by protobuf compilers. Examples:
* - mypackage.MyMessage
* - mypackage.MyMessage.NestedMessage
*
* The fully qualified name for extension fields is constructed by
* concatenating the package name (if present), parent message names (for
* extensions declared within a message), and the field name. Examples:
* - mypackage.extfield
* - mypackage.MyMessage.extfield
*/
function makeTypeName(proto, parent, file) {
	let typeName;
	if (parent) typeName = `${parent.typeName}.${proto.name}`;
	else if (file.proto.package.length > 0) typeName = `${file.proto.package}.${proto.name}`;
	else typeName = `${proto.name}`;
	return typeName;
}
/**
* Remove the leading dot from a fully qualified type name.
*/
function trimLeadingDot(typeName) {
	return typeName.startsWith(".") ? typeName.substring(1) : typeName;
}
/**
* Did the user put the field in a oneof group?
* Synthetic oneofs for proto3 optionals are ignored.
*/
function findOneof(proto, allOneofs) {
	if (!unsafeIsSetExplicit(proto, "oneofIndex")) return void 0;
	if (proto.proto3Optional) return void 0;
	const oneof = allOneofs[proto.oneofIndex];
	assert(oneof, `invalid FieldDescriptorProto: oneof #${proto.oneofIndex} for field #${proto.number} not found`);
	return oneof;
}
/**
* Presence of the field.
* See https://protobuf.dev/programming-guides/field_presence/
*/
function getFieldPresence(proto, oneof, isExtension, parent) {
	if (proto.label == LABEL_REQUIRED) return LEGACY_REQUIRED$1;
	if (proto.label == LABEL_REPEATED) return IMPLICIT$1;
	if (!!oneof || proto.proto3Optional) return EXPLICIT;
	if (isExtension) return EXPLICIT;
	const resolved = resolveFeature("fieldPresence", {
		proto,
		parent
	});
	if (resolved == IMPLICIT$1 && (proto.type == TYPE_MESSAGE || proto.type == TYPE_GROUP)) return EXPLICIT;
	return resolved;
}
/**
* Pack this repeated field?
*/
function isPackedField(proto, parent) {
	if (proto.label != LABEL_REPEATED) return false;
	switch (proto.type) {
		case TYPE_STRING:
		case TYPE_BYTES:
		case TYPE_GROUP:
		case TYPE_MESSAGE: return false;
	}
	const o = proto.options;
	if (o && unsafeIsSetExplicit(o, "packed")) return o.packed;
	return PACKED == resolveFeature("repeatedFieldEncoding", {
		proto,
		parent
	});
}
/**
* Find the key and value fields of a synthetic map entry message.
*/
function findMapEntryFields(mapEntry) {
	const key = mapEntry.fields.find((f) => f.number === 1);
	const value = mapEntry.fields.find((f) => f.number === 2);
	assert(key && key.fieldKind == "scalar" && key.scalar != ScalarType.BYTES && key.scalar != ScalarType.FLOAT && key.scalar != ScalarType.DOUBLE && value && value.fieldKind != "list" && value.fieldKind != "map");
	return {
		key,
		value
	};
}
/**
* Enumerations can be open or closed.
* See https://protobuf.dev/programming-guides/enum/
*/
function isEnumOpen(desc) {
	var _a;
	return OPEN == resolveFeature("enumType", {
		proto: desc.proto,
		parent: (_a = desc.parent) !== null && _a !== void 0 ? _a : desc.file
	});
}
/**
* Encode the message delimited (a.k.a. proto2 group encoding), or
* length-prefixed?
*/
function isDelimitedEncoding(proto, parent) {
	if (proto.type == TYPE_GROUP) return true;
	return DELIMITED == resolveFeature("messageEncoding", {
		proto,
		parent
	});
}
function resolveFeature(name, ref) {
	var _a, _b;
	const featureSet = (_a = ref.proto.options) === null || _a === void 0 ? void 0 : _a.features;
	if (featureSet) {
		const val = featureSet[name];
		if (val != 0) return val;
	}
	if ("kind" in ref) {
		if (ref.kind == "message") return resolveFeature(name, (_b = ref.parent) !== null && _b !== void 0 ? _b : ref.file);
		const editionDefaults = featureDefaults[ref.edition];
		if (!editionDefaults) throw new Error(`feature default for edition ${ref.edition} not found`);
		return editionDefaults[name];
	}
	return resolveFeature(name, ref.parent);
}
/**
* Assert that condition is truthy or throw error (with message)
*/
function assert(condition, msg) {
	if (!condition) throw new Error(msg);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/boot.js
/**
* Hydrate a file descriptor for google/protobuf/descriptor.proto from a plain
* object.
*
* See createFileDescriptorProtoBoot() for details.
*
* @private
*/
function boot(boot$1) {
	const root = bootFileDescriptorProto(boot$1);
	root.messageType.forEach(restoreJsonNames);
	const reg = createFileRegistry(root, () => void 0);
	return reg.getFile(root.name);
}
/**
* Creates the message google.protobuf.FileDescriptorProto from an object literal.
*
* See createFileDescriptorProtoBoot() for details.
*
* @private
*/
function bootFileDescriptorProto(init) {
	const proto = Object.create({
		syntax: "",
		edition: 0
	});
	return Object.assign(proto, Object.assign(Object.assign({
		$typeName: "google.protobuf.FileDescriptorProto",
		dependency: [],
		publicDependency: [],
		weakDependency: [],
		optionDependency: [],
		service: [],
		extension: []
	}, init), {
		messageType: init.messageType.map(bootDescriptorProto),
		enumType: init.enumType.map(bootEnumDescriptorProto)
	}));
}
function bootDescriptorProto(init) {
	var _a, _b, _c, _d, _e, _f, _g, _h;
	const proto = Object.create({ visibility: 0 });
	return Object.assign(proto, {
		$typeName: "google.protobuf.DescriptorProto",
		name: init.name,
		field: (_b = (_a = init.field) === null || _a === void 0 ? void 0 : _a.map(bootFieldDescriptorProto)) !== null && _b !== void 0 ? _b : [],
		extension: [],
		nestedType: (_d = (_c = init.nestedType) === null || _c === void 0 ? void 0 : _c.map(bootDescriptorProto)) !== null && _d !== void 0 ? _d : [],
		enumType: (_f = (_e = init.enumType) === null || _e === void 0 ? void 0 : _e.map(bootEnumDescriptorProto)) !== null && _f !== void 0 ? _f : [],
		extensionRange: (_h = (_g = init.extensionRange) === null || _g === void 0 ? void 0 : _g.map((e) => Object.assign({ $typeName: "google.protobuf.DescriptorProto.ExtensionRange" }, e))) !== null && _h !== void 0 ? _h : [],
		oneofDecl: [],
		reservedRange: [],
		reservedName: []
	});
}
function bootFieldDescriptorProto(init) {
	const proto = Object.create({
		label: 1,
		typeName: "",
		extendee: "",
		defaultValue: "",
		oneofIndex: 0,
		jsonName: "",
		proto3Optional: false
	});
	return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldDescriptorProto" }, init), { options: init.options ? bootFieldOptions(init.options) : void 0 }));
}
function bootFieldOptions(init) {
	var _a, _b, _c;
	const proto = Object.create({
		ctype: 0,
		packed: false,
		jstype: 0,
		lazy: false,
		unverifiedLazy: false,
		deprecated: false,
		weak: false,
		debugRedact: false,
		retention: 0
	});
	return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldOptions" }, init), {
		targets: (_a = init.targets) !== null && _a !== void 0 ? _a : [],
		editionDefaults: (_c = (_b = init.editionDefaults) === null || _b === void 0 ? void 0 : _b.map((e) => Object.assign({ $typeName: "google.protobuf.FieldOptions.EditionDefault" }, e))) !== null && _c !== void 0 ? _c : [],
		uninterpretedOption: []
	}));
}
function bootEnumDescriptorProto(init) {
	const proto = Object.create({ visibility: 0 });
	return Object.assign(proto, {
		$typeName: "google.protobuf.EnumDescriptorProto",
		name: init.name,
		reservedName: [],
		reservedRange: [],
		value: init.value.map((e) => Object.assign({ $typeName: "google.protobuf.EnumValueDescriptorProto" }, e))
	});
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wire/base64-encoding.js
/**
* Decodes a base64 string to a byte array.
*
* - ignores white-space, including line breaks and tabs
* - allows inner padding (can decode concatenated base64 strings)
* - does not require padding
* - understands base64url encoding:
*   "-" instead of "+",
*   "_" instead of "/",
*   no padding
*/
function base64Decode(base64Str) {
	const table = getDecodeTable();
	let es = base64Str.length * 3 / 4;
	if (base64Str[base64Str.length - 2] == "=") es -= 2;
	else if (base64Str[base64Str.length - 1] == "=") es -= 1;
	let bytes = new Uint8Array(es), bytePos = 0, groupPos = 0, b, p = 0;
	for (let i = 0; i < base64Str.length; i++) {
		b = table[base64Str.charCodeAt(i)];
		if (b === void 0) switch (base64Str[i]) {
			case "=": groupPos = 0;
			case "\n":
			case "\r":
			case "	":
			case " ": continue;
			default: throw Error("invalid base64 string");
		}
		switch (groupPos) {
			case 0:
				p = b;
				groupPos = 1;
				break;
			case 1:
				bytes[bytePos++] = p << 2 | (b & 48) >> 4;
				p = b;
				groupPos = 2;
				break;
			case 2:
				bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
				p = b;
				groupPos = 3;
				break;
			case 3:
				bytes[bytePos++] = (p & 3) << 6 | b;
				groupPos = 0;
				break;
		}
	}
	if (groupPos == 1) throw Error("invalid base64 string");
	return bytes.subarray(0, bytePos);
}
let encodeTableStd;
let encodeTableUrl;
let decodeTable;
function getEncodeTable(encoding) {
	if (!encodeTableStd) {
		encodeTableStd = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
		encodeTableUrl = encodeTableStd.slice(0, -2).concat("-", "_");
	}
	return encoding == "url" ? encodeTableUrl : encodeTableStd;
}
function getDecodeTable() {
	if (!decodeTable) {
		decodeTable = [];
		const encodeTable = getEncodeTable("std");
		for (let i = 0; i < encodeTable.length; i++) decodeTable[encodeTable[i].charCodeAt(0)] = i;
		decodeTable["-".charCodeAt(0)] = encodeTable.indexOf("+");
		decodeTable["_".charCodeAt(0)] = encodeTable.indexOf("/");
	}
	return decodeTable;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/is-message.js
/**
* Determine whether the given `arg` is a message.
* If `desc` is set, determine whether `arg` is this specific message.
*/
function isMessage(arg, schema) {
	const isMessage$1 = arg !== null && typeof arg == "object" && "$typeName" in arg && typeof arg.$typeName == "string";
	if (!isMessage$1) return false;
	if (schema === void 0) return true;
	return schema.typeName === arg.$typeName;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/error.js
var FieldError = class extends Error {
	constructor(fieldOrOneof, message, name = "FieldValueInvalidError") {
		super(message);
		this.name = name;
		this.field = () => fieldOrOneof;
	}
};

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/guard.js
function isObject$1(arg) {
	return arg !== null && typeof arg == "object" && !Array.isArray(arg);
}
function isReflectList(arg, field) {
	var _a, _b, _c, _d;
	if (isObject$1(arg) && unsafeLocal in arg && "add" in arg && "field" in arg && typeof arg.field == "function") {
		if (field !== void 0) {
			const a = field;
			const b = arg.field();
			return a.listKind == b.listKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
		}
		return true;
	}
	return false;
}
function isReflectMap(arg, field) {
	var _a, _b, _c, _d;
	if (isObject$1(arg) && unsafeLocal in arg && "has" in arg && "field" in arg && typeof arg.field == "function") {
		if (field !== void 0) {
			const a = field, b = arg.field();
			return a.mapKey === b.mapKey && a.mapKind == b.mapKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
		}
		return true;
	}
	return false;
}
function isReflectMessage(arg, messageDesc$1) {
	return isObject$1(arg) && unsafeLocal in arg && "desc" in arg && isObject$1(arg.desc) && arg.desc.kind === "message" && (messageDesc$1 === void 0 || arg.desc.typeName == messageDesc$1.typeName);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
const symbol = Symbol.for("@bufbuild/protobuf/text-encoding");
function getTextEncoding() {
	if (globalThis[symbol] == void 0) {
		const te = new globalThis.TextEncoder();
		const td = new globalThis.TextDecoder();
		globalThis[symbol] = {
			encodeUtf8(text) {
				return te.encode(text);
			},
			decodeUtf8(bytes) {
				return td.decode(bytes);
			},
			checkUtf8(text) {
				try {
					encodeURIComponent(text);
					return true;
				} catch (_) {
					return false;
				}
			}
		};
	}
	return globalThis[symbol];
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
/**
* Protobuf binary format wire types.
*
* A wire type provides just enough information to find the length of the
* following value.
*
* See https://developers.google.com/protocol-buffers/docs/encoding#structure
*/
var WireType;
(function(WireType$1) {
	/**
	* Used for int32, int64, uint32, uint64, sint32, sint64, bool, enum
	*/
	WireType$1[WireType$1["Varint"] = 0] = "Varint";
	/**
	* Used for fixed64, sfixed64, double.
	* Always 8 bytes with little-endian byte order.
	*/
	WireType$1[WireType$1["Bit64"] = 1] = "Bit64";
	/**
	* Used for string, bytes, embedded messages, packed repeated fields
	*
	* Only repeated numeric types (types which use the varint, 32-bit,
	* or 64-bit wire types) can be packed. In proto3, such fields are
	* packed by default.
	*/
	WireType$1[WireType$1["LengthDelimited"] = 2] = "LengthDelimited";
	/**
	* Start of a tag-delimited aggregate, such as a proto2 group, or a message
	* in editions with message_encoding = DELIMITED.
	*/
	WireType$1[WireType$1["StartGroup"] = 3] = "StartGroup";
	/**
	* End of a tag-delimited aggregate.
	*/
	WireType$1[WireType$1["EndGroup"] = 4] = "EndGroup";
	/**
	* Used for fixed32, sfixed32, float.
	* Always 4 bytes with little-endian byte order.
	*/
	WireType$1[WireType$1["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));
/**
* Maximum value for a 32-bit floating point value (Protobuf FLOAT).
*/
const FLOAT32_MAX = 34028234663852886e22;
/**
* Minimum value for a 32-bit floating point value (Protobuf FLOAT).
*/
const FLOAT32_MIN = -34028234663852886e22;
/**
* Maximum value for an unsigned 32-bit integer (Protobuf UINT32, FIXED32).
*/
const UINT32_MAX = 4294967295;
/**
* Maximum value for a signed 32-bit integer (Protobuf INT32, SFIXED32, SINT32).
*/
const INT32_MAX = 2147483647;
/**
* Minimum value for a signed 32-bit integer (Protobuf INT32, SFIXED32, SINT32).
*/
const INT32_MIN = -2147483648;
var BinaryWriter = class {
	constructor(encodeUtf8 = getTextEncoding().encodeUtf8) {
		this.encodeUtf8 = encodeUtf8;
		/**
		* Previous fork states.
		*/
		this.stack = [];
		this.chunks = [];
		this.buf = [];
	}
	/**
	* Return all bytes written and reset this writer.
	*/
	finish() {
		if (this.buf.length) {
			this.chunks.push(new Uint8Array(this.buf));
			this.buf = [];
		}
		let len = 0;
		for (let i = 0; i < this.chunks.length; i++) len += this.chunks[i].length;
		let bytes = new Uint8Array(len);
		let offset = 0;
		for (let i = 0; i < this.chunks.length; i++) {
			bytes.set(this.chunks[i], offset);
			offset += this.chunks[i].length;
		}
		this.chunks = [];
		return bytes;
	}
	/**
	* Start a new fork for length-delimited data like a message
	* or a packed repeated field.
	*
	* Must be joined later with `join()`.
	*/
	fork() {
		this.stack.push({
			chunks: this.chunks,
			buf: this.buf
		});
		this.chunks = [];
		this.buf = [];
		return this;
	}
	/**
	* Join the last fork. Write its length and bytes, then
	* return to the previous state.
	*/
	join() {
		let chunk = this.finish();
		let prev = this.stack.pop();
		if (!prev) throw new Error("invalid state, fork stack empty");
		this.chunks = prev.chunks;
		this.buf = prev.buf;
		this.uint32(chunk.byteLength);
		return this.raw(chunk);
	}
	/**
	* Writes a tag (field number and wire type).
	*
	* Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
	*
	* Generated code should compute the tag ahead of time and call `uint32()`.
	*/
	tag(fieldNo, type) {
		return this.uint32((fieldNo << 3 | type) >>> 0);
	}
	/**
	* Write a chunk of raw bytes.
	*/
	raw(chunk) {
		if (this.buf.length) {
			this.chunks.push(new Uint8Array(this.buf));
			this.buf = [];
		}
		this.chunks.push(chunk);
		return this;
	}
	/**
	* Write a `uint32` value, an unsigned 32 bit varint.
	*/
	uint32(value) {
		assertUInt32(value);
		while (value > 127) {
			this.buf.push(value & 127 | 128);
			value = value >>> 7;
		}
		this.buf.push(value);
		return this;
	}
	/**
	* Write a `int32` value, a signed 32 bit varint.
	*/
	int32(value) {
		assertInt32(value);
		varint32write(value, this.buf);
		return this;
	}
	/**
	* Write a `bool` value, a variant.
	*/
	bool(value) {
		this.buf.push(value ? 1 : 0);
		return this;
	}
	/**
	* Write a `bytes` value, length-delimited arbitrary data.
	*/
	bytes(value) {
		this.uint32(value.byteLength);
		return this.raw(value);
	}
	/**
	* Write a `string` value, length-delimited data converted to UTF-8 text.
	*/
	string(value) {
		let chunk = this.encodeUtf8(value);
		this.uint32(chunk.byteLength);
		return this.raw(chunk);
	}
	/**
	* Write a `float` value, 32-bit floating point number.
	*/
	float(value) {
		assertFloat32(value);
		let chunk = new Uint8Array(4);
		new DataView(chunk.buffer).setFloat32(0, value, true);
		return this.raw(chunk);
	}
	/**
	* Write a `double` value, a 64-bit floating point number.
	*/
	double(value) {
		let chunk = new Uint8Array(8);
		new DataView(chunk.buffer).setFloat64(0, value, true);
		return this.raw(chunk);
	}
	/**
	* Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
	*/
	fixed32(value) {
		assertUInt32(value);
		let chunk = new Uint8Array(4);
		new DataView(chunk.buffer).setUint32(0, value, true);
		return this.raw(chunk);
	}
	/**
	* Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
	*/
	sfixed32(value) {
		assertInt32(value);
		let chunk = new Uint8Array(4);
		new DataView(chunk.buffer).setInt32(0, value, true);
		return this.raw(chunk);
	}
	/**
	* Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
	*/
	sint32(value) {
		assertInt32(value);
		value = (value << 1 ^ value >> 31) >>> 0;
		varint32write(value, this.buf);
		return this;
	}
	/**
	* Write a `fixed64` value, a signed, fixed-length 64-bit integer.
	*/
	sfixed64(value) {
		let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.enc(value);
		view.setInt32(0, tc.lo, true);
		view.setInt32(4, tc.hi, true);
		return this.raw(chunk);
	}
	/**
	* Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
	*/
	fixed64(value) {
		let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.uEnc(value);
		view.setInt32(0, tc.lo, true);
		view.setInt32(4, tc.hi, true);
		return this.raw(chunk);
	}
	/**
	* Write a `int64` value, a signed 64-bit varint.
	*/
	int64(value) {
		let tc = protoInt64.enc(value);
		varint64write(tc.lo, tc.hi, this.buf);
		return this;
	}
	/**
	* Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
	*/
	sint64(value) {
		const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
		varint64write(lo, hi, this.buf);
		return this;
	}
	/**
	* Write a `uint64` value, an unsigned 64-bit varint.
	*/
	uint64(value) {
		const tc = protoInt64.uEnc(value);
		varint64write(tc.lo, tc.hi, this.buf);
		return this;
	}
};
var BinaryReader = class {
	constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
		this.decodeUtf8 = decodeUtf8;
		this.varint64 = varint64read;
		/**
		* Read a `uint32` field, an unsigned 32 bit varint.
		*/
		this.uint32 = varint32read;
		this.buf = buf;
		this.len = buf.length;
		this.pos = 0;
		this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	}
	/**
	* Reads a tag - field number and wire type.
	*/
	tag() {
		let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
		if (fieldNo <= 0 || wireType < 0 || wireType > 5) throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
		return [fieldNo, wireType];
	}
	/**
	* Skip one element and return the skipped data.
	*
	* When skipping StartGroup, provide the tags field number to check for
	* matching field number in the EndGroup tag.
	*/
	skip(wireType, fieldNo) {
		let start = this.pos;
		switch (wireType) {
			case WireType.Varint:
				while (this.buf[this.pos++] & 128);
				break;
			case WireType.Bit64: this.pos += 4;
			case WireType.Bit32:
				this.pos += 4;
				break;
			case WireType.LengthDelimited:
				let len = this.uint32();
				this.pos += len;
				break;
			case WireType.StartGroup:
				for (;;) {
					const [fn, wt] = this.tag();
					if (wt === WireType.EndGroup) {
						if (fieldNo !== void 0 && fn !== fieldNo) throw new Error("invalid end group tag");
						break;
					}
					this.skip(wt, fn);
				}
				break;
			default: throw new Error("cant skip wire type " + wireType);
		}
		this.assertBounds();
		return this.buf.subarray(start, this.pos);
	}
	/**
	* Throws error if position in byte array is out of range.
	*/
	assertBounds() {
		if (this.pos > this.len) throw new RangeError("premature EOF");
	}
	/**
	* Read a `int32` field, a signed 32 bit varint.
	*/
	int32() {
		return this.uint32() | 0;
	}
	/**
	* Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
	*/
	sint32() {
		let zze = this.uint32();
		return zze >>> 1 ^ -(zze & 1);
	}
	/**
	* Read a `int64` field, a signed 64-bit varint.
	*/
	int64() {
		return protoInt64.dec(...this.varint64());
	}
	/**
	* Read a `uint64` field, an unsigned 64-bit varint.
	*/
	uint64() {
		return protoInt64.uDec(...this.varint64());
	}
	/**
	* Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
	*/
	sint64() {
		let [lo, hi] = this.varint64();
		let s = -(lo & 1);
		lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
		hi = hi >>> 1 ^ s;
		return protoInt64.dec(lo, hi);
	}
	/**
	* Read a `bool` field, a variant.
	*/
	bool() {
		let [lo, hi] = this.varint64();
		return lo !== 0 || hi !== 0;
	}
	/**
	* Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
	*/
	fixed32() {
		return this.view.getUint32((this.pos += 4) - 4, true);
	}
	/**
	* Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
	*/
	sfixed32() {
		return this.view.getInt32((this.pos += 4) - 4, true);
	}
	/**
	* Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
	*/
	fixed64() {
		return protoInt64.uDec(this.sfixed32(), this.sfixed32());
	}
	/**
	* Read a `fixed64` field, a signed, fixed-length 64-bit integer.
	*/
	sfixed64() {
		return protoInt64.dec(this.sfixed32(), this.sfixed32());
	}
	/**
	* Read a `float` field, 32-bit floating point number.
	*/
	float() {
		return this.view.getFloat32((this.pos += 4) - 4, true);
	}
	/**
	* Read a `double` field, a 64-bit floating point number.
	*/
	double() {
		return this.view.getFloat64((this.pos += 8) - 8, true);
	}
	/**
	* Read a `bytes` field, length-delimited arbitrary data.
	*/
	bytes() {
		let len = this.uint32(), start = this.pos;
		this.pos += len;
		this.assertBounds();
		return this.buf.subarray(start, start + len);
	}
	/**
	* Read a `string` field, length-delimited data converted to UTF-8 text.
	*/
	string() {
		return this.decodeUtf8(this.bytes());
	}
};
/**
* Assert a valid signed protobuf 32-bit integer as a number or string.
*/
function assertInt32(arg) {
	if (typeof arg == "string") arg = Number(arg);
	else if (typeof arg != "number") throw new Error("invalid int32: " + typeof arg);
	if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN) throw new Error("invalid int32: " + arg);
}
/**
* Assert a valid unsigned protobuf 32-bit integer as a number or string.
*/
function assertUInt32(arg) {
	if (typeof arg == "string") arg = Number(arg);
	else if (typeof arg != "number") throw new Error("invalid uint32: " + typeof arg);
	if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0) throw new Error("invalid uint32: " + arg);
}
/**
* Assert a valid protobuf float value as a number or string.
*/
function assertFloat32(arg) {
	if (typeof arg == "string") {
		const o = arg;
		arg = Number(arg);
		if (Number.isNaN(arg) && o !== "NaN") throw new Error("invalid float32: " + o);
	} else if (typeof arg != "number") throw new Error("invalid float32: " + typeof arg);
	if (Number.isFinite(arg) && (arg > FLOAT32_MAX || arg < FLOAT32_MIN)) throw new Error("invalid float32: " + arg);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect-check.js
/**
* Check whether the given field value is valid for the reflect API.
*/
function checkField(field, value) {
	const check = field.fieldKind == "list" ? isReflectList(value, field) : field.fieldKind == "map" ? isReflectMap(value, field) : checkSingular(field, value);
	if (check === true) return void 0;
	let reason;
	switch (field.fieldKind) {
		case "list":
			reason = `expected ${formatReflectList(field)}, got ${formatVal(value)}`;
			break;
		case "map":
			reason = `expected ${formatReflectMap(field)}, got ${formatVal(value)}`;
			break;
		default: reason = reasonSingular(field, value, check);
	}
	return new FieldError(field, reason);
}
/**
* Check whether the given list item is valid for the reflect API.
*/
function checkListItem(field, index, value) {
	const check = checkSingular(field, value);
	if (check !== true) return new FieldError(field, `list item #${index + 1}: ${reasonSingular(field, value, check)}`);
	return void 0;
}
/**
* Check whether the given map key and value are valid for the reflect API.
*/
function checkMapEntry(field, key, value) {
	const checkKey = checkScalarValue(key, field.mapKey);
	if (checkKey !== true) return new FieldError(field, `invalid map key: ${reasonSingular({ scalar: field.mapKey }, key, checkKey)}`);
	const checkVal = checkSingular(field, value);
	if (checkVal !== true) return new FieldError(field, `map entry ${formatVal(key)}: ${reasonSingular(field, value, checkVal)}`);
	return void 0;
}
function checkSingular(field, value) {
	if (field.scalar !== void 0) return checkScalarValue(value, field.scalar);
	if (field.enum !== void 0) {
		if (field.enum.open) return Number.isInteger(value);
		return field.enum.values.some((v) => v.number === value);
	}
	return isReflectMessage(value, field.message);
}
function checkScalarValue(value, scalar) {
	switch (scalar) {
		case ScalarType.DOUBLE: return typeof value == "number";
		case ScalarType.FLOAT:
			if (typeof value != "number") return false;
			if (Number.isNaN(value) || !Number.isFinite(value)) return true;
			if (value > FLOAT32_MAX || value < FLOAT32_MIN) return `${value.toFixed()} out of range`;
			return true;
		case ScalarType.INT32:
		case ScalarType.SFIXED32:
		case ScalarType.SINT32:
			if (typeof value !== "number" || !Number.isInteger(value)) return false;
			if (value > INT32_MAX || value < INT32_MIN) return `${value.toFixed()} out of range`;
			return true;
		case ScalarType.FIXED32:
		case ScalarType.UINT32:
			if (typeof value !== "number" || !Number.isInteger(value)) return false;
			if (value > UINT32_MAX || value < 0) return `${value.toFixed()} out of range`;
			return true;
		case ScalarType.BOOL: return typeof value == "boolean";
		case ScalarType.STRING:
			if (typeof value != "string") return false;
			return getTextEncoding().checkUtf8(value) || "invalid UTF8";
		case ScalarType.BYTES: return value instanceof Uint8Array;
		case ScalarType.INT64:
		case ScalarType.SFIXED64:
		case ScalarType.SINT64:
			if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) try {
				protoInt64.parse(value);
				return true;
			} catch (_) {
				return `${value} out of range`;
			}
			return false;
		case ScalarType.FIXED64:
		case ScalarType.UINT64:
			if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) try {
				protoInt64.uParse(value);
				return true;
			} catch (_) {
				return `${value} out of range`;
			}
			return false;
	}
}
function reasonSingular(field, val, details) {
	details = typeof details == "string" ? `: ${details}` : `, got ${formatVal(val)}`;
	if (field.scalar !== void 0) return `expected ${scalarTypeDescription(field.scalar)}` + details;
	if (field.enum !== void 0) return `expected ${field.enum.toString()}` + details;
	return `expected ${formatReflectMessage(field.message)}` + details;
}
function formatVal(val) {
	switch (typeof val) {
		case "object":
			if (val === null) return "null";
			if (val instanceof Uint8Array) return `Uint8Array(${val.length})`;
			if (Array.isArray(val)) return `Array(${val.length})`;
			if (isReflectList(val)) return formatReflectList(val.field());
			if (isReflectMap(val)) return formatReflectMap(val.field());
			if (isReflectMessage(val)) return formatReflectMessage(val.desc);
			if (isMessage(val)) return `message ${val.$typeName}`;
			return "object";
		case "string": return val.length > 30 ? "string" : `"${val.split("\"").join("\\\"")}"`;
		case "boolean": return String(val);
		case "number": return String(val);
		case "bigint": return String(val) + "n";
		default: return typeof val;
	}
}
function formatReflectMessage(desc) {
	return `ReflectMessage (${desc.typeName})`;
}
function formatReflectList(field) {
	switch (field.listKind) {
		case "message": return `ReflectList (${field.message.toString()})`;
		case "enum": return `ReflectList (${field.enum.toString()})`;
		case "scalar": return `ReflectList (${ScalarType[field.scalar]})`;
	}
}
function formatReflectMap(field) {
	switch (field.mapKind) {
		case "message": return `ReflectMap (${ScalarType[field.mapKey]}, ${field.message.toString()})`;
		case "enum": return `ReflectMap (${ScalarType[field.mapKey]}, ${field.enum.toString()})`;
		case "scalar": return `ReflectMap (${ScalarType[field.mapKey]}, ${ScalarType[field.scalar]})`;
	}
}
function scalarTypeDescription(scalar) {
	switch (scalar) {
		case ScalarType.STRING: return "string";
		case ScalarType.BOOL: return "boolean";
		case ScalarType.INT64:
		case ScalarType.SINT64:
		case ScalarType.SFIXED64: return "bigint (int64)";
		case ScalarType.UINT64:
		case ScalarType.FIXED64: return "bigint (uint64)";
		case ScalarType.BYTES: return "Uint8Array";
		case ScalarType.DOUBLE: return "number (float64)";
		case ScalarType.FLOAT: return "number (float32)";
		case ScalarType.FIXED32:
		case ScalarType.UINT32: return "number (uint32)";
		case ScalarType.INT32:
		case ScalarType.SFIXED32:
		case ScalarType.SINT32: return "number (int32)";
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wkt/wrappers.js
function isWrapper(arg) {
	return isWrapperTypeName(arg.$typeName);
}
function isWrapperDesc(messageDesc$1) {
	const f = messageDesc$1.fields[0];
	return isWrapperTypeName(messageDesc$1.typeName) && f !== void 0 && f.fieldKind == "scalar" && f.name == "value" && f.number == 1;
}
function isWrapperTypeName(name) {
	return name.startsWith("google.protobuf.") && [
		"DoubleValue",
		"FloatValue",
		"Int64Value",
		"UInt64Value",
		"Int32Value",
		"UInt32Value",
		"BoolValue",
		"StringValue",
		"BytesValue"
	].includes(name.substring(16));
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/create.js
const EDITION_PROTO3 = 999;
const EDITION_PROTO2 = 998;
const IMPLICIT = 2;
/**
* Create a new message instance.
*
* The second argument is an optional initializer object, where all fields are
* optional.
*/
function create(schema, init) {
	if (isMessage(init, schema)) return init;
	const message = createZeroMessage(schema);
	if (init !== void 0) initMessage(schema, message, init);
	return message;
}
/**
* Sets field values from a MessageInitShape on a zero message.
*/
function initMessage(messageDesc$1, message, init) {
	for (const member of messageDesc$1.members) {
		let value = init[member.localName];
		if (value == null) continue;
		let field;
		if (member.kind == "oneof") {
			const oneofField = unsafeOneofCase(init, member);
			if (!oneofField) continue;
			field = oneofField;
			value = unsafeGet(init, oneofField);
		} else field = member;
		switch (field.fieldKind) {
			case "message":
				value = toMessage(field, value);
				break;
			case "scalar":
				value = initScalar(field, value);
				break;
			case "list":
				value = initList(field, value);
				break;
			case "map":
				value = initMap(field, value);
				break;
		}
		unsafeSet(message, field, value);
	}
	return message;
}
function initScalar(field, value) {
	if (field.scalar == ScalarType.BYTES) return toU8Arr(value);
	return value;
}
function initMap(field, value) {
	if (isObject$1(value)) {
		if (field.scalar == ScalarType.BYTES) return convertObjectValues(value, toU8Arr);
		if (field.mapKind == "message") return convertObjectValues(value, (val) => toMessage(field, val));
	}
	return value;
}
function initList(field, value) {
	if (Array.isArray(value)) {
		if (field.scalar == ScalarType.BYTES) return value.map(toU8Arr);
		if (field.listKind == "message") return value.map((item) => toMessage(field, item));
	}
	return value;
}
function toMessage(field, value) {
	if (field.fieldKind == "message" && !field.oneof && isWrapperDesc(field.message)) return initScalar(field.message.fields[0], value);
	if (isObject$1(value)) {
		if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName !== "google.protobuf.Value") return value;
		if (!isMessage(value, field.message)) return create(field.message, value);
	}
	return value;
}
function toU8Arr(value) {
	return Array.isArray(value) ? new Uint8Array(value) : value;
}
function convertObjectValues(obj, fn) {
	const ret = {};
	for (const entry of Object.entries(obj)) ret[entry[0]] = fn(entry[1]);
	return ret;
}
const tokenZeroMessageField = Symbol();
const messagePrototypes = new WeakMap();
/**
* Create a zero message.
*/
function createZeroMessage(desc) {
	let msg;
	if (!needsPrototypeChain(desc)) {
		msg = { $typeName: desc.typeName };
		for (const member of desc.members) if (member.kind == "oneof" || member.presence == IMPLICIT) msg[member.localName] = createZeroField(member);
	} else {
		const cached = messagePrototypes.get(desc);
		let prototype;
		let members;
		if (cached) ({prototype, members} = cached);
		else {
			prototype = {};
			members = new Set();
			for (const member of desc.members) {
				if (member.kind == "oneof") continue;
				if (member.fieldKind != "scalar" && member.fieldKind != "enum") continue;
				if (member.presence == IMPLICIT) continue;
				members.add(member);
				prototype[member.localName] = createZeroField(member);
			}
			messagePrototypes.set(desc, {
				prototype,
				members
			});
		}
		msg = Object.create(prototype);
		msg.$typeName = desc.typeName;
		for (const member of desc.members) {
			if (members.has(member)) continue;
			if (member.kind == "field") {
				if (member.fieldKind == "message") continue;
				if (member.fieldKind == "scalar" || member.fieldKind == "enum") {
					if (member.presence != IMPLICIT) continue;
				}
			}
			msg[member.localName] = createZeroField(member);
		}
	}
	return msg;
}
/**
* Do we need the prototype chain to track field presence?
*/
function needsPrototypeChain(desc) {
	switch (desc.file.edition) {
		case EDITION_PROTO3: return false;
		case EDITION_PROTO2: return true;
		default: return desc.fields.some((f) => f.presence != IMPLICIT && f.fieldKind != "message" && !f.oneof);
	}
}
/**
* Returns a zero value for oneof groups, and for every field kind except
* messages. Scalar and enum fields can have default values.
*/
function createZeroField(field) {
	if (field.kind == "oneof") return { case: void 0 };
	if (field.fieldKind == "list") return [];
	if (field.fieldKind == "map") return {};
	if (field.fieldKind == "message") return tokenZeroMessageField;
	const defaultValue = field.getDefaultValue();
	if (defaultValue !== void 0) return field.fieldKind == "scalar" && field.longAsString ? defaultValue.toString() : defaultValue;
	return field.fieldKind == "scalar" ? scalarZeroValue(field.scalar, field.longAsString) : field.enum.values[0].number;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect.js
/**
* Create a ReflectMessage.
*/
function reflect(messageDesc$1, message, check = true) {
	return new ReflectMessageImpl(messageDesc$1, message, check);
}
var ReflectMessageImpl = class {
	get sortedFields() {
		var _a;
		return (_a = this._sortedFields) !== null && _a !== void 0 ? _a : this._sortedFields = this.desc.fields.concat().sort((a, b) => a.number - b.number);
	}
	constructor(messageDesc$1, message, check = true) {
		this.lists = new Map();
		this.maps = new Map();
		this.check = check;
		this.desc = messageDesc$1;
		this.message = this[unsafeLocal] = message !== null && message !== void 0 ? message : create(messageDesc$1);
		this.fields = messageDesc$1.fields;
		this.oneofs = messageDesc$1.oneofs;
		this.members = messageDesc$1.members;
	}
	findNumber(number) {
		if (!this._fieldsByNumber) this._fieldsByNumber = new Map(this.desc.fields.map((f) => [f.number, f]));
		return this._fieldsByNumber.get(number);
	}
	oneofCase(oneof) {
		assertOwn(this.message, oneof);
		return unsafeOneofCase(this.message, oneof);
	}
	isSet(field) {
		assertOwn(this.message, field);
		return unsafeIsSet(this.message, field);
	}
	clear(field) {
		assertOwn(this.message, field);
		unsafeClear(this.message, field);
	}
	get(field) {
		assertOwn(this.message, field);
		const value = unsafeGet(this.message, field);
		switch (field.fieldKind) {
			case "list":
				let list = this.lists.get(field);
				if (!list || list[unsafeLocal] !== value) this.lists.set(field, list = new ReflectListImpl(field, value, this.check));
				return list;
			case "map":
				let map = this.maps.get(field);
				if (!map || map[unsafeLocal] !== value) this.maps.set(field, map = new ReflectMapImpl(field, value, this.check));
				return map;
			case "message": return messageToReflect(field, value, this.check);
			case "scalar": return value === void 0 ? scalarZeroValue(field.scalar, false) : longToReflect(field, value);
			case "enum": return value !== null && value !== void 0 ? value : field.enum.values[0].number;
		}
	}
	set(field, value) {
		assertOwn(this.message, field);
		if (this.check) {
			const err = checkField(field, value);
			if (err) throw err;
		}
		let local;
		if (field.fieldKind == "message") local = messageToLocal(field, value);
		else if (isReflectMap(value) || isReflectList(value)) local = value[unsafeLocal];
		else local = longToLocal(field, value);
		unsafeSet(this.message, field, local);
	}
	getUnknown() {
		return this.message.$unknown;
	}
	setUnknown(value) {
		this.message.$unknown = value;
	}
};
function assertOwn(owner, member) {
	if (member.parent.typeName !== owner.$typeName) throw new FieldError(member, `cannot use ${member.toString()} with message ${owner.$typeName}`, "ForeignFieldError");
}
var ReflectListImpl = class {
	field() {
		return this._field;
	}
	get size() {
		return this._arr.length;
	}
	constructor(field, unsafeInput, check) {
		this._field = field;
		this._arr = this[unsafeLocal] = unsafeInput;
		this.check = check;
	}
	get(index) {
		const item = this._arr[index];
		return item === void 0 ? void 0 : listItemToReflect(this._field, item, this.check);
	}
	set(index, item) {
		if (index < 0 || index >= this._arr.length) throw new FieldError(this._field, `list item #${index + 1}: out of range`);
		if (this.check) {
			const err = checkListItem(this._field, index, item);
			if (err) throw err;
		}
		this._arr[index] = listItemToLocal(this._field, item);
	}
	add(item) {
		if (this.check) {
			const err = checkListItem(this._field, this._arr.length, item);
			if (err) throw err;
		}
		this._arr.push(listItemToLocal(this._field, item));
		return void 0;
	}
	clear() {
		this._arr.splice(0, this._arr.length);
	}
	[Symbol.iterator]() {
		return this.values();
	}
	keys() {
		return this._arr.keys();
	}
	*values() {
		for (const item of this._arr) yield listItemToReflect(this._field, item, this.check);
	}
	*entries() {
		for (let i = 0; i < this._arr.length; i++) yield [i, listItemToReflect(this._field, this._arr[i], this.check)];
	}
};
var ReflectMapImpl = class {
	constructor(field, unsafeInput, check = true) {
		this.obj = this[unsafeLocal] = unsafeInput !== null && unsafeInput !== void 0 ? unsafeInput : {};
		this.check = check;
		this._field = field;
	}
	field() {
		return this._field;
	}
	set(key, value) {
		if (this.check) {
			const err = checkMapEntry(this._field, key, value);
			if (err) throw err;
		}
		this.obj[mapKeyToLocal(key)] = mapValueToLocal(this._field, value);
		return this;
	}
	delete(key) {
		const k = mapKeyToLocal(key);
		const has = Object.prototype.hasOwnProperty.call(this.obj, k);
		if (has) delete this.obj[k];
		return has;
	}
	clear() {
		for (const key of Object.keys(this.obj)) delete this.obj[key];
	}
	get(key) {
		let val = this.obj[mapKeyToLocal(key)];
		if (val !== void 0) val = mapValueToReflect(this._field, val, this.check);
		return val;
	}
	has(key) {
		return Object.prototype.hasOwnProperty.call(this.obj, mapKeyToLocal(key));
	}
	*keys() {
		for (const objKey of Object.keys(this.obj)) yield mapKeyToReflect(objKey, this._field.mapKey);
	}
	*entries() {
		for (const objEntry of Object.entries(this.obj)) yield [mapKeyToReflect(objEntry[0], this._field.mapKey), mapValueToReflect(this._field, objEntry[1], this.check)];
	}
	[Symbol.iterator]() {
		return this.entries();
	}
	get size() {
		return Object.keys(this.obj).length;
	}
	*values() {
		for (const val of Object.values(this.obj)) yield mapValueToReflect(this._field, val, this.check);
	}
	forEach(callbackfn, thisArg) {
		for (const mapEntry of this.entries()) callbackfn.call(thisArg, mapEntry[1], mapEntry[0], this);
	}
};
function messageToLocal(field, value) {
	if (!isReflectMessage(value)) return value;
	if (isWrapper(value.message) && !field.oneof && field.fieldKind == "message") return value.message.value;
	if (value.desc.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value") return wktStructToLocal(value.message);
	return value.message;
}
function messageToReflect(field, value, check) {
	if (value !== void 0) {
		if (isWrapperDesc(field.message) && !field.oneof && field.fieldKind == "message") value = {
			$typeName: field.message.typeName,
			value: longToReflect(field.message.fields[0], value)
		};
		else if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value" && isObject$1(value)) value = wktStructToReflect(value);
	}
	return new ReflectMessageImpl(field.message, value, check);
}
function listItemToLocal(field, value) {
	if (field.listKind == "message") return messageToLocal(field, value);
	return longToLocal(field, value);
}
function listItemToReflect(field, value, check) {
	if (field.listKind == "message") return messageToReflect(field, value, check);
	return longToReflect(field, value);
}
function mapValueToLocal(field, value) {
	if (field.mapKind == "message") return messageToLocal(field, value);
	return longToLocal(field, value);
}
function mapValueToReflect(field, value, check) {
	if (field.mapKind == "message") return messageToReflect(field, value, check);
	return value;
}
function mapKeyToLocal(key) {
	return typeof key == "string" || typeof key == "number" ? key : String(key);
}
/**
* Converts a map key (any scalar value except float, double, or bytes) from its
* representation in a message (string or number, the only possible object key
* types) to the closest possible type in ECMAScript.
*/
function mapKeyToReflect(key, type) {
	switch (type) {
		case ScalarType.STRING: return key;
		case ScalarType.INT32:
		case ScalarType.FIXED32:
		case ScalarType.UINT32:
		case ScalarType.SFIXED32:
		case ScalarType.SINT32: {
			const n = Number.parseInt(key);
			if (Number.isFinite(n)) return n;
			break;
		}
		case ScalarType.BOOL:
			switch (key) {
				case "true": return true;
				case "false": return false;
			}
			break;
		case ScalarType.UINT64:
		case ScalarType.FIXED64:
			try {
				return protoInt64.uParse(key);
			} catch (_a) {}
			break;
		default:
			try {
				return protoInt64.parse(key);
			} catch (_b) {}
			break;
	}
	return key;
}
function longToReflect(field, value) {
	switch (field.scalar) {
		case ScalarType.INT64:
		case ScalarType.SFIXED64:
		case ScalarType.SINT64:
			if ("longAsString" in field && field.longAsString && typeof value == "string") value = protoInt64.parse(value);
			break;
		case ScalarType.FIXED64:
		case ScalarType.UINT64:
			if ("longAsString" in field && field.longAsString && typeof value == "string") value = protoInt64.uParse(value);
			break;
	}
	return value;
}
function longToLocal(field, value) {
	switch (field.scalar) {
		case ScalarType.INT64:
		case ScalarType.SFIXED64:
		case ScalarType.SINT64:
			if ("longAsString" in field && field.longAsString) value = String(value);
			else if (typeof value == "string" || typeof value == "number") value = protoInt64.parse(value);
			break;
		case ScalarType.FIXED64:
		case ScalarType.UINT64:
			if ("longAsString" in field && field.longAsString) value = String(value);
			else if (typeof value == "string" || typeof value == "number") value = protoInt64.uParse(value);
			break;
	}
	return value;
}
function wktStructToReflect(json) {
	const struct = {
		$typeName: "google.protobuf.Struct",
		fields: {}
	};
	if (isObject$1(json)) for (const [k, v] of Object.entries(json)) struct.fields[k] = wktValueToReflect(v);
	return struct;
}
function wktStructToLocal(val) {
	const json = {};
	for (const [k, v] of Object.entries(val.fields)) json[k] = wktValueToLocal(v);
	return json;
}
function wktValueToLocal(val) {
	switch (val.kind.case) {
		case "structValue": return wktStructToLocal(val.kind.value);
		case "listValue": return val.kind.value.values.map(wktValueToLocal);
		case "nullValue":
		case void 0: return null;
		default: return val.kind.value;
	}
}
function wktValueToReflect(json) {
	const value = {
		$typeName: "google.protobuf.Value",
		kind: { case: void 0 }
	};
	switch (typeof json) {
		case "number":
			value.kind = {
				case: "numberValue",
				value: json
			};
			break;
		case "string":
			value.kind = {
				case: "stringValue",
				value: json
			};
			break;
		case "boolean":
			value.kind = {
				case: "boolValue",
				value: json
			};
			break;
		case "object":
			if (json === null) {
				const nullValue = 0;
				value.kind = {
					case: "nullValue",
					value: nullValue
				};
			} else if (Array.isArray(json)) {
				const listValue = {
					$typeName: "google.protobuf.ListValue",
					values: []
				};
				if (Array.isArray(json)) for (const e of json) listValue.values.push(wktValueToReflect(e));
				value.kind = {
					case: "listValue",
					value: listValue
				};
			} else value.kind = {
				case: "structValue",
				value: wktStructToReflect(json)
			};
			break;
	}
	return value;
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/to-binary.js
const LEGACY_REQUIRED = 3;
const writeDefaults = { writeUnknownFields: true };
function makeWriteOptions(options) {
	return options ? Object.assign(Object.assign({}, writeDefaults), options) : writeDefaults;
}
function toBinary(schema, message, options) {
	return writeFields(new BinaryWriter(), makeWriteOptions(options), reflect(schema, message)).finish();
}
function writeFields(writer, opts, msg) {
	var _a;
	for (const f of msg.sortedFields) {
		if (!msg.isSet(f)) {
			if (f.presence == LEGACY_REQUIRED) throw new Error(`cannot encode ${f} to binary: required field not set`);
			continue;
		}
		writeField(writer, opts, msg, f);
	}
	if (opts.writeUnknownFields) for (const { no, wireType, data } of (_a = msg.getUnknown()) !== null && _a !== void 0 ? _a : []) writer.tag(no, wireType).raw(data);
	return writer;
}
/**
* @private
*/
function writeField(writer, opts, msg, field) {
	var _a;
	switch (field.fieldKind) {
		case "scalar":
		case "enum":
			writeScalar(writer, msg.desc.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, field.number, msg.get(field));
			break;
		case "list":
			writeListField(writer, opts, field, msg.get(field));
			break;
		case "message":
			writeMessageField(writer, opts, field, msg.get(field));
			break;
		case "map":
			for (const [key, val] of msg.get(field)) writeMapEntry(writer, opts, field, key, val);
			break;
	}
}
function writeScalar(writer, msgName, fieldName, scalarType, fieldNo, value) {
	writeScalarValue(writer.tag(fieldNo, writeTypeOfScalar(scalarType)), msgName, fieldName, scalarType, value);
}
function writeMessageField(writer, opts, field, message) {
	if (field.delimitedEncoding) writeFields(writer.tag(field.number, WireType.StartGroup), opts, message).tag(field.number, WireType.EndGroup);
	else writeFields(writer.tag(field.number, WireType.LengthDelimited).fork(), opts, message).join();
}
function writeListField(writer, opts, field, list) {
	var _a;
	if (field.listKind == "message") {
		for (const item of list) writeMessageField(writer, opts, field, item);
		return;
	}
	const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
	if (field.packed) {
		if (!list.size) return;
		writer.tag(field.number, WireType.LengthDelimited).fork();
		for (const item of list) writeScalarValue(writer, field.parent.typeName, field.name, scalarType, item);
		writer.join();
		return;
	}
	for (const item of list) writeScalar(writer, field.parent.typeName, field.name, scalarType, field.number, item);
}
function writeMapEntry(writer, opts, field, key, value) {
	var _a;
	writer.tag(field.number, WireType.LengthDelimited).fork();
	writeScalar(writer, field.parent.typeName, field.name, field.mapKey, 1, key);
	switch (field.mapKind) {
		case "scalar":
		case "enum":
			writeScalar(writer, field.parent.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, 2, value);
			break;
		case "message":
			writeFields(writer.tag(2, WireType.LengthDelimited).fork(), opts, value).join();
			break;
	}
	writer.join();
}
function writeScalarValue(writer, msgName, fieldName, type, value) {
	try {
		switch (type) {
			case ScalarType.STRING:
				writer.string(value);
				break;
			case ScalarType.BOOL:
				writer.bool(value);
				break;
			case ScalarType.DOUBLE:
				writer.double(value);
				break;
			case ScalarType.FLOAT:
				writer.float(value);
				break;
			case ScalarType.INT32:
				writer.int32(value);
				break;
			case ScalarType.INT64:
				writer.int64(value);
				break;
			case ScalarType.UINT64:
				writer.uint64(value);
				break;
			case ScalarType.FIXED64:
				writer.fixed64(value);
				break;
			case ScalarType.BYTES:
				writer.bytes(value);
				break;
			case ScalarType.FIXED32:
				writer.fixed32(value);
				break;
			case ScalarType.SFIXED32:
				writer.sfixed32(value);
				break;
			case ScalarType.SFIXED64:
				writer.sfixed64(value);
				break;
			case ScalarType.SINT64:
				writer.sint64(value);
				break;
			case ScalarType.UINT32:
				writer.uint32(value);
				break;
			case ScalarType.SINT32:
				writer.sint32(value);
				break;
		}
	} catch (e) {
		if (e instanceof Error) throw new Error(`cannot encode field ${msgName}.${fieldName} to binary: ${e.message}`);
		throw e;
	}
}
function writeTypeOfScalar(type) {
	switch (type) {
		case ScalarType.BYTES:
		case ScalarType.STRING: return WireType.LengthDelimited;
		case ScalarType.DOUBLE:
		case ScalarType.FIXED64:
		case ScalarType.SFIXED64: return WireType.Bit64;
		case ScalarType.FIXED32:
		case ScalarType.SFIXED32:
		case ScalarType.FLOAT: return WireType.Bit32;
		default: return WireType.Varint;
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/message.js
/**
* Hydrate a message descriptor.
*
* @private
*/
function messageDesc(file, path, ...paths) {
	return paths.reduce((acc, cur) => acc.nestedMessages[cur], file.messages[path]);
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/enum.js
/**
* Hydrate an enum descriptor.
*
* @private
*/
function enumDesc(file, path, ...paths) {
	if (paths.length == 0) return file.enums[path];
	const e = paths.pop();
	return paths.reduce((acc, cur) => acc.nestedMessages[cur], file.messages[path]).nestedEnums[e];
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/wkt/gen/google/protobuf/descriptor_pb.js
/**
* Describes the file google/protobuf/descriptor.proto.
*/
const file_google_protobuf_descriptor = /* @__PURE__ */ boot({
	"name": "google/protobuf/descriptor.proto",
	"package": "google.protobuf",
	"messageType": [
		{
			"name": "FileDescriptorSet",
			"field": [{
				"name": "file",
				"number": 1,
				"type": 11,
				"label": 3,
				"typeName": ".google.protobuf.FileDescriptorProto"
			}],
			"extensionRange": [{
				"start": 536e6,
				"end": 536000001
			}]
		},
		{
			"name": "FileDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "package",
					"number": 2,
					"type": 9,
					"label": 1
				},
				{
					"name": "dependency",
					"number": 3,
					"type": 9,
					"label": 3
				},
				{
					"name": "public_dependency",
					"number": 10,
					"type": 5,
					"label": 3
				},
				{
					"name": "weak_dependency",
					"number": 11,
					"type": 5,
					"label": 3
				},
				{
					"name": "option_dependency",
					"number": 15,
					"type": 9,
					"label": 3
				},
				{
					"name": "message_type",
					"number": 4,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.DescriptorProto"
				},
				{
					"name": "enum_type",
					"number": 5,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.EnumDescriptorProto"
				},
				{
					"name": "service",
					"number": 6,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.ServiceDescriptorProto"
				},
				{
					"name": "extension",
					"number": 7,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.FieldDescriptorProto"
				},
				{
					"name": "options",
					"number": 8,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FileOptions"
				},
				{
					"name": "source_code_info",
					"number": 9,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.SourceCodeInfo"
				},
				{
					"name": "syntax",
					"number": 12,
					"type": 9,
					"label": 1
				},
				{
					"name": "edition",
					"number": 14,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.Edition"
				}
			]
		},
		{
			"name": "DescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "field",
					"number": 2,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.FieldDescriptorProto"
				},
				{
					"name": "extension",
					"number": 6,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.FieldDescriptorProto"
				},
				{
					"name": "nested_type",
					"number": 3,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.DescriptorProto"
				},
				{
					"name": "enum_type",
					"number": 4,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.EnumDescriptorProto"
				},
				{
					"name": "extension_range",
					"number": 5,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.DescriptorProto.ExtensionRange"
				},
				{
					"name": "oneof_decl",
					"number": 8,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.OneofDescriptorProto"
				},
				{
					"name": "options",
					"number": 7,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.MessageOptions"
				},
				{
					"name": "reserved_range",
					"number": 9,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.DescriptorProto.ReservedRange"
				},
				{
					"name": "reserved_name",
					"number": 10,
					"type": 9,
					"label": 3
				},
				{
					"name": "visibility",
					"number": 11,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.SymbolVisibility"
				}
			],
			"nestedType": [{
				"name": "ExtensionRange",
				"field": [
					{
						"name": "start",
						"number": 1,
						"type": 5,
						"label": 1
					},
					{
						"name": "end",
						"number": 2,
						"type": 5,
						"label": 1
					},
					{
						"name": "options",
						"number": 3,
						"type": 11,
						"label": 1,
						"typeName": ".google.protobuf.ExtensionRangeOptions"
					}
				]
			}, {
				"name": "ReservedRange",
				"field": [{
					"name": "start",
					"number": 1,
					"type": 5,
					"label": 1
				}, {
					"name": "end",
					"number": 2,
					"type": 5,
					"label": 1
				}]
			}]
		},
		{
			"name": "ExtensionRangeOptions",
			"field": [
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				},
				{
					"name": "declaration",
					"number": 2,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.ExtensionRangeOptions.Declaration",
					"options": { "retention": 2 }
				},
				{
					"name": "features",
					"number": 50,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "verification",
					"number": 3,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.ExtensionRangeOptions.VerificationState",
					"defaultValue": "UNVERIFIED",
					"options": { "retention": 2 }
				}
			],
			"nestedType": [{
				"name": "Declaration",
				"field": [
					{
						"name": "number",
						"number": 1,
						"type": 5,
						"label": 1
					},
					{
						"name": "full_name",
						"number": 2,
						"type": 9,
						"label": 1
					},
					{
						"name": "type",
						"number": 3,
						"type": 9,
						"label": 1
					},
					{
						"name": "reserved",
						"number": 5,
						"type": 8,
						"label": 1
					},
					{
						"name": "repeated",
						"number": 6,
						"type": 8,
						"label": 1
					}
				]
			}],
			"enumType": [{
				"name": "VerificationState",
				"value": [{
					"name": "DECLARATION",
					"number": 0
				}, {
					"name": "UNVERIFIED",
					"number": 1
				}]
			}],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "FieldDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "number",
					"number": 3,
					"type": 5,
					"label": 1
				},
				{
					"name": "label",
					"number": 4,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FieldDescriptorProto.Label"
				},
				{
					"name": "type",
					"number": 5,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FieldDescriptorProto.Type"
				},
				{
					"name": "type_name",
					"number": 6,
					"type": 9,
					"label": 1
				},
				{
					"name": "extendee",
					"number": 2,
					"type": 9,
					"label": 1
				},
				{
					"name": "default_value",
					"number": 7,
					"type": 9,
					"label": 1
				},
				{
					"name": "oneof_index",
					"number": 9,
					"type": 5,
					"label": 1
				},
				{
					"name": "json_name",
					"number": 10,
					"type": 9,
					"label": 1
				},
				{
					"name": "options",
					"number": 8,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions"
				},
				{
					"name": "proto3_optional",
					"number": 17,
					"type": 8,
					"label": 1
				}
			],
			"enumType": [{
				"name": "Type",
				"value": [
					{
						"name": "TYPE_DOUBLE",
						"number": 1
					},
					{
						"name": "TYPE_FLOAT",
						"number": 2
					},
					{
						"name": "TYPE_INT64",
						"number": 3
					},
					{
						"name": "TYPE_UINT64",
						"number": 4
					},
					{
						"name": "TYPE_INT32",
						"number": 5
					},
					{
						"name": "TYPE_FIXED64",
						"number": 6
					},
					{
						"name": "TYPE_FIXED32",
						"number": 7
					},
					{
						"name": "TYPE_BOOL",
						"number": 8
					},
					{
						"name": "TYPE_STRING",
						"number": 9
					},
					{
						"name": "TYPE_GROUP",
						"number": 10
					},
					{
						"name": "TYPE_MESSAGE",
						"number": 11
					},
					{
						"name": "TYPE_BYTES",
						"number": 12
					},
					{
						"name": "TYPE_UINT32",
						"number": 13
					},
					{
						"name": "TYPE_ENUM",
						"number": 14
					},
					{
						"name": "TYPE_SFIXED32",
						"number": 15
					},
					{
						"name": "TYPE_SFIXED64",
						"number": 16
					},
					{
						"name": "TYPE_SINT32",
						"number": 17
					},
					{
						"name": "TYPE_SINT64",
						"number": 18
					}
				]
			}, {
				"name": "Label",
				"value": [
					{
						"name": "LABEL_OPTIONAL",
						"number": 1
					},
					{
						"name": "LABEL_REPEATED",
						"number": 3
					},
					{
						"name": "LABEL_REQUIRED",
						"number": 2
					}
				]
			}]
		},
		{
			"name": "OneofDescriptorProto",
			"field": [{
				"name": "name",
				"number": 1,
				"type": 9,
				"label": 1
			}, {
				"name": "options",
				"number": 2,
				"type": 11,
				"label": 1,
				"typeName": ".google.protobuf.OneofOptions"
			}]
		},
		{
			"name": "EnumDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "value",
					"number": 2,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.EnumValueDescriptorProto"
				},
				{
					"name": "options",
					"number": 3,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.EnumOptions"
				},
				{
					"name": "reserved_range",
					"number": 4,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.EnumDescriptorProto.EnumReservedRange"
				},
				{
					"name": "reserved_name",
					"number": 5,
					"type": 9,
					"label": 3
				},
				{
					"name": "visibility",
					"number": 6,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.SymbolVisibility"
				}
			],
			"nestedType": [{
				"name": "EnumReservedRange",
				"field": [{
					"name": "start",
					"number": 1,
					"type": 5,
					"label": 1
				}, {
					"name": "end",
					"number": 2,
					"type": 5,
					"label": 1
				}]
			}]
		},
		{
			"name": "EnumValueDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "number",
					"number": 2,
					"type": 5,
					"label": 1
				},
				{
					"name": "options",
					"number": 3,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.EnumValueOptions"
				}
			]
		},
		{
			"name": "ServiceDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "method",
					"number": 2,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.MethodDescriptorProto"
				},
				{
					"name": "options",
					"number": 3,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.ServiceOptions"
				}
			]
		},
		{
			"name": "MethodDescriptorProto",
			"field": [
				{
					"name": "name",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "input_type",
					"number": 2,
					"type": 9,
					"label": 1
				},
				{
					"name": "output_type",
					"number": 3,
					"type": 9,
					"label": 1
				},
				{
					"name": "options",
					"number": 4,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.MethodOptions"
				},
				{
					"name": "client_streaming",
					"number": 5,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "server_streaming",
					"number": 6,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				}
			]
		},
		{
			"name": "FileOptions",
			"field": [
				{
					"name": "java_package",
					"number": 1,
					"type": 9,
					"label": 1
				},
				{
					"name": "java_outer_classname",
					"number": 8,
					"type": 9,
					"label": 1
				},
				{
					"name": "java_multiple_files",
					"number": 10,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "java_generate_equals_and_hash",
					"number": 20,
					"type": 8,
					"label": 1,
					"options": { "deprecated": true }
				},
				{
					"name": "java_string_check_utf8",
					"number": 27,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "optimize_for",
					"number": 9,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FileOptions.OptimizeMode",
					"defaultValue": "SPEED"
				},
				{
					"name": "go_package",
					"number": 11,
					"type": 9,
					"label": 1
				},
				{
					"name": "cc_generic_services",
					"number": 16,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "java_generic_services",
					"number": 17,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "py_generic_services",
					"number": 18,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "deprecated",
					"number": 23,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "cc_enable_arenas",
					"number": 31,
					"type": 8,
					"label": 1,
					"defaultValue": "true"
				},
				{
					"name": "objc_class_prefix",
					"number": 36,
					"type": 9,
					"label": 1
				},
				{
					"name": "csharp_namespace",
					"number": 37,
					"type": 9,
					"label": 1
				},
				{
					"name": "swift_prefix",
					"number": 39,
					"type": 9,
					"label": 1
				},
				{
					"name": "php_class_prefix",
					"number": 40,
					"type": 9,
					"label": 1
				},
				{
					"name": "php_namespace",
					"number": 41,
					"type": 9,
					"label": 1
				},
				{
					"name": "php_metadata_namespace",
					"number": 44,
					"type": 9,
					"label": 1
				},
				{
					"name": "ruby_package",
					"number": 45,
					"type": 9,
					"label": 1
				},
				{
					"name": "features",
					"number": 50,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"enumType": [{
				"name": "OptimizeMode",
				"value": [
					{
						"name": "SPEED",
						"number": 1
					},
					{
						"name": "CODE_SIZE",
						"number": 2
					},
					{
						"name": "LITE_RUNTIME",
						"number": 3
					}
				]
			}],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "MessageOptions",
			"field": [
				{
					"name": "message_set_wire_format",
					"number": 1,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "no_standard_descriptor_accessor",
					"number": 2,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "deprecated",
					"number": 3,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "map_entry",
					"number": 7,
					"type": 8,
					"label": 1
				},
				{
					"name": "deprecated_legacy_json_field_conflicts",
					"number": 11,
					"type": 8,
					"label": 1,
					"options": { "deprecated": true }
				},
				{
					"name": "features",
					"number": 12,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "FieldOptions",
			"field": [
				{
					"name": "ctype",
					"number": 1,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions.CType",
					"defaultValue": "STRING"
				},
				{
					"name": "packed",
					"number": 2,
					"type": 8,
					"label": 1
				},
				{
					"name": "jstype",
					"number": 6,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions.JSType",
					"defaultValue": "JS_NORMAL"
				},
				{
					"name": "lazy",
					"number": 5,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "unverified_lazy",
					"number": 15,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "deprecated",
					"number": 3,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "weak",
					"number": 10,
					"type": 8,
					"label": 1,
					"defaultValue": "false",
					"options": { "deprecated": true }
				},
				{
					"name": "debug_redact",
					"number": 16,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "retention",
					"number": 17,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions.OptionRetention"
				},
				{
					"name": "targets",
					"number": 19,
					"type": 14,
					"label": 3,
					"typeName": ".google.protobuf.FieldOptions.OptionTargetType"
				},
				{
					"name": "edition_defaults",
					"number": 20,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.FieldOptions.EditionDefault"
				},
				{
					"name": "features",
					"number": 21,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "feature_support",
					"number": 22,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions.FeatureSupport"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"nestedType": [{
				"name": "EditionDefault",
				"field": [{
					"name": "edition",
					"number": 3,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.Edition"
				}, {
					"name": "value",
					"number": 2,
					"type": 9,
					"label": 1
				}]
			}, {
				"name": "FeatureSupport",
				"field": [
					{
						"name": "edition_introduced",
						"number": 1,
						"type": 14,
						"label": 1,
						"typeName": ".google.protobuf.Edition"
					},
					{
						"name": "edition_deprecated",
						"number": 2,
						"type": 14,
						"label": 1,
						"typeName": ".google.protobuf.Edition"
					},
					{
						"name": "deprecation_warning",
						"number": 3,
						"type": 9,
						"label": 1
					},
					{
						"name": "edition_removed",
						"number": 4,
						"type": 14,
						"label": 1,
						"typeName": ".google.protobuf.Edition"
					}
				]
			}],
			"enumType": [
				{
					"name": "CType",
					"value": [
						{
							"name": "STRING",
							"number": 0
						},
						{
							"name": "CORD",
							"number": 1
						},
						{
							"name": "STRING_PIECE",
							"number": 2
						}
					]
				},
				{
					"name": "JSType",
					"value": [
						{
							"name": "JS_NORMAL",
							"number": 0
						},
						{
							"name": "JS_STRING",
							"number": 1
						},
						{
							"name": "JS_NUMBER",
							"number": 2
						}
					]
				},
				{
					"name": "OptionRetention",
					"value": [
						{
							"name": "RETENTION_UNKNOWN",
							"number": 0
						},
						{
							"name": "RETENTION_RUNTIME",
							"number": 1
						},
						{
							"name": "RETENTION_SOURCE",
							"number": 2
						}
					]
				},
				{
					"name": "OptionTargetType",
					"value": [
						{
							"name": "TARGET_TYPE_UNKNOWN",
							"number": 0
						},
						{
							"name": "TARGET_TYPE_FILE",
							"number": 1
						},
						{
							"name": "TARGET_TYPE_EXTENSION_RANGE",
							"number": 2
						},
						{
							"name": "TARGET_TYPE_MESSAGE",
							"number": 3
						},
						{
							"name": "TARGET_TYPE_FIELD",
							"number": 4
						},
						{
							"name": "TARGET_TYPE_ONEOF",
							"number": 5
						},
						{
							"name": "TARGET_TYPE_ENUM",
							"number": 6
						},
						{
							"name": "TARGET_TYPE_ENUM_ENTRY",
							"number": 7
						},
						{
							"name": "TARGET_TYPE_SERVICE",
							"number": 8
						},
						{
							"name": "TARGET_TYPE_METHOD",
							"number": 9
						}
					]
				}
			],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "OneofOptions",
			"field": [{
				"name": "features",
				"number": 1,
				"type": 11,
				"label": 1,
				"typeName": ".google.protobuf.FeatureSet"
			}, {
				"name": "uninterpreted_option",
				"number": 999,
				"type": 11,
				"label": 3,
				"typeName": ".google.protobuf.UninterpretedOption"
			}],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "EnumOptions",
			"field": [
				{
					"name": "allow_alias",
					"number": 2,
					"type": 8,
					"label": 1
				},
				{
					"name": "deprecated",
					"number": 3,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "deprecated_legacy_json_field_conflicts",
					"number": 6,
					"type": 8,
					"label": 1,
					"options": { "deprecated": true }
				},
				{
					"name": "features",
					"number": 7,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "EnumValueOptions",
			"field": [
				{
					"name": "deprecated",
					"number": 1,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "features",
					"number": 2,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "debug_redact",
					"number": 3,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "feature_support",
					"number": 4,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FieldOptions.FeatureSupport"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "ServiceOptions",
			"field": [
				{
					"name": "features",
					"number": 34,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "deprecated",
					"number": 33,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "MethodOptions",
			"field": [
				{
					"name": "deprecated",
					"number": 33,
					"type": 8,
					"label": 1,
					"defaultValue": "false"
				},
				{
					"name": "idempotency_level",
					"number": 34,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.MethodOptions.IdempotencyLevel",
					"defaultValue": "IDEMPOTENCY_UNKNOWN"
				},
				{
					"name": "features",
					"number": 35,
					"type": 11,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet"
				},
				{
					"name": "uninterpreted_option",
					"number": 999,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption"
				}
			],
			"enumType": [{
				"name": "IdempotencyLevel",
				"value": [
					{
						"name": "IDEMPOTENCY_UNKNOWN",
						"number": 0
					},
					{
						"name": "NO_SIDE_EFFECTS",
						"number": 1
					},
					{
						"name": "IDEMPOTENT",
						"number": 2
					}
				]
			}],
			"extensionRange": [{
				"start": 1e3,
				"end": 536870912
			}]
		},
		{
			"name": "UninterpretedOption",
			"field": [
				{
					"name": "name",
					"number": 2,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.UninterpretedOption.NamePart"
				},
				{
					"name": "identifier_value",
					"number": 3,
					"type": 9,
					"label": 1
				},
				{
					"name": "positive_int_value",
					"number": 4,
					"type": 4,
					"label": 1
				},
				{
					"name": "negative_int_value",
					"number": 5,
					"type": 3,
					"label": 1
				},
				{
					"name": "double_value",
					"number": 6,
					"type": 1,
					"label": 1
				},
				{
					"name": "string_value",
					"number": 7,
					"type": 12,
					"label": 1
				},
				{
					"name": "aggregate_value",
					"number": 8,
					"type": 9,
					"label": 1
				}
			],
			"nestedType": [{
				"name": "NamePart",
				"field": [{
					"name": "name_part",
					"number": 1,
					"type": 9,
					"label": 2
				}, {
					"name": "is_extension",
					"number": 2,
					"type": 8,
					"label": 2
				}]
			}]
		},
		{
			"name": "FeatureSet",
			"field": [
				{
					"name": "field_presence",
					"number": 1,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.FieldPresence",
					"options": {
						"retention": 1,
						"targets": [4, 1],
						"editionDefaults": [
							{
								"value": "EXPLICIT",
								"edition": 900
							},
							{
								"value": "IMPLICIT",
								"edition": 999
							},
							{
								"value": "EXPLICIT",
								"edition": 1e3
							}
						]
					}
				},
				{
					"name": "enum_type",
					"number": 2,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.EnumType",
					"options": {
						"retention": 1,
						"targets": [6, 1],
						"editionDefaults": [{
							"value": "CLOSED",
							"edition": 900
						}, {
							"value": "OPEN",
							"edition": 999
						}]
					}
				},
				{
					"name": "repeated_field_encoding",
					"number": 3,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.RepeatedFieldEncoding",
					"options": {
						"retention": 1,
						"targets": [4, 1],
						"editionDefaults": [{
							"value": "EXPANDED",
							"edition": 900
						}, {
							"value": "PACKED",
							"edition": 999
						}]
					}
				},
				{
					"name": "utf8_validation",
					"number": 4,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.Utf8Validation",
					"options": {
						"retention": 1,
						"targets": [4, 1],
						"editionDefaults": [{
							"value": "NONE",
							"edition": 900
						}, {
							"value": "VERIFY",
							"edition": 999
						}]
					}
				},
				{
					"name": "message_encoding",
					"number": 5,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.MessageEncoding",
					"options": {
						"retention": 1,
						"targets": [4, 1],
						"editionDefaults": [{
							"value": "LENGTH_PREFIXED",
							"edition": 900
						}]
					}
				},
				{
					"name": "json_format",
					"number": 6,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.JsonFormat",
					"options": {
						"retention": 1,
						"targets": [
							3,
							6,
							1
						],
						"editionDefaults": [{
							"value": "LEGACY_BEST_EFFORT",
							"edition": 900
						}, {
							"value": "ALLOW",
							"edition": 999
						}]
					}
				},
				{
					"name": "enforce_naming_style",
					"number": 7,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.EnforceNamingStyle",
					"options": {
						"retention": 2,
						"targets": [
							1,
							2,
							3,
							4,
							5,
							6,
							7,
							8,
							9
						],
						"editionDefaults": [{
							"value": "STYLE_LEGACY",
							"edition": 900
						}, {
							"value": "STYLE2024",
							"edition": 1001
						}]
					}
				},
				{
					"name": "default_symbol_visibility",
					"number": 8,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.FeatureSet.VisibilityFeature.DefaultSymbolVisibility",
					"options": {
						"retention": 2,
						"targets": [1],
						"editionDefaults": [{
							"value": "EXPORT_ALL",
							"edition": 900
						}, {
							"value": "EXPORT_TOP_LEVEL",
							"edition": 1001
						}]
					}
				}
			],
			"nestedType": [{
				"name": "VisibilityFeature",
				"enumType": [{
					"name": "DefaultSymbolVisibility",
					"value": [
						{
							"name": "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN",
							"number": 0
						},
						{
							"name": "EXPORT_ALL",
							"number": 1
						},
						{
							"name": "EXPORT_TOP_LEVEL",
							"number": 2
						},
						{
							"name": "LOCAL_ALL",
							"number": 3
						},
						{
							"name": "STRICT",
							"number": 4
						}
					]
				}]
			}],
			"enumType": [
				{
					"name": "FieldPresence",
					"value": [
						{
							"name": "FIELD_PRESENCE_UNKNOWN",
							"number": 0
						},
						{
							"name": "EXPLICIT",
							"number": 1
						},
						{
							"name": "IMPLICIT",
							"number": 2
						},
						{
							"name": "LEGACY_REQUIRED",
							"number": 3
						}
					]
				},
				{
					"name": "EnumType",
					"value": [
						{
							"name": "ENUM_TYPE_UNKNOWN",
							"number": 0
						},
						{
							"name": "OPEN",
							"number": 1
						},
						{
							"name": "CLOSED",
							"number": 2
						}
					]
				},
				{
					"name": "RepeatedFieldEncoding",
					"value": [
						{
							"name": "REPEATED_FIELD_ENCODING_UNKNOWN",
							"number": 0
						},
						{
							"name": "PACKED",
							"number": 1
						},
						{
							"name": "EXPANDED",
							"number": 2
						}
					]
				},
				{
					"name": "Utf8Validation",
					"value": [
						{
							"name": "UTF8_VALIDATION_UNKNOWN",
							"number": 0
						},
						{
							"name": "VERIFY",
							"number": 2
						},
						{
							"name": "NONE",
							"number": 3
						}
					]
				},
				{
					"name": "MessageEncoding",
					"value": [
						{
							"name": "MESSAGE_ENCODING_UNKNOWN",
							"number": 0
						},
						{
							"name": "LENGTH_PREFIXED",
							"number": 1
						},
						{
							"name": "DELIMITED",
							"number": 2
						}
					]
				},
				{
					"name": "JsonFormat",
					"value": [
						{
							"name": "JSON_FORMAT_UNKNOWN",
							"number": 0
						},
						{
							"name": "ALLOW",
							"number": 1
						},
						{
							"name": "LEGACY_BEST_EFFORT",
							"number": 2
						}
					]
				},
				{
					"name": "EnforceNamingStyle",
					"value": [
						{
							"name": "ENFORCE_NAMING_STYLE_UNKNOWN",
							"number": 0
						},
						{
							"name": "STYLE2024",
							"number": 1
						},
						{
							"name": "STYLE_LEGACY",
							"number": 2
						}
					]
				}
			],
			"extensionRange": [
				{
					"start": 1e3,
					"end": 9995
				},
				{
					"start": 9995,
					"end": 1e4
				},
				{
					"start": 1e4,
					"end": 10001
				}
			]
		},
		{
			"name": "FeatureSetDefaults",
			"field": [
				{
					"name": "defaults",
					"number": 1,
					"type": 11,
					"label": 3,
					"typeName": ".google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault"
				},
				{
					"name": "minimum_edition",
					"number": 4,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.Edition"
				},
				{
					"name": "maximum_edition",
					"number": 5,
					"type": 14,
					"label": 1,
					"typeName": ".google.protobuf.Edition"
				}
			],
			"nestedType": [{
				"name": "FeatureSetEditionDefault",
				"field": [
					{
						"name": "edition",
						"number": 3,
						"type": 14,
						"label": 1,
						"typeName": ".google.protobuf.Edition"
					},
					{
						"name": "overridable_features",
						"number": 4,
						"type": 11,
						"label": 1,
						"typeName": ".google.protobuf.FeatureSet"
					},
					{
						"name": "fixed_features",
						"number": 5,
						"type": 11,
						"label": 1,
						"typeName": ".google.protobuf.FeatureSet"
					}
				]
			}]
		},
		{
			"name": "SourceCodeInfo",
			"field": [{
				"name": "location",
				"number": 1,
				"type": 11,
				"label": 3,
				"typeName": ".google.protobuf.SourceCodeInfo.Location"
			}],
			"nestedType": [{
				"name": "Location",
				"field": [
					{
						"name": "path",
						"number": 1,
						"type": 5,
						"label": 3,
						"options": { "packed": true }
					},
					{
						"name": "span",
						"number": 2,
						"type": 5,
						"label": 3,
						"options": { "packed": true }
					},
					{
						"name": "leading_comments",
						"number": 3,
						"type": 9,
						"label": 1
					},
					{
						"name": "trailing_comments",
						"number": 4,
						"type": 9,
						"label": 1
					},
					{
						"name": "leading_detached_comments",
						"number": 6,
						"type": 9,
						"label": 3
					}
				]
			}],
			"extensionRange": [{
				"start": 536e6,
				"end": 536000001
			}]
		},
		{
			"name": "GeneratedCodeInfo",
			"field": [{
				"name": "annotation",
				"number": 1,
				"type": 11,
				"label": 3,
				"typeName": ".google.protobuf.GeneratedCodeInfo.Annotation"
			}],
			"nestedType": [{
				"name": "Annotation",
				"field": [
					{
						"name": "path",
						"number": 1,
						"type": 5,
						"label": 3,
						"options": { "packed": true }
					},
					{
						"name": "source_file",
						"number": 2,
						"type": 9,
						"label": 1
					},
					{
						"name": "begin",
						"number": 3,
						"type": 5,
						"label": 1
					},
					{
						"name": "end",
						"number": 4,
						"type": 5,
						"label": 1
					},
					{
						"name": "semantic",
						"number": 5,
						"type": 14,
						"label": 1,
						"typeName": ".google.protobuf.GeneratedCodeInfo.Annotation.Semantic"
					}
				],
				"enumType": [{
					"name": "Semantic",
					"value": [
						{
							"name": "NONE",
							"number": 0
						},
						{
							"name": "SET",
							"number": 1
						},
						{
							"name": "ALIAS",
							"number": 2
						}
					]
				}]
			}]
		}
	],
	"enumType": [{
		"name": "Edition",
		"value": [
			{
				"name": "EDITION_UNKNOWN",
				"number": 0
			},
			{
				"name": "EDITION_LEGACY",
				"number": 900
			},
			{
				"name": "EDITION_PROTO2",
				"number": 998
			},
			{
				"name": "EDITION_PROTO3",
				"number": 999
			},
			{
				"name": "EDITION_2023",
				"number": 1e3
			},
			{
				"name": "EDITION_2024",
				"number": 1001
			},
			{
				"name": "EDITION_1_TEST_ONLY",
				"number": 1
			},
			{
				"name": "EDITION_2_TEST_ONLY",
				"number": 2
			},
			{
				"name": "EDITION_99997_TEST_ONLY",
				"number": 99997
			},
			{
				"name": "EDITION_99998_TEST_ONLY",
				"number": 99998
			},
			{
				"name": "EDITION_99999_TEST_ONLY",
				"number": 99999
			},
			{
				"name": "EDITION_MAX",
				"number": 2147483647
			}
		]
	}, {
		"name": "SymbolVisibility",
		"value": [
			{
				"name": "VISIBILITY_UNSET",
				"number": 0
			},
			{
				"name": "VISIBILITY_LOCAL",
				"number": 1
			},
			{
				"name": "VISIBILITY_EXPORT",
				"number": 2
			}
		]
	}]
});
/**
* Describes the message google.protobuf.FileDescriptorProto.
* Use `create(FileDescriptorProtoSchema)` to create a new message.
*/
const FileDescriptorProtoSchema = /* @__PURE__ */ messageDesc(file_google_protobuf_descriptor, 1);
/**
* The verification state of the extension range.
*
* @generated from enum google.protobuf.ExtensionRangeOptions.VerificationState
*/
var ExtensionRangeOptions_VerificationState;
(function(ExtensionRangeOptions_VerificationState$1) {
	/**
	* All the extensions of the range must be declared.
	*
	* @generated from enum value: DECLARATION = 0;
	*/
	ExtensionRangeOptions_VerificationState$1[ExtensionRangeOptions_VerificationState$1["DECLARATION"] = 0] = "DECLARATION";
	/**
	* @generated from enum value: UNVERIFIED = 1;
	*/
	ExtensionRangeOptions_VerificationState$1[ExtensionRangeOptions_VerificationState$1["UNVERIFIED"] = 1] = "UNVERIFIED";
})(ExtensionRangeOptions_VerificationState || (ExtensionRangeOptions_VerificationState = {}));
/**
* @generated from enum google.protobuf.FieldDescriptorProto.Type
*/
var FieldDescriptorProto_Type;
(function(FieldDescriptorProto_Type$1) {
	/**
	* 0 is reserved for errors.
	* Order is weird for historical reasons.
	*
	* @generated from enum value: TYPE_DOUBLE = 1;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["DOUBLE"] = 1] = "DOUBLE";
	/**
	* @generated from enum value: TYPE_FLOAT = 2;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["FLOAT"] = 2] = "FLOAT";
	/**
	* Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
	* negative values are likely.
	*
	* @generated from enum value: TYPE_INT64 = 3;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["INT64"] = 3] = "INT64";
	/**
	* @generated from enum value: TYPE_UINT64 = 4;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["UINT64"] = 4] = "UINT64";
	/**
	* Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
	* negative values are likely.
	*
	* @generated from enum value: TYPE_INT32 = 5;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["INT32"] = 5] = "INT32";
	/**
	* @generated from enum value: TYPE_FIXED64 = 6;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["FIXED64"] = 6] = "FIXED64";
	/**
	* @generated from enum value: TYPE_FIXED32 = 7;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["FIXED32"] = 7] = "FIXED32";
	/**
	* @generated from enum value: TYPE_BOOL = 8;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["BOOL"] = 8] = "BOOL";
	/**
	* @generated from enum value: TYPE_STRING = 9;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["STRING"] = 9] = "STRING";
	/**
	* Tag-delimited aggregate.
	* Group type is deprecated and not supported after google.protobuf. However, Proto3
	* implementations should still be able to parse the group wire format and
	* treat group fields as unknown fields.  In Editions, the group wire format
	* can be enabled via the `message_encoding` feature.
	*
	* @generated from enum value: TYPE_GROUP = 10;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["GROUP"] = 10] = "GROUP";
	/**
	* Length-delimited aggregate.
	*
	* @generated from enum value: TYPE_MESSAGE = 11;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["MESSAGE"] = 11] = "MESSAGE";
	/**
	* New in version 2.
	*
	* @generated from enum value: TYPE_BYTES = 12;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["BYTES"] = 12] = "BYTES";
	/**
	* @generated from enum value: TYPE_UINT32 = 13;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["UINT32"] = 13] = "UINT32";
	/**
	* @generated from enum value: TYPE_ENUM = 14;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["ENUM"] = 14] = "ENUM";
	/**
	* @generated from enum value: TYPE_SFIXED32 = 15;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["SFIXED32"] = 15] = "SFIXED32";
	/**
	* @generated from enum value: TYPE_SFIXED64 = 16;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["SFIXED64"] = 16] = "SFIXED64";
	/**
	* Uses ZigZag encoding.
	*
	* @generated from enum value: TYPE_SINT32 = 17;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["SINT32"] = 17] = "SINT32";
	/**
	* Uses ZigZag encoding.
	*
	* @generated from enum value: TYPE_SINT64 = 18;
	*/
	FieldDescriptorProto_Type$1[FieldDescriptorProto_Type$1["SINT64"] = 18] = "SINT64";
})(FieldDescriptorProto_Type || (FieldDescriptorProto_Type = {}));
/**
* @generated from enum google.protobuf.FieldDescriptorProto.Label
*/
var FieldDescriptorProto_Label;
(function(FieldDescriptorProto_Label$1) {
	/**
	* 0 is reserved for errors
	*
	* @generated from enum value: LABEL_OPTIONAL = 1;
	*/
	FieldDescriptorProto_Label$1[FieldDescriptorProto_Label$1["OPTIONAL"] = 1] = "OPTIONAL";
	/**
	* @generated from enum value: LABEL_REPEATED = 3;
	*/
	FieldDescriptorProto_Label$1[FieldDescriptorProto_Label$1["REPEATED"] = 3] = "REPEATED";
	/**
	* The required label is only allowed in google.protobuf.  In proto3 and Editions
	* it's explicitly prohibited.  In Editions, the `field_presence` feature
	* can be used to get this behavior.
	*
	* @generated from enum value: LABEL_REQUIRED = 2;
	*/
	FieldDescriptorProto_Label$1[FieldDescriptorProto_Label$1["REQUIRED"] = 2] = "REQUIRED";
})(FieldDescriptorProto_Label || (FieldDescriptorProto_Label = {}));
/**
* Generated classes can be optimized for speed or code size.
*
* @generated from enum google.protobuf.FileOptions.OptimizeMode
*/
var FileOptions_OptimizeMode;
(function(FileOptions_OptimizeMode$1) {
	/**
	* Generate complete code for parsing, serialization,
	*
	* @generated from enum value: SPEED = 1;
	*/
	FileOptions_OptimizeMode$1[FileOptions_OptimizeMode$1["SPEED"] = 1] = "SPEED";
	/**
	* etc.
	*
	* Use ReflectionOps to implement these methods.
	*
	* @generated from enum value: CODE_SIZE = 2;
	*/
	FileOptions_OptimizeMode$1[FileOptions_OptimizeMode$1["CODE_SIZE"] = 2] = "CODE_SIZE";
	/**
	* Generate code using MessageLite and the lite runtime.
	*
	* @generated from enum value: LITE_RUNTIME = 3;
	*/
	FileOptions_OptimizeMode$1[FileOptions_OptimizeMode$1["LITE_RUNTIME"] = 3] = "LITE_RUNTIME";
})(FileOptions_OptimizeMode || (FileOptions_OptimizeMode = {}));
/**
* @generated from enum google.protobuf.FieldOptions.CType
*/
var FieldOptions_CType;
(function(FieldOptions_CType$1) {
	/**
	* Default mode.
	*
	* @generated from enum value: STRING = 0;
	*/
	FieldOptions_CType$1[FieldOptions_CType$1["STRING"] = 0] = "STRING";
	/**
	* The option [ctype=CORD] may be applied to a non-repeated field of type
	* "bytes". It indicates that in C++, the data should be stored in a Cord
	* instead of a string.  For very large strings, this may reduce memory
	* fragmentation. It may also allow better performance when parsing from a
	* Cord, or when parsing with aliasing enabled, as the parsed Cord may then
	* alias the original buffer.
	*
	* @generated from enum value: CORD = 1;
	*/
	FieldOptions_CType$1[FieldOptions_CType$1["CORD"] = 1] = "CORD";
	/**
	* @generated from enum value: STRING_PIECE = 2;
	*/
	FieldOptions_CType$1[FieldOptions_CType$1["STRING_PIECE"] = 2] = "STRING_PIECE";
})(FieldOptions_CType || (FieldOptions_CType = {}));
/**
* @generated from enum google.protobuf.FieldOptions.JSType
*/
var FieldOptions_JSType;
(function(FieldOptions_JSType$1) {
	/**
	* Use the default type.
	*
	* @generated from enum value: JS_NORMAL = 0;
	*/
	FieldOptions_JSType$1[FieldOptions_JSType$1["JS_NORMAL"] = 0] = "JS_NORMAL";
	/**
	* Use JavaScript strings.
	*
	* @generated from enum value: JS_STRING = 1;
	*/
	FieldOptions_JSType$1[FieldOptions_JSType$1["JS_STRING"] = 1] = "JS_STRING";
	/**
	* Use JavaScript numbers.
	*
	* @generated from enum value: JS_NUMBER = 2;
	*/
	FieldOptions_JSType$1[FieldOptions_JSType$1["JS_NUMBER"] = 2] = "JS_NUMBER";
})(FieldOptions_JSType || (FieldOptions_JSType = {}));
/**
* If set to RETENTION_SOURCE, the option will be omitted from the binary.
*
* @generated from enum google.protobuf.FieldOptions.OptionRetention
*/
var FieldOptions_OptionRetention;
(function(FieldOptions_OptionRetention$1) {
	/**
	* @generated from enum value: RETENTION_UNKNOWN = 0;
	*/
	FieldOptions_OptionRetention$1[FieldOptions_OptionRetention$1["RETENTION_UNKNOWN"] = 0] = "RETENTION_UNKNOWN";
	/**
	* @generated from enum value: RETENTION_RUNTIME = 1;
	*/
	FieldOptions_OptionRetention$1[FieldOptions_OptionRetention$1["RETENTION_RUNTIME"] = 1] = "RETENTION_RUNTIME";
	/**
	* @generated from enum value: RETENTION_SOURCE = 2;
	*/
	FieldOptions_OptionRetention$1[FieldOptions_OptionRetention$1["RETENTION_SOURCE"] = 2] = "RETENTION_SOURCE";
})(FieldOptions_OptionRetention || (FieldOptions_OptionRetention = {}));
/**
* This indicates the types of entities that the field may apply to when used
* as an option. If it is unset, then the field may be freely used as an
* option on any kind of entity.
*
* @generated from enum google.protobuf.FieldOptions.OptionTargetType
*/
var FieldOptions_OptionTargetType;
(function(FieldOptions_OptionTargetType$1) {
	/**
	* @generated from enum value: TARGET_TYPE_UNKNOWN = 0;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_UNKNOWN"] = 0] = "TARGET_TYPE_UNKNOWN";
	/**
	* @generated from enum value: TARGET_TYPE_FILE = 1;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_FILE"] = 1] = "TARGET_TYPE_FILE";
	/**
	* @generated from enum value: TARGET_TYPE_EXTENSION_RANGE = 2;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_EXTENSION_RANGE"] = 2] = "TARGET_TYPE_EXTENSION_RANGE";
	/**
	* @generated from enum value: TARGET_TYPE_MESSAGE = 3;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_MESSAGE"] = 3] = "TARGET_TYPE_MESSAGE";
	/**
	* @generated from enum value: TARGET_TYPE_FIELD = 4;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_FIELD"] = 4] = "TARGET_TYPE_FIELD";
	/**
	* @generated from enum value: TARGET_TYPE_ONEOF = 5;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_ONEOF"] = 5] = "TARGET_TYPE_ONEOF";
	/**
	* @generated from enum value: TARGET_TYPE_ENUM = 6;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_ENUM"] = 6] = "TARGET_TYPE_ENUM";
	/**
	* @generated from enum value: TARGET_TYPE_ENUM_ENTRY = 7;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_ENUM_ENTRY"] = 7] = "TARGET_TYPE_ENUM_ENTRY";
	/**
	* @generated from enum value: TARGET_TYPE_SERVICE = 8;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_SERVICE"] = 8] = "TARGET_TYPE_SERVICE";
	/**
	* @generated from enum value: TARGET_TYPE_METHOD = 9;
	*/
	FieldOptions_OptionTargetType$1[FieldOptions_OptionTargetType$1["TARGET_TYPE_METHOD"] = 9] = "TARGET_TYPE_METHOD";
})(FieldOptions_OptionTargetType || (FieldOptions_OptionTargetType = {}));
/**
* Is this method side-effect-free (or safe in HTTP parlance), or idempotent,
* or neither? HTTP based RPC implementation may choose GET verb for safe
* methods, and PUT verb for idempotent methods instead of the default POST.
*
* @generated from enum google.protobuf.MethodOptions.IdempotencyLevel
*/
var MethodOptions_IdempotencyLevel;
(function(MethodOptions_IdempotencyLevel$1) {
	/**
	* @generated from enum value: IDEMPOTENCY_UNKNOWN = 0;
	*/
	MethodOptions_IdempotencyLevel$1[MethodOptions_IdempotencyLevel$1["IDEMPOTENCY_UNKNOWN"] = 0] = "IDEMPOTENCY_UNKNOWN";
	/**
	* implies idempotent
	*
	* @generated from enum value: NO_SIDE_EFFECTS = 1;
	*/
	MethodOptions_IdempotencyLevel$1[MethodOptions_IdempotencyLevel$1["NO_SIDE_EFFECTS"] = 1] = "NO_SIDE_EFFECTS";
	/**
	* idempotent, but may have side effects
	*
	* @generated from enum value: IDEMPOTENT = 2;
	*/
	MethodOptions_IdempotencyLevel$1[MethodOptions_IdempotencyLevel$1["IDEMPOTENT"] = 2] = "IDEMPOTENT";
})(MethodOptions_IdempotencyLevel || (MethodOptions_IdempotencyLevel = {}));
/**
* @generated from enum google.protobuf.FeatureSet.VisibilityFeature.DefaultSymbolVisibility
*/
var FeatureSet_VisibilityFeature_DefaultSymbolVisibility;
(function(FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1) {
	/**
	* @generated from enum value: DEFAULT_SYMBOL_VISIBILITY_UNKNOWN = 0;
	*/
	FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1[FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1["DEFAULT_SYMBOL_VISIBILITY_UNKNOWN"] = 0] = "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN";
	/**
	* Default pre-EDITION_2024, all UNSET visibility are export.
	*
	* @generated from enum value: EXPORT_ALL = 1;
	*/
	FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1[FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1["EXPORT_ALL"] = 1] = "EXPORT_ALL";
	/**
	* All top-level symbols default to export, nested default to local.
	*
	* @generated from enum value: EXPORT_TOP_LEVEL = 2;
	*/
	FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1[FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1["EXPORT_TOP_LEVEL"] = 2] = "EXPORT_TOP_LEVEL";
	/**
	* All symbols default to local.
	*
	* @generated from enum value: LOCAL_ALL = 3;
	*/
	FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1[FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1["LOCAL_ALL"] = 3] = "LOCAL_ALL";
	/**
	* All symbols local by default. Nested types cannot be exported.
	* With special case caveat for message { enum {} reserved 1 to max; }
	* This is the recommended setting for new protos.
	*
	* @generated from enum value: STRICT = 4;
	*/
	FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1[FeatureSet_VisibilityFeature_DefaultSymbolVisibility$1["STRICT"] = 4] = "STRICT";
})(FeatureSet_VisibilityFeature_DefaultSymbolVisibility || (FeatureSet_VisibilityFeature_DefaultSymbolVisibility = {}));
/**
* @generated from enum google.protobuf.FeatureSet.FieldPresence
*/
var FeatureSet_FieldPresence;
(function(FeatureSet_FieldPresence$1) {
	/**
	* @generated from enum value: FIELD_PRESENCE_UNKNOWN = 0;
	*/
	FeatureSet_FieldPresence$1[FeatureSet_FieldPresence$1["FIELD_PRESENCE_UNKNOWN"] = 0] = "FIELD_PRESENCE_UNKNOWN";
	/**
	* @generated from enum value: EXPLICIT = 1;
	*/
	FeatureSet_FieldPresence$1[FeatureSet_FieldPresence$1["EXPLICIT"] = 1] = "EXPLICIT";
	/**
	* @generated from enum value: IMPLICIT = 2;
	*/
	FeatureSet_FieldPresence$1[FeatureSet_FieldPresence$1["IMPLICIT"] = 2] = "IMPLICIT";
	/**
	* @generated from enum value: LEGACY_REQUIRED = 3;
	*/
	FeatureSet_FieldPresence$1[FeatureSet_FieldPresence$1["LEGACY_REQUIRED"] = 3] = "LEGACY_REQUIRED";
})(FeatureSet_FieldPresence || (FeatureSet_FieldPresence = {}));
/**
* @generated from enum google.protobuf.FeatureSet.EnumType
*/
var FeatureSet_EnumType;
(function(FeatureSet_EnumType$1) {
	/**
	* @generated from enum value: ENUM_TYPE_UNKNOWN = 0;
	*/
	FeatureSet_EnumType$1[FeatureSet_EnumType$1["ENUM_TYPE_UNKNOWN"] = 0] = "ENUM_TYPE_UNKNOWN";
	/**
	* @generated from enum value: OPEN = 1;
	*/
	FeatureSet_EnumType$1[FeatureSet_EnumType$1["OPEN"] = 1] = "OPEN";
	/**
	* @generated from enum value: CLOSED = 2;
	*/
	FeatureSet_EnumType$1[FeatureSet_EnumType$1["CLOSED"] = 2] = "CLOSED";
})(FeatureSet_EnumType || (FeatureSet_EnumType = {}));
/**
* @generated from enum google.protobuf.FeatureSet.RepeatedFieldEncoding
*/
var FeatureSet_RepeatedFieldEncoding;
(function(FeatureSet_RepeatedFieldEncoding$1) {
	/**
	* @generated from enum value: REPEATED_FIELD_ENCODING_UNKNOWN = 0;
	*/
	FeatureSet_RepeatedFieldEncoding$1[FeatureSet_RepeatedFieldEncoding$1["REPEATED_FIELD_ENCODING_UNKNOWN"] = 0] = "REPEATED_FIELD_ENCODING_UNKNOWN";
	/**
	* @generated from enum value: PACKED = 1;
	*/
	FeatureSet_RepeatedFieldEncoding$1[FeatureSet_RepeatedFieldEncoding$1["PACKED"] = 1] = "PACKED";
	/**
	* @generated from enum value: EXPANDED = 2;
	*/
	FeatureSet_RepeatedFieldEncoding$1[FeatureSet_RepeatedFieldEncoding$1["EXPANDED"] = 2] = "EXPANDED";
})(FeatureSet_RepeatedFieldEncoding || (FeatureSet_RepeatedFieldEncoding = {}));
/**
* @generated from enum google.protobuf.FeatureSet.Utf8Validation
*/
var FeatureSet_Utf8Validation;
(function(FeatureSet_Utf8Validation$1) {
	/**
	* @generated from enum value: UTF8_VALIDATION_UNKNOWN = 0;
	*/
	FeatureSet_Utf8Validation$1[FeatureSet_Utf8Validation$1["UTF8_VALIDATION_UNKNOWN"] = 0] = "UTF8_VALIDATION_UNKNOWN";
	/**
	* @generated from enum value: VERIFY = 2;
	*/
	FeatureSet_Utf8Validation$1[FeatureSet_Utf8Validation$1["VERIFY"] = 2] = "VERIFY";
	/**
	* @generated from enum value: NONE = 3;
	*/
	FeatureSet_Utf8Validation$1[FeatureSet_Utf8Validation$1["NONE"] = 3] = "NONE";
})(FeatureSet_Utf8Validation || (FeatureSet_Utf8Validation = {}));
/**
* @generated from enum google.protobuf.FeatureSet.MessageEncoding
*/
var FeatureSet_MessageEncoding;
(function(FeatureSet_MessageEncoding$1) {
	/**
	* @generated from enum value: MESSAGE_ENCODING_UNKNOWN = 0;
	*/
	FeatureSet_MessageEncoding$1[FeatureSet_MessageEncoding$1["MESSAGE_ENCODING_UNKNOWN"] = 0] = "MESSAGE_ENCODING_UNKNOWN";
	/**
	* @generated from enum value: LENGTH_PREFIXED = 1;
	*/
	FeatureSet_MessageEncoding$1[FeatureSet_MessageEncoding$1["LENGTH_PREFIXED"] = 1] = "LENGTH_PREFIXED";
	/**
	* @generated from enum value: DELIMITED = 2;
	*/
	FeatureSet_MessageEncoding$1[FeatureSet_MessageEncoding$1["DELIMITED"] = 2] = "DELIMITED";
})(FeatureSet_MessageEncoding || (FeatureSet_MessageEncoding = {}));
/**
* @generated from enum google.protobuf.FeatureSet.JsonFormat
*/
var FeatureSet_JsonFormat;
(function(FeatureSet_JsonFormat$1) {
	/**
	* @generated from enum value: JSON_FORMAT_UNKNOWN = 0;
	*/
	FeatureSet_JsonFormat$1[FeatureSet_JsonFormat$1["JSON_FORMAT_UNKNOWN"] = 0] = "JSON_FORMAT_UNKNOWN";
	/**
	* @generated from enum value: ALLOW = 1;
	*/
	FeatureSet_JsonFormat$1[FeatureSet_JsonFormat$1["ALLOW"] = 1] = "ALLOW";
	/**
	* @generated from enum value: LEGACY_BEST_EFFORT = 2;
	*/
	FeatureSet_JsonFormat$1[FeatureSet_JsonFormat$1["LEGACY_BEST_EFFORT"] = 2] = "LEGACY_BEST_EFFORT";
})(FeatureSet_JsonFormat || (FeatureSet_JsonFormat = {}));
/**
* @generated from enum google.protobuf.FeatureSet.EnforceNamingStyle
*/
var FeatureSet_EnforceNamingStyle;
(function(FeatureSet_EnforceNamingStyle$1) {
	/**
	* @generated from enum value: ENFORCE_NAMING_STYLE_UNKNOWN = 0;
	*/
	FeatureSet_EnforceNamingStyle$1[FeatureSet_EnforceNamingStyle$1["ENFORCE_NAMING_STYLE_UNKNOWN"] = 0] = "ENFORCE_NAMING_STYLE_UNKNOWN";
	/**
	* @generated from enum value: STYLE2024 = 1;
	*/
	FeatureSet_EnforceNamingStyle$1[FeatureSet_EnforceNamingStyle$1["STYLE2024"] = 1] = "STYLE2024";
	/**
	* @generated from enum value: STYLE_LEGACY = 2;
	*/
	FeatureSet_EnforceNamingStyle$1[FeatureSet_EnforceNamingStyle$1["STYLE_LEGACY"] = 2] = "STYLE_LEGACY";
})(FeatureSet_EnforceNamingStyle || (FeatureSet_EnforceNamingStyle = {}));
/**
* Represents the identified object's effect on the element in the original
* .proto file.
*
* @generated from enum google.protobuf.GeneratedCodeInfo.Annotation.Semantic
*/
var GeneratedCodeInfo_Annotation_Semantic;
(function(GeneratedCodeInfo_Annotation_Semantic$1) {
	/**
	* There is no effect or the effect is indescribable.
	*
	* @generated from enum value: NONE = 0;
	*/
	GeneratedCodeInfo_Annotation_Semantic$1[GeneratedCodeInfo_Annotation_Semantic$1["NONE"] = 0] = "NONE";
	/**
	* The element is set or otherwise mutated.
	*
	* @generated from enum value: SET = 1;
	*/
	GeneratedCodeInfo_Annotation_Semantic$1[GeneratedCodeInfo_Annotation_Semantic$1["SET"] = 1] = "SET";
	/**
	* An alias to the element is returned.
	*
	* @generated from enum value: ALIAS = 2;
	*/
	GeneratedCodeInfo_Annotation_Semantic$1[GeneratedCodeInfo_Annotation_Semantic$1["ALIAS"] = 2] = "ALIAS";
})(GeneratedCodeInfo_Annotation_Semantic || (GeneratedCodeInfo_Annotation_Semantic = {}));
/**
* The full set of known editions.
*
* @generated from enum google.protobuf.Edition
*/
var Edition;
(function(Edition$1) {
	/**
	* A placeholder for an unknown edition value.
	*
	* @generated from enum value: EDITION_UNKNOWN = 0;
	*/
	Edition$1[Edition$1["EDITION_UNKNOWN"] = 0] = "EDITION_UNKNOWN";
	/**
	* A placeholder edition for specifying default behaviors *before* a feature
	* was first introduced.  This is effectively an "infinite past".
	*
	* @generated from enum value: EDITION_LEGACY = 900;
	*/
	Edition$1[Edition$1["EDITION_LEGACY"] = 900] = "EDITION_LEGACY";
	/**
	* Legacy syntax "editions".  These pre-date editions, but behave much like
	* distinct editions.  These can't be used to specify the edition of proto
	* files, but feature definitions must supply proto2/proto3 defaults for
	* backwards compatibility.
	*
	* @generated from enum value: EDITION_PROTO2 = 998;
	*/
	Edition$1[Edition$1["EDITION_PROTO2"] = 998] = "EDITION_PROTO2";
	/**
	* @generated from enum value: EDITION_PROTO3 = 999;
	*/
	Edition$1[Edition$1["EDITION_PROTO3"] = 999] = "EDITION_PROTO3";
	/**
	* Editions that have been released.  The specific values are arbitrary and
	* should not be depended on, but they will always be time-ordered for easy
	* comparison.
	*
	* @generated from enum value: EDITION_2023 = 1000;
	*/
	Edition$1[Edition$1["EDITION_2023"] = 1e3] = "EDITION_2023";
	/**
	* @generated from enum value: EDITION_2024 = 1001;
	*/
	Edition$1[Edition$1["EDITION_2024"] = 1001] = "EDITION_2024";
	/**
	* Placeholder editions for testing feature resolution.  These should not be
	* used or relied on outside of tests.
	*
	* @generated from enum value: EDITION_1_TEST_ONLY = 1;
	*/
	Edition$1[Edition$1["EDITION_1_TEST_ONLY"] = 1] = "EDITION_1_TEST_ONLY";
	/**
	* @generated from enum value: EDITION_2_TEST_ONLY = 2;
	*/
	Edition$1[Edition$1["EDITION_2_TEST_ONLY"] = 2] = "EDITION_2_TEST_ONLY";
	/**
	* @generated from enum value: EDITION_99997_TEST_ONLY = 99997;
	*/
	Edition$1[Edition$1["EDITION_99997_TEST_ONLY"] = 99997] = "EDITION_99997_TEST_ONLY";
	/**
	* @generated from enum value: EDITION_99998_TEST_ONLY = 99998;
	*/
	Edition$1[Edition$1["EDITION_99998_TEST_ONLY"] = 99998] = "EDITION_99998_TEST_ONLY";
	/**
	* @generated from enum value: EDITION_99999_TEST_ONLY = 99999;
	*/
	Edition$1[Edition$1["EDITION_99999_TEST_ONLY"] = 99999] = "EDITION_99999_TEST_ONLY";
	/**
	* Placeholder for specifying unbounded edition support.  This should only
	* ever be used by plugins that can expect to never require any changes to
	* support a new edition.
	*
	* @generated from enum value: EDITION_MAX = 2147483647;
	*/
	Edition$1[Edition$1["EDITION_MAX"] = 2147483647] = "EDITION_MAX";
})(Edition || (Edition = {}));
/**
* Describes the 'visibility' of a symbol with respect to the proto import
* system. Symbols can only be imported when the visibility rules do not prevent
* it (ex: local symbols cannot be imported).  Visibility modifiers can only set
* on `message` and `enum` as they are the only types available to be referenced
* from other files.
*
* @generated from enum google.protobuf.SymbolVisibility
*/
var SymbolVisibility;
(function(SymbolVisibility$1) {
	/**
	* @generated from enum value: VISIBILITY_UNSET = 0;
	*/
	SymbolVisibility$1[SymbolVisibility$1["VISIBILITY_UNSET"] = 0] = "VISIBILITY_UNSET";
	/**
	* @generated from enum value: VISIBILITY_LOCAL = 1;
	*/
	SymbolVisibility$1[SymbolVisibility$1["VISIBILITY_LOCAL"] = 1] = "VISIBILITY_LOCAL";
	/**
	* @generated from enum value: VISIBILITY_EXPORT = 2;
	*/
	SymbolVisibility$1[SymbolVisibility$1["VISIBILITY_EXPORT"] = 2] = "VISIBILITY_EXPORT";
})(SymbolVisibility || (SymbolVisibility = {}));

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/from-binary.js
const readDefaults = { readUnknownFields: true };
function makeReadOptions(options) {
	return options ? Object.assign(Object.assign({}, readDefaults), options) : readDefaults;
}
/**
* Parse serialized binary data.
*/
function fromBinary(schema, bytes, options) {
	const msg = reflect(schema, void 0, false);
	readMessage(msg, new BinaryReader(bytes), makeReadOptions(options), false, bytes.byteLength);
	return msg.message;
}
/**
* If `delimited` is false, read the length given in `lengthOrDelimitedFieldNo`.
*
* If `delimited` is true, read until an EndGroup tag. `lengthOrDelimitedFieldNo`
* is the expected field number.
*
* @private
*/
function readMessage(message, reader, options, delimited, lengthOrDelimitedFieldNo) {
	var _a;
	const end = delimited ? reader.len : reader.pos + lengthOrDelimitedFieldNo;
	let fieldNo;
	let wireType;
	const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
	while (reader.pos < end) {
		[fieldNo, wireType] = reader.tag();
		if (delimited && wireType == WireType.EndGroup) break;
		const field = message.findNumber(fieldNo);
		if (!field) {
			const data = reader.skip(wireType, fieldNo);
			if (options.readUnknownFields) unknownFields.push({
				no: fieldNo,
				wireType,
				data
			});
			continue;
		}
		readField(message, reader, field, wireType, options);
	}
	if (delimited) {
		if (wireType != WireType.EndGroup || fieldNo !== lengthOrDelimitedFieldNo) throw new Error("invalid end group tag");
	}
	if (unknownFields.length > 0) message.setUnknown(unknownFields);
}
/**
* @private
*/
function readField(message, reader, field, wireType, options) {
	var _a;
	switch (field.fieldKind) {
		case "scalar":
			message.set(field, readScalar(reader, field.scalar));
			break;
		case "enum":
			const val = readScalar(reader, ScalarType.INT32);
			if (field.enum.open) message.set(field, val);
			else {
				const ok = field.enum.values.some((v) => v.number === val);
				if (ok) message.set(field, val);
				else if (options.readUnknownFields) {
					const bytes = [];
					varint32write(val, bytes);
					const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
					unknownFields.push({
						no: field.number,
						wireType,
						data: new Uint8Array(bytes)
					});
					message.setUnknown(unknownFields);
				}
			}
			break;
		case "message":
			message.set(field, readMessageField(reader, options, field, message.get(field)));
			break;
		case "list":
			readListField(reader, wireType, message.get(field), options);
			break;
		case "map":
			readMapEntry(reader, message.get(field), options);
			break;
	}
}
function readMapEntry(reader, map, options) {
	const field = map.field();
	let key;
	let val;
	const len = reader.uint32();
	const end = reader.pos + len;
	while (reader.pos < end) {
		const [fieldNo] = reader.tag();
		switch (fieldNo) {
			case 1:
				key = readScalar(reader, field.mapKey);
				break;
			case 2:
				switch (field.mapKind) {
					case "scalar":
						val = readScalar(reader, field.scalar);
						break;
					case "enum":
						val = reader.int32();
						break;
					case "message":
						val = readMessageField(reader, options, field);
						break;
				}
				break;
		}
	}
	if (key === void 0) key = scalarZeroValue(field.mapKey, false);
	if (val === void 0) switch (field.mapKind) {
		case "scalar":
			val = scalarZeroValue(field.scalar, false);
			break;
		case "enum":
			val = field.enum.values[0].number;
			break;
		case "message":
			val = reflect(field.message, void 0, false);
			break;
	}
	map.set(key, val);
}
function readListField(reader, wireType, list, options) {
	var _a;
	const field = list.field();
	if (field.listKind === "message") {
		list.add(readMessageField(reader, options, field));
		return;
	}
	const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
	const packed = wireType == WireType.LengthDelimited && scalarType != ScalarType.STRING && scalarType != ScalarType.BYTES;
	if (!packed) {
		list.add(readScalar(reader, scalarType));
		return;
	}
	const e = reader.uint32() + reader.pos;
	while (reader.pos < e) list.add(readScalar(reader, scalarType));
}
function readMessageField(reader, options, field, mergeMessage) {
	const delimited = field.delimitedEncoding;
	const message = mergeMessage !== null && mergeMessage !== void 0 ? mergeMessage : reflect(field.message, void 0, false);
	readMessage(message, reader, options, delimited, delimited ? field.number : reader.uint32());
	return message;
}
function readScalar(reader, type) {
	switch (type) {
		case ScalarType.STRING: return reader.string();
		case ScalarType.BOOL: return reader.bool();
		case ScalarType.DOUBLE: return reader.double();
		case ScalarType.FLOAT: return reader.float();
		case ScalarType.INT32: return reader.int32();
		case ScalarType.INT64: return reader.int64();
		case ScalarType.UINT64: return reader.uint64();
		case ScalarType.FIXED64: return reader.fixed64();
		case ScalarType.BYTES: return reader.bytes();
		case ScalarType.FIXED32: return reader.fixed32();
		case ScalarType.SFIXED32: return reader.sfixed32();
		case ScalarType.SFIXED64: return reader.sfixed64();
		case ScalarType.SINT64: return reader.sint64();
		case ScalarType.UINT32: return reader.uint32();
		case ScalarType.SINT32: return reader.sint32();
	}
}

//#endregion
//#region ../../node_modules/.pnpm/@bufbuild+protobuf@2.9.0/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/file.js
/**
* Hydrate a file descriptor.
*
* @private
*/
function fileDesc(b64, imports) {
	var _a;
	const root = fromBinary(FileDescriptorProtoSchema, base64Decode(b64));
	root.messageType.forEach(restoreJsonNames);
	root.dependency = (_a = imports === null || imports === void 0 ? void 0 : imports.map((f) => f.proto.name)) !== null && _a !== void 0 ? _a : [];
	const reg = createFileRegistry(root, (protoFileName) => imports === null || imports === void 0 ? void 0 : imports.find((f) => f.proto.name === protoFileName));
	return reg.getFile(root.name);
}

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/channel_pb.js
var channel_pb_exports = {};
__export(channel_pb_exports, {
	ChannelSchema: () => ChannelSchema,
	ChannelSettingsSchema: () => ChannelSettingsSchema,
	Channel_Role: () => Channel_Role,
	Channel_RoleSchema: () => Channel_RoleSchema,
	ModuleSettingsSchema: () => ModuleSettingsSchema,
	file_meshtastic_channel: () => file_meshtastic_channel
});
/**
* Describes the file meshtastic/channel.proto.
*/ const file_meshtastic_channel = /* @__PURE__ */ fileDesc("ChhtZXNodGFzdGljL2NoYW5uZWwucHJvdG8SCm1lc2h0YXN0aWMixgEKD0NoYW5uZWxTZXR0aW5ncxIXCgtjaGFubmVsX251bRgBIAEoDUICGAESCwoDcHNrGAIgASgMEgwKBG5hbWUYAyABKAkSCgoCaWQYBCABKAcSFgoOdXBsaW5rX2VuYWJsZWQYBSABKAgSGAoQZG93bmxpbmtfZW5hYmxlZBgGIAEoCBIzCg9tb2R1bGVfc2V0dGluZ3MYByABKAsyGi5tZXNodGFzdGljLk1vZHVsZVNldHRpbmdzEgwKBG11dGUYCCABKAgiRQoOTW9kdWxlU2V0dGluZ3MSGgoScG9zaXRpb25fcHJlY2lzaW9uGAEgASgNEhcKD2lzX2NsaWVudF9tdXRlZBgCIAEoCCKhAQoHQ2hhbm5lbBINCgVpbmRleBgBIAEoBRItCghzZXR0aW5ncxgCIAEoCzIbLm1lc2h0YXN0aWMuQ2hhbm5lbFNldHRpbmdzEiYKBHJvbGUYAyABKA4yGC5tZXNodGFzdGljLkNoYW5uZWwuUm9sZSIwCgRSb2xlEgwKCERJU0FCTEVEEAASCwoHUFJJTUFSWRABEg0KCVNFQ09OREFSWRACQmIKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCDUNoYW5uZWxQcm90b3NaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z");
/**
* Describes the message meshtastic.ChannelSettings.
* Use `create(ChannelSettingsSchema)` to create a new message.
*/ const ChannelSettingsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_channel, 0);
/**
* Describes the message meshtastic.ModuleSettings.
* Use `create(ModuleSettingsSchema)` to create a new message.
*/ const ModuleSettingsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_channel, 1);
/**
* Describes the message meshtastic.Channel.
* Use `create(ChannelSchema)` to create a new message.
*/ const ChannelSchema = /* @__PURE__ */ messageDesc(file_meshtastic_channel, 2);
/**
*
* How this channel is being used (or not).
* Note: this field is an enum to give us options for the future.
* In particular, someday we might make a 'SCANNING' option.
* SCANNING channels could have different frequencies and the radio would
* occasionally check that freq to see if anything is being transmitted.
* For devices that have multiple physical radios attached, we could keep multiple PRIMARY/SCANNING channels active at once to allow
* cross band routing as needed.
* If a device has only a single radio (the common case) only one channel can be PRIMARY at a time
* (but any number of SECONDARY channels can't be sent received on that common frequency)
*
* @generated from enum meshtastic.Channel.Role
*/ var Channel_Role = /* @__PURE__ */ function(Channel_Role$1) {
	/**
	*
	* This channel is not in use right now
	*
	* @generated from enum value: DISABLED = 0;
	*/ Channel_Role$1[Channel_Role$1["DISABLED"] = 0] = "DISABLED";
	/**
	*
	* This channel is used to set the frequency for the radio - all other enabled channels must be SECONDARY
	*
	* @generated from enum value: PRIMARY = 1;
	*/ Channel_Role$1[Channel_Role$1["PRIMARY"] = 1] = "PRIMARY";
	/**
	*
	* Secondary channels are only used for encryption/decryption/authentication purposes.
	* Their radio settings (freq etc) are ignored, only psk is used.
	*
	* @generated from enum value: SECONDARY = 2;
	*/ Channel_Role$1[Channel_Role$1["SECONDARY"] = 2] = "SECONDARY";
	return Channel_Role$1;
}({});
/**
* Describes the enum meshtastic.Channel.Role.
*/ const Channel_RoleSchema = /* @__PURE__ */ enumDesc(file_meshtastic_channel, 2, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/device_ui_pb.js
/**
* Describes the file meshtastic/device_ui.proto.
*/ const file_meshtastic_device_ui = /* @__PURE__ */ fileDesc("ChptZXNodGFzdGljL2RldmljZV91aS5wcm90bxIKbWVzaHRhc3RpYyLABQoORGV2aWNlVUlDb25maWcSDwoHdmVyc2lvbhgBIAEoDRIZChFzY3JlZW5fYnJpZ2h0bmVzcxgCIAEoDRIWCg5zY3JlZW5fdGltZW91dBgDIAEoDRITCgtzY3JlZW5fbG9jaxgEIAEoCBIVCg1zZXR0aW5nc19sb2NrGAUgASgIEhAKCHBpbl9jb2RlGAYgASgNEiAKBXRoZW1lGAcgASgOMhEubWVzaHRhc3RpYy5UaGVtZRIVCg1hbGVydF9lbmFibGVkGAggASgIEhYKDmJhbm5lcl9lbmFibGVkGAkgASgIEhQKDHJpbmdfdG9uZV9pZBgKIAEoDRImCghsYW5ndWFnZRgLIAEoDjIULm1lc2h0YXN0aWMuTGFuZ3VhZ2USKwoLbm9kZV9maWx0ZXIYDCABKAsyFi5tZXNodGFzdGljLk5vZGVGaWx0ZXISMQoObm9kZV9oaWdobGlnaHQYDSABKAsyGS5tZXNodGFzdGljLk5vZGVIaWdobGlnaHQSGAoQY2FsaWJyYXRpb25fZGF0YRgOIAEoDBIhCghtYXBfZGF0YRgPIAEoCzIPLm1lc2h0YXN0aWMuTWFwEi0KDGNvbXBhc3NfbW9kZRgQIAEoDjIXLm1lc2h0YXN0aWMuQ29tcGFzc01vZGUSGAoQc2NyZWVuX3JnYl9jb2xvchgRIAEoDRIbChNpc19jbG9ja2ZhY2VfYW5hbG9nGBIgASgIEkIKCmdwc19mb3JtYXQYEyABKA4yLi5tZXNodGFzdGljLkRldmljZVVJQ29uZmlnLkdwc0Nvb3JkaW5hdGVGb3JtYXQiVgoTR3BzQ29vcmRpbmF0ZUZvcm1hdBIHCgNERUMQABIHCgNETVMQARIHCgNVVE0QAhIICgRNR1JTEAMSBwoDT0xDEAQSCAoET1NHUhAFEgcKA01MUxAGIqcBCgpOb2RlRmlsdGVyEhYKDnVua25vd25fc3dpdGNoGAEgASgIEhYKDm9mZmxpbmVfc3dpdGNoGAIgASgIEhkKEXB1YmxpY19rZXlfc3dpdGNoGAMgASgIEhEKCWhvcHNfYXdheRgEIAEoBRIXCg9wb3NpdGlvbl9zd2l0Y2gYBSABKAgSEQoJbm9kZV9uYW1lGAYgASgJEg8KB2NoYW5uZWwYByABKAUifgoNTm9kZUhpZ2hsaWdodBITCgtjaGF0X3N3aXRjaBgBIAEoCBIXCg9wb3NpdGlvbl9zd2l0Y2gYAiABKAgSGAoQdGVsZW1ldHJ5X3N3aXRjaBgDIAEoCBISCgppYXFfc3dpdGNoGAQgASgIEhEKCW5vZGVfbmFtZRgFIAEoCSI9CghHZW9Qb2ludBIMCgR6b29tGAEgASgFEhAKCGxhdGl0dWRlGAIgASgFEhEKCWxvbmdpdHVkZRgDIAEoBSJMCgNNYXASIgoEaG9tZRgBIAEoCzIULm1lc2h0YXN0aWMuR2VvUG9pbnQSDQoFc3R5bGUYAiABKAkSEgoKZm9sbG93X2dwcxgDIAEoCCo+CgtDb21wYXNzTW9kZRILCgdEWU5BTUlDEAASDgoKRklYRURfUklORxABEhIKDkZSRUVaRV9IRUFESU5HEAIqJQoFVGhlbWUSCAoEREFSSxAAEgkKBUxJR0hUEAESBwoDUkVEEAIqwAIKCExhbmd1YWdlEgsKB0VOR0xJU0gQABIKCgZGUkVOQ0gQARIKCgZHRVJNQU4QAhILCgdJVEFMSUFOEAMSDgoKUE9SVFVHVUVTRRAEEgsKB1NQQU5JU0gQBRILCgdTV0VESVNIEAYSCwoHRklOTklTSBAHEgoKBlBPTElTSBAIEgsKB1RVUktJU0gQCRILCgdTRVJCSUFOEAoSCwoHUlVTU0lBThALEgkKBURVVENIEAwSCQoFR1JFRUsQDRINCglOT1JXRUdJQU4QDhINCglTTE9WRU5JQU4QDxINCglVS1JBSU5JQU4QEBINCglCVUxHQVJJQU4QERIJCgVDWkVDSBASEgoKBkRBTklTSBATEhYKElNJTVBMSUZJRURfQ0hJTkVTRRAeEhcKE1RSQURJVElPTkFMX0NISU5FU0UQH0JjChNjb20uZ2Vla3N2aWxsZS5tZXNoQg5EZXZpY2VVSVByb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM");

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/config_pb.js
var config_pb_exports = {};
__export(config_pb_exports, {
	ConfigSchema: () => ConfigSchema,
	Config_BluetoothConfigSchema: () => Config_BluetoothConfigSchema,
	Config_BluetoothConfig_PairingMode: () => Config_BluetoothConfig_PairingMode,
	Config_BluetoothConfig_PairingModeSchema: () => Config_BluetoothConfig_PairingModeSchema,
	Config_DeviceConfigSchema: () => Config_DeviceConfigSchema,
	Config_DeviceConfig_BuzzerMode: () => Config_DeviceConfig_BuzzerMode,
	Config_DeviceConfig_BuzzerModeSchema: () => Config_DeviceConfig_BuzzerModeSchema,
	Config_DeviceConfig_RebroadcastMode: () => Config_DeviceConfig_RebroadcastMode,
	Config_DeviceConfig_RebroadcastModeSchema: () => Config_DeviceConfig_RebroadcastModeSchema,
	Config_DeviceConfig_Role: () => Config_DeviceConfig_Role,
	Config_DeviceConfig_RoleSchema: () => Config_DeviceConfig_RoleSchema,
	Config_DisplayConfigSchema: () => Config_DisplayConfigSchema,
	Config_DisplayConfig_CompassOrientation: () => Config_DisplayConfig_CompassOrientation,
	Config_DisplayConfig_CompassOrientationSchema: () => Config_DisplayConfig_CompassOrientationSchema,
	Config_DisplayConfig_DeprecatedGpsCoordinateFormat: () => Config_DisplayConfig_DeprecatedGpsCoordinateFormat,
	Config_DisplayConfig_DeprecatedGpsCoordinateFormatSchema: () => Config_DisplayConfig_DeprecatedGpsCoordinateFormatSchema,
	Config_DisplayConfig_DisplayMode: () => Config_DisplayConfig_DisplayMode,
	Config_DisplayConfig_DisplayModeSchema: () => Config_DisplayConfig_DisplayModeSchema,
	Config_DisplayConfig_DisplayUnits: () => Config_DisplayConfig_DisplayUnits,
	Config_DisplayConfig_DisplayUnitsSchema: () => Config_DisplayConfig_DisplayUnitsSchema,
	Config_DisplayConfig_OledType: () => Config_DisplayConfig_OledType,
	Config_DisplayConfig_OledTypeSchema: () => Config_DisplayConfig_OledTypeSchema,
	Config_LoRaConfigSchema: () => Config_LoRaConfigSchema,
	Config_LoRaConfig_ModemPreset: () => Config_LoRaConfig_ModemPreset,
	Config_LoRaConfig_ModemPresetSchema: () => Config_LoRaConfig_ModemPresetSchema,
	Config_LoRaConfig_RegionCode: () => Config_LoRaConfig_RegionCode,
	Config_LoRaConfig_RegionCodeSchema: () => Config_LoRaConfig_RegionCodeSchema,
	Config_NetworkConfigSchema: () => Config_NetworkConfigSchema,
	Config_NetworkConfig_AddressMode: () => Config_NetworkConfig_AddressMode,
	Config_NetworkConfig_AddressModeSchema: () => Config_NetworkConfig_AddressModeSchema,
	Config_NetworkConfig_IpV4ConfigSchema: () => Config_NetworkConfig_IpV4ConfigSchema,
	Config_NetworkConfig_ProtocolFlags: () => Config_NetworkConfig_ProtocolFlags,
	Config_NetworkConfig_ProtocolFlagsSchema: () => Config_NetworkConfig_ProtocolFlagsSchema,
	Config_PositionConfigSchema: () => Config_PositionConfigSchema,
	Config_PositionConfig_GpsMode: () => Config_PositionConfig_GpsMode,
	Config_PositionConfig_GpsModeSchema: () => Config_PositionConfig_GpsModeSchema,
	Config_PositionConfig_PositionFlags: () => Config_PositionConfig_PositionFlags,
	Config_PositionConfig_PositionFlagsSchema: () => Config_PositionConfig_PositionFlagsSchema,
	Config_PowerConfigSchema: () => Config_PowerConfigSchema,
	Config_SecurityConfigSchema: () => Config_SecurityConfigSchema,
	Config_SessionkeyConfigSchema: () => Config_SessionkeyConfigSchema,
	file_meshtastic_config: () => file_meshtastic_config
});
/**
* Describes the file meshtastic/config.proto.
*/ const file_meshtastic_config = /* @__PURE__ */ fileDesc("ChdtZXNodGFzdGljL2NvbmZpZy5wcm90bxIKbWVzaHRhc3RpYyKNKQoGQ29uZmlnEjEKBmRldmljZRgBIAEoCzIfLm1lc2h0YXN0aWMuQ29uZmlnLkRldmljZUNvbmZpZ0gAEjUKCHBvc2l0aW9uGAIgASgLMiEubWVzaHRhc3RpYy5Db25maWcuUG9zaXRpb25Db25maWdIABIvCgVwb3dlchgDIAEoCzIeLm1lc2h0YXN0aWMuQ29uZmlnLlBvd2VyQ29uZmlnSAASMwoHbmV0d29yaxgEIAEoCzIgLm1lc2h0YXN0aWMuQ29uZmlnLk5ldHdvcmtDb25maWdIABIzCgdkaXNwbGF5GAUgASgLMiAubWVzaHRhc3RpYy5Db25maWcuRGlzcGxheUNvbmZpZ0gAEi0KBGxvcmEYBiABKAsyHS5tZXNodGFzdGljLkNvbmZpZy5Mb1JhQ29uZmlnSAASNwoJYmx1ZXRvb3RoGAcgASgLMiIubWVzaHRhc3RpYy5Db25maWcuQmx1ZXRvb3RoQ29uZmlnSAASNQoIc2VjdXJpdHkYCCABKAsyIS5tZXNodGFzdGljLkNvbmZpZy5TZWN1cml0eUNvbmZpZ0gAEjkKCnNlc3Npb25rZXkYCSABKAsyIy5tZXNodGFzdGljLkNvbmZpZy5TZXNzaW9ua2V5Q29uZmlnSAASLwoJZGV2aWNlX3VpGAogASgLMhoubWVzaHRhc3RpYy5EZXZpY2VVSUNvbmZpZ0gAGvYGCgxEZXZpY2VDb25maWcSMgoEcm9sZRgBIAEoDjIkLm1lc2h0YXN0aWMuQ29uZmlnLkRldmljZUNvbmZpZy5Sb2xlEhoKDnNlcmlhbF9lbmFibGVkGAIgASgIQgIYARITCgtidXR0b25fZ3BpbxgEIAEoDRITCgtidXp6ZXJfZ3BpbxgFIAEoDRJJChByZWJyb2FkY2FzdF9tb2RlGAYgASgOMi8ubWVzaHRhc3RpYy5Db25maWcuRGV2aWNlQ29uZmlnLlJlYnJvYWRjYXN0TW9kZRIgChhub2RlX2luZm9fYnJvYWRjYXN0X3NlY3MYByABKA0SIgoaZG91YmxlX3RhcF9hc19idXR0b25fcHJlc3MYCCABKAgSFgoKaXNfbWFuYWdlZBgJIAEoCEICGAESHAoUZGlzYWJsZV90cmlwbGVfY2xpY2sYCiABKAgSDQoFdHpkZWYYCyABKAkSHgoWbGVkX2hlYXJ0YmVhdF9kaXNhYmxlZBgMIAEoCBI/CgtidXp6ZXJfbW9kZRgNIAEoDjIqLm1lc2h0YXN0aWMuQ29uZmlnLkRldmljZUNvbmZpZy5CdXp6ZXJNb2RlItQBCgRSb2xlEgoKBkNMSUVOVBAAEg8KC0NMSUVOVF9NVVRFEAESCgoGUk9VVEVSEAISFQoNUk9VVEVSX0NMSUVOVBADGgIIARIQCghSRVBFQVRFUhAEGgIIARILCgdUUkFDS0VSEAUSCgoGU0VOU09SEAYSBwoDVEFLEAcSEQoNQ0xJRU5UX0hJRERFThAIEhIKDkxPU1RfQU5EX0ZPVU5EEAkSDwoLVEFLX1RSQUNLRVIQChIPCgtST1VURVJfTEFURRALEg8KC0NMSUVOVF9CQVNFEAwicwoPUmVicm9hZGNhc3RNb2RlEgcKA0FMTBAAEhUKEUFMTF9TS0lQX0RFQ09ESU5HEAESDgoKTE9DQUxfT05MWRACEg4KCktOT1dOX09OTFkQAxIICgROT05FEAQSFgoSQ09SRV9QT1JUTlVNU19PTkxZEAUiaQoKQnV6emVyTW9kZRIPCgtBTExfRU5BQkxFRBAAEgwKCERJU0FCTEVEEAESFgoSTk9USUZJQ0FUSU9OU19PTkxZEAISDwoLU1lTVEVNX09OTFkQAxITCg9ESVJFQ1RfTVNHX09OTFkQBBqRBQoOUG9zaXRpb25Db25maWcSHwoXcG9zaXRpb25fYnJvYWRjYXN0X3NlY3MYASABKA0SKAogcG9zaXRpb25fYnJvYWRjYXN0X3NtYXJ0X2VuYWJsZWQYAiABKAgSFgoOZml4ZWRfcG9zaXRpb24YAyABKAgSFwoLZ3BzX2VuYWJsZWQYBCABKAhCAhgBEhsKE2dwc191cGRhdGVfaW50ZXJ2YWwYBSABKA0SHAoQZ3BzX2F0dGVtcHRfdGltZRgGIAEoDUICGAESFgoOcG9zaXRpb25fZmxhZ3MYByABKA0SDwoHcnhfZ3BpbxgIIAEoDRIPCgd0eF9ncGlvGAkgASgNEigKIGJyb2FkY2FzdF9zbWFydF9taW5pbXVtX2Rpc3RhbmNlGAogASgNEi0KJWJyb2FkY2FzdF9zbWFydF9taW5pbXVtX2ludGVydmFsX3NlY3MYCyABKA0SEwoLZ3BzX2VuX2dwaW8YDCABKA0SOwoIZ3BzX21vZGUYDSABKA4yKS5tZXNodGFzdGljLkNvbmZpZy5Qb3NpdGlvbkNvbmZpZy5HcHNNb2RlIqsBCg1Qb3NpdGlvbkZsYWdzEgkKBVVOU0VUEAASDAoIQUxUSVRVREUQARIQCgxBTFRJVFVERV9NU0wQAhIWChJHRU9JREFMX1NFUEFSQVRJT04QBBIHCgNET1AQCBIJCgVIVkRPUBAQEg0KCVNBVElOVklFVxAgEgoKBlNFUV9OTxBAEg4KCVRJTUVTVEFNUBCAARIMCgdIRUFESU5HEIACEgoKBVNQRUVEEIAEIjUKB0dwc01vZGUSDAoIRElTQUJMRUQQABILCgdFTkFCTEVEEAESDwoLTk9UX1BSRVNFTlQQAhqEAgoLUG93ZXJDb25maWcSFwoPaXNfcG93ZXJfc2F2aW5nGAEgASgIEiYKHm9uX2JhdHRlcnlfc2h1dGRvd25fYWZ0ZXJfc2VjcxgCIAEoDRIfChdhZGNfbXVsdGlwbGllcl9vdmVycmlkZRgDIAEoAhIbChN3YWl0X2JsdWV0b290aF9zZWNzGAQgASgNEhAKCHNkc19zZWNzGAYgASgNEg8KB2xzX3NlY3MYByABKA0SFQoNbWluX3dha2Vfc2VjcxgIIAEoDRIiChpkZXZpY2VfYmF0dGVyeV9pbmFfYWRkcmVzcxgJIAEoDRIYChBwb3dlcm1vbl9lbmFibGVzGCAgASgEGuUDCg1OZXR3b3JrQ29uZmlnEhQKDHdpZmlfZW5hYmxlZBgBIAEoCBIRCgl3aWZpX3NzaWQYAyABKAkSEAoId2lmaV9wc2sYBCABKAkSEgoKbnRwX3NlcnZlchgFIAEoCRITCgtldGhfZW5hYmxlZBgGIAEoCBJCCgxhZGRyZXNzX21vZGUYByABKA4yLC5tZXNodGFzdGljLkNvbmZpZy5OZXR3b3JrQ29uZmlnLkFkZHJlc3NNb2RlEkAKC2lwdjRfY29uZmlnGAggASgLMisubWVzaHRhc3RpYy5Db25maWcuTmV0d29ya0NvbmZpZy5JcFY0Q29uZmlnEhYKDnJzeXNsb2dfc2VydmVyGAkgASgJEhkKEWVuYWJsZWRfcHJvdG9jb2xzGAogASgNEhQKDGlwdjZfZW5hYmxlZBgLIAEoCBpGCgpJcFY0Q29uZmlnEgoKAmlwGAEgASgHEg8KB2dhdGV3YXkYAiABKAcSDgoGc3VibmV0GAMgASgHEgsKA2RucxgEIAEoByIjCgtBZGRyZXNzTW9kZRIICgRESENQEAASCgoGU1RBVElDEAEiNAoNUHJvdG9jb2xGbGFncxIQCgxOT19CUk9BRENBU1QQABIRCg1VRFBfQlJPQURDQVNUEAEaiQgKDURpc3BsYXlDb25maWcSFgoOc2NyZWVuX29uX3NlY3MYASABKA0SVgoKZ3BzX2Zvcm1hdBgCIAEoDjI+Lm1lc2h0YXN0aWMuQ29uZmlnLkRpc3BsYXlDb25maWcuRGVwcmVjYXRlZEdwc0Nvb3JkaW5hdGVGb3JtYXRCAhgBEiEKGWF1dG9fc2NyZWVuX2Nhcm91c2VsX3NlY3MYAyABKA0SHQoRY29tcGFzc19ub3J0aF90b3AYBCABKAhCAhgBEhMKC2ZsaXBfc2NyZWVuGAUgASgIEjwKBXVuaXRzGAYgASgOMi0ubWVzaHRhc3RpYy5Db25maWcuRGlzcGxheUNvbmZpZy5EaXNwbGF5VW5pdHMSNwoEb2xlZBgHIAEoDjIpLm1lc2h0YXN0aWMuQ29uZmlnLkRpc3BsYXlDb25maWcuT2xlZFR5cGUSQQoLZGlzcGxheW1vZGUYCCABKA4yLC5tZXNodGFzdGljLkNvbmZpZy5EaXNwbGF5Q29uZmlnLkRpc3BsYXlNb2RlEhQKDGhlYWRpbmdfYm9sZBgJIAEoCBIdChV3YWtlX29uX3RhcF9vcl9tb3Rpb24YCiABKAgSUAoTY29tcGFzc19vcmllbnRhdGlvbhgLIAEoDjIzLm1lc2h0YXN0aWMuQ29uZmlnLkRpc3BsYXlDb25maWcuQ29tcGFzc09yaWVudGF0aW9uEhUKDXVzZV8xMmhfY2xvY2sYDCABKAgSGgoSdXNlX2xvbmdfbm9kZV9uYW1lGA0gASgIIisKHURlcHJlY2F0ZWRHcHNDb29yZGluYXRlRm9ybWF0EgoKBlVOVVNFRBAAIigKDERpc3BsYXlVbml0cxIKCgZNRVRSSUMQABIMCghJTVBFUklBTBABImYKCE9sZWRUeXBlEg0KCU9MRURfQVVUTxAAEhAKDE9MRURfU1NEMTMwNhABEg8KC09MRURfU0gxMTA2EAISDwoLT0xFRF9TSDExMDcQAxIXChNPTEVEX1NIMTEwN18xMjhfMTI4EAQiQQoLRGlzcGxheU1vZGUSCwoHREVGQVVMVBAAEgwKCFRXT0NPTE9SEAESDAoISU5WRVJURUQQAhIJCgVDT0xPUhADIroBChJDb21wYXNzT3JpZW50YXRpb24SDQoJREVHUkVFU18wEAASDgoKREVHUkVFU185MBABEg8KC0RFR1JFRVNfMTgwEAISDwoLREVHUkVFU18yNzAQAxIWChJERUdSRUVTXzBfSU5WRVJURUQQBBIXChNERUdSRUVTXzkwX0lOVkVSVEVEEAUSGAoUREVHUkVFU18xODBfSU5WRVJURUQQBhIYChRERUdSRUVTXzI3MF9JTlZFUlRFRBAHGtoHCgpMb1JhQ29uZmlnEhIKCnVzZV9wcmVzZXQYASABKAgSPwoMbW9kZW1fcHJlc2V0GAIgASgOMikubWVzaHRhc3RpYy5Db25maWcuTG9SYUNvbmZpZy5Nb2RlbVByZXNldBIRCgliYW5kd2lkdGgYAyABKA0SFQoNc3ByZWFkX2ZhY3RvchgEIAEoDRITCgtjb2RpbmdfcmF0ZRgFIAEoDRIYChBmcmVxdWVuY3lfb2Zmc2V0GAYgASgCEjgKBnJlZ2lvbhgHIAEoDjIoLm1lc2h0YXN0aWMuQ29uZmlnLkxvUmFDb25maWcuUmVnaW9uQ29kZRIRCglob3BfbGltaXQYCCABKA0SEgoKdHhfZW5hYmxlZBgJIAEoCBIQCgh0eF9wb3dlchgKIAEoBRITCgtjaGFubmVsX251bRgLIAEoDRIbChNvdmVycmlkZV9kdXR5X2N5Y2xlGAwgASgIEh4KFnN4MTI2eF9yeF9ib29zdGVkX2dhaW4YDSABKAgSGgoSb3ZlcnJpZGVfZnJlcXVlbmN5GA4gASgCEhcKD3BhX2Zhbl9kaXNhYmxlZBgPIAEoCBIXCg9pZ25vcmVfaW5jb21pbmcYZyADKA0SEwoLaWdub3JlX21xdHQYaCABKAgSGQoRY29uZmlnX29rX3RvX21xdHQYaSABKAgirgIKClJlZ2lvbkNvZGUSCQoFVU5TRVQQABIGCgJVUxABEgoKBkVVXzQzMxACEgoKBkVVXzg2OBADEgYKAkNOEAQSBgoCSlAQBRIHCgNBTloQBhIGCgJLUhAHEgYKAlRXEAgSBgoCUlUQCRIGCgJJThAKEgoKBk5aXzg2NRALEgYKAlRIEAwSCwoHTE9SQV8yNBANEgoKBlVBXzQzMxAOEgoKBlVBXzg2OBAPEgoKBk1ZXzQzMxAQEgoKBk1ZXzkxORAREgoKBlNHXzkyMxASEgoKBlBIXzQzMxATEgoKBlBIXzg2OBAUEgoKBlBIXzkxNRAVEgsKB0FOWl80MzMQFhIKCgZLWl80MzMQFxIKCgZLWl84NjMQGBIKCgZOUF84NjUQGRIKCgZCUl85MDIQGiKpAQoLTW9kZW1QcmVzZXQSDQoJTE9OR19GQVNUEAASDQoJTE9OR19TTE9XEAESFgoOVkVSWV9MT05HX1NMT1cQAhoCCAESDwoLTUVESVVNX1NMT1cQAxIPCgtNRURJVU1fRkFTVBAEEg4KClNIT1JUX1NMT1cQBRIOCgpTSE9SVF9GQVNUEAYSEQoNTE9OR19NT0RFUkFURRAHEg8KC1NIT1JUX1RVUkJPEAgarQEKD0JsdWV0b290aENvbmZpZxIPCgdlbmFibGVkGAEgASgIEjwKBG1vZGUYAiABKA4yLi5tZXNodGFzdGljLkNvbmZpZy5CbHVldG9vdGhDb25maWcuUGFpcmluZ01vZGUSEQoJZml4ZWRfcGluGAMgASgNIjgKC1BhaXJpbmdNb2RlEg4KClJBTkRPTV9QSU4QABINCglGSVhFRF9QSU4QARIKCgZOT19QSU4QAhq2AQoOU2VjdXJpdHlDb25maWcSEgoKcHVibGljX2tleRgBIAEoDBITCgtwcml2YXRlX2tleRgCIAEoDBIRCglhZG1pbl9rZXkYAyADKAwSEgoKaXNfbWFuYWdlZBgEIAEoCBIWCg5zZXJpYWxfZW5hYmxlZBgFIAEoCBIdChVkZWJ1Z19sb2dfYXBpX2VuYWJsZWQYBiABKAgSHQoVYWRtaW5fY2hhbm5lbF9lbmFibGVkGAggASgIGhIKEFNlc3Npb25rZXlDb25maWdCEQoPcGF5bG9hZF92YXJpYW50QmEKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCDENvbmZpZ1Byb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM", [file_meshtastic_device_ui]);
/**
* Describes the message meshtastic.Config.
* Use `create(ConfigSchema)` to create a new message.
*/ const ConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0);
/**
* Describes the message meshtastic.Config.DeviceConfig.
* Use `create(Config_DeviceConfigSchema)` to create a new message.
*/ const Config_DeviceConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 0);
/**
*
* Defines the device's role on the Mesh network
*
* @generated from enum meshtastic.Config.DeviceConfig.Role
*/ var Config_DeviceConfig_Role = /* @__PURE__ */ function(Config_DeviceConfig_Role$1) {
	/**
	*
	* Description: App connected or stand alone messaging device.
	* Technical Details: Default Role
	*
	* @generated from enum value: CLIENT = 0;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["CLIENT"] = 0] = "CLIENT";
	/**
	*
	*  Description: Device that does not forward packets from other devices.
	*
	* @generated from enum value: CLIENT_MUTE = 1;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["CLIENT_MUTE"] = 1] = "CLIENT_MUTE";
	/**
	*
	* Description: Infrastructure node for extending network coverage by relaying messages. Visible in Nodes list.
	* Technical Details: Mesh packets will prefer to be routed over this node. This node will not be used by client apps.
	*   The wifi radio and the oled screen will be put to sleep.
	*   This mode may still potentially have higher power usage due to it's preference in message rebroadcasting on the mesh.
	*
	* @generated from enum value: ROUTER = 2;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["ROUTER"] = 2] = "ROUTER";
	/**
	* @generated from enum value: ROUTER_CLIENT = 3 [deprecated = true];
	* @deprecated
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["ROUTER_CLIENT"] = 3] = "ROUTER_CLIENT";
	/**
	*
	* Description: Infrastructure node for extending network coverage by relaying messages with minimal overhead. Not visible in Nodes list.
	* Technical Details: Mesh packets will simply be rebroadcasted over this node. Nodes configured with this role will not originate NodeInfo, Position, Telemetry
	*   or any other packet type. They will simply rebroadcast any mesh packets on the same frequency, channel num, spread factor, and coding rate.
	* Deprecated in v2.7.11 because it creates "holes" in the mesh rebroadcast chain.
	*
	* @generated from enum value: REPEATER = 4 [deprecated = true];
	* @deprecated
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["REPEATER"] = 4] = "REPEATER";
	/**
	*
	* Description: Broadcasts GPS position packets as priority.
	* Technical Details: Position Mesh packets will be prioritized higher and sent more frequently by default.
	*   When used in conjunction with power.is_power_saving = true, nodes will wake up,
	*   send position, and then sleep for position.position_broadcast_secs seconds.
	*
	* @generated from enum value: TRACKER = 5;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["TRACKER"] = 5] = "TRACKER";
	/**
	*
	* Description: Broadcasts telemetry packets as priority.
	* Technical Details: Telemetry Mesh packets will be prioritized higher and sent more frequently by default.
	*   When used in conjunction with power.is_power_saving = true, nodes will wake up,
	*   send environment telemetry, and then sleep for telemetry.environment_update_interval seconds.
	*
	* @generated from enum value: SENSOR = 6;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["SENSOR"] = 6] = "SENSOR";
	/**
	*
	* Description: Optimized for ATAK system communication and reduces routine broadcasts.
	* Technical Details: Used for nodes dedicated for connection to an ATAK EUD.
	*    Turns off many of the routine broadcasts to favor CoT packet stream
	*    from the Meshtastic ATAK plugin -> IMeshService -> Node
	*
	* @generated from enum value: TAK = 7;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["TAK"] = 7] = "TAK";
	/**
	*
	* Description: Device that only broadcasts as needed for stealth or power savings.
	* Technical Details: Used for nodes that "only speak when spoken to"
	*    Turns all of the routine broadcasts but allows for ad-hoc communication
	*    Still rebroadcasts, but with local only rebroadcast mode (known meshes only)
	*    Can be used for clandestine operation or to dramatically reduce airtime / power consumption
	*
	* @generated from enum value: CLIENT_HIDDEN = 8;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["CLIENT_HIDDEN"] = 8] = "CLIENT_HIDDEN";
	/**
	*
	* Description: Broadcasts location as message to default channel regularly for to assist with device recovery.
	* Technical Details: Used to automatically send a text message to the mesh
	*    with the current position of the device on a frequent interval:
	*    "I'm lost! Position: lat / long"
	*
	* @generated from enum value: LOST_AND_FOUND = 9;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["LOST_AND_FOUND"] = 9] = "LOST_AND_FOUND";
	/**
	*
	* Description: Enables automatic TAK PLI broadcasts and reduces routine broadcasts.
	* Technical Details: Turns off many of the routine broadcasts to favor ATAK CoT packet stream
	*    and automatic TAK PLI (position location information) broadcasts.
	*    Uses position module configuration to determine TAK PLI broadcast interval.
	*
	* @generated from enum value: TAK_TRACKER = 10;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["TAK_TRACKER"] = 10] = "TAK_TRACKER";
	/**
	*
	* Description: Will always rebroadcast packets, but will do so after all other modes.
	* Technical Details: Used for router nodes that are intended to provide additional coverage
	*    in areas not already covered by other routers, or to bridge around problematic terrain,
	*    but should not be given priority over other routers in order to avoid unnecessaraily
	*    consuming hops.
	*
	* @generated from enum value: ROUTER_LATE = 11;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["ROUTER_LATE"] = 11] = "ROUTER_LATE";
	/**
	*
	* Description: Treats packets from or to favorited nodes as ROUTER, and all other packets as CLIENT.
	* Technical Details: Used for stronger attic/roof nodes to distribute messages more widely
	*    from weaker, indoor, or less-well-positioned nodes. Recommended for users with multiple nodes
	*    where one CLIENT_BASE acts as a more powerful base station, such as an attic/roof node.
	*
	* @generated from enum value: CLIENT_BASE = 12;
	*/ Config_DeviceConfig_Role$1[Config_DeviceConfig_Role$1["CLIENT_BASE"] = 12] = "CLIENT_BASE";
	return Config_DeviceConfig_Role$1;
}({});
/**
* Describes the enum meshtastic.Config.DeviceConfig.Role.
*/ const Config_DeviceConfig_RoleSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 0, 0);
/**
*
* Defines the device's behavior for how messages are rebroadcast
*
* @generated from enum meshtastic.Config.DeviceConfig.RebroadcastMode
*/ var Config_DeviceConfig_RebroadcastMode = /* @__PURE__ */ function(Config_DeviceConfig_RebroadcastMode$1) {
	/**
	*
	* Default behavior.
	* Rebroadcast any observed message, if it was on our private channel or from another mesh with the same lora params.
	*
	* @generated from enum value: ALL = 0;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["ALL"] = 0] = "ALL";
	/**
	*
	* Same as behavior as ALL but skips packet decoding and simply rebroadcasts them.
	* Only available in Repeater role. Setting this on any other roles will result in ALL behavior.
	*
	* @generated from enum value: ALL_SKIP_DECODING = 1;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["ALL_SKIP_DECODING"] = 1] = "ALL_SKIP_DECODING";
	/**
	*
	* Ignores observed messages from foreign meshes that are open or those which it cannot decrypt.
	* Only rebroadcasts message on the nodes local primary / secondary channels.
	*
	* @generated from enum value: LOCAL_ONLY = 2;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["LOCAL_ONLY"] = 2] = "LOCAL_ONLY";
	/**
	*
	* Ignores observed messages from foreign meshes like LOCAL_ONLY,
	* but takes it step further by also ignoring messages from nodenums not in the node's known list (NodeDB)
	*
	* @generated from enum value: KNOWN_ONLY = 3;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["KNOWN_ONLY"] = 3] = "KNOWN_ONLY";
	/**
	*
	* Only permitted for SENSOR, TRACKER and TAK_TRACKER roles, this will inhibit all rebroadcasts, not unlike CLIENT_MUTE role.
	*
	* @generated from enum value: NONE = 4;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["NONE"] = 4] = "NONE";
	/**
	*
	* Ignores packets from non-standard portnums such as: TAK, RangeTest, PaxCounter, etc.
	* Only rebroadcasts packets with standard portnums: NodeInfo, Text, Position, Telemetry, and Routing.
	*
	* @generated from enum value: CORE_PORTNUMS_ONLY = 5;
	*/ Config_DeviceConfig_RebroadcastMode$1[Config_DeviceConfig_RebroadcastMode$1["CORE_PORTNUMS_ONLY"] = 5] = "CORE_PORTNUMS_ONLY";
	return Config_DeviceConfig_RebroadcastMode$1;
}({});
/**
* Describes the enum meshtastic.Config.DeviceConfig.RebroadcastMode.
*/ const Config_DeviceConfig_RebroadcastModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 0, 1);
/**
*
* Defines buzzer behavior for audio feedback
*
* @generated from enum meshtastic.Config.DeviceConfig.BuzzerMode
*/ var Config_DeviceConfig_BuzzerMode = /* @__PURE__ */ function(Config_DeviceConfig_BuzzerMode$1) {
	/**
	*
	* Default behavior.
	* Buzzer is enabled for all audio feedback including button presses and alerts.
	*
	* @generated from enum value: ALL_ENABLED = 0;
	*/ Config_DeviceConfig_BuzzerMode$1[Config_DeviceConfig_BuzzerMode$1["ALL_ENABLED"] = 0] = "ALL_ENABLED";
	/**
	*
	* Disabled.
	* All buzzer audio feedback is disabled.
	*
	* @generated from enum value: DISABLED = 1;
	*/ Config_DeviceConfig_BuzzerMode$1[Config_DeviceConfig_BuzzerMode$1["DISABLED"] = 1] = "DISABLED";
	/**
	*
	* Notifications Only.
	* Buzzer is enabled only for notifications and alerts, but not for button presses.
	* External notification config determines the specifics of the notification behavior.
	*
	* @generated from enum value: NOTIFICATIONS_ONLY = 2;
	*/ Config_DeviceConfig_BuzzerMode$1[Config_DeviceConfig_BuzzerMode$1["NOTIFICATIONS_ONLY"] = 2] = "NOTIFICATIONS_ONLY";
	/**
	*
	* Non-notification system buzzer tones only.
	* Buzzer is enabled only for non-notification tones such as button presses, startup, shutdown, but not for alerts.
	*
	* @generated from enum value: SYSTEM_ONLY = 3;
	*/ Config_DeviceConfig_BuzzerMode$1[Config_DeviceConfig_BuzzerMode$1["SYSTEM_ONLY"] = 3] = "SYSTEM_ONLY";
	/**
	*
	* Direct Message notifications only.
	* Buzzer is enabled only for direct messages and alerts, but not for button presses.
	* External notification config determines the specifics of the notification behavior.
	*
	* @generated from enum value: DIRECT_MSG_ONLY = 4;
	*/ Config_DeviceConfig_BuzzerMode$1[Config_DeviceConfig_BuzzerMode$1["DIRECT_MSG_ONLY"] = 4] = "DIRECT_MSG_ONLY";
	return Config_DeviceConfig_BuzzerMode$1;
}({});
/**
* Describes the enum meshtastic.Config.DeviceConfig.BuzzerMode.
*/ const Config_DeviceConfig_BuzzerModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 0, 2);
/**
* Describes the message meshtastic.Config.PositionConfig.
* Use `create(Config_PositionConfigSchema)` to create a new message.
*/ const Config_PositionConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 1);
/**
*
* Bit field of boolean configuration options, indicating which optional
* fields to include when assembling POSITION messages.
* Longitude, latitude, altitude, speed, heading, and DOP
* are always included (also time if GPS-synced)
* NOTE: the more fields are included, the larger the message will be -
*   leading to longer airtime and a higher risk of packet loss
*
* @generated from enum meshtastic.Config.PositionConfig.PositionFlags
*/ var Config_PositionConfig_PositionFlags = /* @__PURE__ */ function(Config_PositionConfig_PositionFlags$1) {
	/**
	*
	* Required for compilation
	*
	* @generated from enum value: UNSET = 0;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* Include an altitude value (if available)
	*
	* @generated from enum value: ALTITUDE = 1;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["ALTITUDE"] = 1] = "ALTITUDE";
	/**
	*
	* Altitude value is MSL
	*
	* @generated from enum value: ALTITUDE_MSL = 2;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["ALTITUDE_MSL"] = 2] = "ALTITUDE_MSL";
	/**
	*
	* Include geoidal separation
	*
	* @generated from enum value: GEOIDAL_SEPARATION = 4;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["GEOIDAL_SEPARATION"] = 4] = "GEOIDAL_SEPARATION";
	/**
	*
	* Include the DOP value ; PDOP used by default, see below
	*
	* @generated from enum value: DOP = 8;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["DOP"] = 8] = "DOP";
	/**
	*
	* If POS_DOP set, send separate HDOP / VDOP values instead of PDOP
	*
	* @generated from enum value: HVDOP = 16;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["HVDOP"] = 16] = "HVDOP";
	/**
	*
	* Include number of "satellites in view"
	*
	* @generated from enum value: SATINVIEW = 32;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["SATINVIEW"] = 32] = "SATINVIEW";
	/**
	*
	* Include a sequence number incremented per packet
	*
	* @generated from enum value: SEQ_NO = 64;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["SEQ_NO"] = 64] = "SEQ_NO";
	/**
	*
	* Include positional timestamp (from GPS solution)
	*
	* @generated from enum value: TIMESTAMP = 128;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["TIMESTAMP"] = 128] = "TIMESTAMP";
	/**
	*
	* Include positional heading
	* Intended for use with vehicle not walking speeds
	* walking speeds are likely to be error prone like the compass
	*
	* @generated from enum value: HEADING = 256;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["HEADING"] = 256] = "HEADING";
	/**
	*
	* Include positional speed
	* Intended for use with vehicle not walking speeds
	* walking speeds are likely to be error prone like the compass
	*
	* @generated from enum value: SPEED = 512;
	*/ Config_PositionConfig_PositionFlags$1[Config_PositionConfig_PositionFlags$1["SPEED"] = 512] = "SPEED";
	return Config_PositionConfig_PositionFlags$1;
}({});
/**
* Describes the enum meshtastic.Config.PositionConfig.PositionFlags.
*/ const Config_PositionConfig_PositionFlagsSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 1, 0);
/**
* @generated from enum meshtastic.Config.PositionConfig.GpsMode
*/ var Config_PositionConfig_GpsMode = /* @__PURE__ */ function(Config_PositionConfig_GpsMode$1) {
	/**
	*
	* GPS is present but disabled
	*
	* @generated from enum value: DISABLED = 0;
	*/ Config_PositionConfig_GpsMode$1[Config_PositionConfig_GpsMode$1["DISABLED"] = 0] = "DISABLED";
	/**
	*
	* GPS is present and enabled
	*
	* @generated from enum value: ENABLED = 1;
	*/ Config_PositionConfig_GpsMode$1[Config_PositionConfig_GpsMode$1["ENABLED"] = 1] = "ENABLED";
	/**
	*
	* GPS is not present on the device
	*
	* @generated from enum value: NOT_PRESENT = 2;
	*/ Config_PositionConfig_GpsMode$1[Config_PositionConfig_GpsMode$1["NOT_PRESENT"] = 2] = "NOT_PRESENT";
	return Config_PositionConfig_GpsMode$1;
}({});
/**
* Describes the enum meshtastic.Config.PositionConfig.GpsMode.
*/ const Config_PositionConfig_GpsModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 1, 1);
/**
* Describes the message meshtastic.Config.PowerConfig.
* Use `create(Config_PowerConfigSchema)` to create a new message.
*/ const Config_PowerConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 2);
/**
* Describes the message meshtastic.Config.NetworkConfig.
* Use `create(Config_NetworkConfigSchema)` to create a new message.
*/ const Config_NetworkConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 3);
/**
* Describes the message meshtastic.Config.NetworkConfig.IpV4Config.
* Use `create(Config_NetworkConfig_IpV4ConfigSchema)` to create a new message.
*/ const Config_NetworkConfig_IpV4ConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 3, 0);
/**
* @generated from enum meshtastic.Config.NetworkConfig.AddressMode
*/ var Config_NetworkConfig_AddressMode = /* @__PURE__ */ function(Config_NetworkConfig_AddressMode$1) {
	/**
	*
	* obtain ip address via DHCP
	*
	* @generated from enum value: DHCP = 0;
	*/ Config_NetworkConfig_AddressMode$1[Config_NetworkConfig_AddressMode$1["DHCP"] = 0] = "DHCP";
	/**
	*
	* use static ip address
	*
	* @generated from enum value: STATIC = 1;
	*/ Config_NetworkConfig_AddressMode$1[Config_NetworkConfig_AddressMode$1["STATIC"] = 1] = "STATIC";
	return Config_NetworkConfig_AddressMode$1;
}({});
/**
* Describes the enum meshtastic.Config.NetworkConfig.AddressMode.
*/ const Config_NetworkConfig_AddressModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 3, 0);
/**
*
* Available flags auxiliary network protocols
*
* @generated from enum meshtastic.Config.NetworkConfig.ProtocolFlags
*/ var Config_NetworkConfig_ProtocolFlags = /* @__PURE__ */ function(Config_NetworkConfig_ProtocolFlags$1) {
	/**
	*
	* Do not broadcast packets over any network protocol
	*
	* @generated from enum value: NO_BROADCAST = 0;
	*/ Config_NetworkConfig_ProtocolFlags$1[Config_NetworkConfig_ProtocolFlags$1["NO_BROADCAST"] = 0] = "NO_BROADCAST";
	/**
	*
	* Enable broadcasting packets via UDP over the local network
	*
	* @generated from enum value: UDP_BROADCAST = 1;
	*/ Config_NetworkConfig_ProtocolFlags$1[Config_NetworkConfig_ProtocolFlags$1["UDP_BROADCAST"] = 1] = "UDP_BROADCAST";
	return Config_NetworkConfig_ProtocolFlags$1;
}({});
/**
* Describes the enum meshtastic.Config.NetworkConfig.ProtocolFlags.
*/ const Config_NetworkConfig_ProtocolFlagsSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 3, 1);
/**
* Describes the message meshtastic.Config.DisplayConfig.
* Use `create(Config_DisplayConfigSchema)` to create a new message.
*/ const Config_DisplayConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 4);
/**
*
* Deprecated in 2.7.4: Unused
*
* @generated from enum meshtastic.Config.DisplayConfig.DeprecatedGpsCoordinateFormat
*/ var Config_DisplayConfig_DeprecatedGpsCoordinateFormat = /* @__PURE__ */ function(Config_DisplayConfig_DeprecatedGpsCoordinateFormat$1) {
	/**
	* @generated from enum value: UNUSED = 0;
	*/ Config_DisplayConfig_DeprecatedGpsCoordinateFormat$1[Config_DisplayConfig_DeprecatedGpsCoordinateFormat$1["UNUSED"] = 0] = "UNUSED";
	return Config_DisplayConfig_DeprecatedGpsCoordinateFormat$1;
}({});
/**
* Describes the enum meshtastic.Config.DisplayConfig.DeprecatedGpsCoordinateFormat.
*/ const Config_DisplayConfig_DeprecatedGpsCoordinateFormatSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 4, 0);
/**
*
* Unit display preference
*
* @generated from enum meshtastic.Config.DisplayConfig.DisplayUnits
*/ var Config_DisplayConfig_DisplayUnits = /* @__PURE__ */ function(Config_DisplayConfig_DisplayUnits$1) {
	/**
	*
	* Metric (Default)
	*
	* @generated from enum value: METRIC = 0;
	*/ Config_DisplayConfig_DisplayUnits$1[Config_DisplayConfig_DisplayUnits$1["METRIC"] = 0] = "METRIC";
	/**
	*
	* Imperial
	*
	* @generated from enum value: IMPERIAL = 1;
	*/ Config_DisplayConfig_DisplayUnits$1[Config_DisplayConfig_DisplayUnits$1["IMPERIAL"] = 1] = "IMPERIAL";
	return Config_DisplayConfig_DisplayUnits$1;
}({});
/**
* Describes the enum meshtastic.Config.DisplayConfig.DisplayUnits.
*/ const Config_DisplayConfig_DisplayUnitsSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 4, 1);
/**
*
* Override OLED outo detect with this if it fails.
*
* @generated from enum meshtastic.Config.DisplayConfig.OledType
*/ var Config_DisplayConfig_OledType = /* @__PURE__ */ function(Config_DisplayConfig_OledType$1) {
	/**
	*
	* Default / Autodetect
	*
	* @generated from enum value: OLED_AUTO = 0;
	*/ Config_DisplayConfig_OledType$1[Config_DisplayConfig_OledType$1["OLED_AUTO"] = 0] = "OLED_AUTO";
	/**
	*
	* Default / Autodetect
	*
	* @generated from enum value: OLED_SSD1306 = 1;
	*/ Config_DisplayConfig_OledType$1[Config_DisplayConfig_OledType$1["OLED_SSD1306"] = 1] = "OLED_SSD1306";
	/**
	*
	* Default / Autodetect
	*
	* @generated from enum value: OLED_SH1106 = 2;
	*/ Config_DisplayConfig_OledType$1[Config_DisplayConfig_OledType$1["OLED_SH1106"] = 2] = "OLED_SH1106";
	/**
	*
	* Can not be auto detected but set by proto. Used for 128x64 screens
	*
	* @generated from enum value: OLED_SH1107 = 3;
	*/ Config_DisplayConfig_OledType$1[Config_DisplayConfig_OledType$1["OLED_SH1107"] = 3] = "OLED_SH1107";
	/**
	*
	* Can not be auto detected but set by proto. Used for 128x128 screens
	*
	* @generated from enum value: OLED_SH1107_128_128 = 4;
	*/ Config_DisplayConfig_OledType$1[Config_DisplayConfig_OledType$1["OLED_SH1107_128_128"] = 4] = "OLED_SH1107_128_128";
	return Config_DisplayConfig_OledType$1;
}({});
/**
* Describes the enum meshtastic.Config.DisplayConfig.OledType.
*/ const Config_DisplayConfig_OledTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 4, 2);
/**
* @generated from enum meshtastic.Config.DisplayConfig.DisplayMode
*/ var Config_DisplayConfig_DisplayMode = /* @__PURE__ */ function(Config_DisplayConfig_DisplayMode$1) {
	/**
	*
	* Default. The old style for the 128x64 OLED screen
	*
	* @generated from enum value: DEFAULT = 0;
	*/ Config_DisplayConfig_DisplayMode$1[Config_DisplayConfig_DisplayMode$1["DEFAULT"] = 0] = "DEFAULT";
	/**
	*
	* Rearrange display elements to cater for bicolor OLED displays
	*
	* @generated from enum value: TWOCOLOR = 1;
	*/ Config_DisplayConfig_DisplayMode$1[Config_DisplayConfig_DisplayMode$1["TWOCOLOR"] = 1] = "TWOCOLOR";
	/**
	*
	* Same as TwoColor, but with inverted top bar. Not so good for Epaper displays
	*
	* @generated from enum value: INVERTED = 2;
	*/ Config_DisplayConfig_DisplayMode$1[Config_DisplayConfig_DisplayMode$1["INVERTED"] = 2] = "INVERTED";
	/**
	*
	* TFT Full Color Displays (not implemented yet)
	*
	* @generated from enum value: COLOR = 3;
	*/ Config_DisplayConfig_DisplayMode$1[Config_DisplayConfig_DisplayMode$1["COLOR"] = 3] = "COLOR";
	return Config_DisplayConfig_DisplayMode$1;
}({});
/**
* Describes the enum meshtastic.Config.DisplayConfig.DisplayMode.
*/ const Config_DisplayConfig_DisplayModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 4, 3);
/**
* @generated from enum meshtastic.Config.DisplayConfig.CompassOrientation
*/ var Config_DisplayConfig_CompassOrientation = /* @__PURE__ */ function(Config_DisplayConfig_CompassOrientation$1) {
	/**
	*
	* The compass and the display are in the same orientation.
	*
	* @generated from enum value: DEGREES_0 = 0;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_0"] = 0] = "DEGREES_0";
	/**
	*
	* Rotate the compass by 90 degrees.
	*
	* @generated from enum value: DEGREES_90 = 1;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_90"] = 1] = "DEGREES_90";
	/**
	*
	* Rotate the compass by 180 degrees.
	*
	* @generated from enum value: DEGREES_180 = 2;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_180"] = 2] = "DEGREES_180";
	/**
	*
	* Rotate the compass by 270 degrees.
	*
	* @generated from enum value: DEGREES_270 = 3;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_270"] = 3] = "DEGREES_270";
	/**
	*
	* Don't rotate the compass, but invert the result.
	*
	* @generated from enum value: DEGREES_0_INVERTED = 4;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_0_INVERTED"] = 4] = "DEGREES_0_INVERTED";
	/**
	*
	* Rotate the compass by 90 degrees and invert.
	*
	* @generated from enum value: DEGREES_90_INVERTED = 5;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_90_INVERTED"] = 5] = "DEGREES_90_INVERTED";
	/**
	*
	* Rotate the compass by 180 degrees and invert.
	*
	* @generated from enum value: DEGREES_180_INVERTED = 6;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_180_INVERTED"] = 6] = "DEGREES_180_INVERTED";
	/**
	*
	* Rotate the compass by 270 degrees and invert.
	*
	* @generated from enum value: DEGREES_270_INVERTED = 7;
	*/ Config_DisplayConfig_CompassOrientation$1[Config_DisplayConfig_CompassOrientation$1["DEGREES_270_INVERTED"] = 7] = "DEGREES_270_INVERTED";
	return Config_DisplayConfig_CompassOrientation$1;
}({});
/**
* Describes the enum meshtastic.Config.DisplayConfig.CompassOrientation.
*/ const Config_DisplayConfig_CompassOrientationSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 4, 4);
/**
* Describes the message meshtastic.Config.LoRaConfig.
* Use `create(Config_LoRaConfigSchema)` to create a new message.
*/ const Config_LoRaConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 5);
/**
* @generated from enum meshtastic.Config.LoRaConfig.RegionCode
*/ var Config_LoRaConfig_RegionCode = /* @__PURE__ */ function(Config_LoRaConfig_RegionCode$1) {
	/**
	*
	* Region is not set
	*
	* @generated from enum value: UNSET = 0;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* United States
	*
	* @generated from enum value: US = 1;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["US"] = 1] = "US";
	/**
	*
	* European Union 433mhz
	*
	* @generated from enum value: EU_433 = 2;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["EU_433"] = 2] = "EU_433";
	/**
	*
	* European Union 868mhz
	*
	* @generated from enum value: EU_868 = 3;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["EU_868"] = 3] = "EU_868";
	/**
	*
	* China
	*
	* @generated from enum value: CN = 4;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["CN"] = 4] = "CN";
	/**
	*
	* Japan
	*
	* @generated from enum value: JP = 5;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["JP"] = 5] = "JP";
	/**
	*
	* Australia / New Zealand
	*
	* @generated from enum value: ANZ = 6;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["ANZ"] = 6] = "ANZ";
	/**
	*
	* Korea
	*
	* @generated from enum value: KR = 7;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["KR"] = 7] = "KR";
	/**
	*
	* Taiwan
	*
	* @generated from enum value: TW = 8;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["TW"] = 8] = "TW";
	/**
	*
	* Russia
	*
	* @generated from enum value: RU = 9;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["RU"] = 9] = "RU";
	/**
	*
	* India
	*
	* @generated from enum value: IN = 10;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["IN"] = 10] = "IN";
	/**
	*
	* New Zealand 865mhz
	*
	* @generated from enum value: NZ_865 = 11;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["NZ_865"] = 11] = "NZ_865";
	/**
	*
	* Thailand
	*
	* @generated from enum value: TH = 12;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["TH"] = 12] = "TH";
	/**
	*
	* WLAN Band
	*
	* @generated from enum value: LORA_24 = 13;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["LORA_24"] = 13] = "LORA_24";
	/**
	*
	* Ukraine 433mhz
	*
	* @generated from enum value: UA_433 = 14;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["UA_433"] = 14] = "UA_433";
	/**
	*
	* Ukraine 868mhz
	*
	* @generated from enum value: UA_868 = 15;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["UA_868"] = 15] = "UA_868";
	/**
	*
	* Malaysia 433mhz
	*
	* @generated from enum value: MY_433 = 16;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["MY_433"] = 16] = "MY_433";
	/**
	*
	* Malaysia 919mhz
	*
	* @generated from enum value: MY_919 = 17;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["MY_919"] = 17] = "MY_919";
	/**
	*
	* Singapore 923mhz
	*
	* @generated from enum value: SG_923 = 18;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["SG_923"] = 18] = "SG_923";
	/**
	*
	* Philippines 433mhz
	*
	* @generated from enum value: PH_433 = 19;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["PH_433"] = 19] = "PH_433";
	/**
	*
	* Philippines 868mhz
	*
	* @generated from enum value: PH_868 = 20;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["PH_868"] = 20] = "PH_868";
	/**
	*
	* Philippines 915mhz
	*
	* @generated from enum value: PH_915 = 21;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["PH_915"] = 21] = "PH_915";
	/**
	*
	* Australia / New Zealand 433MHz
	*
	* @generated from enum value: ANZ_433 = 22;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["ANZ_433"] = 22] = "ANZ_433";
	/**
	*
	* Kazakhstan 433MHz
	*
	* @generated from enum value: KZ_433 = 23;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["KZ_433"] = 23] = "KZ_433";
	/**
	*
	* Kazakhstan 863MHz
	*
	* @generated from enum value: KZ_863 = 24;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["KZ_863"] = 24] = "KZ_863";
	/**
	*
	* Nepal 865MHz
	*
	* @generated from enum value: NP_865 = 25;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["NP_865"] = 25] = "NP_865";
	/**
	*
	* Brazil 902MHz
	*
	* @generated from enum value: BR_902 = 26;
	*/ Config_LoRaConfig_RegionCode$1[Config_LoRaConfig_RegionCode$1["BR_902"] = 26] = "BR_902";
	return Config_LoRaConfig_RegionCode$1;
}({});
/**
* Describes the enum meshtastic.Config.LoRaConfig.RegionCode.
*/ const Config_LoRaConfig_RegionCodeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 5, 0);
/**
*
* Standard predefined channel settings
* Note: these mappings must match ModemPreset Choice in the device code.
*
* @generated from enum meshtastic.Config.LoRaConfig.ModemPreset
*/ var Config_LoRaConfig_ModemPreset = /* @__PURE__ */ function(Config_LoRaConfig_ModemPreset$1) {
	/**
	*
	* Long Range - Fast
	*
	* @generated from enum value: LONG_FAST = 0;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["LONG_FAST"] = 0] = "LONG_FAST";
	/**
	*
	* Long Range - Slow
	*
	* @generated from enum value: LONG_SLOW = 1;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["LONG_SLOW"] = 1] = "LONG_SLOW";
	/**
	*
	* Very Long Range - Slow
	* Deprecated in 2.5: Works only with txco and is unusably slow
	*
	* @generated from enum value: VERY_LONG_SLOW = 2 [deprecated = true];
	* @deprecated
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["VERY_LONG_SLOW"] = 2] = "VERY_LONG_SLOW";
	/**
	*
	* Medium Range - Slow
	*
	* @generated from enum value: MEDIUM_SLOW = 3;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["MEDIUM_SLOW"] = 3] = "MEDIUM_SLOW";
	/**
	*
	* Medium Range - Fast
	*
	* @generated from enum value: MEDIUM_FAST = 4;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["MEDIUM_FAST"] = 4] = "MEDIUM_FAST";
	/**
	*
	* Short Range - Slow
	*
	* @generated from enum value: SHORT_SLOW = 5;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["SHORT_SLOW"] = 5] = "SHORT_SLOW";
	/**
	*
	* Short Range - Fast
	*
	* @generated from enum value: SHORT_FAST = 6;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["SHORT_FAST"] = 6] = "SHORT_FAST";
	/**
	*
	* Long Range - Moderately Fast
	*
	* @generated from enum value: LONG_MODERATE = 7;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["LONG_MODERATE"] = 7] = "LONG_MODERATE";
	/**
	*
	* Short Range - Turbo
	* This is the fastest preset and the only one with 500kHz bandwidth.
	* It is not legal to use in all regions due to this wider bandwidth.
	*
	* @generated from enum value: SHORT_TURBO = 8;
	*/ Config_LoRaConfig_ModemPreset$1[Config_LoRaConfig_ModemPreset$1["SHORT_TURBO"] = 8] = "SHORT_TURBO";
	return Config_LoRaConfig_ModemPreset$1;
}({});
/**
* Describes the enum meshtastic.Config.LoRaConfig.ModemPreset.
*/ const Config_LoRaConfig_ModemPresetSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 5, 1);
/**
* Describes the message meshtastic.Config.BluetoothConfig.
* Use `create(Config_BluetoothConfigSchema)` to create a new message.
*/ const Config_BluetoothConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 6);
/**
* @generated from enum meshtastic.Config.BluetoothConfig.PairingMode
*/ var Config_BluetoothConfig_PairingMode = /* @__PURE__ */ function(Config_BluetoothConfig_PairingMode$1) {
	/**
	*
	* Device generates a random PIN that will be shown on the screen of the device for pairing
	*
	* @generated from enum value: RANDOM_PIN = 0;
	*/ Config_BluetoothConfig_PairingMode$1[Config_BluetoothConfig_PairingMode$1["RANDOM_PIN"] = 0] = "RANDOM_PIN";
	/**
	*
	* Device requires a specified fixed PIN for pairing
	*
	* @generated from enum value: FIXED_PIN = 1;
	*/ Config_BluetoothConfig_PairingMode$1[Config_BluetoothConfig_PairingMode$1["FIXED_PIN"] = 1] = "FIXED_PIN";
	/**
	*
	* Device requires no PIN for pairing
	*
	* @generated from enum value: NO_PIN = 2;
	*/ Config_BluetoothConfig_PairingMode$1[Config_BluetoothConfig_PairingMode$1["NO_PIN"] = 2] = "NO_PIN";
	return Config_BluetoothConfig_PairingMode$1;
}({});
/**
* Describes the enum meshtastic.Config.BluetoothConfig.PairingMode.
*/ const Config_BluetoothConfig_PairingModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_config, 0, 6, 0);
/**
* Describes the message meshtastic.Config.SecurityConfig.
* Use `create(Config_SecurityConfigSchema)` to create a new message.
*/ const Config_SecurityConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 7);
/**
* Describes the message meshtastic.Config.SessionkeyConfig.
* Use `create(Config_SessionkeyConfigSchema)` to create a new message.
*/ const Config_SessionkeyConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_config, 0, 8);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/connection_status_pb.js
var connection_status_pb_exports = {};
__export(connection_status_pb_exports, {
	BluetoothConnectionStatusSchema: () => BluetoothConnectionStatusSchema,
	DeviceConnectionStatusSchema: () => DeviceConnectionStatusSchema,
	EthernetConnectionStatusSchema: () => EthernetConnectionStatusSchema,
	NetworkConnectionStatusSchema: () => NetworkConnectionStatusSchema,
	SerialConnectionStatusSchema: () => SerialConnectionStatusSchema,
	WifiConnectionStatusSchema: () => WifiConnectionStatusSchema,
	file_meshtastic_connection_status: () => file_meshtastic_connection_status
});
/**
* Describes the file meshtastic/connection_status.proto.
*/ const file_meshtastic_connection_status = /* @__PURE__ */ fileDesc("CiJtZXNodGFzdGljL2Nvbm5lY3Rpb25fc3RhdHVzLnByb3RvEgptZXNodGFzdGljIrECChZEZXZpY2VDb25uZWN0aW9uU3RhdHVzEjMKBHdpZmkYASABKAsyIC5tZXNodGFzdGljLldpZmlDb25uZWN0aW9uU3RhdHVzSACIAQESOwoIZXRoZXJuZXQYAiABKAsyJC5tZXNodGFzdGljLkV0aGVybmV0Q29ubmVjdGlvblN0YXR1c0gBiAEBEj0KCWJsdWV0b290aBgDIAEoCzIlLm1lc2h0YXN0aWMuQmx1ZXRvb3RoQ29ubmVjdGlvblN0YXR1c0gCiAEBEjcKBnNlcmlhbBgEIAEoCzIiLm1lc2h0YXN0aWMuU2VyaWFsQ29ubmVjdGlvblN0YXR1c0gDiAEBQgcKBV93aWZpQgsKCV9ldGhlcm5ldEIMCgpfYmx1ZXRvb3RoQgkKB19zZXJpYWwiZwoUV2lmaUNvbm5lY3Rpb25TdGF0dXMSMwoGc3RhdHVzGAEgASgLMiMubWVzaHRhc3RpYy5OZXR3b3JrQ29ubmVjdGlvblN0YXR1cxIMCgRzc2lkGAIgASgJEgwKBHJzc2kYAyABKAUiTwoYRXRoZXJuZXRDb25uZWN0aW9uU3RhdHVzEjMKBnN0YXR1cxgBIAEoCzIjLm1lc2h0YXN0aWMuTmV0d29ya0Nvbm5lY3Rpb25TdGF0dXMiewoXTmV0d29ya0Nvbm5lY3Rpb25TdGF0dXMSEgoKaXBfYWRkcmVzcxgBIAEoBxIUCgxpc19jb25uZWN0ZWQYAiABKAgSGQoRaXNfbXF0dF9jb25uZWN0ZWQYAyABKAgSGwoTaXNfc3lzbG9nX2Nvbm5lY3RlZBgEIAEoCCJMChlCbHVldG9vdGhDb25uZWN0aW9uU3RhdHVzEgsKA3BpbhgBIAEoDRIMCgRyc3NpGAIgASgFEhQKDGlzX2Nvbm5lY3RlZBgDIAEoCCI8ChZTZXJpYWxDb25uZWN0aW9uU3RhdHVzEgwKBGJhdWQYASABKA0SFAoMaXNfY29ubmVjdGVkGAIgASgIQmUKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCEENvbm5TdGF0dXNQcm90b3NaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z");
/**
* Describes the message meshtastic.DeviceConnectionStatus.
* Use `create(DeviceConnectionStatusSchema)` to create a new message.
*/ const DeviceConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 0);
/**
* Describes the message meshtastic.WifiConnectionStatus.
* Use `create(WifiConnectionStatusSchema)` to create a new message.
*/ const WifiConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 1);
/**
* Describes the message meshtastic.EthernetConnectionStatus.
* Use `create(EthernetConnectionStatusSchema)` to create a new message.
*/ const EthernetConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 2);
/**
* Describes the message meshtastic.NetworkConnectionStatus.
* Use `create(NetworkConnectionStatusSchema)` to create a new message.
*/ const NetworkConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 3);
/**
* Describes the message meshtastic.BluetoothConnectionStatus.
* Use `create(BluetoothConnectionStatusSchema)` to create a new message.
*/ const BluetoothConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 4);
/**
* Describes the message meshtastic.SerialConnectionStatus.
* Use `create(SerialConnectionStatusSchema)` to create a new message.
*/ const SerialConnectionStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_connection_status, 5);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/module_config_pb.js
var module_config_pb_exports = {};
__export(module_config_pb_exports, {
	ModuleConfigSchema: () => ModuleConfigSchema,
	ModuleConfig_AmbientLightingConfigSchema: () => ModuleConfig_AmbientLightingConfigSchema,
	ModuleConfig_AudioConfigSchema: () => ModuleConfig_AudioConfigSchema,
	ModuleConfig_AudioConfig_Audio_Baud: () => ModuleConfig_AudioConfig_Audio_Baud,
	ModuleConfig_AudioConfig_Audio_BaudSchema: () => ModuleConfig_AudioConfig_Audio_BaudSchema,
	ModuleConfig_CannedMessageConfigSchema: () => ModuleConfig_CannedMessageConfigSchema,
	ModuleConfig_CannedMessageConfig_InputEventChar: () => ModuleConfig_CannedMessageConfig_InputEventChar,
	ModuleConfig_CannedMessageConfig_InputEventCharSchema: () => ModuleConfig_CannedMessageConfig_InputEventCharSchema,
	ModuleConfig_DetectionSensorConfigSchema: () => ModuleConfig_DetectionSensorConfigSchema,
	ModuleConfig_DetectionSensorConfig_TriggerType: () => ModuleConfig_DetectionSensorConfig_TriggerType,
	ModuleConfig_DetectionSensorConfig_TriggerTypeSchema: () => ModuleConfig_DetectionSensorConfig_TriggerTypeSchema,
	ModuleConfig_ExternalNotificationConfigSchema: () => ModuleConfig_ExternalNotificationConfigSchema,
	ModuleConfig_MQTTConfigSchema: () => ModuleConfig_MQTTConfigSchema,
	ModuleConfig_MapReportSettingsSchema: () => ModuleConfig_MapReportSettingsSchema,
	ModuleConfig_NeighborInfoConfigSchema: () => ModuleConfig_NeighborInfoConfigSchema,
	ModuleConfig_PaxcounterConfigSchema: () => ModuleConfig_PaxcounterConfigSchema,
	ModuleConfig_RangeTestConfigSchema: () => ModuleConfig_RangeTestConfigSchema,
	ModuleConfig_RemoteHardwareConfigSchema: () => ModuleConfig_RemoteHardwareConfigSchema,
	ModuleConfig_SerialConfigSchema: () => ModuleConfig_SerialConfigSchema,
	ModuleConfig_SerialConfig_Serial_Baud: () => ModuleConfig_SerialConfig_Serial_Baud,
	ModuleConfig_SerialConfig_Serial_BaudSchema: () => ModuleConfig_SerialConfig_Serial_BaudSchema,
	ModuleConfig_SerialConfig_Serial_Mode: () => ModuleConfig_SerialConfig_Serial_Mode,
	ModuleConfig_SerialConfig_Serial_ModeSchema: () => ModuleConfig_SerialConfig_Serial_ModeSchema,
	ModuleConfig_StoreForwardConfigSchema: () => ModuleConfig_StoreForwardConfigSchema,
	ModuleConfig_TelemetryConfigSchema: () => ModuleConfig_TelemetryConfigSchema,
	RemoteHardwarePinSchema: () => RemoteHardwarePinSchema,
	RemoteHardwarePinType: () => RemoteHardwarePinType,
	RemoteHardwarePinTypeSchema: () => RemoteHardwarePinTypeSchema,
	file_meshtastic_module_config: () => file_meshtastic_module_config
});
/**
* Describes the file meshtastic/module_config.proto.
*/ const file_meshtastic_module_config = /* @__PURE__ */ fileDesc("Ch5tZXNodGFzdGljL21vZHVsZV9jb25maWcucHJvdG8SCm1lc2h0YXN0aWMitSYKDE1vZHVsZUNvbmZpZxIzCgRtcXR0GAEgASgLMiMubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuTVFUVENvbmZpZ0gAEjcKBnNlcmlhbBgCIAEoCzIlLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLlNlcmlhbENvbmZpZ0gAElQKFWV4dGVybmFsX25vdGlmaWNhdGlvbhgDIAEoCzIzLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkV4dGVybmFsTm90aWZpY2F0aW9uQ29uZmlnSAASRAoNc3RvcmVfZm9yd2FyZBgEIAEoCzIrLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLlN0b3JlRm9yd2FyZENvbmZpZ0gAEj4KCnJhbmdlX3Rlc3QYBSABKAsyKC5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5SYW5nZVRlc3RDb25maWdIABI9Cgl0ZWxlbWV0cnkYBiABKAsyKC5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5UZWxlbWV0cnlDb25maWdIABJGCg5jYW5uZWRfbWVzc2FnZRgHIAEoCzIsLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkNhbm5lZE1lc3NhZ2VDb25maWdIABI1CgVhdWRpbxgIIAEoCzIkLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkF1ZGlvQ29uZmlnSAASSAoPcmVtb3RlX2hhcmR3YXJlGAkgASgLMi0ubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuUmVtb3RlSGFyZHdhcmVDb25maWdIABJECg1uZWlnaGJvcl9pbmZvGAogASgLMisubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuTmVpZ2hib3JJbmZvQ29uZmlnSAASSgoQYW1iaWVudF9saWdodGluZxgLIAEoCzIuLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkFtYmllbnRMaWdodGluZ0NvbmZpZ0gAEkoKEGRldGVjdGlvbl9zZW5zb3IYDCABKAsyLi5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5EZXRlY3Rpb25TZW5zb3JDb25maWdIABI/CgpwYXhjb3VudGVyGA0gASgLMikubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuUGF4Y291bnRlckNvbmZpZ0gAGrACCgpNUVRUQ29uZmlnEg8KB2VuYWJsZWQYASABKAgSDwoHYWRkcmVzcxgCIAEoCRIQCgh1c2VybmFtZRgDIAEoCRIQCghwYXNzd29yZBgEIAEoCRIaChJlbmNyeXB0aW9uX2VuYWJsZWQYBSABKAgSFAoManNvbl9lbmFibGVkGAYgASgIEhMKC3Rsc19lbmFibGVkGAcgASgIEgwKBHJvb3QYCCABKAkSHwoXcHJveHlfdG9fY2xpZW50X2VuYWJsZWQYCSABKAgSHQoVbWFwX3JlcG9ydGluZ19lbmFibGVkGAogASgIEkcKE21hcF9yZXBvcnRfc2V0dGluZ3MYCyABKAsyKi5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5NYXBSZXBvcnRTZXR0aW5ncxpuChFNYXBSZXBvcnRTZXR0aW5ncxIdChVwdWJsaXNoX2ludGVydmFsX3NlY3MYASABKA0SGgoScG9zaXRpb25fcHJlY2lzaW9uGAIgASgNEh4KFnNob3VsZF9yZXBvcnRfbG9jYXRpb24YAyABKAgaggEKFFJlbW90ZUhhcmR3YXJlQ29uZmlnEg8KB2VuYWJsZWQYASABKAgSIgoaYWxsb3dfdW5kZWZpbmVkX3Bpbl9hY2Nlc3MYAiABKAgSNQoOYXZhaWxhYmxlX3BpbnMYAyADKAsyHS5tZXNodGFzdGljLlJlbW90ZUhhcmR3YXJlUGluGloKEk5laWdoYm9ySW5mb0NvbmZpZxIPCgdlbmFibGVkGAEgASgIEhcKD3VwZGF0ZV9pbnRlcnZhbBgCIAEoDRIaChJ0cmFuc21pdF9vdmVyX2xvcmEYAyABKAgalwMKFURldGVjdGlvblNlbnNvckNvbmZpZxIPCgdlbmFibGVkGAEgASgIEh4KFm1pbmltdW1fYnJvYWRjYXN0X3NlY3MYAiABKA0SHAoUc3RhdGVfYnJvYWRjYXN0X3NlY3MYAyABKA0SEQoJc2VuZF9iZWxsGAQgASgIEgwKBG5hbWUYBSABKAkSEwoLbW9uaXRvcl9waW4YBiABKA0SWgoWZGV0ZWN0aW9uX3RyaWdnZXJfdHlwZRgHIAEoDjI6Lm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkRldGVjdGlvblNlbnNvckNvbmZpZy5UcmlnZ2VyVHlwZRISCgp1c2VfcHVsbHVwGAggASgIIogBCgtUcmlnZ2VyVHlwZRINCglMT0dJQ19MT1cQABIOCgpMT0dJQ19ISUdIEAESEAoMRkFMTElOR19FREdFEAISDwoLUklTSU5HX0VER0UQAxIaChZFSVRIRVJfRURHRV9BQ1RJVkVfTE9XEAQSGwoXRUlUSEVSX0VER0VfQUNUSVZFX0hJR0gQBRrkAgoLQXVkaW9Db25maWcSFgoOY29kZWMyX2VuYWJsZWQYASABKAgSDwoHcHR0X3BpbhgCIAEoDRJACgdiaXRyYXRlGAMgASgOMi8ubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuQXVkaW9Db25maWcuQXVkaW9fQmF1ZBIOCgZpMnNfd3MYBCABKA0SDgoGaTJzX3NkGAUgASgNEg8KB2kyc19kaW4YBiABKA0SDwoHaTJzX3NjaxgHIAEoDSKnAQoKQXVkaW9fQmF1ZBISCg5DT0RFQzJfREVGQVVMVBAAEg8KC0NPREVDMl8zMjAwEAESDwoLQ09ERUMyXzI0MDAQAhIPCgtDT0RFQzJfMTYwMBADEg8KC0NPREVDMl8xNDAwEAQSDwoLQ09ERUMyXzEzMDAQBRIPCgtDT0RFQzJfMTIwMBAGEg4KCkNPREVDMl83MDAQBxIPCgtDT0RFQzJfNzAwQhAIGnYKEFBheGNvdW50ZXJDb25maWcSDwoHZW5hYmxlZBgBIAEoCBIiChpwYXhjb3VudGVyX3VwZGF0ZV9pbnRlcnZhbBgCIAEoDRIWCg53aWZpX3RocmVzaG9sZBgDIAEoBRIVCg1ibGVfdGhyZXNob2xkGAQgASgFGowFCgxTZXJpYWxDb25maWcSDwoHZW5hYmxlZBgBIAEoCBIMCgRlY2hvGAIgASgIEgsKA3J4ZBgDIAEoDRILCgN0eGQYBCABKA0SPwoEYmF1ZBgFIAEoDjIxLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLlNlcmlhbENvbmZpZy5TZXJpYWxfQmF1ZBIPCgd0aW1lb3V0GAYgASgNEj8KBG1vZGUYByABKA4yMS5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5TZXJpYWxDb25maWcuU2VyaWFsX01vZGUSJAocb3ZlcnJpZGVfY29uc29sZV9zZXJpYWxfcG9ydBgIIAEoCCKKAgoLU2VyaWFsX0JhdWQSEAoMQkFVRF9ERUZBVUxUEAASDAoIQkFVRF8xMTAQARIMCghCQVVEXzMwMBACEgwKCEJBVURfNjAwEAMSDQoJQkFVRF8xMjAwEAQSDQoJQkFVRF8yNDAwEAUSDQoJQkFVRF80ODAwEAYSDQoJQkFVRF85NjAwEAcSDgoKQkFVRF8xOTIwMBAIEg4KCkJBVURfMzg0MDAQCRIOCgpCQVVEXzU3NjAwEAoSDwoLQkFVRF8xMTUyMDAQCxIPCgtCQVVEXzIzMDQwMBAMEg8KC0JBVURfNDYwODAwEA0SDwoLQkFVRF81NzYwMDAQDhIPCgtCQVVEXzkyMTYwMBAPIn0KC1NlcmlhbF9Nb2RlEgsKB0RFRkFVTFQQABIKCgZTSU1QTEUQARIJCgVQUk9UTxACEgsKB1RFWFRNU0cQAxIICgROTUVBEAQSCwoHQ0FMVE9QTxAFEggKBFdTODUQBhINCglWRV9ESVJFQ1QQBxINCglNU19DT05GSUcQCBrpAgoaRXh0ZXJuYWxOb3RpZmljYXRpb25Db25maWcSDwoHZW5hYmxlZBgBIAEoCBIRCglvdXRwdXRfbXMYAiABKA0SDgoGb3V0cHV0GAMgASgNEhQKDG91dHB1dF92aWJyYRgIIAEoDRIVCg1vdXRwdXRfYnV6emVyGAkgASgNEg4KBmFjdGl2ZRgEIAEoCBIVCg1hbGVydF9tZXNzYWdlGAUgASgIEhsKE2FsZXJ0X21lc3NhZ2VfdmlicmEYCiABKAgSHAoUYWxlcnRfbWVzc2FnZV9idXp6ZXIYCyABKAgSEgoKYWxlcnRfYmVsbBgGIAEoCBIYChBhbGVydF9iZWxsX3ZpYnJhGAwgASgIEhkKEWFsZXJ0X2JlbGxfYnV6emVyGA0gASgIEg8KB3VzZV9wd20YByABKAgSEwoLbmFnX3RpbWVvdXQYDiABKA0SGQoRdXNlX2kyc19hc19idXp6ZXIYDyABKAgalwEKElN0b3JlRm9yd2FyZENvbmZpZxIPCgdlbmFibGVkGAEgASgIEhEKCWhlYXJ0YmVhdBgCIAEoCBIPCgdyZWNvcmRzGAMgASgNEhoKEmhpc3RvcnlfcmV0dXJuX21heBgEIAEoDRIdChVoaXN0b3J5X3JldHVybl93aW5kb3cYBSABKA0SEQoJaXNfc2VydmVyGAYgASgIGlkKD1JhbmdlVGVzdENvbmZpZxIPCgdlbmFibGVkGAEgASgIEg4KBnNlbmRlchgCIAEoDRIMCgRzYXZlGAMgASgIEhcKD2NsZWFyX29uX3JlYm9vdBgEIAEoCBrrAwoPVGVsZW1ldHJ5Q29uZmlnEh4KFmRldmljZV91cGRhdGVfaW50ZXJ2YWwYASABKA0SIwobZW52aXJvbm1lbnRfdXBkYXRlX2ludGVydmFsGAIgASgNEicKH2Vudmlyb25tZW50X21lYXN1cmVtZW50X2VuYWJsZWQYAyABKAgSIgoaZW52aXJvbm1lbnRfc2NyZWVuX2VuYWJsZWQYBCABKAgSJgoeZW52aXJvbm1lbnRfZGlzcGxheV9mYWhyZW5oZWl0GAUgASgIEhsKE2Fpcl9xdWFsaXR5X2VuYWJsZWQYBiABKAgSHAoUYWlyX3F1YWxpdHlfaW50ZXJ2YWwYByABKA0SIQoZcG93ZXJfbWVhc3VyZW1lbnRfZW5hYmxlZBgIIAEoCBIdChVwb3dlcl91cGRhdGVfaW50ZXJ2YWwYCSABKA0SHAoUcG93ZXJfc2NyZWVuX2VuYWJsZWQYCiABKAgSIgoaaGVhbHRoX21lYXN1cmVtZW50X2VuYWJsZWQYCyABKAgSHgoWaGVhbHRoX3VwZGF0ZV9pbnRlcnZhbBgMIAEoDRIdChVoZWFsdGhfc2NyZWVuX2VuYWJsZWQYDSABKAgSIAoYZGV2aWNlX3RlbGVtZXRyeV9lbmFibGVkGA4gASgIGt4EChNDYW5uZWRNZXNzYWdlQ29uZmlnEhcKD3JvdGFyeTFfZW5hYmxlZBgBIAEoCBIZChFpbnB1dGJyb2tlcl9waW5fYRgCIAEoDRIZChFpbnB1dGJyb2tlcl9waW5fYhgDIAEoDRIdChVpbnB1dGJyb2tlcl9waW5fcHJlc3MYBCABKA0SWQoUaW5wdXRicm9rZXJfZXZlbnRfY3cYBSABKA4yOy5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5DYW5uZWRNZXNzYWdlQ29uZmlnLklucHV0RXZlbnRDaGFyEloKFWlucHV0YnJva2VyX2V2ZW50X2NjdxgGIAEoDjI7Lm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkNhbm5lZE1lc3NhZ2VDb25maWcuSW5wdXRFdmVudENoYXISXAoXaW5wdXRicm9rZXJfZXZlbnRfcHJlc3MYByABKA4yOy5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5DYW5uZWRNZXNzYWdlQ29uZmlnLklucHV0RXZlbnRDaGFyEhcKD3VwZG93bjFfZW5hYmxlZBgIIAEoCBITCgdlbmFibGVkGAkgASgIQgIYARIeChJhbGxvd19pbnB1dF9zb3VyY2UYCiABKAlCAhgBEhEKCXNlbmRfYmVsbBgLIAEoCCJjCg5JbnB1dEV2ZW50Q2hhchIICgROT05FEAASBgoCVVAQERIICgRET1dOEBISCAoETEVGVBATEgkKBVJJR0hUEBQSCgoGU0VMRUNUEAoSCAoEQkFDSxAbEgoKBkNBTkNFTBAYGmUKFUFtYmllbnRMaWdodGluZ0NvbmZpZxIRCglsZWRfc3RhdGUYASABKAgSDwoHY3VycmVudBgCIAEoDRILCgNyZWQYAyABKA0SDQoFZ3JlZW4YBCABKA0SDAoEYmx1ZRgFIAEoDUIRCg9wYXlsb2FkX3ZhcmlhbnQiZAoRUmVtb3RlSGFyZHdhcmVQaW4SEAoIZ3Bpb19waW4YASABKA0SDAoEbmFtZRgCIAEoCRIvCgR0eXBlGAMgASgOMiEubWVzaHRhc3RpYy5SZW1vdGVIYXJkd2FyZVBpblR5cGUqSQoVUmVtb3RlSGFyZHdhcmVQaW5UeXBlEgsKB1VOS05PV04QABIQCgxESUdJVEFMX1JFQUQQARIRCg1ESUdJVEFMX1dSSVRFEAJCZwoTY29tLmdlZWtzdmlsbGUubWVzaEISTW9kdWxlQ29uZmlnUHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw");
/**
* Describes the message meshtastic.ModuleConfig.
* Use `create(ModuleConfigSchema)` to create a new message.
*/ const ModuleConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0);
/**
* Describes the message meshtastic.ModuleConfig.MQTTConfig.
* Use `create(ModuleConfig_MQTTConfigSchema)` to create a new message.
*/ const ModuleConfig_MQTTConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 0);
/**
* Describes the message meshtastic.ModuleConfig.MapReportSettings.
* Use `create(ModuleConfig_MapReportSettingsSchema)` to create a new message.
*/ const ModuleConfig_MapReportSettingsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 1);
/**
* Describes the message meshtastic.ModuleConfig.RemoteHardwareConfig.
* Use `create(ModuleConfig_RemoteHardwareConfigSchema)` to create a new message.
*/ const ModuleConfig_RemoteHardwareConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 2);
/**
* Describes the message meshtastic.ModuleConfig.NeighborInfoConfig.
* Use `create(ModuleConfig_NeighborInfoConfigSchema)` to create a new message.
*/ const ModuleConfig_NeighborInfoConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 3);
/**
* Describes the message meshtastic.ModuleConfig.DetectionSensorConfig.
* Use `create(ModuleConfig_DetectionSensorConfigSchema)` to create a new message.
*/ const ModuleConfig_DetectionSensorConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 4);
/**
* @generated from enum meshtastic.ModuleConfig.DetectionSensorConfig.TriggerType
*/ var ModuleConfig_DetectionSensorConfig_TriggerType = /* @__PURE__ */ function(ModuleConfig_DetectionSensorConfig_TriggerType$1) {
	/**
	* Event is triggered if pin is low
	*
	* @generated from enum value: LOGIC_LOW = 0;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["LOGIC_LOW"] = 0] = "LOGIC_LOW";
	/**
	* Event is triggered if pin is high
	*
	* @generated from enum value: LOGIC_HIGH = 1;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["LOGIC_HIGH"] = 1] = "LOGIC_HIGH";
	/**
	* Event is triggered when pin goes high to low
	*
	* @generated from enum value: FALLING_EDGE = 2;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["FALLING_EDGE"] = 2] = "FALLING_EDGE";
	/**
	* Event is triggered when pin goes low to high
	*
	* @generated from enum value: RISING_EDGE = 3;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["RISING_EDGE"] = 3] = "RISING_EDGE";
	/**
	* Event is triggered on every pin state change, low is considered to be
	* "active"
	*
	* @generated from enum value: EITHER_EDGE_ACTIVE_LOW = 4;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["EITHER_EDGE_ACTIVE_LOW"] = 4] = "EITHER_EDGE_ACTIVE_LOW";
	/**
	* Event is triggered on every pin state change, high is considered to be
	* "active"
	*
	* @generated from enum value: EITHER_EDGE_ACTIVE_HIGH = 5;
	*/ ModuleConfig_DetectionSensorConfig_TriggerType$1[ModuleConfig_DetectionSensorConfig_TriggerType$1["EITHER_EDGE_ACTIVE_HIGH"] = 5] = "EITHER_EDGE_ACTIVE_HIGH";
	return ModuleConfig_DetectionSensorConfig_TriggerType$1;
}({});
/**
* Describes the enum meshtastic.ModuleConfig.DetectionSensorConfig.TriggerType.
*/ const ModuleConfig_DetectionSensorConfig_TriggerTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0, 4, 0);
/**
* Describes the message meshtastic.ModuleConfig.AudioConfig.
* Use `create(ModuleConfig_AudioConfigSchema)` to create a new message.
*/ const ModuleConfig_AudioConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 5);
/**
*
* Baudrate for codec2 voice
*
* @generated from enum meshtastic.ModuleConfig.AudioConfig.Audio_Baud
*/ var ModuleConfig_AudioConfig_Audio_Baud = /* @__PURE__ */ function(ModuleConfig_AudioConfig_Audio_Baud$1) {
	/**
	* @generated from enum value: CODEC2_DEFAULT = 0;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_DEFAULT"] = 0] = "CODEC2_DEFAULT";
	/**
	* @generated from enum value: CODEC2_3200 = 1;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_3200"] = 1] = "CODEC2_3200";
	/**
	* @generated from enum value: CODEC2_2400 = 2;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_2400"] = 2] = "CODEC2_2400";
	/**
	* @generated from enum value: CODEC2_1600 = 3;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_1600"] = 3] = "CODEC2_1600";
	/**
	* @generated from enum value: CODEC2_1400 = 4;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_1400"] = 4] = "CODEC2_1400";
	/**
	* @generated from enum value: CODEC2_1300 = 5;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_1300"] = 5] = "CODEC2_1300";
	/**
	* @generated from enum value: CODEC2_1200 = 6;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_1200"] = 6] = "CODEC2_1200";
	/**
	* @generated from enum value: CODEC2_700 = 7;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_700"] = 7] = "CODEC2_700";
	/**
	* @generated from enum value: CODEC2_700B = 8;
	*/ ModuleConfig_AudioConfig_Audio_Baud$1[ModuleConfig_AudioConfig_Audio_Baud$1["CODEC2_700B"] = 8] = "CODEC2_700B";
	return ModuleConfig_AudioConfig_Audio_Baud$1;
}({});
/**
* Describes the enum meshtastic.ModuleConfig.AudioConfig.Audio_Baud.
*/ const ModuleConfig_AudioConfig_Audio_BaudSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0, 5, 0);
/**
* Describes the message meshtastic.ModuleConfig.PaxcounterConfig.
* Use `create(ModuleConfig_PaxcounterConfigSchema)` to create a new message.
*/ const ModuleConfig_PaxcounterConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 6);
/**
* Describes the message meshtastic.ModuleConfig.SerialConfig.
* Use `create(ModuleConfig_SerialConfigSchema)` to create a new message.
*/ const ModuleConfig_SerialConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 7);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.ModuleConfig.SerialConfig.Serial_Baud
*/ var ModuleConfig_SerialConfig_Serial_Baud = /* @__PURE__ */ function(ModuleConfig_SerialConfig_Serial_Baud$1) {
	/**
	* @generated from enum value: BAUD_DEFAULT = 0;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_DEFAULT"] = 0] = "BAUD_DEFAULT";
	/**
	* @generated from enum value: BAUD_110 = 1;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_110"] = 1] = "BAUD_110";
	/**
	* @generated from enum value: BAUD_300 = 2;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_300"] = 2] = "BAUD_300";
	/**
	* @generated from enum value: BAUD_600 = 3;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_600"] = 3] = "BAUD_600";
	/**
	* @generated from enum value: BAUD_1200 = 4;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_1200"] = 4] = "BAUD_1200";
	/**
	* @generated from enum value: BAUD_2400 = 5;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_2400"] = 5] = "BAUD_2400";
	/**
	* @generated from enum value: BAUD_4800 = 6;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_4800"] = 6] = "BAUD_4800";
	/**
	* @generated from enum value: BAUD_9600 = 7;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_9600"] = 7] = "BAUD_9600";
	/**
	* @generated from enum value: BAUD_19200 = 8;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_19200"] = 8] = "BAUD_19200";
	/**
	* @generated from enum value: BAUD_38400 = 9;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_38400"] = 9] = "BAUD_38400";
	/**
	* @generated from enum value: BAUD_57600 = 10;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_57600"] = 10] = "BAUD_57600";
	/**
	* @generated from enum value: BAUD_115200 = 11;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_115200"] = 11] = "BAUD_115200";
	/**
	* @generated from enum value: BAUD_230400 = 12;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_230400"] = 12] = "BAUD_230400";
	/**
	* @generated from enum value: BAUD_460800 = 13;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_460800"] = 13] = "BAUD_460800";
	/**
	* @generated from enum value: BAUD_576000 = 14;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_576000"] = 14] = "BAUD_576000";
	/**
	* @generated from enum value: BAUD_921600 = 15;
	*/ ModuleConfig_SerialConfig_Serial_Baud$1[ModuleConfig_SerialConfig_Serial_Baud$1["BAUD_921600"] = 15] = "BAUD_921600";
	return ModuleConfig_SerialConfig_Serial_Baud$1;
}({});
/**
* Describes the enum meshtastic.ModuleConfig.SerialConfig.Serial_Baud.
*/ const ModuleConfig_SerialConfig_Serial_BaudSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0, 7, 0);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.ModuleConfig.SerialConfig.Serial_Mode
*/ var ModuleConfig_SerialConfig_Serial_Mode = /* @__PURE__ */ function(ModuleConfig_SerialConfig_Serial_Mode$1) {
	/**
	* @generated from enum value: DEFAULT = 0;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["DEFAULT"] = 0] = "DEFAULT";
	/**
	* @generated from enum value: SIMPLE = 1;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["SIMPLE"] = 1] = "SIMPLE";
	/**
	* @generated from enum value: PROTO = 2;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["PROTO"] = 2] = "PROTO";
	/**
	* @generated from enum value: TEXTMSG = 3;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["TEXTMSG"] = 3] = "TEXTMSG";
	/**
	* @generated from enum value: NMEA = 4;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["NMEA"] = 4] = "NMEA";
	/**
	* NMEA messages specifically tailored for CalTopo
	*
	* @generated from enum value: CALTOPO = 5;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["CALTOPO"] = 5] = "CALTOPO";
	/**
	* Ecowitt WS85 weather station
	*
	* @generated from enum value: WS85 = 6;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["WS85"] = 6] = "WS85";
	/**
	* VE.Direct is a serial protocol used by Victron Energy products
	* https://beta.ivc.no/wiki/index.php/Victron_VE_Direct_DIY_Cable
	*
	* @generated from enum value: VE_DIRECT = 7;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["VE_DIRECT"] = 7] = "VE_DIRECT";
	/**
	* Used to configure and view some parameters of MeshSolar.
	* https://heltec.org/project/meshsolar/
	*
	* @generated from enum value: MS_CONFIG = 8;
	*/ ModuleConfig_SerialConfig_Serial_Mode$1[ModuleConfig_SerialConfig_Serial_Mode$1["MS_CONFIG"] = 8] = "MS_CONFIG";
	return ModuleConfig_SerialConfig_Serial_Mode$1;
}({});
/**
* Describes the enum meshtastic.ModuleConfig.SerialConfig.Serial_Mode.
*/ const ModuleConfig_SerialConfig_Serial_ModeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0, 7, 1);
/**
* Describes the message meshtastic.ModuleConfig.ExternalNotificationConfig.
* Use `create(ModuleConfig_ExternalNotificationConfigSchema)` to create a new message.
*/ const ModuleConfig_ExternalNotificationConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 8);
/**
* Describes the message meshtastic.ModuleConfig.StoreForwardConfig.
* Use `create(ModuleConfig_StoreForwardConfigSchema)` to create a new message.
*/ const ModuleConfig_StoreForwardConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 9);
/**
* Describes the message meshtastic.ModuleConfig.RangeTestConfig.
* Use `create(ModuleConfig_RangeTestConfigSchema)` to create a new message.
*/ const ModuleConfig_RangeTestConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 10);
/**
* Describes the message meshtastic.ModuleConfig.TelemetryConfig.
* Use `create(ModuleConfig_TelemetryConfigSchema)` to create a new message.
*/ const ModuleConfig_TelemetryConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 11);
/**
* Describes the message meshtastic.ModuleConfig.CannedMessageConfig.
* Use `create(ModuleConfig_CannedMessageConfigSchema)` to create a new message.
*/ const ModuleConfig_CannedMessageConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 12);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.ModuleConfig.CannedMessageConfig.InputEventChar
*/ var ModuleConfig_CannedMessageConfig_InputEventChar = /* @__PURE__ */ function(ModuleConfig_CannedMessageConfig_InputEventChar$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NONE = 0;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["NONE"] = 0] = "NONE";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: UP = 17;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["UP"] = 17] = "UP";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: DOWN = 18;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["DOWN"] = 18] = "DOWN";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LEFT = 19;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["LEFT"] = 19] = "LEFT";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: RIGHT = 20;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["RIGHT"] = 20] = "RIGHT";
	/**
	*
	* '\n'
	*
	* @generated from enum value: SELECT = 10;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["SELECT"] = 10] = "SELECT";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: BACK = 27;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["BACK"] = 27] = "BACK";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: CANCEL = 24;
	*/ ModuleConfig_CannedMessageConfig_InputEventChar$1[ModuleConfig_CannedMessageConfig_InputEventChar$1["CANCEL"] = 24] = "CANCEL";
	return ModuleConfig_CannedMessageConfig_InputEventChar$1;
}({});
/**
* Describes the enum meshtastic.ModuleConfig.CannedMessageConfig.InputEventChar.
*/ const ModuleConfig_CannedMessageConfig_InputEventCharSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0, 12, 0);
/**
* Describes the message meshtastic.ModuleConfig.AmbientLightingConfig.
* Use `create(ModuleConfig_AmbientLightingConfigSchema)` to create a new message.
*/ const ModuleConfig_AmbientLightingConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 0, 13);
/**
* Describes the message meshtastic.RemoteHardwarePin.
* Use `create(RemoteHardwarePinSchema)` to create a new message.
*/ const RemoteHardwarePinSchema = /* @__PURE__ */ messageDesc(file_meshtastic_module_config, 1);
/**
* @generated from enum meshtastic.RemoteHardwarePinType
*/ var RemoteHardwarePinType = /* @__PURE__ */ function(RemoteHardwarePinType$1) {
	/**
	*
	* Unset/unused
	*
	* @generated from enum value: UNKNOWN = 0;
	*/ RemoteHardwarePinType$1[RemoteHardwarePinType$1["UNKNOWN"] = 0] = "UNKNOWN";
	/**
	*
	* GPIO pin can be read (if it is high / low)
	*
	* @generated from enum value: DIGITAL_READ = 1;
	*/ RemoteHardwarePinType$1[RemoteHardwarePinType$1["DIGITAL_READ"] = 1] = "DIGITAL_READ";
	/**
	*
	* GPIO pin can be written to (high / low)
	*
	* @generated from enum value: DIGITAL_WRITE = 2;
	*/ RemoteHardwarePinType$1[RemoteHardwarePinType$1["DIGITAL_WRITE"] = 2] = "DIGITAL_WRITE";
	return RemoteHardwarePinType$1;
}({});
/**
* Describes the enum meshtastic.RemoteHardwarePinType.
*/ const RemoteHardwarePinTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_module_config, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/portnums_pb.js
var portnums_pb_exports = {};
__export(portnums_pb_exports, {
	PortNum: () => PortNum,
	PortNumSchema: () => PortNumSchema,
	file_meshtastic_portnums: () => file_meshtastic_portnums
});
/**
* Describes the file meshtastic/portnums.proto.
*/ const file_meshtastic_portnums = /* @__PURE__ */ fileDesc("ChltZXNodGFzdGljL3BvcnRudW1zLnByb3RvEgptZXNodGFzdGljKvYECgdQb3J0TnVtEg8KC1VOS05PV05fQVBQEAASFAoQVEVYVF9NRVNTQUdFX0FQUBABEhcKE1JFTU9URV9IQVJEV0FSRV9BUFAQAhIQCgxQT1NJVElPTl9BUFAQAxIQCgxOT0RFSU5GT19BUFAQBBIPCgtST1VUSU5HX0FQUBAFEg0KCUFETUlOX0FQUBAGEh8KG1RFWFRfTUVTU0FHRV9DT01QUkVTU0VEX0FQUBAHEhAKDFdBWVBPSU5UX0FQUBAIEg0KCUFVRElPX0FQUBAJEhgKFERFVEVDVElPTl9TRU5TT1JfQVBQEAoSDQoJQUxFUlRfQVBQEAsSGAoUS0VZX1ZFUklGSUNBVElPTl9BUFAQDBINCglSRVBMWV9BUFAQIBIRCg1JUF9UVU5ORUxfQVBQECESEgoOUEFYQ09VTlRFUl9BUFAQIhIOCgpTRVJJQUxfQVBQEEASFQoRU1RPUkVfRk9SV0FSRF9BUFAQQRISCg5SQU5HRV9URVNUX0FQUBBCEhEKDVRFTEVNRVRSWV9BUFAQQxILCgdaUFNfQVBQEEQSEQoNU0lNVUxBVE9SX0FQUBBFEhIKDlRSQUNFUk9VVEVfQVBQEEYSFAoQTkVJR0hCT1JJTkZPX0FQUBBHEg8KC0FUQUtfUExVR0lOEEgSEgoOTUFQX1JFUE9SVF9BUFAQSRITCg9QT1dFUlNUUkVTU19BUFAQShIYChRSRVRJQ1VMVU1fVFVOTkVMX0FQUBBMEg8KC0NBWUVOTkVfQVBQEE0SEAoLUFJJVkFURV9BUFAQgAISEwoOQVRBS19GT1JXQVJERVIQgQISCAoDTUFYEP8DQl0KE2NvbS5nZWVrc3ZpbGxlLm1lc2hCCFBvcnRudW1zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw");
/**
*
* For any new 'apps' that run on the device or via sister apps on phones/PCs they should pick and use a
* unique 'portnum' for their application.
* If you are making a new app using meshtastic, please send in a pull request to add your 'portnum' to this
* master table.
* PortNums should be assigned in the following range:
* 0-63   Core Meshtastic use, do not use for third party apps
* 64-127 Registered 3rd party apps, send in a pull request that adds a new entry to portnums.proto to  register your application
* 256-511 Use one of these portnums for your private applications that you don't want to register publically
* All other values are reserved.
* Note: This was formerly a Type enum named 'typ' with the same id #
* We have change to this 'portnum' based scheme for specifying app handlers for particular payloads.
* This change is backwards compatible by treating the legacy OPAQUE/CLEAR_TEXT values identically.
*
* @generated from enum meshtastic.PortNum
*/ var PortNum = /* @__PURE__ */ function(PortNum$1) {
	/**
	*
	* Deprecated: do not use in new code (formerly called OPAQUE)
	* A message sent from a device outside of the mesh, in a form the mesh does not understand
	* NOTE: This must be 0, because it is documented in IMeshService.aidl to be so
	* ENCODING: binary undefined
	*
	* @generated from enum value: UNKNOWN_APP = 0;
	*/ PortNum$1[PortNum$1["UNKNOWN_APP"] = 0] = "UNKNOWN_APP";
	/**
	*
	* A simple UTF-8 text message, which even the little micros in the mesh
	* can understand and show on their screen eventually in some circumstances
	* even signal might send messages in this form (see below)
	* ENCODING: UTF-8 Plaintext (?)
	*
	* @generated from enum value: TEXT_MESSAGE_APP = 1;
	*/ PortNum$1[PortNum$1["TEXT_MESSAGE_APP"] = 1] = "TEXT_MESSAGE_APP";
	/**
	*
	* Reserved for built-in GPIO/example app.
	* See remote_hardware.proto/HardwareMessage for details on the message sent/received to this port number
	* ENCODING: Protobuf
	*
	* @generated from enum value: REMOTE_HARDWARE_APP = 2;
	*/ PortNum$1[PortNum$1["REMOTE_HARDWARE_APP"] = 2] = "REMOTE_HARDWARE_APP";
	/**
	*
	* The built-in position messaging app.
	* Payload is a Position message.
	* ENCODING: Protobuf
	*
	* @generated from enum value: POSITION_APP = 3;
	*/ PortNum$1[PortNum$1["POSITION_APP"] = 3] = "POSITION_APP";
	/**
	*
	* The built-in user info app.
	* Payload is a User message.
	* ENCODING: Protobuf
	*
	* @generated from enum value: NODEINFO_APP = 4;
	*/ PortNum$1[PortNum$1["NODEINFO_APP"] = 4] = "NODEINFO_APP";
	/**
	*
	* Protocol control packets for mesh protocol use.
	* Payload is a Routing message.
	* ENCODING: Protobuf
	*
	* @generated from enum value: ROUTING_APP = 5;
	*/ PortNum$1[PortNum$1["ROUTING_APP"] = 5] = "ROUTING_APP";
	/**
	*
	* Admin control packets.
	* Payload is a AdminMessage message.
	* ENCODING: Protobuf
	*
	* @generated from enum value: ADMIN_APP = 6;
	*/ PortNum$1[PortNum$1["ADMIN_APP"] = 6] = "ADMIN_APP";
	/**
	*
	* Compressed TEXT_MESSAGE payloads.
	* ENCODING: UTF-8 Plaintext (?) with Unishox2 Compression
	* NOTE: The Device Firmware converts a TEXT_MESSAGE_APP to TEXT_MESSAGE_COMPRESSED_APP if the compressed
	* payload is shorter. There's no need for app developers to do this themselves. Also the firmware will decompress
	* any incoming TEXT_MESSAGE_COMPRESSED_APP payload and convert to TEXT_MESSAGE_APP.
	*
	* @generated from enum value: TEXT_MESSAGE_COMPRESSED_APP = 7;
	*/ PortNum$1[PortNum$1["TEXT_MESSAGE_COMPRESSED_APP"] = 7] = "TEXT_MESSAGE_COMPRESSED_APP";
	/**
	*
	* Waypoint payloads.
	* Payload is a Waypoint message.
	* ENCODING: Protobuf
	*
	* @generated from enum value: WAYPOINT_APP = 8;
	*/ PortNum$1[PortNum$1["WAYPOINT_APP"] = 8] = "WAYPOINT_APP";
	/**
	*
	* Audio Payloads.
	* Encapsulated codec2 packets. On 2.4 GHZ Bandwidths only for now
	* ENCODING: codec2 audio frames
	* NOTE: audio frames contain a 3 byte header (0xc0 0xde 0xc2) and a one byte marker for the decompressed bitrate.
	* This marker comes from the 'moduleConfig.audio.bitrate' enum minus one.
	*
	* @generated from enum value: AUDIO_APP = 9;
	*/ PortNum$1[PortNum$1["AUDIO_APP"] = 9] = "AUDIO_APP";
	/**
	*
	* Same as Text Message but originating from Detection Sensor Module.
	* NOTE: This portnum traffic is not sent to the public MQTT starting at firmware version 2.2.9
	*
	* @generated from enum value: DETECTION_SENSOR_APP = 10;
	*/ PortNum$1[PortNum$1["DETECTION_SENSOR_APP"] = 10] = "DETECTION_SENSOR_APP";
	/**
	*
	* Same as Text Message but used for critical alerts.
	*
	* @generated from enum value: ALERT_APP = 11;
	*/ PortNum$1[PortNum$1["ALERT_APP"] = 11] = "ALERT_APP";
	/**
	*
	* Module/port for handling key verification requests.
	*
	* @generated from enum value: KEY_VERIFICATION_APP = 12;
	*/ PortNum$1[PortNum$1["KEY_VERIFICATION_APP"] = 12] = "KEY_VERIFICATION_APP";
	/**
	*
	* Provides a 'ping' service that replies to any packet it receives.
	* Also serves as a small example module.
	* ENCODING: ASCII Plaintext
	*
	* @generated from enum value: REPLY_APP = 32;
	*/ PortNum$1[PortNum$1["REPLY_APP"] = 32] = "REPLY_APP";
	/**
	*
	* Used for the python IP tunnel feature
	* ENCODING: IP Packet. Handled by the python API, firmware ignores this one and pases on.
	*
	* @generated from enum value: IP_TUNNEL_APP = 33;
	*/ PortNum$1[PortNum$1["IP_TUNNEL_APP"] = 33] = "IP_TUNNEL_APP";
	/**
	*
	* Paxcounter lib included in the firmware
	* ENCODING: protobuf
	*
	* @generated from enum value: PAXCOUNTER_APP = 34;
	*/ PortNum$1[PortNum$1["PAXCOUNTER_APP"] = 34] = "PAXCOUNTER_APP";
	/**
	*
	* Provides a hardware serial interface to send and receive from the Meshtastic network.
	* Connect to the RX/TX pins of a device with 38400 8N1. Packets received from the Meshtastic
	* network is forwarded to the RX pin while sending a packet to TX will go out to the Mesh network.
	* Maximum packet size of 240 bytes.
	* Module is disabled by default can be turned on by setting SERIAL_MODULE_ENABLED = 1 in SerialPlugh.cpp.
	* ENCODING: binary undefined
	*
	* @generated from enum value: SERIAL_APP = 64;
	*/ PortNum$1[PortNum$1["SERIAL_APP"] = 64] = "SERIAL_APP";
	/**
	*
	* STORE_FORWARD_APP (Work in Progress)
	* Maintained by Jm Casler (MC Hamster) : jm@casler.org
	* ENCODING: Protobuf
	*
	* @generated from enum value: STORE_FORWARD_APP = 65;
	*/ PortNum$1[PortNum$1["STORE_FORWARD_APP"] = 65] = "STORE_FORWARD_APP";
	/**
	*
	* Optional port for messages for the range test module.
	* ENCODING: ASCII Plaintext
	* NOTE: This portnum traffic is not sent to the public MQTT starting at firmware version 2.2.9
	*
	* @generated from enum value: RANGE_TEST_APP = 66;
	*/ PortNum$1[PortNum$1["RANGE_TEST_APP"] = 66] = "RANGE_TEST_APP";
	/**
	*
	* Provides a format to send and receive telemetry data from the Meshtastic network.
	* Maintained by Charles Crossan (crossan007) : crossan007@gmail.com
	* ENCODING: Protobuf
	*
	* @generated from enum value: TELEMETRY_APP = 67;
	*/ PortNum$1[PortNum$1["TELEMETRY_APP"] = 67] = "TELEMETRY_APP";
	/**
	*
	* Experimental tools for estimating node position without a GPS
	* Maintained by Github user a-f-G-U-C (a Meshtastic contributor)
	* Project files at https://github.com/a-f-G-U-C/Meshtastic-ZPS
	* ENCODING: arrays of int64 fields
	*
	* @generated from enum value: ZPS_APP = 68;
	*/ PortNum$1[PortNum$1["ZPS_APP"] = 68] = "ZPS_APP";
	/**
	*
	* Used to let multiple instances of Linux native applications communicate
	* as if they did using their LoRa chip.
	* Maintained by GitHub user GUVWAF.
	* Project files at https://github.com/GUVWAF/Meshtasticator
	* ENCODING: Protobuf (?)
	*
	* @generated from enum value: SIMULATOR_APP = 69;
	*/ PortNum$1[PortNum$1["SIMULATOR_APP"] = 69] = "SIMULATOR_APP";
	/**
	*
	* Provides a traceroute functionality to show the route a packet towards
	* a certain destination would take on the mesh. Contains a RouteDiscovery message as payload.
	* ENCODING: Protobuf
	*
	* @generated from enum value: TRACEROUTE_APP = 70;
	*/ PortNum$1[PortNum$1["TRACEROUTE_APP"] = 70] = "TRACEROUTE_APP";
	/**
	*
	* Aggregates edge info for the network by sending out a list of each node's neighbors
	* ENCODING: Protobuf
	*
	* @generated from enum value: NEIGHBORINFO_APP = 71;
	*/ PortNum$1[PortNum$1["NEIGHBORINFO_APP"] = 71] = "NEIGHBORINFO_APP";
	/**
	*
	* ATAK Plugin
	* Portnum for payloads from the official Meshtastic ATAK plugin
	*
	* @generated from enum value: ATAK_PLUGIN = 72;
	*/ PortNum$1[PortNum$1["ATAK_PLUGIN"] = 72] = "ATAK_PLUGIN";
	/**
	*
	* Provides unencrypted information about a node for consumption by a map via MQTT
	*
	* @generated from enum value: MAP_REPORT_APP = 73;
	*/ PortNum$1[PortNum$1["MAP_REPORT_APP"] = 73] = "MAP_REPORT_APP";
	/**
	*
	* PowerStress based monitoring support (for automated power consumption testing)
	*
	* @generated from enum value: POWERSTRESS_APP = 74;
	*/ PortNum$1[PortNum$1["POWERSTRESS_APP"] = 74] = "POWERSTRESS_APP";
	/**
	*
	* Reticulum Network Stack Tunnel App
	* ENCODING: Fragmented RNS Packet. Handled by Meshtastic RNS interface
	*
	* @generated from enum value: RETICULUM_TUNNEL_APP = 76;
	*/ PortNum$1[PortNum$1["RETICULUM_TUNNEL_APP"] = 76] = "RETICULUM_TUNNEL_APP";
	/**
	*
	* App for transporting Cayenne Low Power Payload, popular for LoRaWAN sensor nodes. Offers ability to send
	* arbitrary telemetry over meshtastic that is not covered by telemetry.proto
	* ENCODING: CayenneLLP
	*
	* @generated from enum value: CAYENNE_APP = 77;
	*/ PortNum$1[PortNum$1["CAYENNE_APP"] = 77] = "CAYENNE_APP";
	/**
	*
	* Private applications should use portnums >= 256.
	* To simplify initial development and testing you can use "PRIVATE_APP"
	* in your code without needing to rebuild protobuf files (via [regen-protos.sh](https://github.com/meshtastic/firmware/blob/master/bin/regen-protos.sh))
	*
	* @generated from enum value: PRIVATE_APP = 256;
	*/ PortNum$1[PortNum$1["PRIVATE_APP"] = 256] = "PRIVATE_APP";
	/**
	*
	* ATAK Forwarder Module https://github.com/paulmandal/atak-forwarder
	* ENCODING: libcotshrink
	*
	* @generated from enum value: ATAK_FORWARDER = 257;
	*/ PortNum$1[PortNum$1["ATAK_FORWARDER"] = 257] = "ATAK_FORWARDER";
	/**
	*
	* Currently we limit port nums to no higher than this value
	*
	* @generated from enum value: MAX = 511;
	*/ PortNum$1[PortNum$1["MAX"] = 511] = "MAX";
	return PortNum$1;
}({});
/**
* Describes the enum meshtastic.PortNum.
*/ const PortNumSchema = /* @__PURE__ */ enumDesc(file_meshtastic_portnums, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/telemetry_pb.js
var telemetry_pb_exports = {};
__export(telemetry_pb_exports, {
	AirQualityMetricsSchema: () => AirQualityMetricsSchema,
	DeviceMetricsSchema: () => DeviceMetricsSchema,
	EnvironmentMetricsSchema: () => EnvironmentMetricsSchema,
	HealthMetricsSchema: () => HealthMetricsSchema,
	HostMetricsSchema: () => HostMetricsSchema,
	LocalStatsSchema: () => LocalStatsSchema,
	Nau7802ConfigSchema: () => Nau7802ConfigSchema,
	PowerMetricsSchema: () => PowerMetricsSchema,
	TelemetrySchema: () => TelemetrySchema,
	TelemetrySensorType: () => TelemetrySensorType,
	TelemetrySensorTypeSchema: () => TelemetrySensorTypeSchema,
	file_meshtastic_telemetry: () => file_meshtastic_telemetry
});
/**
* Describes the file meshtastic/telemetry.proto.
*/ const file_meshtastic_telemetry = /* @__PURE__ */ fileDesc("ChptZXNodGFzdGljL3RlbGVtZXRyeS5wcm90bxIKbWVzaHRhc3RpYyLzAQoNRGV2aWNlTWV0cmljcxIaCg1iYXR0ZXJ5X2xldmVsGAEgASgNSACIAQESFAoHdm9sdGFnZRgCIAEoAkgBiAEBEiAKE2NoYW5uZWxfdXRpbGl6YXRpb24YAyABKAJIAogBARIYCgthaXJfdXRpbF90eBgEIAEoAkgDiAEBEhsKDnVwdGltZV9zZWNvbmRzGAUgASgNSASIAQFCEAoOX2JhdHRlcnlfbGV2ZWxCCgoIX3ZvbHRhZ2VCFgoUX2NoYW5uZWxfdXRpbGl6YXRpb25CDgoMX2Fpcl91dGlsX3R4QhEKD191cHRpbWVfc2Vjb25kcyKCBwoSRW52aXJvbm1lbnRNZXRyaWNzEhgKC3RlbXBlcmF0dXJlGAEgASgCSACIAQESHgoRcmVsYXRpdmVfaHVtaWRpdHkYAiABKAJIAYgBARIgChNiYXJvbWV0cmljX3ByZXNzdXJlGAMgASgCSAKIAQESGwoOZ2FzX3Jlc2lzdGFuY2UYBCABKAJIA4gBARIUCgd2b2x0YWdlGAUgASgCSASIAQESFAoHY3VycmVudBgGIAEoAkgFiAEBEhAKA2lhcRgHIAEoDUgGiAEBEhUKCGRpc3RhbmNlGAggASgCSAeIAQESEAoDbHV4GAkgASgCSAiIAQESFgoJd2hpdGVfbHV4GAogASgCSAmIAQESEwoGaXJfbHV4GAsgASgCSAqIAQESEwoGdXZfbHV4GAwgASgCSAuIAQESGwoOd2luZF9kaXJlY3Rpb24YDSABKA1IDIgBARIXCgp3aW5kX3NwZWVkGA4gASgCSA2IAQESEwoGd2VpZ2h0GA8gASgCSA6IAQESFgoJd2luZF9ndXN0GBAgASgCSA+IAQESFgoJd2luZF9sdWxsGBEgASgCSBCIAQESFgoJcmFkaWF0aW9uGBIgASgCSBGIAQESGAoLcmFpbmZhbGxfMWgYEyABKAJIEogBARIZCgxyYWluZmFsbF8yNGgYFCABKAJIE4gBARIaCg1zb2lsX21vaXN0dXJlGBUgASgNSBSIAQESHQoQc29pbF90ZW1wZXJhdHVyZRgWIAEoAkgViAEBQg4KDF90ZW1wZXJhdHVyZUIUChJfcmVsYXRpdmVfaHVtaWRpdHlCFgoUX2Jhcm9tZXRyaWNfcHJlc3N1cmVCEQoPX2dhc19yZXNpc3RhbmNlQgoKCF92b2x0YWdlQgoKCF9jdXJyZW50QgYKBF9pYXFCCwoJX2Rpc3RhbmNlQgYKBF9sdXhCDAoKX3doaXRlX2x1eEIJCgdfaXJfbHV4QgkKB191dl9sdXhCEQoPX3dpbmRfZGlyZWN0aW9uQg0KC193aW5kX3NwZWVkQgkKB193ZWlnaHRCDAoKX3dpbmRfZ3VzdEIMCgpfd2luZF9sdWxsQgwKCl9yYWRpYXRpb25CDgoMX3JhaW5mYWxsXzFoQg8KDV9yYWluZmFsbF8yNGhCEAoOX3NvaWxfbW9pc3R1cmVCEwoRX3NvaWxfdGVtcGVyYXR1cmUirgUKDFBvd2VyTWV0cmljcxIYCgtjaDFfdm9sdGFnZRgBIAEoAkgAiAEBEhgKC2NoMV9jdXJyZW50GAIgASgCSAGIAQESGAoLY2gyX3ZvbHRhZ2UYAyABKAJIAogBARIYCgtjaDJfY3VycmVudBgEIAEoAkgDiAEBEhgKC2NoM192b2x0YWdlGAUgASgCSASIAQESGAoLY2gzX2N1cnJlbnQYBiABKAJIBYgBARIYCgtjaDRfdm9sdGFnZRgHIAEoAkgGiAEBEhgKC2NoNF9jdXJyZW50GAggASgCSAeIAQESGAoLY2g1X3ZvbHRhZ2UYCSABKAJICIgBARIYCgtjaDVfY3VycmVudBgKIAEoAkgJiAEBEhgKC2NoNl92b2x0YWdlGAsgASgCSAqIAQESGAoLY2g2X2N1cnJlbnQYDCABKAJIC4gBARIYCgtjaDdfdm9sdGFnZRgNIAEoAkgMiAEBEhgKC2NoN19jdXJyZW50GA4gASgCSA2IAQESGAoLY2g4X3ZvbHRhZ2UYDyABKAJIDogBARIYCgtjaDhfY3VycmVudBgQIAEoAkgPiAEBQg4KDF9jaDFfdm9sdGFnZUIOCgxfY2gxX2N1cnJlbnRCDgoMX2NoMl92b2x0YWdlQg4KDF9jaDJfY3VycmVudEIOCgxfY2gzX3ZvbHRhZ2VCDgoMX2NoM19jdXJyZW50Qg4KDF9jaDRfdm9sdGFnZUIOCgxfY2g0X2N1cnJlbnRCDgoMX2NoNV92b2x0YWdlQg4KDF9jaDVfY3VycmVudEIOCgxfY2g2X3ZvbHRhZ2VCDgoMX2NoNl9jdXJyZW50Qg4KDF9jaDdfdm9sdGFnZUIOCgxfY2g3X2N1cnJlbnRCDgoMX2NoOF92b2x0YWdlQg4KDF9jaDhfY3VycmVudCKxCQoRQWlyUXVhbGl0eU1ldHJpY3MSGgoNcG0xMF9zdGFuZGFyZBgBIAEoDUgAiAEBEhoKDXBtMjVfc3RhbmRhcmQYAiABKA1IAYgBARIbCg5wbTEwMF9zdGFuZGFyZBgDIAEoDUgCiAEBEh8KEnBtMTBfZW52aXJvbm1lbnRhbBgEIAEoDUgDiAEBEh8KEnBtMjVfZW52aXJvbm1lbnRhbBgFIAEoDUgEiAEBEiAKE3BtMTAwX2Vudmlyb25tZW50YWwYBiABKA1IBYgBARIbCg5wYXJ0aWNsZXNfMDN1bRgHIAEoDUgGiAEBEhsKDnBhcnRpY2xlc18wNXVtGAggASgNSAeIAQESGwoOcGFydGljbGVzXzEwdW0YCSABKA1ICIgBARIbCg5wYXJ0aWNsZXNfMjV1bRgKIAEoDUgJiAEBEhsKDnBhcnRpY2xlc181MHVtGAsgASgNSAqIAQESHAoPcGFydGljbGVzXzEwMHVtGAwgASgNSAuIAQESEAoDY28yGA0gASgNSAyIAQESHAoPY28yX3RlbXBlcmF0dXJlGA4gASgCSA2IAQESGQoMY28yX2h1bWlkaXR5GA8gASgCSA6IAQESHgoRZm9ybV9mb3JtYWxkZWh5ZGUYECABKAJID4gBARIaCg1mb3JtX2h1bWlkaXR5GBEgASgCSBCIAQESHQoQZm9ybV90ZW1wZXJhdHVyZRgSIAEoAkgRiAEBEhoKDXBtNDBfc3RhbmRhcmQYEyABKA1IEogBARIbCg5wYXJ0aWNsZXNfNDB1bRgUIAEoDUgTiAEBEhsKDnBtX3RlbXBlcmF0dXJlGBUgASgCSBSIAQESGAoLcG1faHVtaWRpdHkYFiABKAJIFYgBARIXCgpwbV92b2NfaWR4GBcgASgCSBaIAQESFwoKcG1fbm94X2lkeBgYIAEoAkgXiAEBEhoKDXBhcnRpY2xlc190cHMYGSABKAJIGIgBAUIQCg5fcG0xMF9zdGFuZGFyZEIQCg5fcG0yNV9zdGFuZGFyZEIRCg9fcG0xMDBfc3RhbmRhcmRCFQoTX3BtMTBfZW52aXJvbm1lbnRhbEIVChNfcG0yNV9lbnZpcm9ubWVudGFsQhYKFF9wbTEwMF9lbnZpcm9ubWVudGFsQhEKD19wYXJ0aWNsZXNfMDN1bUIRCg9fcGFydGljbGVzXzA1dW1CEQoPX3BhcnRpY2xlc18xMHVtQhEKD19wYXJ0aWNsZXNfMjV1bUIRCg9fcGFydGljbGVzXzUwdW1CEgoQX3BhcnRpY2xlc18xMDB1bUIGCgRfY28yQhIKEF9jbzJfdGVtcGVyYXR1cmVCDwoNX2NvMl9odW1pZGl0eUIUChJfZm9ybV9mb3JtYWxkZWh5ZGVCEAoOX2Zvcm1faHVtaWRpdHlCEwoRX2Zvcm1fdGVtcGVyYXR1cmVCEAoOX3BtNDBfc3RhbmRhcmRCEQoPX3BhcnRpY2xlc180MHVtQhEKD19wbV90ZW1wZXJhdHVyZUIOCgxfcG1faHVtaWRpdHlCDQoLX3BtX3ZvY19pZHhCDQoLX3BtX25veF9pZHhCEAoOX3BhcnRpY2xlc190cHMi6gIKCkxvY2FsU3RhdHMSFgoOdXB0aW1lX3NlY29uZHMYASABKA0SGwoTY2hhbm5lbF91dGlsaXphdGlvbhgCIAEoAhITCgthaXJfdXRpbF90eBgDIAEoAhIWCg5udW1fcGFja2V0c190eBgEIAEoDRIWCg5udW1fcGFja2V0c19yeBgFIAEoDRIaChJudW1fcGFja2V0c19yeF9iYWQYBiABKA0SGAoQbnVtX29ubGluZV9ub2RlcxgHIAEoDRIXCg9udW1fdG90YWxfbm9kZXMYCCABKA0SEwoLbnVtX3J4X2R1cGUYCSABKA0SFAoMbnVtX3R4X3JlbGF5GAogASgNEh0KFW51bV90eF9yZWxheV9jYW5jZWxlZBgLIAEoDRIYChBoZWFwX3RvdGFsX2J5dGVzGAwgASgNEhcKD2hlYXBfZnJlZV9ieXRlcxgNIAEoDRIWCg5udW1fdHhfZHJvcHBlZBgOIAEoDSJ7Cg1IZWFsdGhNZXRyaWNzEhYKCWhlYXJ0X2JwbRgBIAEoDUgAiAEBEhEKBHNwTzIYAiABKA1IAYgBARIYCgt0ZW1wZXJhdHVyZRgDIAEoAkgCiAEBQgwKCl9oZWFydF9icG1CBwoFX3NwTzJCDgoMX3RlbXBlcmF0dXJlIpECCgtIb3N0TWV0cmljcxIWCg51cHRpbWVfc2Vjb25kcxgBIAEoDRIVCg1mcmVlbWVtX2J5dGVzGAIgASgEEhcKD2Rpc2tmcmVlMV9ieXRlcxgDIAEoBBIcCg9kaXNrZnJlZTJfYnl0ZXMYBCABKARIAIgBARIcCg9kaXNrZnJlZTNfYnl0ZXMYBSABKARIAYgBARINCgVsb2FkMRgGIAEoDRINCgVsb2FkNRgHIAEoDRIOCgZsb2FkMTUYCCABKA0SGAoLdXNlcl9zdHJpbmcYCSABKAlIAogBAUISChBfZGlza2ZyZWUyX2J5dGVzQhIKEF9kaXNrZnJlZTNfYnl0ZXNCDgoMX3VzZXJfc3RyaW5nIp4DCglUZWxlbWV0cnkSDAoEdGltZRgBIAEoBxIzCg5kZXZpY2VfbWV0cmljcxgCIAEoCzIZLm1lc2h0YXN0aWMuRGV2aWNlTWV0cmljc0gAEj0KE2Vudmlyb25tZW50X21ldHJpY3MYAyABKAsyHi5tZXNodGFzdGljLkVudmlyb25tZW50TWV0cmljc0gAEjwKE2Fpcl9xdWFsaXR5X21ldHJpY3MYBCABKAsyHS5tZXNodGFzdGljLkFpclF1YWxpdHlNZXRyaWNzSAASMQoNcG93ZXJfbWV0cmljcxgFIAEoCzIYLm1lc2h0YXN0aWMuUG93ZXJNZXRyaWNzSAASLQoLbG9jYWxfc3RhdHMYBiABKAsyFi5tZXNodGFzdGljLkxvY2FsU3RhdHNIABIzCg5oZWFsdGhfbWV0cmljcxgHIAEoCzIZLm1lc2h0YXN0aWMuSGVhbHRoTWV0cmljc0gAEi8KDGhvc3RfbWV0cmljcxgIIAEoCzIXLm1lc2h0YXN0aWMuSG9zdE1ldHJpY3NIAEIJCgd2YXJpYW50Ij4KDU5hdTc4MDJDb25maWcSEgoKemVyb09mZnNldBgBIAEoBRIZChFjYWxpYnJhdGlvbkZhY3RvchgCIAEoAirtBAoTVGVsZW1ldHJ5U2Vuc29yVHlwZRIQCgxTRU5TT1JfVU5TRVQQABIKCgZCTUUyODAQARIKCgZCTUU2ODAQAhILCgdNQ1A5ODA4EAMSCgoGSU5BMjYwEAQSCgoGSU5BMjE5EAUSCgoGQk1QMjgwEAYSCQoFU0hUQzMQBxIJCgVMUFMyMhAIEgsKB1FNQzYzMTAQCRILCgdRTUk4NjU4EAoSDAoIUU1DNTg4M0wQCxIJCgVTSFQzMRAMEgwKCFBNU0EwMDNJEA0SCwoHSU5BMzIyMRAOEgoKBkJNUDA4NRAPEgwKCFJDV0w5NjIwEBASCQoFU0hUNFgQERIMCghWRU1MNzcwMBASEgwKCE1MWDkwNjMyEBMSCwoHT1BUMzAwMRAUEgwKCExUUjM5MFVWEBUSDgoKVFNMMjU5MTFGThAWEgkKBUFIVDEwEBcSEAoMREZST0JPVF9MQVJLEBgSCwoHTkFVNzgwMhAZEgoKBkJNUDNYWBAaEgwKCElDTTIwOTQ4EBsSDAoITUFYMTcwNDgQHBIRCg1DVVNUT01fU0VOU09SEB0SDAoITUFYMzAxMDIQHhIMCghNTFg5MDYxNBAfEgkKBVNDRDRYECASCwoHUkFEU0VOUxAhEgoKBklOQTIyNhAiEhAKDERGUk9CT1RfUkFJThAjEgoKBkRQUzMxMBAkEgwKCFJBSzEyMDM1ECUSDAoITUFYMTcyNjEQJhILCgdQQ1QyMDc1ECcSCwoHQURTMVgxNRAoEg8KC0FEUzFYMTVfQUxUECkSCQoFU0ZBMzAQKhIJCgVTRU41WBArEgsKB1RTTDI1NjEQLEJkChNjb20uZ2Vla3N2aWxsZS5tZXNoQg9UZWxlbWV0cnlQcm90b3NaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z");
/**
* Describes the message meshtastic.DeviceMetrics.
* Use `create(DeviceMetricsSchema)` to create a new message.
*/ const DeviceMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 0);
/**
* Describes the message meshtastic.EnvironmentMetrics.
* Use `create(EnvironmentMetricsSchema)` to create a new message.
*/ const EnvironmentMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 1);
/**
* Describes the message meshtastic.PowerMetrics.
* Use `create(PowerMetricsSchema)` to create a new message.
*/ const PowerMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 2);
/**
* Describes the message meshtastic.AirQualityMetrics.
* Use `create(AirQualityMetricsSchema)` to create a new message.
*/ const AirQualityMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 3);
/**
* Describes the message meshtastic.LocalStats.
* Use `create(LocalStatsSchema)` to create a new message.
*/ const LocalStatsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 4);
/**
* Describes the message meshtastic.HealthMetrics.
* Use `create(HealthMetricsSchema)` to create a new message.
*/ const HealthMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 5);
/**
* Describes the message meshtastic.HostMetrics.
* Use `create(HostMetricsSchema)` to create a new message.
*/ const HostMetricsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 6);
/**
* Describes the message meshtastic.Telemetry.
* Use `create(TelemetrySchema)` to create a new message.
*/ const TelemetrySchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 7);
/**
* Describes the message meshtastic.Nau7802Config.
* Use `create(Nau7802ConfigSchema)` to create a new message.
*/ const Nau7802ConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_telemetry, 8);
/**
*
* Supported I2C Sensors for telemetry in Meshtastic
*
* @generated from enum meshtastic.TelemetrySensorType
*/ var TelemetrySensorType = /* @__PURE__ */ function(TelemetrySensorType$1) {
	/**
	*
	* No external telemetry sensor explicitly set
	*
	* @generated from enum value: SENSOR_UNSET = 0;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SENSOR_UNSET"] = 0] = "SENSOR_UNSET";
	/**
	*
	* High accuracy temperature, pressure, humidity
	*
	* @generated from enum value: BME280 = 1;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["BME280"] = 1] = "BME280";
	/**
	*
	* High accuracy temperature, pressure, humidity, and air resistance
	*
	* @generated from enum value: BME680 = 2;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["BME680"] = 2] = "BME680";
	/**
	*
	* Very high accuracy temperature
	*
	* @generated from enum value: MCP9808 = 3;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MCP9808"] = 3] = "MCP9808";
	/**
	*
	* Moderate accuracy current and voltage
	*
	* @generated from enum value: INA260 = 4;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["INA260"] = 4] = "INA260";
	/**
	*
	* Moderate accuracy current and voltage
	*
	* @generated from enum value: INA219 = 5;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["INA219"] = 5] = "INA219";
	/**
	*
	* High accuracy temperature and pressure
	*
	* @generated from enum value: BMP280 = 6;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["BMP280"] = 6] = "BMP280";
	/**
	*
	* High accuracy temperature and humidity
	*
	* @generated from enum value: SHTC3 = 7;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SHTC3"] = 7] = "SHTC3";
	/**
	*
	* High accuracy pressure
	*
	* @generated from enum value: LPS22 = 8;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["LPS22"] = 8] = "LPS22";
	/**
	*
	* 3-Axis magnetic sensor
	*
	* @generated from enum value: QMC6310 = 9;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["QMC6310"] = 9] = "QMC6310";
	/**
	*
	* 6-Axis inertial measurement sensor
	*
	* @generated from enum value: QMI8658 = 10;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["QMI8658"] = 10] = "QMI8658";
	/**
	*
	* 3-Axis magnetic sensor
	*
	* @generated from enum value: QMC5883L = 11;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["QMC5883L"] = 11] = "QMC5883L";
	/**
	*
	* High accuracy temperature and humidity
	*
	* @generated from enum value: SHT31 = 12;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SHT31"] = 12] = "SHT31";
	/**
	*
	* PM2.5 air quality sensor
	*
	* @generated from enum value: PMSA003I = 13;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["PMSA003I"] = 13] = "PMSA003I";
	/**
	*
	* INA3221 3 Channel Voltage / Current Sensor
	*
	* @generated from enum value: INA3221 = 14;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["INA3221"] = 14] = "INA3221";
	/**
	*
	* BMP085/BMP180 High accuracy temperature and pressure (older Version of BMP280)
	*
	* @generated from enum value: BMP085 = 15;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["BMP085"] = 15] = "BMP085";
	/**
	*
	* RCWL-9620 Doppler Radar Distance Sensor, used for water level detection
	*
	* @generated from enum value: RCWL9620 = 16;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["RCWL9620"] = 16] = "RCWL9620";
	/**
	*
	* Sensirion High accuracy temperature and humidity
	*
	* @generated from enum value: SHT4X = 17;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SHT4X"] = 17] = "SHT4X";
	/**
	*
	* VEML7700 high accuracy ambient light(Lux) digital 16-bit resolution sensor.
	*
	* @generated from enum value: VEML7700 = 18;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["VEML7700"] = 18] = "VEML7700";
	/**
	*
	* MLX90632 non-contact IR temperature sensor.
	*
	* @generated from enum value: MLX90632 = 19;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MLX90632"] = 19] = "MLX90632";
	/**
	*
	* TI OPT3001 Ambient Light Sensor
	*
	* @generated from enum value: OPT3001 = 20;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["OPT3001"] = 20] = "OPT3001";
	/**
	*
	* Lite On LTR-390UV-01 UV Light Sensor
	*
	* @generated from enum value: LTR390UV = 21;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["LTR390UV"] = 21] = "LTR390UV";
	/**
	*
	* AMS TSL25911FN RGB Light Sensor
	*
	* @generated from enum value: TSL25911FN = 22;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["TSL25911FN"] = 22] = "TSL25911FN";
	/**
	*
	* AHT10 Integrated temperature and humidity sensor
	*
	* @generated from enum value: AHT10 = 23;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["AHT10"] = 23] = "AHT10";
	/**
	*
	* DFRobot Lark Weather station (temperature, humidity, pressure, wind speed and direction)
	*
	* @generated from enum value: DFROBOT_LARK = 24;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["DFROBOT_LARK"] = 24] = "DFROBOT_LARK";
	/**
	*
	* NAU7802 Scale Chip or compatible
	*
	* @generated from enum value: NAU7802 = 25;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["NAU7802"] = 25] = "NAU7802";
	/**
	*
	* BMP3XX High accuracy temperature and pressure
	*
	* @generated from enum value: BMP3XX = 26;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["BMP3XX"] = 26] = "BMP3XX";
	/**
	*
	* ICM-20948 9-Axis digital motion processor
	*
	* @generated from enum value: ICM20948 = 27;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["ICM20948"] = 27] = "ICM20948";
	/**
	*
	* MAX17048 1S lipo battery sensor (voltage, state of charge, time to go)
	*
	* @generated from enum value: MAX17048 = 28;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MAX17048"] = 28] = "MAX17048";
	/**
	*
	* Custom I2C sensor implementation based on https://github.com/meshtastic/i2c-sensor
	*
	* @generated from enum value: CUSTOM_SENSOR = 29;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["CUSTOM_SENSOR"] = 29] = "CUSTOM_SENSOR";
	/**
	*
	* MAX30102 Pulse Oximeter and Heart-Rate Sensor
	*
	* @generated from enum value: MAX30102 = 30;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MAX30102"] = 30] = "MAX30102";
	/**
	*
	* MLX90614 non-contact IR temperature sensor
	*
	* @generated from enum value: MLX90614 = 31;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MLX90614"] = 31] = "MLX90614";
	/**
	*
	* SCD40/SCD41 CO2, humidity, temperature sensor
	*
	* @generated from enum value: SCD4X = 32;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SCD4X"] = 32] = "SCD4X";
	/**
	*
	* ClimateGuard RadSens, radiation, Geiger-Muller Tube
	*
	* @generated from enum value: RADSENS = 33;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["RADSENS"] = 33] = "RADSENS";
	/**
	*
	* High accuracy current and voltage
	*
	* @generated from enum value: INA226 = 34;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["INA226"] = 34] = "INA226";
	/**
	*
	* DFRobot Gravity tipping bucket rain gauge
	*
	* @generated from enum value: DFROBOT_RAIN = 35;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["DFROBOT_RAIN"] = 35] = "DFROBOT_RAIN";
	/**
	*
	* Infineon DPS310 High accuracy pressure and temperature
	*
	* @generated from enum value: DPS310 = 36;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["DPS310"] = 36] = "DPS310";
	/**
	*
	* RAKWireless RAK12035 Soil Moisture Sensor Module
	*
	* @generated from enum value: RAK12035 = 37;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["RAK12035"] = 37] = "RAK12035";
	/**
	*
	* MAX17261 lipo battery gauge
	*
	* @generated from enum value: MAX17261 = 38;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["MAX17261"] = 38] = "MAX17261";
	/**
	*
	* PCT2075 Temperature Sensor
	*
	* @generated from enum value: PCT2075 = 39;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["PCT2075"] = 39] = "PCT2075";
	/**
	*
	* ADS1X15 ADC
	*
	* @generated from enum value: ADS1X15 = 40;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["ADS1X15"] = 40] = "ADS1X15";
	/**
	*
	* ADS1X15 ADC_ALT
	*
	* @generated from enum value: ADS1X15_ALT = 41;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["ADS1X15_ALT"] = 41] = "ADS1X15_ALT";
	/**
	*
	* Sensirion SFA30 Formaldehyde sensor
	*
	* @generated from enum value: SFA30 = 42;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SFA30"] = 42] = "SFA30";
	/**
	*
	* SEN5X PM SENSORS
	*
	* @generated from enum value: SEN5X = 43;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["SEN5X"] = 43] = "SEN5X";
	/**
	*
	* TSL2561 light sensor
	*
	* @generated from enum value: TSL2561 = 44;
	*/ TelemetrySensorType$1[TelemetrySensorType$1["TSL2561"] = 44] = "TSL2561";
	return TelemetrySensorType$1;
}({});
/**
* Describes the enum meshtastic.TelemetrySensorType.
*/ const TelemetrySensorTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_telemetry, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/xmodem_pb.js
var xmodem_pb_exports = {};
__export(xmodem_pb_exports, {
	XModemSchema: () => XModemSchema,
	XModem_Control: () => XModem_Control,
	XModem_ControlSchema: () => XModem_ControlSchema,
	file_meshtastic_xmodem: () => file_meshtastic_xmodem
});
/**
* Describes the file meshtastic/xmodem.proto.
*/ const file_meshtastic_xmodem = /* @__PURE__ */ fileDesc("ChdtZXNodGFzdGljL3htb2RlbS5wcm90bxIKbWVzaHRhc3RpYyK2AQoGWE1vZGVtEisKB2NvbnRyb2wYASABKA4yGi5tZXNodGFzdGljLlhNb2RlbS5Db250cm9sEgsKA3NlcRgCIAEoDRINCgVjcmMxNhgDIAEoDRIOCgZidWZmZXIYBCABKAwiUwoHQ29udHJvbBIHCgNOVUwQABIHCgNTT0gQARIHCgNTVFgQAhIHCgNFT1QQBBIHCgNBQ0sQBhIHCgNOQUsQFRIHCgNDQU4QGBIJCgVDVFJMWhAaQmEKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCDFhtb2RlbVByb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM");
/**
* Describes the message meshtastic.XModem.
* Use `create(XModemSchema)` to create a new message.
*/ const XModemSchema = /* @__PURE__ */ messageDesc(file_meshtastic_xmodem, 0);
/**
* @generated from enum meshtastic.XModem.Control
*/ var XModem_Control = /* @__PURE__ */ function(XModem_Control$1) {
	/**
	* @generated from enum value: NUL = 0;
	*/ XModem_Control$1[XModem_Control$1["NUL"] = 0] = "NUL";
	/**
	* @generated from enum value: SOH = 1;
	*/ XModem_Control$1[XModem_Control$1["SOH"] = 1] = "SOH";
	/**
	* @generated from enum value: STX = 2;
	*/ XModem_Control$1[XModem_Control$1["STX"] = 2] = "STX";
	/**
	* @generated from enum value: EOT = 4;
	*/ XModem_Control$1[XModem_Control$1["EOT"] = 4] = "EOT";
	/**
	* @generated from enum value: ACK = 6;
	*/ XModem_Control$1[XModem_Control$1["ACK"] = 6] = "ACK";
	/**
	* @generated from enum value: NAK = 21;
	*/ XModem_Control$1[XModem_Control$1["NAK"] = 21] = "NAK";
	/**
	* @generated from enum value: CAN = 24;
	*/ XModem_Control$1[XModem_Control$1["CAN"] = 24] = "CAN";
	/**
	* @generated from enum value: CTRLZ = 26;
	*/ XModem_Control$1[XModem_Control$1["CTRLZ"] = 26] = "CTRLZ";
	return XModem_Control$1;
}({});
/**
* Describes the enum meshtastic.XModem.Control.
*/ const XModem_ControlSchema = /* @__PURE__ */ enumDesc(file_meshtastic_xmodem, 0, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/mesh_pb.js
var mesh_pb_exports = {};
__export(mesh_pb_exports, {
	ChunkedPayloadResponseSchema: () => ChunkedPayloadResponseSchema,
	ChunkedPayloadSchema: () => ChunkedPayloadSchema,
	ClientNotificationSchema: () => ClientNotificationSchema,
	CompressedSchema: () => CompressedSchema,
	Constants: () => Constants$1,
	ConstantsSchema: () => ConstantsSchema,
	CriticalErrorCode: () => CriticalErrorCode,
	CriticalErrorCodeSchema: () => CriticalErrorCodeSchema,
	DataSchema: () => DataSchema,
	DeviceMetadataSchema: () => DeviceMetadataSchema,
	DuplicatedPublicKeySchema: () => DuplicatedPublicKeySchema,
	ExcludedModules: () => ExcludedModules,
	ExcludedModulesSchema: () => ExcludedModulesSchema,
	FileInfoSchema: () => FileInfoSchema,
	FirmwareEdition: () => FirmwareEdition,
	FirmwareEditionSchema: () => FirmwareEditionSchema,
	FromRadioSchema: () => FromRadioSchema,
	HardwareModel: () => HardwareModel,
	HardwareModelSchema: () => HardwareModelSchema,
	HeartbeatSchema: () => HeartbeatSchema,
	KeyVerificationFinalSchema: () => KeyVerificationFinalSchema,
	KeyVerificationNumberInformSchema: () => KeyVerificationNumberInformSchema,
	KeyVerificationNumberRequestSchema: () => KeyVerificationNumberRequestSchema,
	KeyVerificationSchema: () => KeyVerificationSchema,
	LogRecordSchema: () => LogRecordSchema,
	LogRecord_Level: () => LogRecord_Level,
	LogRecord_LevelSchema: () => LogRecord_LevelSchema,
	LowEntropyKeySchema: () => LowEntropyKeySchema,
	MeshPacketSchema: () => MeshPacketSchema,
	MeshPacket_Delayed: () => MeshPacket_Delayed,
	MeshPacket_DelayedSchema: () => MeshPacket_DelayedSchema,
	MeshPacket_Priority: () => MeshPacket_Priority,
	MeshPacket_PrioritySchema: () => MeshPacket_PrioritySchema,
	MeshPacket_TransportMechanism: () => MeshPacket_TransportMechanism,
	MeshPacket_TransportMechanismSchema: () => MeshPacket_TransportMechanismSchema,
	MqttClientProxyMessageSchema: () => MqttClientProxyMessageSchema,
	MyNodeInfoSchema: () => MyNodeInfoSchema,
	NeighborInfoSchema: () => NeighborInfoSchema,
	NeighborSchema: () => NeighborSchema,
	NodeInfoSchema: () => NodeInfoSchema,
	NodeRemoteHardwarePinSchema: () => NodeRemoteHardwarePinSchema,
	PositionSchema: () => PositionSchema,
	Position_AltSource: () => Position_AltSource,
	Position_AltSourceSchema: () => Position_AltSourceSchema,
	Position_LocSource: () => Position_LocSource,
	Position_LocSourceSchema: () => Position_LocSourceSchema,
	QueueStatusSchema: () => QueueStatusSchema,
	RouteDiscoverySchema: () => RouteDiscoverySchema,
	RoutingSchema: () => RoutingSchema,
	Routing_Error: () => Routing_Error,
	Routing_ErrorSchema: () => Routing_ErrorSchema,
	ToRadioSchema: () => ToRadioSchema,
	UserSchema: () => UserSchema,
	WaypointSchema: () => WaypointSchema,
	file_meshtastic_mesh: () => file_meshtastic_mesh,
	resend_chunksSchema: () => resend_chunksSchema
});
/**
* Describes the file meshtastic/mesh.proto.
*/ const file_meshtastic_mesh = /* @__PURE__ */ fileDesc("ChVtZXNodGFzdGljL21lc2gucHJvdG8SCm1lc2h0YXN0aWMihwcKCFBvc2l0aW9uEhcKCmxhdGl0dWRlX2kYASABKA9IAIgBARIYCgtsb25naXR1ZGVfaRgCIAEoD0gBiAEBEhUKCGFsdGl0dWRlGAMgASgFSAKIAQESDAoEdGltZRgEIAEoBxI3Cg9sb2NhdGlvbl9zb3VyY2UYBSABKA4yHi5tZXNodGFzdGljLlBvc2l0aW9uLkxvY1NvdXJjZRI3Cg9hbHRpdHVkZV9zb3VyY2UYBiABKA4yHi5tZXNodGFzdGljLlBvc2l0aW9uLkFsdFNvdXJjZRIRCgl0aW1lc3RhbXAYByABKAcSHwoXdGltZXN0YW1wX21pbGxpc19hZGp1c3QYCCABKAUSGQoMYWx0aXR1ZGVfaGFlGAkgASgRSAOIAQESKAobYWx0aXR1ZGVfZ2VvaWRhbF9zZXBhcmF0aW9uGAogASgRSASIAQESDAoEUERPUBgLIAEoDRIMCgRIRE9QGAwgASgNEgwKBFZET1AYDSABKA0SFAoMZ3BzX2FjY3VyYWN5GA4gASgNEhkKDGdyb3VuZF9zcGVlZBgPIAEoDUgFiAEBEhkKDGdyb3VuZF90cmFjaxgQIAEoDUgGiAEBEhMKC2ZpeF9xdWFsaXR5GBEgASgNEhAKCGZpeF90eXBlGBIgASgNEhQKDHNhdHNfaW5fdmlldxgTIAEoDRIRCglzZW5zb3JfaWQYFCABKA0SEwoLbmV4dF91cGRhdGUYFSABKA0SEgoKc2VxX251bWJlchgWIAEoDRIWCg5wcmVjaXNpb25fYml0cxgXIAEoDSJOCglMb2NTb3VyY2USDQoJTE9DX1VOU0VUEAASDgoKTE9DX01BTlVBTBABEhAKDExPQ19JTlRFUk5BTBACEhAKDExPQ19FWFRFUk5BTBADImIKCUFsdFNvdXJjZRINCglBTFRfVU5TRVQQABIOCgpBTFRfTUFOVUFMEAESEAoMQUxUX0lOVEVSTkFMEAISEAoMQUxUX0VYVEVSTkFMEAMSEgoOQUxUX0JBUk9NRVRSSUMQBEINCgtfbGF0aXR1ZGVfaUIOCgxfbG9uZ2l0dWRlX2lCCwoJX2FsdGl0dWRlQg8KDV9hbHRpdHVkZV9oYWVCHgocX2FsdGl0dWRlX2dlb2lkYWxfc2VwYXJhdGlvbkIPCg1fZ3JvdW5kX3NwZWVkQg8KDV9ncm91bmRfdHJhY2siigIKBFVzZXISCgoCaWQYASABKAkSEQoJbG9uZ19uYW1lGAIgASgJEhIKCnNob3J0X25hbWUYAyABKAkSEwoHbWFjYWRkchgEIAEoDEICGAESKwoIaHdfbW9kZWwYBSABKA4yGS5tZXNodGFzdGljLkhhcmR3YXJlTW9kZWwSEwoLaXNfbGljZW5zZWQYBiABKAgSMgoEcm9sZRgHIAEoDjIkLm1lc2h0YXN0aWMuQ29uZmlnLkRldmljZUNvbmZpZy5Sb2xlEhIKCnB1YmxpY19rZXkYCCABKAwSHAoPaXNfdW5tZXNzYWdhYmxlGAkgASgISACIAQFCEgoQX2lzX3VubWVzc2FnYWJsZSJaCg5Sb3V0ZURpc2NvdmVyeRINCgVyb3V0ZRgBIAMoBxITCgtzbnJfdG93YXJkcxgCIAMoBRISCgpyb3V0ZV9iYWNrGAMgAygHEhAKCHNucl9iYWNrGAQgAygFIvsDCgdSb3V0aW5nEjMKDXJvdXRlX3JlcXVlc3QYASABKAsyGi5tZXNodGFzdGljLlJvdXRlRGlzY292ZXJ5SAASMQoLcm91dGVfcmVwbHkYAiABKAsyGi5tZXNodGFzdGljLlJvdXRlRGlzY292ZXJ5SAASMQoMZXJyb3JfcmVhc29uGAMgASgOMhkubWVzaHRhc3RpYy5Sb3V0aW5nLkVycm9ySAAiyQIKBUVycm9yEggKBE5PTkUQABIMCghOT19ST1VURRABEgsKB0dPVF9OQUsQAhILCgdUSU1FT1VUEAMSEAoMTk9fSU5URVJGQUNFEAQSEgoOTUFYX1JFVFJBTlNNSVQQBRIOCgpOT19DSEFOTkVMEAYSDQoJVE9PX0xBUkdFEAcSDwoLTk9fUkVTUE9OU0UQCBIUChBEVVRZX0NZQ0xFX0xJTUlUEAkSDwoLQkFEX1JFUVVFU1QQIBISCg5OT1RfQVVUSE9SSVpFRBAhEg4KClBLSV9GQUlMRUQQIhIWChJQS0lfVU5LTk9XTl9QVUJLRVkQIxIZChVBRE1JTl9CQURfU0VTU0lPTl9LRVkQJBIhCh1BRE1JTl9QVUJMSUNfS0VZX1VOQVVUSE9SSVpFRBAlEhcKE1JBVEVfTElNSVRfRVhDRUVERUQQJkIJCgd2YXJpYW50IssBCgREYXRhEiQKB3BvcnRudW0YASABKA4yEy5tZXNodGFzdGljLlBvcnROdW0SDwoHcGF5bG9hZBgCIAEoDBIVCg13YW50X3Jlc3BvbnNlGAMgASgIEgwKBGRlc3QYBCABKAcSDgoGc291cmNlGAUgASgHEhIKCnJlcXVlc3RfaWQYBiABKAcSEAoIcmVwbHlfaWQYByABKAcSDQoFZW1vamkYCCABKAcSFQoIYml0ZmllbGQYCSABKA1IAIgBAUILCglfYml0ZmllbGQiPgoPS2V5VmVyaWZpY2F0aW9uEg0KBW5vbmNlGAEgASgEEg0KBWhhc2gxGAIgASgMEg0KBWhhc2gyGAMgASgMIrwBCghXYXlwb2ludBIKCgJpZBgBIAEoDRIXCgpsYXRpdHVkZV9pGAIgASgPSACIAQESGAoLbG9uZ2l0dWRlX2kYAyABKA9IAYgBARIOCgZleHBpcmUYBCABKA0SEQoJbG9ja2VkX3RvGAUgASgNEgwKBG5hbWUYBiABKAkSEwoLZGVzY3JpcHRpb24YByABKAkSDAoEaWNvbhgIIAEoB0INCgtfbGF0aXR1ZGVfaUIOCgxfbG9uZ2l0dWRlX2kibAoWTXF0dENsaWVudFByb3h5TWVzc2FnZRINCgV0b3BpYxgBIAEoCRIOCgRkYXRhGAIgASgMSAASDgoEdGV4dBgDIAEoCUgAEhAKCHJldGFpbmVkGAQgASgIQhEKD3BheWxvYWRfdmFyaWFudCK1BwoKTWVzaFBhY2tldBIMCgRmcm9tGAEgASgHEgoKAnRvGAIgASgHEg8KB2NoYW5uZWwYAyABKA0SIwoHZGVjb2RlZBgEIAEoCzIQLm1lc2h0YXN0aWMuRGF0YUgAEhMKCWVuY3J5cHRlZBgFIAEoDEgAEgoKAmlkGAYgASgHEg8KB3J4X3RpbWUYByABKAcSDgoGcnhfc25yGAggASgCEhEKCWhvcF9saW1pdBgJIAEoDRIQCgh3YW50X2FjaxgKIAEoCBIxCghwcmlvcml0eRgLIAEoDjIfLm1lc2h0YXN0aWMuTWVzaFBhY2tldC5Qcmlvcml0eRIPCgdyeF9yc3NpGAwgASgFEjMKB2RlbGF5ZWQYDSABKA4yHi5tZXNodGFzdGljLk1lc2hQYWNrZXQuRGVsYXllZEICGAESEAoIdmlhX21xdHQYDiABKAgSEQoJaG9wX3N0YXJ0GA8gASgNEhIKCnB1YmxpY19rZXkYECABKAwSFQoNcGtpX2VuY3J5cHRlZBgRIAEoCBIQCghuZXh0X2hvcBgSIAEoDRISCgpyZWxheV9ub2RlGBMgASgNEhAKCHR4X2FmdGVyGBQgASgNEkYKE3RyYW5zcG9ydF9tZWNoYW5pc20YFSABKA4yKS5tZXNodGFzdGljLk1lc2hQYWNrZXQuVHJhbnNwb3J0TWVjaGFuaXNtIn4KCFByaW9yaXR5EgkKBVVOU0VUEAASBwoDTUlOEAESDgoKQkFDS0dST1VORBAKEgsKB0RFRkFVTFQQQBIMCghSRUxJQUJMRRBGEgwKCFJFU1BPTlNFEFASCAoESElHSBBkEgkKBUFMRVJUEG4SBwoDQUNLEHgSBwoDTUFYEH8iQgoHRGVsYXllZBIMCghOT19ERUxBWRAAEhUKEURFTEFZRURfQlJPQURDQVNUEAESEgoOREVMQVlFRF9ESVJFQ1QQAiLPAQoSVHJhbnNwb3J0TWVjaGFuaXNtEhYKElRSQU5TUE9SVF9JTlRFUk5BTBAAEhIKDlRSQU5TUE9SVF9MT1JBEAESFwoTVFJBTlNQT1JUX0xPUkFfQUxUMRACEhcKE1RSQU5TUE9SVF9MT1JBX0FMVDIQAxIXChNUUkFOU1BPUlRfTE9SQV9BTFQzEAQSEgoOVFJBTlNQT1JUX01RVFQQBRIbChdUUkFOU1BPUlRfTVVMVElDQVNUX1VEUBAGEhEKDVRSQU5TUE9SVF9BUEkQB0IRCg9wYXlsb2FkX3ZhcmlhbnQixwIKCE5vZGVJbmZvEgsKA251bRgBIAEoDRIeCgR1c2VyGAIgASgLMhAubWVzaHRhc3RpYy5Vc2VyEiYKCHBvc2l0aW9uGAMgASgLMhQubWVzaHRhc3RpYy5Qb3NpdGlvbhILCgNzbnIYBCABKAISEgoKbGFzdF9oZWFyZBgFIAEoBxIxCg5kZXZpY2VfbWV0cmljcxgGIAEoCzIZLm1lc2h0YXN0aWMuRGV2aWNlTWV0cmljcxIPCgdjaGFubmVsGAcgASgNEhAKCHZpYV9tcXR0GAggASgIEhYKCWhvcHNfYXdheRgJIAEoDUgAiAEBEhMKC2lzX2Zhdm9yaXRlGAogASgIEhIKCmlzX2lnbm9yZWQYCyABKAgSIAoYaXNfa2V5X21hbnVhbGx5X3ZlcmlmaWVkGAwgASgIQgwKCl9ob3BzX2F3YXkiwQEKCk15Tm9kZUluZm8SEwoLbXlfbm9kZV9udW0YASABKA0SFAoMcmVib290X2NvdW50GAggASgNEhcKD21pbl9hcHBfdmVyc2lvbhgLIAEoDRIRCglkZXZpY2VfaWQYDCABKAwSDwoHcGlvX2VudhgNIAEoCRI1ChBmaXJtd2FyZV9lZGl0aW9uGA4gASgOMhsubWVzaHRhc3RpYy5GaXJtd2FyZUVkaXRpb24SFAoMbm9kZWRiX2NvdW50GA8gASgNIsABCglMb2dSZWNvcmQSDwoHbWVzc2FnZRgBIAEoCRIMCgR0aW1lGAIgASgHEg4KBnNvdXJjZRgDIAEoCRIqCgVsZXZlbBgEIAEoDjIbLm1lc2h0YXN0aWMuTG9nUmVjb3JkLkxldmVsIlgKBUxldmVsEgkKBVVOU0VUEAASDAoIQ1JJVElDQUwQMhIJCgVFUlJPUhAoEgsKB1dBUk5JTkcQHhIICgRJTkZPEBQSCQoFREVCVUcQChIJCgVUUkFDRRAFIlAKC1F1ZXVlU3RhdHVzEgsKA3JlcxgBIAEoBRIMCgRmcmVlGAIgASgNEg4KBm1heGxlbhgDIAEoDRIWCg5tZXNoX3BhY2tldF9pZBgEIAEoDSL5BQoJRnJvbVJhZGlvEgoKAmlkGAEgASgNEigKBnBhY2tldBgCIAEoCzIWLm1lc2h0YXN0aWMuTWVzaFBhY2tldEgAEikKB215X2luZm8YAyABKAsyFi5tZXNodGFzdGljLk15Tm9kZUluZm9IABIpCglub2RlX2luZm8YBCABKAsyFC5tZXNodGFzdGljLk5vZGVJbmZvSAASJAoGY29uZmlnGAUgASgLMhIubWVzaHRhc3RpYy5Db25maWdIABIrCgpsb2dfcmVjb3JkGAYgASgLMhUubWVzaHRhc3RpYy5Mb2dSZWNvcmRIABIcChJjb25maWdfY29tcGxldGVfaWQYByABKA1IABISCghyZWJvb3RlZBgIIAEoCEgAEjAKDG1vZHVsZUNvbmZpZxgJIAEoCzIYLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnSAASJgoHY2hhbm5lbBgKIAEoCzITLm1lc2h0YXN0aWMuQ2hhbm5lbEgAEi4KC3F1ZXVlU3RhdHVzGAsgASgLMhcubWVzaHRhc3RpYy5RdWV1ZVN0YXR1c0gAEioKDHhtb2RlbVBhY2tldBgMIAEoCzISLm1lc2h0YXN0aWMuWE1vZGVtSAASLgoIbWV0YWRhdGEYDSABKAsyGi5tZXNodGFzdGljLkRldmljZU1ldGFkYXRhSAASRAoWbXF0dENsaWVudFByb3h5TWVzc2FnZRgOIAEoCzIiLm1lc2h0YXN0aWMuTXF0dENsaWVudFByb3h5TWVzc2FnZUgAEigKCGZpbGVJbmZvGA8gASgLMhQubWVzaHRhc3RpYy5GaWxlSW5mb0gAEjwKEmNsaWVudE5vdGlmaWNhdGlvbhgQIAEoCzIeLm1lc2h0YXN0aWMuQ2xpZW50Tm90aWZpY2F0aW9uSAASNAoOZGV2aWNldWlDb25maWcYESABKAsyGi5tZXNodGFzdGljLkRldmljZVVJQ29uZmlnSABCEQoPcGF5bG9hZF92YXJpYW50IvoDChJDbGllbnROb3RpZmljYXRpb24SFQoIcmVwbHlfaWQYASABKA1IAYgBARIMCgR0aW1lGAIgASgHEioKBWxldmVsGAMgASgOMhsubWVzaHRhc3RpYy5Mb2dSZWNvcmQuTGV2ZWwSDwoHbWVzc2FnZRgEIAEoCRJRCh5rZXlfdmVyaWZpY2F0aW9uX251bWJlcl9pbmZvcm0YCyABKAsyJy5tZXNodGFzdGljLktleVZlcmlmaWNhdGlvbk51bWJlckluZm9ybUgAElMKH2tleV92ZXJpZmljYXRpb25fbnVtYmVyX3JlcXVlc3QYDCABKAsyKC5tZXNodGFzdGljLktleVZlcmlmaWNhdGlvbk51bWJlclJlcXVlc3RIABJCChZrZXlfdmVyaWZpY2F0aW9uX2ZpbmFsGA0gASgLMiAubWVzaHRhc3RpYy5LZXlWZXJpZmljYXRpb25GaW5hbEgAEkAKFWR1cGxpY2F0ZWRfcHVibGljX2tleRgOIAEoCzIfLm1lc2h0YXN0aWMuRHVwbGljYXRlZFB1YmxpY0tleUgAEjQKD2xvd19lbnRyb3B5X2tleRgPIAEoCzIZLm1lc2h0YXN0aWMuTG93RW50cm9weUtleUgAQhEKD3BheWxvYWRfdmFyaWFudEILCglfcmVwbHlfaWQiXgobS2V5VmVyaWZpY2F0aW9uTnVtYmVySW5mb3JtEg0KBW5vbmNlGAEgASgEEhcKD3JlbW90ZV9sb25nbmFtZRgCIAEoCRIXCg9zZWN1cml0eV9udW1iZXIYAyABKA0iRgocS2V5VmVyaWZpY2F0aW9uTnVtYmVyUmVxdWVzdBINCgVub25jZRgBIAEoBBIXCg9yZW1vdGVfbG9uZ25hbWUYAiABKAkicQoUS2V5VmVyaWZpY2F0aW9uRmluYWwSDQoFbm9uY2UYASABKAQSFwoPcmVtb3RlX2xvbmduYW1lGAIgASgJEhAKCGlzU2VuZGVyGAMgASgIEh8KF3ZlcmlmaWNhdGlvbl9jaGFyYWN0ZXJzGAQgASgJIhUKE0R1cGxpY2F0ZWRQdWJsaWNLZXkiDwoNTG93RW50cm9weUtleSIxCghGaWxlSW5mbxIRCglmaWxlX25hbWUYASABKAkSEgoKc2l6ZV9ieXRlcxgCIAEoDSKUAgoHVG9SYWRpbxIoCgZwYWNrZXQYASABKAsyFi5tZXNodGFzdGljLk1lc2hQYWNrZXRIABIYCg53YW50X2NvbmZpZ19pZBgDIAEoDUgAEhQKCmRpc2Nvbm5lY3QYBCABKAhIABIqCgx4bW9kZW1QYWNrZXQYBSABKAsyEi5tZXNodGFzdGljLlhNb2RlbUgAEkQKFm1xdHRDbGllbnRQcm94eU1lc3NhZ2UYBiABKAsyIi5tZXNodGFzdGljLk1xdHRDbGllbnRQcm94eU1lc3NhZ2VIABIqCgloZWFydGJlYXQYByABKAsyFS5tZXNodGFzdGljLkhlYXJ0YmVhdEgAQhEKD3BheWxvYWRfdmFyaWFudCJACgpDb21wcmVzc2VkEiQKB3BvcnRudW0YASABKA4yEy5tZXNodGFzdGljLlBvcnROdW0SDAoEZGF0YRgCIAEoDCKHAQoMTmVpZ2hib3JJbmZvEg8KB25vZGVfaWQYASABKA0SFwoPbGFzdF9zZW50X2J5X2lkGAIgASgNEiQKHG5vZGVfYnJvYWRjYXN0X2ludGVydmFsX3NlY3MYAyABKA0SJwoJbmVpZ2hib3JzGAQgAygLMhQubWVzaHRhc3RpYy5OZWlnaGJvciJkCghOZWlnaGJvchIPCgdub2RlX2lkGAEgASgNEgsKA3NuchgCIAEoAhIUCgxsYXN0X3J4X3RpbWUYAyABKAcSJAocbm9kZV9icm9hZGNhc3RfaW50ZXJ2YWxfc2VjcxgEIAEoDSLXAgoORGV2aWNlTWV0YWRhdGESGAoQZmlybXdhcmVfdmVyc2lvbhgBIAEoCRIcChRkZXZpY2Vfc3RhdGVfdmVyc2lvbhgCIAEoDRITCgtjYW5TaHV0ZG93bhgDIAEoCBIPCgdoYXNXaWZpGAQgASgIEhQKDGhhc0JsdWV0b290aBgFIAEoCBITCgtoYXNFdGhlcm5ldBgGIAEoCBIyCgRyb2xlGAcgASgOMiQubWVzaHRhc3RpYy5Db25maWcuRGV2aWNlQ29uZmlnLlJvbGUSFgoOcG9zaXRpb25fZmxhZ3MYCCABKA0SKwoIaHdfbW9kZWwYCSABKA4yGS5tZXNodGFzdGljLkhhcmR3YXJlTW9kZWwSGQoRaGFzUmVtb3RlSGFyZHdhcmUYCiABKAgSDgoGaGFzUEtDGAsgASgIEhgKEGV4Y2x1ZGVkX21vZHVsZXMYDCABKA0iGgoJSGVhcnRiZWF0Eg0KBW5vbmNlGAEgASgNIlUKFU5vZGVSZW1vdGVIYXJkd2FyZVBpbhIQCghub2RlX251bRgBIAEoDRIqCgNwaW4YAiABKAsyHS5tZXNodGFzdGljLlJlbW90ZUhhcmR3YXJlUGluImUKDkNodW5rZWRQYXlsb2FkEhIKCnBheWxvYWRfaWQYASABKA0SEwoLY2h1bmtfY291bnQYAiABKA0SEwoLY2h1bmtfaW5kZXgYAyABKA0SFQoNcGF5bG9hZF9jaHVuaxgEIAEoDCIfCg1yZXNlbmRfY2h1bmtzEg4KBmNodW5rcxgBIAMoDSKqAQoWQ2h1bmtlZFBheWxvYWRSZXNwb25zZRISCgpwYXlsb2FkX2lkGAEgASgNEhoKEHJlcXVlc3RfdHJhbnNmZXIYAiABKAhIABIZCg9hY2NlcHRfdHJhbnNmZXIYAyABKAhIABIyCg1yZXNlbmRfY2h1bmtzGAQgASgLMhkubWVzaHRhc3RpYy5yZXNlbmRfY2h1bmtzSABCEQoPcGF5bG9hZF92YXJpYW50Kq8RCg1IYXJkd2FyZU1vZGVsEgkKBVVOU0VUEAASDAoIVExPUkFfVjIQARIMCghUTE9SQV9WMRACEhIKDlRMT1JBX1YyXzFfMVA2EAMSCQoFVEJFQU0QBBIPCgtIRUxURUNfVjJfMBAFEg4KClRCRUFNX1YwUDcQBhIKCgZUX0VDSE8QBxIQCgxUTE9SQV9WMV8xUDMQCBILCgdSQUs0NjMxEAkSDwoLSEVMVEVDX1YyXzEQChINCglIRUxURUNfVjEQCxIYChRMSUxZR09fVEJFQU1fUzNfQ09SRRAMEgwKCFJBSzExMjAwEA0SCwoHTkFOT19HMRAOEhIKDlRMT1JBX1YyXzFfMVA4EA8SDwoLVExPUkFfVDNfUzMQEBIUChBOQU5PX0cxX0VYUExPUkVSEBESEQoNTkFOT19HMl9VTFRSQRASEg0KCUxPUkFfVFlQRRATEgsKB1dJUEhPTkUQFBIOCgpXSU9fV00xMTEwEBUSCwoHUkFLMjU2MBAWEhMKD0hFTFRFQ19IUlVfMzYwMRAXEhoKFkhFTFRFQ19XSVJFTEVTU19CUklER0UQGBIOCgpTVEFUSU9OX0cxEBkSDAoIUkFLMTEzMTAQGhIUChBTRU5TRUxPUkFfUlAyMDQwEBsSEAoMU0VOU0VMT1JBX1MzEBwSDQoJQ0FOQVJZT05FEB0SDwoLUlAyMDQwX0xPUkEQHhIOCgpTVEFUSU9OX0cyEB8SEQoNTE9SQV9SRUxBWV9WMRAgEg4KCk5SRjUyODQwREsQIRIHCgNQUFIQIhIPCgtHRU5JRUJMT0NLUxAjEhEKDU5SRjUyX1VOS05PV04QJBINCglQT1JURFVJTk8QJRIPCgtBTkRST0lEX1NJTRAmEgoKBkRJWV9WMRAnEhUKEU5SRjUyODQwX1BDQTEwMDU5ECgSCgoGRFJfREVWECkSCwoHTTVTVEFDSxAqEg0KCUhFTFRFQ19WMxArEhEKDUhFTFRFQ19XU0xfVjMQLBITCg9CRVRBRlBWXzI0MDBfVFgQLRIXChNCRVRBRlBWXzkwMF9OQU5PX1RYEC4SDAoIUlBJX1BJQ08QLxIbChdIRUxURUNfV0lSRUxFU1NfVFJBQ0tFUhAwEhkKFUhFTFRFQ19XSVJFTEVTU19QQVBFUhAxEgoKBlRfREVDSxAyEg4KClRfV0FUQ0hfUzMQMxIRCg1QSUNPTVBVVEVSX1MzEDQSDwoLSEVMVEVDX0hUNjIQNRISCg5FQllURV9FU1AzMl9TMxA2EhEKDUVTUDMyX1MzX1BJQ08QNxINCglDSEFUVEVSXzIQOBIeChpIRUxURUNfV0lSRUxFU1NfUEFQRVJfVjFfMBA5EiAKHEhFTFRFQ19XSVJFTEVTU19UUkFDS0VSX1YxXzAQOhILCgdVTlBIT05FEDsSDAoIVERfTE9SQUMQPBITCg9DREVCWVRFX0VPUkFfUzMQPRIPCgtUV0NfTUVTSF9WNBA+EhYKEk5SRjUyX1BST01JQ1JPX0RJWRA/Eh8KG1JBRElPTUFTVEVSXzkwMF9CQU5ESVRfTkFOTxBAEhwKGEhFTFRFQ19DQVBTVUxFX1NFTlNPUl9WMxBBEh0KGUhFTFRFQ19WSVNJT05fTUFTVEVSX1QxOTAQQhIdChlIRUxURUNfVklTSU9OX01BU1RFUl9FMjEzEEMSHQoZSEVMVEVDX1ZJU0lPTl9NQVNURVJfRTI5MBBEEhkKFUhFTFRFQ19NRVNIX05PREVfVDExNBBFEhYKElNFTlNFQ0FQX0lORElDQVRPUhBGEhMKD1RSQUNLRVJfVDEwMDBfRRBHEgsKB1JBSzMxNzIQSBIKCgZXSU9fRTUQSRIaChZSQURJT01BU1RFUl85MDBfQkFORElUEEoSEwoPTUUyNUxTMDFfNFkxMFREEEsSGAoUUlAyMDQwX0ZFQVRIRVJfUkZNOTUQTBIVChFNNVNUQUNLX0NPUkVCQVNJQxBNEhEKDU01U1RBQ0tfQ09SRTIQThINCglSUElfUElDTzIQTxISCg5NNVNUQUNLX0NPUkVTMxBQEhEKDVNFRUVEX1hJQU9fUzMQURILCgdNUzI0U0YxEFISDAoIVExPUkFfQzYQUxIPCgtXSVNNRVNIX1RBUBBUEg0KCVJPVVRBU1RJQxBVEgwKCE1FU0hfVEFCEFYSDAoITUVTSExJTksQVxISCg5YSUFPX05SRjUyX0tJVBBYEhAKDFRISU5LTk9ERV9NMRBZEhAKDFRISU5LTk9ERV9NMhBaEg8KC1RfRVRIX0VMSVRFEFsSFQoRSEVMVEVDX1NFTlNPUl9IVUIQXBIaChZSRVNFUlZFRF9GUklFRF9DSElDS0VOEF0SFgoSSEVMVEVDX01FU0hfUE9DS0VUEF4SFAoQU0VFRURfU09MQVJfTk9ERRBfEhgKFE5PTUFEU1RBUl9NRVRFT1JfUFJPEGASDQoJQ1JPV1BBTkVMEGESCwoHTElOS18zMhBiEhgKFFNFRUVEX1dJT19UUkFDS0VSX0wxEGMSHQoZU0VFRURfV0lPX1RSQUNLRVJfTDFfRUlOSxBkEg8KC01VWklfUjFfTkVPEGUSDgoKVF9ERUNLX1BSTxBmEhAKDFRfTE9SQV9QQUdFUhBnEhQKEE01U1RBQ0tfUkVTRVJWRUQQaBIPCgtXSVNNRVNIX1RBRxBpEgsKB1JBSzMzMTIQahIQCgxUSElOS05PREVfTTUQaxIVChFIRUxURUNfTUVTSF9TT0xBUhBsEg8KC1RfRUNIT19MSVRFEG0SDQoJSEVMVEVDX1Y0EG4SDwoLTTVTVEFDS19DNkwQbxIZChVNNVNUQUNLX0NBUkRQVVRFUl9BRFYQcBIeChpIRUxURUNfV0lSRUxFU1NfVFJBQ0tFUl9WMhBxEhEKDVRfV0FUQ0hfVUxUUkEQchIPCgpQUklWQVRFX0hXEP8BKiwKCUNvbnN0YW50cxIICgRaRVJPEAASFQoQREFUQV9QQVlMT0FEX0xFThDpASq0AgoRQ3JpdGljYWxFcnJvckNvZGUSCAoETk9ORRAAEg8KC1RYX1dBVENIRE9HEAESFAoQU0xFRVBfRU5URVJfV0FJVBACEgwKCE5PX1JBRElPEAMSDwoLVU5TUEVDSUZJRUQQBBIVChFVQkxPWF9VTklUX0ZBSUxFRBAFEg0KCU5PX0FYUDE5MhAGEhkKFUlOVkFMSURfUkFESU9fU0VUVElORxAHEhMKD1RSQU5TTUlUX0ZBSUxFRBAIEgwKCEJST1dOT1VUEAkSEgoOU1gxMjYyX0ZBSUxVUkUQChIRCg1SQURJT19TUElfQlVHEAsSIAocRkxBU0hfQ09SUlVQVElPTl9SRUNPVkVSQUJMRRAMEiIKHkZMQVNIX0NPUlJVUFRJT05fVU5SRUNPVkVSQUJMRRANKn8KD0Zpcm13YXJlRWRpdGlvbhILCgdWQU5JTExBEAASEQoNU01BUlRfQ0lUSVpFThABEg4KCk9QRU5fU0FVQ0UQEBIKCgZERUZDT04QERIPCgtCVVJOSU5HX01BThASEg4KCkhBTVZFTlRJT04QExIPCgtESVlfRURJVElPThB/KoADCg9FeGNsdWRlZE1vZHVsZXMSEQoNRVhDTFVERURfTk9ORRAAEg8KC01RVFRfQ09ORklHEAESEQoNU0VSSUFMX0NPTkZJRxACEhMKD0VYVE5PVElGX0NPTkZJRxAEEhcKE1NUT1JFRk9SV0FSRF9DT05GSUcQCBIUChBSQU5HRVRFU1RfQ09ORklHEBASFAoQVEVMRU1FVFJZX0NPTkZJRxAgEhQKEENBTk5FRE1TR19DT05GSUcQQBIRCgxBVURJT19DT05GSUcQgAESGgoVUkVNT1RFSEFSRFdBUkVfQ09ORklHEIACEhgKE05FSUdIQk9SSU5GT19DT05GSUcQgAQSGwoWQU1CSUVOVExJR0hUSU5HX0NPTkZJRxCACBIbChZERVRFQ1RJT05TRU5TT1JfQ09ORklHEIAQEhYKEVBBWENPVU5URVJfQ09ORklHEIAgEhUKEEJMVUVUT09USF9DT05GSUcQgEASFAoOTkVUV09SS19DT05GSUcQgIABQl8KE2NvbS5nZWVrc3ZpbGxlLm1lc2hCCk1lc2hQcm90b3NaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z", [
	file_meshtastic_channel,
	file_meshtastic_config,
	file_meshtastic_device_ui,
	file_meshtastic_module_config,
	file_meshtastic_portnums,
	file_meshtastic_telemetry,
	file_meshtastic_xmodem
]);
/**
* Describes the message meshtastic.Position.
* Use `create(PositionSchema)` to create a new message.
*/ const PositionSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 0);
/**
*
* How the location was acquired: manual, onboard GPS, external (EUD) GPS
*
* @generated from enum meshtastic.Position.LocSource
*/ var Position_LocSource = /* @__PURE__ */ function(Position_LocSource$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LOC_UNSET = 0;
	*/ Position_LocSource$1[Position_LocSource$1["LOC_UNSET"] = 0] = "LOC_UNSET";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LOC_MANUAL = 1;
	*/ Position_LocSource$1[Position_LocSource$1["LOC_MANUAL"] = 1] = "LOC_MANUAL";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LOC_INTERNAL = 2;
	*/ Position_LocSource$1[Position_LocSource$1["LOC_INTERNAL"] = 2] = "LOC_INTERNAL";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LOC_EXTERNAL = 3;
	*/ Position_LocSource$1[Position_LocSource$1["LOC_EXTERNAL"] = 3] = "LOC_EXTERNAL";
	return Position_LocSource$1;
}({});
/**
* Describes the enum meshtastic.Position.LocSource.
*/ const Position_LocSourceSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 0, 0);
/**
*
* How the altitude was acquired: manual, GPS int/ext, etc
* Default: same as location_source if present
*
* @generated from enum meshtastic.Position.AltSource
*/ var Position_AltSource = /* @__PURE__ */ function(Position_AltSource$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: ALT_UNSET = 0;
	*/ Position_AltSource$1[Position_AltSource$1["ALT_UNSET"] = 0] = "ALT_UNSET";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: ALT_MANUAL = 1;
	*/ Position_AltSource$1[Position_AltSource$1["ALT_MANUAL"] = 1] = "ALT_MANUAL";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: ALT_INTERNAL = 2;
	*/ Position_AltSource$1[Position_AltSource$1["ALT_INTERNAL"] = 2] = "ALT_INTERNAL";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: ALT_EXTERNAL = 3;
	*/ Position_AltSource$1[Position_AltSource$1["ALT_EXTERNAL"] = 3] = "ALT_EXTERNAL";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: ALT_BAROMETRIC = 4;
	*/ Position_AltSource$1[Position_AltSource$1["ALT_BAROMETRIC"] = 4] = "ALT_BAROMETRIC";
	return Position_AltSource$1;
}({});
/**
* Describes the enum meshtastic.Position.AltSource.
*/ const Position_AltSourceSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 0, 1);
/**
* Describes the message meshtastic.User.
* Use `create(UserSchema)` to create a new message.
*/ const UserSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 1);
/**
* Describes the message meshtastic.RouteDiscovery.
* Use `create(RouteDiscoverySchema)` to create a new message.
*/ const RouteDiscoverySchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 2);
/**
* Describes the message meshtastic.Routing.
* Use `create(RoutingSchema)` to create a new message.
*/ const RoutingSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 3);
/**
*
* A failure in delivering a message (usually used for routing control messages, but might be provided in addition to ack.fail_id to provide
* details on the type of failure).
*
* @generated from enum meshtastic.Routing.Error
*/ var Routing_Error = /* @__PURE__ */ function(Routing_Error$1) {
	/**
	*
	* This message is not a failure
	*
	* @generated from enum value: NONE = 0;
	*/ Routing_Error$1[Routing_Error$1["NONE"] = 0] = "NONE";
	/**
	*
	* Our node doesn't have a route to the requested destination anymore.
	*
	* @generated from enum value: NO_ROUTE = 1;
	*/ Routing_Error$1[Routing_Error$1["NO_ROUTE"] = 1] = "NO_ROUTE";
	/**
	*
	* We received a nak while trying to forward on your behalf
	*
	* @generated from enum value: GOT_NAK = 2;
	*/ Routing_Error$1[Routing_Error$1["GOT_NAK"] = 2] = "GOT_NAK";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TIMEOUT = 3;
	*/ Routing_Error$1[Routing_Error$1["TIMEOUT"] = 3] = "TIMEOUT";
	/**
	*
	* No suitable interface could be found for delivering this packet
	*
	* @generated from enum value: NO_INTERFACE = 4;
	*/ Routing_Error$1[Routing_Error$1["NO_INTERFACE"] = 4] = "NO_INTERFACE";
	/**
	*
	* We reached the max retransmission count (typically for naive flood routing)
	*
	* @generated from enum value: MAX_RETRANSMIT = 5;
	*/ Routing_Error$1[Routing_Error$1["MAX_RETRANSMIT"] = 5] = "MAX_RETRANSMIT";
	/**
	*
	* No suitable channel was found for sending this packet (i.e. was requested channel index disabled?)
	*
	* @generated from enum value: NO_CHANNEL = 6;
	*/ Routing_Error$1[Routing_Error$1["NO_CHANNEL"] = 6] = "NO_CHANNEL";
	/**
	*
	* The packet was too big for sending (exceeds interface MTU after encoding)
	*
	* @generated from enum value: TOO_LARGE = 7;
	*/ Routing_Error$1[Routing_Error$1["TOO_LARGE"] = 7] = "TOO_LARGE";
	/**
	*
	* The request had want_response set, the request reached the destination node, but no service on that node wants to send a response
	* (possibly due to bad channel permissions)
	*
	* @generated from enum value: NO_RESPONSE = 8;
	*/ Routing_Error$1[Routing_Error$1["NO_RESPONSE"] = 8] = "NO_RESPONSE";
	/**
	*
	* Cannot send currently because duty cycle regulations will be violated.
	*
	* @generated from enum value: DUTY_CYCLE_LIMIT = 9;
	*/ Routing_Error$1[Routing_Error$1["DUTY_CYCLE_LIMIT"] = 9] = "DUTY_CYCLE_LIMIT";
	/**
	*
	* The application layer service on the remote node received your request, but considered your request somehow invalid
	*
	* @generated from enum value: BAD_REQUEST = 32;
	*/ Routing_Error$1[Routing_Error$1["BAD_REQUEST"] = 32] = "BAD_REQUEST";
	/**
	*
	* The application layer service on the remote node received your request, but considered your request not authorized
	* (i.e you did not send the request on the required bound channel)
	*
	* @generated from enum value: NOT_AUTHORIZED = 33;
	*/ Routing_Error$1[Routing_Error$1["NOT_AUTHORIZED"] = 33] = "NOT_AUTHORIZED";
	/**
	*
	* The client specified a PKI transport, but the node was unable to send the packet using PKI (and did not send the message at all)
	*
	* @generated from enum value: PKI_FAILED = 34;
	*/ Routing_Error$1[Routing_Error$1["PKI_FAILED"] = 34] = "PKI_FAILED";
	/**
	*
	* The receiving node does not have a Public Key to decode with
	*
	* @generated from enum value: PKI_UNKNOWN_PUBKEY = 35;
	*/ Routing_Error$1[Routing_Error$1["PKI_UNKNOWN_PUBKEY"] = 35] = "PKI_UNKNOWN_PUBKEY";
	/**
	*
	* Admin packet otherwise checks out, but uses a bogus or expired session key
	*
	* @generated from enum value: ADMIN_BAD_SESSION_KEY = 36;
	*/ Routing_Error$1[Routing_Error$1["ADMIN_BAD_SESSION_KEY"] = 36] = "ADMIN_BAD_SESSION_KEY";
	/**
	*
	* Admin packet sent using PKC, but not from a public key on the admin key list
	*
	* @generated from enum value: ADMIN_PUBLIC_KEY_UNAUTHORIZED = 37;
	*/ Routing_Error$1[Routing_Error$1["ADMIN_PUBLIC_KEY_UNAUTHORIZED"] = 37] = "ADMIN_PUBLIC_KEY_UNAUTHORIZED";
	/**
	*
	* Airtime fairness rate limit exceeded for a packet
	* This typically enforced per portnum and is used to prevent a single node from monopolizing airtime
	*
	* @generated from enum value: RATE_LIMIT_EXCEEDED = 38;
	*/ Routing_Error$1[Routing_Error$1["RATE_LIMIT_EXCEEDED"] = 38] = "RATE_LIMIT_EXCEEDED";
	return Routing_Error$1;
}({});
/**
* Describes the enum meshtastic.Routing.Error.
*/ const Routing_ErrorSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 3, 0);
/**
* Describes the message meshtastic.Data.
* Use `create(DataSchema)` to create a new message.
*/ const DataSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 4);
/**
* Describes the message meshtastic.KeyVerification.
* Use `create(KeyVerificationSchema)` to create a new message.
*/ const KeyVerificationSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 5);
/**
* Describes the message meshtastic.Waypoint.
* Use `create(WaypointSchema)` to create a new message.
*/ const WaypointSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 6);
/**
* Describes the message meshtastic.MqttClientProxyMessage.
* Use `create(MqttClientProxyMessageSchema)` to create a new message.
*/ const MqttClientProxyMessageSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 7);
/**
* Describes the message meshtastic.MeshPacket.
* Use `create(MeshPacketSchema)` to create a new message.
*/ const MeshPacketSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 8);
/**
*
* The priority of this message for sending.
* Higher priorities are sent first (when managing the transmit queue).
* This field is never sent over the air, it is only used internally inside of a local device node.
* API clients (either on the local node or connected directly to the node)
* can set this parameter if necessary.
* (values must be <= 127 to keep protobuf field to one byte in size.
* Detailed background on this field:
* I noticed a funny side effect of lora being so slow: Usually when making
* a protocol there isn’t much need to use message priority to change the order
* of transmission (because interfaces are fairly fast).
* But for lora where packets can take a few seconds each, it is very important
* to make sure that critical packets are sent ASAP.
* In the case of meshtastic that means we want to send protocol acks as soon as possible
* (to prevent unneeded retransmissions), we want routing messages to be sent next,
* then messages marked as reliable and finally 'background' packets like periodic position updates.
* So I bit the bullet and implemented a new (internal - not sent over the air)
* field in MeshPacket called 'priority'.
* And the transmission queue in the router object is now a priority queue.
*
* @generated from enum meshtastic.MeshPacket.Priority
*/ var MeshPacket_Priority = /* @__PURE__ */ function(MeshPacket_Priority$1) {
	/**
	*
	* Treated as Priority.DEFAULT
	*
	* @generated from enum value: UNSET = 0;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: MIN = 1;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["MIN"] = 1] = "MIN";
	/**
	*
	* Background position updates are sent with very low priority -
	* if the link is super congested they might not go out at all
	*
	* @generated from enum value: BACKGROUND = 10;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["BACKGROUND"] = 10] = "BACKGROUND";
	/**
	*
	* This priority is used for most messages that don't have a priority set
	*
	* @generated from enum value: DEFAULT = 64;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["DEFAULT"] = 64] = "DEFAULT";
	/**
	*
	* If priority is unset but the message is marked as want_ack,
	* assume it is important and use a slightly higher priority
	*
	* @generated from enum value: RELIABLE = 70;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["RELIABLE"] = 70] = "RELIABLE";
	/**
	*
	* If priority is unset but the packet is a response to a request, we want it to get there relatively quickly.
	* Furthermore, responses stop relaying packets directed to a node early.
	*
	* @generated from enum value: RESPONSE = 80;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["RESPONSE"] = 80] = "RESPONSE";
	/**
	*
	* Higher priority for specific message types (portnums) to distinguish between other reliable packets.
	*
	* @generated from enum value: HIGH = 100;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["HIGH"] = 100] = "HIGH";
	/**
	*
	* Higher priority alert message used for critical alerts which take priority over other reliable packets.
	*
	* @generated from enum value: ALERT = 110;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["ALERT"] = 110] = "ALERT";
	/**
	*
	* Ack/naks are sent with very high priority to ensure that retransmission
	* stops as soon as possible
	*
	* @generated from enum value: ACK = 120;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["ACK"] = 120] = "ACK";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: MAX = 127;
	*/ MeshPacket_Priority$1[MeshPacket_Priority$1["MAX"] = 127] = "MAX";
	return MeshPacket_Priority$1;
}({});
/**
* Describes the enum meshtastic.MeshPacket.Priority.
*/ const MeshPacket_PrioritySchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 8, 0);
/**
*
* Identify if this is a delayed packet
*
* @generated from enum meshtastic.MeshPacket.Delayed
*/ var MeshPacket_Delayed = /* @__PURE__ */ function(MeshPacket_Delayed$1) {
	/**
	*
	* If unset, the message is being sent in real time.
	*
	* @generated from enum value: NO_DELAY = 0;
	*/ MeshPacket_Delayed$1[MeshPacket_Delayed$1["NO_DELAY"] = 0] = "NO_DELAY";
	/**
	*
	* The message is delayed and was originally a broadcast
	*
	* @generated from enum value: DELAYED_BROADCAST = 1;
	*/ MeshPacket_Delayed$1[MeshPacket_Delayed$1["DELAYED_BROADCAST"] = 1] = "DELAYED_BROADCAST";
	/**
	*
	* The message is delayed and was originally a direct message
	*
	* @generated from enum value: DELAYED_DIRECT = 2;
	*/ MeshPacket_Delayed$1[MeshPacket_Delayed$1["DELAYED_DIRECT"] = 2] = "DELAYED_DIRECT";
	return MeshPacket_Delayed$1;
}({});
/**
* Describes the enum meshtastic.MeshPacket.Delayed.
*/ const MeshPacket_DelayedSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 8, 1);
/**
*
* Enum to identify which transport mechanism this packet arrived over
*
* @generated from enum meshtastic.MeshPacket.TransportMechanism
*/ var MeshPacket_TransportMechanism = /* @__PURE__ */ function(MeshPacket_TransportMechanism$1) {
	/**
	*
	* The default case is that the node generated a packet itself
	*
	* @generated from enum value: TRANSPORT_INTERNAL = 0;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_INTERNAL"] = 0] = "TRANSPORT_INTERNAL";
	/**
	*
	* Arrived via the primary LoRa radio
	*
	* @generated from enum value: TRANSPORT_LORA = 1;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_LORA"] = 1] = "TRANSPORT_LORA";
	/**
	*
	* Arrived via a secondary LoRa radio
	*
	* @generated from enum value: TRANSPORT_LORA_ALT1 = 2;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_LORA_ALT1"] = 2] = "TRANSPORT_LORA_ALT1";
	/**
	*
	* Arrived via a tertiary LoRa radio
	*
	* @generated from enum value: TRANSPORT_LORA_ALT2 = 3;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_LORA_ALT2"] = 3] = "TRANSPORT_LORA_ALT2";
	/**
	*
	* Arrived via a quaternary LoRa radio
	*
	* @generated from enum value: TRANSPORT_LORA_ALT3 = 4;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_LORA_ALT3"] = 4] = "TRANSPORT_LORA_ALT3";
	/**
	*
	* Arrived via an MQTT connection
	*
	* @generated from enum value: TRANSPORT_MQTT = 5;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_MQTT"] = 5] = "TRANSPORT_MQTT";
	/**
	*
	* Arrived via Multicast UDP
	*
	* @generated from enum value: TRANSPORT_MULTICAST_UDP = 6;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_MULTICAST_UDP"] = 6] = "TRANSPORT_MULTICAST_UDP";
	/**
	*
	* Arrived via API connection
	*
	* @generated from enum value: TRANSPORT_API = 7;
	*/ MeshPacket_TransportMechanism$1[MeshPacket_TransportMechanism$1["TRANSPORT_API"] = 7] = "TRANSPORT_API";
	return MeshPacket_TransportMechanism$1;
}({});
/**
* Describes the enum meshtastic.MeshPacket.TransportMechanism.
*/ const MeshPacket_TransportMechanismSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 8, 2);
/**
* Describes the message meshtastic.NodeInfo.
* Use `create(NodeInfoSchema)` to create a new message.
*/ const NodeInfoSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 9);
/**
* Describes the message meshtastic.MyNodeInfo.
* Use `create(MyNodeInfoSchema)` to create a new message.
*/ const MyNodeInfoSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 10);
/**
* Describes the message meshtastic.LogRecord.
* Use `create(LogRecordSchema)` to create a new message.
*/ const LogRecordSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 11);
/**
*
* Log levels, chosen to match python logging conventions.
*
* @generated from enum meshtastic.LogRecord.Level
*/ var LogRecord_Level = /* @__PURE__ */ function(LogRecord_Level$1) {
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: UNSET = 0;
	*/ LogRecord_Level$1[LogRecord_Level$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: CRITICAL = 50;
	*/ LogRecord_Level$1[LogRecord_Level$1["CRITICAL"] = 50] = "CRITICAL";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: ERROR = 40;
	*/ LogRecord_Level$1[LogRecord_Level$1["ERROR"] = 40] = "ERROR";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: WARNING = 30;
	*/ LogRecord_Level$1[LogRecord_Level$1["WARNING"] = 30] = "WARNING";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: INFO = 20;
	*/ LogRecord_Level$1[LogRecord_Level$1["INFO"] = 20] = "INFO";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: DEBUG = 10;
	*/ LogRecord_Level$1[LogRecord_Level$1["DEBUG"] = 10] = "DEBUG";
	/**
	*
	* Log levels, chosen to match python logging conventions.
	*
	* @generated from enum value: TRACE = 5;
	*/ LogRecord_Level$1[LogRecord_Level$1["TRACE"] = 5] = "TRACE";
	return LogRecord_Level$1;
}({});
/**
* Describes the enum meshtastic.LogRecord.Level.
*/ const LogRecord_LevelSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 11, 0);
/**
* Describes the message meshtastic.QueueStatus.
* Use `create(QueueStatusSchema)` to create a new message.
*/ const QueueStatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 12);
/**
* Describes the message meshtastic.FromRadio.
* Use `create(FromRadioSchema)` to create a new message.
*/ const FromRadioSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 13);
/**
* Describes the message meshtastic.ClientNotification.
* Use `create(ClientNotificationSchema)` to create a new message.
*/ const ClientNotificationSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 14);
/**
* Describes the message meshtastic.KeyVerificationNumberInform.
* Use `create(KeyVerificationNumberInformSchema)` to create a new message.
*/ const KeyVerificationNumberInformSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 15);
/**
* Describes the message meshtastic.KeyVerificationNumberRequest.
* Use `create(KeyVerificationNumberRequestSchema)` to create a new message.
*/ const KeyVerificationNumberRequestSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 16);
/**
* Describes the message meshtastic.KeyVerificationFinal.
* Use `create(KeyVerificationFinalSchema)` to create a new message.
*/ const KeyVerificationFinalSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 17);
/**
* Describes the message meshtastic.DuplicatedPublicKey.
* Use `create(DuplicatedPublicKeySchema)` to create a new message.
*/ const DuplicatedPublicKeySchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 18);
/**
* Describes the message meshtastic.LowEntropyKey.
* Use `create(LowEntropyKeySchema)` to create a new message.
*/ const LowEntropyKeySchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 19);
/**
* Describes the message meshtastic.FileInfo.
* Use `create(FileInfoSchema)` to create a new message.
*/ const FileInfoSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 20);
/**
* Describes the message meshtastic.ToRadio.
* Use `create(ToRadioSchema)` to create a new message.
*/ const ToRadioSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 21);
/**
* Describes the message meshtastic.Compressed.
* Use `create(CompressedSchema)` to create a new message.
*/ const CompressedSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 22);
/**
* Describes the message meshtastic.NeighborInfo.
* Use `create(NeighborInfoSchema)` to create a new message.
*/ const NeighborInfoSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 23);
/**
* Describes the message meshtastic.Neighbor.
* Use `create(NeighborSchema)` to create a new message.
*/ const NeighborSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 24);
/**
* Describes the message meshtastic.DeviceMetadata.
* Use `create(DeviceMetadataSchema)` to create a new message.
*/ const DeviceMetadataSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 25);
/**
* Describes the message meshtastic.Heartbeat.
* Use `create(HeartbeatSchema)` to create a new message.
*/ const HeartbeatSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 26);
/**
* Describes the message meshtastic.NodeRemoteHardwarePin.
* Use `create(NodeRemoteHardwarePinSchema)` to create a new message.
*/ const NodeRemoteHardwarePinSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 27);
/**
* Describes the message meshtastic.ChunkedPayload.
* Use `create(ChunkedPayloadSchema)` to create a new message.
*/ const ChunkedPayloadSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 28);
/**
* Describes the message meshtastic.resend_chunks.
* Use `create(resend_chunksSchema)` to create a new message.
*/ const resend_chunksSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 29);
/**
* Describes the message meshtastic.ChunkedPayloadResponse.
* Use `create(ChunkedPayloadResponseSchema)` to create a new message.
*/ const ChunkedPayloadResponseSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mesh, 30);
/**
*
* Note: these enum names must EXACTLY match the string used in the device
* bin/build-all.sh script.
* Because they will be used to find firmware filenames in the android app for OTA updates.
* To match the old style filenames, _ is converted to -, p is converted to .
*
* @generated from enum meshtastic.HardwareModel
*/ var HardwareModel = /* @__PURE__ */ function(HardwareModel$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: UNSET = 0;
	*/ HardwareModel$1[HardwareModel$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_V2 = 1;
	*/ HardwareModel$1[HardwareModel$1["TLORA_V2"] = 1] = "TLORA_V2";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_V1 = 2;
	*/ HardwareModel$1[HardwareModel$1["TLORA_V1"] = 2] = "TLORA_V1";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_V2_1_1P6 = 3;
	*/ HardwareModel$1[HardwareModel$1["TLORA_V2_1_1P6"] = 3] = "TLORA_V2_1_1P6";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TBEAM = 4;
	*/ HardwareModel$1[HardwareModel$1["TBEAM"] = 4] = "TBEAM";
	/**
	*
	* The original heltec WiFi_Lora_32_V2, which had battery voltage sensing hooked to GPIO 13
	* (see HELTEC_V2 for the new version).
	*
	* @generated from enum value: HELTEC_V2_0 = 5;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_V2_0"] = 5] = "HELTEC_V2_0";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TBEAM_V0P7 = 6;
	*/ HardwareModel$1[HardwareModel$1["TBEAM_V0P7"] = 6] = "TBEAM_V0P7";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: T_ECHO = 7;
	*/ HardwareModel$1[HardwareModel$1["T_ECHO"] = 7] = "T_ECHO";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_V1_1P3 = 8;
	*/ HardwareModel$1[HardwareModel$1["TLORA_V1_1P3"] = 8] = "TLORA_V1_1P3";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: RAK4631 = 9;
	*/ HardwareModel$1[HardwareModel$1["RAK4631"] = 9] = "RAK4631";
	/**
	*
	* The new version of the heltec WiFi_Lora_32_V2 board that has battery sensing hooked to GPIO 37.
	* Sadly they did not update anything on the silkscreen to identify this board
	*
	* @generated from enum value: HELTEC_V2_1 = 10;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_V2_1"] = 10] = "HELTEC_V2_1";
	/**
	*
	* Ancient heltec WiFi_Lora_32 board
	*
	* @generated from enum value: HELTEC_V1 = 11;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_V1"] = 11] = "HELTEC_V1";
	/**
	*
	* New T-BEAM with ESP32-S3 CPU
	*
	* @generated from enum value: LILYGO_TBEAM_S3_CORE = 12;
	*/ HardwareModel$1[HardwareModel$1["LILYGO_TBEAM_S3_CORE"] = 12] = "LILYGO_TBEAM_S3_CORE";
	/**
	*
	* RAK WisBlock ESP32 core: https://docs.rakwireless.com/Product-Categories/WisBlock/RAK11200/Overview/
	*
	* @generated from enum value: RAK11200 = 13;
	*/ HardwareModel$1[HardwareModel$1["RAK11200"] = 13] = "RAK11200";
	/**
	*
	* B&Q Consulting Nano Edition G1: https://uniteng.com/wiki/doku.php?id=meshtastic:nano
	*
	* @generated from enum value: NANO_G1 = 14;
	*/ HardwareModel$1[HardwareModel$1["NANO_G1"] = 14] = "NANO_G1";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_V2_1_1P8 = 15;
	*/ HardwareModel$1[HardwareModel$1["TLORA_V2_1_1P8"] = 15] = "TLORA_V2_1_1P8";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TLORA_T3_S3 = 16;
	*/ HardwareModel$1[HardwareModel$1["TLORA_T3_S3"] = 16] = "TLORA_T3_S3";
	/**
	*
	* B&Q Consulting Nano G1 Explorer: https://wiki.uniteng.com/en/meshtastic/nano-g1-explorer
	*
	* @generated from enum value: NANO_G1_EXPLORER = 17;
	*/ HardwareModel$1[HardwareModel$1["NANO_G1_EXPLORER"] = 17] = "NANO_G1_EXPLORER";
	/**
	*
	* B&Q Consulting Nano G2 Ultra: https://wiki.uniteng.com/en/meshtastic/nano-g2-ultra
	*
	* @generated from enum value: NANO_G2_ULTRA = 18;
	*/ HardwareModel$1[HardwareModel$1["NANO_G2_ULTRA"] = 18] = "NANO_G2_ULTRA";
	/**
	*
	* LoRAType device: https://loratype.org/
	*
	* @generated from enum value: LORA_TYPE = 19;
	*/ HardwareModel$1[HardwareModel$1["LORA_TYPE"] = 19] = "LORA_TYPE";
	/**
	*
	* wiphone https://www.wiphone.io/
	*
	* @generated from enum value: WIPHONE = 20;
	*/ HardwareModel$1[HardwareModel$1["WIPHONE"] = 20] = "WIPHONE";
	/**
	*
	* WIO Tracker WM1110 family from Seeed Studio. Includes wio-1110-tracker and wio-1110-sdk
	*
	* @generated from enum value: WIO_WM1110 = 21;
	*/ HardwareModel$1[HardwareModel$1["WIO_WM1110"] = 21] = "WIO_WM1110";
	/**
	*
	* RAK2560 Solar base station based on RAK4630
	*
	* @generated from enum value: RAK2560 = 22;
	*/ HardwareModel$1[HardwareModel$1["RAK2560"] = 22] = "RAK2560";
	/**
	*
	* Heltec HRU-3601: https://heltec.org/project/hru-3601/
	*
	* @generated from enum value: HELTEC_HRU_3601 = 23;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_HRU_3601"] = 23] = "HELTEC_HRU_3601";
	/**
	*
	* Heltec Wireless Bridge
	*
	* @generated from enum value: HELTEC_WIRELESS_BRIDGE = 24;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_BRIDGE"] = 24] = "HELTEC_WIRELESS_BRIDGE";
	/**
	*
	* B&Q Consulting Station Edition G1: https://uniteng.com/wiki/doku.php?id=meshtastic:station
	*
	* @generated from enum value: STATION_G1 = 25;
	*/ HardwareModel$1[HardwareModel$1["STATION_G1"] = 25] = "STATION_G1";
	/**
	*
	* RAK11310 (RP2040 + SX1262)
	*
	* @generated from enum value: RAK11310 = 26;
	*/ HardwareModel$1[HardwareModel$1["RAK11310"] = 26] = "RAK11310";
	/**
	*
	* Makerfabs SenseLoRA Receiver (RP2040 + RFM96)
	*
	* @generated from enum value: SENSELORA_RP2040 = 27;
	*/ HardwareModel$1[HardwareModel$1["SENSELORA_RP2040"] = 27] = "SENSELORA_RP2040";
	/**
	*
	* Makerfabs SenseLoRA Industrial Monitor (ESP32-S3 + RFM96)
	*
	* @generated from enum value: SENSELORA_S3 = 28;
	*/ HardwareModel$1[HardwareModel$1["SENSELORA_S3"] = 28] = "SENSELORA_S3";
	/**
	*
	* Canary Radio Company - CanaryOne: https://canaryradio.io/products/canaryone
	*
	* @generated from enum value: CANARYONE = 29;
	*/ HardwareModel$1[HardwareModel$1["CANARYONE"] = 29] = "CANARYONE";
	/**
	*
	* Waveshare RP2040 LoRa - https://www.waveshare.com/rp2040-lora.htm
	*
	* @generated from enum value: RP2040_LORA = 30;
	*/ HardwareModel$1[HardwareModel$1["RP2040_LORA"] = 30] = "RP2040_LORA";
	/**
	*
	* B&Q Consulting Station G2: https://wiki.uniteng.com/en/meshtastic/station-g2
	*
	* @generated from enum value: STATION_G2 = 31;
	*/ HardwareModel$1[HardwareModel$1["STATION_G2"] = 31] = "STATION_G2";
	/**
	*
	* ---------------------------------------------------------------------------
	* Less common/prototype boards listed here (needs one more byte over the air)
	* ---------------------------------------------------------------------------
	*
	* @generated from enum value: LORA_RELAY_V1 = 32;
	*/ HardwareModel$1[HardwareModel$1["LORA_RELAY_V1"] = 32] = "LORA_RELAY_V1";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NRF52840DK = 33;
	*/ HardwareModel$1[HardwareModel$1["NRF52840DK"] = 33] = "NRF52840DK";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: PPR = 34;
	*/ HardwareModel$1[HardwareModel$1["PPR"] = 34] = "PPR";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: GENIEBLOCKS = 35;
	*/ HardwareModel$1[HardwareModel$1["GENIEBLOCKS"] = 35] = "GENIEBLOCKS";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NRF52_UNKNOWN = 36;
	*/ HardwareModel$1[HardwareModel$1["NRF52_UNKNOWN"] = 36] = "NRF52_UNKNOWN";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: PORTDUINO = 37;
	*/ HardwareModel$1[HardwareModel$1["PORTDUINO"] = 37] = "PORTDUINO";
	/**
	*
	* The simulator built into the android app
	*
	* @generated from enum value: ANDROID_SIM = 38;
	*/ HardwareModel$1[HardwareModel$1["ANDROID_SIM"] = 38] = "ANDROID_SIM";
	/**
	*
	* Custom DIY device based on @NanoVHF schematics: https://github.com/NanoVHF/Meshtastic-DIY/tree/main/Schematics
	*
	* @generated from enum value: DIY_V1 = 39;
	*/ HardwareModel$1[HardwareModel$1["DIY_V1"] = 39] = "DIY_V1";
	/**
	*
	* nRF52840 Dongle : https://www.nordicsemi.com/Products/Development-hardware/nrf52840-dongle/
	*
	* @generated from enum value: NRF52840_PCA10059 = 40;
	*/ HardwareModel$1[HardwareModel$1["NRF52840_PCA10059"] = 40] = "NRF52840_PCA10059";
	/**
	*
	* Custom Disaster Radio esp32 v3 device https://github.com/sudomesh/disaster-radio/tree/master/hardware/board_esp32_v3
	*
	* @generated from enum value: DR_DEV = 41;
	*/ HardwareModel$1[HardwareModel$1["DR_DEV"] = 41] = "DR_DEV";
	/**
	*
	* M5 esp32 based MCU modules with enclosure, TFT and LORA Shields. All Variants (Basic, Core, Fire, Core2, CoreS3, Paper) https://m5stack.com/
	*
	* @generated from enum value: M5STACK = 42;
	*/ HardwareModel$1[HardwareModel$1["M5STACK"] = 42] = "M5STACK";
	/**
	*
	* New Heltec LoRA32 with ESP32-S3 CPU
	*
	* @generated from enum value: HELTEC_V3 = 43;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_V3"] = 43] = "HELTEC_V3";
	/**
	*
	* New Heltec Wireless Stick Lite with ESP32-S3 CPU
	*
	* @generated from enum value: HELTEC_WSL_V3 = 44;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WSL_V3"] = 44] = "HELTEC_WSL_V3";
	/**
	*
	* New BETAFPV ELRS Micro TX Module 2.4G with ESP32 CPU
	*
	* @generated from enum value: BETAFPV_2400_TX = 45;
	*/ HardwareModel$1[HardwareModel$1["BETAFPV_2400_TX"] = 45] = "BETAFPV_2400_TX";
	/**
	*
	* BetaFPV ExpressLRS "Nano" TX Module 900MHz with ESP32 CPU
	*
	* @generated from enum value: BETAFPV_900_NANO_TX = 46;
	*/ HardwareModel$1[HardwareModel$1["BETAFPV_900_NANO_TX"] = 46] = "BETAFPV_900_NANO_TX";
	/**
	*
	* Raspberry Pi Pico (W) with Waveshare SX1262 LoRa Node Module
	*
	* @generated from enum value: RPI_PICO = 47;
	*/ HardwareModel$1[HardwareModel$1["RPI_PICO"] = 47] = "RPI_PICO";
	/**
	*
	* Heltec Wireless Tracker with ESP32-S3 CPU, built-in GPS, and TFT
	* Newer V1.1, version is written on the PCB near the display.
	*
	* @generated from enum value: HELTEC_WIRELESS_TRACKER = 48;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_TRACKER"] = 48] = "HELTEC_WIRELESS_TRACKER";
	/**
	*
	* Heltec Wireless Paper with ESP32-S3 CPU and E-Ink display
	*
	* @generated from enum value: HELTEC_WIRELESS_PAPER = 49;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_PAPER"] = 49] = "HELTEC_WIRELESS_PAPER";
	/**
	*
	* LilyGo T-Deck with ESP32-S3 CPU, Keyboard and IPS display
	*
	* @generated from enum value: T_DECK = 50;
	*/ HardwareModel$1[HardwareModel$1["T_DECK"] = 50] = "T_DECK";
	/**
	*
	* LilyGo T-Watch S3 with ESP32-S3 CPU and IPS display
	*
	* @generated from enum value: T_WATCH_S3 = 51;
	*/ HardwareModel$1[HardwareModel$1["T_WATCH_S3"] = 51] = "T_WATCH_S3";
	/**
	*
	* Bobricius Picomputer with ESP32-S3 CPU, Keyboard and IPS display
	*
	* @generated from enum value: PICOMPUTER_S3 = 52;
	*/ HardwareModel$1[HardwareModel$1["PICOMPUTER_S3"] = 52] = "PICOMPUTER_S3";
	/**
	*
	* Heltec HT-CT62 with ESP32-C3 CPU and SX1262 LoRa
	*
	* @generated from enum value: HELTEC_HT62 = 53;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_HT62"] = 53] = "HELTEC_HT62";
	/**
	*
	* EBYTE SPI LoRa module and ESP32-S3
	*
	* @generated from enum value: EBYTE_ESP32_S3 = 54;
	*/ HardwareModel$1[HardwareModel$1["EBYTE_ESP32_S3"] = 54] = "EBYTE_ESP32_S3";
	/**
	*
	* Waveshare ESP32-S3-PICO with PICO LoRa HAT and 2.9inch e-Ink
	*
	* @generated from enum value: ESP32_S3_PICO = 55;
	*/ HardwareModel$1[HardwareModel$1["ESP32_S3_PICO"] = 55] = "ESP32_S3_PICO";
	/**
	*
	* CircuitMess Chatter 2 LLCC68 Lora Module and ESP32 Wroom
	* Lora module can be swapped out for a Heltec RA-62 which is "almost" pin compatible
	* with one cut and one jumper Meshtastic works
	*
	* @generated from enum value: CHATTER_2 = 56;
	*/ HardwareModel$1[HardwareModel$1["CHATTER_2"] = 56] = "CHATTER_2";
	/**
	*
	* Heltec Wireless Paper, With ESP32-S3 CPU and E-Ink display
	* Older "V1.0" Variant, has no "version sticker"
	* E-Ink model is DEPG0213BNS800
	* Tab on the screen protector is RED
	* Flex connector marking is FPC-7528B
	*
	* @generated from enum value: HELTEC_WIRELESS_PAPER_V1_0 = 57;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_PAPER_V1_0"] = 57] = "HELTEC_WIRELESS_PAPER_V1_0";
	/**
	*
	* Heltec Wireless Tracker with ESP32-S3 CPU, built-in GPS, and TFT
	* Older "V1.0" Variant
	*
	* @generated from enum value: HELTEC_WIRELESS_TRACKER_V1_0 = 58;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_TRACKER_V1_0"] = 58] = "HELTEC_WIRELESS_TRACKER_V1_0";
	/**
	*
	* unPhone with ESP32-S3, TFT touchscreen,  LSM6DS3TR-C accelerometer and gyroscope
	*
	* @generated from enum value: UNPHONE = 59;
	*/ HardwareModel$1[HardwareModel$1["UNPHONE"] = 59] = "UNPHONE";
	/**
	*
	* Teledatics TD-LORAC NRF52840 based M.2 LoRA module
	* Compatible with the TD-WRLS development board
	*
	* @generated from enum value: TD_LORAC = 60;
	*/ HardwareModel$1[HardwareModel$1["TD_LORAC"] = 60] = "TD_LORAC";
	/**
	*
	* CDEBYTE EoRa-S3 board using their own MM modules, clone of LILYGO T3S3
	*
	* @generated from enum value: CDEBYTE_EORA_S3 = 61;
	*/ HardwareModel$1[HardwareModel$1["CDEBYTE_EORA_S3"] = 61] = "CDEBYTE_EORA_S3";
	/**
	*
	* TWC_MESH_V4
	* Adafruit NRF52840 feather express with SX1262, SSD1306 OLED and NEO6M GPS
	*
	* @generated from enum value: TWC_MESH_V4 = 62;
	*/ HardwareModel$1[HardwareModel$1["TWC_MESH_V4"] = 62] = "TWC_MESH_V4";
	/**
	*
	* NRF52_PROMICRO_DIY
	* Promicro NRF52840 with SX1262/LLCC68, SSD1306 OLED and NEO6M GPS
	*
	* @generated from enum value: NRF52_PROMICRO_DIY = 63;
	*/ HardwareModel$1[HardwareModel$1["NRF52_PROMICRO_DIY"] = 63] = "NRF52_PROMICRO_DIY";
	/**
	*
	* RadioMaster 900 Bandit Nano, https://www.radiomasterrc.com/products/bandit-nano-expresslrs-rf-module
	* ESP32-D0WDQ6 With SX1276/SKY66122, SSD1306 OLED and No GPS
	*
	* @generated from enum value: RADIOMASTER_900_BANDIT_NANO = 64;
	*/ HardwareModel$1[HardwareModel$1["RADIOMASTER_900_BANDIT_NANO"] = 64] = "RADIOMASTER_900_BANDIT_NANO";
	/**
	*
	* Heltec Capsule Sensor V3 with ESP32-S3 CPU, Portable LoRa device that can replace GNSS modules or sensors
	*
	* @generated from enum value: HELTEC_CAPSULE_SENSOR_V3 = 65;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_CAPSULE_SENSOR_V3"] = 65] = "HELTEC_CAPSULE_SENSOR_V3";
	/**
	*
	* Heltec Vision Master T190 with ESP32-S3 CPU, and a 1.90 inch TFT display
	*
	* @generated from enum value: HELTEC_VISION_MASTER_T190 = 66;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_VISION_MASTER_T190"] = 66] = "HELTEC_VISION_MASTER_T190";
	/**
	*
	* Heltec Vision Master E213 with ESP32-S3 CPU, and a 2.13 inch E-Ink display
	*
	* @generated from enum value: HELTEC_VISION_MASTER_E213 = 67;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_VISION_MASTER_E213"] = 67] = "HELTEC_VISION_MASTER_E213";
	/**
	*
	* Heltec Vision Master E290 with ESP32-S3 CPU, and a 2.9 inch E-Ink display
	*
	* @generated from enum value: HELTEC_VISION_MASTER_E290 = 68;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_VISION_MASTER_E290"] = 68] = "HELTEC_VISION_MASTER_E290";
	/**
	*
	* Heltec Mesh Node T114 board with nRF52840 CPU, and a 1.14 inch TFT display, Ultimate low-power design,
	* specifically adapted for the Meshtatic project
	*
	* @generated from enum value: HELTEC_MESH_NODE_T114 = 69;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_MESH_NODE_T114"] = 69] = "HELTEC_MESH_NODE_T114";
	/**
	*
	* Sensecap Indicator from Seeed Studio. ESP32-S3 device with TFT and RP2040 coprocessor
	*
	* @generated from enum value: SENSECAP_INDICATOR = 70;
	*/ HardwareModel$1[HardwareModel$1["SENSECAP_INDICATOR"] = 70] = "SENSECAP_INDICATOR";
	/**
	*
	* Seeed studio T1000-E tracker card. NRF52840 w/ LR1110 radio, GPS, button, buzzer, and sensors.
	*
	* @generated from enum value: TRACKER_T1000_E = 71;
	*/ HardwareModel$1[HardwareModel$1["TRACKER_T1000_E"] = 71] = "TRACKER_T1000_E";
	/**
	*
	* RAK3172 STM32WLE5 Module (https://store.rakwireless.com/products/wisduo-lpwan-module-rak3172)
	*
	* @generated from enum value: RAK3172 = 72;
	*/ HardwareModel$1[HardwareModel$1["RAK3172"] = 72] = "RAK3172";
	/**
	*
	* Seeed Studio Wio-E5 (either mini or Dev kit) using STM32WL chip.
	*
	* @generated from enum value: WIO_E5 = 73;
	*/ HardwareModel$1[HardwareModel$1["WIO_E5"] = 73] = "WIO_E5";
	/**
	*
	* RadioMaster 900 Bandit, https://www.radiomasterrc.com/products/bandit-expresslrs-rf-module
	* SSD1306 OLED and No GPS
	*
	* @generated from enum value: RADIOMASTER_900_BANDIT = 74;
	*/ HardwareModel$1[HardwareModel$1["RADIOMASTER_900_BANDIT"] = 74] = "RADIOMASTER_900_BANDIT";
	/**
	*
	* Minewsemi ME25LS01 (ME25LE01_V1.0). NRF52840 w/ LR1110 radio, buttons and leds and pins.
	*
	* @generated from enum value: ME25LS01_4Y10TD = 75;
	*/ HardwareModel$1[HardwareModel$1["ME25LS01_4Y10TD"] = 75] = "ME25LS01_4Y10TD";
	/**
	*
	* RP2040_FEATHER_RFM95
	* Adafruit Feather RP2040 with RFM95 LoRa Radio RFM95 with SX1272, SSD1306 OLED
	* https://www.adafruit.com/product/5714
	* https://www.adafruit.com/product/326
	* https://www.adafruit.com/product/938
	*  ^^^ short A0 to switch to I2C address 0x3C
	*
	*
	* @generated from enum value: RP2040_FEATHER_RFM95 = 76;
	*/ HardwareModel$1[HardwareModel$1["RP2040_FEATHER_RFM95"] = 76] = "RP2040_FEATHER_RFM95";
	/**
	* M5 esp32 based MCU modules with enclosure, TFT and LORA Shields. All Variants (Basic, Core, Fire, Core2, CoreS3, Paper) https://m5stack.com/ 
	*
	* @generated from enum value: M5STACK_COREBASIC = 77;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_COREBASIC"] = 77] = "M5STACK_COREBASIC";
	/**
	* @generated from enum value: M5STACK_CORE2 = 78;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_CORE2"] = 78] = "M5STACK_CORE2";
	/**
	* Pico2 with Waveshare Hat, same as Pico 
	*
	* @generated from enum value: RPI_PICO2 = 79;
	*/ HardwareModel$1[HardwareModel$1["RPI_PICO2"] = 79] = "RPI_PICO2";
	/**
	* M5 esp32 based MCU modules with enclosure, TFT and LORA Shields. All Variants (Basic, Core, Fire, Core2, CoreS3, Paper) https://m5stack.com/ 
	*
	* @generated from enum value: M5STACK_CORES3 = 80;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_CORES3"] = 80] = "M5STACK_CORES3";
	/**
	* Seeed XIAO S3 DK
	*
	* @generated from enum value: SEEED_XIAO_S3 = 81;
	*/ HardwareModel$1[HardwareModel$1["SEEED_XIAO_S3"] = 81] = "SEEED_XIAO_S3";
	/**
	*
	* Nordic nRF52840+Semtech SX1262 LoRa BLE Combo Module. nRF52840+SX1262 MS24SF1
	*
	* @generated from enum value: MS24SF1 = 82;
	*/ HardwareModel$1[HardwareModel$1["MS24SF1"] = 82] = "MS24SF1";
	/**
	*
	* Lilygo TLora-C6 with the new ESP32-C6 MCU
	*
	* @generated from enum value: TLORA_C6 = 83;
	*/ HardwareModel$1[HardwareModel$1["TLORA_C6"] = 83] = "TLORA_C6";
	/**
	*
	* WisMesh Tap
	* RAK-4631 w/ TFT in injection modled case
	*
	* @generated from enum value: WISMESH_TAP = 84;
	*/ HardwareModel$1[HardwareModel$1["WISMESH_TAP"] = 84] = "WISMESH_TAP";
	/**
	*
	* Similar to PORTDUINO but used by Routastic devices, this is not any
	* particular device and does not run Meshtastic's code but supports
	* the same frame format.
	* Runs on linux, see https://github.com/Jorropo/routastic
	*
	* @generated from enum value: ROUTASTIC = 85;
	*/ HardwareModel$1[HardwareModel$1["ROUTASTIC"] = 85] = "ROUTASTIC";
	/**
	*
	* Mesh-Tab, esp32 based
	* https://github.com/valzzu/Mesh-Tab
	*
	* @generated from enum value: MESH_TAB = 86;
	*/ HardwareModel$1[HardwareModel$1["MESH_TAB"] = 86] = "MESH_TAB";
	/**
	*
	* MeshLink board developed by LoraItalia. NRF52840, eByte E22900M22S (Will also come with other frequencies), 25w MPPT solar charger (5v,12v,18v selectable), support for gps, buzzer, oled or e-ink display, 10 gpios, hardware watchdog
	* https://www.loraitalia.it
	*
	* @generated from enum value: MESHLINK = 87;
	*/ HardwareModel$1[HardwareModel$1["MESHLINK"] = 87] = "MESHLINK";
	/**
	*
	* Seeed XIAO nRF52840 + Wio SX1262 kit
	*
	* @generated from enum value: XIAO_NRF52_KIT = 88;
	*/ HardwareModel$1[HardwareModel$1["XIAO_NRF52_KIT"] = 88] = "XIAO_NRF52_KIT";
	/**
	*
	* Elecrow ThinkNode M1 & M2
	* https://www.elecrow.com/wiki/ThinkNode-M1_Transceiver_Device(Meshtastic)_Power_By_nRF52840.html
	* https://www.elecrow.com/wiki/ThinkNode-M2_Transceiver_Device(Meshtastic)_Power_By_NRF52840.html (this actually uses ESP32-S3)
	*
	* @generated from enum value: THINKNODE_M1 = 89;
	*/ HardwareModel$1[HardwareModel$1["THINKNODE_M1"] = 89] = "THINKNODE_M1";
	/**
	* @generated from enum value: THINKNODE_M2 = 90;
	*/ HardwareModel$1[HardwareModel$1["THINKNODE_M2"] = 90] = "THINKNODE_M2";
	/**
	*
	* Lilygo T-ETH-Elite
	*
	* @generated from enum value: T_ETH_ELITE = 91;
	*/ HardwareModel$1[HardwareModel$1["T_ETH_ELITE"] = 91] = "T_ETH_ELITE";
	/**
	*
	* Heltec HRI-3621 industrial probe
	*
	* @generated from enum value: HELTEC_SENSOR_HUB = 92;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_SENSOR_HUB"] = 92] = "HELTEC_SENSOR_HUB";
	/**
	*
	* Reserved Fried Chicken ID for future use
	*
	* @generated from enum value: RESERVED_FRIED_CHICKEN = 93;
	*/ HardwareModel$1[HardwareModel$1["RESERVED_FRIED_CHICKEN"] = 93] = "RESERVED_FRIED_CHICKEN";
	/**
	*
	* Heltec Magnetic Power Bank with Meshtastic compatible
	*
	* @generated from enum value: HELTEC_MESH_POCKET = 94;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_MESH_POCKET"] = 94] = "HELTEC_MESH_POCKET";
	/**
	*
	* Seeed Solar Node
	*
	* @generated from enum value: SEEED_SOLAR_NODE = 95;
	*/ HardwareModel$1[HardwareModel$1["SEEED_SOLAR_NODE"] = 95] = "SEEED_SOLAR_NODE";
	/**
	*
	* NomadStar Meteor Pro https://nomadstar.ch/
	*
	* @generated from enum value: NOMADSTAR_METEOR_PRO = 96;
	*/ HardwareModel$1[HardwareModel$1["NOMADSTAR_METEOR_PRO"] = 96] = "NOMADSTAR_METEOR_PRO";
	/**
	*
	* Elecrow CrowPanel Advance models, ESP32-S3 and TFT with SX1262 radio plugin
	*
	* @generated from enum value: CROWPANEL = 97;
	*/ HardwareModel$1[HardwareModel$1["CROWPANEL"] = 97] = "CROWPANEL";
	/**
	*
	* Lilygo LINK32 board with sensors
	*
	* @generated from enum value: LINK_32 = 98;
	*/ HardwareModel$1[HardwareModel$1["LINK_32"] = 98] = "LINK_32";
	/**
	*
	* Seeed Tracker L1
	*
	* @generated from enum value: SEEED_WIO_TRACKER_L1 = 99;
	*/ HardwareModel$1[HardwareModel$1["SEEED_WIO_TRACKER_L1"] = 99] = "SEEED_WIO_TRACKER_L1";
	/**
	*
	* Seeed Tracker L1 EINK driver
	*
	* @generated from enum value: SEEED_WIO_TRACKER_L1_EINK = 100;
	*/ HardwareModel$1[HardwareModel$1["SEEED_WIO_TRACKER_L1_EINK"] = 100] = "SEEED_WIO_TRACKER_L1_EINK";
	/**
	*
	* Muzi Works R1 Neo
	*
	* @generated from enum value: MUZI_R1_NEO = 101;
	*/ HardwareModel$1[HardwareModel$1["MUZI_R1_NEO"] = 101] = "MUZI_R1_NEO";
	/**
	*
	* Lilygo T-Deck Pro
	*
	* @generated from enum value: T_DECK_PRO = 102;
	*/ HardwareModel$1[HardwareModel$1["T_DECK_PRO"] = 102] = "T_DECK_PRO";
	/**
	*
	* Lilygo TLora Pager
	*
	* @generated from enum value: T_LORA_PAGER = 103;
	*/ HardwareModel$1[HardwareModel$1["T_LORA_PAGER"] = 103] = "T_LORA_PAGER";
	/**
	*
	* M5Stack Reserved
	*
	* 0x68
	*
	* @generated from enum value: M5STACK_RESERVED = 104;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_RESERVED"] = 104] = "M5STACK_RESERVED";
	/**
	*
	* RAKwireless WisMesh Tag
	*
	* @generated from enum value: WISMESH_TAG = 105;
	*/ HardwareModel$1[HardwareModel$1["WISMESH_TAG"] = 105] = "WISMESH_TAG";
	/**
	*
	* RAKwireless WisBlock Core RAK3312 https://docs.rakwireless.com/product-categories/wisduo/rak3112-module/overview/
	*
	* @generated from enum value: RAK3312 = 106;
	*/ HardwareModel$1[HardwareModel$1["RAK3312"] = 106] = "RAK3312";
	/**
	*
	* Elecrow ThinkNode M5 https://www.elecrow.com/wiki/ThinkNode_M5_Meshtastic_LoRa_Signal_Transceiver_ESP32-S3.html
	*
	* @generated from enum value: THINKNODE_M5 = 107;
	*/ HardwareModel$1[HardwareModel$1["THINKNODE_M5"] = 107] = "THINKNODE_M5";
	/**
	*
	* MeshSolar is an integrated power management and communication solution designed for outdoor low-power devices.
	* https://heltec.org/project/meshsolar/
	*
	* @generated from enum value: HELTEC_MESH_SOLAR = 108;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_MESH_SOLAR"] = 108] = "HELTEC_MESH_SOLAR";
	/**
	*
	* Lilygo T-Echo Lite
	*
	* @generated from enum value: T_ECHO_LITE = 109;
	*/ HardwareModel$1[HardwareModel$1["T_ECHO_LITE"] = 109] = "T_ECHO_LITE";
	/**
	*
	* New Heltec LoRA32 with ESP32-S3 CPU
	*
	* @generated from enum value: HELTEC_V4 = 110;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_V4"] = 110] = "HELTEC_V4";
	/**
	*
	* M5Stack C6L
	*
	* @generated from enum value: M5STACK_C6L = 111;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_C6L"] = 111] = "M5STACK_C6L";
	/**
	*
	* M5Stack Cardputer Adv
	*
	* @generated from enum value: M5STACK_CARDPUTER_ADV = 112;
	*/ HardwareModel$1[HardwareModel$1["M5STACK_CARDPUTER_ADV"] = 112] = "M5STACK_CARDPUTER_ADV";
	/**
	*
	* ESP32S3 main controller with GPS and TFT screen.
	*
	* @generated from enum value: HELTEC_WIRELESS_TRACKER_V2 = 113;
	*/ HardwareModel$1[HardwareModel$1["HELTEC_WIRELESS_TRACKER_V2"] = 113] = "HELTEC_WIRELESS_TRACKER_V2";
	/**
	*
	* LilyGo T-Watch Ultra
	*
	* @generated from enum value: T_WATCH_ULTRA = 114;
	*/ HardwareModel$1[HardwareModel$1["T_WATCH_ULTRA"] = 114] = "T_WATCH_ULTRA";
	/**
	*
	* ------------------------------------------------------------------------------------------------------------------------------------------
	* Reserved ID For developing private Ports. These will show up in live traffic sparsely, so we can use a high number. Keep it within 8 bits.
	* ------------------------------------------------------------------------------------------------------------------------------------------
	*
	* @generated from enum value: PRIVATE_HW = 255;
	*/ HardwareModel$1[HardwareModel$1["PRIVATE_HW"] = 255] = "PRIVATE_HW";
	return HardwareModel$1;
}({});
/**
* Describes the enum meshtastic.HardwareModel.
*/ const HardwareModelSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 0);
/**
*
* Shared constants between device and phone
*
* @generated from enum meshtastic.Constants
*/ var Constants$1 = /* @__PURE__ */ function(Constants$2) {
	/**
	*
	* First enum must be zero, and we are just using this enum to
	* pass int constants between two very different environments
	*
	* @generated from enum value: ZERO = 0;
	*/ Constants$2[Constants$2["ZERO"] = 0] = "ZERO";
	/**
	*
	* From mesh.options
	* note: this payload length is ONLY the bytes that are sent inside of the Data protobuf (excluding protobuf overhead). The 16 byte header is
	* outside of this envelope
	*
	* @generated from enum value: DATA_PAYLOAD_LEN = 233;
	*/ Constants$2[Constants$2["DATA_PAYLOAD_LEN"] = 233] = "DATA_PAYLOAD_LEN";
	return Constants$2;
}({});
/**
* Describes the enum meshtastic.Constants.
*/ const ConstantsSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 1);
/**
*
* Error codes for critical errors
* The device might report these fault codes on the screen.
* If you encounter a fault code, please post on the meshtastic.discourse.group
* and we'll try to help.
*
* @generated from enum meshtastic.CriticalErrorCode
*/ var CriticalErrorCode = /* @__PURE__ */ function(CriticalErrorCode$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NONE = 0;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["NONE"] = 0] = "NONE";
	/**
	*
	* A software bug was detected while trying to send lora
	*
	* @generated from enum value: TX_WATCHDOG = 1;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["TX_WATCHDOG"] = 1] = "TX_WATCHDOG";
	/**
	*
	* A software bug was detected on entry to sleep
	*
	* @generated from enum value: SLEEP_ENTER_WAIT = 2;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["SLEEP_ENTER_WAIT"] = 2] = "SLEEP_ENTER_WAIT";
	/**
	*
	* No Lora radio hardware could be found
	*
	* @generated from enum value: NO_RADIO = 3;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["NO_RADIO"] = 3] = "NO_RADIO";
	/**
	*
	* Not normally used
	*
	* @generated from enum value: UNSPECIFIED = 4;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["UNSPECIFIED"] = 4] = "UNSPECIFIED";
	/**
	*
	* We failed while configuring a UBlox GPS
	*
	* @generated from enum value: UBLOX_UNIT_FAILED = 5;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["UBLOX_UNIT_FAILED"] = 5] = "UBLOX_UNIT_FAILED";
	/**
	*
	* This board was expected to have a power management chip and it is missing or broken
	*
	* @generated from enum value: NO_AXP192 = 6;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["NO_AXP192"] = 6] = "NO_AXP192";
	/**
	*
	* The channel tried to set a radio setting which is not supported by this chipset,
	* radio comms settings are now undefined.
	*
	* @generated from enum value: INVALID_RADIO_SETTING = 7;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["INVALID_RADIO_SETTING"] = 7] = "INVALID_RADIO_SETTING";
	/**
	*
	* Radio transmit hardware failure. We sent data to the radio chip, but it didn't
	* reply with an interrupt.
	*
	* @generated from enum value: TRANSMIT_FAILED = 8;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["TRANSMIT_FAILED"] = 8] = "TRANSMIT_FAILED";
	/**
	*
	* We detected that the main CPU voltage dropped below the minimum acceptable value
	*
	* @generated from enum value: BROWNOUT = 9;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["BROWNOUT"] = 9] = "BROWNOUT";
	/**
	* Selftest of SX1262 radio chip failed 
	*
	* @generated from enum value: SX1262_FAILURE = 10;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["SX1262_FAILURE"] = 10] = "SX1262_FAILURE";
	/**
	*
	* A (likely software but possibly hardware) failure was detected while trying to send packets.
	* If this occurs on your board, please post in the forum so that we can ask you to collect some information to allow fixing this bug
	*
	* @generated from enum value: RADIO_SPI_BUG = 11;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["RADIO_SPI_BUG"] = 11] = "RADIO_SPI_BUG";
	/**
	*
	* Corruption was detected on the flash filesystem but we were able to repair things.
	* If you see this failure in the field please post in the forum because we are interested in seeing if this is occurring in the field.
	*
	* @generated from enum value: FLASH_CORRUPTION_RECOVERABLE = 12;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["FLASH_CORRUPTION_RECOVERABLE"] = 12] = "FLASH_CORRUPTION_RECOVERABLE";
	/**
	*
	* Corruption was detected on the flash filesystem but we were unable to repair things.
	* NOTE: Your node will probably need to be reconfigured the next time it reboots (it will lose the region code etc...)
	* If you see this failure in the field please post in the forum because we are interested in seeing if this is occurring in the field.
	*
	* @generated from enum value: FLASH_CORRUPTION_UNRECOVERABLE = 13;
	*/ CriticalErrorCode$1[CriticalErrorCode$1["FLASH_CORRUPTION_UNRECOVERABLE"] = 13] = "FLASH_CORRUPTION_UNRECOVERABLE";
	return CriticalErrorCode$1;
}({});
/**
* Describes the enum meshtastic.CriticalErrorCode.
*/ const CriticalErrorCodeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 2);
/**
*
* Enum to indicate to clients whether this firmware is a special firmware build, like an event.
* The first 16 values are reserved for non-event special firmwares, like the Smart Citizen use case.
*
* @generated from enum meshtastic.FirmwareEdition
*/ var FirmwareEdition = /* @__PURE__ */ function(FirmwareEdition$1) {
	/**
	*
	* Vanilla firmware
	*
	* @generated from enum value: VANILLA = 0;
	*/ FirmwareEdition$1[FirmwareEdition$1["VANILLA"] = 0] = "VANILLA";
	/**
	*
	* Firmware for use in the Smart Citizen environmental monitoring network
	*
	* @generated from enum value: SMART_CITIZEN = 1;
	*/ FirmwareEdition$1[FirmwareEdition$1["SMART_CITIZEN"] = 1] = "SMART_CITIZEN";
	/**
	*
	* Open Sauce, the maker conference held yearly in CA
	*
	* @generated from enum value: OPEN_SAUCE = 16;
	*/ FirmwareEdition$1[FirmwareEdition$1["OPEN_SAUCE"] = 16] = "OPEN_SAUCE";
	/**
	*
	* DEFCON, the yearly hacker conference
	*
	* @generated from enum value: DEFCON = 17;
	*/ FirmwareEdition$1[FirmwareEdition$1["DEFCON"] = 17] = "DEFCON";
	/**
	*
	* Burning Man, the yearly hippie gathering in the desert
	*
	* @generated from enum value: BURNING_MAN = 18;
	*/ FirmwareEdition$1[FirmwareEdition$1["BURNING_MAN"] = 18] = "BURNING_MAN";
	/**
	*
	* Hamvention, the Dayton amateur radio convention
	*
	* @generated from enum value: HAMVENTION = 19;
	*/ FirmwareEdition$1[FirmwareEdition$1["HAMVENTION"] = 19] = "HAMVENTION";
	/**
	*
	* Placeholder for DIY and unofficial events
	*
	* @generated from enum value: DIY_EDITION = 127;
	*/ FirmwareEdition$1[FirmwareEdition$1["DIY_EDITION"] = 127] = "DIY_EDITION";
	return FirmwareEdition$1;
}({});
/**
* Describes the enum meshtastic.FirmwareEdition.
*/ const FirmwareEditionSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 3);
/**
*
* Enum for modules excluded from a device's configuration.
* Each value represents a ModuleConfigType that can be toggled as excluded
* by setting its corresponding bit in the `excluded_modules` bitmask field.
*
* @generated from enum meshtastic.ExcludedModules
*/ var ExcludedModules = /* @__PURE__ */ function(ExcludedModules$1) {
	/**
	*
	* Default value of 0 indicates no modules are excluded.
	*
	* @generated from enum value: EXCLUDED_NONE = 0;
	*/ ExcludedModules$1[ExcludedModules$1["EXCLUDED_NONE"] = 0] = "EXCLUDED_NONE";
	/**
	*
	* MQTT module
	*
	* @generated from enum value: MQTT_CONFIG = 1;
	*/ ExcludedModules$1[ExcludedModules$1["MQTT_CONFIG"] = 1] = "MQTT_CONFIG";
	/**
	*
	* Serial module
	*
	* @generated from enum value: SERIAL_CONFIG = 2;
	*/ ExcludedModules$1[ExcludedModules$1["SERIAL_CONFIG"] = 2] = "SERIAL_CONFIG";
	/**
	*
	* External Notification module
	*
	* @generated from enum value: EXTNOTIF_CONFIG = 4;
	*/ ExcludedModules$1[ExcludedModules$1["EXTNOTIF_CONFIG"] = 4] = "EXTNOTIF_CONFIG";
	/**
	*
	* Store and Forward module
	*
	* @generated from enum value: STOREFORWARD_CONFIG = 8;
	*/ ExcludedModules$1[ExcludedModules$1["STOREFORWARD_CONFIG"] = 8] = "STOREFORWARD_CONFIG";
	/**
	*
	* Range Test module
	*
	* @generated from enum value: RANGETEST_CONFIG = 16;
	*/ ExcludedModules$1[ExcludedModules$1["RANGETEST_CONFIG"] = 16] = "RANGETEST_CONFIG";
	/**
	*
	* Telemetry module
	*
	* @generated from enum value: TELEMETRY_CONFIG = 32;
	*/ ExcludedModules$1[ExcludedModules$1["TELEMETRY_CONFIG"] = 32] = "TELEMETRY_CONFIG";
	/**
	*
	* Canned Message module
	*
	* @generated from enum value: CANNEDMSG_CONFIG = 64;
	*/ ExcludedModules$1[ExcludedModules$1["CANNEDMSG_CONFIG"] = 64] = "CANNEDMSG_CONFIG";
	/**
	*
	* Audio module
	*
	* @generated from enum value: AUDIO_CONFIG = 128;
	*/ ExcludedModules$1[ExcludedModules$1["AUDIO_CONFIG"] = 128] = "AUDIO_CONFIG";
	/**
	*
	* Remote Hardware module
	*
	* @generated from enum value: REMOTEHARDWARE_CONFIG = 256;
	*/ ExcludedModules$1[ExcludedModules$1["REMOTEHARDWARE_CONFIG"] = 256] = "REMOTEHARDWARE_CONFIG";
	/**
	*
	* Neighbor Info module
	*
	* @generated from enum value: NEIGHBORINFO_CONFIG = 512;
	*/ ExcludedModules$1[ExcludedModules$1["NEIGHBORINFO_CONFIG"] = 512] = "NEIGHBORINFO_CONFIG";
	/**
	*
	* Ambient Lighting module
	*
	* @generated from enum value: AMBIENTLIGHTING_CONFIG = 1024;
	*/ ExcludedModules$1[ExcludedModules$1["AMBIENTLIGHTING_CONFIG"] = 1024] = "AMBIENTLIGHTING_CONFIG";
	/**
	*
	* Detection Sensor module
	*
	* @generated from enum value: DETECTIONSENSOR_CONFIG = 2048;
	*/ ExcludedModules$1[ExcludedModules$1["DETECTIONSENSOR_CONFIG"] = 2048] = "DETECTIONSENSOR_CONFIG";
	/**
	*
	* Paxcounter module
	*
	* @generated from enum value: PAXCOUNTER_CONFIG = 4096;
	*/ ExcludedModules$1[ExcludedModules$1["PAXCOUNTER_CONFIG"] = 4096] = "PAXCOUNTER_CONFIG";
	/**
	*
	* Bluetooth config (not technically a module, but used to indicate bluetooth capabilities)
	*
	* @generated from enum value: BLUETOOTH_CONFIG = 8192;
	*/ ExcludedModules$1[ExcludedModules$1["BLUETOOTH_CONFIG"] = 8192] = "BLUETOOTH_CONFIG";
	/**
	*
	* Network config (not technically a module, but used to indicate network capabilities)
	*
	* @generated from enum value: NETWORK_CONFIG = 16384;
	*/ ExcludedModules$1[ExcludedModules$1["NETWORK_CONFIG"] = 16384] = "NETWORK_CONFIG";
	return ExcludedModules$1;
}({});
/**
* Describes the enum meshtastic.ExcludedModules.
*/ const ExcludedModulesSchema = /* @__PURE__ */ enumDesc(file_meshtastic_mesh, 4);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/admin_pb.js
var admin_pb_exports = {};
__export(admin_pb_exports, {
	AdminMessageSchema: () => AdminMessageSchema,
	AdminMessage_BackupLocation: () => AdminMessage_BackupLocation,
	AdminMessage_BackupLocationSchema: () => AdminMessage_BackupLocationSchema,
	AdminMessage_ConfigType: () => AdminMessage_ConfigType,
	AdminMessage_ConfigTypeSchema: () => AdminMessage_ConfigTypeSchema,
	AdminMessage_InputEventSchema: () => AdminMessage_InputEventSchema,
	AdminMessage_ModuleConfigType: () => AdminMessage_ModuleConfigType,
	AdminMessage_ModuleConfigTypeSchema: () => AdminMessage_ModuleConfigTypeSchema,
	HamParametersSchema: () => HamParametersSchema,
	KeyVerificationAdminSchema: () => KeyVerificationAdminSchema,
	KeyVerificationAdmin_MessageType: () => KeyVerificationAdmin_MessageType,
	KeyVerificationAdmin_MessageTypeSchema: () => KeyVerificationAdmin_MessageTypeSchema,
	NodeRemoteHardwarePinsResponseSchema: () => NodeRemoteHardwarePinsResponseSchema,
	SharedContactSchema: () => SharedContactSchema,
	file_meshtastic_admin: () => file_meshtastic_admin
});
/**
* Describes the file meshtastic/admin.proto.
*/ const file_meshtastic_admin = /* @__PURE__ */ fileDesc("ChZtZXNodGFzdGljL2FkbWluLnByb3RvEgptZXNodGFzdGljItYYCgxBZG1pbk1lc3NhZ2USFwoPc2Vzc2lvbl9wYXNza2V5GGUgASgMEh0KE2dldF9jaGFubmVsX3JlcXVlc3QYASABKA1IABIzChRnZXRfY2hhbm5lbF9yZXNwb25zZRgCIAEoCzITLm1lc2h0YXN0aWMuQ2hhbm5lbEgAEhsKEWdldF9vd25lcl9yZXF1ZXN0GAMgASgISAASLgoSZ2V0X293bmVyX3Jlc3BvbnNlGAQgASgLMhAubWVzaHRhc3RpYy5Vc2VySAASQQoSZ2V0X2NvbmZpZ19yZXF1ZXN0GAUgASgOMiMubWVzaHRhc3RpYy5BZG1pbk1lc3NhZ2UuQ29uZmlnVHlwZUgAEjEKE2dldF9jb25maWdfcmVzcG9uc2UYBiABKAsyEi5tZXNodGFzdGljLkNvbmZpZ0gAEk4KGWdldF9tb2R1bGVfY29uZmlnX3JlcXVlc3QYByABKA4yKS5tZXNodGFzdGljLkFkbWluTWVzc2FnZS5Nb2R1bGVDb25maWdUeXBlSAASPgoaZ2V0X21vZHVsZV9jb25maWdfcmVzcG9uc2UYCCABKAsyGC5tZXNodGFzdGljLk1vZHVsZUNvbmZpZ0gAEjQKKmdldF9jYW5uZWRfbWVzc2FnZV9tb2R1bGVfbWVzc2FnZXNfcmVxdWVzdBgKIAEoCEgAEjUKK2dldF9jYW5uZWRfbWVzc2FnZV9tb2R1bGVfbWVzc2FnZXNfcmVzcG9uc2UYCyABKAlIABIlChtnZXRfZGV2aWNlX21ldGFkYXRhX3JlcXVlc3QYDCABKAhIABJCChxnZXRfZGV2aWNlX21ldGFkYXRhX3Jlc3BvbnNlGA0gASgLMhoubWVzaHRhc3RpYy5EZXZpY2VNZXRhZGF0YUgAEh4KFGdldF9yaW5ndG9uZV9yZXF1ZXN0GA4gASgISAASHwoVZ2V0X3Jpbmd0b25lX3Jlc3BvbnNlGA8gASgJSAASLgokZ2V0X2RldmljZV9jb25uZWN0aW9uX3N0YXR1c19yZXF1ZXN0GBAgASgISAASUwolZ2V0X2RldmljZV9jb25uZWN0aW9uX3N0YXR1c19yZXNwb25zZRgRIAEoCzIiLm1lc2h0YXN0aWMuRGV2aWNlQ29ubmVjdGlvblN0YXR1c0gAEjEKDHNldF9oYW1fbW9kZRgSIAEoCzIZLm1lc2h0YXN0aWMuSGFtUGFyYW1ldGVyc0gAEi8KJWdldF9ub2RlX3JlbW90ZV9oYXJkd2FyZV9waW5zX3JlcXVlc3QYEyABKAhIABJcCiZnZXRfbm9kZV9yZW1vdGVfaGFyZHdhcmVfcGluc19yZXNwb25zZRgUIAEoCzIqLm1lc2h0YXN0aWMuTm9kZVJlbW90ZUhhcmR3YXJlUGluc1Jlc3BvbnNlSAASIAoWZW50ZXJfZGZ1X21vZGVfcmVxdWVzdBgVIAEoCEgAEh0KE2RlbGV0ZV9maWxlX3JlcXVlc3QYFiABKAlIABITCglzZXRfc2NhbGUYFyABKA1IABJFChJiYWNrdXBfcHJlZmVyZW5jZXMYGCABKA4yJy5tZXNodGFzdGljLkFkbWluTWVzc2FnZS5CYWNrdXBMb2NhdGlvbkgAEkYKE3Jlc3RvcmVfcHJlZmVyZW5jZXMYGSABKA4yJy5tZXNodGFzdGljLkFkbWluTWVzc2FnZS5CYWNrdXBMb2NhdGlvbkgAEkwKGXJlbW92ZV9iYWNrdXBfcHJlZmVyZW5jZXMYGiABKA4yJy5tZXNodGFzdGljLkFkbWluTWVzc2FnZS5CYWNrdXBMb2NhdGlvbkgAEj8KEHNlbmRfaW5wdXRfZXZlbnQYGyABKAsyIy5tZXNodGFzdGljLkFkbWluTWVzc2FnZS5JbnB1dEV2ZW50SAASJQoJc2V0X293bmVyGCAgASgLMhAubWVzaHRhc3RpYy5Vc2VySAASKgoLc2V0X2NoYW5uZWwYISABKAsyEy5tZXNodGFzdGljLkNoYW5uZWxIABIoCgpzZXRfY29uZmlnGCIgASgLMhIubWVzaHRhc3RpYy5Db25maWdIABI1ChFzZXRfbW9kdWxlX2NvbmZpZxgjIAEoCzIYLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnSAASLAoic2V0X2Nhbm5lZF9tZXNzYWdlX21vZHVsZV9tZXNzYWdlcxgkIAEoCUgAEh4KFHNldF9yaW5ndG9uZV9tZXNzYWdlGCUgASgJSAASGwoRcmVtb3ZlX2J5X25vZGVudW0YJiABKA1IABIbChFzZXRfZmF2b3JpdGVfbm9kZRgnIAEoDUgAEh4KFHJlbW92ZV9mYXZvcml0ZV9ub2RlGCggASgNSAASMgoSc2V0X2ZpeGVkX3Bvc2l0aW9uGCkgASgLMhQubWVzaHRhc3RpYy5Qb3NpdGlvbkgAEh8KFXJlbW92ZV9maXhlZF9wb3NpdGlvbhgqIAEoCEgAEhcKDXNldF90aW1lX29ubHkYKyABKAdIABIfChVnZXRfdWlfY29uZmlnX3JlcXVlc3QYLCABKAhIABI8ChZnZXRfdWlfY29uZmlnX3Jlc3BvbnNlGC0gASgLMhoubWVzaHRhc3RpYy5EZXZpY2VVSUNvbmZpZ0gAEjUKD3N0b3JlX3VpX2NvbmZpZxguIAEoCzIaLm1lc2h0YXN0aWMuRGV2aWNlVUlDb25maWdIABIaChBzZXRfaWdub3JlZF9ub2RlGC8gASgNSAASHQoTcmVtb3ZlX2lnbm9yZWRfbm9kZRgwIAEoDUgAEh0KE2JlZ2luX2VkaXRfc2V0dGluZ3MYQCABKAhIABIeChRjb21taXRfZWRpdF9zZXR0aW5ncxhBIAEoCEgAEjAKC2FkZF9jb250YWN0GEIgASgLMhkubWVzaHRhc3RpYy5TaGFyZWRDb250YWN0SAASPAoQa2V5X3ZlcmlmaWNhdGlvbhhDIAEoCzIgLm1lc2h0YXN0aWMuS2V5VmVyaWZpY2F0aW9uQWRtaW5IABIeChRmYWN0b3J5X3Jlc2V0X2RldmljZRheIAEoBUgAEhwKEnJlYm9vdF9vdGFfc2Vjb25kcxhfIAEoBUgAEhgKDmV4aXRfc2ltdWxhdG9yGGAgASgISAASGAoOcmVib290X3NlY29uZHMYYSABKAVIABIaChBzaHV0ZG93bl9zZWNvbmRzGGIgASgFSAASHgoUZmFjdG9yeV9yZXNldF9jb25maWcYYyABKAVIABIWCgxub2RlZGJfcmVzZXQYZCABKAVIABpTCgpJbnB1dEV2ZW50EhIKCmV2ZW50X2NvZGUYASABKA0SDwoHa2JfY2hhchgCIAEoDRIPCgd0b3VjaF94GAMgASgNEg8KB3RvdWNoX3kYBCABKA0i1gEKCkNvbmZpZ1R5cGUSEQoNREVWSUNFX0NPTkZJRxAAEhMKD1BPU0lUSU9OX0NPTkZJRxABEhAKDFBPV0VSX0NPTkZJRxACEhIKDk5FVFdPUktfQ09ORklHEAMSEgoORElTUExBWV9DT05GSUcQBBIPCgtMT1JBX0NPTkZJRxAFEhQKEEJMVUVUT09USF9DT05GSUcQBhITCg9TRUNVUklUWV9DT05GSUcQBxIVChFTRVNTSU9OS0VZX0NPTkZJRxAIEhMKD0RFVklDRVVJX0NPTkZJRxAJIrsCChBNb2R1bGVDb25maWdUeXBlEg8KC01RVFRfQ09ORklHEAASEQoNU0VSSUFMX0NPTkZJRxABEhMKD0VYVE5PVElGX0NPTkZJRxACEhcKE1NUT1JFRk9SV0FSRF9DT05GSUcQAxIUChBSQU5HRVRFU1RfQ09ORklHEAQSFAoQVEVMRU1FVFJZX0NPTkZJRxAFEhQKEENBTk5FRE1TR19DT05GSUcQBhIQCgxBVURJT19DT05GSUcQBxIZChVSRU1PVEVIQVJEV0FSRV9DT05GSUcQCBIXChNORUlHSEJPUklORk9fQ09ORklHEAkSGgoWQU1CSUVOVExJR0hUSU5HX0NPTkZJRxAKEhoKFkRFVEVDVElPTlNFTlNPUl9DT05GSUcQCxIVChFQQVhDT1VOVEVSX0NPTkZJRxAMIiMKDkJhY2t1cExvY2F0aW9uEgkKBUZMQVNIEAASBgoCU0QQAUIRCg9wYXlsb2FkX3ZhcmlhbnQiWwoNSGFtUGFyYW1ldGVycxIRCgljYWxsX3NpZ24YASABKAkSEAoIdHhfcG93ZXIYAiABKAUSEQoJZnJlcXVlbmN5GAMgASgCEhIKCnNob3J0X25hbWUYBCABKAkiZgoeTm9kZVJlbW90ZUhhcmR3YXJlUGluc1Jlc3BvbnNlEkQKGW5vZGVfcmVtb3RlX2hhcmR3YXJlX3BpbnMYASADKAsyIS5tZXNodGFzdGljLk5vZGVSZW1vdGVIYXJkd2FyZVBpbiJzCg1TaGFyZWRDb250YWN0EhAKCG5vZGVfbnVtGAEgASgNEh4KBHVzZXIYAiABKAsyEC5tZXNodGFzdGljLlVzZXISFQoNc2hvdWxkX2lnbm9yZRgDIAEoCBIZChFtYW51YWxseV92ZXJpZmllZBgEIAEoCCKcAgoUS2V5VmVyaWZpY2F0aW9uQWRtaW4SQgoMbWVzc2FnZV90eXBlGAEgASgOMiwubWVzaHRhc3RpYy5LZXlWZXJpZmljYXRpb25BZG1pbi5NZXNzYWdlVHlwZRIWCg5yZW1vdGVfbm9kZW51bRgCIAEoDRINCgVub25jZRgDIAEoBBIcCg9zZWN1cml0eV9udW1iZXIYBCABKA1IAIgBASJnCgtNZXNzYWdlVHlwZRIZChVJTklUSUFURV9WRVJJRklDQVRJT04QABIbChdQUk9WSURFX1NFQ1VSSVRZX05VTUJFUhABEg0KCURPX1ZFUklGWRACEhEKDURPX05PVF9WRVJJRlkQA0ISChBfc2VjdXJpdHlfbnVtYmVyQmAKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCC0FkbWluUHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw", [
	file_meshtastic_channel,
	file_meshtastic_config,
	file_meshtastic_connection_status,
	file_meshtastic_device_ui,
	file_meshtastic_mesh,
	file_meshtastic_module_config
]);
/**
* Describes the message meshtastic.AdminMessage.
* Use `create(AdminMessageSchema)` to create a new message.
*/ const AdminMessageSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 0);
/**
* Describes the message meshtastic.AdminMessage.InputEvent.
* Use `create(AdminMessage_InputEventSchema)` to create a new message.
*/ const AdminMessage_InputEventSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 0, 0);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.AdminMessage.ConfigType
*/ var AdminMessage_ConfigType = /* @__PURE__ */ function(AdminMessage_ConfigType$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: DEVICE_CONFIG = 0;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["DEVICE_CONFIG"] = 0] = "DEVICE_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: POSITION_CONFIG = 1;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["POSITION_CONFIG"] = 1] = "POSITION_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: POWER_CONFIG = 2;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["POWER_CONFIG"] = 2] = "POWER_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NETWORK_CONFIG = 3;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["NETWORK_CONFIG"] = 3] = "NETWORK_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: DISPLAY_CONFIG = 4;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["DISPLAY_CONFIG"] = 4] = "DISPLAY_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: LORA_CONFIG = 5;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["LORA_CONFIG"] = 5] = "LORA_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: BLUETOOTH_CONFIG = 6;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["BLUETOOTH_CONFIG"] = 6] = "BLUETOOTH_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: SECURITY_CONFIG = 7;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["SECURITY_CONFIG"] = 7] = "SECURITY_CONFIG";
	/**
	*
	* Session key config
	*
	* @generated from enum value: SESSIONKEY_CONFIG = 8;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["SESSIONKEY_CONFIG"] = 8] = "SESSIONKEY_CONFIG";
	/**
	*
	* device-ui config
	*
	* @generated from enum value: DEVICEUI_CONFIG = 9;
	*/ AdminMessage_ConfigType$1[AdminMessage_ConfigType$1["DEVICEUI_CONFIG"] = 9] = "DEVICEUI_CONFIG";
	return AdminMessage_ConfigType$1;
}({});
/**
* Describes the enum meshtastic.AdminMessage.ConfigType.
*/ const AdminMessage_ConfigTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_admin, 0, 0);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.AdminMessage.ModuleConfigType
*/ var AdminMessage_ModuleConfigType = /* @__PURE__ */ function(AdminMessage_ModuleConfigType$1) {
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: MQTT_CONFIG = 0;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["MQTT_CONFIG"] = 0] = "MQTT_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: SERIAL_CONFIG = 1;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["SERIAL_CONFIG"] = 1] = "SERIAL_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: EXTNOTIF_CONFIG = 2;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["EXTNOTIF_CONFIG"] = 2] = "EXTNOTIF_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: STOREFORWARD_CONFIG = 3;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["STOREFORWARD_CONFIG"] = 3] = "STOREFORWARD_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: RANGETEST_CONFIG = 4;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["RANGETEST_CONFIG"] = 4] = "RANGETEST_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: TELEMETRY_CONFIG = 5;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["TELEMETRY_CONFIG"] = 5] = "TELEMETRY_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: CANNEDMSG_CONFIG = 6;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["CANNEDMSG_CONFIG"] = 6] = "CANNEDMSG_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: AUDIO_CONFIG = 7;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["AUDIO_CONFIG"] = 7] = "AUDIO_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: REMOTEHARDWARE_CONFIG = 8;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["REMOTEHARDWARE_CONFIG"] = 8] = "REMOTEHARDWARE_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: NEIGHBORINFO_CONFIG = 9;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["NEIGHBORINFO_CONFIG"] = 9] = "NEIGHBORINFO_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: AMBIENTLIGHTING_CONFIG = 10;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["AMBIENTLIGHTING_CONFIG"] = 10] = "AMBIENTLIGHTING_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: DETECTIONSENSOR_CONFIG = 11;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["DETECTIONSENSOR_CONFIG"] = 11] = "DETECTIONSENSOR_CONFIG";
	/**
	*
	* TODO: REPLACE
	*
	* @generated from enum value: PAXCOUNTER_CONFIG = 12;
	*/ AdminMessage_ModuleConfigType$1[AdminMessage_ModuleConfigType$1["PAXCOUNTER_CONFIG"] = 12] = "PAXCOUNTER_CONFIG";
	return AdminMessage_ModuleConfigType$1;
}({});
/**
* Describes the enum meshtastic.AdminMessage.ModuleConfigType.
*/ const AdminMessage_ModuleConfigTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_admin, 0, 1);
/**
* @generated from enum meshtastic.AdminMessage.BackupLocation
*/ var AdminMessage_BackupLocation = /* @__PURE__ */ function(AdminMessage_BackupLocation$1) {
	/**
	*
	* Backup to the internal flash
	*
	* @generated from enum value: FLASH = 0;
	*/ AdminMessage_BackupLocation$1[AdminMessage_BackupLocation$1["FLASH"] = 0] = "FLASH";
	/**
	*
	* Backup to the SD card
	*
	* @generated from enum value: SD = 1;
	*/ AdminMessage_BackupLocation$1[AdminMessage_BackupLocation$1["SD"] = 1] = "SD";
	return AdminMessage_BackupLocation$1;
}({});
/**
* Describes the enum meshtastic.AdminMessage.BackupLocation.
*/ const AdminMessage_BackupLocationSchema = /* @__PURE__ */ enumDesc(file_meshtastic_admin, 0, 2);
/**
* Describes the message meshtastic.HamParameters.
* Use `create(HamParametersSchema)` to create a new message.
*/ const HamParametersSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 1);
/**
* Describes the message meshtastic.NodeRemoteHardwarePinsResponse.
* Use `create(NodeRemoteHardwarePinsResponseSchema)` to create a new message.
*/ const NodeRemoteHardwarePinsResponseSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 2);
/**
* Describes the message meshtastic.SharedContact.
* Use `create(SharedContactSchema)` to create a new message.
*/ const SharedContactSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 3);
/**
* Describes the message meshtastic.KeyVerificationAdmin.
* Use `create(KeyVerificationAdminSchema)` to create a new message.
*/ const KeyVerificationAdminSchema = /* @__PURE__ */ messageDesc(file_meshtastic_admin, 4);
/**
*
* Three stages of this request.
*
* @generated from enum meshtastic.KeyVerificationAdmin.MessageType
*/ var KeyVerificationAdmin_MessageType = /* @__PURE__ */ function(KeyVerificationAdmin_MessageType$1) {
	/**
	*
	* This is the first stage, where a client initiates
	*
	* @generated from enum value: INITIATE_VERIFICATION = 0;
	*/ KeyVerificationAdmin_MessageType$1[KeyVerificationAdmin_MessageType$1["INITIATE_VERIFICATION"] = 0] = "INITIATE_VERIFICATION";
	/**
	*
	* After the nonce has been returned over the mesh, the client prompts for the security number
	* And uses this message to provide it to the node.
	*
	* @generated from enum value: PROVIDE_SECURITY_NUMBER = 1;
	*/ KeyVerificationAdmin_MessageType$1[KeyVerificationAdmin_MessageType$1["PROVIDE_SECURITY_NUMBER"] = 1] = "PROVIDE_SECURITY_NUMBER";
	/**
	*
	* Once the user has compared the verification message, this message notifies the node.
	*
	* @generated from enum value: DO_VERIFY = 2;
	*/ KeyVerificationAdmin_MessageType$1[KeyVerificationAdmin_MessageType$1["DO_VERIFY"] = 2] = "DO_VERIFY";
	/**
	*
	* This is the cancel path, can be taken at any point
	*
	* @generated from enum value: DO_NOT_VERIFY = 3;
	*/ KeyVerificationAdmin_MessageType$1[KeyVerificationAdmin_MessageType$1["DO_NOT_VERIFY"] = 3] = "DO_NOT_VERIFY";
	return KeyVerificationAdmin_MessageType$1;
}({});
/**
* Describes the enum meshtastic.KeyVerificationAdmin.MessageType.
*/ const KeyVerificationAdmin_MessageTypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_admin, 4, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/apponly_pb.js
var apponly_pb_exports = {};
__export(apponly_pb_exports, {
	ChannelSetSchema: () => ChannelSetSchema,
	file_meshtastic_apponly: () => file_meshtastic_apponly
});
/**
* Describes the file meshtastic/apponly.proto.
*/ const file_meshtastic_apponly = /* @__PURE__ */ fileDesc("ChhtZXNodGFzdGljL2FwcG9ubHkucHJvdG8SCm1lc2h0YXN0aWMibwoKQ2hhbm5lbFNldBItCghzZXR0aW5ncxgBIAMoCzIbLm1lc2h0YXN0aWMuQ2hhbm5lbFNldHRpbmdzEjIKC2xvcmFfY29uZmlnGAIgASgLMh0ubWVzaHRhc3RpYy5Db25maWcuTG9SYUNvbmZpZ0JiChNjb20uZ2Vla3N2aWxsZS5tZXNoQg1BcHBPbmx5UHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw", [file_meshtastic_channel, file_meshtastic_config]);
/**
* Describes the message meshtastic.ChannelSet.
* Use `create(ChannelSetSchema)` to create a new message.
*/ const ChannelSetSchema = /* @__PURE__ */ messageDesc(file_meshtastic_apponly, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/atak_pb.js
var atak_pb_exports = {};
__export(atak_pb_exports, {
	ContactSchema: () => ContactSchema,
	GeoChatSchema: () => GeoChatSchema,
	GroupSchema: () => GroupSchema,
	MemberRole: () => MemberRole,
	MemberRoleSchema: () => MemberRoleSchema,
	PLISchema: () => PLISchema,
	StatusSchema: () => StatusSchema,
	TAKPacketSchema: () => TAKPacketSchema,
	Team: () => Team,
	TeamSchema: () => TeamSchema,
	file_meshtastic_atak: () => file_meshtastic_atak
});
/**
* Describes the file meshtastic/atak.proto.
*/ const file_meshtastic_atak = /* @__PURE__ */ fileDesc("ChVtZXNodGFzdGljL2F0YWsucHJvdG8SCm1lc2h0YXN0aWMi+AEKCVRBS1BhY2tldBIVCg1pc19jb21wcmVzc2VkGAEgASgIEiQKB2NvbnRhY3QYAiABKAsyEy5tZXNodGFzdGljLkNvbnRhY3QSIAoFZ3JvdXAYAyABKAsyES5tZXNodGFzdGljLkdyb3VwEiIKBnN0YXR1cxgEIAEoCzISLm1lc2h0YXN0aWMuU3RhdHVzEh4KA3BsaRgFIAEoCzIPLm1lc2h0YXN0aWMuUExJSAASIwoEY2hhdBgGIAEoCzITLm1lc2h0YXN0aWMuR2VvQ2hhdEgAEhAKBmRldGFpbBgHIAEoDEgAQhEKD3BheWxvYWRfdmFyaWFudCJcCgdHZW9DaGF0Eg8KB21lc3NhZ2UYASABKAkSDwoCdG8YAiABKAlIAIgBARIYCgt0b19jYWxsc2lnbhgDIAEoCUgBiAEBQgUKA190b0IOCgxfdG9fY2FsbHNpZ24iTQoFR3JvdXASJAoEcm9sZRgBIAEoDjIWLm1lc2h0YXN0aWMuTWVtYmVyUm9sZRIeCgR0ZWFtGAIgASgOMhAubWVzaHRhc3RpYy5UZWFtIhkKBlN0YXR1cxIPCgdiYXR0ZXJ5GAEgASgNIjQKB0NvbnRhY3QSEAoIY2FsbHNpZ24YASABKAkSFwoPZGV2aWNlX2NhbGxzaWduGAIgASgJIl8KA1BMSRISCgpsYXRpdHVkZV9pGAEgASgPEhMKC2xvbmdpdHVkZV9pGAIgASgPEhAKCGFsdGl0dWRlGAMgASgFEg0KBXNwZWVkGAQgASgNEg4KBmNvdXJzZRgFIAEoDSrAAQoEVGVhbRIUChBVbnNwZWNpZmVkX0NvbG9yEAASCQoFV2hpdGUQARIKCgZZZWxsb3cQAhIKCgZPcmFuZ2UQAxILCgdNYWdlbnRhEAQSBwoDUmVkEAUSCgoGTWFyb29uEAYSCgoGUHVycGxlEAcSDQoJRGFya19CbHVlEAgSCAoEQmx1ZRAJEggKBEN5YW4QChIICgRUZWFsEAsSCQoFR3JlZW4QDBIOCgpEYXJrX0dyZWVuEA0SCQoFQnJvd24QDip/CgpNZW1iZXJSb2xlEg4KClVuc3BlY2lmZWQQABIOCgpUZWFtTWVtYmVyEAESDAoIVGVhbUxlYWQQAhIGCgJIURADEgoKBlNuaXBlchAEEgkKBU1lZGljEAUSEwoPRm9yd2FyZE9ic2VydmVyEAYSBwoDUlRPEAcSBgoCSzkQCEJfChNjb20uZ2Vla3N2aWxsZS5tZXNoQgpBVEFLUHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw");
/**
* Describes the message meshtastic.TAKPacket.
* Use `create(TAKPacketSchema)` to create a new message.
*/ const TAKPacketSchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 0);
/**
* Describes the message meshtastic.GeoChat.
* Use `create(GeoChatSchema)` to create a new message.
*/ const GeoChatSchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 1);
/**
* Describes the message meshtastic.Group.
* Use `create(GroupSchema)` to create a new message.
*/ const GroupSchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 2);
/**
* Describes the message meshtastic.Status.
* Use `create(StatusSchema)` to create a new message.
*/ const StatusSchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 3);
/**
* Describes the message meshtastic.Contact.
* Use `create(ContactSchema)` to create a new message.
*/ const ContactSchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 4);
/**
* Describes the message meshtastic.PLI.
* Use `create(PLISchema)` to create a new message.
*/ const PLISchema = /* @__PURE__ */ messageDesc(file_meshtastic_atak, 5);
/**
* @generated from enum meshtastic.Team
*/ var Team = /* @__PURE__ */ function(Team$1) {
	/**
	*
	* Unspecifed
	*
	* @generated from enum value: Unspecifed_Color = 0;
	*/ Team$1[Team$1["Unspecifed_Color"] = 0] = "Unspecifed_Color";
	/**
	*
	* White
	*
	* @generated from enum value: White = 1;
	*/ Team$1[Team$1["White"] = 1] = "White";
	/**
	*
	* Yellow
	*
	* @generated from enum value: Yellow = 2;
	*/ Team$1[Team$1["Yellow"] = 2] = "Yellow";
	/**
	*
	* Orange
	*
	* @generated from enum value: Orange = 3;
	*/ Team$1[Team$1["Orange"] = 3] = "Orange";
	/**
	*
	* Magenta
	*
	* @generated from enum value: Magenta = 4;
	*/ Team$1[Team$1["Magenta"] = 4] = "Magenta";
	/**
	*
	* Red
	*
	* @generated from enum value: Red = 5;
	*/ Team$1[Team$1["Red"] = 5] = "Red";
	/**
	*
	* Maroon
	*
	* @generated from enum value: Maroon = 6;
	*/ Team$1[Team$1["Maroon"] = 6] = "Maroon";
	/**
	*
	* Purple
	*
	* @generated from enum value: Purple = 7;
	*/ Team$1[Team$1["Purple"] = 7] = "Purple";
	/**
	*
	* Dark Blue
	*
	* @generated from enum value: Dark_Blue = 8;
	*/ Team$1[Team$1["Dark_Blue"] = 8] = "Dark_Blue";
	/**
	*
	* Blue
	*
	* @generated from enum value: Blue = 9;
	*/ Team$1[Team$1["Blue"] = 9] = "Blue";
	/**
	*
	* Cyan
	*
	* @generated from enum value: Cyan = 10;
	*/ Team$1[Team$1["Cyan"] = 10] = "Cyan";
	/**
	*
	* Teal
	*
	* @generated from enum value: Teal = 11;
	*/ Team$1[Team$1["Teal"] = 11] = "Teal";
	/**
	*
	* Green
	*
	* @generated from enum value: Green = 12;
	*/ Team$1[Team$1["Green"] = 12] = "Green";
	/**
	*
	* Dark Green
	*
	* @generated from enum value: Dark_Green = 13;
	*/ Team$1[Team$1["Dark_Green"] = 13] = "Dark_Green";
	/**
	*
	* Brown
	*
	* @generated from enum value: Brown = 14;
	*/ Team$1[Team$1["Brown"] = 14] = "Brown";
	return Team$1;
}({});
/**
* Describes the enum meshtastic.Team.
*/ const TeamSchema = /* @__PURE__ */ enumDesc(file_meshtastic_atak, 0);
/**
*
* Role of the group member
*
* @generated from enum meshtastic.MemberRole
*/ var MemberRole = /* @__PURE__ */ function(MemberRole$1) {
	/**
	*
	* Unspecifed
	*
	* @generated from enum value: Unspecifed = 0;
	*/ MemberRole$1[MemberRole$1["Unspecifed"] = 0] = "Unspecifed";
	/**
	*
	* Team Member
	*
	* @generated from enum value: TeamMember = 1;
	*/ MemberRole$1[MemberRole$1["TeamMember"] = 1] = "TeamMember";
	/**
	*
	* Team Lead
	*
	* @generated from enum value: TeamLead = 2;
	*/ MemberRole$1[MemberRole$1["TeamLead"] = 2] = "TeamLead";
	/**
	*
	* Headquarters
	*
	* @generated from enum value: HQ = 3;
	*/ MemberRole$1[MemberRole$1["HQ"] = 3] = "HQ";
	/**
	*
	* Airsoft enthusiast
	*
	* @generated from enum value: Sniper = 4;
	*/ MemberRole$1[MemberRole$1["Sniper"] = 4] = "Sniper";
	/**
	*
	* Medic
	*
	* @generated from enum value: Medic = 5;
	*/ MemberRole$1[MemberRole$1["Medic"] = 5] = "Medic";
	/**
	*
	* ForwardObserver
	*
	* @generated from enum value: ForwardObserver = 6;
	*/ MemberRole$1[MemberRole$1["ForwardObserver"] = 6] = "ForwardObserver";
	/**
	*
	* Radio Telephone Operator
	*
	* @generated from enum value: RTO = 7;
	*/ MemberRole$1[MemberRole$1["RTO"] = 7] = "RTO";
	/**
	*
	* Doggo
	*
	* @generated from enum value: K9 = 8;
	*/ MemberRole$1[MemberRole$1["K9"] = 8] = "K9";
	return MemberRole$1;
}({});
/**
* Describes the enum meshtastic.MemberRole.
*/ const MemberRoleSchema = /* @__PURE__ */ enumDesc(file_meshtastic_atak, 1);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/cannedmessages_pb.js
var cannedmessages_pb_exports = {};
__export(cannedmessages_pb_exports, {
	CannedMessageModuleConfigSchema: () => CannedMessageModuleConfigSchema,
	file_meshtastic_cannedmessages: () => file_meshtastic_cannedmessages
});
/**
* Describes the file meshtastic/cannedmessages.proto.
*/ const file_meshtastic_cannedmessages = /* @__PURE__ */ fileDesc("Ch9tZXNodGFzdGljL2Nhbm5lZG1lc3NhZ2VzLnByb3RvEgptZXNodGFzdGljIi0KGUNhbm5lZE1lc3NhZ2VNb2R1bGVDb25maWcSEAoIbWVzc2FnZXMYASABKAlCbgoTY29tLmdlZWtzdmlsbGUubWVzaEIZQ2FubmVkTWVzc2FnZUNvbmZpZ1Byb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM");
/**
* Describes the message meshtastic.CannedMessageModuleConfig.
* Use `create(CannedMessageModuleConfigSchema)` to create a new message.
*/ const CannedMessageModuleConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_cannedmessages, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/localonly_pb.js
var localonly_pb_exports = {};
__export(localonly_pb_exports, {
	LocalConfigSchema: () => LocalConfigSchema,
	LocalModuleConfigSchema: () => LocalModuleConfigSchema,
	file_meshtastic_localonly: () => file_meshtastic_localonly
});
/**
* Describes the file meshtastic/localonly.proto.
*/ const file_meshtastic_localonly = /* @__PURE__ */ fileDesc("ChptZXNodGFzdGljL2xvY2Fsb25seS5wcm90bxIKbWVzaHRhc3RpYyKyAwoLTG9jYWxDb25maWcSLwoGZGV2aWNlGAEgASgLMh8ubWVzaHRhc3RpYy5Db25maWcuRGV2aWNlQ29uZmlnEjMKCHBvc2l0aW9uGAIgASgLMiEubWVzaHRhc3RpYy5Db25maWcuUG9zaXRpb25Db25maWcSLQoFcG93ZXIYAyABKAsyHi5tZXNodGFzdGljLkNvbmZpZy5Qb3dlckNvbmZpZxIxCgduZXR3b3JrGAQgASgLMiAubWVzaHRhc3RpYy5Db25maWcuTmV0d29ya0NvbmZpZxIxCgdkaXNwbGF5GAUgASgLMiAubWVzaHRhc3RpYy5Db25maWcuRGlzcGxheUNvbmZpZxIrCgRsb3JhGAYgASgLMh0ubWVzaHRhc3RpYy5Db25maWcuTG9SYUNvbmZpZxI1CglibHVldG9vdGgYByABKAsyIi5tZXNodGFzdGljLkNvbmZpZy5CbHVldG9vdGhDb25maWcSDwoHdmVyc2lvbhgIIAEoDRIzCghzZWN1cml0eRgJIAEoCzIhLm1lc2h0YXN0aWMuQ29uZmlnLlNlY3VyaXR5Q29uZmlnIvsGChFMb2NhbE1vZHVsZUNvbmZpZxIxCgRtcXR0GAEgASgLMiMubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuTVFUVENvbmZpZxI1CgZzZXJpYWwYAiABKAsyJS5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5TZXJpYWxDb25maWcSUgoVZXh0ZXJuYWxfbm90aWZpY2F0aW9uGAMgASgLMjMubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuRXh0ZXJuYWxOb3RpZmljYXRpb25Db25maWcSQgoNc3RvcmVfZm9yd2FyZBgEIAEoCzIrLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLlN0b3JlRm9yd2FyZENvbmZpZxI8CgpyYW5nZV90ZXN0GAUgASgLMigubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuUmFuZ2VUZXN0Q29uZmlnEjsKCXRlbGVtZXRyeRgGIAEoCzIoLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLlRlbGVtZXRyeUNvbmZpZxJECg5jYW5uZWRfbWVzc2FnZRgHIAEoCzIsLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkNhbm5lZE1lc3NhZ2VDb25maWcSMwoFYXVkaW8YCSABKAsyJC5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5BdWRpb0NvbmZpZxJGCg9yZW1vdGVfaGFyZHdhcmUYCiABKAsyLS5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5SZW1vdGVIYXJkd2FyZUNvbmZpZxJCCg1uZWlnaGJvcl9pbmZvGAsgASgLMisubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuTmVpZ2hib3JJbmZvQ29uZmlnEkgKEGFtYmllbnRfbGlnaHRpbmcYDCABKAsyLi5tZXNodGFzdGljLk1vZHVsZUNvbmZpZy5BbWJpZW50TGlnaHRpbmdDb25maWcSSAoQZGV0ZWN0aW9uX3NlbnNvchgNIAEoCzIuLm1lc2h0YXN0aWMuTW9kdWxlQ29uZmlnLkRldGVjdGlvblNlbnNvckNvbmZpZxI9CgpwYXhjb3VudGVyGA4gASgLMikubWVzaHRhc3RpYy5Nb2R1bGVDb25maWcuUGF4Y291bnRlckNvbmZpZxIPCgd2ZXJzaW9uGAggASgNQmQKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCD0xvY2FsT25seVByb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM", [file_meshtastic_config, file_meshtastic_module_config]);
/**
* Describes the message meshtastic.LocalConfig.
* Use `create(LocalConfigSchema)` to create a new message.
*/ const LocalConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_localonly, 0);
/**
* Describes the message meshtastic.LocalModuleConfig.
* Use `create(LocalModuleConfigSchema)` to create a new message.
*/ const LocalModuleConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_localonly, 1);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/clientonly_pb.js
var clientonly_pb_exports = {};
__export(clientonly_pb_exports, {
	DeviceProfileSchema: () => DeviceProfileSchema,
	file_meshtastic_clientonly: () => file_meshtastic_clientonly
});
/**
* Describes the file meshtastic/clientonly.proto.
*/ const file_meshtastic_clientonly = /* @__PURE__ */ fileDesc("ChttZXNodGFzdGljL2NsaWVudG9ubHkucHJvdG8SCm1lc2h0YXN0aWMiqQMKDURldmljZVByb2ZpbGUSFgoJbG9uZ19uYW1lGAEgASgJSACIAQESFwoKc2hvcnRfbmFtZRgCIAEoCUgBiAEBEhgKC2NoYW5uZWxfdXJsGAMgASgJSAKIAQESLAoGY29uZmlnGAQgASgLMhcubWVzaHRhc3RpYy5Mb2NhbENvbmZpZ0gDiAEBEjkKDW1vZHVsZV9jb25maWcYBSABKAsyHS5tZXNodGFzdGljLkxvY2FsTW9kdWxlQ29uZmlnSASIAQESMQoOZml4ZWRfcG9zaXRpb24YBiABKAsyFC5tZXNodGFzdGljLlBvc2l0aW9uSAWIAQESFQoIcmluZ3RvbmUYByABKAlIBogBARIcCg9jYW5uZWRfbWVzc2FnZXMYCCABKAlIB4gBAUIMCgpfbG9uZ19uYW1lQg0KC19zaG9ydF9uYW1lQg4KDF9jaGFubmVsX3VybEIJCgdfY29uZmlnQhAKDl9tb2R1bGVfY29uZmlnQhEKD19maXhlZF9wb3NpdGlvbkILCglfcmluZ3RvbmVCEgoQX2Nhbm5lZF9tZXNzYWdlc0JlChNjb20uZ2Vla3N2aWxsZS5tZXNoQhBDbGllbnRPbmx5UHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw", [file_meshtastic_localonly, file_meshtastic_mesh]);
/**
* Describes the message meshtastic.DeviceProfile.
* Use `create(DeviceProfileSchema)` to create a new message.
*/ const DeviceProfileSchema = /* @__PURE__ */ messageDesc(file_meshtastic_clientonly, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/mqtt_pb.js
var mqtt_pb_exports = {};
__export(mqtt_pb_exports, {
	MapReportSchema: () => MapReportSchema,
	ServiceEnvelopeSchema: () => ServiceEnvelopeSchema,
	file_meshtastic_mqtt: () => file_meshtastic_mqtt
});
/**
* Describes the file meshtastic/mqtt.proto.
*/ const file_meshtastic_mqtt = /* @__PURE__ */ fileDesc("ChVtZXNodGFzdGljL21xdHQucHJvdG8SCm1lc2h0YXN0aWMiYQoPU2VydmljZUVudmVsb3BlEiYKBnBhY2tldBgBIAEoCzIWLm1lc2h0YXN0aWMuTWVzaFBhY2tldBISCgpjaGFubmVsX2lkGAIgASgJEhIKCmdhdGV3YXlfaWQYAyABKAki3wMKCU1hcFJlcG9ydBIRCglsb25nX25hbWUYASABKAkSEgoKc2hvcnRfbmFtZRgCIAEoCRIyCgRyb2xlGAMgASgOMiQubWVzaHRhc3RpYy5Db25maWcuRGV2aWNlQ29uZmlnLlJvbGUSKwoIaHdfbW9kZWwYBCABKA4yGS5tZXNodGFzdGljLkhhcmR3YXJlTW9kZWwSGAoQZmlybXdhcmVfdmVyc2lvbhgFIAEoCRI4CgZyZWdpb24YBiABKA4yKC5tZXNodGFzdGljLkNvbmZpZy5Mb1JhQ29uZmlnLlJlZ2lvbkNvZGUSPwoMbW9kZW1fcHJlc2V0GAcgASgOMikubWVzaHRhc3RpYy5Db25maWcuTG9SYUNvbmZpZy5Nb2RlbVByZXNldBIbChNoYXNfZGVmYXVsdF9jaGFubmVsGAggASgIEhIKCmxhdGl0dWRlX2kYCSABKA8SEwoLbG9uZ2l0dWRlX2kYCiABKA8SEAoIYWx0aXR1ZGUYCyABKAUSGgoScG9zaXRpb25fcHJlY2lzaW9uGAwgASgNEh4KFm51bV9vbmxpbmVfbG9jYWxfbm9kZXMYDSABKA0SIQoZaGFzX29wdGVkX3JlcG9ydF9sb2NhdGlvbhgOIAEoCEJfChNjb20uZ2Vla3N2aWxsZS5tZXNoQgpNUVRUUHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw", [file_meshtastic_config, file_meshtastic_mesh]);
/**
* Describes the message meshtastic.ServiceEnvelope.
* Use `create(ServiceEnvelopeSchema)` to create a new message.
*/ const ServiceEnvelopeSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mqtt, 0);
/**
* Describes the message meshtastic.MapReport.
* Use `create(MapReportSchema)` to create a new message.
*/ const MapReportSchema = /* @__PURE__ */ messageDesc(file_meshtastic_mqtt, 1);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/paxcount_pb.js
var paxcount_pb_exports = {};
__export(paxcount_pb_exports, {
	PaxcountSchema: () => PaxcountSchema,
	file_meshtastic_paxcount: () => file_meshtastic_paxcount
});
/**
* Describes the file meshtastic/paxcount.proto.
*/ const file_meshtastic_paxcount = /* @__PURE__ */ fileDesc("ChltZXNodGFzdGljL3BheGNvdW50LnByb3RvEgptZXNodGFzdGljIjUKCFBheGNvdW50EgwKBHdpZmkYASABKA0SCwoDYmxlGAIgASgNEg4KBnVwdGltZRgDIAEoDUJjChNjb20uZ2Vla3N2aWxsZS5tZXNoQg5QYXhjb3VudFByb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM");
/**
* Describes the message meshtastic.Paxcount.
* Use `create(PaxcountSchema)` to create a new message.
*/ const PaxcountSchema = /* @__PURE__ */ messageDesc(file_meshtastic_paxcount, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/powermon_pb.js
var powermon_pb_exports = {};
__export(powermon_pb_exports, {
	PowerMonSchema: () => PowerMonSchema,
	PowerMon_State: () => PowerMon_State,
	PowerMon_StateSchema: () => PowerMon_StateSchema,
	PowerStressMessageSchema: () => PowerStressMessageSchema,
	PowerStressMessage_Opcode: () => PowerStressMessage_Opcode,
	PowerStressMessage_OpcodeSchema: () => PowerStressMessage_OpcodeSchema,
	file_meshtastic_powermon: () => file_meshtastic_powermon
});
/**
* Describes the file meshtastic/powermon.proto.
*/ const file_meshtastic_powermon = /* @__PURE__ */ fileDesc("ChltZXNodGFzdGljL3Bvd2VybW9uLnByb3RvEgptZXNodGFzdGljIuABCghQb3dlck1vbiLTAQoFU3RhdGUSCAoETm9uZRAAEhEKDUNQVV9EZWVwU2xlZXAQARISCg5DUFVfTGlnaHRTbGVlcBACEgwKCFZleHQxX09uEAQSDQoJTG9yYV9SWE9uEAgSDQoJTG9yYV9UWE9uEBASEQoNTG9yYV9SWEFjdGl2ZRAgEgkKBUJUX09uEEASCwoGTEVEX09uEIABEg4KCVNjcmVlbl9PbhCAAhITCg5TY3JlZW5fRHJhd2luZxCABBIMCgdXaWZpX09uEIAIEg8KCkdQU19BY3RpdmUQgBAi/wIKElBvd2VyU3RyZXNzTWVzc2FnZRIyCgNjbWQYASABKA4yJS5tZXNodGFzdGljLlBvd2VyU3RyZXNzTWVzc2FnZS5PcGNvZGUSEwoLbnVtX3NlY29uZHMYAiABKAIinwIKBk9wY29kZRIJCgVVTlNFVBAAEg4KClBSSU5UX0lORk8QARIPCgtGT1JDRV9RVUlFVBACEg0KCUVORF9RVUlFVBADEg0KCVNDUkVFTl9PThAQEg4KClNDUkVFTl9PRkYQERIMCghDUFVfSURMRRAgEhEKDUNQVV9ERUVQU0xFRVAQIRIOCgpDUFVfRlVMTE9OECISCgoGTEVEX09OEDASCwoHTEVEX09GRhAxEgwKCExPUkFfT0ZGEEASCwoHTE9SQV9UWBBBEgsKB0xPUkFfUlgQQhIKCgZCVF9PRkYQUBIJCgVCVF9PThBREgwKCFdJRklfT0ZGEGASCwoHV0lGSV9PThBhEgsKB0dQU19PRkYQcBIKCgZHUFNfT04QcUJjChNjb20uZ2Vla3N2aWxsZS5tZXNoQg5Qb3dlck1vblByb3Rvc1oiZ2l0aHViLmNvbS9tZXNodGFzdGljL2dvL2dlbmVyYXRlZKoCFE1lc2h0YXN0aWMuUHJvdG9idWZzugIAYgZwcm90bzM");
/**
* Describes the message meshtastic.PowerMon.
* Use `create(PowerMonSchema)` to create a new message.
*/ const PowerMonSchema = /* @__PURE__ */ messageDesc(file_meshtastic_powermon, 0);
/**
* Any significant power changing event in meshtastic should be tagged with a powermon state transition.
* If you are making new meshtastic features feel free to add new entries at the end of this definition.
*
* @generated from enum meshtastic.PowerMon.State
*/ var PowerMon_State = /* @__PURE__ */ function(PowerMon_State$1) {
	/**
	* @generated from enum value: None = 0;
	*/ PowerMon_State$1[PowerMon_State$1["None"] = 0] = "None";
	/**
	* @generated from enum value: CPU_DeepSleep = 1;
	*/ PowerMon_State$1[PowerMon_State$1["CPU_DeepSleep"] = 1] = "CPU_DeepSleep";
	/**
	* @generated from enum value: CPU_LightSleep = 2;
	*/ PowerMon_State$1[PowerMon_State$1["CPU_LightSleep"] = 2] = "CPU_LightSleep";
	/**
	*
	* The external Vext1 power is on.  Many boards have auxillary power rails that the CPU turns on only
	* occasionally.  In cases where that rail has multiple devices on it we usually want to have logging on
	* the state of that rail as an independent record.
	* For instance on the Heltec Tracker 1.1 board, this rail is the power source for the GPS and screen.
	*
	* The log messages will be short and complete (see PowerMon.Event in the protobufs for details).
	* something like "S:PM:C,0x00001234,REASON" where the hex number is the bitmask of all current states.
	* (We use a bitmask for states so that if a log message gets lost it won't be fatal)
	*
	* @generated from enum value: Vext1_On = 4;
	*/ PowerMon_State$1[PowerMon_State$1["Vext1_On"] = 4] = "Vext1_On";
	/**
	* @generated from enum value: Lora_RXOn = 8;
	*/ PowerMon_State$1[PowerMon_State$1["Lora_RXOn"] = 8] = "Lora_RXOn";
	/**
	* @generated from enum value: Lora_TXOn = 16;
	*/ PowerMon_State$1[PowerMon_State$1["Lora_TXOn"] = 16] = "Lora_TXOn";
	/**
	* @generated from enum value: Lora_RXActive = 32;
	*/ PowerMon_State$1[PowerMon_State$1["Lora_RXActive"] = 32] = "Lora_RXActive";
	/**
	* @generated from enum value: BT_On = 64;
	*/ PowerMon_State$1[PowerMon_State$1["BT_On"] = 64] = "BT_On";
	/**
	* @generated from enum value: LED_On = 128;
	*/ PowerMon_State$1[PowerMon_State$1["LED_On"] = 128] = "LED_On";
	/**
	* @generated from enum value: Screen_On = 256;
	*/ PowerMon_State$1[PowerMon_State$1["Screen_On"] = 256] = "Screen_On";
	/**
	* @generated from enum value: Screen_Drawing = 512;
	*/ PowerMon_State$1[PowerMon_State$1["Screen_Drawing"] = 512] = "Screen_Drawing";
	/**
	* @generated from enum value: Wifi_On = 1024;
	*/ PowerMon_State$1[PowerMon_State$1["Wifi_On"] = 1024] = "Wifi_On";
	/**
	*
	* GPS is actively trying to find our location
	* See GPSPowerState for more details
	*
	* @generated from enum value: GPS_Active = 2048;
	*/ PowerMon_State$1[PowerMon_State$1["GPS_Active"] = 2048] = "GPS_Active";
	return PowerMon_State$1;
}({});
/**
* Describes the enum meshtastic.PowerMon.State.
*/ const PowerMon_StateSchema = /* @__PURE__ */ enumDesc(file_meshtastic_powermon, 0, 0);
/**
* Describes the message meshtastic.PowerStressMessage.
* Use `create(PowerStressMessageSchema)` to create a new message.
*/ const PowerStressMessageSchema = /* @__PURE__ */ messageDesc(file_meshtastic_powermon, 1);
/**
*
* What operation would we like the UUT to perform.
* note: senders should probably set want_response in their request packets, so that they can know when the state
* machine has started processing their request
*
* @generated from enum meshtastic.PowerStressMessage.Opcode
*/ var PowerStressMessage_Opcode = /* @__PURE__ */ function(PowerStressMessage_Opcode$1) {
	/**
	*
	* Unset/unused
	*
	* @generated from enum value: UNSET = 0;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["UNSET"] = 0] = "UNSET";
	/**
	* Print board version slog and send an ack that we are alive and ready to process commands
	*
	* @generated from enum value: PRINT_INFO = 1;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["PRINT_INFO"] = 1] = "PRINT_INFO";
	/**
	* Try to turn off all automatic processing of packets, screen, sleeping, etc (to make it easier to measure in isolation)
	*
	* @generated from enum value: FORCE_QUIET = 2;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["FORCE_QUIET"] = 2] = "FORCE_QUIET";
	/**
	* Stop powerstress processing - probably by just rebooting the board
	*
	* @generated from enum value: END_QUIET = 3;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["END_QUIET"] = 3] = "END_QUIET";
	/**
	* Turn the screen on
	*
	* @generated from enum value: SCREEN_ON = 16;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["SCREEN_ON"] = 16] = "SCREEN_ON";
	/**
	* Turn the screen off
	*
	* @generated from enum value: SCREEN_OFF = 17;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["SCREEN_OFF"] = 17] = "SCREEN_OFF";
	/**
	* Let the CPU run but we assume mostly idling for num_seconds
	*
	* @generated from enum value: CPU_IDLE = 32;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["CPU_IDLE"] = 32] = "CPU_IDLE";
	/**
	* Force deep sleep for FIXME seconds
	*
	* @generated from enum value: CPU_DEEPSLEEP = 33;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["CPU_DEEPSLEEP"] = 33] = "CPU_DEEPSLEEP";
	/**
	* Spin the CPU as fast as possible for num_seconds
	*
	* @generated from enum value: CPU_FULLON = 34;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["CPU_FULLON"] = 34] = "CPU_FULLON";
	/**
	* Turn the LED on for num_seconds (and leave it on - for baseline power measurement purposes)
	*
	* @generated from enum value: LED_ON = 48;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["LED_ON"] = 48] = "LED_ON";
	/**
	* Force the LED off for num_seconds
	*
	* @generated from enum value: LED_OFF = 49;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["LED_OFF"] = 49] = "LED_OFF";
	/**
	* Completely turn off the LORA radio for num_seconds
	*
	* @generated from enum value: LORA_OFF = 64;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["LORA_OFF"] = 64] = "LORA_OFF";
	/**
	* Send Lora packets for num_seconds
	*
	* @generated from enum value: LORA_TX = 65;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["LORA_TX"] = 65] = "LORA_TX";
	/**
	* Receive Lora packets for num_seconds (node will be mostly just listening, unless an external agent is helping stress this by sending packets on the current channel)
	*
	* @generated from enum value: LORA_RX = 66;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["LORA_RX"] = 66] = "LORA_RX";
	/**
	* Turn off the BT radio for num_seconds
	*
	* @generated from enum value: BT_OFF = 80;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["BT_OFF"] = 80] = "BT_OFF";
	/**
	* Turn on the BT radio for num_seconds
	*
	* @generated from enum value: BT_ON = 81;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["BT_ON"] = 81] = "BT_ON";
	/**
	* Turn off the WIFI radio for num_seconds
	*
	* @generated from enum value: WIFI_OFF = 96;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["WIFI_OFF"] = 96] = "WIFI_OFF";
	/**
	* Turn on the WIFI radio for num_seconds
	*
	* @generated from enum value: WIFI_ON = 97;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["WIFI_ON"] = 97] = "WIFI_ON";
	/**
	* Turn off the GPS radio for num_seconds
	*
	* @generated from enum value: GPS_OFF = 112;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["GPS_OFF"] = 112] = "GPS_OFF";
	/**
	* Turn on the GPS radio for num_seconds
	*
	* @generated from enum value: GPS_ON = 113;
	*/ PowerStressMessage_Opcode$1[PowerStressMessage_Opcode$1["GPS_ON"] = 113] = "GPS_ON";
	return PowerStressMessage_Opcode$1;
}({});
/**
* Describes the enum meshtastic.PowerStressMessage.Opcode.
*/ const PowerStressMessage_OpcodeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_powermon, 1, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/remote_hardware_pb.js
var remote_hardware_pb_exports = {};
__export(remote_hardware_pb_exports, {
	HardwareMessageSchema: () => HardwareMessageSchema,
	HardwareMessage_Type: () => HardwareMessage_Type,
	HardwareMessage_TypeSchema: () => HardwareMessage_TypeSchema,
	file_meshtastic_remote_hardware: () => file_meshtastic_remote_hardware
});
/**
* Describes the file meshtastic/remote_hardware.proto.
*/ const file_meshtastic_remote_hardware = /* @__PURE__ */ fileDesc("CiBtZXNodGFzdGljL3JlbW90ZV9oYXJkd2FyZS5wcm90bxIKbWVzaHRhc3RpYyLWAQoPSGFyZHdhcmVNZXNzYWdlEi4KBHR5cGUYASABKA4yIC5tZXNodGFzdGljLkhhcmR3YXJlTWVzc2FnZS5UeXBlEhEKCWdwaW9fbWFzaxgCIAEoBBISCgpncGlvX3ZhbHVlGAMgASgEImwKBFR5cGUSCQoFVU5TRVQQABIPCgtXUklURV9HUElPUxABEg8KC1dBVENIX0dQSU9TEAISEQoNR1BJT1NfQ0hBTkdFRBADEg4KClJFQURfR1BJT1MQBBIUChBSRUFEX0dQSU9TX1JFUExZEAVCYwoTY29tLmdlZWtzdmlsbGUubWVzaEIOUmVtb3RlSGFyZHdhcmVaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z");
/**
* Describes the message meshtastic.HardwareMessage.
* Use `create(HardwareMessageSchema)` to create a new message.
*/ const HardwareMessageSchema = /* @__PURE__ */ messageDesc(file_meshtastic_remote_hardware, 0);
/**
*
* TODO: REPLACE
*
* @generated from enum meshtastic.HardwareMessage.Type
*/ var HardwareMessage_Type = /* @__PURE__ */ function(HardwareMessage_Type$1) {
	/**
	*
	* Unset/unused
	*
	* @generated from enum value: UNSET = 0;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* Set gpio gpios based on gpio_mask/gpio_value
	*
	* @generated from enum value: WRITE_GPIOS = 1;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["WRITE_GPIOS"] = 1] = "WRITE_GPIOS";
	/**
	*
	* We are now interested in watching the gpio_mask gpios.
	* If the selected gpios change, please broadcast GPIOS_CHANGED.
	* Will implicitly change the gpios requested to be INPUT gpios.
	*
	* @generated from enum value: WATCH_GPIOS = 2;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["WATCH_GPIOS"] = 2] = "WATCH_GPIOS";
	/**
	*
	* The gpios listed in gpio_mask have changed, the new values are listed in gpio_value
	*
	* @generated from enum value: GPIOS_CHANGED = 3;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["GPIOS_CHANGED"] = 3] = "GPIOS_CHANGED";
	/**
	*
	* Read the gpios specified in gpio_mask, send back a READ_GPIOS_REPLY reply with gpio_value populated
	*
	* @generated from enum value: READ_GPIOS = 4;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["READ_GPIOS"] = 4] = "READ_GPIOS";
	/**
	*
	* A reply to READ_GPIOS. gpio_mask and gpio_value will be populated
	*
	* @generated from enum value: READ_GPIOS_REPLY = 5;
	*/ HardwareMessage_Type$1[HardwareMessage_Type$1["READ_GPIOS_REPLY"] = 5] = "READ_GPIOS_REPLY";
	return HardwareMessage_Type$1;
}({});
/**
* Describes the enum meshtastic.HardwareMessage.Type.
*/ const HardwareMessage_TypeSchema = /* @__PURE__ */ enumDesc(file_meshtastic_remote_hardware, 0, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/rtttl_pb.js
var rtttl_pb_exports = {};
__export(rtttl_pb_exports, {
	RTTTLConfigSchema: () => RTTTLConfigSchema,
	file_meshtastic_rtttl: () => file_meshtastic_rtttl
});
/**
* Describes the file meshtastic/rtttl.proto.
*/ const file_meshtastic_rtttl = /* @__PURE__ */ fileDesc("ChZtZXNodGFzdGljL3J0dHRsLnByb3RvEgptZXNodGFzdGljIh8KC1JUVFRMQ29uZmlnEhAKCHJpbmd0b25lGAEgASgJQmYKE2NvbS5nZWVrc3ZpbGxlLm1lc2hCEVJUVFRMQ29uZmlnUHJvdG9zWiJnaXRodWIuY29tL21lc2h0YXN0aWMvZ28vZ2VuZXJhdGVkqgIUTWVzaHRhc3RpYy5Qcm90b2J1ZnO6AgBiBnByb3RvMw");
/**
* Describes the message meshtastic.RTTTLConfig.
* Use `create(RTTTLConfigSchema)` to create a new message.
*/ const RTTTLConfigSchema = /* @__PURE__ */ messageDesc(file_meshtastic_rtttl, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/dist/storeforward_pb.js
var storeforward_pb_exports = {};
__export(storeforward_pb_exports, {
	StoreAndForwardSchema: () => StoreAndForwardSchema,
	StoreAndForward_HeartbeatSchema: () => StoreAndForward_HeartbeatSchema,
	StoreAndForward_HistorySchema: () => StoreAndForward_HistorySchema,
	StoreAndForward_RequestResponse: () => StoreAndForward_RequestResponse,
	StoreAndForward_RequestResponseSchema: () => StoreAndForward_RequestResponseSchema,
	StoreAndForward_StatisticsSchema: () => StoreAndForward_StatisticsSchema,
	file_meshtastic_storeforward: () => file_meshtastic_storeforward
});
/**
* Describes the file meshtastic/storeforward.proto.
*/ const file_meshtastic_storeforward = /* @__PURE__ */ fileDesc("Ch1tZXNodGFzdGljL3N0b3JlZm9yd2FyZC5wcm90bxIKbWVzaHRhc3RpYyKcBwoPU3RvcmVBbmRGb3J3YXJkEjcKAnJyGAEgASgOMisubWVzaHRhc3RpYy5TdG9yZUFuZEZvcndhcmQuUmVxdWVzdFJlc3BvbnNlEjcKBXN0YXRzGAIgASgLMiYubWVzaHRhc3RpYy5TdG9yZUFuZEZvcndhcmQuU3RhdGlzdGljc0gAEjYKB2hpc3RvcnkYAyABKAsyIy5tZXNodGFzdGljLlN0b3JlQW5kRm9yd2FyZC5IaXN0b3J5SAASOgoJaGVhcnRiZWF0GAQgASgLMiUubWVzaHRhc3RpYy5TdG9yZUFuZEZvcndhcmQuSGVhcnRiZWF0SAASDgoEdGV4dBgFIAEoDEgAGs0BCgpTdGF0aXN0aWNzEhYKDm1lc3NhZ2VzX3RvdGFsGAEgASgNEhYKDm1lc3NhZ2VzX3NhdmVkGAIgASgNEhQKDG1lc3NhZ2VzX21heBgDIAEoDRIPCgd1cF90aW1lGAQgASgNEhAKCHJlcXVlc3RzGAUgASgNEhgKEHJlcXVlc3RzX2hpc3RvcnkYBiABKA0SEQoJaGVhcnRiZWF0GAcgASgIEhIKCnJldHVybl9tYXgYCCABKA0SFQoNcmV0dXJuX3dpbmRvdxgJIAEoDRpJCgdIaXN0b3J5EhgKEGhpc3RvcnlfbWVzc2FnZXMYASABKA0SDgoGd2luZG93GAIgASgNEhQKDGxhc3RfcmVxdWVzdBgDIAEoDRouCglIZWFydGJlYXQSDgoGcGVyaW9kGAEgASgNEhEKCXNlY29uZGFyeRgCIAEoDSK8AgoPUmVxdWVzdFJlc3BvbnNlEgkKBVVOU0VUEAASEAoMUk9VVEVSX0VSUk9SEAESFAoQUk9VVEVSX0hFQVJUQkVBVBACEg8KC1JPVVRFUl9QSU5HEAMSDwoLUk9VVEVSX1BPTkcQBBIPCgtST1VURVJfQlVTWRAFEhIKDlJPVVRFUl9ISVNUT1JZEAYSEAoMUk9VVEVSX1NUQVRTEAcSFgoSUk9VVEVSX1RFWFRfRElSRUNUEAgSGQoVUk9VVEVSX1RFWFRfQlJPQURDQVNUEAkSEAoMQ0xJRU5UX0VSUk9SEEASEgoOQ0xJRU5UX0hJU1RPUlkQQRIQCgxDTElFTlRfU1RBVFMQQhIPCgtDTElFTlRfUElORxBDEg8KC0NMSUVOVF9QT05HEEQSEAoMQ0xJRU5UX0FCT1JUEGpCCQoHdmFyaWFudEJqChNjb20uZ2Vla3N2aWxsZS5tZXNoQhVTdG9yZUFuZEZvcndhcmRQcm90b3NaImdpdGh1Yi5jb20vbWVzaHRhc3RpYy9nby9nZW5lcmF0ZWSqAhRNZXNodGFzdGljLlByb3RvYnVmc7oCAGIGcHJvdG8z");
/**
* Describes the message meshtastic.StoreAndForward.
* Use `create(StoreAndForwardSchema)` to create a new message.
*/ const StoreAndForwardSchema = /* @__PURE__ */ messageDesc(file_meshtastic_storeforward, 0);
/**
* Describes the message meshtastic.StoreAndForward.Statistics.
* Use `create(StoreAndForward_StatisticsSchema)` to create a new message.
*/ const StoreAndForward_StatisticsSchema = /* @__PURE__ */ messageDesc(file_meshtastic_storeforward, 0, 0);
/**
* Describes the message meshtastic.StoreAndForward.History.
* Use `create(StoreAndForward_HistorySchema)` to create a new message.
*/ const StoreAndForward_HistorySchema = /* @__PURE__ */ messageDesc(file_meshtastic_storeforward, 0, 1);
/**
* Describes the message meshtastic.StoreAndForward.Heartbeat.
* Use `create(StoreAndForward_HeartbeatSchema)` to create a new message.
*/ const StoreAndForward_HeartbeatSchema = /* @__PURE__ */ messageDesc(file_meshtastic_storeforward, 0, 2);
/**
*
* 001 - 063 = From Router
* 064 - 127 = From Client
*
* @generated from enum meshtastic.StoreAndForward.RequestResponse
*/ var StoreAndForward_RequestResponse = /* @__PURE__ */ function(StoreAndForward_RequestResponse$1) {
	/**
	*
	* Unset/unused
	*
	* @generated from enum value: UNSET = 0;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["UNSET"] = 0] = "UNSET";
	/**
	*
	* Router is an in error state.
	*
	* @generated from enum value: ROUTER_ERROR = 1;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_ERROR"] = 1] = "ROUTER_ERROR";
	/**
	*
	* Router heartbeat
	*
	* @generated from enum value: ROUTER_HEARTBEAT = 2;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_HEARTBEAT"] = 2] = "ROUTER_HEARTBEAT";
	/**
	*
	* Router has requested the client respond. This can work as a
	* "are you there" message.
	*
	* @generated from enum value: ROUTER_PING = 3;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_PING"] = 3] = "ROUTER_PING";
	/**
	*
	* The response to a "Ping"
	*
	* @generated from enum value: ROUTER_PONG = 4;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_PONG"] = 4] = "ROUTER_PONG";
	/**
	*
	* Router is currently busy. Please try again later.
	*
	* @generated from enum value: ROUTER_BUSY = 5;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_BUSY"] = 5] = "ROUTER_BUSY";
	/**
	*
	* Router is responding to a request for history.
	*
	* @generated from enum value: ROUTER_HISTORY = 6;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_HISTORY"] = 6] = "ROUTER_HISTORY";
	/**
	*
	* Router is responding to a request for stats.
	*
	* @generated from enum value: ROUTER_STATS = 7;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_STATS"] = 7] = "ROUTER_STATS";
	/**
	*
	* Router sends a text message from its history that was a direct message.
	*
	* @generated from enum value: ROUTER_TEXT_DIRECT = 8;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_TEXT_DIRECT"] = 8] = "ROUTER_TEXT_DIRECT";
	/**
	*
	* Router sends a text message from its history that was a broadcast.
	*
	* @generated from enum value: ROUTER_TEXT_BROADCAST = 9;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["ROUTER_TEXT_BROADCAST"] = 9] = "ROUTER_TEXT_BROADCAST";
	/**
	*
	* Client is an in error state.
	*
	* @generated from enum value: CLIENT_ERROR = 64;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_ERROR"] = 64] = "CLIENT_ERROR";
	/**
	*
	* Client has requested a replay from the router.
	*
	* @generated from enum value: CLIENT_HISTORY = 65;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_HISTORY"] = 65] = "CLIENT_HISTORY";
	/**
	*
	* Client has requested stats from the router.
	*
	* @generated from enum value: CLIENT_STATS = 66;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_STATS"] = 66] = "CLIENT_STATS";
	/**
	*
	* Client has requested the router respond. This can work as a
	* "are you there" message.
	*
	* @generated from enum value: CLIENT_PING = 67;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_PING"] = 67] = "CLIENT_PING";
	/**
	*
	* The response to a "Ping"
	*
	* @generated from enum value: CLIENT_PONG = 68;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_PONG"] = 68] = "CLIENT_PONG";
	/**
	*
	* Client has requested that the router abort processing the client's request
	*
	* @generated from enum value: CLIENT_ABORT = 106;
	*/ StoreAndForward_RequestResponse$1[StoreAndForward_RequestResponse$1["CLIENT_ABORT"] = 106] = "CLIENT_ABORT";
	return StoreAndForward_RequestResponse$1;
}({});
/**
* Describes the enum meshtastic.StoreAndForward.RequestResponse.
*/ const StoreAndForward_RequestResponseSchema = /* @__PURE__ */ enumDesc(file_meshtastic_storeforward, 0, 0);

//#endregion
//#region ../../node_modules/.pnpm/@jsr+meshtastic__protobufs@2.7.12-1/node_modules/@jsr/meshtastic__protobufs/mod.js
var meshtastic__protobufs_exports = {};
__export(meshtastic__protobufs_exports, {
	ATAK: () => atak_pb_exports,
	Admin: () => admin_pb_exports,
	AppOnly: () => apponly_pb_exports,
	CannedMessages: () => cannedmessages_pb_exports,
	Channel: () => channel_pb_exports,
	ClientOnly: () => clientonly_pb_exports,
	Config: () => config_pb_exports,
	ConnectionStatus: () => connection_status_pb_exports,
	LocalOnly: () => localonly_pb_exports,
	Mesh: () => mesh_pb_exports,
	ModuleConfig: () => module_config_pb_exports,
	Mqtt: () => mqtt_pb_exports,
	PaxCount: () => paxcount_pb_exports,
	Portnums: () => portnums_pb_exports,
	PowerMon: () => powermon_pb_exports,
	RemoteHardware: () => remote_hardware_pb_exports,
	Rtttl: () => rtttl_pb_exports,
	StoreForward: () => storeforward_pb_exports,
	Telemetry: () => telemetry_pb_exports,
	Xmodem: () => xmodem_pb_exports
});

//#endregion
//#region src/constants.ts
/** Broadcast destination number */
const broadcastNum = 4294967295;
/** Minimum device firmware version supported by this version of the library. */
const minFwVer = 2.2;
const Constants = {
	broadcastNum,
	minFwVer
};

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/prettyLogStyles.js
const prettyLogStyles = {
	reset: [0, 0],
	bold: [1, 22],
	dim: [2, 22],
	italic: [3, 23],
	underline: [4, 24],
	overline: [53, 55],
	inverse: [7, 27],
	hidden: [8, 28],
	strikethrough: [9, 29],
	black: [30, 39],
	red: [31, 39],
	green: [32, 39],
	yellow: [33, 39],
	blue: [34, 39],
	magenta: [35, 39],
	cyan: [36, 39],
	white: [37, 39],
	blackBright: [90, 39],
	redBright: [91, 39],
	greenBright: [92, 39],
	yellowBright: [93, 39],
	blueBright: [94, 39],
	magentaBright: [95, 39],
	cyanBright: [96, 39],
	whiteBright: [97, 39],
	bgBlack: [40, 49],
	bgRed: [41, 49],
	bgGreen: [42, 49],
	bgYellow: [43, 49],
	bgBlue: [44, 49],
	bgMagenta: [45, 49],
	bgCyan: [46, 49],
	bgWhite: [47, 49],
	bgBlackBright: [100, 49],
	bgRedBright: [101, 49],
	bgGreenBright: [102, 49],
	bgYellowBright: [103, 49],
	bgBlueBright: [104, 49],
	bgMagentaBright: [105, 49],
	bgCyanBright: [106, 49],
	bgWhiteBright: [107, 49]
};

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/formatTemplate.js
function formatTemplate(settings, template, values, hideUnsetPlaceholder = false) {
	const templateString = String(template);
	const ansiColorWrap = (placeholderValue, code) => `\u001b[${code[0]}m${placeholderValue}\u001b[${code[1]}m`;
	const styleWrap = (value, style) => {
		if (style != null && typeof style === "string") return ansiColorWrap(value, prettyLogStyles[style]);
		else if (style != null && Array.isArray(style)) return style.reduce((prevValue, thisStyle) => styleWrap(prevValue, thisStyle), value);
		else if (style != null && style[value.trim()] != null) return styleWrap(value, style[value.trim()]);
		else if (style != null && style["*"] != null) return styleWrap(value, style["*"]);
		else return value;
	};
	const defaultStyle = null;
	return templateString.replace(/{{(.+?)}}/g, (_, placeholder) => {
		const value = values[placeholder] != null ? String(values[placeholder]) : hideUnsetPlaceholder ? "" : _;
		return settings.stylePrettyLogs ? styleWrap(value, settings?.prettyLogStyles?.[placeholder] ?? defaultStyle) + ansiColorWrap("", prettyLogStyles.reset) : value;
	});
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/formatNumberAddZeros.js
function formatNumberAddZeros(value, digits = 2, addNumber = 0) {
	if (value != null && isNaN(value)) return "";
	value = value != null ? value + addNumber : value;
	return digits === 2 ? value == null ? "--" : value < 10 ? "0" + value : value.toString() : value == null ? "---" : value < 10 ? "00" + value : value < 100 ? "0" + value : value.toString();
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/urlToObj.js
function urlToObject(url) {
	return {
		href: url.href,
		protocol: url.protocol,
		username: url.username,
		password: url.password,
		host: url.host,
		hostname: url.hostname,
		port: url.port,
		pathname: url.pathname,
		search: url.search,
		searchParams: [...url.searchParams].map(([key, value]) => ({
			key,
			value
		})),
		hash: url.hash,
		origin: url.origin
	};
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/runtime/browser/helper.jsonStringifyRecursive.js
function jsonStringifyRecursive(obj) {
	const cache = new Set();
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === "object" && value !== null) {
			if (cache.has(value)) return "[Circular]";
			cache.add(value);
		}
		if (typeof value === "bigint") return `${value}`;
		return value;
	});
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/runtime/browser/util.inspect.polyfil.js
function inspect(obj, opts) {
	const ctx = {
		seen: [],
		stylize: stylizeNoColor
	};
	if (opts != null) _extend(ctx, opts);
	if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
	if (isUndefined(ctx.depth)) ctx.depth = 2;
	if (isUndefined(ctx.colors)) ctx.colors = true;
	if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
	if (ctx.colors) ctx.stylize = stylizeWithColor;
	return formatValue(ctx, obj, ctx.depth);
}
inspect.colors = prettyLogStyles;
inspect.styles = {
	special: "cyan",
	number: "yellow",
	boolean: "yellow",
	undefined: "grey",
	null: "bold",
	string: "green",
	date: "magenta",
	regexp: "red"
};
function isBoolean(arg) {
	return typeof arg === "boolean";
}
function isUndefined(arg) {
	return arg === void 0;
}
function stylizeNoColor(str) {
	return str;
}
function stylizeWithColor(str, styleType) {
	const style = inspect.styles[styleType];
	if (style != null && inspect?.colors?.[style]?.[0] != null && inspect?.colors?.[style]?.[1] != null) return "\x1B[" + inspect.colors[style][0] + "m" + str + "\x1B[" + inspect.colors[style][1] + "m";
	else return str;
}
function isFunction(arg) {
	return typeof arg === "function";
}
function isString(arg) {
	return typeof arg === "string";
}
function isNumber(arg) {
	return typeof arg === "number";
}
function isNull(arg) {
	return arg === null;
}
function hasOwn(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}
function isRegExp(re) {
	return isObject(re) && objectToString(re) === "[object RegExp]";
}
function isObject(arg) {
	return typeof arg === "object" && arg !== null;
}
function isError$1(e) {
	return isObject(e) && (objectToString(e) === "[object Error]" || e instanceof Error);
}
function isDate(d) {
	return isObject(d) && objectToString(d) === "[object Date]";
}
function objectToString(o) {
	return Object.prototype.toString.call(o);
}
function arrayToHash(array) {
	const hash = {};
	array.forEach((val) => {
		hash[val] = true;
	});
	return hash;
}
function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
	const output = [];
	for (let i = 0, l = value.length; i < l; ++i) if (hasOwn(value, String(i))) output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(i), true));
	else output.push("");
	keys.forEach((key) => {
		if (!key.match(/^\d+$/)) output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true));
	});
	return output;
}
function formatError(value) {
	return "[" + Error.prototype.toString.call(value) + "]";
}
function formatValue(ctx, value, recurseTimes = 0) {
	if (ctx.customInspect && value != null && isFunction(value) && value?.inspect !== inspect && !(value?.constructor && value?.constructor.prototype === value)) {
		if (typeof value.inspect !== "function" && value.toString != null) return value.toString();
		let ret = value?.inspect(recurseTimes, ctx);
		if (!isString(ret)) ret = formatValue(ctx, ret, recurseTimes);
		return ret;
	}
	const primitive = formatPrimitive(ctx, value);
	if (primitive) return primitive;
	let keys = Object.keys(value);
	const visibleKeys = arrayToHash(keys);
	try {
		if (ctx.showHidden && Object.getOwnPropertyNames) keys = Object.getOwnPropertyNames(value);
	} catch (e) {}
	if (isError$1(value) && (keys.indexOf("message") >= 0 || keys.indexOf("description") >= 0)) return formatError(value);
	if (keys.length === 0) if (isFunction(ctx.stylize)) {
		if (isFunction(value)) {
			const name = value.name ? ": " + value.name : "";
			return ctx.stylize("[Function" + name + "]", "special");
		}
		if (isRegExp(value)) return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
		if (isDate(value)) return ctx.stylize(Date.prototype.toISOString.call(value), "date");
		if (isError$1(value)) return formatError(value);
	} else return value;
	let base = "";
	let array = false;
	let braces = ["{\n", "\n}"];
	if (Array.isArray(value)) {
		array = true;
		braces = ["[\n", "\n]"];
	}
	if (isFunction(value)) {
		const n = value.name ? ": " + value.name : "";
		base = " [Function" + n + "]";
	}
	if (isRegExp(value)) base = " " + RegExp.prototype.toString.call(value);
	if (isDate(value)) base = " " + Date.prototype.toUTCString.call(value);
	if (isError$1(value)) base = " " + formatError(value);
	if (keys.length === 0 && (!array || value.length == 0)) return braces[0] + base + braces[1];
	if (recurseTimes < 0) if (isRegExp(value)) return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
	else return ctx.stylize("[Object]", "special");
	ctx.seen.push(value);
	let output;
	if (array) output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
	else output = keys.map((key) => {
		return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
	});
	ctx.seen.pop();
	return reduceToSingleString(output, base, braces);
}
function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
	let name, str;
	let desc = { value: void 0 };
	try {
		desc.value = value[key];
	} catch (e) {}
	try {
		if (Object.getOwnPropertyDescriptor) desc = Object.getOwnPropertyDescriptor(value, key) || desc;
	} catch (e) {}
	if (desc.get) if (desc.set) str = ctx.stylize("[Getter/Setter]", "special");
	else str = ctx.stylize("[Getter]", "special");
	else if (desc.set) str = ctx.stylize("[Setter]", "special");
	if (!hasOwn(visibleKeys, key)) name = "[" + key + "]";
	if (!str) if (ctx.seen.indexOf(desc.value) < 0) {
		if (isNull(recurseTimes)) str = formatValue(ctx, desc.value, void 0);
		else str = formatValue(ctx, desc.value, recurseTimes - 1);
		if (str.indexOf("\n") > -1) if (array) str = str.split("\n").map((line) => {
			return "  " + line;
		}).join("\n").substr(2);
		else str = "\n" + str.split("\n").map((line) => {
			return "   " + line;
		}).join("\n");
	} else str = ctx.stylize("[Circular]", "special");
	if (isUndefined(name)) {
		if (array && key.match(/^\d+$/)) return str;
		name = JSON.stringify("" + key);
		if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
			name = name.substr(1, name.length - 2);
			name = ctx.stylize(name, "name");
		} else {
			name = name.replace(/'/g, "\\'").replace(/\\"/g, "\\'").replace(/(^"|"$)/g, "'");
			name = ctx.stylize(name, "string");
		}
	}
	return name + ": " + str;
}
function formatPrimitive(ctx, value) {
	if (isUndefined(value)) return ctx.stylize("undefined", "undefined");
	if (isString(value)) {
		const simple = "'" + JSON.stringify(value).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, "\\'") + "'";
		return ctx.stylize(simple, "string");
	}
	if (isNumber(value)) return ctx.stylize("" + value, "number");
	if (isBoolean(value)) return ctx.stylize("" + value, "boolean");
	if (isNull(value)) return ctx.stylize("null", "null");
}
function reduceToSingleString(output, base, braces) {
	return braces[0] + (base === "" ? "" : base + "\n") + "  " + output.join(",\n  ") + " " + braces[1];
}
function _extend(origin, add) {
	const typedOrigin = { ...origin };
	if (!add || !isObject(add)) return origin;
	const clonedAdd = { ...add };
	const keys = Object.keys(add);
	let i = keys.length;
	while (i--) typedOrigin[keys[i]] = clonedAdd[keys[i]];
	return typedOrigin;
}
function formatWithOptions(inspectOptions, ...args) {
	const ctx = {
		seen: [],
		stylize: stylizeNoColor
	};
	if (inspectOptions != null) _extend(ctx, inspectOptions);
	const first = args[0];
	let a = 0;
	let str = "";
	let join = "";
	if (typeof first === "string") {
		if (args.length === 1) return first;
		let tempStr;
		let lastPos = 0;
		for (let i = 0; i < first.length - 1; i++) if (first.charCodeAt(i) === 37) {
			const nextChar = first.charCodeAt(++i);
			if (a + 1 !== args.length) {
				switch (nextChar) {
					case 115: {
						const tempArg = args[++a];
						if (typeof tempArg === "number") tempStr = formatPrimitive(ctx, tempArg);
						else if (typeof tempArg === "bigint") tempStr = formatPrimitive(ctx, tempArg);
						else if (typeof tempArg !== "object" || tempArg === null) tempStr = String(tempArg);
						else tempStr = inspect(tempArg, {
							...inspectOptions,
							compact: 3,
							colors: false,
							depth: 0
						});
						break;
					}
					case 106:
						tempStr = jsonStringifyRecursive(args[++a]);
						break;
					case 100: {
						const tempNum = args[++a];
						if (typeof tempNum === "bigint") tempStr = formatPrimitive(ctx, tempNum);
						else if (typeof tempNum === "symbol") tempStr = "NaN";
						else tempStr = formatPrimitive(ctx, tempNum);
						break;
					}
					case 79:
						tempStr = inspect(args[++a], inspectOptions);
						break;
					case 111:
						tempStr = inspect(args[++a], {
							...inspectOptions,
							showHidden: true,
							showProxy: true,
							depth: 4
						});
						break;
					case 105: {
						const tempInteger = args[++a];
						if (typeof tempInteger === "bigint") tempStr = formatPrimitive(ctx, tempInteger);
						else if (typeof tempInteger === "symbol") tempStr = "NaN";
						else tempStr = formatPrimitive(ctx, parseInt(tempStr));
						break;
					}
					case 102: {
						const tempFloat = args[++a];
						if (typeof tempFloat === "symbol") tempStr = "NaN";
						else tempStr = formatPrimitive(ctx, parseInt(tempFloat));
						break;
					}
					case 99:
						a += 1;
						tempStr = "";
						break;
					case 37:
						str += first.slice(lastPos, i);
						lastPos = i + 1;
						continue;
					default: continue;
				}
				if (lastPos !== i - 1) str += first.slice(lastPos, i - 1);
				str += tempStr;
				lastPos = i + 1;
			} else if (nextChar === 37) {
				str += first.slice(lastPos, i);
				lastPos = i + 1;
			}
		}
		if (lastPos !== 0) {
			a++;
			join = " ";
			if (lastPos < first.length) str += first.slice(lastPos);
		}
	}
	while (a < args.length) {
		const value = args[a];
		str += join;
		str += typeof value !== "string" ? inspect(value, inspectOptions) : value;
		join = " ";
		a++;
	}
	return str;
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/runtime/browser/index.js
var browser_default = {
	getCallerStackFrame,
	getErrorTrace,
	getMeta,
	transportJSON,
	transportFormatted,
	isBuffer,
	isError,
	prettyFormatLogObj,
	prettyFormatErrorObj
};
const meta = {
	runtime: ![typeof window, typeof document].includes("undefined") ? "Browser" : "Generic",
	browser: globalThis?.["navigator"]?.userAgent
};
const pathRegex = /(?:(?:file|https?|global code|[^@]+)@)?(?:file:)?((?:\/[^:/]+){2,})(?::(\d+))?(?::(\d+))?/;
function getMeta(logLevelId, logLevelName, stackDepthLevel, hideLogPositionForPerformance, name, parentNames) {
	return Object.assign({}, meta, {
		name,
		parentNames,
		date: new Date(),
		logLevelId,
		logLevelName,
		path: !hideLogPositionForPerformance ? getCallerStackFrame(stackDepthLevel) : void 0
	});
}
function getCallerStackFrame(stackDepthLevel, error = Error()) {
	return stackLineToStackFrame(error?.stack?.split("\n")?.filter((line) => !line.includes("Error: "))?.[stackDepthLevel]);
}
function getErrorTrace(error) {
	return (error?.stack?.split("\n") ?? [])?.filter((line) => !line.includes("Error: "))?.reduce((result, line) => {
		result.push(stackLineToStackFrame(line));
		return result;
	}, []);
}
function stackLineToStackFrame(line) {
	const href = globalThis?.location?.origin;
	const pathResult = {
		fullFilePath: void 0,
		fileName: void 0,
		fileNameWithLine: void 0,
		fileColumn: void 0,
		fileLine: void 0,
		filePath: void 0,
		filePathWithLine: void 0,
		method: void 0
	};
	if (line != null) {
		const match = line.match(pathRegex);
		if (match) {
			pathResult.filePath = match[1].replace(/\?.*$/, "");
			pathResult.fullFilePath = `${href}${pathResult.filePath}`;
			const pathParts = pathResult.filePath.split("/");
			pathResult.fileName = pathParts[pathParts.length - 1];
			pathResult.fileLine = match[2];
			pathResult.fileColumn = match[3];
			pathResult.filePathWithLine = `${pathResult.filePath}:${pathResult.fileLine}`;
			pathResult.fileNameWithLine = `${pathResult.fileName}:${pathResult.fileLine}`;
		}
	}
	return pathResult;
}
function isError(e) {
	return e instanceof Error;
}
function prettyFormatLogObj(maskedArgs, settings) {
	return maskedArgs.reduce((result, arg) => {
		isError(arg) ? result.errors.push(prettyFormatErrorObj(arg, settings)) : result.args.push(arg);
		return result;
	}, {
		args: [],
		errors: []
	});
}
function prettyFormatErrorObj(error, settings) {
	const errorStackStr = getErrorTrace(error).map((stackFrame) => {
		return formatTemplate(settings, settings.prettyErrorStackTemplate, { ...stackFrame }, true);
	});
	const placeholderValuesError = {
		errorName: ` ${error.name} `,
		errorMessage: Object.getOwnPropertyNames(error).reduce((result, key) => {
			if (key !== "stack") result.push(error[key]);
			return result;
		}, []).join(", "),
		errorStack: errorStackStr.join("\n")
	};
	return formatTemplate(settings, settings.prettyErrorTemplate, placeholderValuesError);
}
function transportFormatted(logMetaMarkup, logArgs, logErrors, settings) {
	const logErrorsStr = (logErrors.length > 0 && logArgs.length > 0 ? "\n" : "") + logErrors.join("\n");
	settings.prettyInspectOptions.colors = settings.stylePrettyLogs;
	console.log(logMetaMarkup + formatWithOptions(settings.prettyInspectOptions, ...logArgs) + logErrorsStr);
}
function transportJSON(json) {
	console.log(jsonStringifyRecursive(json));
}
function isBuffer(arg) {
	return arg ? false : false;
}

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/BaseLogger.js
var BaseLogger = class {
	constructor(settings, logObj, stackDepthLevel = 4) {
		this.logObj = logObj;
		this.stackDepthLevel = stackDepthLevel;
		this.runtime = browser_default;
		this.settings = {
			type: settings?.type ?? "pretty",
			name: settings?.name,
			parentNames: settings?.parentNames,
			minLevel: settings?.minLevel ?? 0,
			argumentsArrayName: settings?.argumentsArrayName,
			hideLogPositionForProduction: settings?.hideLogPositionForProduction ?? false,
			prettyLogTemplate: settings?.prettyLogTemplate ?? "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}	{{logLevelName}}	{{filePathWithLine}}{{nameWithDelimiterPrefix}}	",
			prettyErrorTemplate: settings?.prettyErrorTemplate ?? "\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}",
			prettyErrorStackTemplate: settings?.prettyErrorStackTemplate ?? "  • {{fileName}}	{{method}}\n	{{filePathWithLine}}",
			prettyErrorParentNamesSeparator: settings?.prettyErrorParentNamesSeparator ?? ":",
			prettyErrorLoggerNameDelimiter: settings?.prettyErrorLoggerNameDelimiter ?? "	",
			stylePrettyLogs: settings?.stylePrettyLogs ?? true,
			prettyLogTimeZone: settings?.prettyLogTimeZone ?? "UTC",
			prettyLogStyles: settings?.prettyLogStyles ?? {
				logLevelName: {
					"*": [
						"bold",
						"black",
						"bgWhiteBright",
						"dim"
					],
					SILLY: ["bold", "white"],
					TRACE: ["bold", "whiteBright"],
					DEBUG: ["bold", "green"],
					INFO: ["bold", "blue"],
					WARN: ["bold", "yellow"],
					ERROR: ["bold", "red"],
					FATAL: ["bold", "redBright"]
				},
				dateIsoStr: "white",
				filePathWithLine: "white",
				name: ["white", "bold"],
				nameWithDelimiterPrefix: ["white", "bold"],
				nameWithDelimiterSuffix: ["white", "bold"],
				errorName: [
					"bold",
					"bgRedBright",
					"whiteBright"
				],
				fileName: ["yellow"],
				fileNameWithLine: "white"
			},
			prettyInspectOptions: settings?.prettyInspectOptions ?? {
				colors: true,
				compact: false,
				depth: Infinity
			},
			metaProperty: settings?.metaProperty ?? "_meta",
			maskPlaceholder: settings?.maskPlaceholder ?? "[***]",
			maskValuesOfKeys: settings?.maskValuesOfKeys ?? ["password"],
			maskValuesOfKeysCaseInsensitive: settings?.maskValuesOfKeysCaseInsensitive ?? false,
			maskValuesRegEx: settings?.maskValuesRegEx,
			prefix: [...settings?.prefix ?? []],
			attachedTransports: [...settings?.attachedTransports ?? []],
			overwrite: {
				mask: settings?.overwrite?.mask,
				toLogObj: settings?.overwrite?.toLogObj,
				addMeta: settings?.overwrite?.addMeta,
				addPlaceholders: settings?.overwrite?.addPlaceholders,
				formatMeta: settings?.overwrite?.formatMeta,
				formatLogObj: settings?.overwrite?.formatLogObj,
				transportFormatted: settings?.overwrite?.transportFormatted,
				transportJSON: settings?.overwrite?.transportJSON
			}
		};
	}
	log(logLevelId, logLevelName, ...args) {
		if (logLevelId < this.settings.minLevel) return;
		const logArgs = [...this.settings.prefix, ...args];
		const maskedArgs = this.settings.overwrite?.mask != null ? this.settings.overwrite?.mask(logArgs) : this.settings.maskValuesOfKeys != null && this.settings.maskValuesOfKeys.length > 0 ? this._mask(logArgs) : logArgs;
		const thisLogObj = this.logObj != null ? this._recursiveCloneAndExecuteFunctions(this.logObj) : void 0;
		const logObj = this.settings.overwrite?.toLogObj != null ? this.settings.overwrite?.toLogObj(maskedArgs, thisLogObj) : this._toLogObj(maskedArgs, thisLogObj);
		const logObjWithMeta = this.settings.overwrite?.addMeta != null ? this.settings.overwrite?.addMeta(logObj, logLevelId, logLevelName) : this._addMetaToLogObj(logObj, logLevelId, logLevelName);
		let logMetaMarkup;
		let logArgsAndErrorsMarkup = void 0;
		if (this.settings.overwrite?.formatMeta != null) logMetaMarkup = this.settings.overwrite?.formatMeta(logObjWithMeta?.[this.settings.metaProperty]);
		if (this.settings.overwrite?.formatLogObj != null) logArgsAndErrorsMarkup = this.settings.overwrite?.formatLogObj(maskedArgs, this.settings);
		if (this.settings.type === "pretty") {
			logMetaMarkup = logMetaMarkup ?? this._prettyFormatLogObjMeta(logObjWithMeta?.[this.settings.metaProperty]);
			logArgsAndErrorsMarkup = logArgsAndErrorsMarkup ?? this.runtime.prettyFormatLogObj(maskedArgs, this.settings);
		}
		if (logMetaMarkup != null && logArgsAndErrorsMarkup != null) this.settings.overwrite?.transportFormatted != null ? this.settings.overwrite?.transportFormatted(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, this.settings) : this.runtime.transportFormatted(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, this.settings);
		else this.settings.overwrite?.transportJSON != null ? this.settings.overwrite?.transportJSON(logObjWithMeta) : this.settings.type !== "hidden" && this.runtime.transportJSON(logObjWithMeta);
		if (this.settings.attachedTransports != null && this.settings.attachedTransports.length > 0) this.settings.attachedTransports.forEach((transportLogger) => {
			transportLogger(logObjWithMeta);
		});
		return logObjWithMeta;
	}
	attachTransport(transportLogger) {
		this.settings.attachedTransports.push(transportLogger);
	}
	getSubLogger(settings, logObj) {
		const subLoggerSettings = {
			...this.settings,
			...settings,
			parentNames: this.settings?.parentNames != null && this.settings?.name != null ? [...this.settings.parentNames, this.settings.name] : this.settings?.name != null ? [this.settings.name] : void 0,
			prefix: [...this.settings.prefix, ...settings?.prefix ?? []]
		};
		const subLogger = new this.constructor(subLoggerSettings, logObj ?? this.logObj, this.stackDepthLevel);
		return subLogger;
	}
	_mask(args) {
		const maskValuesOfKeys = this.settings.maskValuesOfKeysCaseInsensitive !== true ? this.settings.maskValuesOfKeys : this.settings.maskValuesOfKeys.map((key) => key.toLowerCase());
		return args?.map((arg) => {
			return this._recursiveCloneAndMaskValuesOfKeys(arg, maskValuesOfKeys);
		});
	}
	_recursiveCloneAndMaskValuesOfKeys(source, keys, seen = []) {
		if (seen.includes(source)) return { ...source };
		if (typeof source === "object" && source !== null) seen.push(source);
		if (this.runtime.isError(source) || this.runtime.isBuffer(source)) return source;
		else if (source instanceof Map) return new Map(source);
		else if (source instanceof Set) return new Set(source);
		else if (Array.isArray(source)) return source.map((item) => this._recursiveCloneAndMaskValuesOfKeys(item, keys, seen));
		else if (source instanceof Date) return new Date(source.getTime());
		else if (source instanceof URL) return urlToObject(source);
		else if (source !== null && typeof source === "object") {
			const baseObject = this.runtime.isError(source) ? this._cloneError(source) : Object.create(Object.getPrototypeOf(source));
			return Object.getOwnPropertyNames(source).reduce((o, prop) => {
				o[prop] = keys.includes(this.settings?.maskValuesOfKeysCaseInsensitive !== true ? prop : prop.toLowerCase()) ? this.settings.maskPlaceholder : (() => {
					try {
						return this._recursiveCloneAndMaskValuesOfKeys(source[prop], keys, seen);
					} catch (e) {
						return null;
					}
				})();
				return o;
			}, baseObject);
		} else {
			if (typeof source === "string") {
				let modifiedSource = source;
				for (const regEx of this.settings?.maskValuesRegEx || []) modifiedSource = modifiedSource.replace(regEx, this.settings?.maskPlaceholder || "");
				return modifiedSource;
			}
			return source;
		}
	}
	_recursiveCloneAndExecuteFunctions(source, seen = []) {
		if (this.isObjectOrArray(source) && seen.includes(source)) return this.shallowCopy(source);
		if (this.isObjectOrArray(source)) seen.push(source);
		if (Array.isArray(source)) return source.map((item) => this._recursiveCloneAndExecuteFunctions(item, seen));
		else if (source instanceof Date) return new Date(source.getTime());
		else if (this.isObject(source)) return Object.getOwnPropertyNames(source).reduce((o, prop) => {
			const descriptor = Object.getOwnPropertyDescriptor(source, prop);
			if (descriptor) {
				Object.defineProperty(o, prop, descriptor);
				const value = source[prop];
				o[prop] = typeof value === "function" ? value() : this._recursiveCloneAndExecuteFunctions(value, seen);
			}
			return o;
		}, Object.create(Object.getPrototypeOf(source)));
		else return source;
	}
	isObjectOrArray(value) {
		return typeof value === "object" && value !== null;
	}
	isObject(value) {
		return typeof value === "object" && !Array.isArray(value) && value !== null;
	}
	shallowCopy(source) {
		if (Array.isArray(source)) return [...source];
		else return { ...source };
	}
	_toLogObj(args, clonedLogObj = {}) {
		args = args?.map((arg) => this.runtime.isError(arg) ? this._toErrorObject(arg) : arg);
		if (this.settings.argumentsArrayName == null) if (args.length === 1 && !Array.isArray(args[0]) && this.runtime.isBuffer(args[0]) !== true && !(args[0] instanceof Date)) clonedLogObj = typeof args[0] === "object" && args[0] != null ? {
			...args[0],
			...clonedLogObj
		} : {
			0: args[0],
			...clonedLogObj
		};
		else clonedLogObj = {
			...clonedLogObj,
			...args
		};
		else clonedLogObj = {
			...clonedLogObj,
			[this.settings.argumentsArrayName]: args
		};
		return clonedLogObj;
	}
	_cloneError(error) {
		const cloned = new error.constructor();
		Object.getOwnPropertyNames(error).forEach((key) => {
			cloned[key] = error[key];
		});
		return cloned;
	}
	_toErrorObject(error) {
		return {
			nativeError: error,
			name: error.name ?? "Error",
			message: error.message,
			stack: this.runtime.getErrorTrace(error)
		};
	}
	_addMetaToLogObj(logObj, logLevelId, logLevelName) {
		return {
			...logObj,
			[this.settings.metaProperty]: this.runtime.getMeta(logLevelId, logLevelName, this.stackDepthLevel, this.settings.hideLogPositionForProduction, this.settings.name, this.settings.parentNames)
		};
	}
	_prettyFormatLogObjMeta(logObjMeta) {
		if (logObjMeta == null) return "";
		let template = this.settings.prettyLogTemplate;
		const placeholderValues = {};
		if (template.includes("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}")) template = template.replace("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}", "{{dateIsoStr}}");
		else if (this.settings.prettyLogTimeZone === "UTC") {
			placeholderValues["yyyy"] = logObjMeta?.date?.getUTCFullYear() ?? "----";
			placeholderValues["mm"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMonth(), 2, 1);
			placeholderValues["dd"] = formatNumberAddZeros(logObjMeta?.date?.getUTCDate(), 2);
			placeholderValues["hh"] = formatNumberAddZeros(logObjMeta?.date?.getUTCHours(), 2);
			placeholderValues["MM"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMinutes(), 2);
			placeholderValues["ss"] = formatNumberAddZeros(logObjMeta?.date?.getUTCSeconds(), 2);
			placeholderValues["ms"] = formatNumberAddZeros(logObjMeta?.date?.getUTCMilliseconds(), 3);
		} else {
			placeholderValues["yyyy"] = logObjMeta?.date?.getFullYear() ?? "----";
			placeholderValues["mm"] = formatNumberAddZeros(logObjMeta?.date?.getMonth(), 2, 1);
			placeholderValues["dd"] = formatNumberAddZeros(logObjMeta?.date?.getDate(), 2);
			placeholderValues["hh"] = formatNumberAddZeros(logObjMeta?.date?.getHours(), 2);
			placeholderValues["MM"] = formatNumberAddZeros(logObjMeta?.date?.getMinutes(), 2);
			placeholderValues["ss"] = formatNumberAddZeros(logObjMeta?.date?.getSeconds(), 2);
			placeholderValues["ms"] = formatNumberAddZeros(logObjMeta?.date?.getMilliseconds(), 3);
		}
		const dateInSettingsTimeZone = this.settings.prettyLogTimeZone === "UTC" ? logObjMeta?.date : new Date(logObjMeta?.date?.getTime() - logObjMeta?.date?.getTimezoneOffset() * 6e4);
		placeholderValues["rawIsoStr"] = dateInSettingsTimeZone?.toISOString();
		placeholderValues["dateIsoStr"] = dateInSettingsTimeZone?.toISOString().replace("T", " ").replace("Z", "");
		placeholderValues["logLevelName"] = logObjMeta?.logLevelName;
		placeholderValues["fileNameWithLine"] = logObjMeta?.path?.fileNameWithLine ?? "";
		placeholderValues["filePathWithLine"] = logObjMeta?.path?.filePathWithLine ?? "";
		placeholderValues["fullFilePath"] = logObjMeta?.path?.fullFilePath ?? "";
		let parentNamesString = this.settings.parentNames?.join(this.settings.prettyErrorParentNamesSeparator);
		parentNamesString = parentNamesString != null && logObjMeta?.name != null ? parentNamesString + this.settings.prettyErrorParentNamesSeparator : void 0;
		placeholderValues["name"] = logObjMeta?.name != null || parentNamesString != null ? (parentNamesString ?? "") + logObjMeta?.name ?? "" : "";
		placeholderValues["nameWithDelimiterPrefix"] = placeholderValues["name"].length > 0 ? this.settings.prettyErrorLoggerNameDelimiter + placeholderValues["name"] : "";
		placeholderValues["nameWithDelimiterSuffix"] = placeholderValues["name"].length > 0 ? placeholderValues["name"] + this.settings.prettyErrorLoggerNameDelimiter : "";
		if (this.settings.overwrite?.addPlaceholders != null) this.settings.overwrite?.addPlaceholders(logObjMeta, placeholderValues);
		return formatTemplate(this.settings, template, placeholderValues);
	}
};

//#endregion
//#region ../../node_modules/.pnpm/tslog@4.9.3/node_modules/tslog/dist/esm/index.js
var Logger = class extends BaseLogger {
	constructor(settings, logObj) {
		const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
		const isBrowserBlinkEngine = isBrowser ? window.chrome !== void 0 && window.CSS !== void 0 && window.CSS.supports("color", "green") : false;
		const isSafari = isBrowser ? /^((?!chrome|android).)*safari/i.test(navigator.userAgent) : false;
		settings = settings || {};
		settings.stylePrettyLogs = settings.stylePrettyLogs && isBrowser && !isBrowserBlinkEngine ? false : settings.stylePrettyLogs;
		super(settings, logObj, isSafari ? 4 : 5);
	}
	log(logLevelId, logLevelName, ...args) {
		return super.log(logLevelId, logLevelName, ...args);
	}
	silly(...args) {
		return super.log(0, "SILLY", ...args);
	}
	trace(...args) {
		return super.log(1, "TRACE", ...args);
	}
	debug(...args) {
		return super.log(2, "DEBUG", ...args);
	}
	info(...args) {
		return super.log(3, "INFO", ...args);
	}
	warn(...args) {
		return super.log(4, "WARN", ...args);
	}
	error(...args) {
		return super.log(5, "ERROR", ...args);
	}
	fatal(...args) {
		return super.log(6, "FATAL", ...args);
	}
	getSubLogger(settings, logObj) {
		return super.getSubLogger(settings, logObj);
	}
};

//#endregion
//#region src/types.ts
var types_exports = {};
__export(types_exports, {
	ChannelNumber: () => ChannelNumber,
	DeviceStatusEnum: () => DeviceStatusEnum,
	Emitter: () => Emitter,
	EmitterScope: () => EmitterScope
});
let DeviceStatusEnum = /* @__PURE__ */ function(DeviceStatusEnum$1) {
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceRestarting"] = 1] = "DeviceRestarting";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceDisconnected"] = 2] = "DeviceDisconnected";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceConnecting"] = 3] = "DeviceConnecting";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceReconnecting"] = 4] = "DeviceReconnecting";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceConnected"] = 5] = "DeviceConnected";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceConfiguring"] = 6] = "DeviceConfiguring";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceConfigured"] = 7] = "DeviceConfigured";
	DeviceStatusEnum$1[DeviceStatusEnum$1["DeviceError"] = 8] = "DeviceError";
	return DeviceStatusEnum$1;
}({});
let EmitterScope = /* @__PURE__ */ function(EmitterScope$1) {
	EmitterScope$1[EmitterScope$1["MeshDevice"] = 1] = "MeshDevice";
	EmitterScope$1[EmitterScope$1["SerialConnection"] = 2] = "SerialConnection";
	EmitterScope$1[EmitterScope$1["NodeSerialConnection"] = 3] = "NodeSerialConnection";
	EmitterScope$1[EmitterScope$1["BleConnection"] = 4] = "BleConnection";
	EmitterScope$1[EmitterScope$1["HttpConnection"] = 5] = "HttpConnection";
	return EmitterScope$1;
}({});
let Emitter = /* @__PURE__ */ function(Emitter$1) {
	Emitter$1[Emitter$1["Constructor"] = 0] = "Constructor";
	Emitter$1[Emitter$1["SendText"] = 1] = "SendText";
	Emitter$1[Emitter$1["SendWaypoint"] = 2] = "SendWaypoint";
	Emitter$1[Emitter$1["SendPacket"] = 3] = "SendPacket";
	Emitter$1[Emitter$1["SendRaw"] = 4] = "SendRaw";
	Emitter$1[Emitter$1["SetConfig"] = 5] = "SetConfig";
	Emitter$1[Emitter$1["SetModuleConfig"] = 6] = "SetModuleConfig";
	Emitter$1[Emitter$1["ConfirmSetConfig"] = 7] = "ConfirmSetConfig";
	Emitter$1[Emitter$1["SetOwner"] = 8] = "SetOwner";
	Emitter$1[Emitter$1["SetChannel"] = 9] = "SetChannel";
	Emitter$1[Emitter$1["ConfirmSetChannel"] = 10] = "ConfirmSetChannel";
	Emitter$1[Emitter$1["ClearChannel"] = 11] = "ClearChannel";
	Emitter$1[Emitter$1["GetChannel"] = 12] = "GetChannel";
	Emitter$1[Emitter$1["GetAllChannels"] = 13] = "GetAllChannels";
	Emitter$1[Emitter$1["GetConfig"] = 14] = "GetConfig";
	Emitter$1[Emitter$1["GetModuleConfig"] = 15] = "GetModuleConfig";
	Emitter$1[Emitter$1["GetOwner"] = 16] = "GetOwner";
	Emitter$1[Emitter$1["Configure"] = 17] = "Configure";
	Emitter$1[Emitter$1["HandleFromRadio"] = 18] = "HandleFromRadio";
	Emitter$1[Emitter$1["HandleMeshPacket"] = 19] = "HandleMeshPacket";
	Emitter$1[Emitter$1["Connect"] = 20] = "Connect";
	Emitter$1[Emitter$1["Ping"] = 21] = "Ping";
	Emitter$1[Emitter$1["ReadFromRadio"] = 22] = "ReadFromRadio";
	Emitter$1[Emitter$1["WriteToRadio"] = 23] = "WriteToRadio";
	Emitter$1[Emitter$1["SetDebugMode"] = 24] = "SetDebugMode";
	Emitter$1[Emitter$1["GetMetadata"] = 25] = "GetMetadata";
	Emitter$1[Emitter$1["ResetNodes"] = 26] = "ResetNodes";
	Emitter$1[Emitter$1["Shutdown"] = 27] = "Shutdown";
	Emitter$1[Emitter$1["Reboot"] = 28] = "Reboot";
	Emitter$1[Emitter$1["RebootOta"] = 29] = "RebootOta";
	Emitter$1[Emitter$1["FactoryReset"] = 30] = "FactoryReset";
	Emitter$1[Emitter$1["EnterDfuMode"] = 31] = "EnterDfuMode";
	Emitter$1[Emitter$1["RemoveNodeByNum"] = 32] = "RemoveNodeByNum";
	Emitter$1[Emitter$1["SetCannedMessages"] = 33] = "SetCannedMessages";
	Emitter$1[Emitter$1["Disconnect"] = 34] = "Disconnect";
	Emitter$1[Emitter$1["ConnectionStatus"] = 35] = "ConnectionStatus";
	return Emitter$1;
}({});
let ChannelNumber = /* @__PURE__ */ function(ChannelNumber$1) {
	ChannelNumber$1[ChannelNumber$1["Primary"] = 0] = "Primary";
	ChannelNumber$1[ChannelNumber$1["Channel1"] = 1] = "Channel1";
	ChannelNumber$1[ChannelNumber$1["Channel2"] = 2] = "Channel2";
	ChannelNumber$1[ChannelNumber$1["Channel3"] = 3] = "Channel3";
	ChannelNumber$1[ChannelNumber$1["Channel4"] = 4] = "Channel4";
	ChannelNumber$1[ChannelNumber$1["Channel5"] = 5] = "Channel5";
	ChannelNumber$1[ChannelNumber$1["Channel6"] = 6] = "Channel6";
	ChannelNumber$1[ChannelNumber$1["Admin"] = 7] = "Admin";
	return ChannelNumber$1;
}({});

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatcherWrapper.js
var require_DispatcherWrapper = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatcherWrapper.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DispatcherWrapper = void 0;
	/**
	* Hides the implementation of the event dispatcher. Will expose methods that
	* are relevent to the event.
	*
	* @export
	* @class DispatcherWrapper
	* @implements {ISubscribable<TEventHandler>}
	* @template TEventHandler The type of event handler.
	*/
	var DispatcherWrapper = class {
		/**
		* Creates an instance of DispatcherWrapper.
		* @param {ISubscribable<TEventHandler>} dispatcher
		*
		* @memberOf DispatcherWrapper
		*/
		constructor(dispatcher) {
			this._subscribe = (fn) => dispatcher.subscribe(fn);
			this._unsubscribe = (fn) => dispatcher.unsubscribe(fn);
			this._one = (fn) => dispatcher.one(fn);
			this._has = (fn) => dispatcher.has(fn);
			this._clear = () => dispatcher.clear();
			this._count = () => dispatcher.count;
			this._onSubscriptionChange = () => dispatcher.onSubscriptionChange;
		}
		/**
		* Triggered when subscriptions are changed (added or removed).
		*
		* @readonly
		* @type {ISubscribable<SubscriptionChangeEventHandler>}
		* @memberOf DispatcherWrapper
		*/
		get onSubscriptionChange() {
			return this._onSubscriptionChange();
		}
		/**
		* Returns the number of subscriptions.
		*
		* @readonly
		* @type {number}
		* @memberOf DispatcherWrapper
		*/
		get count() {
			return this._count();
		}
		/**
		* Subscribe to the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		* @returns {() => void} A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherWrapper
		*/
		subscribe(fn) {
			return this._subscribe(fn);
		}
		/**
		* Subscribe to the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		* @returns {() => void} A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherWrapper
		*/
		sub(fn) {
			return this.subscribe(fn);
		}
		/**
		* Unsubscribe from the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		*
		* @memberOf DispatcherWrapper
		*/
		unsubscribe(fn) {
			this._unsubscribe(fn);
		}
		/**
		* Unsubscribe from the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		*
		* @memberOf DispatcherWrapper
		*/
		unsub(fn) {
			this.unsubscribe(fn);
		}
		/**
		* Subscribe once to the event with the specified name.
		*
		* @returns {() => void} A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherWrapper
		*/
		one(fn) {
			return this._one(fn);
		}
		/**
		* Checks it the event has a subscription for the specified handler.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		*
		* @memberOf DispatcherWrapper
		*/
		has(fn) {
			return this._has(fn);
		}
		/**
		* Clears all the subscriptions.
		*
		* @memberOf DispatcherWrapper
		*/
		clear() {
			this._clear();
		}
	};
	exports.DispatcherWrapper = DispatcherWrapper;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/events/Subscription.js
var require_Subscription = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/events/Subscription.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.Subscription = void 0;
	/**
	* Stores a handler. Manages execution meta data.
	* @class Subscription
	* @template TEventHandler
	*/
	var Subscription = class {
		/**
		* Creates an instance of Subscription.
		*
		* @param {TEventHandler} handler The handler for the subscription.
		* @param {boolean} isOnce Indicates if the handler should only be executed once.
		*/
		constructor(handler, isOnce) {
			this.handler = handler;
			this.isOnce = isOnce;
			/**
			* Indicates if the subscription has been executed before.
			*/
			this.isExecuted = false;
		}
		/**
		* Executes the handler.
		*
		* @param {boolean} executeAsync True if the even should be executed async.
		* @param {*} scope The scope the scope of the event.
		* @param {IArguments} args The arguments for the event.
		*/
		execute(executeAsync, scope, args) {
			if (!this.isOnce || !this.isExecuted) {
				this.isExecuted = true;
				var fn = this.handler;
				if (executeAsync) setTimeout(() => {
					fn.apply(scope, args);
				}, 1);
				else fn.apply(scope, args);
			}
		}
	};
	exports.Subscription = Subscription;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/management/EventManagement.js
var require_EventManagement = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/management/EventManagement.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EventManagement = void 0;
	/**
	* Allows the user to interact with the event.
	*
	* @export
	* @class EventManagement
	* @implements {IEventManagement}
	*/
	var EventManagement = class {
		/**
		* Creates an instance of EventManagement.
		* @param {() => void} unsub An unsubscribe handler.
		*
		* @memberOf EventManagement
		*/
		constructor(unsub) {
			this.unsub = unsub;
			this.propagationStopped = false;
		}
		/**
		* Stops the propagation of the event.
		* Cannot be used when async dispatch is done.
		*
		* @memberOf EventManagement
		*/
		stopPropagation() {
			this.propagationStopped = true;
		}
	};
	exports.EventManagement = EventManagement;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatcherBase.js
var require_DispatcherBase = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatcherBase.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SubscriptionChangeEventDispatcher = exports.DispatcherBase = void 0;
	const DispatcherWrapper_1$1 = require_DispatcherWrapper();
	const Subscription_1$1 = require_Subscription();
	const EventManagement_1$2 = require_EventManagement();
	/**
	* Base class for implementation of the dispatcher. It facilitates the subscribe
	* and unsubscribe methods based on generic handlers. The TEventType specifies
	* the type of event that should be exposed. Use the asEvent to expose the
	* dispatcher as event.
	*
	* @export
	* @abstract
	* @class DispatcherBase
	* @implements {ISubscribable<TEventHandler>}
	* @template TEventHandler The type of event handler.
	*/
	var DispatcherBase = class {
		constructor() {
			/**
			* The subscriptions.
			*
			* @protected
			*
			* @memberOf DispatcherBase
			*/
			this._subscriptions = new Array();
		}
		/**
		* Returns the number of subscriptions.
		*
		* @readonly
		* @type {number}
		* @memberOf DispatcherBase
		*/
		get count() {
			return this._subscriptions.length;
		}
		/**
		* Triggered when subscriptions are changed (added or removed).
		*
		* @readonly
		* @type {ISubscribable<SubscriptionChangeEventHandler>}
		* @memberOf DispatcherBase
		*/
		get onSubscriptionChange() {
			if (this._onSubscriptionChange == null) this._onSubscriptionChange = new SubscriptionChangeEventDispatcher();
			return this._onSubscriptionChange.asEvent();
		}
		/**
		* Subscribe to the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		* @returns A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherBase
		*/
		subscribe(fn) {
			if (fn) {
				this._subscriptions.push(this.createSubscription(fn, false));
				this.triggerSubscriptionChange();
			}
			return () => {
				this.unsubscribe(fn);
			};
		}
		/**
		* Subscribe to the event dispatcher.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		* @returns A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherBase
		*/
		sub(fn) {
			return this.subscribe(fn);
		}
		/**
		* Subscribe once to the event with the specified name.
		*
		* @param {TEventHandler} fn The event handler that is called when the event is dispatched.
		* @returns A function that unsubscribes the event handler from the event.
		*
		* @memberOf DispatcherBase
		*/
		one(fn) {
			if (fn) {
				this._subscriptions.push(this.createSubscription(fn, true));
				this.triggerSubscriptionChange();
			}
			return () => {
				this.unsubscribe(fn);
			};
		}
		/**
		* Checks it the event has a subscription for the specified handler.
		*
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf DispatcherBase
		*/
		has(fn) {
			if (!fn) return false;
			return this._subscriptions.some((sub) => sub.handler == fn);
		}
		/**
		* Unsubscribes the handler from the dispatcher.
		*
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf DispatcherBase
		*/
		unsubscribe(fn) {
			if (!fn) return;
			let changes = false;
			for (let i = 0; i < this._subscriptions.length; i++) if (this._subscriptions[i].handler == fn) {
				this._subscriptions.splice(i, 1);
				changes = true;
				break;
			}
			if (changes) this.triggerSubscriptionChange();
		}
		/**
		* Unsubscribes the handler from the dispatcher.
		*
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf DispatcherBase
		*/
		unsub(fn) {
			this.unsubscribe(fn);
		}
		/**
		* Generic dispatch will dispatch the handlers with the given arguments.
		*
		* @protected
		* @param {boolean} executeAsync `True` if the even should be executed async.
		* @param {*} scope The scope of the event. The scope becomes the `this` for handler.
		* @param {IArguments} args The arguments for the event.
		* @returns {(IPropagationStatus | null)} The propagation status, or if an `executeAsync` is used `null`.
		*
		* @memberOf DispatcherBase
		*/
		_dispatch(executeAsync, scope, args) {
			for (let sub of [...this._subscriptions]) {
				let ev = new EventManagement_1$2.EventManagement(() => this.unsub(sub.handler));
				let nargs = Array.prototype.slice.call(args);
				nargs.push(ev);
				let s = sub;
				s.execute(executeAsync, scope, nargs);
				this.cleanup(sub);
				if (!executeAsync && ev.propagationStopped) return { propagationStopped: true };
			}
			if (executeAsync) return null;
			return { propagationStopped: false };
		}
		/**
		* Creates a subscription.
		*
		* @protected
		* @param {TEventHandler} handler The handler.
		* @param {boolean} isOnce True if the handler should run only one.
		* @returns {ISubscription<TEventHandler>} The subscription.
		*
		* @memberOf DispatcherBase
		*/
		createSubscription(handler, isOnce) {
			return new Subscription_1$1.Subscription(handler, isOnce);
		}
		/**
		* Cleans up subs that ran and should run only once.
		*
		* @protected
		* @param {ISubscription<TEventHandler>} sub The subscription.
		*
		* @memberOf DispatcherBase
		*/
		cleanup(sub) {
			let changes = false;
			if (sub.isOnce && sub.isExecuted) {
				let i = this._subscriptions.indexOf(sub);
				if (i > -1) {
					this._subscriptions.splice(i, 1);
					changes = true;
				}
			}
			if (changes) this.triggerSubscriptionChange();
		}
		/**
		* Creates an event from the dispatcher. Will return the dispatcher
		* in a wrapper. This will prevent exposure of any dispatcher methods.
		*
		* @returns {ISubscribable<TEventHandler>}
		*
		* @memberOf DispatcherBase
		*/
		asEvent() {
			if (this._wrap == null) this._wrap = new DispatcherWrapper_1$1.DispatcherWrapper(this);
			return this._wrap;
		}
		/**
		* Clears the subscriptions.
		*
		* @memberOf DispatcherBase
		*/
		clear() {
			if (this._subscriptions.length != 0) {
				this._subscriptions.splice(0, this._subscriptions.length);
				this.triggerSubscriptionChange();
			}
		}
		/**
		* Triggers the subscription change event.
		*
		* @private
		*
		* @memberOf DispatcherBase
		*/
		triggerSubscriptionChange() {
			if (this._onSubscriptionChange != null) this._onSubscriptionChange.dispatch(this.count);
		}
	};
	exports.DispatcherBase = DispatcherBase;
	/**
	* Dispatcher for subscription changes.
	*
	* @export
	* @class SubscriptionChangeEventDispatcher
	* @extends {DispatcherBase<SubscriptionChangeEventHandler>}
	*/
	var SubscriptionChangeEventDispatcher = class extends DispatcherBase {
		/**
		* Dispatches the event.
		*
		* @param {number} count The currrent number of subscriptions.
		*
		* @memberOf SubscriptionChangeEventDispatcher
		*/
		dispatch(count) {
			this._dispatch(false, this, arguments);
		}
	};
	exports.SubscriptionChangeEventDispatcher = SubscriptionChangeEventDispatcher;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatchError.js
var require_DispatchError = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/DispatchError.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.DispatchError = void 0;
	/**
	* Indicates an error with dispatching.
	*
	* @export
	* @class DispatchError
	* @extends {Error}
	*/
	var DispatchError = class extends Error {
		/**
		* Creates an instance of DispatchError.
		* @param {string} message The message.
		*
		* @memberOf DispatchError
		*/
		constructor(message) {
			super(message);
		}
	};
	exports.DispatchError = DispatchError;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/EventListBase.js
var require_EventListBase = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/EventListBase.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.EventListBase = void 0;
	/**
	* Base class for event lists classes. Implements the get and remove.
	*
	* @export
	* @abstract
	* @class EventListBaset
	* @template TEventDispatcher The type of event dispatcher.
	*/
	var EventListBase = class {
		constructor() {
			this._events = {};
		}
		/**
		* Gets the dispatcher associated with the name.
		*
		* @param {string} name The name of the event.
		* @returns {TEventDispatcher} The disptacher.
		*
		* @memberOf EventListBase
		*/
		get(name) {
			let event = this._events[name];
			if (event) return event;
			event = this.createDispatcher();
			this._events[name] = event;
			return event;
		}
		/**
		* Removes the dispatcher associated with the name.
		*
		* @param {string} name
		*
		* @memberOf EventListBase
		*/
		remove(name) {
			delete this._events[name];
		}
	};
	exports.EventListBase = EventListBase;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/handling/HandlingBase.js
var require_HandlingBase = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/handling/HandlingBase.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.HandlingBase = void 0;
	/**
	* Base class that implements event handling. With a an
	* event list this base class will expose events that can be
	* subscribed to. This will give your class generic events.
	*
	* @export
	* @abstract
	* @class HandlingBase
	* @template TEventHandler The type of event handler.
	* @template TDispatcher The type of dispatcher.
	* @template TList The type of event list.
	*/
	var HandlingBase = class {
		/**
		* Creates an instance of HandlingBase.
		* @param {TList} events The event list. Used for event management.
		*
		* @memberOf HandlingBase
		*/
		constructor(events) {
			this.events = events;
		}
		/**
		* Subscribes once to the event with the specified name.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		one(name, fn) {
			this.events.get(name).one(fn);
		}
		/**
		* Checks it the event has a subscription for the specified handler.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		has(name, fn) {
			return this.events.get(name).has(fn);
		}
		/**
		* Subscribes to the event with the specified name.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		subscribe(name, fn) {
			this.events.get(name).subscribe(fn);
		}
		/**
		* Subscribes to the event with the specified name.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		sub(name, fn) {
			this.subscribe(name, fn);
		}
		/**
		* Unsubscribes from the event with the specified name.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		unsubscribe(name, fn) {
			this.events.get(name).unsubscribe(fn);
		}
		/**
		* Unsubscribes from the event with the specified name.
		* @param {string} name The name of the event.
		* @param {TEventHandler} fn The event handler.
		*
		* @memberOf HandlingBase
		*/
		unsub(name, fn) {
			this.unsubscribe(name, fn);
		}
	};
	exports.HandlingBase = HandlingBase;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/events/PromiseSubscription.js
var require_PromiseSubscription = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/events/PromiseSubscription.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PromiseSubscription = void 0;
	/**
	* Subscription implementation for events with promises.
	*
	* @export
	* @class PromiseSubscription
	* @implements {ISubscription<TEventHandler>}
	* @template TEventHandler The type of event handler.
	*/
	var PromiseSubscription = class {
		/**
		* Creates an instance of PromiseSubscription.
		* @param {TEventHandler} handler The handler for the subscription.
		* @param {boolean} isOnce Indicates if the handler should only be executed once.
		*
		* @memberOf PromiseSubscription
		*/
		constructor(handler, isOnce) {
			this.handler = handler;
			this.isOnce = isOnce;
			/**
			* Indicates if the subscription has been executed before.
			*
			* @memberOf PromiseSubscription
			*/
			this.isExecuted = false;
		}
		/**
		* Executes the handler.
		*
		* @param {boolean} executeAsync True if the even should be executed async.
		* @param {*} scope The scope the scope of the event.
		* @param {IArguments} args The arguments for the event.
		*
		* @memberOf PromiseSubscription
		*/
		async execute(executeAsync, scope, args) {
			if (!this.isOnce || !this.isExecuted) {
				this.isExecuted = true;
				var fn = this.handler;
				if (executeAsync) {
					setTimeout(() => {
						fn.apply(scope, args);
					}, 1);
					return;
				}
				let result = fn.apply(scope, args);
				await result;
			}
		}
	};
	exports.PromiseSubscription = PromiseSubscription;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/PromiseDispatcherBase.js
var require_PromiseDispatcherBase = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/dispatching/PromiseDispatcherBase.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PromiseDispatcherBase = void 0;
	const PromiseSubscription_1$1 = require_PromiseSubscription();
	const EventManagement_1$1 = require_EventManagement();
	const DispatcherBase_1$1 = require_DispatcherBase();
	const DispatchError_1$1 = require_DispatchError();
	/**
	* Dispatcher base for dispatchers that use promises. Each promise
	* is awaited before the next is dispatched, unless the event is
	* dispatched with the executeAsync flag.
	*
	* @export
	* @abstract
	* @class PromiseDispatcherBase
	* @extends {DispatcherBase<TEventHandler>}
	* @template TEventHandler The type of event handler.
	*/
	var PromiseDispatcherBase = class extends DispatcherBase_1$1.DispatcherBase {
		/**
		* The normal dispatch cannot be used in this class.
		*
		* @protected
		* @param {boolean} executeAsync `True` if the even should be executed async.
		* @param {*} scope The scope of the event. The scope becomes the `this` for handler.
		* @param {IArguments} args The arguments for the event.
		* @returns {(IPropagationStatus | null)} The propagation status, or if an `executeAsync` is used `null`.
		*
		* @memberOf DispatcherBase
		*/
		_dispatch(executeAsync, scope, args) {
			throw new DispatchError_1$1.DispatchError("_dispatch not supported. Use _dispatchAsPromise.");
		}
		/**
		* Crates a new subscription.
		*
		* @protected
		* @param {TEventHandler} handler The handler.
		* @param {boolean} isOnce Indicates if the handler should only run once.
		* @returns {ISubscription<TEventHandler>} The subscription.
		*
		* @memberOf PromiseDispatcherBase
		*/
		createSubscription(handler, isOnce) {
			return new PromiseSubscription_1$1.PromiseSubscription(handler, isOnce);
		}
		/**
		* Generic dispatch will dispatch the handlers with the given arguments.
		*
		* @protected
		* @param {boolean} executeAsync `True` if the even should be executed async.
		* @param {*} scope The scope of the event. The scope becomes the `this` for handler.
		* @param {IArguments} args The arguments for the event.
		* @returns {(IPropagationStatus | null)} The propagation status, or if an `executeAsync` is used `null`.
		*
		* @memberOf DispatcherBase
		*/
		async _dispatchAsPromise(executeAsync, scope, args) {
			for (let sub of [...this._subscriptions]) {
				let ev = new EventManagement_1$1.EventManagement(() => this.unsub(sub.handler));
				let nargs = Array.prototype.slice.call(args);
				nargs.push(ev);
				let ps = sub;
				await ps.execute(executeAsync, scope, nargs);
				this.cleanup(sub);
				if (!executeAsync && ev.propagationStopped) return { propagationStopped: true };
			}
			if (executeAsync) return null;
			return { propagationStopped: false };
		}
	};
	exports.PromiseDispatcherBase = PromiseDispatcherBase;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/index.js
var require_dist$1 = __commonJS({ "../../node_modules/.pnpm/ste-core@3.0.11/node_modules/ste-core/dist/index.js"(exports) {
	/*!
	* Strongly Typed Events for TypeScript - Core
	* https://github.com/KeesCBakker/StronlyTypedEvents/
	* http://keestalkstech.com
	*
	* Copyright Kees C. Bakker / KeesTalksTech
	* Released under the MIT license
	*/
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SubscriptionChangeEventDispatcher = exports.HandlingBase = exports.PromiseDispatcherBase = exports.PromiseSubscription = exports.DispatchError = exports.EventManagement = exports.EventListBase = exports.DispatcherWrapper = exports.DispatcherBase = exports.Subscription = void 0;
	const DispatcherBase_1 = require_DispatcherBase();
	Object.defineProperty(exports, "DispatcherBase", {
		enumerable: true,
		get: function() {
			return DispatcherBase_1.DispatcherBase;
		}
	});
	Object.defineProperty(exports, "SubscriptionChangeEventDispatcher", {
		enumerable: true,
		get: function() {
			return DispatcherBase_1.SubscriptionChangeEventDispatcher;
		}
	});
	const DispatchError_1 = require_DispatchError();
	Object.defineProperty(exports, "DispatchError", {
		enumerable: true,
		get: function() {
			return DispatchError_1.DispatchError;
		}
	});
	const DispatcherWrapper_1 = require_DispatcherWrapper();
	Object.defineProperty(exports, "DispatcherWrapper", {
		enumerable: true,
		get: function() {
			return DispatcherWrapper_1.DispatcherWrapper;
		}
	});
	const EventListBase_1 = require_EventListBase();
	Object.defineProperty(exports, "EventListBase", {
		enumerable: true,
		get: function() {
			return EventListBase_1.EventListBase;
		}
	});
	const EventManagement_1 = require_EventManagement();
	Object.defineProperty(exports, "EventManagement", {
		enumerable: true,
		get: function() {
			return EventManagement_1.EventManagement;
		}
	});
	const HandlingBase_1 = require_HandlingBase();
	Object.defineProperty(exports, "HandlingBase", {
		enumerable: true,
		get: function() {
			return HandlingBase_1.HandlingBase;
		}
	});
	const PromiseDispatcherBase_1 = require_PromiseDispatcherBase();
	Object.defineProperty(exports, "PromiseDispatcherBase", {
		enumerable: true,
		get: function() {
			return PromiseDispatcherBase_1.PromiseDispatcherBase;
		}
	});
	const PromiseSubscription_1 = require_PromiseSubscription();
	Object.defineProperty(exports, "PromiseSubscription", {
		enumerable: true,
		get: function() {
			return PromiseSubscription_1.PromiseSubscription;
		}
	});
	const Subscription_1 = require_Subscription();
	Object.defineProperty(exports, "Subscription", {
		enumerable: true,
		get: function() {
			return Subscription_1.Subscription;
		}
	});
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventDispatcher.js
var require_SimpleEventDispatcher = __commonJS({ "../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventDispatcher.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SimpleEventDispatcher = void 0;
	const ste_core_1$2 = require_dist$1();
	/**
	* The dispatcher handles the storage of subsciptions and facilitates
	* subscription, unsubscription and dispatching of a simple event
	*
	* @export
	* @class SimpleEventDispatcher
	* @extends {DispatcherBase<ISimpleEventHandler<TArgs>>}
	* @implements {ISimpleEvent<TArgs>}
	* @template TArgs
	*/
	var SimpleEventDispatcher$2 = class extends ste_core_1$2.DispatcherBase {
		/**
		* Creates an instance of SimpleEventDispatcher.
		*
		* @memberOf SimpleEventDispatcher
		*/
		constructor() {
			super();
		}
		/**
		* Dispatches the event.
		*
		* @param {TArgs} args The arguments object.
		* @returns {IPropagationStatus} The status of the event.
		*
		* @memberOf SimpleEventDispatcher
		*/
		dispatch(args) {
			const result = this._dispatch(false, this, arguments);
			if (result == null) throw new ste_core_1$2.DispatchError("Got `null` back from dispatch.");
			return result;
		}
		/**
		* Dispatches the event without waiting for the result.
		*
		* @param {TArgs} args The arguments object.
		*
		* @memberOf SimpleEventDispatcher
		*/
		dispatchAsync(args) {
			this._dispatch(true, this, arguments);
		}
		/**
		* Creates an event from the dispatcher. Will return the dispatcher
		* in a wrapper. This will prevent exposure of any dispatcher methods.
		*
		* @returns {ISimpleEvent<TArgs>} The event.
		*
		* @memberOf SimpleEventDispatcher
		*/
		asEvent() {
			return super.asEvent();
		}
	};
	exports.SimpleEventDispatcher = SimpleEventDispatcher$2;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventList.js
var require_SimpleEventList = __commonJS({ "../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventList.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SimpleEventList = void 0;
	const ste_core_1$1 = require_dist$1();
	const SimpleEventDispatcher_1$2 = require_SimpleEventDispatcher();
	/**
	* Storage class for multiple simple events that are accessible by name.
	* Events dispatchers are automatically created.
	*/
	var SimpleEventList = class extends ste_core_1$1.EventListBase {
		/**
		* Creates a new SimpleEventList instance.
		*/
		constructor() {
			super();
		}
		/**
		* Creates a new dispatcher instance.
		*/
		createDispatcher() {
			return new SimpleEventDispatcher_1$2.SimpleEventDispatcher();
		}
	};
	exports.SimpleEventList = SimpleEventList;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventHandlingBase.js
var require_SimpleEventHandlingBase = __commonJS({ "../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/SimpleEventHandlingBase.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.SimpleEventHandlingBase = void 0;
	const ste_core_1 = require_dist$1();
	const SimpleEventList_1$1 = require_SimpleEventList();
	/**
	* Extends objects with signal event handling capabilities.
	*/
	var SimpleEventHandlingBase = class extends ste_core_1.HandlingBase {
		constructor() {
			super(new SimpleEventList_1$1.SimpleEventList());
		}
	};
	exports.SimpleEventHandlingBase = SimpleEventHandlingBase;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/NonUniformSimpleEventList.js
var require_NonUniformSimpleEventList = __commonJS({ "../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/NonUniformSimpleEventList.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.NonUniformSimpleEventList = void 0;
	const SimpleEventDispatcher_1$1 = require_SimpleEventDispatcher();
	/**
	* Similar to EventList, but instead of TArgs, a map of event names ang argument types is provided with TArgsMap.
	*/
	var NonUniformSimpleEventList = class {
		constructor() {
			this._events = {};
		}
		/**
		* Gets the dispatcher associated with the name.
		* @param name The name of the event.
		*/
		get(name) {
			if (this._events[name]) return this._events[name];
			const event = this.createDispatcher();
			this._events[name] = event;
			return event;
		}
		/**
		* Removes the dispatcher associated with the name.
		* @param name The name of the event.
		*/
		remove(name) {
			delete this._events[name];
		}
		/**
		* Creates a new dispatcher instance.
		*/
		createDispatcher() {
			return new SimpleEventDispatcher_1$1.SimpleEventDispatcher();
		}
	};
	exports.NonUniformSimpleEventList = NonUniformSimpleEventList;
} });

//#endregion
//#region ../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/index.js
var require_dist = __commonJS({ "../../node_modules/.pnpm/ste-simple-events@3.0.11/node_modules/ste-simple-events/dist/index.js"(exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.NonUniformSimpleEventList = exports.SimpleEventList = exports.SimpleEventHandlingBase = exports.SimpleEventDispatcher = void 0;
	const SimpleEventDispatcher_1 = require_SimpleEventDispatcher();
	Object.defineProperty(exports, "SimpleEventDispatcher", {
		enumerable: true,
		get: function() {
			return SimpleEventDispatcher_1.SimpleEventDispatcher;
		}
	});
	const SimpleEventHandlingBase_1 = require_SimpleEventHandlingBase();
	Object.defineProperty(exports, "SimpleEventHandlingBase", {
		enumerable: true,
		get: function() {
			return SimpleEventHandlingBase_1.SimpleEventHandlingBase;
		}
	});
	const NonUniformSimpleEventList_1 = require_NonUniformSimpleEventList();
	Object.defineProperty(exports, "NonUniformSimpleEventList", {
		enumerable: true,
		get: function() {
			return NonUniformSimpleEventList_1.NonUniformSimpleEventList;
		}
	});
	const SimpleEventList_1 = require_SimpleEventList();
	Object.defineProperty(exports, "SimpleEventList", {
		enumerable: true,
		get: function() {
			return SimpleEventList_1.SimpleEventList;
		}
	});
} });

//#endregion
//#region src/utils/eventSystem.ts
var import_dist$1 = __toESM(require_dist(), 1);
var EventSystem = class {
	/**
	* Fires when a new FromRadio message has been received from the device
	*
	* @event onLogEvent
	*/
	onLogEvent = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new FromRadio message has been received from the device
	*
	* @event onFromRadio
	*/
	onFromRadio = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new FromRadio message containing a Data packet has been
	* received from the device
	*
	* @event onMeshPacket
	*/
	onMeshPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MyNodeInfo message has been received from the device
	*
	* @event onMyNodeInfo
	*/
	onMyNodeInfo = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a NodeInfo packet has been
	* received from device
	*
	* @event onNodeInfoPacket
	*/
	onNodeInfoPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new Channel message is received
	*
	* @event onChannelPacket
	*/
	onChannelPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new Config message is received
	*
	* @event onConfigPacket
	*/
	onConfigPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new ModuleConfig message is received
	*
	* @event onModuleConfigPacket
	*/
	onModuleConfigPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a ATAK packet has been
	* received from device
	*
	* @event onAtakPacket
	*/
	onAtakPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Text packet has been
	* received from device
	*
	* @event onMessagePacket
	*/
	onMessagePacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Remote Hardware packet has
	* been received from device
	*
	* @event onRemoteHardwarePacket
	*/
	onRemoteHardwarePacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Position packet has been
	* received from device
	*
	* @event onPositionPacket
	*/
	onPositionPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a User packet has been
	* received from device
	*
	* @event onUserPacket
	*/
	onUserPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Routing packet has been
	* received from device
	*
	* @event onRoutingPacket
	*/
	onRoutingPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when the device receives a Metadata packet
	*
	* @event onDeviceMetadataPacket
	*/
	onDeviceMetadataPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when the device receives a Canned Message Module message packet
	*
	* @event onCannedMessageModulePacket
	*/
	onCannedMessageModulePacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Waypoint packet has been
	* received from device
	*
	* @event onWaypointPacket
	*/
	onWaypointPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing an Audio packet has been
	* received from device
	*
	* @event onAudioPacket
	*/
	onAudioPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Detection Sensor packet has been
	* received from device
	*
	* @event onDetectionSensorPacket
	*/
	onDetectionSensorPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Ping packet has been
	* received from device
	*
	* @event onPingPacket
	*/
	onPingPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a IP Tunnel packet has been
	* received from device
	*
	* @event onIpTunnelPacket
	*/
	onIpTunnelPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Paxcounter packet has been
	* received from device
	*
	* @event onPaxcounterPacket
	*/
	onPaxcounterPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Serial packet has been
	* received from device
	*
	* @event onSerialPacket
	*/
	onSerialPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Store and Forward packet
	* has been received from device
	*
	* @event onStoreForwardPacket
	*/
	onStoreForwardPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Store and Forward packet
	* has been received from device
	*
	* @event onRangeTestPacket
	*/
	onRangeTestPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Telemetry packet has been
	* received from device
	*
	* @event onTelemetryPacket
	*/
	onTelemetryPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a ZPS packet has been
	* received from device
	*
	* @event onZPSPacket
	*/
	onZpsPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Simulator packet has been
	* received from device
	*
	* @event onSimulatorPacket
	*/
	onSimulatorPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Trace Route packet has been
	* received from device
	*
	* @event onTraceRoutePacket
	*/
	onTraceRoutePacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Neighbor Info packet has been
	* received from device
	*
	* @event onNeighborInfoPacket
	*/
	onNeighborInfoPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing an ATAK packet has been
	* received from device
	*
	* @event onAtakPluginPacket
	*/
	onAtakPluginPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Map Report packet has been
	* received from device
	*
	* @event onMapReportPacket
	*/
	onMapReportPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a Private packet has been
	* received from device
	*
	* @event onPrivatePacket
	*/
	onPrivatePacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing an ATAK Forwarder packet has been
	* received from device
	*
	* @event onAtakForwarderPacket
	*/
	onAtakForwarderPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new MeshPacket message containing a ClientNotification packet has been
	* received from device
	*
	* @event onClientNotificationPacket
	*/
	onClientNotificationPacket = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when the devices connection or configuration status changes
	*
	* @event onDeviceStatus
	*/
	onDeviceStatus = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a new FromRadio message containing a LogRecord packet has been
	* received from device
	*
	* @event onLogRecord
	*/
	onLogRecord = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when the device receives a meshPacket, returns a timestamp
	*
	* @event onMeshHeartbeat
	*/
	onMeshHeartbeat = new import_dist$1.SimpleEventDispatcher();
	/**
	* Outputs any debug log data (currently serial connections only)
	*
	* @event onDeviceDebugLog
	*/
	onDeviceDebugLog = new import_dist$1.SimpleEventDispatcher();
	/**
	* Outputs status of pending settings changes
	*
	* @event onpendingSettingsChange
	*/
	onPendingSettingsChange = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a QueueStatus message is generated
	*
	* @event onQueueStatus
	*/
	onQueueStatus = new import_dist$1.SimpleEventDispatcher();
	/**
	* Fires when a configCompleteId message is received from the device
	*
	* @event onConfigComplete
	*/
	onConfigComplete = new import_dist$1.SimpleEventDispatcher();
};

//#endregion
//#region src/utils/queue.ts
var import_dist = __toESM(require_dist(), 1);
var Queue = class {
	queue = [];
	lock = false;
	ackNotifier = new import_dist.SimpleEventDispatcher();
	errorNotifier = new import_dist.SimpleEventDispatcher();
	timeout;
	constructor() {
		this.timeout = 6e4;
	}
	getState() {
		return this.queue;
	}
	clear() {
		this.queue = [];
	}
	push(item) {
		const queueItem = {
			...item,
			sent: false,
			added: new Date(),
			promise: new Promise((resolve, reject) => {
				this.ackNotifier.subscribe((id) => {
					if (item.id === id) {
						this.remove(item.id);
						resolve(id);
					}
				});
				this.errorNotifier.subscribe((e) => {
					if (item.id === e.id) {
						this.remove(item.id);
						reject(e);
					}
				});
				setTimeout(() => {
					if (this.queue.findIndex((qi) => qi.id === item.id) !== -1) {
						this.remove(item.id);
						const decoded = fromBinary(ToRadioSchema, item.data);
						if (decoded.payloadVariant.case === "heartbeat" || decoded.payloadVariant.case === "wantConfigId") {
							resolve(item.id);
							return;
						}
						console.warn(`Packet ${item.id} of type ${decoded.payloadVariant.case} timed out`);
						reject({
							id: item.id,
							error: Routing_Error.TIMEOUT
						});
					}
				}, this.timeout);
			})
		};
		this.queue.push(queueItem);
	}
	remove(id) {
		if (this.lock) {
			setTimeout(() => this.remove(id), 100);
			return;
		}
		this.queue = this.queue.filter((item) => item.id !== id);
	}
	processAck(id) {
		this.ackNotifier.dispatch(id);
	}
	processError(e) {
		console.error(`Error received for packet ${e.id}: ${Routing_Error[e.error]}`);
		this.errorNotifier.dispatch(e);
	}
	wait(id) {
		const queueItem = this.queue.find((qi) => qi.id === id);
		if (!queueItem) throw new Error("Packet does not exist");
		return queueItem.promise;
	}
	async processQueue(outputStream) {
		if (this.lock) return;
		this.lock = true;
		const writer = outputStream.getWriter();
		try {
			while (this.queue.filter((p) => !p.sent).length > 0) {
				const item = this.queue.filter((p) => !p.sent)[0];
				if (item) {
					await new Promise((resolve) => setTimeout(resolve, 200));
					try {
						await writer.write(item.data);
						item.sent = true;
					} catch (error) {
						if (error?.code === "ECONNRESET" || error?.code === "ERR_INVALID_STATE") {
							writer.releaseLock();
							this.lock = false;
							throw error;
						}
						console.error(`Error sending packet ${item.id}`, error);
					}
				}
			}
		} finally {
			writer.releaseLock();
			this.lock = false;
		}
	}
};

//#endregion
//#region src/utils/transform/fromDevice.ts
const fromDeviceStream = () => {
	let byteBuffer = new Uint8Array([]);
	const textDecoder = new TextDecoder();
	return new TransformStream({ transform(chunk, controller) {
		byteBuffer = new Uint8Array([...byteBuffer, ...chunk]);
		let processingExhausted = false;
		while (byteBuffer.length !== 0 && !processingExhausted) {
			const framingIndex = byteBuffer.indexOf(148);
			const framingByte2 = byteBuffer[framingIndex + 1];
			if (framingByte2 === 195) {
				if (byteBuffer.subarray(0, framingIndex).length) {
					controller.enqueue({
						type: "debug",
						data: textDecoder.decode(byteBuffer.subarray(0, framingIndex))
					});
					byteBuffer = byteBuffer.subarray(framingIndex);
				}
				const msb = byteBuffer[2];
				const lsb = byteBuffer[3];
				if (msb !== void 0 && lsb !== void 0 && byteBuffer.length >= 4 + (msb << 8) + lsb) {
					const packet = byteBuffer.subarray(4, 4 + (msb << 8) + lsb);
					const malformedDetectorIndex = packet.indexOf(148);
					if (malformedDetectorIndex !== -1 && packet[malformedDetectorIndex + 1] === 195) {
						console.warn(`⚠️ Malformed packet found, discarding: ${byteBuffer.subarray(0, malformedDetectorIndex - 1).toString()}`);
						byteBuffer = byteBuffer.subarray(malformedDetectorIndex);
					} else {
						byteBuffer = byteBuffer.subarray(3 + (msb << 8) + lsb + 1);
						controller.enqueue({
							type: "packet",
							data: packet
						});
					}
				} else
 /** Only partioal message in buffer, wait for the rest */
				processingExhausted = true;
			} else
 /** Message not complete, only 1 byte in buffer */
			processingExhausted = true;
		}
	} });
};

//#endregion
//#region src/utils/transform/toDevice.ts
/**
* Pads packets with appropriate framing information before writing to the output stream.
*/
const toDeviceStream = () => {
	return new TransformStream({ transform(chunk, controller) {
		const bufLen = chunk.length;
		const header = new Uint8Array([
			148,
			195,
			bufLen >> 8 & 255,
			bufLen & 255
		]);
		controller.enqueue(new Uint8Array([...header, ...chunk]));
	} });
};

//#endregion
//#region src/utils/xmodem.ts
var Xmodem = class {
	sendRaw;
	rxBuffer;
	txBuffer;
	textEncoder;
	counter;
	constructor(sendRaw) {
		this.sendRaw = sendRaw;
		this.rxBuffer = [];
		this.txBuffer = [];
		this.textEncoder = new TextEncoder();
		this.counter = 0;
	}
	async downloadFile(filename) {
		return await this.sendCommand(XModem_Control.STX, this.textEncoder.encode(filename), 0);
	}
	async uploadFile(filename, data) {
		for (let i = 0; i < data.length; i += 128) this.txBuffer.push(data.slice(i, i + 128));
		return await this.sendCommand(XModem_Control.SOH, this.textEncoder.encode(filename), 0);
	}
	async sendCommand(command, buffer, sequence, crc16) {
		const toRadio = create(ToRadioSchema, { payloadVariant: {
			case: "xmodemPacket",
			value: {
				buffer,
				control: command,
				seq: sequence,
				crc16
			}
		} });
		return await this.sendRaw(toBinary(ToRadioSchema, toRadio));
	}
	async handlePacket(packet) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		switch (packet.control) {
			case XModem_Control.NUL: break;
			case XModem_Control.SOH: {
				this.counter = packet.seq;
				if (this.validateCrc16(packet)) {
					this.rxBuffer[this.counter] = packet.buffer;
					return this.sendCommand(XModem_Control.ACK);
				}
				return await this.sendCommand(XModem_Control.NAK, void 0, packet.seq);
			}
			case XModem_Control.STX: break;
			case XModem_Control.EOT: break;
			case XModem_Control.ACK: {
				this.counter++;
				if (this.txBuffer[this.counter - 1]) return this.sendCommand(XModem_Control.SOH, this.txBuffer[this.counter - 1], this.counter, crc16ccitt(this.txBuffer[this.counter - 1] ?? new Uint8Array()));
				if (this.counter === this.txBuffer.length + 1) return this.sendCommand(XModem_Control.EOT);
				this.clear();
				break;
			}
			case XModem_Control.NAK: return this.sendCommand(XModem_Control.SOH, this.txBuffer[this.counter], this.counter, crc16ccitt(this.txBuffer[this.counter - 1] ?? new Uint8Array()));
			case XModem_Control.CAN: {
				this.clear();
				break;
			}
			case XModem_Control.CTRLZ: break;
		}
		return Promise.resolve(0);
	}
	validateCrc16(packet) {
		return crc16ccitt(packet.buffer) === packet.crc16;
	}
	clear() {
		this.counter = 0;
		this.rxBuffer = [];
		this.txBuffer = [];
	}
};

//#endregion
//#region src/utils/mod.ts
var utils_exports = {};
__export(utils_exports, {
	EventSystem: () => EventSystem,
	Queue: () => Queue,
	Xmodem: () => Xmodem,
	fromDeviceStream: () => fromDeviceStream,
	toDeviceStream: () => toDeviceStream
});

//#endregion
//#region src/utils/transform/decodePacket.ts
const decodePacket = (device) => new WritableStream({ write(chunk) {
	switch (chunk.type) {
		case "status": {
			const { status, reason } = chunk.data;
			device.updateDeviceStatus(status);
			device.log.info(Emitter[Emitter.ConnectionStatus], `🔗 ${DeviceStatusEnum[status]} ${reason ? `(${reason})` : ""}`);
			break;
		}
		case "debug": break;
		case "packet": {
			let decodedMessage;
			try {
				decodedMessage = fromBinary(FromRadioSchema, chunk.data);
			} catch (e) {
				device.log.error(Emitter[Emitter.HandleFromRadio], "⚠️  Received undecodable packet", e);
				break;
			}
			device.events.onFromRadio.dispatch(decodedMessage);
			/** @todo Add map here when `all=true` gets fixed. */
			switch (decodedMessage.payloadVariant.case) {
				case "packet": {
					try {
						device.handleMeshPacket(decodedMessage.payloadVariant.value);
					} catch (e) {
						device.log.error(Emitter[Emitter.HandleFromRadio], "⚠️  Unable to handle mesh packet", e);
					}
					break;
				}
				case "myInfo": {
					device.events.onMyNodeInfo.dispatch(decodedMessage.payloadVariant.value);
					device.log.info(Emitter[Emitter.HandleFromRadio], "📱 Received Node info for this device");
					break;
				}
				case "nodeInfo": {
					device.log.info(Emitter[Emitter.HandleFromRadio], `📱 Received Node Info packet for node: ${decodedMessage.payloadVariant.value.num}`);
					device.events.onNodeInfoPacket.dispatch(decodedMessage.payloadVariant.value);
					if (decodedMessage.payloadVariant.value.position) device.events.onPositionPacket.dispatch({
						id: decodedMessage.id,
						rxTime: new Date(),
						from: decodedMessage.payloadVariant.value.num,
						to: decodedMessage.payloadVariant.value.num,
						type: "direct",
						channel: ChannelNumber.Primary,
						data: decodedMessage.payloadVariant.value.position
					});
					if (decodedMessage.payloadVariant.value.user) device.events.onUserPacket.dispatch({
						id: decodedMessage.id,
						rxTime: new Date(),
						from: decodedMessage.payloadVariant.value.num,
						to: decodedMessage.payloadVariant.value.num,
						type: "direct",
						channel: ChannelNumber.Primary,
						data: decodedMessage.payloadVariant.value.user
					});
					break;
				}
				case "config": {
					if (decodedMessage.payloadVariant.value.payloadVariant.case) device.log.trace(Emitter[Emitter.HandleFromRadio], `💾 Received Config packet of variant: ${decodedMessage.payloadVariant.value.payloadVariant.case}`);
					else device.log.warn(Emitter[Emitter.HandleFromRadio], `⚠️ Received Config packet of variant: UNK`);
					device.events.onConfigPacket.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				case "logRecord": {
					device.log.trace(Emitter[Emitter.HandleFromRadio], "Received onLogRecord");
					device.events.onLogRecord.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				case "configCompleteId": {
					device.log.info(Emitter[Emitter.HandleFromRadio], `⚙️ Received config complete id: ${decodedMessage.payloadVariant.value}`);
					device.events.onConfigComplete.dispatch(decodedMessage.payloadVariant.value);
					if (decodedMessage.payloadVariant.value === device.configId) {
						device.log.info(Emitter[Emitter.HandleFromRadio], `⚙️ Config id matches device.configId: ${device.configId}`);
						device.updateDeviceStatus(DeviceStatusEnum.DeviceConfigured);
					}
					break;
				}
				case "rebooted": {
					device.configure().catch(() => {});
					break;
				}
				case "moduleConfig": {
					if (decodedMessage.payloadVariant.value.payloadVariant.case) device.log.trace(Emitter[Emitter.HandleFromRadio], `💾 Received Module Config packet of variant: ${decodedMessage.payloadVariant.value.payloadVariant.case}`);
					else device.log.warn(Emitter[Emitter.HandleFromRadio], "⚠️ Received Module Config packet of variant: UNK");
					device.events.onModuleConfigPacket.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				case "channel": {
					device.log.trace(Emitter[Emitter.HandleFromRadio], `🔐 Received Channel: ${decodedMessage.payloadVariant.value.index}`);
					device.events.onChannelPacket.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				case "queueStatus": {
					device.log.trace(Emitter[Emitter.HandleFromRadio], `🚧 Received Queue Status: ${decodedMessage.payloadVariant.value}`);
					device.events.onQueueStatus.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				case "xmodemPacket": {
					device.xModem.handlePacket(decodedMessage.payloadVariant.value);
					break;
				}
				case "metadata": {
					if (Number.parseFloat(decodedMessage.payloadVariant.value.firmwareVersion) < Constants.minFwVer) device.log.fatal(Emitter[Emitter.HandleFromRadio], `Device firmware outdated. Min supported: ${Constants.minFwVer} got : ${decodedMessage.payloadVariant.value.firmwareVersion}`);
					device.log.debug(Emitter[Emitter.GetMetadata], "🏷️ Received metadata packet");
					device.events.onDeviceMetadataPacket.dispatch({
						id: decodedMessage.id,
						rxTime: new Date(),
						from: 0,
						to: 0,
						type: "direct",
						channel: ChannelNumber.Primary,
						data: decodedMessage.payloadVariant.value
					});
					break;
				}
				case "mqttClientProxyMessage": break;
				case "clientNotification": {
					device.log.trace(Emitter[Emitter.HandleFromRadio], `📣 Received ClientNotification: ${decodedMessage.payloadVariant.value.message}`);
					device.events.onClientNotificationPacket.dispatch(decodedMessage.payloadVariant.value);
					break;
				}
				default: device.log.warn(Emitter[Emitter.HandleFromRadio], `⚠️ Unhandled payload variant: ${decodedMessage.payloadVariant.case}`);
			}
		}
	}
} });

//#endregion
//#region src/meshDevice.ts
var MeshDevice = class {
	transport;
	/** Logs to the console and the logging event emitter */
	log;
	/** Describes the current state of the device */
	deviceStatus;
	/** Describes the current state of the device */
	isConfigured;
	/** Are there any settings that have yet to be applied? */
	pendingSettingsChanges;
	/** Device's node number */
	myNodeInfo;
	/** Randomly generated number to ensure confiuration lockstep */
	configId;
	/**
	* Packert queue, to space out transmissions and routing handle errors and
	* acks
	*/
	queue;
	events;
	xModem;
	_heartbeatIntervalId;
	constructor(transport, configId) {
		this.log = new Logger({
			name: "iMeshDevice",
			prettyLogTemplate: "{{hh}}:{{MM}}:{{ss}}:{{ms}}	{{logLevelName}}	[{{name}}]	"
		});
		this.transport = transport;
		this.deviceStatus = DeviceStatusEnum.DeviceDisconnected;
		this.isConfigured = false;
		this.pendingSettingsChanges = false;
		this.myNodeInfo = create(MyNodeInfoSchema);
		this.configId = configId ?? this.generateRandId();
		this.queue = new Queue();
		this.events = new EventSystem();
		this.xModem = new Xmodem(this.sendRaw.bind(this));
		this.events.onDeviceStatus.subscribe((status) => {
			this.deviceStatus = status;
			if (status === DeviceStatusEnum.DeviceConfigured) this.isConfigured = true;
			else if (status === DeviceStatusEnum.DeviceConfiguring) this.isConfigured = false;
			else if (status === DeviceStatusEnum.DeviceDisconnected) {
				if (this._heartbeatIntervalId !== void 0) clearInterval(this._heartbeatIntervalId);
				this.complete();
			}
		});
		this.events.onMyNodeInfo.subscribe((myNodeInfo) => {
			this.myNodeInfo = myNodeInfo;
		});
		this.events.onPendingSettingsChange.subscribe((state) => {
			this.pendingSettingsChanges = state;
		});
		this.transport.fromDevice.pipeTo(decodePacket(this));
	}
	/** Abstract method that connects to the radio */
	/** Abstract method that disconnects from the radio */
	/** Abstract method that pings the radio */
	/**
	* Sends a text over the radio
	*/
	async sendText(text, destination, wantAck, channel, replyId, emoji) {
		this.log.debug(Emitter[Emitter.SendText], `📤 Sending message to ${destination ?? "broadcast"} on channel ${channel?.toString() ?? 0}`);
		const enc = new TextEncoder();
		return await this.sendPacket(enc.encode(text), PortNum.TEXT_MESSAGE_APP, destination ?? "broadcast", channel, wantAck, false, true, replyId, emoji);
	}
	/**
	* Sends a text over the radio
	*/
	sendWaypoint(waypointMessage, destination, channel) {
		this.log.debug(Emitter[Emitter.SendWaypoint], `📤 Sending waypoint to ${destination} on channel ${channel?.toString() ?? 0}`);
		waypointMessage.id = this.generateRandId();
		return this.sendPacket(toBinary(WaypointSchema, waypointMessage), PortNum.WAYPOINT_APP, destination, channel, true, false);
	}
	/**
	* Sends packet over the radio
	*/
	async sendPacket(byteData, portNum, destination, channel = ChannelNumber.Primary, wantAck = true, wantResponse = true, echoResponse = false, replyId, emoji) {
		this.log.trace(Emitter[Emitter.SendPacket], `📤 Sending ${PortNum[portNum]} to ${destination}`);
		const meshPacket = create(MeshPacketSchema, {
			payloadVariant: {
				case: "decoded",
				value: {
					payload: byteData,
					portnum: portNum,
					wantResponse,
					emoji,
					replyId,
					dest: 0,
					requestId: 0,
					source: 0
				}
			},
			from: this.myNodeInfo.myNodeNum,
			to: destination === "broadcast" ? Constants.broadcastNum : destination === "self" ? this.myNodeInfo.myNodeNum : destination,
			id: this.generateRandId(),
			wantAck,
			channel
		});
		const toRadioMessage = create(ToRadioSchema, { payloadVariant: {
			case: "packet",
			value: meshPacket
		} });
		if (echoResponse) {
			meshPacket.rxTime = Math.trunc(Date.now() / 1e3);
			this.handleMeshPacket(meshPacket);
		}
		return await this.sendRaw(toBinary(ToRadioSchema, toRadioMessage), meshPacket.id);
	}
	/**
	* Sends raw packet over the radio
	*/
	async sendRaw(toRadio, id = this.generateRandId()) {
		if (toRadio.length > 512) throw new Error("Message longer than 512 bytes, it will not be sent!");
		this.queue.push({
			id,
			data: toRadio
		});
		await this.queue.processQueue(this.transport.toDevice);
		return this.queue.wait(id);
	}
	/**
	* Writes config to device
	*/
	async setConfig(config) {
		this.log.debug(Emitter[Emitter.SetConfig], `⚙️ Setting config, Variant: ${config.payloadVariant.case ?? "Unknown"}`);
		if (!this.pendingSettingsChanges) await this.beginEditSettings();
		const configMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setConfig",
			value: config
		} });
		return this.sendPacket(toBinary(AdminMessageSchema, configMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Writes module config to device
	*/
	async setModuleConfig(moduleConfig) {
		this.log.debug(Emitter[Emitter.SetModuleConfig], "⚙️ Setting module config");
		const moduleConfigMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setModuleConfig",
			value: moduleConfig
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, moduleConfigMessage), PortNum.ADMIN_APP, "self");
	}
	async setCannedMessages(cannedMessages) {
		this.log.debug(Emitter[Emitter.SetCannedMessages], "⚙️ Setting CannedMessages");
		const cannedMessagesMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setCannedMessageModuleMessages",
			value: cannedMessages.messages
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, cannedMessagesMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Sets devices owner data
	*/
	async setOwner(owner) {
		this.log.debug(Emitter[Emitter.SetOwner], "👤 Setting owner");
		const setOwnerMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setOwner",
			value: owner
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, setOwnerMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Sets devices ChannelSettings
	*/
	async setChannel(channel) {
		this.log.debug(Emitter[Emitter.SetChannel], `📻 Setting Channel: ${channel.index}`);
		const setChannelMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setChannel",
			value: channel
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, setChannelMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Triggers Device to enter DFU mode
	*/
	async enterDfuMode() {
		this.log.debug(Emitter[Emitter.EnterDfuMode], "🔌 Entering DFU mode");
		const enterDfuModeRequest = create(AdminMessageSchema, { payloadVariant: {
			case: "enterDfuModeRequest",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, enterDfuModeRequest), PortNum.ADMIN_APP, "self");
	}
	/**
	* Sets static position of device
	*/
	async setPosition(positionMessage) {
		return await this.sendPacket(toBinary(PositionSchema, positionMessage), PortNum.POSITION_APP, "self");
	}
	/**
	* Sets the fixed position of a device. Can be used to
	* position GPS-less devices.
	*/
	async setFixedPosition(latitude, longitude) {
		const setPositionMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setFixedPosition",
			value: create(PositionSchema, {
				latitudeI: Math.floor(latitude / 1e-7),
				longitudeI: Math.floor(longitude / 1e-7)
			})
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, setPositionMessage), PortNum.ADMIN_APP, "self", 0, true, false);
	}
	/**
	* Remove the fixed position of a device
	*/
	async removeFixedPosition() {
		const removePositionMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "removeFixedPosition",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, removePositionMessage), PortNum.ADMIN_APP, "self", 0, true, false);
	}
	/**
	* Gets specified channel information from the radio
	*/
	async getChannel(index) {
		this.log.debug(Emitter[Emitter.GetChannel], `📻 Requesting Channel: ${index}`);
		const getChannelRequestMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "getChannelRequest",
			value: index + 1
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, getChannelRequestMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Gets devices config
	*/
	async getConfig(configType) {
		this.log.debug(Emitter[Emitter.GetConfig], "⚙️ Requesting config");
		const getRadioRequestMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "getConfigRequest",
			value: configType
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, getRadioRequestMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Gets Module config
	*/
	async getModuleConfig(moduleConfigType) {
		this.log.debug(Emitter[Emitter.GetModuleConfig], "⚙️ Requesting module config");
		const getRadioRequestMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "getModuleConfigRequest",
			value: moduleConfigType
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, getRadioRequestMessage), PortNum.ADMIN_APP, "self");
	}
	/** Gets devices Owner */
	async getOwner() {
		this.log.debug(Emitter[Emitter.GetOwner], "👤 Requesting owner");
		const getOwnerRequestMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "getOwnerRequest",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, getOwnerRequestMessage), PortNum.ADMIN_APP, "self");
	}
	/**
	* Gets devices metadata
	*/
	async getMetadata(nodeNum) {
		this.log.debug(Emitter[Emitter.GetMetadata], `🏷️ Requesting metadata from ${nodeNum}`);
		const getDeviceMetricsRequestMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "getDeviceMetadataRequest",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, getDeviceMetricsRequestMessage), PortNum.ADMIN_APP, nodeNum, ChannelNumber.Admin);
	}
	/**
	* Clears specific channel with the designated index
	*/
	async clearChannel(index) {
		this.log.debug(Emitter[Emitter.ClearChannel], `📻 Clearing Channel ${index}`);
		const channel = create(ChannelSchema, {
			index,
			role: Channel_Role.DISABLED
		});
		const setChannelMessage = create(AdminMessageSchema, { payloadVariant: {
			case: "setChannel",
			value: channel
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, setChannelMessage), PortNum.ADMIN_APP, "self");
	}
	async beginEditSettings() {
		this.events.onPendingSettingsChange.dispatch(true);
		const beginEditSettings = create(AdminMessageSchema, { payloadVariant: {
			case: "beginEditSettings",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, beginEditSettings), PortNum.ADMIN_APP, "self");
	}
	async commitEditSettings() {
		this.events.onPendingSettingsChange.dispatch(false);
		const commitEditSettings = create(AdminMessageSchema, { payloadVariant: {
			case: "commitEditSettings",
			value: true
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, commitEditSettings), PortNum.ADMIN_APP, "self");
	}
	/**
	* Resets the internal NodeDB of the radio, usefull for removing old nodes
	* that no longer exist.
	*/
	async resetNodes() {
		this.log.debug(Emitter[Emitter.ResetNodes], "📻 Resetting NodeDB");
		const resetNodes = create(AdminMessageSchema, { payloadVariant: {
			case: "nodedbReset",
			value: 1
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, resetNodes), PortNum.ADMIN_APP, "self");
	}
	/**
	* Removes a node from the internal NodeDB of the radio by node number
	*/
	async removeNodeByNum(nodeNum) {
		this.log.debug(Emitter[Emitter.RemoveNodeByNum], `📻 Removing Node ${nodeNum} from NodeDB`);
		const removeNodeByNum = create(AdminMessageSchema, { payloadVariant: {
			case: "removeByNodenum",
			value: nodeNum
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, removeNodeByNum), PortNum.ADMIN_APP, "self");
	}
	/** Shuts down the current node after the specified amount of time has elapsed. */
	async shutdown(time) {
		this.log.debug(Emitter[Emitter.Shutdown], `🔌 Shutting down ${time > 2 ? "now" : `in ${time} seconds`}`);
		const shutdown = create(AdminMessageSchema, { payloadVariant: {
			case: "shutdownSeconds",
			value: time
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, shutdown), PortNum.ADMIN_APP, "self");
	}
	/** Reboots the current node after the specified amount of time has elapsed. */
	async reboot(time) {
		this.log.debug(Emitter[Emitter.Reboot], `🔌 Rebooting node ${time === 0 ? "now" : `in ${time} seconds`}`);
		const reboot = create(AdminMessageSchema, { payloadVariant: {
			case: "rebootSeconds",
			value: time
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, reboot), PortNum.ADMIN_APP, "self");
	}
	/**
	* Reboots the current node into OTA mode after the specified amount of time has elapsed.
	*/
	async rebootOta(time) {
		this.log.debug(Emitter[Emitter.RebootOta], `🔌 Rebooting into OTA mode ${time === 0 ? "now" : `in ${time} seconds`}`);
		const rebootOta = create(AdminMessageSchema, { payloadVariant: {
			case: "rebootOtaSeconds",
			value: time
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, rebootOta), PortNum.ADMIN_APP, "self");
	}
	/**
	* Factory resets the current device
	*/
	async factoryResetDevice() {
		this.log.debug(Emitter[Emitter.FactoryReset], "♻️ Factory resetting device");
		const factoryReset = create(AdminMessageSchema, { payloadVariant: {
			case: "factoryResetDevice",
			value: 1
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, factoryReset), PortNum.ADMIN_APP, "self");
	}
	/**
	* Factory resets the current config
	*/
	async factoryResetConfig() {
		this.log.debug(Emitter[Emitter.FactoryReset], "♻️ Factory resetting config");
		const factoryReset = create(AdminMessageSchema, { payloadVariant: {
			case: "factoryResetConfig",
			value: 1
		} });
		return await this.sendPacket(toBinary(AdminMessageSchema, factoryReset), PortNum.ADMIN_APP, "self");
	}
	/**
	* Triggers the device configure process
	*/
	configure() {
		this.log.debug(Emitter[Emitter.Configure], "⚙️ Requesting device configuration");
		this.updateDeviceStatus(DeviceStatusEnum.DeviceConfiguring);
		const toRadio = create(ToRadioSchema, { payloadVariant: {
			case: "wantConfigId",
			value: this.configId
		} });
		return this.sendRaw(toBinary(ToRadioSchema, toRadio)).catch((e) => {
			if (this.deviceStatus === DeviceStatusEnum.DeviceDisconnected) throw new Error("Device connection lost");
			throw e;
		});
	}
	/**
	* Serial connection requires a heartbeat ping to stay connected, otherwise times out after 15 minutes
	*/
	heartbeat() {
		this.log.debug(Emitter[Emitter.Ping], "❤️ Send heartbeat ping to radio");
		const toRadio = create(ToRadioSchema, { payloadVariant: {
			case: "heartbeat",
			value: {}
		} });
		return this.sendRaw(toBinary(ToRadioSchema, toRadio));
	}
	/**
	* Initializes the heartbeat interval, which sends a heartbeat ping every interval milliseconds.
	*/
	setHeartbeatInterval(interval) {
		if (this._heartbeatIntervalId !== void 0) clearInterval(this._heartbeatIntervalId);
		this._heartbeatIntervalId = setInterval(() => {
			this.heartbeat().catch((err) => {
				this.log.error(Emitter[Emitter.Ping], `⚠️ Unable to send heartbeat: ${err.message}`);
			});
		}, interval);
	}
	/**
	* Sends a trace route packet to the designated node
	*/
	async traceRoute(destination) {
		const routeDiscovery = create(RouteDiscoverySchema, { route: [] });
		return await this.sendPacket(toBinary(RouteDiscoverySchema, routeDiscovery), PortNum.TRACEROUTE_APP, destination);
	}
	/**
	* Requests position from the designated node
	*/
	async requestPosition(destination) {
		return await this.sendPacket(new Uint8Array(), PortNum.POSITION_APP, destination);
	}
	/**
	* Updates the device status eliminating duplicate status events
	*/
	updateDeviceStatus(status) {
		if (status !== this.deviceStatus) this.events.onDeviceStatus.dispatch(status);
	}
	/**
	* Generates random packet identifier
	*
	* @returns {number} Random packet ID
	*/
	generateRandId() {
		const seed = crypto.getRandomValues(new Uint32Array(1));
		if (!seed[0]) throw new Error("Cannot generate CSPRN");
		return Math.floor(seed[0] * 2 ** -32 * 1e9);
	}
	/** Completes all Events */
	complete() {
		this.queue.clear();
	}
	/**  Disconnects from the device **/
	async disconnect() {
		this.log.debug(Emitter[Emitter.Disconnect], "🔌 Disconnecting from device");
		if (this._heartbeatIntervalId !== void 0) clearInterval(this._heartbeatIntervalId);
		this.complete();
		await this.transport.toDevice.close();
		await this.transport.disconnect();
	}
	/**
	* Gets called when a MeshPacket is received from device
	*/
	handleMeshPacket(meshPacket) {
		this.events.onMeshPacket.dispatch(meshPacket);
		if (meshPacket.from !== this.myNodeInfo.myNodeNum)
 /**
		* TODO: this shouldn't be called unless the device interracts with the
		* mesh, currently it does.
		*/
		this.events.onMeshHeartbeat.dispatch(new Date());
		switch (meshPacket.payloadVariant.case) {
			case "decoded": {
				this.handleDecodedPacket(meshPacket.payloadVariant.value, meshPacket);
				break;
			}
			case "encrypted": {
				this.log.debug(Emitter[Emitter.HandleMeshPacket], "🔐 Device received encrypted data packet, ignoring.");
				break;
			}
			default: throw new Error(`Unhandled case ${meshPacket.payloadVariant.case}`);
		}
	}
	handleDecodedPacket(dataPacket, meshPacket) {
		let adminMessage;
		let routingPacket;
		const packetMetadata = {
			id: meshPacket.id,
			rxTime: new Date(meshPacket.rxTime * 1e3),
			type: meshPacket.to === Constants.broadcastNum ? "broadcast" : "direct",
			from: meshPacket.from,
			to: meshPacket.to,
			channel: meshPacket.channel
		};
		this.log.trace(Emitter[Emitter.HandleMeshPacket], `📦 Received ${PortNum[dataPacket.portnum]} packet`);
		switch (dataPacket.portnum) {
			case PortNum.TEXT_MESSAGE_APP: {
				this.events.onMessagePacket.dispatch({
					...packetMetadata,
					data: new TextDecoder().decode(dataPacket.payload)
				});
				break;
			}
			case PortNum.REMOTE_HARDWARE_APP: {
				this.events.onRemoteHardwarePacket.dispatch({
					...packetMetadata,
					data: fromBinary(HardwareMessageSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.POSITION_APP: {
				this.events.onPositionPacket.dispatch({
					...packetMetadata,
					data: fromBinary(PositionSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.NODEINFO_APP: {
				this.events.onUserPacket.dispatch({
					...packetMetadata,
					data: fromBinary(UserSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.ROUTING_APP: {
				routingPacket = fromBinary(RoutingSchema, dataPacket.payload);
				this.events.onRoutingPacket.dispatch({
					...packetMetadata,
					data: routingPacket
				});
				switch (routingPacket.variant.case) {
					case "errorReason": {
						if (routingPacket.variant.value === Routing_Error.NONE) this.queue.processAck(dataPacket.requestId);
						else this.queue.processError({
							id: dataPacket.requestId,
							error: routingPacket.variant.value
						});
						break;
					}
					case "routeReply": break;
					case "routeRequest": break;
					default: throw new Error(`Unhandled case ${routingPacket.variant.case}`);
				}
				break;
			}
			case PortNum.ADMIN_APP: {
				adminMessage = fromBinary(AdminMessageSchema, dataPacket.payload);
				switch (adminMessage.payloadVariant.case) {
					case "getChannelResponse": {
						this.events.onChannelPacket.dispatch(adminMessage.payloadVariant.value);
						break;
					}
					case "getOwnerResponse": {
						this.events.onUserPacket.dispatch({
							...packetMetadata,
							data: adminMessage.payloadVariant.value
						});
						break;
					}
					case "getConfigResponse": {
						this.events.onConfigPacket.dispatch(adminMessage.payloadVariant.value);
						break;
					}
					case "getModuleConfigResponse": {
						this.events.onModuleConfigPacket.dispatch(adminMessage.payloadVariant.value);
						break;
					}
					case "getDeviceMetadataResponse": {
						this.log.debug(Emitter[Emitter.GetMetadata], `🏷️ Received metadata packet from ${dataPacket.source}`);
						this.events.onDeviceMetadataPacket.dispatch({
							...packetMetadata,
							data: adminMessage.payloadVariant.value
						});
						break;
					}
					case "getCannedMessageModuleMessagesResponse": {
						this.log.debug(Emitter[Emitter.GetMetadata], `🥫 Received CannedMessage Module Messages response packet`);
						this.events.onCannedMessageModulePacket.dispatch({
							...packetMetadata,
							data: adminMessage.payloadVariant.value
						});
						break;
					}
					default: this.log.error(Emitter[Emitter.HandleMeshPacket], `⚠️ Received unhandled AdminMessage, type ${adminMessage.payloadVariant.case ?? "undefined"}`, dataPacket.payload);
				}
				break;
			}
			case PortNum.WAYPOINT_APP: {
				this.events.onWaypointPacket.dispatch({
					...packetMetadata,
					data: fromBinary(WaypointSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.AUDIO_APP: {
				this.events.onAudioPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.DETECTION_SENSOR_APP: {
				this.events.onDetectionSensorPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.REPLY_APP: {
				this.events.onPingPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.IP_TUNNEL_APP: {
				this.events.onIpTunnelPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.PAXCOUNTER_APP: {
				this.events.onPaxcounterPacket.dispatch({
					...packetMetadata,
					data: fromBinary(PaxcountSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.SERIAL_APP: {
				this.events.onSerialPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.STORE_FORWARD_APP: {
				this.events.onStoreForwardPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.RANGE_TEST_APP: {
				this.events.onRangeTestPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.TELEMETRY_APP: {
				this.events.onTelemetryPacket.dispatch({
					...packetMetadata,
					data: fromBinary(TelemetrySchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.ZPS_APP: {
				this.events.onZpsPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.SIMULATOR_APP: {
				this.events.onSimulatorPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.TRACEROUTE_APP: {
				this.events.onTraceRoutePacket.dispatch({
					...packetMetadata,
					data: fromBinary(RouteDiscoverySchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.NEIGHBORINFO_APP: {
				this.events.onNeighborInfoPacket.dispatch({
					...packetMetadata,
					data: fromBinary(NeighborInfoSchema, dataPacket.payload)
				});
				break;
			}
			case PortNum.ATAK_PLUGIN: {
				this.events.onAtakPluginPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.MAP_REPORT_APP: {
				this.events.onMapReportPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.PRIVATE_APP: {
				this.events.onPrivatePacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			case PortNum.ATAK_FORWARDER: {
				this.events.onAtakForwarderPacket.dispatch({
					...packetMetadata,
					data: dataPacket.payload
				});
				break;
			}
			default: throw new Error(`Unhandled case ${dataPacket.portnum}`);
		}
	}
};

//#endregion
export { Constants, MeshDevice, meshtastic__protobufs_exports as Protobuf, types_exports as Types, utils_exports as Utils };