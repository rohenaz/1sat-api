declare module "eventsource" {
  export default class EventSource {
    constructor(url: string);
    onopen: (event: any) => void;
    onerror: (event: any) => void;
    addEventListener: (event: string, cb: (event: any) => void) => void;
  }
}