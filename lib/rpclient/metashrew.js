"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metashrew = exports.MetashrewOverride = void 0;
class MetashrewOverride {
    override;
    constructor() {
        this.override = null;
    }
    set(v) {
        this.override = v;
    }
    exists() {
        return this.override !== null;
    }
    get() {
        return this.override;
    }
}
exports.MetashrewOverride = MetashrewOverride;
exports.metashrew = new MetashrewOverride();
//# sourceMappingURL=metashrew.js.map