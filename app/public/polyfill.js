if (typeof TextDecoder === 'undefined') {
    globalThis.TextDecoder = class {
        decode(uint8array) {
            if (!uint8array) return '';
            let str = '';
            for (let i = 0; i < uint8array.length; i++) {
                str += String.fromCharCode(uint8array[i]);
            }
            return str;
        }
    };
}
if (typeof TextEncoder === 'undefined') {
    globalThis.TextEncoder = class {
        encode(str) {
            let arr = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                arr[i] = str.charCodeAt(i);
            }
            return arr;
        }
    };
}
