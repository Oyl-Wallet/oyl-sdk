"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Provider = void 0;
const sandshrew_1 = require("./sandshrew");
const esplora_1 = require("./esplora");
const ord_1 = require("./ord");
const alkanes_1 = require("./alkanes");
class Provider {
    sandshrew;
    esplora;
    ord;
    alkanes;
    constructor(url) {
        this.sandshrew = new sandshrew_1.SandshrewBitcoinClient(url);
        this.esplora = new esplora_1.EsploraRpc(url);
        this.ord = new ord_1.OrdRpc(url);
        this.alkanes = new alkanes_1.AlkanesRpc(url);
    }
}
exports.Provider = Provider;
//# sourceMappingURL=provider.js.map