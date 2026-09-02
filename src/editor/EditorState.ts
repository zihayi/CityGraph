import type { City } from "../model/City";

export class EditorState {
  private cityModel: City;
  public constructor(city: City) { this.cityModel = city; }
  public get city(): City { return this.cityModel; }
  public replaceCity(city: City): void { this.cityModel = city; }
}
