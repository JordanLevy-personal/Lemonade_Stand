declare module 'ws' {
  import type { Server as HttpServer } from 'node:http'
  import { EventEmitter } from 'node:events'

  export type RawData = string | Buffer | ArrayBuffer | Buffer[]

  export default class WebSocket extends EventEmitter {
    static OPEN: number
    readyState: number
    constructor(url: string)
    send(data: string): void
    close(): void
    on(event: 'open', listener: () => void): this
    on(event: 'message', listener: (data: RawData) => void): this
    on(event: 'close', listener: () => void): this
    once(event: 'open', listener: () => void): this
    once(event: 'message', listener: (data: RawData) => void): this
    once(event: 'close', listener: () => void): this
  }

  export { WebSocket }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: HttpServer; path?: string })
    close(callback?: (error?: Error) => void): void
    on(event: 'connection', listener: (socket: WebSocket) => void): this
  }
}
