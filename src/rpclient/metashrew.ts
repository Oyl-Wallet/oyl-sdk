export class MetashrewOverride {
  public override: any

  constructor() {
    this.override = null
  }

  set(v: any) {
    this.override = v
  }

  exists() {
    return this.override !== null
  }

  get() {
    return this.override
  }
}

export const metashrew = new MetashrewOverride()
