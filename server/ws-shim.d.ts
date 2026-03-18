declare module 'ws' {
  import type { IncomingMessage, Server as HttpServer } from 'node:http'
  import { EventEmitter } from 'node:events'

  export type RawData = string | Buffer | ArrayBuffer | Buffer[]

  export default class WebSocket extends EventEmitter {
    static OPEN: number
    readyState: number
    constructor(url: string)
    send(data: string): void
    ping(data?: RawData): void
    close(code?: number, data?: string): void
    on(event: 'open', listener: () => void): this
    on(event: 'message', listener: (data: RawData) => void): this
    on(event: 'ping', listener: (data: Buffer) => void): this
    on(event: 'pong', listener: (data: Buffer) => void): this
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    once(event: 'open', listener: () => void): this
    once(event: 'message', listener: (data: RawData) => void): this
    once(event: 'ping', listener: (data: Buffer) => void): this
    once(event: 'pong', listener: (data: Buffer) => void): this
    once(event: 'close', listener: (code: number, reason: Buffer) => void): this
    once(event: 'error', listener: (error: Error) => void): this
  }

  export { WebSocket }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server: HttpServer; path?: string })
    close(callback?: (error?: Error) => void): void
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
  }
}
